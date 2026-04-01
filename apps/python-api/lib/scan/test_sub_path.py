"""Tests for sub_path narrowing in stage0_ingest."""

import os
import shutil
import tempfile

import pytest

from lib.scan.stage0_ingest import narrow_to_sub_path


def _create_mock_extraction(structure: dict[str, str]) -> tuple[str, list[str]]:
    """Create a mock extracted tarball directory.

    Args:
        structure: Dict of relative_path -> file_content

    Returns:
        (temp_dir, file_list)
    """
    temp_dir = tempfile.mkdtemp(prefix="tank_test_")
    file_list = []
    for rel_path, content in structure.items():
        full_path = os.path.join(temp_dir, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w") as f:
            f.write(content)
        file_list.append(rel_path)
    return temp_dir, file_list


class TestNarrowToSubPath:
    """Tests for the narrow_to_sub_path function."""

    def test_narrows_to_subdirectory_with_github_prefix(self):
        """Narrows to correct subdirectory inside a GitHub tarball prefix dir."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
                "owner-repo-abc123/skill-a/scripts/helper.py": "print('a')",
                "owner-repo-abc123/skill-b/SKILL.md": "# Skill B",
                "owner-repo-abc123/skill-b/scripts/helper.py": "print('b')",
            }
        )

        new_dir, new_files, total_size, findings = narrow_to_sub_path(temp_dir, "skill-a", file_list)

        assert len(findings) == 0
        assert new_dir != temp_dir
        assert not os.path.exists(temp_dir)
        assert set(new_files) == {"SKILL.md", os.path.join("scripts", "helper.py")}
        assert os.path.isfile(os.path.join(new_dir, "SKILL.md"))
        assert total_size > 0
        assert not os.path.exists(os.path.join(new_dir, "skill-b"))

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_narrows_without_prefix_directory(self):
        """Works when tarball has no single top-level prefix directory."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "skill-a/SKILL.md": "# Skill A",
                "skill-b/SKILL.md": "# Skill B",
            }
        )

        new_dir, new_files, total_size, findings = narrow_to_sub_path(temp_dir, "skill-a", file_list)

        assert len(findings) == 0
        assert set(new_files) == {"SKILL.md"}
        assert os.path.isfile(os.path.join(new_dir, "SKILL.md"))

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_narrows_nested_sub_path(self):
        """Supports multi-level sub_path like 'category/skill-a'."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/finance/tax-calc/SKILL.md": "# Tax Calc",
                "owner-repo-abc123/finance/tax-calc/main.py": "pass",
                "owner-repo-abc123/finance/invoicing/SKILL.md": "# Invoicing",
            }
        )

        new_dir, new_files, total_size, findings = narrow_to_sub_path(temp_dir, "finance/tax-calc", file_list)

        assert len(findings) == 0
        assert set(new_files) == {"SKILL.md", "main.py"}
        assert os.path.isfile(os.path.join(new_dir, "SKILL.md"))
        assert not os.path.exists(os.path.join(new_dir, "invoicing"))

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_sub_path_not_found(self):
        """Returns finding when sub_path directory doesn't exist."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        result_dir, result_files, total_size, findings = narrow_to_sub_path(temp_dir, "nonexistent-skill", file_list)

        assert len(findings) == 1
        assert findings[0].type == "sub_path_not_found"
        assert findings[0].severity == "medium"
        assert result_dir == temp_dir

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_path_traversal_blocked(self):
        """Rejects sub_path with path traversal attempts."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        result_dir, _, _, findings = narrow_to_sub_path(temp_dir, "../../etc/passwd", file_list)

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"
        assert findings[0].severity == "critical"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_path_traversal_via_nested_dotdot(self):
        """Rejects sub_path that embeds '..' after a valid prefix."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "skill-a/../../etc/passwd", file_list)

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"
        assert findings[0].severity == "critical"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_absolute_path_blocked(self):
        """Rejects absolute sub_path."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        result_dir, _, _, findings = narrow_to_sub_path(temp_dir, "/etc/passwd", file_list)

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"
        assert findings[0].severity == "critical"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_dot_sub_path_blocked(self):
        """Rejects sub_path='.' which would copy the entire repo."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, ".", file_list)

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"
        assert findings[0].severity == "critical"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_empty_sub_path_is_noop(self):
        """Empty string sub_path returns original dir unchanged."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        result_dir, result_files, _, findings = narrow_to_sub_path(temp_dir, "", file_list)

        assert len(findings) == 0
        assert result_dir == temp_dir
        assert result_files == file_list

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_whitespace_only_sub_path_is_noop(self):
        """Whitespace-only sub_path treated as empty."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        result_dir, result_files, _, findings = narrow_to_sub_path(temp_dir, "   ", file_list)

        assert len(findings) == 0
        assert result_dir == temp_dir

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_double_dots_in_name_allowed(self):
        """Directory names containing '..' as substring (e.g. 'v2..0') are allowed."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-v2..0/SKILL.md": "# Skill v2..0",
            }
        )

        new_dir, new_files, total_size, findings = narrow_to_sub_path(temp_dir, "skill-v2..0", file_list)

        assert len(findings) == 0
        assert set(new_files) == {"SKILL.md"}
        assert os.path.isfile(os.path.join(new_dir, "SKILL.md"))

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_copy_failure_does_not_leak_temp_dir(self):
        """If file copy fails, the new temp dir is cleaned up."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        target = os.path.join(temp_dir, "owner-repo-abc123", "skill-a", "SKILL.md")
        os.chmod(target, 0o000)

        try:
            with pytest.raises(Exception):
                narrow_to_sub_path(temp_dir, "skill-a", file_list)
        finally:
            os.chmod(target, 0o644)
            shutil.rmtree(temp_dir, ignore_errors=True)


