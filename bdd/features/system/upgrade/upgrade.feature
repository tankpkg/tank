# Intent: idd/modules/upgrade/INTENT.md
# Layer: Constraints (C1–C11), Examples (E1–E11)

@upgrade
Feature: Self-upgrade Tank CLI binary
  As a Tank CLI user
  I need to upgrade the CLI binary to a newer version
  So that I always have the latest security fixes and features

  # ── Already on latest (C2) ────────────────────────────────────────────
  @high
  Scenario: Already on latest version prints a message and exits (E1)
    Given the current version equals the latest available version
    When I run upgrade without --force
    Then the output contains "Already on latest version"
    And no binary download occurs

  # ── Dry run (C6) ──────────────────────────────────────────────────────
  @high
  Scenario: Dry run prints the upgrade target without downloading (E2)
    Given a newer version "999.0.0" is available
    When I run upgrade with "--dry-run"
    Then the output contains "Would upgrade"
    And no binary is written to disk

  # ── Checksum verification (C4, C5) ────────────────────────────────────
  @high
  Scenario: Checksum mismatch aborts the upgrade (E4)
    Given a newer version binary is available
    But the SHA256SUMS file contains a wrong checksum for this binary
    When I run upgrade
    Then the output contains "Checksum mismatch. Aborting"
    And the original binary is not replaced

  @high
  @posix
  Scenario: Upgrade works across filesystems (E7)
    Given the download directory and installed binary are on different filesystems
    And a newer binary with a valid checksum is available
    When I run upgrade
    Then the installed binary is replaced with the verified executable

  @high
  @posix
  Scenario: An unsuccessful replacement preserves the original binary (E8)
    Given a newer binary with a valid checksum is available
    But the installed binary cannot be replaced
    When I run upgrade
    Then the original binary is not replaced
    And upgrade temporary files are cleaned up

  @high
  @posix
  Scenario: A cleanup failure does not hide the original upgrade error (E9)
    Given an upgrade has begun staging files
    And the install directory becomes unwritable
    When the upgrade fails
    Then the original upgrade error is reported
    And the user is told the remaining staging path

  @high
  @posix
  Scenario: An older standalone binary recovers from a cross-filesystem upgrade failure (E10)
    Given an affected standalone binary and its temporary directory are on different filesystems
    And an ordinary upgrade fails with EXDEV without replacing the binary
    When I retry with a writable TMPDIR on the installation filesystem
    Then the verified newer binary is installed and runs

  @high
  @posix
  Scenario: A published recovery target can still need the workaround (E11)
    Given the affected published standalone version 0.16.5 is installed
    When a forced upgrade uses a temporary directory on another filesystem
    Then the upgrade fails with EXDEV and the installed binary remains unchanged

  # ── Homebrew detection (C7) ───────────────────────────────────────────
  @medium
  Scenario: Homebrew-installed binary redirects to brew upgrade (E5)
    Given the current binary path contains "/Cellar/"
    When I run upgrade
    Then the output contains "brew upgrade tank"
    And no download is attempted

  # ── npm/npx detection (C9) ─────────────────────────────────────────
  @high
  Scenario: npm-installed CLI redirects to npm update (E6)
    Given the current binary path contains "node_modules"
    When I run upgrade
    Then the output contains "npm update -g @tankpkg/cli"
    And no download is attempted

  @high
  Scenario: JS entry point (.js) detected as npm install (E6)
    Given the current binary path ends with ".js"
    When I run upgrade
    Then the output contains "npm update -g @tankpkg/cli"
    And no download is attempted

  # ── Version bump detection (C1) ───────────────────────────────────────
  @medium
  Scenario: isNewerVersion correctly identifies semantic version ordering
    Given current version is "1.2.3"
    When comparing to candidate "1.2.4"
    Then "1.2.4" is identified as newer
    And comparing to "1.2.3" returns "not newer"
