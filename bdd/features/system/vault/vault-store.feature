# Intent: idd/modules/vault/INTENT.md

@vault
@vault-store
Feature: Bidirectional credential vault store
  As the Tank Vault proxy
  I need a store that maps real credentials to fakes and fakes to reals
  So that outgoing requests get redacted and incoming responses get restored

  # ── Full happy flow ──────────────────────────────────────────────────────

  @high
  @happy-flow
  Scenario: End-to-end — store multiple credentials, lookup both directions, clear on session end
    Given an empty vault store
    When I store a mapping from real "sk_live_REAL_AAA" to fake "sk_live_FAKE_XXX" with pattern "stripe_secret"
    And I store a mapping from real "AKIAEXAMPLE12345" to fake "AKIAFAKEABCDE678" with pattern "aws_access_key"
    And I store a mapping from real "ghp_realtoken1234567890abcdef" to fake "ghp_faketoken9876543210fedcba" with pattern "github_pat"
    Then the vault contains 3 mappings
    And looking up real "sk_live_REAL_AAA" returns fake "sk_live_FAKE_XXX"
    And looking up fake "AKIAFAKEABCDE678" returns real "AKIAEXAMPLE12345"
    And looking up real "ghp_realtoken1234567890abcdef" returns fake "ghp_faketoken9876543210fedcba"
    And looking up fake "sk_live_FAKE_XXX" returns real "sk_live_REAL_AAA"
    When the session ends
    Then the vault contains 0 mappings
    And looking up real "sk_live_REAL_AAA" returns null
    And looking up fake "sk_live_FAKE_XXX" returns null

  # ── Bidirectional mapping (C9) ──────────────────────────────────────────

  @high
  Scenario: Store a mapping and retrieve in both directions
    Given an empty vault store
    When I store a mapping from real "sk_live_REAL123" to fake "sk_live_FAKE456"
    Then looking up real "sk_live_REAL123" returns fake "sk_live_FAKE456"
    And looking up fake "sk_live_FAKE456" returns real "sk_live_REAL123"

  @high
  Scenario: Store multiple mappings without collision
    Given an empty vault store
    When I store a mapping from real "sk_live_AAA" to fake "sk_live_XXX"
    And I store a mapping from real "AKIAEXAMPLE1" to fake "AKIAFAKEKEY2"
    Then the vault contains 2 mappings
    And looking up fake "sk_live_XXX" returns real "sk_live_AAA"
    And looking up fake "AKIAFAKEKEY2" returns real "AKIAEXAMPLE1"

  @high
  Scenario: Looking up a value not in the vault returns null
    Given an empty vault store
    When I look up real "sk_live_DOESNOTEXIST"
    Then the result is null

  # ── Session scoping (C11) ────────────────────────────────────────────────

  @high
  Scenario: Vault is cleared when session ends
    Given a vault store with 3 credential mappings
    When the session ends
    Then the vault contains 0 mappings

  # ── Logging safety (C12) ─────────────────────────────────────────────────

  @high
  Scenario: Vault operations never log real credential values
    Given a vault store with logging enabled
    When I store a mapping from real "sk_live_SUPERSECRET" to fake "sk_live_FAKESAFE01"
    And I look up the mapping
    Then the log output does not contain "sk_live_SUPERSECRET"
    And the log output may contain "sk_live_FAKESAFE01"
    And the log output may contain the pattern ID

  # ── Edge cases ──────────────────────────────────────────────────────────

  @medium
  @edge-case
  Scenario: Storing the same real credential twice is idempotent
    Given an empty vault store
    When I store a mapping from real "sk_live_AAA" to fake "sk_live_XXX"
    And I store a mapping from real "sk_live_AAA" to fake "sk_live_XXX"
    Then the vault contains 1 mapping
    And looking up real "sk_live_AAA" returns fake "sk_live_XXX"

  @medium
  @edge-case
  Scenario: Updating an existing mapping replaces the fake
    Given an empty vault store
    When I store a mapping from real "sk_live_AAA" to fake "sk_live_OLD"
    And I store a mapping from real "sk_live_AAA" to fake "sk_live_NEW"
    Then the vault contains 1 mapping
    And looking up real "sk_live_AAA" returns fake "sk_live_NEW"
    And looking up fake "sk_live_OLD" returns null
    And looking up fake "sk_live_NEW" returns real "sk_live_AAA"

  @medium
  @edge-case
  Scenario: Vault with 10000 mappings — lookup remains fast
    Given a vault store with 10000 credential mappings
    When I look up the 5000th real credential
    Then the result is returned in under 1ms

  @medium
  @edge-case
  Scenario: Vault correctly handles credentials with overlapping substrings
    Given an empty vault store
    When I store a mapping from real "sk_live_ABC" to fake "sk_live_XYZ"
    And I store a mapping from real "sk_live_ABCDEF" to fake "sk_live_XYZUVW"
    Then the vault contains 2 mappings
    And looking up real "sk_live_ABC" returns fake "sk_live_XYZ"
    And looking up real "sk_live_ABCDEF" returns fake "sk_live_XYZUVW"

  @medium
  @edge-case
  Scenario: Bulk replacement — replace all real values in a string with fakes
    Given a vault store with:
      | real                    | fake                    |
      | sk_live_REAL1           | sk_live_FAKE1           |
      | AKIAEXAMPLE             | AKIAFAKEFAKE            |
    When I call bulk replace on text "Use sk_live_REAL1 and AKIAEXAMPLE"
    Then the result is "Use sk_live_FAKE1 and AKIAFAKEFAKE"

  @medium
  @edge-case
  Scenario: Bulk restore — replace all fake values in a string with reals
    Given a vault store with:
      | real                    | fake                    |
      | sk_live_REAL1           | sk_live_FAKE1           |
      | AKIAEXAMPLE             | AKIAFAKEFAKE            |
    When I call bulk restore on text "curl -H 'Bearer sk_live_FAKE1' --key AKIAFAKEFAKE"
    Then the result is "curl -H 'Bearer sk_live_REAL1' --key AKIAEXAMPLE"

  @low
  @edge-case
  Scenario: Bulk replace on text with no matching credentials returns unchanged text
    Given a vault store with:
      | real                    | fake                    |
      | sk_live_REAL1           | sk_live_FAKE1           |
    When I call bulk replace on text "No credentials in this text"
    Then the result is "No credentials in this text"
