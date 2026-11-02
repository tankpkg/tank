# Intent: idd/modules/login/INTENT.md C21, E30, E31
# Verified by e2e/cli/login-flow.e2e.test.ts and the isolated real PostgreSQL CA tests.
@login
@postgres-tls
Feature: Authenticated PostgreSQL connections for registry login
  As a registry operator
  I want a configured database CA to protect every login database connection
  So that passwords, CLI session state, and issued tokens are not sent to an impersonator

  Scenario: A trusted PostgreSQL server accepts the full login flow
    Given the registry database and login store are configured with the PostgreSQL server's CA
    When a user completes CLI login through the real registry and browser
    Then both database connections use verified TLS
    And the CLI receives a usable token

  Scenario Outline: An untrusted PostgreSQL server cannot receive authentication data
    Given the registry database and login store are configured with a PostgreSQL CA
    And the server presents an <invalid> certificate
    When the registry attempts a login database operation
    Then the connection fails before sending PostgreSQL authentication data
    And no plaintext connection is attempted

    Examples:
      | invalid    |
      | untrusted  |
      | wrong-host |

  Scenario: Startup and setup cannot bypass a configured database CA
    Given the registry is configured with a PostgreSQL CA
    When startup or setup contacts a server with a wrong-host certificate
    Then the connection fails before sending PostgreSQL authentication data
    And no plaintext connection is attempted

  Scenario: A schema push cannot silently ignore the configured CA
    Given the registry is configured with a PostgreSQL CA
    When Drizzle Kit is invoked for a schema push
    Then it fails before connecting and requires a separately verified migration procedure

  Scenario: Direct PostgreSQL TLS is not used with a custom CA
    Given the registry is configured with a PostgreSQL CA
    When direct TLS negotiation is selected through the URL or environment
    Then the connection fails before any network traffic
