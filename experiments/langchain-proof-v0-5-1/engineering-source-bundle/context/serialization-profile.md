# Serialization profile

- Native event API: `astream_events(version="v2")` (langchain-core Runnable astream_events, v2 run/parent correlation)
- Serializer: `langchain_core.load.dump.dumps` at langchain-core 1.6.1 (public, versioned, reversible with `langchain_core.load.load.loads`)
- Representation: serialized native event objects as JSON, one per line; LangChain type markers (`.lc`) preserved; NOT provider wire bytes
- Failure policy: a serialization failure records a diagnostic and marks the capture incomplete; nothing is replaced with repr/str
- Archive representation id: `lc-dumps-jsonl-v1`
