# Intent: idd/modules/migrate/INTENT.md
# Layer: Constraints (C1–C6), Examples (E1–E5)

@migrate
Feature: Migrate legacy skills.json/skills.lock to tank.json/tank.lock
  As a skill developer with an existing project
  I need to migrate my project from the legacy filename format to the new Tank filenames
  So that my project works with the current version of Tank

  # ── Both files present (C1, C2, C6) ──────────────────────────────────
  @high
  Scenario: Migrating a directory with both legacy files copies both (E1)
    Given a temporary directory with "skills.json" and "skills.lock"
    When I run the migrate command
    Then "tank.json" exists in the directory
    And "tank.lock" exists in the directory
    And "skills.json" still exists (original preserved)
    And "skills.lock" still exists (original preserved)

  # ── Partial migration (C1) ────────────────────────────────────────────
  @medium
  Scenario: Migrating when only skills.json exists skips lockfile (E2)
    Given a temporary directory with "skills.json" but no "skills.lock"
    When I run the migrate command
    Then "tank.json" exists in the directory
    And "tank.lock" does not exist in the directory

  # ── Idempotency (C3, C4) ──────────────────────────────────────────────
  @high
  Scenario: Migrating when tank.json already exists skips manifest (E3)
    Given a temporary directory with both "skills.json" and "tank.json"
    When I run the migrate command
    Then the migrate command notes "already exists" for tank.json

  @high
  Scenario: Running migrate twice is a no-op on second run (E5)
    Given a temporary directory with "skills.json"
    When I run the migrate command twice
    Then no error is thrown on the second run

  # ── Nothing to migrate (C5) ───────────────────────────────────────────
  @medium
  Scenario: Directory with no legacy files prints nothing to migrate (E4)
    Given a temporary directory with no skills.json or skills.lock
    When I run the migrate command
    Then the output contains "nothing to migrate" or "Already migrated"
