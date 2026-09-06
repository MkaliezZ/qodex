"""Offline DSH observer → Evidence v0.2 projection proof (MVP).

Pinned profile: dsh-observer-v0.1. Read-only bundle in, validated Evidence
v0.2 documents + diagnostics + lineage out. Not a runtime, adapter
framework, or SDK.
"""

from .projector import ProjectionError, ProjectionResult, project_bundle
from . import profile

__all__ = [
    "ProjectionError",
    "ProjectionResult",
    "project_bundle",
    "profile",
]
