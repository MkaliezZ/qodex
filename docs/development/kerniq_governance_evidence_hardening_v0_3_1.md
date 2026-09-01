# KerniQ v0.3.1 Governance Evidence Hardening

## Scope

This milestone hardens the existing two-worker control-plane product path. It
does not change Agent Runtime, Action Runtime, AgentFuse protocol, command
approval, evidence schema, persistence, recovery, or provider behavior.

## Production Observer

`packages/dsh-control-plane-observer` is the production DSH evidence observer.
It passively records the independently emitted session `tool/call` event and
the `tools/pre-execute`, `tools/execute`, and `tools/result` lifecycle. The
observer preserves DSH's call ID and registers no tool or policy.

The validation-only `validation/fixtures/kerniq-dsh-governance-proof` remains a
diagnostic test tool. Its marker and target writes are used only to prove BLOCK
and ALLOW behavior. Presence of that fixture cannot satisfy product governed
admission. Governed DSH admission requires the production observer, the audited
DSH runtime, installed AgentFuse adapter, pre-dispatch seam, and configured
evidence path. A missing prerequisite fails closed without a Codex fallback.

## Provenance

- DSH model and provider come from the admitted profile's `--dump-config`
  `agent-default-model` entry. Dynamic or absent values remain `unknown`.
- AgentFuse version comes from the installed adapter's `package.json` in the
  active DSH profile. Missing or invalid metadata remains `unknown`.
- Model tool-call provenance comes from DSH `session/event` `tool/call`, not
  from the later pre-execute hook. If that event is absent, the evidence value
  and provenance remain `unknown`.
- Dispatch absence is observed only after a correlated terminal tool result.
  Tool-body and physical-side-effect facts remain `unknown` for ordinary
  production tools; only the diagnostic proof tool supplies bounded markers.

## Capability And UI Corrections

The native product transports are bounded one-shot processes, so Codex and DSH
now report `supportsStreaming=false`. No event-stream transport was added.

Supervisor mode now uses the neutral label `Supervisor mode`. Its Inspector
shows only the authorized repository and backend-managed prompt routing instead
of stale single-agent context sources or a synthetic 128K token budget.

## Validation Contract

The real production regression installs only the production observer alongside
AgentFuse and proves a real DSH/DeepSeek task, correlated pre-execute evidence,
call-ID preservation, product completion, and Universal Session Ledger receipt.
Separate diagnostic profiles retain the proof fixture for BLOCK and ALLOW
side-effect assertions. Removing the production observer must fail governed
admission before either worker starts.

## Verified Results

- The production-only profile admitted DSH `0.1.2-alpha.1` at revision
  `cd5ef8148158c3a752a658978873241fdf8e2bbc`, with model/provider provenance
  read as `deepseek-v4-flash` / `deepseek-official` and AgentFuse version
  `0.2.1` read from installed package metadata.
- A real DSH/DeepSeek production-observer run completed with correlated
  `model_request`, `pre_execute`, `dispatch`, and `result` events. The desktop
  Supervisor path completed both workers and persisted the governed evidence
  in the session ledger while leaving ordinary-tool outcomes `unknown`.
- Diagnostic BLOCK preserved one model call ID through denial, produced no
  dispatch, body marker, or target side effect. Diagnostic ALLOW preserved one
  call ID through dispatch and result and produced the bounded expected marker.
- Removing the production observer failed governed admission before either
  worker started and produced no governance evidence file or fallback run.
- Local validation passed: observer `2/2`, focused native `8/8`, focused
  product backend `7/7`, focused desktop transport `1/1`, focused Playwright
  `1/1`, multi-agent runtime `220/220`, Agent Runtime `124/124`, Session Runtime
  `88/88`, desktop Vitest `185/185`, Tauri `73 passed / 3 ignored`, Playwright
  `60 passed / 4 skipped`, full workspace `1862/1862`, production build, and
  strict source-only typecheck.
- The four skipped Playwright cases remained environment-gated; they are not
  reported as passing. The production build retained its existing chunk-size
  advisory and completed successfully.
