"""Regression: lock files contain public integrity hashes, not secrets.

Bug: Stage 4 reported 800+ critical Base64HighEntropyString findings for
package-lock.json and high-entropy findings for deno.lock. Lock files are
dependency pins with public SHA-256/512 integrity hashes and must be skipped.
"""

from pathlib import Path

from lib.scan.models import IngestResult, StageResult
from lib.scan.stage4_secrets import (
    LOCK_FILE_BASENAMES,
    _is_lock_file,
    run_custom_patterns,
    stage4_scan_secrets,
)


def _make_ingest(tmp_path: Path, files: list[str]) -> IngestResult:
    return IngestResult(
        temp_dir=str(tmp_path),
        file_list=files,
        total_size=sum((tmp_path / f).stat().st_size for f in files),
        stage_result=StageResult(stage="stage0", status="passed", findings=[], duration_ms=0),
    )


PACKAGE_LOCK_SAMPLE = """{
  "name": "sample",
  "lockfileVersion": 3,
  "packages": {
    "node_modules/foo": {
      "version": "1.2.3",
      "resolved": "https://registry.npmjs.org/foo/-/foo-1.2.3.tgz",
      "integrity": "sha512-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYz=="
    }
  }
}
"""

DENO_LOCK_SAMPLE = """{
  "version": "4",
  "specifiers": {
    "jsr:@std/assert": "1.0.0"
  },
  "jsr": {
    "@std/assert@1.0.0": {
      "integrity": "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789AbCdEfGhIjKlMnOpQrStUvWxYz"
    }
  }
}
"""


def _write(tmp_path: Path, name: str, content: str) -> str:
    (tmp_path / name).write_text(content)
    return name


class TestLockFileIdentification:
    def test_package_lock_json_recognized(self):
        assert _is_lock_file("package-lock.json")
        assert _is_lock_file("site/package-lock.json")

    def test_deno_lock_recognized(self):
        assert _is_lock_file("deno.lock")
        assert _is_lock_file("some/nested/deno.lock")

    def test_common_ecosystem_lockfiles_recognized(self):
        for name in [
            "yarn.lock",
            "pnpm-lock.yaml",
            "bun.lock",
            "bun.lockb",
            "Cargo.lock",
            "poetry.lock",
            "uv.lock",
            "go.sum",
            "composer.lock",
            "Gemfile.lock",
            "Pipfile.lock",
        ]:
            assert _is_lock_file(name), name
            assert name in LOCK_FILE_BASENAMES, name

    def test_non_lockfile_not_recognized(self):
        assert not _is_lock_file("package.json")
        assert not _is_lock_file("src/lock.ts")
        assert not _is_lock_file("my-lock.txt")


class TestCustomPatternsSkipLockFiles:
    def test_package_lock_json_yields_no_findings(self, tmp_path: Path):
        name = _write(tmp_path, "package-lock.json", PACKAGE_LOCK_SAMPLE)
        findings = run_custom_patterns(str(tmp_path), [name])
        assert findings == []

    def test_deno_lock_yields_no_findings(self, tmp_path: Path):
        name = _write(tmp_path, "deno.lock", DENO_LOCK_SAMPLE)
        findings = run_custom_patterns(str(tmp_path), [name])
        assert findings == []

    def test_nested_package_lock_skipped(self, tmp_path: Path):
        sub = tmp_path / "site"
        sub.mkdir()
        (sub / "package-lock.json").write_text(PACKAGE_LOCK_SAMPLE)
        findings = run_custom_patterns(str(tmp_path), ["site/package-lock.json"])
        assert findings == []

    def test_non_lockfile_still_scanned(self, tmp_path: Path):
        name = _write(
            tmp_path,
            "config.js",
            'const key = "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789AbCdEfGhIjKlMnOp==";\n',
        )
        findings = run_custom_patterns(str(tmp_path), [name])
        assert any("high-entropy" in f.description.lower() for f in findings), (
            "High-entropy pattern should still fire on non-lock files"
        )


class TestFullStage4SkipsLockFiles:
    def test_full_pipeline_no_lockfile_findings(self, tmp_path: Path):
        files = [
            _write(tmp_path, "package-lock.json", PACKAGE_LOCK_SAMPLE),
            _write(tmp_path, "deno.lock", DENO_LOCK_SAMPLE),
        ]
        result = stage4_scan_secrets(_make_ingest(tmp_path, files))
        lock_findings = [f for f in result.findings if f.location and any(lf in f.location for lf in files)]
        assert lock_findings == [], (
            f"Expected zero findings in lock files, got: {[(f.severity, f.description, f.location) for f in lock_findings]}"
        )
