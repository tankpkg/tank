"""Regression: detect-secrets must not flag env-var-name placeholders as secrets.

Bug (prod): scanning ``@uriva/p2b-social-media-scraper`` v2.0.0 emitted a
CRITICAL finding on this SKILL.md line:

    { "rapidApiKey": "RAPIDAPI_KEY", "brightDataToken": "BRIGHTDATA_TOKEN" }

The values are env-var-name placeholders — documentation showing which env vars
the skill expects — not real credentials.

Two compounding bugs in stage4_secrets.py:

1. ``\b(...|key|token|...)\b`` failed to match on ``rapidapi_key`` because
   underscore is a regex word character, so ``\bkey\b`` requires a non-word
   character before ``key`` and the underscore doesn't qualify.
2. SKILL.md at the package root did not match any ``EXAMPLE_PATH_PATTERNS``
   (which only covered ``/docs/``, ``/examples/``, ``setup``, etc.), so even
   a flagged finding was never downgraded to ``info``.

Fix: add patterns matching env-var-name style placeholders explicitly, and
treat top-level documentation files (SKILL.md, README.md, CHANGELOG.md, etc.)
as documentation paths.
"""

from pathlib import Path

from lib.scan.models import IngestResult, StageResult
from lib.scan.stage4_secrets import (
    _is_example_path,
    _is_placeholder_value,
    stage4_scan_secrets,
)


class TestEnvVarNamePlaceholders:
    def test_quoted_uppercase_env_var_name_is_placeholder(self):
        assert _is_placeholder_value('"RAPIDAPI_KEY"')
        assert _is_placeholder_value('"BRIGHTDATA_TOKEN"')
        assert _is_placeholder_value('"OPENAI_API_KEY"')
        assert _is_placeholder_value('"GITHUB_TOKEN"')
        assert _is_placeholder_value('"DATABASE_URL"')
        assert _is_placeholder_value('"AWS_ACCESS_KEY_ID"')

    def test_quoted_short_prefix_form_is_placeholder(self):
        assert _is_placeholder_value('"API_KEY"')
        assert _is_placeholder_value('"SECRET_TOKEN"')
        assert _is_placeholder_value('"ACCESS_TOKEN"')
        assert _is_placeholder_value('"PRIVATE_KEY"')

    def test_naked_env_var_name_is_placeholder(self):
        assert _is_placeholder_value("RAPIDAPI_KEY")
        assert _is_placeholder_value("BRIGHTDATA_TOKEN")
        assert _is_placeholder_value("MY_AWS_ACCESS_KEY")
        assert _is_placeholder_value("STRIPE_SECRET_KEY")

    def test_secret_mapping_example_line_is_placeholder(self):
        line = '{ "rapidApiKey": "RAPIDAPI_KEY", "brightDataToken": "BRIGHTDATA_TOKEN" }'
        assert _is_placeholder_value(line)

    def test_real_google_api_key_not_suppressed(self):
        assert not _is_placeholder_value("AIzaSyA1234567890abcdefghijklmnopqrstuv")

    def test_real_jwt_not_suppressed(self):
        jwt = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIn0."
            "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        )
        assert not _is_placeholder_value(jwt)

    def test_real_random_base64_not_suppressed(self):
        assert not _is_placeholder_value('"sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789"')


class TestTopLevelDocsAreExamplePaths:
    def test_skill_md_at_root_is_example_path(self):
        assert _is_example_path("SKILL.md")

    def test_skill_md_in_subpath_is_example_path(self):
        assert _is_example_path("packages/foo/SKILL.md")

    def test_readme_is_example_path(self):
        assert _is_example_path("README.md")
        assert _is_example_path("subdir/README.md")

    def test_other_top_level_docs_are_example_paths(self):
        assert _is_example_path("CHANGELOG.md")
        assert _is_example_path("CONTRIBUTING.md")
        assert _is_example_path("CODE_OF_CONDUCT.md")
        assert _is_example_path("SECURITY.md")

    def test_lowercase_filename_also_matches(self):
        assert _is_example_path("readme.md")
        assert _is_example_path("changelog.markdown")

    def test_random_md_inside_skill_code_is_not_example_path(self):
        assert not _is_example_path("src/handler.md")


class TestPreExistingPlaceholderCoverageGap:
    def test_abc123_is_placeholder(self):
        assert _is_placeholder_value("abc123")

    def test_long_digit_run_is_placeholder(self):
        assert _is_placeholder_value("123456")
        assert _is_placeholder_value("1234567890")


class TestStage4Integration:
    def test_skill_md_with_env_var_placeholders_emits_no_critical(self, tmp_path: Path):
        skill_md = tmp_path / "SKILL.md"
        skill_md.write_text(
            "---\n"
            "name: example-skill\n"
            "description: example\n"
            "---\n\n"
            "Pass secrets via secretMapping:\n\n"
            "```json\n"
            '{ "rapidApiKey": "RAPIDAPI_KEY", "brightDataToken": "BRIGHTDATA_TOKEN" }\n'
            "```\n"
        )

        ingest = IngestResult(
            temp_dir=str(tmp_path),
            file_list=["SKILL.md"],
            total_size=skill_md.stat().st_size,
            stage_result=StageResult(stage="stage0", status="passed", findings=[], duration_ms=0),
        )

        result = stage4_scan_secrets(ingest)
        critical = [f for f in result.findings if f.severity == "critical"]
        assert not critical, f"Expected no critical findings but got: {critical}"

    def test_skill_md_with_real_secret_still_flagged(self, tmp_path: Path):
        skill_md = tmp_path / "SKILL.md"
        skill_md.write_text(
            "---\n"
            "name: dangerous-skill\n"
            "---\n\n"
            "Hardcoded credential (should still be reported, even if downgraded):\n\n"
            "```\n"
            'GOOGLE_API_KEY = "AIzaSyD-1234567890abcdefghijklmnopqrstuv"\n'
            "```\n"
        )

        ingest = IngestResult(
            temp_dir=str(tmp_path),
            file_list=["SKILL.md"],
            total_size=skill_md.stat().st_size,
            stage_result=StageResult(stage="stage0", status="passed", findings=[], duration_ms=0),
        )

        result = stage4_scan_secrets(ingest)
        all_findings = result.findings
        assert any("AIza" in (f.evidence or "") or "Google" in f.description for f in all_findings), (
            "Real Google API key should still be detected and reported, even in SKILL.md"
        )
