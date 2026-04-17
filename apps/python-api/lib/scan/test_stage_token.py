"""Tests for Stage T: Token Usage Analysis."""

import json
import subprocess
import tempfile
from unittest.mock import MagicMock, patch

from lib.scan.models import IngestResult, StageResult
from lib.scan.stage_token import stage_token_analyze


def make_ingest(tmpdir: str) -> IngestResult:
    """Helper to create an IngestResult for testing."""
    return IngestResult(
        temp_dir=tmpdir, file_hashes={}, file_list=[],
        total_size=0,
        stage_result=StageResult(stage="stage0", status="passed", findings=[], duration_ms=0)
    )


VALID_TOKENOMICS_JSON = {
    "one_liner": "Well-structured skill with no significant waste.",
    "grade": "A",
    "estimated_tokens": 8500,
    "comparison": "8,500 tokens — above average (avg is ~20,000 tokens)",
    "cost_per_use": {
        "sonnet_context_load": "~$0.18",
        "opus_context_load": "~$0.91",
        "token_count": 8500,
        "pricing_note": "Based on input pricing: $3/M (Sonnet), $15/M (Opus)."
    },
    "what_this_means": "This skill is expensive to load on every turn.",
    "findings": [
        {
            "rule": "prompt-size",
            "severity": "medium",
            "confidence": 0.9,
            "description": "Prompt file is ~4,200 tokens",
            "location": "SKILL.md",
            "remediation": "Trim to under 2000 tokens"
        }
    ],
    "summary": {
        "total_findings": 1,
        "estimated_tokens_per_invocation": 8500,
        "efficiency_score": 72
    }
}


def _mock_subprocess_run(analyze_stdout: str | None = None):
    """Create a side_effect for subprocess.run that handles --version and --analyze-skill."""
    def run_side_effect(cmd, **kwargs):
        mock = MagicMock()
        if "--version" in cmd:
            mock.stdout = "tokenomics v2.3.1\n"
            mock.stderr = ""
            mock.returncode = 0
        elif "--analyze-skill" in cmd:
            if analyze_stdout is None:
                mock.returncode = 1
                mock.stderr = "Unknown option"
                mock.stdout = ""
            else:
                mock.returncode = 0
                mock.stdout = analyze_stdout
                mock.stderr = ""
        else:
            mock.returncode = 0
            mock.stdout = ""
            mock.stderr = ""
        return mock
    return run_side_effect


class TestCLINotInstalled:
    """Scenario: tokenomics CLI not on PATH."""

    def test_skipped_gracefully(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value=None):
                result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "skipped"
        assert result.findings == []

    def test_duration_recorded(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value=None):
                result = stage_token_analyze(make_ingest(tmpdir))
        assert result.duration_ms >= 0


class TestVersionTooOld:
    """Scenario: tokenomics installed but version < 2.3.1."""

    def test_skipped_on_old_version(self):
        old_version_proc = MagicMock()
        old_version_proc.stdout = "tokenomics v2.2.2\n"
        old_version_proc.stderr = ""
        old_version_proc.returncode = 0

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run", return_value=old_version_proc):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "skipped"
        assert result.findings == []

    def test_skipped_on_v1(self):
        old_version_proc = MagicMock()
        old_version_proc.stdout = "tokenomics v1.3.2\n"
        old_version_proc.stderr = ""
        old_version_proc.returncode = 0

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run", return_value=old_version_proc):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.status == "skipped"


class TestVersionCheckFails:
    """Scenario: --version fails but --analyze-skill might still work."""

    def test_falls_through_when_version_check_errors(self):
        """If version check raises, stage should try --analyze-skill anyway."""
        def run_side_effect(cmd, **kwargs):
            mock = MagicMock()
            if "--version" in cmd:
                raise OSError("something broke")
            elif "--analyze-skill" in cmd:
                mock.returncode = 0
                mock.stdout = json.dumps(VALID_TOKENOMICS_JSON)
                mock.stderr = ""
            return mock

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run", side_effect=run_side_effect):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.status == "passed"
        assert len(result.findings) == 2


class TestNoTempDir:
    """Scenario: no temp directory in ingest result."""

    def test_skipped_when_no_temp_dir(self):
        ingest = make_ingest("")
        result = stage_token_analyze(ingest)
        assert result.stage == "stageT"
        assert result.status == "skipped"
        assert result.error == "No temp directory"


