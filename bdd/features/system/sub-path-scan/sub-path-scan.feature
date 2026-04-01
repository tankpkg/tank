# Intent: idd/modules/sub-path-scan/INTENT.md
# Layer: Security (S1–S5), Functional (F1–F4), Edge cases (E1–E3)

@sub-path-scan
Feature: Sub-path narrowing for monorepo scanning
  As a monorepo skill publisher
  I need to scan a specific subdirectory within a tarball
  So that findings are attributed to the correct skill

  # ── Path traversal prevention (S1) ────────────────────────────────────
  @critical
  Scenario Outline: Path traversal attempts are rejected (S1)
    Given an extracted tarball with skill directories
    When narrow_to_sub_path is called with sub_path "<attack>"
    Then a critical finding of type "invalid_sub_path" is returned
    And the original temp directory is preserved

    Examples:
      | attack                     |
      | ../../etc/passwd           |
      | /etc/passwd                |
      | skill-a/../../etc/passwd   |
      | .                          |

  # ── Symlink defense in depth (S2) ─────────────────────────────────────
  @high
  Scenario: copytree does not follow symlinks (S2)
    Given an extracted tarball with a valid sub_path
    When narrow_to_sub_path copies files to the new temp dir
    Then shutil.copytree is called with symlinks=True
    And shutil.copy2 is called with follow_symlinks=False

  # ── Temp dir leak prevention (S3) ─────────────────────────────────────
  @high
  Scenario: Copy failure cleans up the new temp directory (S3)
    Given an extracted tarball with a valid sub_path
    And a file in the sub_path is unreadable
    When narrow_to_sub_path attempts to copy files
    Then an exception is raised
    And the new temp directory does not exist on disk

  # ── Resolve/relative_to escape check (S4) ─────────────────────────────
  @critical
  Scenario: Resolved path outside temp_dir is rejected (S4)
    Given an extracted tarball
    When sub_path resolves outside the extraction directory
    Then a critical finding of type "sub_path_escape" is returned
    And the original temp directory is preserved

  # ── Input length limit (S5) ───────────────────────────────────────────
  @medium
  Scenario: sub_path longer than 255 characters is rejected by Pydantic (S5)
    Given a ScanRequest with a sub_path of 300 characters
    When the request is validated by Pydantic
    Then a validation error is returned

  # ── GitHub prefix detection (F1) ──────────────────────────────────────
  @high
  Scenario: Narrows correctly inside GitHub tarball prefix (F1)
    Given an extracted tarball with prefix "owner-repo-abc123/"
    And the tarball contains "owner-repo-abc123/skill-a/SKILL.md"
    And the tarball contains "owner-repo-abc123/skill-b/SKILL.md"
    When narrow_to_sub_path is called with sub_path "skill-a"
    Then only skill-a files are in the new temp directory
    And skill-b files are not present
    And the original temp directory is cleaned up

  # ── No prefix fallback (F2) ──────────────────────────────────────────
  @high
  Scenario: Works when tarball has no single top-level prefix (F2)
    Given an extracted tarball with multiple top-level directories
    When narrow_to_sub_path is called with sub_path "skill-a"
    Then only skill-a files are in the new temp directory

  # ── Nested sub_path (F3) ──────────────────────────────────────────────
  @medium
  Scenario: Supports multi-level sub_path (F3)
    Given an extracted tarball with nested structure "finance/tax-calc/"
    When narrow_to_sub_path is called with sub_path "finance/tax-calc"
    Then only tax-calc files are in the new temp directory

  # ── Missing sub_path graceful fallback (F4) ───────────────────────────
  @medium
  Scenario: Non-existent sub_path returns finding and preserves original (F4)
    Given an extracted tarball
    When narrow_to_sub_path is called with sub_path "nonexistent"
    Then a medium finding of type "sub_path_not_found" is returned
    And the original temp directory is preserved with all files

  # ── Empty/whitespace sub_path (E1) ────────────────────────────────────
  @low
  Scenario Outline: Empty or whitespace sub_path is a no-op (E1)
    Given an extracted tarball
    When narrow_to_sub_path is called with sub_path "<value>"
    Then no findings are returned
    And the original temp directory is returned unchanged

    Examples:
      | value |
      |       |
      |       |

  # ── Double dots in legitimate name (E2) ───────────────────────────────
  @medium
  Scenario: Directory named "skill-v2..0" is not false-positived (E2)
    Given an extracted tarball containing directory "skill-v2..0"
    When narrow_to_sub_path is called with sub_path "skill-v2..0"
    Then no findings are returned
    And only skill-v2..0 files are in the new temp directory

  # ── Backward compatibility (E3) ──────────────────────────────────────
  @critical
  Scenario: Omitting sub_path preserves full-tarball scan behavior (E3)
    Given a ScanRequest without sub_path
    When the scan pipeline runs
    Then all files in the tarball are scanned
    And no sub_path narrowing occurs
