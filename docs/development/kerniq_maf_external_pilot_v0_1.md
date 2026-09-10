# KerniQ Microsoft Agent Framework External Pilot v0.1

## Who this pilot is for

A developer who already builds agents with the official Microsoft Agent
Framework Python package and wants to see, on their own machine, project and
real async tool, what a real pre-dispatch governance boundary does: a BLOCK
that prevents the tool from running, and an ALLOW that runs it — with a
verifiable, privacy-safe artifact.

You do NOT need KerniQ Desktop, any KerniQ account, or knowledge of KerniQ's
internals.

## What it proves

For your one imported tool, on the official pinned MAF runtime, through a
real model tool call: the canonical AgentFuse decision happens before the
tool runs. BLOCK ⇒ your handler is not entered; ALLOW ⇒ your handler runs
exactly once, with effective/executed argument digests bound.

## What it does NOT prove

Not general Microsoft Agent Framework support. Not all MAF tool types
(hosted tools, MCP, provider-side execution are excluded). Not governance of
delegation itself. Not authorization, authenticated identity, or
model-request provenance. Not universal exactly-once. And this artifact does
not prove who ran it — operator identity is self-reported only and must be
established by the KerniQ team separately.

## 10–15 minute quickstart

Pick ONE Python 3.10+ command and use it consistently (`python3` on
macOS/Linux; `py -3` or your venv's `python` on Windows — confirm the version
first).

```bash
git clone https://github.com/MkaliezZ/qodex.git
cd qodex/python
python3 -m venv ../.venv-maf-pilot
source ../.venv-maf-pilot/bin/activate        # Windows: ..\.venv-maf-pilot\Scripts\activate
python -m pip install -r kerniq_microsoft_agent_framework/requirements.txt

export DEEPSEEK_API_KEY=...                   # your key; never printed or stored
export KERNIQ_AGENTFUSE_SOURCE=/path/to/dhms-engine-ec4b5842
```

`KERNIQ_AGENTFUSE_SOURCE` must point to the pinned AgentFuse source tree
(commit `ec4b5842339dccfba0db62df7541920759203bc9`, verified byte-by-byte;
the pilot refuses anything else). Ask the KerniQ team for the archive.

## Tool contract

Point the pilot at one importable async callable with EXACTLY this shape
(a thin wrapper over your real tool is fine — we never generate one for you):

```python
async def pilot_tool(value: str) -> str:
    return await my_real_business_tool(value)
```

Run from a shell whose working directory (or `PYTHONPATH`) makes
`module:function` importable. Since the pilot commands run from
`qodex/python`, a tool living in your own project usually needs
`export PYTHONPATH=/path/to/your/project` (Windows `set PYTHONPATH=...`).

## Safety warning for ALLOW

The ALLOW phase REALLY executes your tool once. Only opt in with a
reversible / sandbox / test-environment tool. Do NOT use tools that delete
data, send money, send production email, deploy, rotate production
credentials, or destructively modify the filesystem. BLOCK runs first and
needs no acknowledgement.

## Run check

```bash
python -m kerniq_microsoft_agent_framework.pilot check \
  --tool myproject.tools:pilot_tool \
  --output kerniq-maf-external-pilot-v0.1.json
```

`PILOT_CHECK=PASS` or `PILOT_CHECK=REFUSED` with stable `REASON=...` codes
(unqualified versions, missing AgentFuse source, missing credential,
unsupported tool signature, …).

## Run BLOCK + ALLOW

```bash
python -m kerniq_microsoft_agent_framework.pilot run \
  --tool myproject.tools:pilot_tool \
  --output kerniq-maf-external-pilot-v0.1.json \
  --i-understand-allow-executes-tool
```

Omit the acknowledgement flag to run BLOCK only (the artifact then records
the ALLOW phase as `not_run`). There is no automatic retry of your tool.

## Verify artifact

```bash
python -m kerniq_microsoft_agent_framework.pilot verify \
  kerniq-maf-external-pilot-v0.1.json
```

`VERIFY_RESULT=VERIFIED` checks the artifact digest, BLOCK/ALLOW invariants,
decision/outcome separation, qualification metadata, privacy constraints and
the embedded Evidence v0.2 documents.

## What file to return

Return ONLY `kerniq-maf-external-pilot-v0.1.json`. Do NOT send source code,
logs, your API key, screenshots, prompts, tool results, or customer data.

## Privacy

The artifact contains only versions, pinned hashes, IDs, digests, enums and
timestamps — no API key, environment dump, source code, raw prompts, raw
model requests/responses, raw tool arguments, or tool result bodies. A
privacy scan runs before the artifact is written and refuses on suspected
secrets instead of redacting.

## Troubleshooting

- `REASON=UNQUALIFIED_PACKAGE:…` — reinstall the exact pinned requirements.
- `REASON=AGENTFUSE_*` — wrong/missing `KERNIQ_AGENTFUSE_SOURCE` archive.
- `REASON=PROVIDER_CREDENTIAL_MISSING` — export `DEEPSEEK_API_KEY`.
- `REASON=TOOL_*` — your callable must be `async def f(value: str) -> str`.
- Set `KERNIQ_PILOT_DEBUG=1` for a traceback; otherwise errors stay short.