class TestValidJsonOutput:
    """Scenario: CLI returns valid analysis results."""

    def test_findings_converted(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run",
                           side_effect=_mock_subprocess_run(json.dumps(VALID_TOKENOMICS_JSON))):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "passed"
        assert len(result.findings) == 2  # 1 rule finding + 1 summary
        f = result.findings[0]
        assert f.type == "prompt-size"
        assert f.severity == "medium"
        assert f.tool == "token_analyzer"
        assert f.confidence == 0.9
        assert f.location == "SKILL.md"
        assert f.remediation == "Trim to under 2000 tokens"

    def test_summary_stored_as_evidence(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run",
                           side_effect=_mock_subprocess_run(json.dumps(VALID_TOKENOMICS_JSON))):
                    result = stage_token_analyze(make_ingest(tmpdir))
        summary_f = [f for f in result.findings if f.type == "token_summary"][0]
        assert summary_f.severity == "info"
        evidence = json.loads(summary_f.evidence)
        assert evidence["efficiency_score"] == 72
        assert evidence["estimated_tokens_per_invocation"] == 8500
        assert evidence["total_findings"] == 1
        assert evidence["grade"] == "A"
        assert evidence["cost_per_use"]["sonnet_context_load"] == "~$0.18"
        assert evidence["cost_per_use"]["opus_context_load"] == "~$0.91"

    def test_summary_description_format(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run",
                           side_effect=_mock_subprocess_run(json.dumps(VALID_TOKENOMICS_JSON))):
                    result = stage_token_analyze(make_ingest(tmpdir))
        summary_f = [f for f in result.findings if f.type == "token_summary"][0]
        assert "72/100" in summary_f.description
        assert "8,500 tokens per invocation" in summary_f.description


class TestEmptyFindings:
    """Scenario: valid JSON with empty findings array."""

    def test_passed_with_no_findings(self):
        empty_json = json.dumps({"findings": [], "summary": {}})
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run",
                           side_effect=_mock_subprocess_run(empty_json)):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "passed"
        assert result.findings == []


class TestMalformedJson:
    """Scenario: CLI returns invalid JSON."""

    def test_errored_gracefully(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run",
                           side_effect=_mock_subprocess_run("not valid json {{{")):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "errored"
        assert "Invalid JSON" in result.error
        assert result.findings == []


class TestTimeout:
    """Scenario: CLI exceeds timeout."""

    def test_timeout_on_analyze_handled(self):
        """Timeout on --analyze-skill returns errored."""
        def run_side_effect(cmd, **kwargs):
            if "--version" in cmd:
                mock = MagicMock()
                mock.stdout = "tokenomics v2.3.1\n"
                mock.stderr = ""
                mock.returncode = 0
                return mock
            raise subprocess.TimeoutExpired("tokenomics", 10)

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run", side_effect=run_side_effect):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "errored"
        assert "timed out" in result.error
        assert result.findings == []


class TestNonZeroExit:
    """Scenario: CLI exits with error code."""

    def test_nonzero_exit_handled(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run",
                           side_effect=_mock_subprocess_run(None)):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "errored"
        assert "code 1" in result.error
        assert result.findings == []


class TestInvalidSeverity:
    """Scenario: CLI returns severity not in allowed list."""

    def test_invalid_severity_clamped_to_info(self):
        bad_severity_json = json.dumps({
            "findings": [{"rule": "test", "severity": "extreme", "description": "bad sev"}],
            "summary": {}
        })
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run",
                           side_effect=_mock_subprocess_run(bad_severity_json)):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.findings[0].severity == "info"


class TestGenericException:
    """Scenario: subprocess.run raises a generic exception."""

    def test_generic_exception_handled(self):
        def run_side_effect(cmd, **kwargs):
            if "--version" in cmd:
                mock = MagicMock()
                mock.stdout = "tokenomics v2.3.1\n"
                mock.stderr = ""
                mock.returncode = 0
                return mock
            raise OSError("permission denied")

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("lib.scan.stage_token.shutil.which", return_value="/usr/bin/tokenomics"):
                with patch("lib.scan.stage_token.subprocess.run", side_effect=run_side_effect):
                    result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "errored"
        assert "tokenomics CLI failed" in result.error
        assert result.findings == []
