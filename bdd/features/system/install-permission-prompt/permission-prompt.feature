# Intent: idd/modules/install/INTENT.md
# Layer: Constraints (C12-C18), Examples (E11-E16)

@install-permission-prompt
Feature: Interactive permission budget expansion during install
  As a developer installing skills
  I want to be prompted when a skill needs permissions outside my budget
  So that I can expand the budget without hand-editing tank.json

  # -- User accepts prompt (C12, C14, E11) ------------------------------------
  @high
  Scenario: Interactive prompt — user accepts filesystem.read expansion (E11)
    Given a project with permission budget allowing no filesystem.read
    And a skill requesting filesystem.read "*/"
    When I run "tank install @org/skill" interactively
    And the permission prompt appears listing filesystem.read: "*/"
    And I accept the prompt
    Then tank.json permissions.filesystem.read contains "*/"
    And the install succeeds

  # -- User declines prompt (C15, E12) ----------------------------------------
  @high
  Scenario: Interactive prompt — user declines permission expansion (E12)
    Given a project with permission budget allowing no filesystem.read
    And a skill requesting filesystem.read "*/"
    When I run "tank install @org/skill" interactively
    And the permission prompt appears listing filesystem.read: "*/"
    And I decline the prompt
    Then the install fails with "Permission denied"
    And tank.json is unchanged

  # -- --yes auto-accepts (C16, E13) ------------------------------------------
  @high
  Scenario: --yes flag auto-accepts permission expansion (E13)
    Given a project with permission budget subprocess: false
    And a skill requesting subprocess: true
    When I run "tank install @org/skill --yes"
    Then no prompt is shown
    And tank.json permissions.subprocess is true
    And the install succeeds

  # -- CI without --yes fails (C17, E14) --------------------------------------
  @high
  Scenario: CI environment without --yes fails on violation (E14)
    Given a project with permission budget allowing no network.outbound
    And a skill requesting network.outbound "api.example.com"
    When I run "tank install @org/skill" with CI=true
    Then no prompt is shown
    And the install fails with "Permission denied"

  # -- Multiple violations collected (C13, C18, E15) --------------------------
  @high
  Scenario: Multiple violations shown in single prompt (E15)
    Given a project with permission budget allowing no filesystem.read and no network.outbound
    And a skill requesting filesystem.read "./" and network.outbound "api.example.com"
    When I run "tank install @org/skill" interactively
    Then the prompt lists both filesystem.read and network.outbound violations
    And the skill name is shown in the prompt

  # -- No violation = no prompt (E16) -----------------------------------------
  @high
  Scenario: No prompt when permissions are within budget (E16)
    Given a project with permission budget allowing filesystem.read "./"
    And a skill requesting filesystem.read "./"
    When I run "tank install @org/skill" interactively
    Then no permission prompt is shown
    And the install succeeds
