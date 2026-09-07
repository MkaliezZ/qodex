# Provenance

- Source class: TEAM_OWNED_ENGINEERING_EXPERIMENT (isolated lab experiment; not an external application, not community adoption)
- Experiment entry: langchain-proof-capture-v0-5-1 (TEAM_LAB_NATIVE_STREAM_CONSUMER — consumes the public native event stream and archives locally; no callback, no middleware, no monkey patch, no KerniQ SDK)
- Native producer: langchain/langgraph agent runtime (versions in runtime-versions.json); collector identity is NOT runtime admission and NOT an approver
- Model: real DeepSeek API call (deepseek-chat); no FakeModel, no replay, no recorded responses
- Credential handling: DEEPSEEK_API_KEY read from the user environment at runtime; value never written to any bundle file
- Raw events: unmodified native stream output; no KerniQ/evidence/decision fields added; raw/ is append-only and not edited after capture
- Receipt timestamps are collector receive times, not native event times (the native format carries no per-event timestamps)
