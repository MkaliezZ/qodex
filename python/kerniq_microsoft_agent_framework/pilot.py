"""KerniQ Microsoft Agent Framework external pilot kit v0.1 (thin local CLI).

Wraps the ALREADY-PROVEN bounded GOVERNED lane (PR #36) so an outside MAF
developer can, on their own machine and their own real async tool, run one
BLOCK and one ALLOW through the real provider + real MAF runtime + canonical
AgentFuse decision, produce a privacy-safe pilot artifact, and verify it
locally. The governed boundary is NOT expanded: still exactly the adapter-
created local async FunctionTool(value: str) on the reviewed Agent.run path.

    python -m kerniq_microsoft_agent_framework.pilot check  --tool module:function
    python -m kerniq_microsoft_agent_framework.pilot run    --tool module:function \
        --output kerniq-maf-pilot-artifact.json [--i-understand-allow-executes-tool]
    python -m kerniq_microsoft_agent_framework.pilot verify kerniq-maf-pilot-artifact.json

Local-only: no telemetry, no upload, no auto-install, no PATH/PYTHONPATH
changes, no code generation. The ALLOW phase really executes the user's tool
once and therefore requires the explicit acknowledgement flag.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib
import importlib.metadata
import inspect
import json
import os
import sys
import tempfile
import traceback
from dataclasses import asdict
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional, Tuple

from .pilot_artifact import (
    ArtifactRejected,
    build_envelope,
    verify_artifact_file,
    write_artifact,
)

EXIT_OK = 0
EXIT_REFUSED = 2
EXIT_USAGE = 1

AGENTFUSE_SOURCE_ENV = "KERNIQ_AGENTFUSE_SOURCE"
PROVIDER_KEY_ENV = "DEEPSEEK_API_KEY"


class PilotRefused(RuntimeError):
    """Refusal with a stable machine-readable reason code."""


# --- User tool import contract -------------------------------------------------


def import_user_tool(spec: str) -> Tuple[Callable[[str], Awaitable[str]], Optional[str]]:
    """Import `module:function` and enforce the single supported contract:
    an async callable with exactly one str parameter named `value`. A missing
    return annotation is a warning (runtime-checked); anything undeterminable
    refuses instead of guessing."""
    module_name, sep, attr = spec.partition(":")
    if not sep or not module_name or not attr or ":" in attr:
        raise PilotRefused("TOOL_IMPORT_MALFORMED")
    try:
        module = importlib.import_module(module_name)
    except Exception as exc:  # noqa: BLE001 - user module import errors vary
        raise PilotRefused("TOOL_IMPORT_FAILED:" + type(exc).__name__)
    func = getattr(module, attr, None)
    if func is None:
        raise PilotRefused("TOOL_ATTRIBUTE_MISSING")
    if not callable(func):
        raise PilotRefused("TOOL_NOT_CALLABLE")
    if not asyncio.iscoroutinefunction(func):
        raise PilotRefused("TOOL_NOT_ASYNC")
    signature = inspect.signature(func)
    parameters = [
        parameter
        for parameter in signature.parameters.values()
        if parameter.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    ]
    if len(parameters) != 1 or parameters[0].name != "value":
        raise PilotRefused("TOOL_SIGNATURE_UNSUPPORTED")
    annotation = parameters[0].annotation
    if annotation is inspect.Parameter.empty:
        raise PilotRefused("TOOL_VALUE_ANNOTATION_MISSING")
    if annotation is not str:
        raise PilotRefused("TOOL_VALUE_NOT_STR")
    warning = None
    if signature.return_annotation is inspect.Signature.empty:
        warning = "TOOL_RETURN_ANNOTATION_MISSING_RUNTIME_CHECKED"
    elif signature.return_annotation is not str:
        raise PilotRefused("TOOL_RETURN_UNSUPPORTED")
    return func, warning


# --- Pilot-owned physical-entry observation --------------------------------------


class PilotObservedTool:
    """Independent pilot wrapper around the USER's tool: counts entries and
    writes a local entry marker BEFORE the user handler runs. This observes
    only entry through the reviewed adapter path; it makes no claim about
    other side effects of the user's business system."""

    def __init__(self, user_tool: Callable[[str], Awaitable[str]], marker_dir: Path) -> None:
        self.user_tool = user_tool
        self.entries = 0
        self.marker = marker_dir / "pilot-entry.jsonl"
        self.result_sha256: Optional[str] = None
        self.result_type: Optional[str] = None

    async def __call__(self, value: str) -> str:
        import datetime

        self.entries += 1
        with self.marker.open("a", encoding="utf-8") as stream:
            stream.write(
                json.dumps(
                    {"entry": self.entries,
                     "at": datetime.datetime.now(datetime.timezone.utc).isoformat()},
                    sort_keys=True,
                )
                + "\n"
            )
        result = await self.user_tool(value)
        if not isinstance(result, str):
            raise TypeError("user_tool_returned_non_string")
        self.result_sha256 = hashlib.sha256(result.encode("utf-8")).hexdigest()
        self.result_type = type(result).__name__
        return result


