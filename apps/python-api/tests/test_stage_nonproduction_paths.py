"""Regression: scanner must downgrade findings in test/demo/docs paths.

Bug: @uriva/safescript@0.1.1 produced false positives:
  - critical eval() in site/src/app/page.tsx (demo website)
  - high fetch() in tests/deps_test.ts (test file)
  - high undeclared_network permission alert caused by the test/demo fetch() hits
  - critical Secret Keyword on tests/lang_test.ts line `privateKey: "key"`
"""

from pathlib import Path

from lib.scan.models import Finding, IngestResult, StageResult
from lib.scan.safe_patterns import (
    downgrade_severity_for_non_production,
    is_non_production_path,
)
from lib.scan.stage2_analyzers import analyze_js_file
from lib.scan.stage2_static import cross_check_permissions
from lib.scan.stage4_secrets import _is_example_path, run_custom_patterns, run_detect_secrets


def _write(tmp_path: Path, rel: str, content: str) -> str:
    target = tmp_path / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    return rel


class TestNonProductionPathDetection:
    def test_site_directory_is_non_production(self):
        assert is_non_production_path("site/src/app/page.tsx")
        assert is_non_production_path("website/index.tsx")

    def test_tests_directory_is_non_production(self):
        assert is_non_production_path("tests/deps_test.ts")
        assert is_non_production_path("test/foo.test.ts")
        assert is_non_production_path("__tests__/thing.spec.ts")
        assert is_non_production_path("src/module_test.ts")
        assert is_non_production_path("src/module.test.tsx")
        assert is_non_production_path("src/module.spec.jsx")

    def test_docs_directory_is_non_production(self):
        assert is_non_production_path("docs/getting-started.md")
        assert is_non_production_path("guide/intro.md")

    def test_runtime_source_is_production(self):
        assert not is_non_production_path("src/ops/io.ts")
        assert not is_non_production_path("src/lang/toTypescript.ts")
        assert not is_non_production_path("lib/index.js")

    def test_severity_downgrade_table(self):
        assert downgrade_severity_for_non_production("critical") == "low"
        assert downgrade_severity_for_non_production("high") == "info"
        assert downgrade_severity_for_non_production("medium") == "info"
        assert downgrade_severity_for_non_production("low") == "low"
        assert downgrade_severity_for_non_production("info") == "info"


class TestStage2JsNonProductionDowngrade:
    def test_fetch_in_test_file_downgraded_to_info(self, tmp_path: Path):
        name = _write(tmp_path, "tests/deps_test.ts", 'await fetch("https://api.example.com");\n')
        findings = analyze_js_file(str(tmp_path), name)
        fetch_findings = [f for f in findings if "fetch" in f.description]
        assert fetch_findings, "fetch() must still be detected"
        for f in fetch_findings:
            assert f.severity == "info", f"Expected info, got {f.severity} for {f.location}"

    def test_eval_in_site_file_downgraded_to_low(self, tmp_path: Path):
        name = _write(tmp_path, "site/src/app/page.tsx", 'const x = eval("1+1");\n')
        findings = analyze_js_file(str(tmp_path), name)
        eval_findings = [f for f in findings if "eval" in f.description]
        assert eval_findings, "eval() must still be detected"
        for f in eval_findings:
            assert f.severity == "low"

    def test_fetch_in_production_file_stays_high(self, tmp_path: Path):
        name = _write(tmp_path, "src/ops/io.ts", 'await fetch("https://api.example.com");\n')
        findings = analyze_js_file(str(tmp_path), name)
        fetch_findings = [f for f in findings if "fetch" in f.description]
        assert fetch_findings
        for f in fetch_findings:
            assert f.severity == "high", "production fetch must stay high"

    def test_eval_in_production_file_stays_critical(self, tmp_path: Path):
        name = _write(tmp_path, "src/lang/toTypescript.ts", "const x = eval(userInput);\n")
        findings = analyze_js_file(str(tmp_path), name)
        eval_findings = [f for f in findings if "eval" in f.description]
        assert eval_findings
        for f in eval_findings:
            assert f.severity == "critical"


