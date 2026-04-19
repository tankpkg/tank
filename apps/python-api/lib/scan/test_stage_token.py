"""Tests for Stage T: Token Usage Analysis (Pure Python)."""

import json
import os
import tempfile

from lib.scan.models import IngestResult, StageResult
from lib.scan.stage_token import (
    _calculate_efficiency_score,
    _calculate_grade,
    _estimate_tokens,
    _generate_one_liner,
    stage_token_analyze,
)


def make_ingest(tmpdir: str) -> IngestResult:
    return IngestResult(
        temp_dir=tmpdir,
        file_hashes={},
        file_list=[],
        total_size=0,
        stage_result=StageResult(stage="stage0", status="passed", findings=[], duration_ms=0),
    )


class TestNoTempDir:
    def test_skipped_when_no_temp_dir(self):
        ingest = make_ingest("")
        result = stage_token_analyze(ingest)
        assert result.stage == "stageT"
        assert result.status == "skipped"
        assert result.error == "No temp directory"

    def test_skipped_when_temp_dir_does_not_exist(self):
        ingest = make_ingest("/nonexistent/path/that/does/not/exist")
        result = stage_token_analyze(ingest)
        assert result.stage == "stageT"
        assert result.status == "skipped"
        assert result.error == "Temp directory does not exist"
        assert result.duration_ms >= 0


class TestEmptyDirectory:
    def test_passed_with_only_summary(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "passed"
        rule_findings = [f for f in result.findings if f.type != "token_summary"]
        assert rule_findings == []
        summary_findings = [f for f in result.findings if f.type == "token_summary"]
        assert len(summary_findings) == 1
        evidence = json.loads(summary_findings[0].evidence)
        assert evidence["estimated_tokens_per_invocation"] == 0
        assert evidence["total_findings"] == 0

    def test_duration_recorded(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            result = stage_token_analyze(make_ingest(tmpdir))
        assert result.duration_ms >= 0


class TestNoSkillFiles:
    def test_directory_with_only_non_skill_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "README.txt"), "w") as f:
                f.write("not a skill file")
            with open(os.path.join(tmpdir, "data.csv"), "w") as f:
                f.write("a,b,c")
            result = stage_token_analyze(make_ingest(tmpdir))
        assert result.status == "passed"
        rule_findings = [f for f in result.findings if f.type != "token_summary"]
        assert rule_findings == []


