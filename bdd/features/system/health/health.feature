# Intent: idd/modules/health/INTENT.md
# Layer: Constraints (C1–C7), Examples (E1–E4)

@health
@real-db
Feature: Health check endpoint for dependency monitoring
  As operations and monitoring infrastructure
  I need a single endpoint that reports the health of all Tank dependencies
  So that I can detect outages and trigger alerts before users are impacted

  # ── Response structure (C1) ───────────────────────────────────────────
  @high
  Scenario: Health check returns structured JSON with all checks (E1)
    When I call GET /api/health
    Then the response status is 200 or 503
    And the response body contains "status"
    And the response body contains "checks"
    And the checks include "database"
    And the checks include "redis"
    And the checks include "storage"
    And the checks include "scanner"

  # ── All healthy → ok (C2) ─────────────────────────────────────────────
  @high
  Scenario: All dependencies healthy returns status ok with HTTP 200 (E1)
    Given all dependencies are healthy
    When I call GET /api/health
    Then the response status is 200
    And "status" is "ok"

  # ── Response shape fields (C6) ────────────────────────────────────────
  @medium
  Scenario: Response includes timestamp and version fields (E4)
    When I call GET /api/health
    Then the response body contains "timestamp"
    And the response body contains "version"

  # ── Degraded status (C3) ──────────────────────────────────────────────
  @medium
  Scenario: Degraded status when 1-2 checks are unhealthy (E3)
    Given database and redis are healthy but storage and scanner are unreachable
    When I call GET /api/health
    Then the response status is 200
    And "status" is "degraded"
