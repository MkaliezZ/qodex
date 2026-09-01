"""KerniQ v0.4 Cheshire Cat Governed Preview Prototype (Phase 1).

SDK-free runtime governance attach for the audited Cheshire Cat runtime
(cheshire-cat-ai==2.0.23, validated seam ``Agent.call_tool() ->
Tool.execute()``). The existing agent runtime keeps ownership of the agent
loop, the tool registry, and physical execution; KerniQ only attaches an
interceptor that requests an AgentFuse decision before the original
``call_tool`` dispatch, plus evidence capture. Fail closed on admission,
sidecar, timeout, and evidence failures.
"""

from .admission import GovernanceAttachError, admit_governed_runtime
from .interceptor import GovernedAttach, attach_governed_runtime

__all__ = [
    "GovernanceAttachError",
    "admit_governed_runtime",
    "attach_governed_runtime",
    "GovernedAttach",
]
