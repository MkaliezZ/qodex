"""NDJSON protocol bridge to the pinned canonical DHMS AgentFuse source."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib
import json
import os
import sys
import types
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO


BRIDGE_PROTOCOL_VERSION = "kerniq.agentfuse.bridge.v1"
SUPPORTED_DECISION_SCHEMA = "agentfuse-evidence-schema-v0.1"
EXPECTED_PACKAGE_VERSION = "3.6.0"
POLICY_VERSION = f"dhms-agentfuse-runtime-guard@{EXPECTED_PACKAGE_VERSION}"
MESSAGE_LIMIT = 64 * 1024

_ALLOWED_FIXTURE = "kerniq-proof-allow-v1"
_DENIED_FIXTURE = "kerniq-proof-deny-v1"
_PROOF_ACTION = "kerniq.proof.increment-counter"


class ProtocolFailure(Exception):
    """Bounded protocol failure safe to return to the native caller."""


@dataclass(frozen=True)
class CanonicalAgentFuse:
    runtime_guard: Any
    evidence_schema: Any
    package_version: str
    source_commit: str

    @classmethod
    def load(cls, source_root: Path, expected_commit: str) -> "CanonicalAgentFuse":
        module_root = source_root / "dhms_agentfuse"
        runtime_guard_path = module_root / "runtime_guard.py"
        evidence_path = module_root / "evidence_schema.py"
        pyproject_path = source_root / "pyproject.toml"
        if not runtime_guard_path.is_file() or not evidence_path.is_file() or not pyproject_path.is_file():
            raise ProtocolFailure("canonical_source_layout_mismatch")

        import tomllib

        metadata = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
        package_version = metadata.get("project", {}).get("version")
        if not isinstance(package_version, str) or not package_version:
            raise ProtocolFailure("canonical_package_version_missing")
        if package_version != EXPECTED_PACKAGE_VERSION:
            raise ProtocolFailure("canonical_package_version_mismatch")

        # Avoid importing optional LangGraph dependencies from package __init__.
        package = types.ModuleType("dhms_agentfuse")
        package.__path__ = [str(module_root)]
        package.__package__ = "dhms_agentfuse"
        sys.modules["dhms_agentfuse"] = package
        for name in ("dhms_agentfuse.evidence_schema", "dhms_agentfuse.runtime_guard"):
            sys.modules.pop(name, None)
        evidence_schema = importlib.import_module("dhms_agentfuse.evidence_schema")
        runtime_guard = importlib.import_module("dhms_agentfuse.runtime_guard")
        if getattr(evidence_schema, "SCHEMA_VERSION", None) != SUPPORTED_DECISION_SCHEMA:
            raise ProtocolFailure("canonical_schema_mismatch")
        guard_type = getattr(runtime_guard, "RuntimeGuard", None)
        if (
            guard_type is None
            or not callable(getattr(guard_type, "evaluate", None))
            or not callable(getattr(guard_type, "aevaluate", None))
            or getattr(runtime_guard, "RuntimeGuardDecision", None) is None
        ):
            raise ProtocolFailure("canonical_public_decision_api_missing")
        return cls(runtime_guard, evidence_schema, package_version, expected_commit)

    def decide(self, payload: dict[str, Any]) -> dict[str, Any]:
        proposal = require_mapping(payload.get("proposal"), "proposal")
        approval = require_mapping(payload.get("approval"), "approval")
        fixture_id = require_text(payload.get("policyFixtureId"), "policyFixtureId")
        action_id = require_text(proposal.get("actionId"), "proposal.actionId")
        action_type = require_text(proposal.get("actionType"), "proposal.actionType")
        task_id = require_text(proposal.get("taskId"), "proposal.taskId")
        parameters = require_mapping(proposal.get("parameters"), "proposal.parameters")
        approval_id = require_text(approval.get("approvalId"), "approval.approvalId")

        if action_type != _PROOF_ACTION:
            raise ProtocolFailure("unsupported_action_type")
        if (
            approval.get("actionId") != action_id
            or approval.get("taskId") != task_id
            or approval.get("proposalDigest") != proposal.get("proposalDigest")
        ):
            raise ProtocolFailure("approval_identity_mismatch")

        tool_call = self.runtime_guard.ToolCallRequest(
            tool_call_id=action_id,
            tool_name=action_type,
            arguments=parameters,
            safe_metadata={
                "task_id": task_id,
                "session_id": proposal.get("sessionId"),
                "approval_id": approval_id,
                "approval_generation": approval.get("generation"),
                "proposal_digest": proposal.get("proposalDigest"),
                "risk": proposal.get("risk"),
            },
        )
        if fixture_id == _ALLOWED_FIXTURE:
            guard = self.runtime_guard.RuntimeGuard(allow_tools={action_type})
        elif fixture_id == _DENIED_FIXTURE:
            guard = self.runtime_guard.RuntimeGuard(deny_tools={action_type})
        else:
            raise ProtocolFailure("unknown_trusted_policy_fixture")

        # KerniQ consumes only the canonical public pre-dispatch decision API.
        # AgentFuse never invokes a KerniQ action handler.
        resolved = guard.evaluate(tool_call)
        evidence = resolved.evidence.to_dict()
        decision = "allow" if resolved.action == "allow" else "deny"
        decision_id = stable_id(
            "decision",
            action_id,
            approval_id,
            fixture_id,
            evidence["record_id"],
        )
        return {
            "decisionId": decision_id,
            "actionId": action_id,
            "decision": decision,
            "reasonCode": resolved.reason_code,
            "summary": (
                "Canonical AgentFuse allowed the bounded proof action."
                if decision == "allow"
                else "Canonical AgentFuse denied the bounded proof action before dispatch."
            ),
            "policyVersion": f"dhms-agentfuse-runtime-guard@{self.package_version}",
            "schemaVersion": self.evidence_schema.SCHEMA_VERSION,
            "agentFuseCommit": self.source_commit,
            "evidence": evidence,
        }


class BridgeService:
    def __init__(self, canonical: CanonicalAgentFuse) -> None:
        self.canonical = canonical
        self.seen_message_ids: set[str] = set()

    def handle(self, raw: str) -> tuple[dict[str, Any], bool]:
        if len(raw.encode("utf-8")) > MESSAGE_LIMIT:
            return self._error("unknown", "message_too_large"), False
        try:
            message = json.loads(raw)
            if not isinstance(message, dict):
                raise ProtocolFailure("message_must_be_object")
            message_id = require_text(message.get("messageId"), "messageId")
            if message_id in self.seen_message_ids:
                raise ProtocolFailure("duplicate_message_id")
            self.seen_message_ids.add(message_id)
            if message.get("protocolVersion") != BRIDGE_PROTOCOL_VERSION:
                raise ProtocolFailure("protocol_version_mismatch")
            message_type = require_text(message.get("messageType"), "messageType")
            payload = require_mapping(message.get("payload"), "payload")

            if message_type == "hello":
                response_payload = {
                    "bridgeProtocolVersion": BRIDGE_PROTOCOL_VERSION,
                    "pythonVersion": ".".join(map(str, sys.version_info[:3])),
                    "agentFusePackageVersion": self.canonical.package_version,
                    "agentFuseSourceCommit": self.canonical.source_commit,
                    "supportedDecisionSchema": self.canonical.evidence_schema.SCHEMA_VERSION,
                    "processId": os.getpid(),
                }
                return self._message(message_id, "hello_ack", response_payload), False
            if message_type == "health_check":
                return self._message(message_id, "health_result", {
                    "status": "ready",
                    "canonicalImport": True,
                }), False
            if message_type == "decision_request":
                decision = self.canonical.decide(payload)
                decision["decidedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                return self._message(message_id, "decision_result", decision), False
            if message_type == "shutdown":
                return self._message(message_id, "shutdown_ack", {"status": "stopping"}), True
            raise ProtocolFailure("unsupported_message_type")
        except (ProtocolFailure, ValueError, TypeError, json.JSONDecodeError) as error:
            message_id = "unknown"
            if isinstance(locals().get("message"), dict):
                candidate = locals()["message"].get("messageId")
                if isinstance(candidate, str) and candidate:
                    message_id = candidate
            reason = str(error) if str(error) else "protocol_error"
            return self._error(message_id, reason), False

    @staticmethod
    def _message(message_id: str, message_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "protocolVersion": BRIDGE_PROTOCOL_VERSION,
            "messageId": message_id,
            "messageType": message_type,
            "payload": payload,
        }

    def _error(self, message_id: str, reason_code: str) -> dict[str, Any]:
        return self._message(message_id, "protocol_error", {
            "reasonCode": reason_code,
            "summary": "The bridge rejected an invalid or unsupported request.",
        })


def run_loop(service: BridgeService, stdin: TextIO, stdout: TextIO) -> int:
    for line in stdin:
        response, stop = service.handle(line)
        encoded = json.dumps(response, sort_keys=True, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MESSAGE_LIMIT:
            encoded = json.dumps(
                service._error(response.get("messageId", "unknown"), "response_too_large"),
                sort_keys=True,
                separators=(",", ":"),
            )
        stdout.write(encoded + "\n")
        stdout.flush()
        if stop:
            return 0
    return 0


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def require_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ProtocolFailure(f"{name}_must_be_non_empty")
    return value


def require_mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProtocolFailure(f"{name}_must_be_object")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--agentfuse-source", required=True)
    parser.add_argument("--expected-commit", required=True)
    arguments = parser.parse_args(argv)
    try:
        canonical = CanonicalAgentFuse.load(
            Path(arguments.agentfuse_source),
            arguments.expected_commit,
        )
        return run_loop(BridgeService(canonical), sys.stdin, sys.stdout)
    except Exception:
        print("KerniQ AgentFuse bridge failed to initialize.", file=sys.stderr)
        return 2
