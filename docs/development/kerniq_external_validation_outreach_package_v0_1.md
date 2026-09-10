# KerniQ External Validation Outreach Package v0.1

Draft first-contact comments for the three HIGH-priority candidates from
the [candidate shortlist v0.1](kerniq_external_validation_candidate_shortlist_v0_1.md).

**OUTREACH_SENT=false.** These are drafts only. Nobody has been contacted;
sending anything (GitHub comment, issue reply, email, DM, social post)
requires separate human authorization. `[PILOT_REPOSITORY_LINK]` is a
placeholder to be replaced manually before any send.

First contact talks about ONE thing: execution-boundary validation. No
"we fixed your problem", no platform claims, no production-readiness or
safety guarantees, no architecture internals (no AgentFuse / Evidence /
internal milestones / proof-document dumps).

---

# MohammadHaroonAbuomar

## Public Context

GitHub: https://github.com/MohammadHaroonAbuomar
Issue: [#7522 — a first-class fatal signal for function middleware (fail-closed…)](https://github.com/microsoft/agent-framework/issues/7522)
Author association: CONTRIBUTOR (external contributor; follow-up of PR #7515 review)
MAF evidence: issue text — "`_auto_invoke_function` converts every
function-middleware exception into a tool error and keeps looping …, so the
only loud escape from the loop today is `MiddlewareTermination`. Middleware
that needs fail-closed semantics (enforcement layers, guardrails…)"

## Why Contact

The technical question connecting his issue and our pilot: what should the
runtime do when a pre-dispatch enforcement layer refuses? He wants a loud
fail-closed path; our pilot demonstrates exactly one pinned lane where the
decision happens before continuation release and a BLOCK provably prevents
the tool body from running. Shared question, not a claimed fix.

## Outreach Goal

Invite a 10–15 minute pilot run (BLOCK → ALLOW → artifact verification) on
his own async Python tool. Not sales, not partnership, not adoption.

## Draft GitHub Comment

You described function-middleware exceptions being converted to tool errors
while the loop continues — so enforcement middleware has no loud fail-closed
path today (#7522).

We're validating a narrow execution-boundary hypothesis: whether an external
MAF developer can prove a tool call was blocked before execution and allowed
after decision.

If you have an async Python tool, the pilot runs one BLOCK and one ALLOW
against the real provider and gives you a locally verifiable artifact:
[PILOT_REPOSITORY_LINK].

No source sharing, no production change, no adoption commitment — about
10–15 minutes, entirely local.

Open question from our side: for an enforcement middleware, is an artifact
that proves non-entry on BLOCK useful evidence for you, or does this need to
live inside MAF itself?

## Status
DRAFT — NOT_SENT

---

# CorgiBoyG

## Public Context

GitHub: https://github.com/CorgiBoyG
Issue: [#8079 — always_require tool approval silently bypassed when preceded…](https://github.com/microsoft/agent-framework/issues/8079)
Author association: NONE (external user; 14 comments; public profile: Xidian University)
MAF evidence: issue text — "a tool configured with
`approval_mode="always_require"` can be silently bypassed (executed or
returned as user input without surfacing an approval request) … The approval
outcome depends on the **position** of the call within the batch rather than
on the call itself", plus his own `_try_execute_function_call_groups`
root-cause analysis.

## Why Contact

The connecting question: when approval is bound to a call, how do you later
prove what actually happened — that the call was blocked before execution or
ran after allowance? He debugged the binding defect; our pilot produces a
verifiable per-call record of exactly that outcome. Shared question about
approval-outcome binding, not a claimed fix.

## Outreach Goal

Invite a 10–15 minute pilot run on his own async Python tool.

## Draft GitHub Comment

In #8079 you showed the approval outcome depending on a call's position in
the batch rather than on the call itself — approval silently bypassed.

We're validating a narrow execution-boundary hypothesis: whether an external
MAF developer can prove a tool call was blocked before execution and allowed
after decision.

With one async Python tool, the pilot runs BLOCK then ALLOW through the real
provider and returns a digest-bound artifact you verify locally:
[PILOT_REPOSITORY_LINK].

No source sharing, no production change, no adoption commitment; roughly
10–15 minutes.

Curious how you'd rank the value: position-independent approval semantics
in-framework, or an external artifact that proves what actually happened to
the specific call?

## Status
DRAFT — NOT_SENT

---

# antsok

## Public Context

GitHub: https://github.com/antsok
Issues: [#7588 — function-call arguments are validated before any middleware…](https://github.com/microsoft/agent-framework/issues/7588);
[#7575 — Documentation/ergonomics report on FunctionInvocationContext](https://github.com/microsoft/agent-framework/issues/7575)
Author association: CONTRIBUTOR (external; SOKOLAI B.V. per public profile)
MAF evidence: #7588 argues that validating function-call arguments before
any middleware runs blurs what a middleware can actually gate.

## Why Contact

The connecting question: where is the cleanest enforcement boundary relative
to validation — before arguments are validated, or between validation and
entry? He maps the ordering; our pilot binds the decision before release and
checks argument digests again at physical entry, which is one concrete answer
he can poke at.

## Outreach Goal

Invite a 10–15 minute pilot run on his own async Python tool.

## Draft GitHub Comment

You noted in #7588 that function-call arguments are validated before any
middleware runs, which blurs what a middleware can actually gate.

We're validating a narrow execution-boundary hypothesis: whether an external
MAF developer can prove a tool call was blocked before execution and allowed
after decision — with the decision bound before continuation release and
argument digests re-checked at tool entry.

If you have an async Python tool, the pilot runs one BLOCK and one ALLOW and
returns a locally verifiable artifact: [PILOT_REPOSITORY_LINK].

No source sharing, no production change, no adoption commitment — about
10–15 minutes.

Where do you think the cleanest boundary sits: before argument validation,
or between validation and entry?

## Status
DRAFT — NOT_SENT

---

## Sending rules (for the later, separately authorized round)

- Replace `[PILOT_REPOSITORY_LINK]` manually; never assume a URL.
- One candidate at a time, starting with MohammadHaroonAbuomar, then
  CorgiBoyG, then antsok.
- Post as a plain GitHub issue comment; no mass posts, no cross-posting.
- Record each send in the funnel document (manual stage advance only).
- If a candidate declines or asks to stop: stop, mark in the funnel, do not
  re-contact.
