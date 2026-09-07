"""Bundle verification for the LangChain engineering proof capture.

Read-only checks: files exist, manifest digests match, raw events parse,
provenance is present. This is NOT source qualification and NOT an
Evidence validator run.
"""

import hashlib
import json
import sys
from pathlib import Path

BUNDLE = Path(__file__).resolve().parent / "engineering-source-bundle"


def test_bundle_files_exist():
    expected = [
        "manifest.json",
        "bundle.sha256",
        "raw/native-events.jsonl",
        "context/runtime-versions.json",
        "context/dependencies.lock",
        "context/execution-config.json",
        "context/invocation-input.json",
        "context/experiment-snapshot.txt",
        "context/serialization-profile.md",
        "context/provenance.md",
        "capture/session.json",
        "capture/receipts.jsonl",
        "capture/diagnostics.jsonl",
    ]
    for relative in expected:
        assert (BUNDLE / relative).is_file(), f"missing {relative}"


def test_manifest_digests_match_every_payload():
    manifest = json.loads((BUNDLE / "manifest.json").read_text(encoding="utf-8"))
    listed = {entry["path"] for entry in manifest["files"]}
    for entry in manifest["files"]:
        payload = BUNDLE / entry["path"]
        assert payload.stat().st_size == entry["bytes"]
        assert hashlib.sha256(payload.read_bytes()).hexdigest() == entry["sha256"]
    # every bundle file except manifest/bundle.sha256 itself is listed
    actual = {
        str(p.relative_to(BUNDLE)).replace("\\", "/")
        for p in BUNDLE.rglob("*")
        if p.is_file() and p.name not in {"manifest.json", "bundle.sha256"}
    }
    assert actual == listed


def test_root_digest_is_manifest_bytes():
    digest = (BUNDLE / "bundle.sha256").read_text(encoding="utf-8").strip()
    assert hashlib.sha256((BUNDLE / "manifest.json").read_bytes()).hexdigest() == digest


def test_raw_events_parse_and_carry_native_identity():
    events = [
        json.loads(line)
        for line in (BUNDLE / "raw" / "native-events.jsonl").read_text(
            encoding="utf-8"
        ).splitlines()
    ]
    assert events and all(isinstance(event, dict) for event in events)
    kinds = {event["event"] for event in events}
    assert "on_chat_model_start" in kinds  # real model request
    assert "on_tool_start" in kinds and "on_tool_end" in kinds
    # native correlation preserved
    assert all("run_id" in event for event in events)
    assert any(event.get("parent_ids") for event in events)
    # the tool round-trip is present with its tool_call_id
    tool_end = next(e for e in events if e["event"] == "on_tool_end")
    tool_message = tool_end["data"]["output"]
    assert tool_message["id"] == ["langchain", "schema", "messages", "ToolMessage"]
    assert tool_message["kwargs"]["tool_call_id"].startswith("call_")
    assert tool_message["kwargs"]["content"] == "42"
    # raw events carry no KerniQ/governance fields
    raw_text = json.dumps(events)
    for forbidden in ("kerniq", "decision", "evidence", "authorization"):
        assert forbidden not in raw_text.lower()
    # no credential leaked into the archive
    assert "sk-" not in raw_text


def test_receipts_and_session_are_consistent():
    receipts = [
        json.loads(line)
        for line in (BUNDLE / "capture" / "receipts.jsonl").read_text(
            encoding="utf-8"
        ).splitlines()
        if line.strip()
    ]
    session = json.loads((BUNDLE / "capture" / "session.json").read_text(encoding="utf-8"))
    assert session["exit_status"] == "ok"
    assert session["raw_event_count"] == len(receipts)
    assert session["stream"] == {"interface": "astream_events", "version": "v2"}
    first, last = receipts[0], receipts[-1]
    assert first["index"] == 1 and first["raw_line"] == 1
    assert last["raw_line"] == len(receipts)


def test_provenance_and_versions_complete():
    provenance = (BUNDLE / "context" / "provenance.md").read_text(encoding="utf-8")
    assert "TEAM_OWNED_ENGINEERING_EXPERIMENT" in provenance
    assert "TEAM_LAB_NATIVE_STREAM_CONSUMER" in provenance
    versions = json.loads(
        (BUNDLE / "context" / "runtime-versions.json").read_text(encoding="utf-8")
    )
    for package in ("langchain", "langchain-core", "langgraph", "langchain-deepseek"):
        assert versions["packages"][package]
    execution = json.loads(
        (BUNDLE / "context" / "execution-config.json").read_text(encoding="utf-8")
    )
    assert execution["model_id"] == "deepseek-chat"
    snapshot = (BUNDLE / "context" / "experiment-snapshot.txt").read_text(encoding="utf-8")
    assert snapshot.startswith("# experiment source snapshot")
    marker = snapshot.splitlines()[1].split("sha256: ")[1]
    body = snapshot.split("\n\n", 1)[1]
    assert hashlib.sha256(body.encode("utf-8")).hexdigest() == marker


if __name__ == "__main__":
    sys.exit(0)
