# KerniQ External Validation Funnel v0.1

Stage tracking for the first external-validation round (MAF pilot). Stages
advance ONLY by explicit human decision after evidence exists — never
automatically, and never by the pilot CLI or any tooling.

```text
Candidate identified
        ↓
   Contacted
        ↓
   Interested
        ↓
 Pilot started
        ↓
Artifact returned
        ↓
Artifact verified
```

## Definitions

| Stage | Entry condition |
|:--|:--|
| Candidate identified | Public MAF evidence + contact path recorded in the shortlist; NOT_CONTACTED |
| Contacted | A draft from the outreach package was actually sent by an authorized human |
| Interested | The candidate replied positively (any channel they chose) |
| Pilot started | The candidate reports (or an artifact shows) `PILOT_RUN=STARTED` on their own tool |
| Artifact returned | `kerniq-maf-external-pilot-v0.1.json` received from the candidate |
| Artifact verified | KerniQ team runs `pilot verify` on the returned artifact AND independently establishes outside operator + outside-owned tool |

"Artifact verified" is a technical check plus an ownership review — it is
NOT `EXTERNAL_VALIDATION_PROVEN` by itself. That claim requires the full
chain (outside operator, outside-owned project/tool, real run, returned
artifact, verified complete result) and remains false until then.

## Current state (2026-09-11)

| Candidate | Stage | Evidence |
|:--|:--|:--|
| MohammadHaroonAbuomar | **Contacted** | [issuecomment-5623713807](https://github.com/microsoft/agent-framework/issues/7522#issuecomment-5623713807) on #7522 (tone-corrected resend, 2026-09-11; original comment 5623023739 deleted) |
| CorgiBoyG | **Contacted** | [issuecomment-5623721568](https://github.com/microsoft/agent-framework/issues/8079#issuecomment-5623721568) on #8079 (tone-corrected resend, 2026-09-11; original comment 5623027806 deleted) |
| antsok | **Contacted** | [issuecomment-5623726610](https://github.com/microsoft/agent-framework/issues/7588#issuecomment-5623726610) on #7588 (tone-corrected resend, 2026-09-11; original comment 5623032115 deleted) |
| likebean | Candidate identified (hold) | shortlist v0.1 entry 4; no draft this round |
| m4masood | Candidate identified (hold) | shortlist v0.1 entry 5; no draft this round |
| jmcgraw434 | Candidate identified (peer track) | shortlist v0.1 entry 6; peer-review framing if approached |

**OUTREACH_SENT=true (tone-corrected batch, 2026-09-11).** The three
original comments were judged too close to product promotion and were
deleted; the replacements are engineer-to-engineer technical discussion
comments (no project/platform mentions, no links, no CTA). Three HIGH
candidates remain CONTACTED and awaiting replies. No stage above Contacted
has been reached for anyone. No automatic replies, follow-ups or
second-round sends; any further contact requires a new human decision.
EXTERNAL_VALIDATION_PROVEN=false, ADOPTION_PROVEN=false unchanged.
