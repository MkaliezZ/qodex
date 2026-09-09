"""Minimal local CLI for the KerniQ external LangChain validator.

    python -m kerniq_external_validation validate --source <dir> --output <result.json>
    python -m kerniq_external_validation verify --artifact <result.json> --source <dir>

Local-only: no network, no telemetry, no upload, no credentials access.
Exit codes: 0 = PASS / VERIFIED; 2 = refused or REJECTED; 3 = validation
error (kit/input failure); 1 = usage error.
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from pathlib import Path
from typing import List, Optional

from . import langchain_profile as profile
from .artifact import build_envelope, write_artifact
from .diagnostics import RESULT_VALIDATION_ERROR, summarize
from .source_loader import SourceRejected, load_source
from .validator import validate_source
from .verifier import REJECTED, VERIFIED, verify_artifact

EXIT_OK = 0
EXIT_USAGE = 1
EXIT_REFUSED = 2
EXIT_VALIDATION_ERROR = 3


class _Parser(argparse.ArgumentParser):
    """Usage errors exit 1 so they never collide with refusal exit code 2."""

    def error(self, message: str):  # type: ignore[override]
        self.print_usage(sys.stderr)
        sys.stderr.write(f"{self.prog}: error: {message}\n")
        sys.exit(EXIT_USAGE)


def _build_parser() -> argparse.ArgumentParser:
    parser = _Parser(
        prog="kerniq_external_validation",
        description=(
            "Local read-only validator for the frozen external LangChain profile "
            f"{profile.PROFILE_ID} v{profile.PROFILE_VERSION}. "
            "Bring your existing compatible archive; nothing is uploaded."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    validate = sub.add_parser("validate", help="validate a source bundle and write a result artifact")
    validate.add_argument("--source", required=True, help="source bundle directory")
    validate.add_argument("--output", required=True, help="result artifact path to write")

    verify = sub.add_parser("verify", help="verify an artifact against its source bundle")
    verify.add_argument("--artifact", required=True, help="result artifact path")
    verify.add_argument("--source", required=True, help="source bundle directory")
    return parser


def _utc_now_iso() -> str:
    import datetime

    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def run_validate(source: str, output: str) -> int:
    started_at = _utc_now_iso()
    clock = time.perf_counter()
    try:
        loaded = load_source(Path(source))
    except SourceRejected as exc:
        print(f"VALIDATION_ERROR: source unusable: {exc}", file=sys.stderr)
        return EXIT_VALIDATION_ERROR
    outcome = validate_source(loaded)
    completed_at = _utc_now_iso()
    duration_ms = int((time.perf_counter() - clock) * 1000)
    envelope = build_envelope(
        outcome,
        started_at=started_at,
        completed_at=completed_at,
        duration_ms=duration_ms,
        validation_id=uuid.uuid4().hex,
    )
    write_artifact(envelope, Path(output))

    print(f"result: {outcome.result}")
    print(f"profile: {profile.PROFILE_ID} v{profile.PROFILE_VERSION}")
    if outcome.source_digest:
        print(f"source_digest: sha256:{outcome.source_digest}")
    summary = summarize(outcome.diagnostics)
    if summary:
        print(f"diagnostics: {len(outcome.diagnostics)} ({len(summary)} categories)")
        for entry in summary:
            first = entry["first"]
            locator = first.get("line")
            print(
                f"  - {entry['code']} x{entry['count']} severity={entry['severity']}"
                + (f" first_line={locator}" if locator else "")
            )
    if outcome.opaque_exclusions:
        print(f"opaque_exclusions: lines {outcome.opaque_exclusions} (raw retained, not used)")
    print(f"artifact: {Path(output).name}")
    if outcome.result == "PASS":
        return EXIT_OK
    if outcome.result == RESULT_VALIDATION_ERROR:
        return EXIT_VALIDATION_ERROR
    return EXIT_REFUSED


def run_verify(artifact: str, source: str) -> int:
    outcome = verify_artifact(Path(artifact), Path(source))
    print(f"verify: {outcome.status}")
    if outcome.artifact_digest:
        print(f"artifact_digest: sha256:{outcome.artifact_digest}")
    for reason in outcome.reasons:
        print(f"reason: {reason}")
    return EXIT_OK if outcome.status == VERIFIED else EXIT_REFUSED


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if args.command == "validate":
        return run_validate(args.source, args.output)
    if args.command == "verify":
        return run_verify(args.artifact, args.source)
    parser.error("unknown command")
    return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
