# AgentBackend Conformance

The AgentBackend conformance suite gives every backend adapter the same deterministic governance checks before it can be integrated with KerniQ. It runs without network access, model credentials, or external services.

## Current contract

An `AgentBackend` starts a correlated session, accepts user or model messages, streams ordered backend events, accepts a KerniQ-owned tool result, and shuts down cleanly. `AgentRuntime` forwards these operations without adding a second execution path.

Events must preserve session, turn, and tool-call identities. Tool requests cross the boundary as inert data. Results are accepted only for the exact pending request, terminal events are not duplicated after their cursor, and errors remain errors rather than becoming silent completion.

## Conformance foundation

`packages/agent-runtime/tests/conformance/agent-backend-conformance.ts` exports `runAgentBackendConformanceTests(name, factory)`. A factory supplies a backend configured for deterministic lifecycle, tool-request, cancellation, and error scenarios, plus observation counters that prove no fixture executed a tool.

The first covered implementations are:

- `MockAgentBackend`
- `DeepSeekHarnessBackend` with `MockDeepSeekHarnessTransport`

Reusable existing fixtures include scripted `MockAgentBackend` turns and the injectable mock DSH transport. Before this milestone, shared coverage was missing for identity rejection, duplicate results, cancellation cursor behavior, runtime-visible errors, and a uniform policy-boundary assertion.

## Forbidden responsibilities

A conforming backend must not execute tools, approve actions, evaluate policy, invoke AgentFuse, write evidence, or create an alternate command path. Those responsibilities remain in KerniQ's existing approval, AgentFuse, Action Runtime, evidence, and Project Command boundaries.

Cancellation is currently an event guarantee rather than a required method on `AgentBackend`. The suite verifies propagation, terminal result rejection, cursor-based replay suppression, and clean shutdown without expanding that interface.
