"""Opt-in real-provider proof. Sends synthetic prompts, never prints credentials."""
from __future__ import annotations
import argparse
import asyncio
import hashlib
import importlib.metadata
import json
import logging
import os
import tempfile
from dataclasses import asdict
from pathlib import Path

from agent_framework.openai import OpenAIChatCompletionClient
from openai import AsyncOpenAI

from .backend import MicrosoftAgentFrameworkGovernedBackend
from .evidence import project
from .qualification import MAF_REF, AGENTFUSE_REF, MAF_HASHES, PROFILE


async def prove(source: Path, output: Path) -> dict:
    if not os.environ.get("DEEPSEEK_API_KEY"):
        raise RuntimeError("real_provider_credential_unavailable")
    backend = MicrosoftAgentFrameworkGovernedBackend(source)
    cases = []
    # Single-agent must pass before attempting the official Agent.as_tool path.
    for delegated, block in ((False, True), (False, False), (True, True), (True, False)):
        count = 0
        with tempfile.TemporaryDirectory(prefix="kerniq-maf-proof-") as tmp:
            marker = Path(tmp) / "execution.jsonl"
            async def physical_tool(value: str) -> str:
                nonlocal count
                count += 1
                with marker.open("a", encoding="utf-8") as stream:
                    stream.write(json.dumps({"entry": count, "value": value}, sort_keys=True) + "\n")
                return "RECORDED:" + value

            async with AsyncOpenAI(api_key=os.environ["DEEPSEEK_API_KEY"],
                                   base_url="https://api.deepseek.com/v1", max_retries=0, timeout=60) as api:
                client = OpenAIChatCompletionClient(
                    model="deepseek-v4-flash", async_client=api,
                    function_invocation_configuration={"max_iterations": 4, "max_function_calls": 1},
                )
                result = await backend.start_task(client, physical_tool, block=block, delegated=delegated)
            assert len(result.records) == 1, "one_observed_protected_request_required"
            record = result.records[0]
            assert record.call_id and record.occurrence_id, "missing_native_call_identity"
            assert record.decision["action"] == ("block" if block else "allow")
            assert count == (0 if block else 1), "physical_body_count_mismatch"
            assert marker.exists() == (not block), "physical_marker_mismatch"
            phases = [event["phase"] for event in record.events]
            assert phases.index("request") < phases.index("decision")
            if block:
                assert "dispatch" not in phases and "start" not in phases
                assert record.outcome == "not_executed"
            else:
                assert phases.index("decision") < phases.index("release") < phases.index("dispatch") < phases.index("start")
                assert record.effective_digest == record.executed_digest
                assert record.outcome == "success"
            raw_marker = marker.read_bytes() if marker.exists() else b""
            assert len(raw_marker.splitlines()) == count
            if raw_marker:
                assert json.loads(raw_marker)["value"] == "kerniq-v0-8"
            expected = "BLOCKED_BY_AGENTFUSE" if block else "RECORDED:kerniq-v0-8"
            result_returned = expected in result.response.text
            assert result_returned, "result_not_returned_to_caller"
            if delegated:
                assert [event["phase"] for event in result.delegation_events] == ["delegation_start", "delegation_return"]
                assert record.parent_call_id == result.delegation_events[0]["call_id"]
                assert result.delegation_events[-1]["blocked_token_observed" if block else "recorded_token_observed"]
            case = {
                "case": ("delegated_" if delegated else "single_") + ("block" if block else "allow"),
                "real_model_tool_call": True, "body_entry_count": count,
                "physical_marker_exists": marker.exists(), "physical_marker_line_count": count,
                "physical_marker_sha256": hashlib.sha256(raw_marker).hexdigest() if raw_marker else None,
                "result_returned_to_caller": result_returned,
                "response_id": result.response.response_id,
                "record": asdict(record), "evidence_v0_2": project(record),
                "delegation_events": result.delegation_events,
            }
            cases.append(case)
            print(json.dumps({k: case[k] for k in ("case", "body_entry_count", "physical_marker_exists",
                                                    "response_id", "result_returned_to_caller")}), flush=True)
        # Persist partial completed proof if a later delegation/provider call fails.
        receipt = {"profile": PROFILE, "maf_upstream_ref": MAF_REF, "agentfuse_ref": AGENTFUSE_REF,
                   "provider": "deepseek-official", "requested_model": "deepseek-v4-flash",
                   "package_versions": {name: importlib.metadata.version(name) for name in
                                        ("agent-framework-core", "agent-framework-openai", "openai", "pydantic")},
                   "qualified_source_sha256": MAF_HASHES,
                   "real_provider": True, "cases": cases,
                   "model_request_to_tool_run_correlation_proven": False,
                   "scope": "one controlled local async FunctionTool(value: str) per operation"}
        output.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agentfuse-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)  # no provider prompt/body/debug logging
    try:
        asyncio.run(prove(args.agentfuse_source, args.output))
    except Exception as exc:
        print(json.dumps({"proof_complete": False, "error_type": type(exc).__name__}))
        return 1
    print(json.dumps({"proof_complete": True, "single_agent": True, "multi_agent": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
