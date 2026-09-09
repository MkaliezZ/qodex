"""KerniQ external validation: minimal local validator for the frozen
external LangChain profile langchain-create-agent-tool-run-jsonl-v0.1.

Implements the minimal scope authorized by
docs/development/kerniq_langchain_external_profile_v0_6_2_freeze.md section
10: ONE frozen OBSERVED profile, existing compatible archive only, local
read-only validation, strict refusal/unknown semantics, artifact writer and
artifact verifier. No capture path, no general LangChain support, no
governance claim, no network access.
"""

from .langchain_profile import (
    ARTIFACT_CANONICALIZATION,
    PROFILE_ID,
    PROFILE_VERSION,
    SOURCE_DIGEST_REPRESENTATION,
    VALIDATOR_VERSION,
)

__all__ = [
    "PROFILE_ID",
    "PROFILE_VERSION",
    "VALIDATOR_VERSION",
    "SOURCE_DIGEST_REPRESENTATION",
    "ARTIFACT_CANONICALIZATION",
]
