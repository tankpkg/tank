# Intent: idd/modules/vault/INTENT.md

@vault
@tokenizer
Feature: Format-preserving fake credential generation
  As the Tank Vault proxy
  I need to generate fake credentials that match the original format
  So that the AI model treats fakes as real tokens and behaves normally
  while the real value never leaves the local machine

  # ── Full happy flow ──────────────────────────────────────────────────────
  @high
  @happy-flow
  Scenario: End-to-end — tokenize a Stripe key, verify format, confirm consistency and uniqueness
    Given a vault session is active
    And a real credential "sk_live_4eC39HqLyjWDarjtT1zdp7dc" with pattern "stripe_secret"
    And a real credential "sk_live_9zZ99YxLmNoPqRsTuVwXyZ01" with pattern "stripe_secret"
    When the tokenizer generates fakes for both credentials
    Then fake 1 starts with "sk_live_" and has length 32
    And fake 2 starts with "sk_live_" and has length 32
    And fake 1 is not equal to the original "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And fake 2 is not equal to the original "sk_live_9zZ99YxLmNoPqRsTuVwXyZ01"
    And fake 1 is not equal to fake 2
    When the tokenizer generates a fake for "sk_live_4eC39HqLyjWDarjtT1zdp7dc" again
    Then it returns the same fake as fake 1

  # ── Format preservation (C5) ─────────────────────────────────────────────
  @high
  Scenario: Fake Stripe key preserves prefix and length
    Given a real credential "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And the detected pattern is "stripe_secret"
    When the tokenizer generates a fake
    Then the fake starts with "sk_live_"
    And the fake has the same total length as the original
    And the fake suffix contains only alphanumeric characters
    And the fake is not equal to the original

  @high
  Scenario: Fake AWS key preserves AKIA prefix and length
    Given a real credential "AKIAIOSFODNN7EXAMPLE"
    And the detected pattern is "aws_access_key"
    When the tokenizer generates a fake
    Then the fake starts with "AKIA"
    And the fake has the same total length as the original
    And the fake suffix contains only uppercase alphanumeric characters

  @high
  Scenario: Fake GitHub PAT preserves ghp_ prefix and length
    Given a real credential "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234"
    And the detected pattern is "github_pat"
    When the tokenizer generates a fake
    Then the fake starts with "ghp_"
    And the fake has the same total length as the original

  @high
  Scenario: Fake ElevenLabs key preserves elvn_ prefix and length
    Given a real credential "elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4"
    And the detected pattern is "elevenlabs_key"
    When the tokenizer generates a fake
    Then the fake starts with "elvn_"
    And the fake has the same total length as the original

  @high
  Scenario: Fake OpenAI key preserves sk- prefix and length
    Given a real credential "sk-proj-abc123def456ghi789jkl012mno345pqr678"
    And the detected pattern is "openai_key"
    When the tokenizer generates a fake
    Then the fake starts with "sk-proj-"
    And the fake has the same total length as the original

  @high
  Scenario: Fake JWT preserves three-segment dot structure
    Given a real credential "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    And the detected pattern is "jwt_token"
    When the tokenizer generates a fake
    Then the fake contains exactly 2 dots
    And each segment starts with base64url characters
    And the fake has the same total length as the original

  # ── Session consistency (C6) ─────────────────────────────────────────────
  @high
  Scenario: Same real token always produces the same fake within a session
    Given a vault session is active
    And a real credential "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    When the tokenizer generates a fake the first time
    And the tokenizer generates a fake the second time for the same credential
    Then both fakes are identical

  # ── Uniqueness (C7) ──────────────────────────────────────────────────────
  @high
  Scenario: Different real tokens produce different fakes
    Given a vault session is active
    And a real credential "sk_live_aaaaaaaaaaaaaaaaaaaaaa"
    And a real credential "sk_live_bbbbbbbbbbbbbbbbbbbbbb"
    When the tokenizer generates fakes for both
    Then the two fakes are different from each other
    And both fakes start with "sk_live_"

  # ── Cryptographic randomness (C8) ────────────────────────────────────────
  @medium
  Scenario: Fake token is not derivable from the real token without vault state
    Given a real credential "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    When the tokenizer generates a fake
    Then the fake suffix has no substring overlap longer than 4 characters with the original suffix

  # ── Edge cases ──────────────────────────────────────────────────────────
  @medium
  @edge-case
  Scenario: Generating 500 unique fakes for the same pattern — no collisions
    Given a vault session is active
    When the tokenizer generates fakes for 500 different Stripe secret keys
    Then all 500 fakes are unique
    And all 500 fakes start with "sk_live_"
    And all 500 fakes have the correct length

  @medium
  @edge-case
  Scenario: Very long credential (256 characters)
    Given a real credential that is 256 characters long with prefix "token_"
    And the detected pattern is "generic_token"
    When the tokenizer generates a fake
    Then the fake starts with "token_"
    And the fake has length 256
    And the fake suffix contains only alphanumeric characters

  @medium
  @edge-case
  Scenario: Credential whose suffix is entirely numeric
    Given a real credential "pk_test_000000000000000000000000"
    And the detected pattern is "stripe_publishable"
    When the tokenizer generates a fake
    Then the fake starts with "pk_test_"
    And the fake suffix contains only numeric characters
    And the fake has the same total length as the original

  @medium
  @edge-case
  Scenario: Database URL with special characters in password preserves structure
    Given a real credential "postgresql://user:p%40ssw0rd@host:5432/db"
    And the detected pattern is "database_url"
    When the tokenizer generates a fake
    Then the fake starts with "postgresql://"
    And the fake contains "@" and ":" structural separators
    And the fake has the same total length as the original

  @low
  @edge-case
  Scenario: New session produces different fakes for the same real credential
    Given a vault session is active with credential "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And the tokenizer generated fake "sk_live_AAAAAAAAAAAAAAAAAAAAAA" in session 1
    When a new vault session starts
    And the tokenizer generates a fake for the same credential
    Then the new fake is different from "sk_live_AAAAAAAAAAAAAAAAAAAAAA"