class TestStage2PermissionCrossCheck:
    def _net_finding(self, severity: str) -> Finding:
        return Finding(
            stage="stage2",
            severity=severity,
            type="js_pattern",
            description="fetch() - network request",
            location="some/file.ts:1",
            confidence=0.8,
            tool="stage2_js_regex",
        )

    def test_info_network_findings_do_not_trigger_undeclared_network(self):
        findings = [self._net_finding("info"), self._net_finding("low")]
        result = cross_check_permissions(findings, permissions={}, manifest={})
        assert not any(f.type == "undeclared_network" for f in result)

    def test_high_network_finding_still_triggers_undeclared_network(self):
        findings = [self._net_finding("high")]
        result = cross_check_permissions(findings, permissions={}, manifest={})
        assert any(f.type == "undeclared_network" for f in result)

    def test_medium_network_finding_triggers_undeclared_network(self):
        findings = [self._net_finding("medium")]
        result = cross_check_permissions(findings, permissions={}, manifest={})
        assert any(f.type == "undeclared_network" for f in result)

    def test_declared_network_outbound_suppresses_finding(self):
        findings = [self._net_finding("high")]
        result = cross_check_permissions(
            findings,
            permissions={"network": {"outbound": ["*.example.com"]}},
            manifest={},
        )
        assert not any(f.type == "undeclared_network" for f in result)


class TestStage4TestPathExcluded:
    def test_example_path_pattern_includes_tests(self):
        assert _is_example_path("tests/lang_test.ts")
        assert _is_example_path("test/foo.ts")
        assert _is_example_path("__tests__/bar.ts")

    def test_example_path_pattern_includes_site(self):
        assert _is_example_path("site/src/app/page.tsx")
        assert _is_example_path("website/index.tsx")

    def test_custom_pattern_in_test_file_is_info(self, tmp_path: Path):
        name = _write(
            tmp_path,
            "tests/lang_test.ts",
            'const c = ed25519Sign({ data: b, privateKey: "SomeLongBase64EncodedStringThatLooksLikeASecretValueHere12345" });\n',
        )
        findings = run_custom_patterns(str(tmp_path), [name])
        for f in findings:
            assert f.severity == "info", f"Expected info in test path, got {f.severity}"


class TestStage4DetectSecretsPlaceholderFilter:
    def test_privateKey_literal_key_in_test_file_suppressed(self, tmp_path: Path):
        _write(
            tmp_path,
            "tests/lang_test.ts",
            'const c = ed25519Sign({ data: b, privateKey: "key" });\n',
        )
        findings = run_detect_secrets(str(tmp_path))
        critical = [f for f in findings if f.severity == "critical"]
        assert not critical, (
            f"Expected no critical detect-secrets findings for placeholder 'key', "
            f"got: {[(f.location, f.evidence) for f in critical]}"
        )

    def test_real_secret_in_production_file_still_reported(self, tmp_path: Path):
        _write(
            tmp_path,
            "src/config.ts",
            'const apiKey = "AKIAIOSFODNN7EXAMPLE";\nconst secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";\n',
        )
        findings = run_detect_secrets(str(tmp_path))
        assert findings, "real-looking secrets in production must still be reported"


def _make_ingest(tmp_path: Path, files: list[str]) -> IngestResult:
    return IngestResult(
        temp_dir=str(tmp_path),
        file_list=files,
        total_size=sum((tmp_path / f).stat().st_size for f in files),
        stage_result=StageResult(stage="stage0", status="passed", findings=[], duration_ms=0),
    )


class TestFullPipelineSafescriptScenario:
    def test_fetch_in_tests_does_not_trigger_undeclared_network(self, tmp_path: Path):
        files = [
            _write(
                tmp_path,
                "tests/deps_test.ts",
                'await fetch("https://registry.npmjs.org/_deps");\n',
            ),
        ]
        from lib.scan.stage2_static import stage2_analyze

        result, _ambiguous = stage2_analyze(
            _make_ingest(tmp_path, files),
            manifest={},
            permissions={},
        )
        undeclared = [f for f in result.findings if f.type == "undeclared_network"]
        assert not undeclared, (
            "A fetch() call that lives only in tests must not escalate to 'undeclared_network'. "
            f"Got: {[(f.severity, f.description) for f in undeclared]}"
        )

    def test_context_evaluator_does_not_reescalate_test_findings(self, tmp_path: Path):
        files = [
            _write(tmp_path, "tests/deps_test.ts", 'await fetch("https://x.com");\n'),
            _write(tmp_path, "src/prod.ts", 'await fetch("https://y.com");\n'),
        ]
        from lib.scan.stage2_static import stage2_analyze

        result, _ = stage2_analyze(
            _make_ingest(tmp_path, files),
            manifest={},
            permissions={},
        )
        test_findings = [f for f in result.findings if (f.location or "").startswith("tests/")]
        assert test_findings, "fetch() must still be detected in test files"
        assert all(f.severity == "info" for f in test_findings), (
            f"ContextEvaluator must not re-escalate test-file findings. "
            f"Got: {[(f.severity, f.location) for f in test_findings]}"
        )
        prod_findings = [f for f in result.findings if (f.location or "").startswith("src/")]
        assert prod_findings and all(f.severity == "high" for f in prod_findings), "Production fetch() must remain high"
