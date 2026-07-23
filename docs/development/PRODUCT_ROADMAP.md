# KerniQ Product Roadmap

KerniQ is evolving into a provider-neutral, skill-driven, memory-aware,
approval-first, evidence-first, general-purpose Agent. Coding is the first
mature Capability Pack, not the product boundary.

## Milestones

### v0.4.1 - Minimal Coding Agent Loop

**Status:** Frozen

### v0.5 - Universal Session Ledger and Restart Recovery

### v0.6 - Managed Python Runtime, Universal Action Runtime, and DHMS / AgentFuse Integration

### v0.7 - Coding Pack Product Integration

Repo2Prompt, Agent Doctor, Agent Rules Kit, and Git Task Checkpoints.

### v0.8 - Product Packaging and Closed Beta

Windows installer as the primary distribution target, macOS unsigned technical
preview, onboarding, credential storage, and managed-Python bootstrap.

### v0.9 - Research Pack and Office Pack

### v1.0 Beta

Skills, Memory, Automation, bounded delegation, mature capability packs, and
real-user validation.

## Distribution Constraints

```text
WINDOWS_INSTALLER=PLANNED_FOR_V0_8
MACOS_UNSIGNED_TECHNICAL_PREVIEW=PLANNED_FOR_V0_8
MACOS_DEVELOPER_ID_SIGNING=DEFERRED
MACOS_NOTARIZATION=DEFERRED
MAC_APP_STORE=DEFERRED
```

## Architectural Decisions

```text
PYTHON_IS_A_FIRST_CLASS_RUNTIME=true
MANAGED_PYTHON_IS_PLANNED=true
DHMS_PYTHON_REMAINS_CANONICAL=true
FULL_DHMS_TYPESCRIPT_REWRITE=false
```

## Explicitly Deferred

- MCP Agent Loop
- complex Multi-Agent orchestration
- cloud sync
- cross-device sessions
- mobile client
- large marketplace expansion
- multiple messaging gateways
- arbitrary shell
- automatic Git push
- automatic approvals
- enterprise administration
- Stage 2 namespace-wide rename
