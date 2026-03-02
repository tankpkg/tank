"""Tests for Snyk Agent Scan integration."""

import json
import subprocess

import pytest
from unittest.mock import patch, MagicMock

from lib.scan.snyk_scanner import (
    run_snyk_scanner,
    is_snyk_scanner_available,
    SNYK_TO_TANK_SEVERITY,
    CRITICAL_THREAT_TYPES,
)


class TestSnykScannerAvailable:
    """Test availability check."""

    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_available_when_uvx_installed(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="uvx 0.5.0")
        assert is_snyk_scanner_available() is True

    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_not_available_when_uvx_missing(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        assert is_snyk_scanner_available() is False

    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_not_available_on_timeout(self, mock_run):
        mock_run.side_effect = subprocess.TimeoutExpired()
        assert is_snyk_scanner_available() is False


class TestSnykToTankSeverity:
    """Test severity mapping."""

    def test_severity_mapping(self):
        assert SNYK_TO_TANK_SEVERITY["critical"] == "critical"
        assert SNYK_TO_TANK_SEVERITY["high"] == "high"
        assert SNYK_TO_TANK_SEVERITY["medium"] == "medium"
        assert SNYK_TO_TANK_SEVERITY["low"] == "low"
        assert SNYK_TO_TANK_SEVERITY["info"] == "low"

    def test_critical_threat_types(self):
        assert "prompt_injection" in CRITICAL_THREAT_TYPES
        assert "tool_poisoning" in CRITICAL_THREAT_TYPES
        assert "data_exfiltration" in CRITICAL_THREAT_TYPES
        assert "backdoor" in CRITICAL_THREAT_TYPES


class TestRunSnykScanner:
    """Test the main scanner function."""

    @patch('lib.scan.snyk_scanner.is_snyk_scanner_available')
    def test_returns_empty_when_uvx_not_available(self, mock_available):
        mock_available.return_value = False
        findings = run_snyk_scanner("/tmp/skill")
        assert findings == []

    @patch('lib.scan.snyk_scanner.is_snyk_scanner_available')
    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_returns_empty_on_no_output(self, mock_available, mock_run):
        mock_available.return_value = True
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="",
            stderr="",
        )
        findings = run_snyk_scanner("/tmp/skill")
        assert findings == []

    @patch('lib.scan.snyk_scanner.is_snyk_scanner_available')
    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_parses_findings_correctly(self, mock_available, mock_run):
        mock_available.return_value = True
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps({
                "findings": [
                    {
                        "type": "prompt_injection",
                        "severity": "high",
                        "description": "Detected prompt injection pattern",
                        "location": "skill.md:42",
                        "confidence": 0.9,
                        "evidence": "Ignore all previous instructions"
                    }
                ]
            }),
            stderr="",
        )
        findings = run_snyk_scanner("/tmp/skill")

        assert len(findings) == 1
        finding = findings[0]
        assert finding.stage == "stage3"
        assert finding.severity == "high"
        assert finding.type == "snyk/prompt_injection"
        assert finding.description == "Detected prompt injection pattern"
        assert finding.location == "skill.md:42"
        assert finding.confidence == 0.9  # Boosted for critical threat
        assert finding.tool == "snyk-agent-scan"

    @patch('lib.scan.snyk_scanner.is_snyk_scanner_available')
    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_handles_timeout(self, mock_available, mock_run):
        mock_available.return_value = True
        mock_run.side_effect = subprocess.TimeoutExpired()
        findings = run_snyk_scanner("/tmp/skill")
        assert findings == []

    @patch('lib.scan.snyk_scanner.is_snyk_scanner_available')
    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_handles_json_error(self, mock_available, mock_run):
        mock_available.return_value = True
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="not valid json",
            stderr="",
        )
        findings = run_snyk_scanner("/tmp/skill")
        assert findings == []

    @patch('lib.scan.snyk_scanner.is_snyk_scanner_available')
    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_handles_alternative_format(self, mock_available, mock_run):
        """Test handling of 'results' key instead of 'findings'."""
        mock_available.return_value = True
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps({
                "results": [
                    {
                        "type": "tool_poisoning",
                        "severity": "critical",
                        "description": "Tool poisoning detected",
                        "location": "manifest.json:10",
                        "confidence": 0.95
                    }
                ]
            }),
            stderr="",
        )
        findings = run_snyk_scanner("/tmp/sskill")

        assert len(findings) == 1
        assert findings[0].type == "snyk/tool_poisoning"
        assert findings[0].severity == "critical"

    @patch('lib.scan.snyk_scanner.is_snyk_scanner_available')
    @patch('lib.scan.snyk_scanner.subprocess.run')
    def test_boosts_confidence_for_critical_threats(self, mock_available, mock_run):
        """Test that confidence is boosted for critical threat types."""
        mock_available.return_value = True
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps({
                "findings": [
                    {
                        "type": "prompt_injection",
                        "severity": "high",
                        "description": "Prompt injection",
                        "location": "skill.md:1",
                        "confidence": 0.5,  # Low confidence but should be boosted
                    }
                ]
            }),
            stderr="",
        )
        findings = run_snyk_scanner("/tmp/skill")
        assert findings[0].confidence == 0.85  # Boosted to 0.85
