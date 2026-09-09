"""Stable diagnostic categories and result selection.

The nine diagnostic codes and the artifact result enum are frozen by
kerniq_langchain_external_profile_v0_6_2_freeze.md section 7 and
kerniq_external_validation_pilot_v0_6_design.md section 13. Codes are
profile-level outcomes; they never mutate the Evidence schema, the conformance
validator, or governance semantics.

Result priority (pilot design section 13, fixed):
VALIDATION_ERROR > UNSUPPORTED_SOURCE > CORRELATION_UNPROVEN >
SOURCE_INCOMPLETE > NO_EXECUTION_TRUTH_AVAILABLE > PARTIAL > PASS.

Diagnostics are deterministic and machine-readable: code, severity, rule id
and a source locator (one-based line and JSON Pointer into that line where
applicable). They never embed tracebacks, raw payload content or absolute
paths.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

# --- Frozen diagnostic codes (freeze section 7) ------------------------------

MISSING_PROVENANCE = "MISSING_PROVENANCE"
UNSUPPORTED_PROFILE = "UNSUPPORTED_PROFILE"
INVALID_SOURCE = "INVALID_SOURCE"
INCOMPLETE_SOURCE = "INCOMPLETE_SOURCE"
CORRELATION_CONFLICT = "CORRELATION_CONFLICT"
UNSUPPORTED_SCOPE = "UNSUPPORTED_SCOPE"
UNSUPPORTED_SERIALIZATION = "UNSUPPORTED_SERIALIZATION"
SOURCE_BINDING_FAILURE = "SOURCE_BINDING_FAILURE"
OPAQUE_SOURCE_EXCLUDED = "OPAQUE_SOURCE_EXCLUDED"

ALL_REFUSAL_CODES = frozenset(
    {
        MISSING_PROVENANCE,
        UNSUPPORTED_PROFILE,
        INVALID_SOURCE,
        INCOMPLETE_SOURCE,
        CORRELATION_CONFLICT,
        UNSUPPORTED_SCOPE,
        UNSUPPORTED_SERIALIZATION,
        SOURCE_BINDING_FAILURE,
    }
)

# --- Artifact result enum (pilot design section 13) ----------------------------

RESULT_PASS = "PASS"
RESULT_PARTIAL = "PARTIAL"
RESULT_UNSUPPORTED_SOURCE = "UNSUPPORTED_SOURCE"
RESULT_SOURCE_INCOMPLETE = "SOURCE_INCOMPLETE"
RESULT_CORRELATION_UNPROVEN = "CORRELATION_UNPROVEN"
RESULT_NO_EXECUTION_TRUTH = "NO_EXECUTION_TRUTH_AVAILABLE"
RESULT_VALIDATION_ERROR = "VALIDATION_ERROR"

ALL_RESULTS = frozenset(
    {
        RESULT_PASS,
        RESULT_PARTIAL,
        RESULT_UNSUPPORTED_SOURCE,
        RESULT_SOURCE_INCOMPLETE,
        RESULT_CORRELATION_UNPROVEN,
        RESULT_NO_EXECUTION_TRUTH,
        RESULT_VALIDATION_ERROR,
    }
)

# Refusal code -> artifact result. OPAQUE_SOURCE_EXCLUDED is not a refusal.
_CODE_RESULT = {
    MISSING_PROVENANCE: RESULT_UNSUPPORTED_SOURCE,
    UNSUPPORTED_PROFILE: RESULT_UNSUPPORTED_SOURCE,
    INVALID_SOURCE: RESULT_SOURCE_INCOMPLETE,
    INCOMPLETE_SOURCE: RESULT_SOURCE_INCOMPLETE,
    UNSUPPORTED_SERIALIZATION: RESULT_SOURCE_INCOMPLETE,
    CORRELATION_CONFLICT: RESULT_CORRELATION_UNPROVEN,
    UNSUPPORTED_SCOPE: RESULT_CORRELATION_UNPROVEN,
    SOURCE_BINDING_FAILURE: RESULT_VALIDATION_ERROR,
}

_RESULT_PRIORITY = (
    RESULT_VALIDATION_ERROR,
    RESULT_UNSUPPORTED_SOURCE,
    RESULT_CORRELATION_UNPROVEN,
    RESULT_SOURCE_INCOMPLETE,
    RESULT_NO_EXECUTION_TRUTH,
    RESULT_PARTIAL,
    RESULT_PASS,
)

SEVERITY_ERROR = "error"
SEVERITY_INFO = "info"


@dataclass(frozen=True)
class Diagnostic:
    """One deterministic, machine-readable refusal/exclusion record."""

    code: str
    severity: str
    rule_id: str
    line: Optional[int] = None  # one-based raw line, when applicable
    pointer: Optional[str] = None  # JSON Pointer into that line, when applicable
    detail: str = ""

    def to_json(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "code": self.code,
            "severity": self.severity,
            "rule_id": self.rule_id,
        }
        if self.line is not None:
            out["line"] = self.line
        if self.pointer is not None:
            out["pointer"] = self.pointer
        out["detail"] = self.detail
        return out

    def locator(self) -> str:
        parts = []
        if self.line is not None:
            parts.append(f"L{self.line}")
        if self.pointer is not None:
            parts.append(self.pointer)
        return "#".join(parts) if parts else "-"


def refusal(codes_present: List[str]) -> bool:
    return any(code in ALL_REFUSAL_CODES for code in codes_present)


def select_result(codes_present: List[str]) -> str:
    """Deterministically fold diagnostic codes into one artifact result."""
    if not refusal(codes_present):
        return RESULT_PASS
    results = {_CODE_RESULT[code] for code in codes_present if code in _CODE_RESULT}
    for candidate in _RESULT_PRIORITY:
        if candidate in results:
            return candidate
    return RESULT_VALIDATION_ERROR  # unreachable; fail closed anyway


def summarize(diagnostics: List[Diagnostic]) -> List[Dict[str, Any]]:
    """Deterministic artifact projection: code -> count/first locator, ordered."""
    order: List[Tuple[str, str]] = []
    counts: Dict[str, int] = {}
    first: Dict[str, Dict[str, Any]] = {}
    for d in diagnostics:
        if d.code not in counts:
            order.append((d.code, d.severity))
            first[d.code] = d.to_json()
        counts[d.code] = counts.get(d.code, 0) + 1
    return [
        {
            "code": code,
            "severity": severity,
            "count": counts[code],
            "first": {k: v for k, v in first[code].items() if k != "severity"},
        }
        for code, severity in order
    ]
