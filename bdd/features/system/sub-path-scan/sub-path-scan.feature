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
      | attack                   |
      | ../../etc/passwd         |
      | /etc/passwd              |
      | skill-a/../../etc/passwd |
      | .                        |

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

  # ── Null byte injection (S6) ─────────────────────────────────────────
  @critical
  Scenario Outline: Null byte injection is rejected (S6)
    Given an extracted tarball with skill directories
    When narrow_to_sub_path is called with sub_path containing null bytes "<attack>"
    Then a critical finding of type "invalid_sub_path" is returned

    Examples:
      | attack                    |
      | skill-a\x00/../etc/passwd |
      | skill\x00-a               |

  # ── Symlink defense in copy (S7) ─────────────────────────────────────
  @critical
  Scenario: Symlink files in extracted content are skipped during copy (S7)
    Given an extracted tarball where skill-a contains a symlink to /etc/passwd
    When narrow_to_sub_path copies skill-a to a new temp dir
    Then the symlink is NOT present in the new temp directory
    And legitimate files are present

  @critical
  Scenario: Symlink directories in extracted content are skipped (S8)
    Given an extracted tarball where skill-a contains a symlink dir to /etc
    When narrow_to_sub_path copies skill-a to a new temp dir
    Then the symlink directory is NOT present in the new temp directory

  @critical
  Scenario: Nested symlinks inside subdirectories are filtered (S9)
    Given an extracted tarball where skill-a/scripts/ contains a symlink
    When narrow_to_sub_path copies skill-a to a new temp dir
    Then the nested symlink is NOT in the copied scripts/ directory
    And legitimate scripts are present

  # ── Platform-specific traversal (E4) ─────────────────────────────────
  @medium
  Scenario: Backslash traversal is harmless on Unix (E4)
    Given an extracted tarball
    When narrow_to_sub_path is called with sub_path "skill-a\..\..\etc"
    Then a medium finding of type "sub_path_not_found" is returned

  # ── Encoding evasion (E5) ────────────────────────────────────────────
  @medium
  Scenario: URL-encoded traversal is NOT decoded (E5)
    Given an extracted tarball
    When narrow_to_sub_path is called with sub_path "%2e%2e/%2e%2e/etc"
    Then a medium finding of type "sub_path_not_found" is returned

  # ── File vs directory (E6) ───────────────────────────────────────────
  @low
  Scenario: sub_path targeting a file returns not found (E6)
    Given an extracted tarball containing "skill-a/SKILL.md"
    When narrow_to_sub_path is called with sub_path "skill-a/SKILL.md"
    Then a medium finding of type "sub_path_not_found" is returned

  # ── Trailing slash normalization (E7) ────────────────────────────────
  @low
  Scenario: Trailing slash is normalized and works (E7)
    Given an extracted tarball containing "skill-a/"
    When narrow_to_sub_path is called with sub_path "skill-a/"
    Then no findings are returned
    And only skill-a files are in the new temp directory

  # ── Tilde not expanded (E8) ─────────────────────────────────────────
  @medium
  Scenario: Tilde is NOT expanded to home directory (E8)
    Given an extracted tarball
    When narrow_to_sub_path is called with sub_path "~/etc/passwd"
    Then a medium finding of type "sub_path_not_found" is returned

  # ── Triple-dot not confused with double-dot (E9) ────────────────────
  @low
  Scenario: Triple-dot directory name is allowed (E9)
    Given an extracted tarball containing directory "..."
    When narrow_to_sub_path is called with sub_path "..."
    Then no findings are returned

  # ── Newline traversal (E10) ─────────────────────────────────────────
  @medium
  Scenario: Newline embedded before traversal chars is caught (E10)
    Given an extracted tarball
    When narrow_to_sub_path is called with sub_path containing "skill-a\n../../etc"
    Then a critical finding of type "invalid_sub_path" is returned
