"""Admission pins for the reviewed local Python execution path."""
import hashlib
import importlib.metadata
from pathlib import Path

from kerniq_agentfuse_bridge.service import CanonicalAgentFuse

MAF_VERSION = "1.17.0"
MAF_REF = "4507512f95effaae4518d658e86e9afc0ccb4514"
AGENTFUSE_REF = "ec4b5842339dccfba0db62df7541920759203bc9"
PROFILE = "maf-python-local-function-governed-v0.8"
MAF_HASHES = {
    "_tools.py": "9c046818b1ad137ba20ca8005c407712f01b863da1700f1d9f98084219484f1f",
    "_middleware.py": "92badb9dd4235920311bd35098babb9f209c0b22a349bbdf8b4f41f070fc624b",
    "_agents.py": "455ee0747f8e133ae57c8969f61d72a658eac5ec899ad58b6cc178e650062fd7",
    "_sessions.py": "f5954f9651b2089b82886e506aadc4414a3690d78a803b4fa5ebba8f0e3c3ce6",
}
AGENTFUSE_HASHES = {
    "dhms_agentfuse/runtime_guard.py": "c533a481ae0693809b3d7a5a37926a08ede57d04c49c8dc84b608af7130634eb",
    "dhms_agentfuse/evidence_schema.py": "bfe65fef8d70287d7e7c52759630c1192dfd9d450d0ea43cbc5ffbff2b63de6e",
    "pyproject.toml": "800eab449836f54b07f4e2572d55ec3f3955d2e4d36ffa0b9afcb456baee1767",
}


def verify_files(root: Path, hashes: dict[str, str]) -> None:
    for name, expected in hashes.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError("unqualified_source:" + name)


def qualify_framework() -> None:
    import agent_framework
    for package, version in {
        "agent-framework-core": MAF_VERSION,
        "agent-framework-openai": "1.14.2",
        "openai": "3.11.0",
        "pydantic": "2.13.5",
    }.items():
        if importlib.metadata.version(package) != version:
            raise ValueError("unqualified_package:" + package)
    verify_files(Path(agent_framework.__file__).parent, MAF_HASHES)


def load_agentfuse(source: Path) -> CanonicalAgentFuse:
    # The existing loader checks the package/API; these hashes additionally bind
    # its source bytes, because expected_commit alone is only a caller assertion.
    verify_files(source, AGENTFUSE_HASHES)
    return CanonicalAgentFuse.load(source, AGENTFUSE_REF)
