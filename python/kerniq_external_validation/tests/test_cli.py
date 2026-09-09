"""CLI behavior tests: exit codes, output paths, usage errors."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from kerniq_external_validation.cli import (
    EXIT_OK,
    EXIT_REFUSED,
    EXIT_USAGE,
    EXIT_VALIDATION_ERROR,
    main,
)
from kerniq_external_validation.tests.helpers import valid_provenance, write_source


def test_validate_pass_exit_zero(tmp_path, capsys):
    src = write_source(tmp_path / "src")
    out = tmp_path / "result.json"
    assert main(["validate", "--source", str(src), "--output", str(out)]) == EXIT_OK
    captured = capsys.readouterr().out
    assert "result: PASS" in captured
    assert out.is_file()


def test_validate_refused_exit_two(tmp_path, capsys):
    provenance = valid_provenance()
    provenance["producer"]["langchain"] = "1.5.0"
    src = write_source(tmp_path / "src", provenance=provenance)
    out = tmp_path / "result.json"
    assert main(["validate", "--source", str(src), "--output", str(out)]) == EXIT_REFUSED
    assert "result: UNSUPPORTED_SOURCE" in capsys.readouterr().out
    # refusal still writes a deterministic artifact with diagnostics
    artifact = json.loads(out.read_text("utf-8"))
    assert artifact["result"] == "UNSUPPORTED_SOURCE"
    assert artifact["claims_proven"] == []


def test_validate_unusable_source_path_exit_three(tmp_path, capsys):
    rc = main(["validate", "--source", str(tmp_path / "nope"), "--output", str(tmp_path / "r.json")])
    assert rc == EXIT_VALIDATION_ERROR


def test_validate_remote_url_source_exit_three(tmp_path):
    rc = main(["validate", "--source", "https://example.com/x", "--output", str(tmp_path / "r.json")])
    assert rc == EXIT_VALIDATION_ERROR


def test_verify_exit_codes(tmp_path, capsys):
    src = write_source(tmp_path / "src")
    out = tmp_path / "result.json"
    main(["validate", "--source", str(src), "--output", str(out)])
    assert main(["verify", "--artifact", str(out), "--source", str(src)]) == EXIT_OK
    assert "verify: VERIFIED" in capsys.readouterr().out
    from kerniq_external_validation.tests.helpers import valid_events

    different = write_source(tmp_path / "different", events=valid_events(include_opaque_carrier=False))
    rc = main(["verify", "--artifact", str(out), "--source", str(different)])
    assert rc == EXIT_REFUSED


def test_missing_arguments_usage_error(capsys):
    with pytest.raises(SystemExit) as excinfo:
        main(["validate", "--source", "x"])
    assert excinfo.value.code not in (0, EXIT_REFUSED, EXIT_VALIDATION_ERROR)


def test_python_dash_m_entrypoint_runs(tmp_path):
    import subprocess
    import sys

    src = write_source(tmp_path / "src")
    out = tmp_path / "result.json"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "kerniq_external_validation",
            "validate",
            "--source",
            str(src),
            "--output",
            str(out),
        ],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[2]),
    )
    assert proc.returncode == 0, proc.stderr
    assert "result: PASS" in proc.stdout
