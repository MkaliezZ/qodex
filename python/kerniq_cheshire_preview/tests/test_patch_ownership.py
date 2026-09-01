"""F-01 patch ownership hardening: single-owner, generation-controlled
attach/detach. Nested attach, out-of-order detach, and stale handles can
never restore an ungoverned method over an active governed attach."""

from __future__ import annotations

import pytest

from kerniq_cheshire_preview import (
    GovernancePatchError,
    attach_governed_runtime,
)
from kerniq_cheshire_preview.interceptor import _PATCH_REGISTRY, _PatchOwnership

from .conftest import (
    FakeDecision,
    FakeToolCall,
    allow_response,
    block_response,
    requires_real_cheshire,
    run,
)


@requires_real_cheshire
class TestPatchOwnership:
    def test_second_active_attach_on_same_class_refused(
        self, agent, allowed_tool, evidence_path, tmp_path
    ):
        first = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        try:
            with pytest.raises(GovernancePatchError):
                attach_governed_runtime(
                    tmp_path / "second.jsonl",
                    agent_class=type(agent),
                    _sidecar=FakeDecision(),
                )
        finally:
            first.detach()
        assert not _PATCH_REGISTRY.get(type(agent), _PatchOwnership("", 0, type(agent), None, "")).active

    def test_out_of_order_detach_refused_and_governance_remains(
        self, agent, protected_tool, evidence_path, tmp_path
    ):
        # attach A (blocker), then attach B must be refused; detaching A is
        # the legitimate order here — the attack is detaching a STALE handle
        # after a newer legitimate attach took over.
        blocker = attach_governed_runtime(
            evidence_path,
            agent_class=type(agent),
            _sidecar=FakeDecision(responses=[block_response()]),
        )
        blocker.detach()

        guard = attach_governed_runtime(
            evidence_path,
            agent_class=type(agent),
            _sidecar=FakeDecision(responses=[block_response()]),
        )
        try:
            # Stale handle tries to unwind the active governed patch.
            with pytest.raises(GovernancePatchError):
                blocker.detach()
            # Active governance still holds: the tool call stays blocked.
            result = run(
                agent.call_tool(
                    FakeToolCall(id="call_o1", name="protected_action", args={})
                )
            )
            assert "blocked by governance" in str(result)
            assert protected_tool.execution_count == 0
        finally:
            guard.detach()

    def test_stale_handle_cannot_restore_ungoverned_method(
        self, agent, allowed_tool, evidence_path
    ):
        first = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        first.detach()
        second = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        try:
            with pytest.raises(GovernancePatchError):
                first.detach()  # stale: second owns the patch now
            # The governed method is still in place (second owner active).
            assert type(agent) in _PATCH_REGISTRY
            assert _PATCH_REGISTRY[type(agent)].owner_id == second.owner_id
        finally:
            second.detach()

    def test_detach_is_idempotent(self, agent, evidence_path):
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        attach.detach()
        attach.detach()  # second detach is a safe no-op
        entry = _PATCH_REGISTRY.get(type(agent))
        assert entry is None or not entry.active
        # The original audited method is restored on the class.
        from cat.services.agents.base import Agent

        assert type(agent).call_tool is Agent.call_tool

    def test_generation_increments_across_attach_cycles(self, agent, evidence_path):
        first = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        first_generation = first.generation
        first.detach()
        second = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        try:
            assert second.generation == first_generation + 1
            assert second.owner_id != first.owner_id
        finally:
            second.detach()

    def test_attach_records_original_identity(self, agent, evidence_path):
        attach = attach_governed_runtime(
            evidence_path, agent_class=type(agent), _sidecar=FakeDecision()
        )
        try:
            entry = _PATCH_REGISTRY[type(agent)]
            assert entry.original_identity  # qualname recorded
            assert entry.original_call_tool is not None
            assert entry.generation >= 1
        finally:
            attach.detach()
