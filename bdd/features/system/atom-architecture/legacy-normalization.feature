@atom-architecture
@normalization
@legacy
Feature: Legacy SKILL.md backward-compatible normalization
  As an existing skill author
  I need my SKILL.md-only packages to work without any changes
  So that the atom architecture does not break backward compatibility

  # ─── Legacy package (SKILL.md + tank.json without atoms) ──────────────────
  @high
  Scenario: Legacy package with SKILL.md normalizes to single instruction atom
    Given a directory containing "SKILL.md" with content "# My Skill\nDo X when Y"
    And a "tank.json" with name "@acme/my-skill" and version "1.0.0" and no atoms field
    When the directory is normalized to PackageIR
    Then the result is a valid PackageIR
    And the package name is "@acme/my-skill"
    And the package version is "1.0.0"
    And the package contains exactly 1 atom
    And that atom has kind "instruction"
    And that atom's content references "SKILL.md"

  @high
  Scenario: Legacy package with skills.json (deprecated filename) normalizes identically
    Given a directory containing "SKILL.md" with content "# My Skill\nDo X when Y"
    And a "skills.json" with name "@acme/my-skill" and version "1.0.0" and no atoms field
    When the directory is normalized to PackageIR
    Then the result is a valid PackageIR
    And the package name is "@acme/my-skill"
    And the package contains exactly 1 atom
    And that atom has kind "instruction"

  @high
  Scenario: Legacy package without SKILL.md fails normalization
    Given a directory containing only "tank.json" with name "@acme/no-skill" and version "1.0.0"
    And no "SKILL.md" exists in the directory
    When the directory is normalized to PackageIR
    Then normalization fails with an error mentioning "SKILL.md"

  @medium
  Scenario: Legacy package with SKILL.md and existing skills map in tank.json
    Given a directory containing "SKILL.md" with content "# React Skill"
    And a "tank.json" with name "@acme/react" and version "2.0.0" and skills map '{"@org/dep": "^1.0.0"}' and no atoms field
    When the directory is normalized to PackageIR
    Then the result is a valid PackageIR
    And the package contains exactly 1 atom with kind "instruction"
    And the package metadata preserves the skills dependency map
