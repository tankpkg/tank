# Intent: idd/modules/conversion-skills-list/INTENT.md

@skills
@conversion
Feature: Skills list conversion improvements
  As a visitor browsing packages
  I need to understand why Tank is different and how to install packages
  So that I can go from browsing to installing

  Background:
    Given public skills have been published

  # ── Value proposition banner ─────────────────────────────────

  @conversion
  @banner
  Scenario: Skills page shows a value proposition banner for first visit
    When I visit the skills page with a clean localStorage
    Then I see a banner explaining Tank's security value
    And the banner contains a link to learn more

  @conversion
  @banner
  Scenario: Banner can be dismissed and stays dismissed
    When I visit the skills page with a clean localStorage
    And I dismiss the value proposition banner
    Then the banner is no longer visible
    When I revisit the skills page
    Then the banner is not shown

  # ── Getting started sidebar ──────────────────────────────────

  @conversion
  @sidebar
  Scenario: Desktop shows getting-started card in filter sidebar
    When I visit the skills page on desktop
    Then I see a getting-started card in the sidebar
    And the card shows CLI install instructions

  @conversion
  @sidebar
  Scenario: Getting-started card is hidden on mobile
    When I visit the skills page on mobile
    Then the getting-started card is not visible

  # ── Skill card install snippets ──────────────────────────────

  @conversion
  @cards
  Scenario: Each skill card shows copyable install command
    When I visit the skills page
    Then each published skill card shows a copyable install command
    And the install command starts with "tank install"

  @conversion
  @cards
  Scenario: Copy button on skill card does not navigate to detail
    When I visit the skills page
    And I click the copy button on a skill card
    Then the install command is copied
    And I remain on the skills page