class TestPromptSizeRule:
    def test_large_skill_md_produces_finding(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            content = "x" * 20000
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write(content)
            result = stage_token_analyze(make_ingest(tmpdir))
        assert result.status == "passed"
        prompt_findings = [f for f in result.findings if f.type == "prompt-size"]
        assert len(prompt_findings) >= 1
        assert prompt_findings[0].severity == "high"
        assert prompt_findings[0].location == "SKILL.md"
        assert prompt_findings[0].tool == "token_analyzer"

    def test_medium_skill_md_produces_medium_finding(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            content = "x" * 9000
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write(content)
            result = stage_token_analyze(make_ingest(tmpdir))
        prompt_findings = [f for f in result.findings if f.type == "prompt-size"]
        assert len(prompt_findings) >= 1
        assert prompt_findings[0].severity == "medium"

    def test_small_skill_md_no_prompt_size_finding(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            content = "Small content"
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write(content)
            result = stage_token_analyze(make_ingest(tmpdir))
        prompt_findings = [f for f in result.findings if f.type == "prompt-size"]
        assert len(prompt_findings) == 0

    def test_atom_md_file_detected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            content = "x" * 20000
            with open(os.path.join(tmpdir, "myskill.atom.md"), "w") as f:
                f.write(content)
            result = stage_token_analyze(make_ingest(tmpdir))
        prompt_findings = [f for f in result.findings if f.type == "prompt-size"]
        assert len(prompt_findings) >= 1


class TestSummaryFinding:
    def test_summary_finding_present(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write("# Hello\nSome content here")
            result = stage_token_analyze(make_ingest(tmpdir))
        summary_findings = [f for f in result.findings if f.type == "token_summary"]
        assert len(summary_findings) == 1
        summary_f = summary_findings[0]
        assert summary_f.severity == "info"
        assert summary_f.confidence == 1.0
        assert summary_f.tool == "token_analyzer"
        evidence = json.loads(summary_f.evidence)
        assert "grade" in evidence
        assert "efficiency_score" in evidence
        assert "estimated_tokens_per_invocation" in evidence
        assert "estimated_tokens" in evidence
        assert "cost_per_use" in evidence
        assert "total_findings" in evidence

    def test_summary_evidence_cost_per_use_shape(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write("# Hello\nSome content here")
            result = stage_token_analyze(make_ingest(tmpdir))
        summary_f = [f for f in result.findings if f.type == "token_summary"][0]
        evidence = json.loads(summary_f.evidence)
        cost = evidence["cost_per_use"]
        assert "sonnet_context_load" in cost
        assert "opus_context_load" in cost
        assert "token_count" in cost
        assert "pricing_note" in cost

    def test_summary_description_format(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write("x" * 4000)
            result = stage_token_analyze(make_ingest(tmpdir))
        summary_f = [f for f in result.findings if f.type == "token_summary"][0]
        assert "/100" in summary_f.description
        assert "tokens per invocation" in summary_f.description


class TestGradeCalculation:
    def test_grade_a(self):
        assert _calculate_grade(85) == "A"
        assert _calculate_grade(100) == "A"

    def test_grade_b(self):
        assert _calculate_grade(65) == "B"
        assert _calculate_grade(84) == "B"

    def test_grade_c(self):
        assert _calculate_grade(40) == "C"
        assert _calculate_grade(64) == "C"

    def test_grade_d(self):
        assert _calculate_grade(39) == "D"
        assert _calculate_grade(0) == "D"


class TestEfficiencyScore:
    def test_perfect_score_no_findings(self):
        assert _calculate_efficiency_score([], 5000) == 100

    def test_high_severity_deducts_15(self):
        findings = [{"severity": "high"}]
        assert _calculate_efficiency_score(findings, 5000) == 85

    def test_medium_severity_deducts_8(self):
        findings = [{"severity": "medium"}]
        assert _calculate_efficiency_score(findings, 5000) == 92

    def test_low_severity_deducts_3(self):
        findings = [{"severity": "low"}]
        assert _calculate_efficiency_score(findings, 5000) == 97

    def test_info_severity_deducts_1(self):
        findings = [{"severity": "info"}]
        assert _calculate_efficiency_score(findings, 5000) == 99

    def test_small_skill_bonus(self):
        assert _calculate_efficiency_score([], 500) == 100

    def test_score_clamped_to_0(self):
        findings = [{"severity": "high"}] * 10
        assert _calculate_efficiency_score(findings, 5000) == 0

    def test_multiple_findings_cumulative(self):
        findings = [{"severity": "high"}, {"severity": "medium"}, {"severity": "low"}]
        assert _calculate_efficiency_score(findings, 5000) == 100 - 15 - 8 - 3


class TestOneLiner:
    def test_lean_a(self):
        assert "Lean" in _generate_one_liner("A", 3000, 0)

    def test_a_with_large_tokens(self):
        assert "Well-structured" in _generate_one_liner("A", 10000, 0)

    def test_d_grade(self):
        assert "Bloated" in _generate_one_liner("D", 50000, 10)


class TestEstimateTokens:
    def test_basic_estimation(self):
        files = {"a.md": "x" * 400}
        assert _estimate_tokens(files) == 100

    def test_multiple_files(self):
        files = {"a.md": "x" * 400, "b.md": "y" * 400}
        assert _estimate_tokens(files) == 200


class TestLargeFilesRule:
    def test_file_over_500_lines_detected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            content = "\n".join([f"line {i}" for i in range(600)])
            with open(os.path.join(tmpdir, "big.md"), "w") as f:
                f.write(content)
            result = stage_token_analyze(make_ingest(tmpdir))
        large_findings = [f for f in result.findings if f.type == "large-files"]
        assert len(large_findings) == 1
        assert large_findings[0].severity == "low"

    def test_file_over_1000_lines_medium(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            content = "\n".join([f"line {i}" for i in range(1100)])
            with open(os.path.join(tmpdir, "huge.md"), "w") as f:
                f.write(content)
            result = stage_token_analyze(make_ingest(tmpdir))
        large_findings = [f for f in result.findings if f.type == "large-files"]
        assert len(large_findings) == 1
        assert large_findings[0].severity == "medium"


class TestToolOverheadRule:
    def test_many_tools_detected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest = {"tools": {f"tool_{i}": {} for i in range(20)}}
            with open(os.path.join(tmpdir, "tank.json"), "w") as f:
                json.dump(manifest, f)
            result = stage_token_analyze(make_ingest(tmpdir))
        tool_findings = [f for f in result.findings if f.type == "tool-overhead"]
        assert len(tool_findings) == 1
        assert tool_findings[0].severity == "high"


class TestInvalidSeverity:
    def test_invalid_severity_not_produced(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write("x" * 20000)
            result = stage_token_analyze(make_ingest(tmpdir))
        for f in result.findings:
            assert f.severity in ("critical", "high", "medium", "low", "info")


class TestNodeModulesSkipped:
    def test_node_modules_ignored(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            nm_dir = os.path.join(tmpdir, "node_modules", "some_pkg")
            os.makedirs(nm_dir)
            with open(os.path.join(nm_dir, "big.md"), "w") as f:
                f.write("x" * 100000)
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write("Small content")
            result = stage_token_analyze(make_ingest(tmpdir))
        large_findings = [f for f in result.findings if f.type == "large-files"]
        assert len(large_findings) == 0


class TestFindingInterface:
    def test_finding_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "SKILL.md"), "w") as f:
                f.write("x" * 20000)
            result = stage_token_analyze(make_ingest(tmpdir))
        assert result.stage == "stageT"
        assert result.status == "passed"
        assert len(result.findings) >= 1
        f = result.findings[0]
        assert f.stage == "stageT"
        assert f.tool == "token_analyzer"
        assert f.type is not None
        assert f.description is not None
        assert f.severity in ("critical", "high", "medium", "low", "info")
