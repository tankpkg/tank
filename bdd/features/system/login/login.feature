# Intent: idd/modules/login/INTENT.md
# Layer: Constraints (C1–C8), Examples (E1–E6)

@login
@real-redis
Feature: CLI OAuth login flow via browser handshake
  As a CLI user
  I need to authenticate via GitHub OAuth through the browser
  So that the CLI has a token to publish, install, and access private skills

  # ── Start session (C1, C2) ────────────────────────────────────────────
  @high
  Scenario: Starting a login session returns authUrl and sessionCode (E1)
    When I initiate a CLI login session
    Then the response is 200
    And the response contains "authUrl"
    And the response contains "sessionCode"

  @high
  Scenario: Start without state returns 400 (E2)
    When I initiate a CLI login session without providing a state
    Then the response is 400
    And the error message contains "state"

  # ── Exchange before authorization (C3) ───────────────────────────────
  @high
  Scenario: Polling exchange before authorization returns 400 (E3)
    Given a pending login session exists with a sessionCode
    When I exchange the pending session code for a token
    Then the response is 400

  # ── Exchange after authorization (C4) ────────────────────────────────
  @high
  Scenario: Polling exchange after authorization returns token and user (E4)
    Given a login session has been authorized with a token and user
    When I exchange the authorized session code for a token
    Then the response is 200
    And the response contains "token"
    And the response contains "user"

  # ── State validation (C7) ─────────────────────────────────────────────
  @medium
  Scenario: Exchange with mismatched state is rejected (E5)
    Given a pending login session exists
    When I exchange the session code with a mismatched state
    Then the response is 400 or 404

  # ── On-prem authUrl resolution (C9, C10) ─────────────────────────────
  @high @selfhosted
  Scenario: authUrl uses configured instance URL, not frozen default (E10)
    Given APP_URL is configured as "https://tank.acme.corp" in the database
    And process.env.APP_URL has been hydrated from the database
    When I initiate a CLI login session
    Then the response is 200
    And the "authUrl" starts with "https://tank.acme.corp"
    And the "authUrl" does not contain "localhost"

  @high @selfhosted
  Scenario: authUrl derived from request headers when APP_URL is localhost (E11)
    Given APP_URL defaults to "http://localhost:5555"
    And the request includes header "Host" with value "tank.acme.corp"
    And the request includes header "X-Forwarded-Proto" with value "https"
    When I initiate a CLI login session
    Then the response is 200
    And the "authUrl" starts with "https://tank.acme.corp"
    And the "authUrl" does not contain "localhost"
