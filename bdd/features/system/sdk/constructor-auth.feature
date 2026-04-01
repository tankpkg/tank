Feature: SDK Constructor and Authentication
  As a developer integrating Tank programmatically
  I want to create a TankClient with flexible auth options
  So that I can use the SDK in any environment (local dev, CI, server)

  # E1, C5: Auto-discover from config file
  Scenario: Constructor auto-discovers token from config file
    Given a valid Tank config file at "~/.tank/config.json" with token "tank_test_abc"
    When I create a TankClient with no arguments
    And I call whoami()
    Then the response contains the authenticated user info

  # E2, C5: No config, no env — unauthenticated client
  Scenario: Constructor creates unauthenticated client when no credentials exist
    Given no Tank config file exists
    And the TANK_TOKEN environment variable is not set
    When I create a TankClient with no arguments
    And I call whoami()
    Then the result is null

  # C5: TANK_TOKEN env var fallback
  Scenario: Constructor discovers token from TANK_TOKEN environment variable
    Given no Tank config file exists
    And the TANK_TOKEN environment variable is set to "tank_env_token"
    When I create a TankClient with no arguments
    And I call whoami()
    Then the response contains the authenticated user info

  # E3, C6: Explicit token overrides everything
  Scenario: Explicit token overrides config file and environment
    Given a valid Tank config file with token "tank_config_token"
    And the TANK_TOKEN environment variable is set to "tank_env_token"
    When I create a TankClient with token "tank_explicit_token"
    Then all HTTP requests use Authorization header "Bearer tank_explicit_token"

  # E4, C7: Custom registry URL
  Scenario: Custom registry URL overrides default
    When I create a TankClient with registryUrl "https://my-tank.internal"
    And I call search("react")
    Then the HTTP request is sent to "https://my-tank.internal/api/v1/search"

  # C8: User-Agent header
  Scenario: All requests include User-Agent header
    Given an authenticated TankClient
    When I call search("react")
    Then the HTTP request includes header "User-Agent" matching "tankpkg-sdk/*"

  # E5, C11: Invalid token → TankAuthError
  Scenario: Invalid token throws TankAuthError on API call
    When I create a TankClient with token "invalid_garbage_token"
    And I call search("react")
    Then a TankAuthError is thrown with status 401

  # E6, C9: Rate limit → retry with backoff
  Scenario: 429 response triggers exponential backoff retry
    Given an authenticated TankClient
    And the server returns 429 for the first 2 requests then 200
    When I call search("react")
    Then the SDK retries with exponential backoff
    And the final response is successful

  # C9: Max retries exceeded
  Scenario: Persistent 429 throws TankNetworkError after max retries
    Given an authenticated TankClient with maxRetries 3
    And the server always returns 429
    When I call search("react")
    Then a TankNetworkError is thrown
    And the SDK made exactly 4 requests (1 original + 3 retries)

  # E7, C10: Network failure
  Scenario: Unreachable server throws TankNetworkError
    When I create a TankClient with registryUrl "https://unreachable.invalid"
    And I call search("react")
    Then a TankNetworkError is thrown with a connection error cause
