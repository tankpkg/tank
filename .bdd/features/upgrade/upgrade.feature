# Intent: .idd/modules/upgrade/INTENT.md
# Layer: Constraints (C1–C9), Examples (E1–E6)

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
