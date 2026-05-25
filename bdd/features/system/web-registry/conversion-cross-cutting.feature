# Intent: idd/modules/conversion-cross-cutting/INTENT.md

@conversion
@cross-cutting
Feature: Cross-cutting conversion improvements
  As a developer using the Tank ecosystem
  I need contextual CTAs, learnable interface, and opt-in telemetry
  So that I can discover Tank's value from anywhere in the product

  # ── Docs bottom CTA ─────────────────────────────────────────
  @docs
  @cta
  Scenario: Every docs page has a bottom CTA after the article
    When I fetch the docs overview page HTML
    Then the HTML should contain a post-article call to action
    And the CTA should contain an install command

  @docs
  @cta
  Scenario: Docs CTA appears before prev/next navigation
    When I fetch the docs overview page HTML
    Then the CTA should appear before the document navigation links

  # ── Command palette suggestions ──────────────────────────────
  @command-menu
  Scenario: Command menu includes educational suggestions
    When I inspect the command menu source
    Then the command menu should include a "What is Tank?" suggestion
    And the suggestion should link to the docs overview

  # ── Section anchors on homepage ─────────────────────────────
  @homepage
  @anchors
  Scenario: Key homepage sections have scroll targets
    When I fetch the homepage HTML
    Then the HTML should contain an element with id "vault"
    And the HTML should contain an element with id "atoms"
    And the HTML should contain an element with id "how-it-works"
    And the HTML should contain an element with id "why-tank"

  # ── CLI telemetry opt-in ────────────────────────────────────
  @cli
  @telemetry
  Scenario: Telemetry is disabled by default for new installations
    Given a fresh Tank installation without telemetry config
    When I run any tank command
    Then no telemetry event is sent

  @cli
  @telemetry
  Scenario: User can opt into telemetry
    Given a fresh Tank installation without telemetry config
    When I run "tank telemetry on"
    Then the config file contains "telemetry": true
    And a cli_opted_in event is sent

  @cli
  @telemetry
  Scenario: User can opt out of telemetry
    Given telemetry is enabled
    When I run "tank telemetry off"
    Then the config file contains "telemetry": false
    And a cli_opted_out event is sent

  @cli
  @telemetry
  Scenario: User can check telemetry status
    Given telemetry is enabled
    When I run "tank telemetry status"
    Then the output indicates telemetry is enabled

  @cli
  @telemetry
  Scenario: Environment variable overrides config
    Given telemetry is enabled in config
    When I run a command with TANK_TELEMETRY=0
    Then no telemetry event is sent

  @cli
  @telemetry
  Scenario: Commands send events when telemetry is enabled
    Given telemetry is enabled
    When I run "tank install" on a package
    Then a cli_install event is sent
    And the event does not contain the package name

  @cli
  @telemetry
  Scenario: Telemetry does not block command execution
    Given telemetry is enabled but the telemetry endpoint is unreachable
    When I run "tank search something"
    Then the command completes successfully
    And the exit code is 0
