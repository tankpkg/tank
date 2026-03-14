Feature: Homepage first-time visitor UX
  As a developer who uses AI coding agents (Claude Code, Cursor, etc.)
  I want to understand what Tank is within the first screen
  So that I can decide whether it solves my problem without scrolling

  Background:
    Given I navigate to the Tank homepage

  Scenario: Hero section defines "agent skills" in plain language
    Then I should see a plain-language definition of "agent skills" in the hero section
    And the definition should not assume prior knowledge of the term

  Scenario: Hero section identifies the target audience
    Then I should see text identifying the audience as developers using AI coding agents
    And the audience statement should be visible without scrolling on a 1280px viewport

  Scenario: Security problem is visible above or immediately below the fold
    Then I should see a reference to the security risk of unverified agent skills
    And the risk framing should be visible within the first two sections

  Scenario: Plain-language "What is Tank?" explanation appears before feature grid
    Then I should see a beginner-friendly explanation of what Tank does
    And the explanation should appear before the technical feature cards

  Scenario: Primary CTA is visible without scrolling on desktop
    Then I should see a primary call-to-action button in the hero section
    And the button should be visible without scrolling on a 1280px wide viewport

  Scenario: Value proposition is understandable in under 5 seconds
    Given I read only the hero headline and subheadline
    Then I can answer "what is Tank" without reading further
    And I can answer "who is Tank for" without reading further
    And I can answer "why does Tank exist" without reading further
