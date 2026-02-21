"""Tests for security scanning using the test skill corpus.

This test suite validates that the scanner correctly detects malicious patterns
in the test_skills/ directory while not producing false positives on benign skills.

Run with: pytest tests/test_skills/test_skill_corpus.py -v
"""

import pytest
from pathlib import Path
from typing import List, Dict, Any

from lib.scan.models import Finding
from lib.scan.stage2_static import stage2_analyze
from lib.scan.stage3_injection import stage3_detect_injection
from lib.scan.stage4_secrets import stage4_scan_secrets
from lib.scan.dedup import deduplicate_findings


TEST_SKILLS_DIR = Path(__file__).parent


class IngestResult:
    """Mock ingest result for testing."""
    def __init__(self, temp_dir: str):
        self.temp_dir = temp_dir
        self.file_list = self._get_file_list()

    def _get_file_list(self) -> List[str]:
        """Get relative file paths in the directory."""
        files = []
        for f in Path(self.temp_dir).rglob("*"):
            if f.is_file():
                files.append(str(f.relative_to(self.temp_dir)))
        return files


def get_findings_for_skill(skill_dir: str) -> Dict[str, List[Finding]]:
    """Run all applicable stages on a skill and return findings by stage."""
    ingest = IngestResult(skill_dir)
    findings = {}

    # Stage 2: Static Analysis
    result = stage2_analyze(ingest, {}, {})
    findings["stage2"] = result.findings

    # Stage 3: Injection Detection
    result = stage3_detect_injection(ingest)
    findings["stage3"] = result.findings

    # Stage 4: Secrets
    result = stage4_scan_secrets(ingest)
    findings["stage4"] = result.findings

    return findings


def has_critical_or_high(findings: List[Finding]) -> bool:
    """Check if any finding is critical or high severity."""
    return any(f.severity in ("critical", "high") for f in findings)


# ============================================================================
# MALICIOUS SKILL TESTS - Should produce critical/high findings
# ============================================================================

class TestMaliciousSkills:
    """Tests for skills that should be flagged as malicious."""

    def test_exfiltration_singlefile(self):
        """Should detect SSH key exfiltration in single file."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "exfiltration_singlefile"
        findings = get_findings_for_skill(str(skill_dir))

        all_findings = findings["stage2"] + findings["stage3"]
        assert has_critical_or_high(all_findings), \
            f"Expected critical/high finding for SSH key exfiltration, got: {all_findings}"

    def test_injection_direct(self):
        """Should detect direct prompt injection patterns."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "injection_direct"
        findings = get_findings_for_skill(str(skill_dir))

        # Stage 3 should catch prompt injection
        assert has_critical_or_high(findings["stage3"]), \
            f"Expected critical/high finding for direct prompt injection, got: {findings['stage3']}"

    def test_injection_xml_tags(self):
        """Should detect XML tag injection patterns."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "injection_xml_tags"
        findings = get_findings_for_skill(str(skill_dir))

        # Stage 3 should catch XML tag injection
        assert has_critical_or_high(findings["stage3"]), \
            f"Expected critical/high finding for XML tag injection, got: {findings['stage3']}"

    def test_obfuscated_base64_exec(self):
        """Should detect base64 + exec obfuscation."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "obfuscated_base64_exec"
        findings = get_findings_for_skill(str(skill_dir))

        assert has_critical_or_high(findings["stage2"]), \
            f"Expected critical/high finding for base64+exec, got: {findings['stage2']}"

    def test_obfuscated_charcode(self):
        """Should detect character concatenation + exec."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "obfuscated_charcode"
        findings = get_findings_for_skill(str(skill_dir))

        assert has_critical_or_high(findings["stage2"]), \
            f"Expected critical/high finding for char concat, got: {findings['stage2']}"

    def test_obfuscated_hex(self):
        """Should detect hex decode + exec."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "obfuscated_hex"
        findings = get_findings_for_skill(str(skill_dir))

        assert has_critical_or_high(findings["stage2"]), \
            f"Expected critical/high finding for hex+exec, got: {findings['stage2']}"

    def test_shell_injection(self):
        """Should detect shell injection patterns."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "shell_injection"
        findings = get_findings_for_skill(str(skill_dir))

        # Multiple tools should detect this
        assert has_critical_or_high(findings["stage2"]), \
            f"Expected critical/high finding for shell injection, got: {findings['stage2']}"

    def test_secrets_hardcoded(self):
        """Should detect hardcoded credentials."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "secrets_hardcoded"
        findings = get_findings_for_skill(str(skill_dir))

        assert has_critical_or_high(findings["stage4"]), \
            f"Expected critical/high finding for hardcoded secrets, got: {findings['stage4']}"

    def test_env_harvesting(self):
        """Should detect environment variable harvesting."""
        skill_dir = TEST_SKILLS_DIR / "malicious" / "env_harvesting"
        findings = get_findings_for_skill(str(skill_dir))

        all_findings = findings["stage2"] + findings["stage3"]
        assert has_critical_or_high(all_findings), \
            f"Expected critical/high finding for env harvesting, got: {all_findings}"


