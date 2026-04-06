@atom-architecture
@normalization
@tier1
Feature: Tier 1 declarative tank.json normalization
  As a package author using declarative atom definitions
  I need tank.json with an atoms array to normalize into typed PackageIR
  So that I can define multi-atom packages without a build step

  # ─── Single atom ───────────────────────────────────────────────────────────

  @high
  Scenario: tank.json with a single instruction atom
    Given a "tank.json" with name "@acme/ts-rules" and version "1.0.0"
    And the tank.json contains atoms array with one instruction atom with content "./SKILL.md"
    When the file is normalized to PackageIR
    Then the result is a valid PackageIR
    And the package contains exactly 1 atom
    And that atom has kind "instruction"

  # ─── Multiple atoms ────────────────────────────────────────────────────────

  @high
  Scenario: tank.json with multiple mixed atoms
    Given a "tank.json" with name "@acme/security" and version "1.0.0"
    And the tank.json contains atoms array with:
      | kind        | name     |
      | instruction | rules    |
      | agent       | reviewer |
      | rule        | no-rm    |
    When the file is normalized to PackageIR
    Then the result is a valid PackageIR
    And the package contains exactly 3 atoms
    And the atom kinds are "instruction", "agent", "rule"

  # ─── Includes (composition) ────────────────────────────────────────────────

  @high
  Scenario: tank.json with includes references
    Given a "tank.json" with name "@acme/full-stack" and version "1.0.0"
    And the tank.json contains includes '["@acme/ts-rules", "@acme/security-hooks"]'
    And the tank.json contains atoms array with one instruction atom with content "./extra.md"
    When the file is normalized to PackageIR
    Then the result is a valid PackageIR
    And the package includes contains "@acme/ts-rules" and "@acme/security-hooks"
    And the package contains exactly 1 atom

  # ─── Validation errors ─────────────────────────────────────────────────────

  @high
  Scenario: tank.json with invalid atom in atoms array
    Given a "tank.json" with name "@acme/broken" and version "1.0.0"
    And the tank.json contains atoms array with one atom missing required fields
    When the file is normalized to PackageIR
    Then normalization fails with structured Zod errors
    And the errors identify the invalid atom by index

  @high
  Scenario: tank.json with invalid package name
    Given a "tank.json" with name "unscoped-name" and version "1.0.0"
    And the tank.json contains atoms array with one instruction atom with content "./SKILL.md"
    When the file is normalized to PackageIR
    Then normalization fails with an error about scoped name format

  @medium
  Scenario: tank.json atoms array is empty
    Given a "tank.json" with name "@acme/empty" and version "1.0.0"
    And the tank.json contains an empty atoms array
    When the file is normalized to PackageIR
    Then the result is a valid PackageIR
    And the package contains exactly 0 atoms

  # ─── Extensions passthrough ────────────────────────────────────────────────

  @medium
  Scenario: Atom extensions survive normalization
    Given a "tank.json" with name "@acme/ext-test" and version "1.0.0"
    And the tank.json contains atoms array with one instruction atom with content "./rules.md"
    And that atom has extensions '{"cursor": {"alwaysApply": true}, "opencode": {"scope": "global"}}'
    When the file is normalized to PackageIR
    Then the result is a valid PackageIR
    And the atom's extensions contain key "cursor"
    And the atom's extensions contain key "opencode"