class TestEdgeCases:
    """Edge cases an attacker might try that aren't obvious."""

    def test_null_byte_injection_blocked(self):
        """Null bytes bypass Path() but crash filesystem calls — must reject early."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "skill-a\x00/../etc/passwd", file_list)

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"
        assert findings[0].severity == "critical"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_null_byte_without_traversal_blocked(self):
        """Even without traversal chars, null bytes must be rejected."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "skill\x00-a", file_list)

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_backslash_traversal_unix_safe(self):
        """On Unix, backslash is a literal char — treated as 'not found', not traversal."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "skill-a\\..\\..\\etc", file_list)

        assert len(findings) == 1
        assert findings[0].type == "sub_path_not_found"
        assert findings[0].severity == "medium"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_url_encoded_traversal_not_decoded(self):
        """URL-encoded '../' (%2e%2e/) is NOT decoded — treated as literal."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "%2e%2e/%2e%2e/etc/passwd", file_list)

        assert len(findings) == 1
        assert findings[0].type == "sub_path_not_found"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_sub_path_targeting_file_not_directory(self):
        """sub_path pointing to a file (not dir) returns 'not found'."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "skill-a/SKILL.md", file_list)

        assert len(findings) == 1
        assert findings[0].type == "sub_path_not_found"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_trailing_slash_normalized(self):
        """Trailing slash is normalized away by Path — still works."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        new_dir, new_files, _, findings = narrow_to_sub_path(temp_dir, "skill-a/", file_list)

        assert len(findings) == 0
        assert set(new_files) == {"SKILL.md"}

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_symlink_in_sub_path_skipped_during_copy(self):
        """Symlinks in extracted content are skipped, not followed or preserved."""
        temp_dir = tempfile.mkdtemp(prefix="tank_test_")
        skill_dir = os.path.join(temp_dir, "owner-repo-abc123", "skill-a")
        os.makedirs(skill_dir)
        with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
            f.write("# Legit")
        os.symlink("/etc/passwd", os.path.join(skill_dir, "evil-link"))

        file_list = ["owner-repo-abc123/skill-a/SKILL.md", "owner-repo-abc123/skill-a/evil-link"]

        new_dir, new_files, _, findings = narrow_to_sub_path(temp_dir, "skill-a", file_list)

        assert len(findings) == 0
        assert "SKILL.md" in new_files
        assert not os.path.exists(os.path.join(new_dir, "evil-link"))

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_symlink_dir_in_sub_path_skipped(self):
        """Symlink directories in extracted content are skipped entirely."""
        temp_dir = tempfile.mkdtemp(prefix="tank_test_")
        skill_dir = os.path.join(temp_dir, "owner-repo-abc123", "skill-a")
        os.makedirs(skill_dir)
        with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
            f.write("# Legit")
        os.symlink("/etc", os.path.join(skill_dir, "evil-dir"))

        file_list = ["owner-repo-abc123/skill-a/SKILL.md"]

        new_dir, new_files, _, findings = narrow_to_sub_path(temp_dir, "skill-a", file_list)

        assert len(findings) == 0
        assert not os.path.exists(os.path.join(new_dir, "evil-dir"))

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_nested_symlink_inside_subdir_skipped(self):
        """Symlinks nested inside subdirectories are also filtered out."""
        temp_dir = tempfile.mkdtemp(prefix="tank_test_")
        skill_dir = os.path.join(temp_dir, "owner-repo-abc123", "skill-a")
        scripts_dir = os.path.join(skill_dir, "scripts")
        os.makedirs(scripts_dir)
        with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
            f.write("# Legit")
        with open(os.path.join(scripts_dir, "helper.py"), "w") as f:
            f.write("pass")
        os.symlink("/etc/shadow", os.path.join(scripts_dir, "sneaky"))

        file_list = ["owner-repo-abc123/skill-a/SKILL.md"]

        new_dir, new_files, _, findings = narrow_to_sub_path(temp_dir, "skill-a", file_list)

        assert len(findings) == 0
        assert not os.path.exists(os.path.join(new_dir, "scripts", "sneaky"))
        assert os.path.isfile(os.path.join(new_dir, "scripts", "helper.py"))

        shutil.rmtree(new_dir, ignore_errors=True)

    def test_newline_in_sub_path_with_traversal_blocked(self):
        """Newline char followed by '../' is caught by component check."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "skill-a\n../../etc", file_list)

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_tilde_not_expanded(self):
        """~ is NOT expanded to home directory — treated as literal."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            }
        )

        _, _, _, findings = narrow_to_sub_path(temp_dir, "~/etc/passwd", file_list)

        assert len(findings) == 1
        assert findings[0].type == "sub_path_not_found"

        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_triple_dot_not_blocked(self):
        """'...' (three dots) is NOT '..' — treated as literal directory name."""
        temp_dir, file_list = _create_mock_extraction(
            {
                "owner-repo-abc123/.../SKILL.md": "# Sneaky",
            }
        )

        new_dir, new_files, _, findings = narrow_to_sub_path(temp_dir, "...", file_list)

        assert len(findings) == 0
        assert "SKILL.md" in new_files

        shutil.rmtree(new_dir, ignore_errors=True)