# --- check -----------------------------------------------------------------------


def run_check(args: argparse.Namespace) -> int:
    reasons = []

    if sys.version_info < (3, 10):
        reasons.append("PYTHON_VERSION_UNSUPPORTED")

    from .qualification import qualify_framework, load_agentfuse

    try:
        qualify_framework()
    except importlib.metadata.PackageNotFoundError as exc:
        reasons.append("PACKAGE_MISSING:" + str(exc).split(" ")[0])
    except Exception as exc:  # ValueError from pins/hashes
        text = str(exc)
        if text.startswith("unqualified_package:"):
            reasons.append("UNQUALIFIED_PACKAGE:" + text.split(":", 1)[1])
        elif text.startswith("unqualified_source:"):
            reasons.append("UNQUALIFIED_MAF_SOURCE:" + text.split(":", 1)[1])
        else:
            reasons.append("QUALIFICATION_FAILED:" + type(exc).__name__)

    source = os.environ.get(AGENTFUSE_SOURCE_ENV)
    if not source:
        reasons.append("AGENTFUSE_SOURCE_MISSING")
    else:
        root = Path(source)
        if not root.is_dir():
            reasons.append("AGENTFUSE_SOURCE_NOT_A_DIRECTORY")
        else:
            try:
                load_agentfuse(root)
            except Exception as exc:
                text = str(exc)
                if text.startswith("unqualified_source:"):
                    reasons.append("AGENTFUSE_UNQUALIFIED:" + text.split(":", 1)[1])
                else:
                    reasons.append("AGENTFUSE_LOAD_FAILED:" + type(exc).__name__)

    if not os.environ.get(PROVIDER_KEY_ENV):
        reasons.append("PROVIDER_CREDENTIAL_MISSING")

    warning = None
    try:
        _tool, warning = import_user_tool(args.tool)
    except PilotRefused as exc:
        reasons.append(str(exc))

    output = Path(args.output) if args.output else None
    if output is not None:
        parent = output.parent if str(output.parent) else Path(".")
        if not parent.is_dir():
            reasons.append("OUTPUT_DIR_MISSING")
        else:
            try:
                probe = parent / ".kerniq-pilot-write-probe"
                probe.write_bytes(b"")
                probe.unlink()
            except OSError:
                reasons.append("OUTPUT_DIR_NOT_WRITABLE")
        if output.exists():
            reasons.append("ARTIFACT_ALREADY_EXISTS")

    if reasons:
        print("PILOT_CHECK=REFUSED")
        for reason in reasons:
            print("REASON=" + reason)
        return EXIT_REFUSED
    if warning:
        print("WARNING=" + warning)
    print("PILOT_CHECK=PASS")
    return EXIT_OK


# --- run ------------------------------------------------------------------------


def _git_commit() -> str:
    import subprocess

    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True, cwd=Path(__file__).resolve().parents[2],
        ).stdout.strip()
    except Exception:
        return "unknown"