# ============================================================================
# BENIGN SKILL TESTS - Should NOT produce critical/high findings
# ============================================================================

class TestBenignSkills:
    """Tests for skills that should pass security checks."""

    def test_simple_tool(self):
        """Should NOT flag simple safe tool."""
        skill_dir = TEST_SKILLS_DIR / "benign" / "simple_tool"
        findings = get_findings_for_skill(str(skill_dir))

        all_findings = findings["stage2"] + findings["stage3"] + findings["stage4"]
        assert not has_critical_or_high(all_findings), \
            f"Unexpected critical/high finding for simple tool: {all_findings}"

    def test_file_operations(self):
        """Should NOT flag file operations within own directory."""
        skill_dir = TEST_SKILLS_DIR / "benign" / "file_operations"
        findings = get_findings_for_skill(str(skill_dir))

        all_findings = findings["stage2"] + findings["stage3"] + findings["stage4"]
        assert not has_critical_or_high(all_findings), \
            f"Unexpected critical/high finding for file operations: {all_findings}"

    def test_complex_but_safe(self):
        """Should NOT flag complex multi-file skill with no issues."""
        skill_dir = TEST_SKILLS_DIR / "benign" / "complex_but_safe"
        findings = get_findings_for_skill(str(skill_dir))

        all_findings = findings["stage2"] + findings["stage3"] + findings["stage4"]
        assert not has_critical_or_high(all_findings), \
            f"Unexpected critical/high finding for complex safe skill: {all_findings}"

    def test_env_config_read(self):
        """Should NOT flag reading specific named env vars (low/medium ok)."""
        skill_dir = TEST_SKILLS_DIR / "benign" / "env_config_read"
        findings = get_findings_for_skill(str(skill_dir))

        all_findings = findings["stage2"] + findings["stage3"] + findings["stage4"]
        # This might have LOW findings, but should not have critical/high
        assert not has_critical_or_high(all_findings), \
            f"Unexpected critical/high finding for config env read: {all_findings}"


# ============================================================================
# DEDUPLICATION TESTS
# ============================================================================

class TestDeduplication:
    """Tests for finding deduplication functionality."""

    def test_duplicate_merging(self):
        """Should merge duplicate findings and boost confidence."""
        findings = [
            {
                "stage": "stage2",
                "severity": "critical",
                "type": "shell_injection",
                "description": "Shell injection detected",
                "location": "skill.py:10",
                "confidence": 0.8,
                "tool": "semgrep",
            },
            {
                "stage": "stage2",
                "severity": "high",
                "type": "shell_injection",
                "description": "Use of os.system",
                "location": "skill.py:10",
                "confidence": 0.9,
                "tool": "bandit",
            },
        ]

        deduped = deduplicate_findings(findings)

        assert len(deduped) == 1, "Should merge duplicates into one finding"
        assert deduped[0]["corroborated"] == True, "Should mark as corroborated"
        assert deduped[0]["corroboration_count"] == 2, "Should show 2 tools"
        assert deduped[0]["confidence"] >= 0.9, "Confidence should be boosted"

    def test_different_locations_not_merged(self):
        """Should NOT merge findings at different locations."""
        findings = [
            {
                "stage": "stage2",
                "severity": "critical",
                "type": "shell_injection",
                "description": "Shell injection detected",
                "location": "skill.py:10",
                "confidence": 0.8,
                "tool": "semgrep",
            },
            {
                "stage": "stage2",
                "severity": "critical",
                "type": "shell_injection",
                "description": "Shell injection detected",
                "location": "skill.py:50",
                "confidence": 0.8,
                "tool": "semgrep",
            },
        ]

        deduped = deduplicate_findings(findings)

        assert len(deduped) == 2, "Should keep separate findings at different locations"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
