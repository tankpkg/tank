# Intent: .idd/modules/search/INTENT.md
# Layer: Examples (E1–E10), Constraints (C1–C6)

@search @real-db
Feature: Skill discovery via hybrid search
  As a user, CLI agent, or MCP tool
  I need to find skills by name, organization, description, or approximate query
  So that I can discover relevant skills without knowing the exact spelling

  Background:
    Given a set of published skills in the registry:
      | name                | description                              |
      | @{org}/react        | React patterns for production apps       |
      | @{org}/react-hooks  | Custom React hooks collection            |
      | @{org}/clean-code   | Code quality and refactoring patterns    |
      | @{org}/seo-audit    | SEO audit and optimization tools         |
      | @{org}/auth-patterns| Authentication and authorization helpers |

  # ── Exact & partial name matching (C1, C3) ──────────────────────────

  @high
  Scenario: Exact full name returns the skill as the top result (E1)
    When I search for the full scoped name "@{org}/react"
    Then the first result is "@{org}/react"

  @high
  Scenario: Partial name prefix matches multiple skills (E2)
    When I search for "{org}/rea"
    Then the results contain "@{org}/react"
    And the results contain "@{org}/react-hooks"

  @high
  Scenario: Skill-name part after slash matches directly (E6)
    When I search for "clean-code"
    Then the first result name contains "clean-code"

  # ── Organization-scoped browsing (C1) ───────────────────────────────

  @high
  Scenario: Searching by org prefix returns all skills in that org (E3)
    When I search for "@{org}"
    Then the results contain all 5 seeded skills

  # ── Typo tolerance via trigram similarity (C1, C2) ──────────────────

  @high
  Scenario: Misspelled query finds the intended skill via trigram (E4)
    When I search for "recat"
    Then at least one result name contains "react"

  # ── Full-text search on description (C1) ────────────────────────────

  @medium
  Scenario: Description keyword matches via full-text search (E5)
    When I search for "refactoring"
    Then at least one result name contains "clean-code"

  # ── Ranking order (C3) ─────────────────────────────────────────────

  @high
  Scenario: Exact name ranks above partial matches (E7)
    When I search for the full scoped name "@{org}/react"
    Then "@{org}/react" ranks above "@{org}/react-hooks"

  @medium
  Scenario: Name-contains match ranks above description-only match (E8)
    When I search for "auth"
    Then the first result name contains "auth"

  # ── Safety & edge cases (C4) ───────────────────────────────────────

  @high
  Scenario: Completely unrelated query returns no seeded results (E9)
    When I search for "zzzyyyxxx-nonexistent-42"
    Then no results match the seeded org

  @high
  Scenario: Special characters and SQL injection attempts are safe (E10)
    When I search for each of "@", "/", "%", "_", "'; DROP TABLE skills;--", "🚀"
    Then every query completes without error