async def _run_case(
    backend: Any,
    make_client: Callable[[], Any],
    user_tool: Callable[[str], Awaitable[str]],
    *,
    block: bool,
) -> dict[str, Any]:
    from .evidence import project

    with tempfile.TemporaryDirectory(prefix="kerniq-maf-pilot-") as tmp:
        observed = PilotObservedTool(user_tool, Path(tmp))
        client = make_client()
        result = await backend.start_task(client, observed, block=block)
        if len(result.records) != 1:
            raise PilotRefused(("BLOCK_" if block else "ALLOW_") + "INVARIANT_ONE_RECORD")
        record = result.records[0]
        if not record.call_id or not record.occurrence_id:
            raise PilotRefused(("BLOCK_" if block else "ALLOW_") + "INVARIANT_NATIVE_IDENTITY")
        if record.decision is None or record.decision["action"] != ("block" if block else "allow"):
            raise PilotRefused(("BLOCK_" if block else "ALLOW_") + "INVARIANT_DECISION")
        phases = [event["phase"] for event in record.events]
        case: dict[str, Any] = {
            "status": "ran",
            "real_model_tool_call": True,
            "call_id": record.call_id,
            "occurrence_id": record.occurrence_id,
            "response_id": getattr(result.response, "response_id", None),
            "decision": record.decision["action"],
            "effective_args_digest": record.effective_digest,
            "release_occurred": "release" in phases,
            "dispatch_occurred": "dispatch" in phases,
            "start_occurred": "start" in phases,
            "bound_handler_entry_count": observed.entries,
            "pilot_entry_marker_exists": observed.marker.exists(),
            "pilot_entry_marker_line_count": len(observed.marker.read_text("utf-8").splitlines()) if observed.marker.exists() else 0,
            "outcome": record.outcome,
            "executed_args_digest": record.executed_digest,
            "handler_return_status": None,
            "result_sha256": observed.result_sha256,
            "result_type": observed.result_type,
            "event_phases": phases,
        }
        if block:
            if phases.count("request") < 1 or "decision" not in phases:
                raise PilotRefused("BLOCK_INVARIANT_EVENT_SEQUENCE")
            if "release" in phases or "dispatch" in phases or "start" in phases:
                raise PilotRefused("BLOCK_INVARIANT_NO_EXECUTION_STAGES")
            if observed.entries != 0 or observed.marker.exists():
                raise PilotRefused("BLOCK_INVARIANT_HANDLER_NOT_ENTERED")
            if record.outcome != "not_executed" or record.executed_digest is not None:
                raise PilotRefused("BLOCK_INVARIANT_OUTCOME")
        else:
            if not ("release" in phases and "dispatch" in phases and "start" in phases):
                raise PilotRefused("ALLOW_INVARIANT_EXECUTION_STAGES")
            if observed.entries != 1 or not observed.marker.exists():
                raise PilotRefused("ALLOW_INVARIANT_SINGLE_ENTRY")
            if record.executed_digest is None or record.executed_digest != record.effective_digest:
                raise PilotRefused("ALLOW_INVARIANT_ARGUMENT_BINDING")
            # A complete pilot requires a SUCCESSFUL ALLOW: if the user tool
            # raises, the real backend surfaces MiddlewareFailure anyway, and
            # v0.1 does not claim complete artifacts for failed runs.
            if record.outcome != "success":
                raise PilotRefused("ALLOW_INVARIANT_OUTCOME_SUCCESS_REQUIRED")
            case["handler_return_status"] = "SUCCESS"
        case["evidence_v0_2"] = project(record)
        return case


async def _run(args: argparse.Namespace) -> int:
    from agent_framework.openai import OpenAIChatCompletionClient
    from openai import AsyncOpenAI

    from .backend import MicrosoftAgentFrameworkGovernedBackend
    from .qualification import qualify_framework

    qualify_framework()
    user_tool, _warning = import_user_tool(args.tool)

    source = Path(os.environ[AGENTFUSE_SOURCE_ENV])
    backend = MicrosoftAgentFrameworkGovernedBackend(source)

    def make_client() -> Any:
        api = AsyncOpenAI(
            api_key=os.environ[PROVIDER_KEY_ENV],
            base_url="https://api.deepseek.com/v1",
            max_retries=0,
            timeout=60,
        )
        return OpenAIChatCompletionClient(
            model="deepseek-v4-flash",
            async_client=api,
            function_invocation_configuration={"max_iterations": 4, "max_function_calls": 1},
        )

    print("PILOT_RUN=STARTED tool=" + args.tool)
    block_case = await _run_case(backend, make_client, user_tool, block=True)
    print("BLOCK_CASE=PASS decision=block entries=0")

    allow_case: dict[str, Any]
    if not args.i_understand_allow_executes_tool:
        allow_case = {"status": "not_run", "reason": "allow_acknowledgement_missing"}
        print("ALLOW_CASE=NOT_RUN reason=allow_acknowledgement_missing")
    else:
        allow_case = await _run_case(backend, make_client, user_tool, block=False)
        print(
            "ALLOW_CASE=PASS decision=allow entries=1 outcome=" + allow_case["outcome"]
        )

    envelope = build_envelope(
        created_at=_utc_now(),
        kerniq_commit=_git_commit(),
        package_versions={
            name: importlib.metadata.version(name)
            for name in ("agent-framework-core", "agent-framework-openai", "openai", "pydantic")
        },
        tool_import_identifier=args.tool,
        block_case=block_case,
        allow_case=allow_case,
        self_reported_label=args.project_label,
    )
    output = Path(args.output)
    write_artifact(envelope, output)
    print("ARTIFACT_WRITTEN=" + output.name)
    status, reason = verify_artifact_file(output)
    print("SELF_VERIFY=" + status + ("" if reason is None else " REASON=" + reason))
    if status == "INCOMPLETE":
        print("PILOT_RUN=COMPLETE_PARTIAL (re-run with --i-understand-allow-executes-tool for a complete pilot artifact)")
        return EXIT_OK
    if status != "VERIFIED":
        return EXIT_REFUSED
    print("PILOT_RUN=COMPLETE")
    return EXIT_OK


