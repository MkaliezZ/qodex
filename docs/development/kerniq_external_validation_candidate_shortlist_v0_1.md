# KerniQ External Validation Candidate Shortlist v0.1

First-round discovery for the MAF external pilot (docs/development/
kerniq_maf_external_pilot_v0_1.md). Research-only: **OUTREACH_SENT=false**;
nobody on this list has been contacted. The goal is not "users" — it is
people willing to run the 10–15 minute external pilot on their own async
Python tool.

Pilot message (bounded, per positioning rules):

> "We are validating a narrow execution boundary: whether an external MAF
> developer can prove a tool call was blocked before execution and allowed
> after approval."

Qualification funnel: Tier 0 MAF relevance → Tier 1 execution-boundary pain
→ Tier 2 pilot compatibility (async Python function tool) → Tier 3
contactability (public GitHub identity + issue/discussion link; no guessed
emails). Research date: 2026-09-11, via the public microsoft/agent-framework
issue tracker and public profiles.

---

## Candidate 1

### Identity
name: CorgiBoyG
github: https://github.com/CorgiBoyG
source: issue author (author_association=NONE; Xidian University per public profile)

### MAF Evidence
Python core user who filed and root-caused an approval-bypass defect:
issue [#8079 "always_require tool approval silently bypassed when preceded…"](https://github.com/microsoft/agent-framework/issues/8079)
(14 comments): "a tool configured with `approval_mode="always_require"` can
be silently bypassed (executed or returned as user input without surfacing
an approval request) … The approval outcome depends on the **position** of
the call within the batch rather than on the call itself." Includes a
`_try_execute_function_call_groups` root-cause analysis in `_tools.py`.

### Governance Relevance
Direct: tool approval enforcement actually failing (execution governance
pain, not theory). Understands pre-dispatch semantics well enough to debug
the batch classifier.

### Pilot Fit
estimated: **HIGH** — Python, already works at the exact FunctionTool/
approval seam the pilot wraps; likely has or can write a one-arg async tool.

### Outreach Angle
"You root-caused an approval being silently bypassed by batch position —
here is a 10-minute way to get a verifiable blocked-before-execution /
allowed-after-decision artifact for your own tool."

### Competition/Positioning note
No governance layer ownership observed; appears to be a practitioner, not a
framework vendor.

### Status
NOT_CONTACTED

---

## Candidate 2

### Identity
name: MohammadHaroonAbuomar
github: https://github.com/MohammadHaroonAbuomar
source: issue author (author_association=CONTRIBUTOR; follow-up of PR #7515 review)

### MAF Evidence
Python contributor; issue [#7522 "a first-class fatal signal for function middleware (fail-closed…)"](https://github.com/microsoft/agent-framework/issues/7522):
"`_auto_invoke_function` converts every function-middleware exception into a
tool error and keeps looping …, so the only loud escape from the loop today
is `MiddlewareTermination`. Middleware that needs fail-closed semantics
(enforcement layers, guardrails…)" — i.e. MAF today lacks loud fail-closed
enforcement middleware semantics.

### Governance Relevance
Exactly the pilot's semantic: BLOCK must prevent the tool body from running,
and an enforcement layer must fail closed, not degrade into a tool error.

### Pilot Fit
estimated: **HIGH** — Python contributor working at FunctionMiddleware
level; the pilot's governed lane is a working fail-closed pre-dispatch
middle layer for one tool.

### Outreach Angle
"You asked MAF for fail-closed middleware semantics; we have a pinned lane
where BLOCK provably prevents the tool body — run it against your own async
tool in ~10 minutes and keep the artifact."

### Competition/Positioning note
No competing governance product observed.

### Status
NOT_CONTACTED

---

## Candidate 3

### Identity
name: antsok
github: https://github.com/antsok
source: issue author (author_association=CONTRIBUTOR; SOKOLAI B.V. per public profile)

### MAF Evidence
Two deep Python middleware-boundary issues:
[#7588 "function-call arguments are validated before any middleware…"](https://github.com/microsoft/agent-framework/issues/7588)
and [#7575 "Documentation/ergonomics report. FunctionInvocationContext…"](https://github.com/microsoft/agent-framework/issues/7575).

### Governance Relevance
Strong: cares about what is decided/validated before vs after middleware —
the exact pre-dispatch ordering the pilot demonstrates (decision before
continuation release; effective vs executed argument digests bound).

### Pilot Fit
estimated: **HIGH** — Python, company practitioner, already reasons about
FunctionInvocationContext internals.

### Outreach Angle
"You mapped where validation happens relative to middleware — here is a
lane where the decision is bound before release and executed args are
digest-checked at entry; try it on your own tool."

### Competition/Positioning note
None observed (services company, not a governance vendor).

### Status
NOT_CONTACTED

---

## Candidate 4

### Identity
name: likebean
github: https://github.com/likebean
source: issue author (author_association=NONE)

### MAF Evidence
Python + AG-UI approval-path bugs:
[#8132 "AG-UI local approval execution does not receive full function call…"](https://github.com/microsoft/agent-framework/issues/8132)
and [#8135 "AG-UI + HistoryProvider…"](https://github.com/microsoft/agent-framework/issues/8135).

### Governance Relevance
Moderate-high: builds approval flows against MAF tool execution (HITL
wiring pain rather than policy semantics).

### Pilot Fit
estimated: **MEDIUM-HIGH** — Python; approval-flow builder, so the BLOCK/
ALLOW artifact story should land; needs a plain async tool rather than the
AG-UI surface.

### Outreach Angle
"You wire approval into tool execution — this pilot gives you a verifiable
blocked/allowed artifact for one async tool without touching your UI stack."

### Competition/Positioning note
None observed.

### Status
NOT_CONTACTED

---

## Candidate 5

### Identity
name: m4masood
github: https://github.com/m4masood
source: issue author (author_association=NONE)

### MAF Evidence
Python middleware author:
[#8192 "How can I write a middleware for groundness validation"](https://github.com/microsoft/agent-framework/issues/8192)
(4 comments).

### Governance Relevance
Moderate: wants a validation middleware layer (content-level guardrail),
adjacent to execution governance; the pilot's decision-before-release seam
is the structural hook.

### Pilot Fit
estimated: **MEDIUM** — Python; content-validation focus means the pilot's
policy-block-before-execution demo is adjacent rather than identical.

### Outreach Angle
"You're writing validation middleware — see what a pinned pre-dispatch
decision boundary looks like from the middleware seat, on your own tool."

### Competition/Positioning note
None observed.

### Status
NOT_CONTACTED

---

## Candidate 6

### Identity
name: jmcgraw434 (TaskHawk Systems)
github: https://github.com/jmcgraw434
source: issue author (author_association=NONE; Founder, TaskHawk Systems — "Deterministic runtime assurance for autonomous systems")

### MAF Evidence
Filed the agentic-trust design issue
[#4203 "Precision Decisioning & Agentic Trust: Cryptographic proof of authorship/authority…"](https://github.com/microsoft/agent-framework/issues/4203)
(11 comments): "the authorization model today is probabilistic … There is no
verifiable proof that a specific action was authorized by a specific policy
for a specific intent."

### Governance Relevance
Highest conceptually — deterministic authorization + verifiable action
proofs is KerniQ's own thesis. Language/stack of his own runtime not
confirmed from public data (issue is framework-level, not Python-tagged).

### Pilot Fit
estimated: **MEDIUM** — clear pain and vocabulary; Python fit unconfirmed;
may prefer to evaluate rather than run.

### Outreach Angle
"You described probabilistic-vs-deterministic agent authorization in #4203 —
we built exactly that boundary for one pinned MAF lane; peer-review the
approach, or run the pilot yourself."

### Competition/Positioning note
**Likely competitor/peer**: TaskHawk Systems sells deterministic runtime
assurance. Treat as a respected peer reviewer, not a naive user; expect
scrutiny of claims. Do not position KerniQ against him; share the bounded
pilot and let the artifact speak.

### Status
NOT_CONTACTED

---

## Candidate 7 (observation tier — not an external target)

### Identity
name: westey-m
github: https://github.com/westey-m
source: issue author (author_association=CONTRIBUTOR; **Software Engineer at Microsoft working on MAF**)

### MAF Evidence
Filed Python approval-configuration issues
[#6876](https://github.com/microsoft/agent-framework/issues/6876) /
[#6875](https://github.com/microsoft/agent-framework/issues/6875) ("Allow
configuring approval for default approval required …").

### Governance Relevance
High (owns the approval surface), but he is MAF team, not an outside
developer — external-validation definition requires an outside operator.

### Pilot Fit
estimated: **N/A for external validation**; potentially useful later as an
informed reviewer of the pilot approach, via a separately decided channel.

### Outreach Angle
Not for this round.

### Status
NOT_CONTACTED (deferred)

---

## Candidate 8 (LOW — .NET stack)

### Identity
name: Lanayx
github: https://github.com/Lanayx
source: issue author (author_association=NONE)

### MAF Evidence
[#3054 "FunctionApprovalRequest get applied to all functions although…"](https://github.com/microsoft/agent-framework/issues/3054)
(14 comments) — .NET approval-scoping pain; long-standing Semantic
Kernel/MAF .NET community member.

### Governance Relevance
High (approval scoping), but .NET.

### Pilot Fit
estimated: **LOW** — pilot v0.1 is Python-only; revisit if a .NET lane is
ever separately authorized.

### Status
NOT_CONTACTED (deferred)

---

## Candidate 9 (LOW — .NET stack)

### Identity
name: soul-soft
github: https://github.com/soul-soft
source: issue author (author_association=NONE)

### MAF Evidence
[#7862 "MAF approval-required function call is persisted as…"](https://github.com/microsoft/agent-framework/issues/7862)
and [#7872 "explicit closure semantics for dangling tool calls…"](https://github.com/microsoft/agent-framework/issues/7872)
— .NET approval persistence/closure semantics.

### Governance Relevance
High (approval lifecycle honesty), but .NET.

### Pilot Fit
estimated: **LOW** (Python-only pilot).

### Status
NOT_CONTACTED (deferred)

---

## Candidate 10 (LOW — .NET stack)

### Identity
name: mokarchi
github: https://github.com/mokarchi
source: issue author (author_association=NONE)

### MAF Evidence
[#2254 "Built-in Security & Validation Middleware …"](https://github.com/microsoft/agent-framework/issues/2254)
— .NET request for framework-provided security middleware.

### Governance Relevance
High (asks the framework for exactly this class of layer), but .NET.

### Pilot Fit
estimated: **LOW** (Python-only pilot).

### Competition/Positioning note
Wants the framework itself to ship governance — useful signal that a
third-party pinned lane must be clearly scoped as "yours, not MAF's".

### Status
NOT_CONTACTED (deferred)

---

## Funnel summary

| # | Candidate | Tier 1 pain | Tier 2 Python fit | Priority |
|:--|:--|:--|:--|:--|
| 1 | CorgiBoyG | approval bypass root-cause | HIGH | **HIGH** |
| 2 | MohammadHaroonAbuomar | fail-closed middleware semantics | HIGH | **HIGH** |
| 3 | antsok | middleware/validation ordering | HIGH | **HIGH** |
| 4 | likebean | approval execution wiring | MEDIUM-HIGH | MEDIUM-HIGH |
| 5 | m4masood | validation middleware | MEDIUM | MEDIUM |
| 6 | jmcgraw434 (TaskHawk) | deterministic authorization | unconfirmed | MEDIUM (peer) |
| 7 | westey-m (Microsoft) | approval config | N/A external | observation |
| 8 | Lanayx | approval scoping | LOW (.NET) | deferred |
| 9 | soul-soft | approval persistence | LOW (.NET) | deferred |
| 10 | mokarchi | security middleware | LOW (.NET) | deferred |

Counts: candidates found = 10; Tier-1 (execution-boundary pain) = 10 of 10
at varying depth; HIGH-priority Python-fit = 3 (+1 medium-high, +1
medium); publicly contactable via GitHub issue/profile = 10; outreach
sent = **0**.

External validation remains unproven (EXTERNAL_VALIDATION_PROVEN=false,
ADOPTION_PROVEN=false). Per the frozen boundary, the pilot never proves the
operator; ownership is established by the KerniQ team after an artifact is
returned.
