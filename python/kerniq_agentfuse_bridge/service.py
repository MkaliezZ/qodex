"""NDJSON protocol bridge to the pinned canonical DHMS AgentFuse source."""

from __future__ import annotations

import argparse
from collections.abc import Mapping
from datetime import datetime, timezone
import hashlib
import importlib
import json
import os
import re
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
_PROJECT_COMMAND_PROFILE = "kerniq-project-command-v1"
_PROJECT_COMMAND_ACTION = "kerniq.project-command.run"
_PROJECT_COMMAND_POLICY_DIGEST = (
    "sha256:9c01df377b0cfd8db8392dc8966a2f12"
    "b38ad1b2ab9c89780ac049ac0eed38ad"
)
_PROJECT_COMMAND_RISK = "process"
_PROJECT_COMMAND_CATEGORIES = {"test", "check", "lint", "typecheck", "build"}
_PROJECT_COMMAND_PARAMETER_KEYS = {
    "commandId",
    "catalogDigest",
    "commandCategory",
    "projectBindingId",
    "projectFingerprint",
    "policyProfileId",
    "policyDigest",
}
_CODING_PACK_EXPORT_PROFILE = "kerniq-coding-pack-export-v1"
_CODING_PACK_EXPORT_POLICY_DIGEST = (
    "sha256:752a8bf1f251e5c05f07ddd8d820af3"
    "c5554fb37e3a47fbcf41933f614167d07"
)
_CODING_PACK_EXPORT_PROTOCOL = "kerniq.coding-pack.agentfuse-export.v1"
_CODING_PACK_EXPORT_ACTION = "kerniq.coding_pack.export"
_CODING_PACK_EXPORT_FORMAT = "kerniq-coding-pack-bundle-v1"
_CODING_PACK_EXPORT_REQUEST_KEYS = {
    "protocolVersion",
    "operationId",
    "proposalDigest",
    "approvalEvidenceDigest",
    "candidatePathsDigest",
    "sourceFingerprint",
    "packId",
    "manifestDigest",
    "destinationBindingId",
    "destinationFingerprint",
    "exportFormat",
}
_SHA256_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
_PACK_ID_PATTERN = re.compile(r"^pack-[0-9a-f]{64}$")
_DESTINATION_ID_PATTERN = re.compile(r"^destination-[0-9a-f]{24}$")


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
        has_fixture = "policyFixtureId" in payload
        has_profile = "policyProfileId" in payload
        if has_fixture == has_profile:
            raise ProtocolFailure("policy_selection_invalid")
        action_id = require_text(proposal.get("actionId"), "proposal.actionId")
        action_type = require_text(proposal.get("actionType"), "proposal.actionType")
        task_id = require_text(proposal.get("taskId"), "proposal.taskId")
        parameters = require_mapping(proposal.get("parameters"), "proposal.parameters")
        approval_id = require_text(approval.get("approvalId"), "approval.approvalId")
        if (
            approval.get("actionId") != action_id
            or approval.get("taskId") != task_id
            or approval.get("proposalDigest") != proposal.get("proposalDigest")
        ):
            raise ProtocolFailure("approval_identity_mismatch")

        if has_profile:
            return self._decide_project_command(
                payload,
                proposal,
                approval,
                parameters,
                action_id,
                action_type,
                task_id,
                approval_id,
            )
        return self._decide_proof(
            payload,
            proposal,
            approval,
            parameters,
            action_id,
            action_type,
            task_id,
            approval_id,
        )

    def _decide_proof(
        self,
        payload: dict[str, Any],
        proposal: dict[str, Any],
        approval: dict[str, Any],
        parameters: dict[str, Any],
        action_id: str,
        action_type: str,
        task_id: str,
        approval_id: str,
    ) -> dict[str, Any]:
        fixture_id = require_text(payload.get("policyFixtureId"), "policyFixtureId")
        if action_type != _PROOF_ACTION:
            raise ProtocolFailure("unsupported_action_type")
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

    def _decide_project_command(
        self,
        payload: dict[str, Any],
        proposal: dict[str, Any],
        approval: dict[str, Any],
        parameters: dict[str, Any],
        action_id: str,
        action_type: str,
        task_id: str,
        approval_id: str,
    ) -> dict[str, Any]:
        profile_id = require_text(payload.get("policyProfileId"), "policyProfileId")
        expected_digest = require_text(
            payload.get("expectedPolicyDigest"),
            "expectedPolicyDigest",
        )
        if profile_id != _PROJECT_COMMAND_PROFILE:
            raise ProtocolFailure("unsupported_policy_profile")
        if expected_digest != _PROJECT_COMMAND_POLICY_DIGEST:
            raise ProtocolFailure("policy_digest_mismatch")
        if action_type != _PROJECT_COMMAND_ACTION:
            raise ProtocolFailure("unsupported_action_type")
        session_id = require_text(proposal.get("sessionId"), "proposal.sessionId")
        for name, value in (
            ("proposal.actionId", action_id),
            ("proposal.taskId", task_id),
            ("proposal.sessionId", session_id),
            ("approval.approvalId", approval_id),
        ):
            if not bounded_text(value, 256):
                raise ProtocolFailure(f"{name}_is_not_bounded")
        proposal_digest = require_sha256(
            proposal.get("proposalDigest"),
            "proposal.proposalDigest",
        )
        if set(parameters) != _PROJECT_COMMAND_PARAMETER_KEYS:
            raise ProtocolFailure("project_command_parameter_shape_mismatch")
        if parameters.get("policyProfileId") != profile_id:
            raise ProtocolFailure("proposal_policy_profile_mismatch")
        if parameters.get("policyDigest") != expected_digest:
            raise ProtocolFailure("proposal_policy_digest_mismatch")
        generation = approval.get("generation")
        if (
            isinstance(generation, bool)
            or not isinstance(generation, int)
            or generation <= 0
            or generation > 9_007_199_254_740_991
        ):
            raise ProtocolFailure("approval_generation_invalid")

        tool_call = self.runtime_guard.ToolCallRequest(
            tool_call_id=action_id,
            tool_name=action_type,
            arguments=dict(parameters),
            safe_metadata={
                "task_id": task_id,
                "session_id": session_id,
                "approval_id": approval_id,
                "approval_generation": generation,
                "proposal_digest": proposal_digest,
                "risk": proposal.get("risk"),
                "policy_profile_id": profile_id,
                "policy_digest": expected_digest,
            },
        )
        guard = self.runtime_guard.RuntimeGuard(
            allow_tools={_PROJECT_COMMAND_ACTION},
            default_action="block",
            policy=project_command_policy,
        )
        resolved = guard.evaluate(tool_call)
        if resolved.action not in {"allow", "block"}:
            raise ProtocolFailure("canonical_decision_invalid")
        evidence = resolved.evidence.to_dict()
        decision_id = stable_id(
            "decision",
            action_id,
            approval_id,
            profile_id,
            expected_digest,
            evidence["record_id"],
        )
        return {
            "decisionId": decision_id,
            "actionId": action_id,
            "decision": resolved.action,
            "reasonCode": resolved.reason_code,
            "summary": (
                "Canonical AgentFuse allowed the bounded Project Command request."
                if resolved.action == "allow"
                else "Canonical AgentFuse blocked the bounded Project Command request."
            ),
            "policyVersion": f"dhms-agentfuse-runtime-guard@{self.package_version}",
            "schemaVersion": self.evidence_schema.SCHEMA_VERSION,
            "agentFuseCommit": self.source_commit,
            "policyProfileId": profile_id,
            "policyDigest": expected_digest,
            "evidence": evidence,
        }

    def decide_coding_pack_export(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = require_mapping(payload.get("request"), "request")
        profile_id = require_text(payload.get("policyProfileId"), "policyProfileId")
        expected_digest = require_text(
            payload.get("expectedPolicyDigest"),
            "expectedPolicyDigest",
        )
        request_digest = require_text(payload.get("requestDigest"), "requestDigest")
        if profile_id != _CODING_PACK_EXPORT_PROFILE:
            raise ProtocolFailure("unsupported_policy_profile")
        if expected_digest != _CODING_PACK_EXPORT_POLICY_DIGEST:
            raise ProtocolFailure("policy_digest_mismatch")
        operation_id = request.get("operationId")
        tool_call_id = (
            operation_id
            if bounded_identity_text(operation_id, 256)
            else "invalid-coding-pack-operation"
        )
        tool_call = self.runtime_guard.ToolCallRequest(
            tool_call_id=tool_call_id,
            tool_name=_CODING_PACK_EXPORT_ACTION,
            arguments=dict(request),
            safe_metadata={
                "request_digest": request_digest,
                "policy_profile_id": profile_id,
                "policy_digest": expected_digest,
            },
        )
        guard = self.runtime_guard.RuntimeGuard(
            allow_tools={_CODING_PACK_EXPORT_ACTION},
            default_action="block",
            policy=coding_pack_export_policy,
        )
        resolved = guard.evaluate(tool_call)
        if resolved.action not in {"allow", "block"}:
            raise ProtocolFailure("canonical_decision_invalid")
        evidence = resolved.evidence.to_dict()
        decision_id = stable_id(
            "decision",
            tool_call_id,
            request_digest,
            profile_id,
            expected_digest,
            evidence["record_id"],
        )
        return {
            "decisionId": decision_id,
            "operationId": tool_call_id,
            "requestDigest": request_digest,
            "decision": resolved.action,
            "reasonCode": resolved.reason_code,
            "policyVersion": f"dhms-agentfuse-runtime-guard@{self.package_version}",
            "schemaVersion": self.evidence_schema.SCHEMA_VERSION,
            "agentFuseCommit": self.source_commit,
            "policyProfileId": profile_id,
            "policyDigest": expected_digest,
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
            if message_type == "coding_pack_export_decision_request":
                decision = self.canonical.decide_coding_pack_export(payload)
                decision["decidedAt"] = (
                    datetime.now(timezone.utc).isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z")
                )
                return self._message(
                    message_id,
                    "coding_pack_export_decision_result",
                    decision,
                ), False
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
    if not isinstance(value, str) or not value.strip():
        raise ProtocolFailure(f"{name}_must_be_non_empty")
    return value


def require_mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProtocolFailure(f"{name}_must_be_object")
    return value


def require_sha256(value: Any, name: str) -> str:
    text = require_text(value, name)
    if not _SHA256_PATTERN.fullmatch(text):
        raise ProtocolFailure(f"{name}_must_be_sha256")
    return text


def project_command_policy(tool_call: Any) -> str:
    arguments = tool_call.arguments
    metadata = tool_call.safe_metadata
    valid = (
        tool_call.tool_name == _PROJECT_COMMAND_ACTION
        and set(arguments) == _PROJECT_COMMAND_PARAMETER_KEYS
        and bounded_text(arguments.get("commandId"), 160)
        and sha256(arguments.get("catalogDigest"))
        and arguments.get("commandCategory") in _PROJECT_COMMAND_CATEGORIES
        and bounded_text(arguments.get("projectBindingId"), 256)
        and sha256(arguments.get("projectFingerprint"))
        and arguments.get("policyProfileId") == _PROJECT_COMMAND_PROFILE
        and arguments.get("policyDigest") == _PROJECT_COMMAND_POLICY_DIGEST
        and bounded_text(metadata.get("task_id"), 256)
        and bounded_text(metadata.get("session_id"), 256)
        and bounded_text(metadata.get("approval_id"), 256)
        and isinstance(metadata.get("approval_generation"), int)
        and not isinstance(metadata.get("approval_generation"), bool)
        and metadata.get("approval_generation") > 0
        and sha256(metadata.get("proposal_digest"))
        and metadata.get("risk") == _PROJECT_COMMAND_RISK
        and metadata.get("policy_profile_id") == _PROJECT_COMMAND_PROFILE
        and metadata.get("policy_digest") == _PROJECT_COMMAND_POLICY_DIGEST
    )
    return "allow" if valid else "block"


def coding_pack_export_policy(tool_call: Any) -> str:
    arguments = tool_call.arguments
    metadata = tool_call.safe_metadata
    valid = (
        tool_call.tool_name == _CODING_PACK_EXPORT_ACTION
        and set(arguments) == _CODING_PACK_EXPORT_REQUEST_KEYS
        and arguments.get("protocolVersion") == _CODING_PACK_EXPORT_PROTOCOL
        and bounded_identity_text(arguments.get("operationId"), 256)
        and not absolute_path_like(arguments["operationId"])
        and sha256(arguments.get("proposalDigest"))
        and sha256(arguments.get("approvalEvidenceDigest"))
        and sha256(arguments.get("candidatePathsDigest"))
        and sha256(arguments.get("sourceFingerprint"))
        and isinstance(arguments.get("packId"), str)
        and bool(_PACK_ID_PATTERN.fullmatch(arguments["packId"]))
        and sha256(arguments.get("manifestDigest"))
        and isinstance(arguments.get("destinationBindingId"), str)
        and bool(_DESTINATION_ID_PATTERN.fullmatch(arguments["destinationBindingId"]))
        and sha256(arguments.get("destinationFingerprint"))
        and arguments.get("exportFormat") == _CODING_PACK_EXPORT_FORMAT
        and sha256(metadata.get("request_digest"))
        and metadata.get("request_digest") == coding_pack_request_digest(arguments)
        and metadata.get("policy_profile_id") == _CODING_PACK_EXPORT_PROFILE
        and metadata.get("policy_digest") == _CODING_PACK_EXPORT_POLICY_DIGEST
    )
    return "allow" if valid else "block"


def coding_pack_request_digest(request: Mapping[str, Any]) -> str:
    canonical = json.dumps(
        {"toolIdentity": _CODING_PACK_EXPORT_ACTION, "request": dict(request)},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def bounded_text(value: Any, maximum: int) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= maximum


def bounded_identity_text(value: Any, maximum_bytes: int) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        encoded = value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return (
        len(encoded) <= maximum_bytes
        and not any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in value)
    )


def absolute_path_like(value: str) -> bool:
    lowered = value.lower()
    return (
        value.startswith(("/", "\\"))
        or (
            len(value) >= 3
            and value[0].isalpha()
            and value[1] == ":"
            and value[2] in {"/", "\\"}
        )
        or lowered.startswith("file://")
    )


def sha256(value: Any) -> bool:
    return isinstance(value, str) and bool(_SHA256_PATTERN.fullmatch(value))


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
