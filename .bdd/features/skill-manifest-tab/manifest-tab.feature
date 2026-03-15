# Intent: .idd/modules/skill-manifest-tab/INTENT.md
# Layer: Constraints (C1–C7), Examples (E1–E8)

@manifest-tab
@web
Feature: Skill Manifest tab on the skill detail page
  As a developer browsing the Tank registry
  I need to see a structured view of a skill's skills.json manifest
  So that I can understand what the skill declares before installing it

  # ── Tab always present (C1, C7) ──────────────────────────────────────
  @high
  Scenario: Manifest tab is always visible on the skill detail page (C1, C7)
    Given I am on the skill detail page for a published skill
    Then I see a tab labelled "Manifest"

  # ── Full manifest rendering (E1) ─────────────────────────────────────
  @high
  Scenario: Manifest tab renders all fields when manifest is present (E1)
    Given I am on the skill detail page for a skill with a full manifest
    When I click the "Manifest" tab
    Then I see the skill name in the manifest view
    And I see the skill version in the manifest view
    And I see the skill description in the manifest view

  # ── Empty state (C2, E2) ─────────────────────────────────────────────
  @high
  Scenario: Manifest tab shows empty state when no manifest is available (C2, E2)
    Given I am on the skill detail page for a skill with no manifest
    When I click the "Manifest" tab
    Then I see "No manifest available" in the manifest view

  # ── Dependencies section (C4, E3, E8) ────────────────────────────────
  @medium
  Scenario: Dependencies section is shown when skills field is present (C4, E8)
    Given I am on the skill detail page for a skill with dependencies
    When I click the "Manifest" tab
    Then I see a "Dependencies" section in the manifest view
    And I see each dependency listed with its version constraint

  @medium
  Scenario: Dependencies section is hidden when no skills field (E3)
    Given I am on the skill detail page for a skill with no dependencies
    When I click the "Manifest" tab
    Then I do not see a "Dependencies" section in the manifest view

  # ── Permissions rendering (C3, E4–E7) ────────────────────────────────
  @medium
  Scenario: Permissions section is shown with human-readable labels (C3, E5)
    Given I am on the skill detail page for a skill with network permissions
    When I click the "Manifest" tab
    Then I see a "Permissions" section in the manifest view
    And I see the network outbound domains listed

  @medium
  Scenario: Permissions section is hidden when no permissions declared (E4)
    Given I am on the skill detail page for a skill with no permissions
    When I click the "Manifest" tab
    Then I do not see a "Permissions" section in the manifest view

  # ── No raw JSON (C5) ─────────────────────────────────────────────────
  @high
  Scenario: Manifest tab does not show a raw JSON dump (C5)
    Given I am on the skill detail page for a skill with a full manifest
    When I click the "Manifest" tab
    Then I do not see a raw JSON block in the manifest view
