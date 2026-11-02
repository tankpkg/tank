# Intent: idd/modules/login/INTENT.md
# Layer: Constraints and examples

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
  Scenario: A supported CLI can start browser login (E12)
    When a supported CLI initiates a browser login with its generated request
    Then the response is 200
    And the response contains "authUrl"
    And the response contains "sessionCode"

  @high
  Scenario: A user authorizes the CLI from a real browser (E22)
    Given an authenticated user opens the waiting CLI session in a browser
    When the user clicks Authorize
    Then the browser confirms the authorization
    And the CLI saves a token that authenticates with the registry

  @high
  Scenario: A session store outage is not reported as an invalid request (E13)
    Given the registry session store is unavailable
    When a supported CLI initiates a browser login with its generated request
    Then the response indicates a server error
    And the error does not expose internal connection details

  @high
  Scenario: An exchange store failure asks the user to restart login (E25)
    Given the registry session store is unavailable or its exchange outcome is indeterminate
    When a CLI exchanges a valid session request
    Then the response indicates a server error and asks the user to start login again
    And the error does not expose internal connection details

  @high
  Scenario: An authorization store failure asks the user to restart login (E26)
    Given the user is authenticated and the registry session store is unavailable
    When the user authorizes a valid CLI session request
    Then the response indicates a server error and asks the user to start login again
    And the error does not expose internal connection details

  @high
  Scenario: An old replica cannot resurrect a consumed new session (E27)
    Given an authorized new session was consumed
    When an old replica writes a stale legacy session with the same identifier
    Then the new session remains consumed and cannot issue another token

  @high
  Scenario: An expired PostgreSQL email rate limit starts a new window (E14)
    Given an email rate-limit counter has expired in the PostgreSQL store
    When the counter is incremented
    Then the new counter value is 1

  @high
  Scenario Outline: An authorized session can be exchanged only once on a consistent primary (E15)
    Given an authorized login session in the <store> store
    When multiple matching exchanges run concurrently
    Then exactly one exchange succeeds
    And every other exchange returns 400

    Examples:
      | store      |
      | memory     |
      | Redis      |
      | PostgreSQL |

  @high
  Scenario Outline: Pending and mismatched exchanges do not consume a session (E16)
    Given a pending login session in the <store> store
    When an exchange is attempted before authorization
    Then the exchange returns 400 and the session stays pending
    When the session is authorized and an exchange uses a mismatched state
    Then the exchange returns 400 and the session stays authorized
    And a later exchange with the matching state succeeds

    Examples:
      | store      |
      | memory     |
      | Redis      |
      | PostgreSQL |

  @high
  Scenario Outline: Concurrent authorization cannot resurrect a consumed session (E17)
    Given a pending login session in the <store> store
    When multiple users authorize it concurrently and an exchange consumes it
    Then at most one authorization succeeds
    And the consumed session cannot be exchanged again

    Examples:
      | store      |
      | memory     |
      | Redis      |
      | PostgreSQL |

  @high
  Scenario: A delayed PostgreSQL rate-window update uses database time (E18)
    Given an expired PostgreSQL email rate counter is locked
    When a new window waits longer than its duration for the lock
    Then the counter restarts at 1 after the lock is released
    And an immediate increment returns 2

  @high
  Scenario: A session expiring while an exchange waits cannot issue a token (E19)
    Given an authorized PostgreSQL login session is locked
    When an exchange waits for the lock until the session expires
    Then the exchange returns 400 without issuing a token

  @high
  Scenario: A session expiring while authorization waits stays expired (E21)
    Given a pending PostgreSQL login session is locked
    When authorization waits for the lock until the session expires
    Then authorization fails without reviving the session

  @high
  Scenario: A session cannot outlive its logical login deadline (E23)
    Given a pending or authorized login session remains in the store past its five-minute deadline
    When authorization or exchange reaches the atomic store operation
    Then the operation fails without extending the session or issuing a token

  @high
  Scenario: A first PostgreSQL rate counter waits for a rolled-back insert (E24)
    Given an uncommitted conflicting insert holds a new rate-counter key
    When the first increment waits longer than the window and the conflicting insert rolls back
    Then the counter starts at 1 with a new window
    And an immediate increment returns 2

  @high
  Scenario Outline: Pre-cutover CLI sessions fail closed (E20)
    Given a login session created before the store-clock cutover in the <store> store
    When the CLI attempts to complete that session
    Then the session is rejected without issuing a token
    And the same CLI can start a fresh login

    Examples:
      | store      |
      | memory     |
      | Redis      |
      | PostgreSQL |

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
  @high
  @selfhosted
  Scenario: authUrl uses configured instance URL, not frozen default (E10)
    Given APP_URL is configured as "https://tank.acme.corp" in the database
    And process.env.APP_URL has been hydrated from the database
    When I initiate a CLI login session
    Then the response is 200
    And the "authUrl" starts with "https://tank.acme.corp"
    And the "authUrl" does not contain "localhost"

  @high
  @selfhosted
  Scenario: authUrl derived from request headers when APP_URL is localhost (E11)
    Given APP_URL defaults to "http://localhost:5555"
    And the request includes header "Host" with value "tank.acme.corp"
    And the request includes header "X-Forwarded-Proto" with value "https"
    When I initiate a CLI login session
    Then the response is 200
    And the "authUrl" starts with "https://tank.acme.corp"
    And the "authUrl" does not contain "localhost"
