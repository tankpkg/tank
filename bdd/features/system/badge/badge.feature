# Intent: idd/modules/badge/INTENT.md
# Layer: Constraints (C1–C4), Examples (E1–E3)

@badge
@real-db
Feature: Audit score SVG badge
  As a skill publisher
  I need a badge URL that renders my skill's audit score as an SVG image
  So that I can embed trust signals in READMEs and documentation

  Background:
    Given a public skill "@{testOrg}/badge-skill" version "1.0.0" exists with audit score 8.5

  # ── SVG content type (C1) ─────────────────────────────────────────────
  @high
  Scenario: Badge response has Content-Type image/svg+xml (E3)
    When I call GET /api/v1/badge/@{testOrg}/badge-skill
    Then the response Content-Type contains "image/svg+xml"

  # ── Badge for known skill (C2) ────────────────────────────────────────
  @high
  Scenario: Badge for known skill contains the audit score (E1)
    When I call GET /api/v1/badge/@{testOrg}/badge-skill
    Then the response is 200
    And the SVG body contains the audit score value

  # ── Badge for unknown skill (C3) ─────────────────────────────────────
  @high
  Scenario: Badge for unknown skill returns a badge (not 404) (E2)
    When I call GET /api/v1/badge/@{testOrg}/nonexistent-badge-skill
    Then the response is 200
    And the Content-Type is "image/svg+xml"
