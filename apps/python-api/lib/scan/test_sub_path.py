"""Tests for sub_path narrowing in stage0_ingest."""

import os
import tempfile

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
        temp_dir, file_list = _create_mock_extraction({
            "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
            "owner-repo-abc123/skill-a/scripts/helper.py": "print('a')",
            "owner-repo-abc123/skill-b/SKILL.md": "# Skill B",
            "owner-repo-abc123/skill-b/scripts/helper.py": "print('b')",
        })

        new_dir, new_files, total_size, findings = narrow_to_sub_path(
            temp_dir, "skill-a", file_list
        )

        assert len(findings) == 0
        assert new_dir != temp_dir
        assert not os.path.exists(temp_dir)  # Original cleaned up
        assert set(new_files) == {"SKILL.md", os.path.join("scripts", "helper.py")}
        assert os.path.isfile(os.path.join(new_dir, "SKILL.md"))
        assert total_size > 0

        # Verify skill-b files are NOT present
        assert not os.path.exists(os.path.join(new_dir, "skill-b"))

        # Cleanup
        import shutil
        shutil.rmtree(new_dir, ignore_errors=True)

    def test_narrows_without_prefix_directory(self):
        """Works when tarball has no single top-level prefix directory."""
        temp_dir, file_list = _create_mock_extraction({
            "skill-a/SKILL.md": "# Skill A",
            "skill-b/SKILL.md": "# Skill B",
        })

        new_dir, new_files, total_size, findings = narrow_to_sub_path(
            temp_dir, "skill-a", file_list
        )

        assert len(findings) == 0
        assert set(new_files) == {"SKILL.md"}
        assert os.path.isfile(os.path.join(new_dir, "SKILL.md"))

        import shutil
        shutil.rmtree(new_dir, ignore_errors=True)

    def test_sub_path_not_found(self):
        """Returns finding when sub_path directory doesn't exist."""
        temp_dir, file_list = _create_mock_extraction({
            "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
        })

        result_dir, result_files, total_size, findings = narrow_to_sub_path(
            temp_dir, "nonexistent-skill", file_list
        )

        assert len(findings) == 1
        assert findings[0].type == "sub_path_not_found"
        assert findings[0].severity == "medium"
        # Original dir preserved since we couldn't narrow
        assert result_dir == temp_dir

        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_path_traversal_blocked(self):
        """Rejects sub_path with path traversal attempts."""
        temp_dir, file_list = _create_mock_extraction({
            "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
        })

        result_dir, _, _, findings = narrow_to_sub_path(
            temp_dir, "../../etc/passwd", file_list
        )

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"
        assert findings[0].severity == "critical"

        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_absolute_path_blocked(self):
        """Rejects absolute sub_path."""
        temp_dir, file_list = _create_mock_extraction({
            "owner-repo-abc123/skill-a/SKILL.md": "# Skill A",
        })

        result_dir, _, _, findings = narrow_to_sub_path(
            temp_dir, "/etc/passwd", file_list
        )

        assert len(findings) == 1
        assert findings[0].type == "invalid_sub_path"
        assert findings[0].severity == "critical"

        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