def _utc_now() -> str:
    import datetime

    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


# --- verify ----------------------------------------------------------------------


def run_verify(args: argparse.Namespace) -> int:
    status, reason = verify_artifact_file(Path(args.artifact))
    print("VERIFY_RESULT=" + status)
    if reason:
        print("REASON=" + reason)
    if status == "INCOMPLETE":
        print("HINT=a BLOCK-only artifact is structurally valid but is NOT a complete pilot result; run the ALLOW phase with --i-understand-allow-executes-tool")
    # INCOMPLETE and REJECTED are both non-zero: neither counts as external validation
    return EXIT_OK if status == "VERIFIED" else EXIT_REFUSED


# --- CLI ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kerniq_microsoft_agent_framework.pilot",
        description=(
            "KerniQ Microsoft Agent Framework external pilot kit v0.1: local, "
            "read-only except the pilot artifact. Existing proven bounded lane only."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="verify environment, pins, credentials and tool contract")
    check.add_argument("--tool", required=True, help="import path of your async tool, e.g. myproject.tools:pilot_tool")
    check.add_argument("--output", default=None, help="planned artifact path (existence/writability pre-check)")

    run = sub.add_parser("run", help="run BLOCK (and ALLOW with explicit acknowledgement)")
    run.add_argument("--tool", required=True, help="import path of your async tool, e.g. myproject.tools:pilot_tool")
    run.add_argument("--output", required=True, help="artifact path to write")
    run.add_argument(
        "--i-understand-allow-executes-tool",
        action="store_true",
        help="explicit acknowledgement that the ALLOW phase REALLY executes your tool once",
    )
    run.add_argument("--project-label", default=None, help="self-reported project label (not an identity)")
    run.add_argument("--overwrite", action="store_true", help="overwrite an existing artifact file")

    verify = sub.add_parser("verify", help="verify a pilot artifact file")
    verify.add_argument("artifact", help="artifact path")
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            return run_check(args)
        if args.command == "run":
            output = Path(args.output)
            if output.exists() and not args.overwrite:
                print("PILOT_RUN=REFUSED")
                print("REASON=ARTIFACT_ALREADY_EXISTS")
                return EXIT_REFUSED
            return asyncio.run(_run(args))
        if args.command == "verify":
            return run_verify(args)
    except PilotRefused as exc:
        print("PILOT_RUN=REFUSED")
        print("REASON=" + str(exc))
        return EXIT_REFUSED
    except ArtifactRejected as exc:
        print("PILOT_RUN=REFUSED")
        print("REASON=" + str(exc))
        return EXIT_REFUSED
    except Exception:
        if os.environ.get("KERNIQ_PILOT_DEBUG"):
            traceback.print_exc()
        print("PILOT_ERROR=" + type(sys.exc_info()[1]).__name__)
        print("HINT=set KERNIQ_PILOT_DEBUG=1 for a traceback; see the pilot README troubleshooting section")
        return EXIT_REFUSED
    parser.error("unknown command")
    return EXIT_USAGE


if __name__ == "__main__":
    raise SystemExit(main())
