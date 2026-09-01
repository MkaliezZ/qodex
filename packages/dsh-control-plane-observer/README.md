# KerniQ DSH Control-Plane Observer

Passive production evidence observer for the KerniQ control plane. It records
DSH `tool/call`, pre-execute decision, dispatch, and result lifecycle events to
the configured `KERNIQ_DSH_EVIDENCE_PATH` JSONL file.

The package registers no tools, evaluates no policy, performs no command or
filesystem action on behalf of a model, and does not depend on the diagnostic
governance proof fixture. AgentFuse remains the decision authority.
