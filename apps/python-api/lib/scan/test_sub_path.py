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
