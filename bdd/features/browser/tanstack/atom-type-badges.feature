# Intent: idd/modules/atom-type-badges/INTENT.md
# Layer: Constraints (C6–C12), Examples (E9–E14)

@atom-type-badges
@browser
Feature: Atom type badges in the registry UI
  As a registry visitor
  I want to see what atom types a package contains
  So I can choose the right package without reading the README

  Background:
    Given a skill "@tank/has-atoms" exists with atoms of kinds "hook" and "agent"
    And a skill "@tank/legacy-skill" exists with no atoms

  # ── Browse cards ──────────────────────────────────────────────────────────
  @atom-type-badges
  @browser
  Scenario: Browse cards show atom kind badges (E9)
    When I visit the skills browse page
    Then every skill card has an atom kind badges container

  @atom-type-badges
  @browser
  Scenario: Card for a composite skill shows Bundle badge (E9)
    When I visit the skills browse page
    Then the card for "@tank/has-atoms" shows a "Bundle" badge

  # ── Detail page header ────────────────────────────────────────────────────
  @atom-type-badges
  @browser
  Scenario: Detail header shows atom badges (E10)
    When I visit the skill detail page for "@tank/has-atoms"
    Then the atom badges container is visible in the header
    And I see a badge with text "Agent"
    And I see a badge with text "Hook"

  # ── Sidebar ───────────────────────────────────────────────────────────────
  @atom-type-badges
  @browser
  Scenario: Sidebar shows Type row with atom badges (E11)
    When I visit the skill detail page for "@tank/has-atoms"
    Then the desktop sidebar contains a "Type" label
    And the Type row contains atom badges

  # ── Atoms tab ─────────────────────────────────────────────────────────────
  @atom-type-badges
  @browser
  Scenario: Atoms tab is visible for a package with atoms (E12)
    When I visit the skill detail page for "@tank/has-atoms"
    Then the Atoms tab trigger is visible

  @atom-type-badges
  @browser
  Scenario: Atoms tab shows intro callout and atom cards (E12)
    When I visit the skill detail page for "@tank/has-atoms"
    And I click the Atoms tab
    Then the atoms intro callout is visible
    And at least one atom card is visible

  @atom-type-badges
  @browser
  Scenario: Atoms tab is hidden for a legacy skill (E13)
    When I visit the skill detail page for "@tank/legacy-skill"
    Then the Atoms tab trigger is not present

  # ── Atom kind filter ──────────────────────────────────────────────────────
  @atom-type-badges
  @browser
  Scenario: Selecting an atom kind filter updates the URL (E14)
    When I visit the skills browse page
    And I click the "Agent" atom type filter in the sidebar
    Then the URL contains "atomKind=agent"

  @atom-type-badges
  @browser
  Scenario: Atom kind filter only shows matching packages (E14)
    When I visit the skills browse page
    And I click the "Agent" atom type filter in the sidebar
    Then "@tank/has-atoms" appears in the results
    And "@tank/legacy-skill" does not appear in the results
