"""Read-only source bundle loader: strict bytes in, structured facts out.

The source bundle is a directory containing exactly three consumed files
(bound by the read-only inventory):

  native-events.jsonl  raw UTF-8 LF-delimited astream_events(v2) archive
  provenance.json      pinned producer/environment/exporter/capture declaration
  inventory.json       exact-byte SHA-256 + length + normalized relative path
                       for every file consumed by qualification

Freeze rules implemented here (v0.6.2 freeze sections 4, 7, 8):
- exact-byte SHA-256 over the ORIGINAL raw JSONL bytes (delimiters and final
  LF included), representation utf8-jsonl-exact-v1; never a reserialized form;
- strict JSONL: UTF-8, no BOM, LF only, final LF required, one object per
  line, no blank lines, no duplicate JSON keys, no NaN/Infinity constants,
  no lone surrogates; malformed input is refused, never repaired or skipped;
- provenance: exact pinned versions/environment/serializer/exporter/stream
  configuration; missing facts stay missing (MISSING_PROVENANCE), unpinned
  values are UNSUPPORTED_PROFILE with no best-effort parsing;
- path safety: no absolute paths, no ``..`` traversal, no symlink escape from
  the source root, no remote URLs; duplicate inventory paths are refused.

Nothing here mutates the source, follows references, imports code, or
 touches anything outside the source directory.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import langchain_profile as profile
from .diagnostics import (
    INCOMPLETE_SOURCE,
    INVALID_SOURCE,
    MISSING_PROVENANCE,
    SOURCE_BINDING_FAILURE,
    UNSUPPORTED_PROFILE,
    Diagnostic,
)


class SourceRejected(RuntimeError):
    """Raised for unreadable/unsafe source layouts (path & binding failures)."""


@dataclass
class LoadedSource:
    root: Path
    raw_bytes: bytes
    raw_digest: str
    raw_length: int
    events: List[Dict[str, Any]]  # parsed JSON objects, one per line
    provenance: Dict[str, Any]
    provenance_degraded_termination: Optional[str]  # declared value when degraded
    diagnostics: List[Diagnostic] = field(default_factory=list)

    def archive_ref(self, line: int, pointer: str = "") -> str:
        """Namespaced source reference binding the EXACT full 64-hex source
        digest (v0.6.2 freeze section 8: exact source digest binding — a
        truncated digest never identifies the archive), one-based line and
        optional JSON Pointer."""
        ref = f"langchain-archive:{self.raw_digest}#L{line}"
        if pointer:
            ref += f"#{pointer}"
        return ref


# --- Path safety -------------------------------------------------------------


def _check_source_root(source: Path) -> Path:
    if isinstance(source, str):
        source = Path(source)
    text = str(source)
    lowered = text.lower()
    for scheme in ("http://", "https://", "ftp://", "file://"):
        if lowered.startswith(scheme):
            raise SourceRejected(f"remote URL refused as source: scheme not allowed")
    if not source.is_absolute():
        source = Path(os.path.abspath(source))
    real = Path(os.path.realpath(source))
    if not real.is_dir():
        raise SourceRejected("source path is not a directory")
    return real


def _safe_inventory_path(root: Path, raw_path: Any) -> Path:
    if not isinstance(raw_path, str) or not raw_path:
        raise SourceRejected("inventory entry path must be a non-empty string")
    if raw_path != raw_path.strip() or "\\" in raw_path:
        raise SourceRejected(f"inventory path not normalized: {raw_path!r}")
    if raw_path.startswith("/"):
        raise SourceRejected(f"absolute inventory path refused: {raw_path!r}")
    parts = raw_path.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise SourceRejected(f"traversal or empty segment refused in inventory path {raw_path!r}")
    candidate = root.joinpath(*parts)
    real = Path(os.path.realpath(candidate))
    try:
        real.relative_to(root)
    except ValueError:
        raise SourceRejected(f"symlink escape refused for inventory path {raw_path!r}")
    if not real.is_file():
        raise SourceRejected(f"inventory path missing on disk: {raw_path!r}")
    return real


# --- Strict JSONL parsing ------------------------------------------------------


def reject_nonfinite_constant(name: str) -> float:
    raise ValueError(f"non-finite JSON constant refused: {name}")


def reject_duplicate_keys(pairs: List[Tuple[str, Any]]) -> Dict[str, Any]:
    seen = set()
    for key, _ in pairs:
        if key in seen:
            raise ValueError(f"duplicate JSON key refused: {key!r}")
        seen.add(key)
    return dict(pairs)


def check_no_lone_surrogates(node: Any) -> None:
    if isinstance(node, str):
        node.encode("utf-8")  # lone surrogates raise UnicodeEncodeError
    elif isinstance(node, dict):
        for key, value in node.items():
            check_no_lone_surrogates(key)
            check_no_lone_surrogates(value)
    elif isinstance(node, list):
        for item in node:
            check_no_lone_surrogates(item)


def parse_jsonl_strict(raw: bytes) -> Tuple[List[Dict[str, Any]], List[Diagnostic]]:
    """Strict UTF-8 JSONL parse. Returns (events, diagnostics); any diagnostic
    means the archive is malformed and must not be matched."""
    diagnostics: List[Diagnostic] = []
    if raw.startswith(b"\xef\xbb\xbf"):
        diagnostics.append(
            Diagnostic(INVALID_SOURCE, "error", "jsonl.no_bom", detail="UTF-8 BOM present")
        )
        return [], diagnostics
    if b"\r" in raw:
        first_cr = raw.index(b"\r")
        line_no = raw[:first_cr].count(b"\n") + 1
        diagnostics.append(
            Diagnostic(INVALID_SOURCE, "error", "jsonl.lf_only", line=line_no, detail="CR byte present; LF-only delimiter required")
        )
        return [], diagnostics
    if not raw:
        diagnostics.append(
            Diagnostic(INVALID_SOURCE, "error", "jsonl.non_empty", detail="empty source")
        )
        return [], diagnostics
    if not raw.endswith(b"\n"):
        last_line = raw.count(b"\n") + 1
        diagnostics.append(
            Diagnostic(INVALID_SOURCE, "error", "jsonl.final_lf", line=last_line, detail="final LF missing")
        )
        return [], diagnostics
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        diagnostics.append(
            Diagnostic(INVALID_SOURCE, "error", "jsonl.utf8_strict", detail="invalid UTF-8 bytes")
        )
        return [], diagnostics

    events: List[Dict[str, Any]] = []
    lines = text.split("\n")[:-1]  # final LF guaranteed; no trailing element
    for index, line in enumerate(lines, start=1):
        if line.strip() == "":
            diagnostics.append(
                Diagnostic(INVALID_SOURCE, "error", "jsonl.no_blank_lines", line=index, detail="blank line")
            )
            continue
        try:
            value = json.loads(
                line,
                object_pairs_hook=reject_duplicate_keys,
                parse_constant=reject_nonfinite_constant,
            )
        except ValueError as exc:
            diagnostics.append(
                Diagnostic(
                    INVALID_SOURCE,
                    "error",
                    "jsonl.line_parse",
                    line=index,
                    detail=f"line is not a single valid JSON object: {type(exc).__name__}",
                )
            )
            continue
        if not isinstance(value, dict):
            diagnostics.append(
                Diagnostic(INVALID_SOURCE, "error", "jsonl.object_per_line", line=index, detail="line is not a JSON object")
            )
            continue
        try:
            check_no_lone_surrogates(value)
        except UnicodeEncodeError:
            diagnostics.append(
                Diagnostic(INVALID_SOURCE, "error", "jsonl.valid_unicode", line=index, detail="lone surrogate in line")
            )
            continue
        events.append(value)
    return events, diagnostics


# --- Provenance validation ------------------------------------------------------


def _pin(diagnostics: List[Diagnostic], value: Any, expected: str, field_label: str, rule: str) -> None:
    if value is None:
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", f"provenance.{rule}", detail=f"{field_label} missing")
        )
    elif value != expected:
        diagnostics.append(
            Diagnostic(
                UNSUPPORTED_PROFILE,
                "error",
                f"provenance.{rule}",
                detail=f"{field_label} not pinned: expected {expected!r}, declared {value!r}",
            )
        )


def _nonempty(diagnostics: List[Diagnostic], value: Any, field_label: str, rule: str) -> None:
    if not isinstance(value, str) or value.strip() == "":
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", f"provenance.{rule}", detail=f"{field_label} missing or empty")
        )


def validate_provenance(provenance: Dict[str, Any]) -> Tuple[List[Diagnostic], Optional[str]]:
    """Check the declared provenance against the frozen pins.

    Returns (diagnostics, degraded_termination). degraded_termination is the
    declared value when the capture itself declares a degraded end; that is
    INCOMPLETE_SOURCE regardless of every other check.
    """
    diagnostics: List[Diagnostic] = []
    if not isinstance(provenance, dict):
        return (
            [Diagnostic(MISSING_PROVENANCE, "error", "provenance.object", detail="provenance is not a JSON object")],
            None,
        )

    producer = provenance.get("producer")
    if not isinstance(producer, dict):
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", "provenance.producer", detail="producer block missing")
        )
        producer = {}
    _pin(diagnostics, producer.get("langchain"), profile.PINNED_LANGCHAIN, "producer.langchain", "pin.langchain")
    _pin(diagnostics, producer.get("langchain-core"), profile.PINNED_LANGCHAIN_CORE, "producer.langchain-core", "pin.langchain_core")
    _pin(diagnostics, producer.get("langgraph"), profile.PINNED_LANGGRAPH, "producer.langgraph", "pin.langgraph")
    _pin(
        diagnostics,
        producer.get("langgraph-prebuilt"),
        profile.PINNED_LANGGRAPH_PREBUILT,
        "producer.langgraph-prebuilt",
        "pin.langgraph_prebuilt",
    )

    environment = provenance.get("environment")
    if not isinstance(environment, dict):
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", "provenance.environment", detail="environment block missing")
        )
        environment = {}
    _pin(diagnostics, environment.get("python"), profile.PINNED_PYTHON, "environment.python", "pin.python")
    _pin(diagnostics, environment.get("pydantic"), profile.PINNED_PYDANTIC, "environment.pydantic", "pin.pydantic")

    serializer = provenance.get("serializer")
    if not isinstance(serializer, dict):
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", "provenance.serializer", detail="serializer block missing")
        )
        serializer = {}
    _pin(
        diagnostics,
        serializer.get("identity"),
        profile.PINNED_SERIALIZER_IDENTITY,
        "serializer.identity",
        "pin.serializer_identity",
    )
    _pin(
        diagnostics,
        serializer.get("langchain-core"),
        profile.PINNED_LANGCHAIN_CORE,
        "serializer.langchain-core",
        "pin.serializer_core",
    )

    exporter = provenance.get("exporter")
    if not isinstance(exporter, dict):
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", "provenance.exporter", detail="exporter block missing")
        )
        exporter = {}
    _nonempty(diagnostics, exporter.get("identity"), "exporter.identity", "exporter.identity")
    _nonempty(diagnostics, exporter.get("version"), "exporter.version", "exporter.version")

    capture = provenance.get("capture")
    if not isinstance(capture, dict):
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", "provenance.capture", detail="capture block missing")
        )
        capture = {}
    _pin(diagnostics, capture.get("method"), profile.PINNED_STREAM_METHOD, "capture.method", "pin.stream_method")
    _pin(diagnostics, capture.get("version"), profile.PINNED_STREAM_VERSION, "capture.version", "pin.stream_version")

    filters = capture.get("filters")
    if filters is None:
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", "provenance.filters", detail="capture.filters missing")
        )
    elif filters != profile.FILTER_DECLARED_NONE:
        diagnostics.append(
            Diagnostic(
                UNSUPPORTED_PROFILE,
                "error",
                "provenance.pin.no_filters",
                detail=f"filtered capture refused: declared {filters!r}",
            )
        )
    _nonempty(diagnostics, capture.get("scope"), "capture.scope", "capture.scope")

    termination = capture.get("termination")
    degraded: Optional[str] = None
    if termination is None:
        diagnostics.append(
            Diagnostic(MISSING_PROVENANCE, "error", "provenance.termination", detail="capture.termination missing")
        )
    elif termination in profile.TERMINATION_DEGRADED:
        degraded = termination
        diagnostics.append(
            Diagnostic(
                INCOMPLETE_SOURCE,
                "error",
                "provenance.termination_normal",
                detail=f"capture declares degraded termination: {termination!r}",
            )
        )
    elif termination != profile.TERMINATION_NORMAL:
        diagnostics.append(
            Diagnostic(
                UNSUPPORTED_PROFILE,
                "error",
                "provenance.termination_normal",
                detail=f"unknown termination declaration: {termination!r}",
            )
        )
    return diagnostics, degraded


# --- Inventory --------------------------------------------------------------------


def _digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _load_inventory(
    root: Path, diagnostics: List[Diagnostic], read_bytes: Callable[[Path], bytes]
) -> Dict[str, Tuple[Path, bytes]]:
    inventory_path = root / profile.INVENTORY_FILENAME
    if not inventory_path.is_file():
        diagnostics.append(
            Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.present", detail="inventory.json missing")
        )
        return {}
    try:
        inventory = json.loads(
            read_bytes(inventory_path).decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (UnicodeDecodeError, ValueError) as exc:
        diagnostics.append(
            Diagnostic(
                SOURCE_BINDING_FAILURE,
                "error",
                "inventory.parse",
                detail=f"inventory.json unreadable: {type(exc).__name__}",
            )
        )
        return {}
    if not isinstance(inventory, dict) or inventory.get("schema") != profile.INVENTORY_SCHEMA:
        diagnostics.append(
            Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.schema", detail="inventory schema not recognized")
        )
        return {}
    files = inventory.get("files")
    if not isinstance(files, list) or not files:
        diagnostics.append(
            Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.files", detail="inventory file list missing/empty")
        )
        return {}

    bound: Dict[str, Tuple[Path, bytes]] = {}
    seen_paths = set()
    for entry in files:
        if not isinstance(entry, dict):
            diagnostics.append(
                Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.entry", detail="inventory entry not an object")
            )
            return {}
        rel = entry.get("path")
        if rel == profile.INVENTORY_FILENAME:
            diagnostics.append(
                Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.self", detail="inventory must not bind itself")
            )
            return {}
        try:
            absolute = _safe_inventory_path(root, rel)
        except SourceRejected as exc:
            diagnostics.append(
                Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.path_safety", detail=str(exc))
            )
            return {}
        if rel in seen_paths:
            diagnostics.append(
                Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.unique_paths", detail=f"duplicate inventory path {rel!r}")
            )
            return {}
        seen_paths.add(rel)
        try:
            data = read_bytes(absolute)
        except OSError as exc:
            diagnostics.append(
                Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.read", detail=f"bound file unreadable: {type(exc).__name__}")
            )
            return {}
        if entry.get("byte_length") != len(data):
            diagnostics.append(
                Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.byte_length", detail=f"byte length mismatch for {rel!r}")
            )
            return {}
        if entry.get("sha256") != _digest_bytes(data):
            diagnostics.append(
                Diagnostic(SOURCE_BINDING_FAILURE, "error", "inventory.sha256", detail=f"sha256 mismatch for {rel!r}")
            )
            return {}
        bound[str(rel)] = (absolute, data)
    return bound


# --- Public entry --------------------------------------------------------------------


def load_source(source: Path) -> LoadedSource:
    """Load and structurally check the source bundle. Read-only.

    Raises SourceRejected only when the path itself is unusable (remote URL,
    missing directory); every content-level failure is carried as
    diagnostics on the returned LoadedSource so callers keep a deterministic
    refusal artifact instead of an exception.
    """
    root = _check_source_root(source)
    diagnostics: List[Diagnostic] = []

    real_read = Path.read_bytes

    def read_bytes(path: Path) -> bytes:
        return real_read(path)

    def _empty(message_root: Path) -> LoadedSource:
        return LoadedSource(
            root=message_root,
            raw_bytes=b"",
            raw_digest="",
            raw_length=0,
            events=[],
            provenance={},
            provenance_degraded_termination=None,
            diagnostics=diagnostics,
        )

    bound = _load_inventory(root, diagnostics, read_bytes)
    if diagnostics:
        return _empty(root)

    for required in (profile.RAW_FILENAME, profile.PROVENANCE_FILENAME):
        if required not in bound:
            diagnostics.append(
                Diagnostic(
                    SOURCE_BINDING_FAILURE,
                    "error",
                    "inventory.binds_consumed",
                    detail=f"inventory does not bind consumed file {required!r}",
                )
            )
    if diagnostics:
        return _empty(root)

    _, raw_bytes = bound[profile.RAW_FILENAME]
    _, provenance_bytes = bound[profile.PROVENANCE_FILENAME]
    try:
        provenance = json.loads(
            provenance_bytes.decode("utf-8"), object_pairs_hook=reject_duplicate_keys
        )
    except (UnicodeDecodeError, ValueError) as exc:
        diagnostics.append(
            Diagnostic(
                MISSING_PROVENANCE,
                "error",
                "provenance.parse",
                detail=f"provenance.json unreadable: {type(exc).__name__}",
            )
        )
        provenance = {}

    provenance_diagnostics, degraded = validate_provenance(provenance)
    diagnostics.extend(provenance_diagnostics)

    raw_digest = _digest_bytes(raw_bytes)
    events, parse_diagnostics = parse_jsonl_strict(raw_bytes)
    diagnostics.extend(parse_diagnostics)

    return LoadedSource(
        root=root,
        raw_bytes=raw_bytes,
        raw_digest=raw_digest,
        raw_length=len(raw_bytes),
        events=events,
        provenance=provenance,
        provenance_degraded_termination=degraded,
        diagnostics=diagnostics,
    )


def reverify_source_digest(loaded: LoadedSource) -> Optional[Diagnostic]:
    """End-of-run byte re-check (pilot design Path A): re-read the raw file
    exactly and confirm the digest computed at load time still binds the same
    bytes. Mutation between reads is SOURCE_BINDING_FAILURE."""
    root = loaded.root
    real_read = Path.read_bytes

    def read_bytes(path: Path) -> bytes:
        return real_read(path)

    bound = _load_inventory(root, [], read_bytes)
    entry = bound.get(profile.RAW_FILENAME)
    if entry is None or _digest_bytes(entry[1]) != loaded.raw_digest:
        return Diagnostic(
            SOURCE_BINDING_FAILURE,
            "error",
            "source.stable_bytes",
            detail="source bytes changed during validation (digest re-check failed)",
        )
    return None
