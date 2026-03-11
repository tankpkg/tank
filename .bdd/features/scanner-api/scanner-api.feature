# Intent: .idd/modules/scanner-api/INTENT.md
# Layer: Constraints (C1–C5), Examples (E1–E5)

@scanner-api
Feature: Python scanner API integration
  As the Tank registry
  I need the scanner HTTP API to accept tarball URLs and return structured verdicts
  So that security analysis results can be stored and displayed for each skill version

  # ── Health check (C4) ────────────────────────────────────────────────
  @high
  Scenario: GET /health returns 200 with status ok (E1)
    When I call GET /health on the scanner API
    Then the response is 200
    And the response contains "status": "ok"

  # ── Scan request validation (C5) ─────────────────────────────────────
  @high
  Scenario: POST /api/analyze/scan with missing tarball_url returns 422 (E3)
    When I POST to /api/analyze/scan without the "tarball_url" field
    Then the response is 422

  # ── Structured scan response (C2) ────────────────────────────────────
  @high
  Scenario: POST /api/analyze/scan returns verdict and findings (E2)
    Given the scanner is running and a test tarball URL is available
    When I POST to /api/analyze/scan with a valid tarball_url, version_id, manifest, and permissions
    Then the response is 200
    And the response contains "verdict"
    And the response contains "findings"
    And the response contains "stage_results"
    And the response contains "duration_ms"

  # ── Verdict values (C3) ───────────────────────────────────────────────
  @high
  Scenario: Verdict is one of the four valid values (E4)
    Given a scan has been completed
    Then the "verdict" field is one of: "pass", "pass_with_notes", "flagged", "fail"
