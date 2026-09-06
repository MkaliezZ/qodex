"""Offline conformance proof for KerniQ Evidence Schema v0.2 (MVP).

Reference: docs/development/kerniq_evidence_schema_v0_2_mvp_spec.md
(SPEC_STATUS=MVP_SPEC_FROZEN_FOR_CONFORMANCE).

This package is a read-only validator plus synthetic fixtures. It is NOT a
runtime, NOT a writer, and it never repairs, completes, or guesses input.
Every rule encoded here mirrors a MUST/MUST NOT of the frozen spec; when a
document violates the contract the validator rejects it with a precise
error instead of normalizing it.
"""

from .validator import (
    EvidenceSchemaError,
    UnsupportedFieldError,
    validate_evidence_collection,
    validate_evidence_document,
    validate_json_text,
)

SCHEMA_VERSION = "kerniq.governance-evidence.v0.2"

__all__ = [
    "SCHEMA_VERSION",
    "EvidenceSchemaError",
    "UnsupportedFieldError",
    "validate_json_text",
    "validate_evidence_document",
    "validate_evidence_collection",
]
