# Intent: idd/modules/vault/INTENT.md

@vault
@detector
Feature: Credential detection by format pattern
  As the Tank Vault proxy
  I need to detect credential-shaped values in text by their format (prefix + structure)
  So that I can identify secrets that should not reach AI providers
  without needing to know the actual credential values in advance

  # ── Full happy flow ──────────────────────────────────────────────────────

  @high
  @happy-flow
  Scenario: End-to-end — detect credentials in a realistic agent prompt
    Given text containing:
      """
      I need to call two APIs. First, use the Stripe API with key
      sk_live_4eC39HqLyjWDarjtT1zdp7dc to create a charge. Then call
      the ElevenLabs TTS endpoint using elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4
      to generate audio. Also check the GitHub repo status using
      ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234 as the token.
      The API base URL is https://api.stripe.com/v1 which is not a secret.
      """
    When the detector scans for credential patterns
    Then it returns 3 matches
    And match 1 has pattern "stripe_secret" covering "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And match 2 has pattern "elevenlabs_key" covering "elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4"
    And match 3 has pattern "github_pat" covering "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234"
    And no match covers the URL "https://api.stripe.com/v1"
    And no match result contains the original credential values as a field
    And all matches contain "start", "end", and "pattern_id" fields

  # ── Pattern-based detection (C1, C2) ────────────────────────────────────

  @high
  Scenario: Detects Stripe secret key by prefix and structure
    Given text containing "Use this key: sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"
    And the match span covers "sk_live_4eC39HqLyjWDarjtT1zdp7dc"

  @high
  Scenario: Detects Stripe test key by prefix
    Given text containing "Test key: sk_test_51OeR2LjTyQwGUvn"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"

  @high
  Scenario: Detects Stripe publishable key
    Given text containing "pk_live_TYooMQauvdEDq54NiTphI7jx"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_publishable"

  @high
  Scenario: Detects AWS access key by AKIA prefix
    Given text containing "My key is AKIAIOSFODNN7EXAMPLE"
    When the detector scans for credential patterns
    Then it returns a match with pattern "aws_access_key"
    And the match span covers "AKIAIOSFODNN7EXAMPLE"

  @high
  Scenario: Detects GitHub personal access token
    Given text containing "Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234"
    When the detector scans for credential patterns
    Then it returns a match with pattern "github_pat"

  @high
  Scenario: Detects GitHub OAuth token
    Given text containing "gho_16C7e42F292c6912E7710c838347Ae178B4a"
    When the detector scans for credential patterns
    Then it returns a match with pattern "github_oauth"

  @high
  Scenario: Detects OpenAI API key
    Given text containing "sk-proj-abc123def456ghi789jkl012mno345pqr678"
    When the detector scans for credential patterns
    Then it returns a match with pattern "openai_key"

  @high
  Scenario: Detects ElevenLabs API key
    Given text containing "elvn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4"
    When the detector scans for credential patterns
    Then it returns a match with pattern "elevenlabs_key"

  @high
  Scenario: Detects JWT token
    Given text containing "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    When the detector scans for credential patterns
    Then it returns a match with pattern "jwt_token"

  @high
  Scenario: Detects database connection string with embedded password
    Given text containing "postgresql://admin:s3cretP@ss@db.example.com:5432/mydb"
    When the detector scans for credential patterns
    Then it returns a match with pattern "database_url"

  @high
  Scenario: Detects Slack webhook URL
    Given text containing "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
    When the detector scans for credential patterns
    Then it returns a match with pattern "slack_webhook"

  # ── No false positives (C1) ─────────────────────────────────────────────

  @high
  Scenario: Does not match regular text without credentials
    Given text containing "No credentials here, just regular text"
    When the detector scans for credential patterns
    Then it returns no matches

  @medium
  Scenario: Does not match URLs that look similar to credentials
    Given text containing "The API base URL is https://api.anthropic.com"
    When the detector scans for credential patterns
    Then it returns no matches

  @medium
  Scenario: Does not match short strings that share a prefix
    Given text containing "sk_live is a prefix but this is too short"
    When the detector scans for credential patterns
    Then it returns no matches

  # ── Multiple credentials (C1) ───────────────────────────────────────────

  @high
  Scenario: Detects multiple credentials in the same text
    Given text containing "Two keys: sk_live_abc123def456ghi789 and elvn_xyz789uvw456rst123"
    When the detector scans for credential patterns
    Then it returns 2 matches
    And match 1 has pattern "stripe_secret"
    And match 2 has pattern "elevenlabs_key"

  # ── Safety: never logs real values (C3) ──────────────────────────────────

  @high
  Scenario: Detector returns spans but never includes the matched value in output metadata
    Given text containing "Secret: sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    When the detector scans for credential patterns
    Then the match result contains "start" and "end" indices
    And the match result contains "pattern_id"
    And the match result does not contain the original credential value as a field

  # ── Edge cases ──────────────────────────────────────────────────────────

  @medium
  @edge-case
  Scenario: Credential embedded in JSON string with escaped quotes
    Given text containing '{"api_key": "sk_live_4eC39HqLyjWDarjtT1zdp7dc", "model": "gpt-4"}'
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"
    And the match span covers "sk_live_4eC39HqLyjWDarjtT1zdp7dc"

  @medium
  @edge-case
  Scenario: Credential concatenated in code without whitespace boundaries
    Given text containing "const key='sk_live_4eC39HqLyjWDarjtT1zdp7dc';fetch(url)"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"

  @medium
  @edge-case
  Scenario: Credential in a markdown code block
    Given text containing:
      """
      ```bash
      export STRIPE_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc
      ```
      """
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"

  @medium
  @edge-case
  Scenario: Credential in URL query parameter
    Given text containing "https://api.example.com/webhook?token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234"
    When the detector scans for credential patterns
    Then it returns a match with pattern "github_pat"

  @medium
  @edge-case
  Scenario: Credential at the very start of text
    Given text containing "sk_live_4eC39HqLyjWDarjtT1zdp7dc is the key"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"
    And the match start index is 0

  @medium
  @edge-case
  Scenario: Credential at the very end of text
    Given text containing "The key is sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"
    And the match end index equals the text length

  @medium
  @edge-case
  Scenario: Credential surrounded by unicode text
    Given text containing "API-Schlüssel: sk_live_4eC39HqLyjWDarjtT1zdp7dc を使用してください"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"

  @medium
  @edge-case
  Scenario: Very long text with credential buried deep
    Given text containing 10000 characters of prose followed by "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    When the detector scans for credential patterns
    Then it returns a match with pattern "stripe_secret"
    And detection completes in under 100ms

  @medium
  @edge-case
  Scenario: Text that resembles a credential but uses invalid characters
    Given text containing "sk_live_this-has-dashes-which-are-not-valid!!!!"
    When the detector scans for credential patterns
    Then it returns no matches

  @medium
  @edge-case
  Scenario: AWS secret access key (high-entropy, 40 char base64)
    Given text containing "AWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    When the detector scans for credential patterns
    Then it returns a match with pattern "aws_secret_key"

  @medium
  @edge-case
  Scenario: Two identical credentials in the same text
    Given text containing "First: sk_live_4eC39HqLyjWDarjtT1zdp7dc and again: sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    When the detector scans for credential patterns
    Then it returns 2 matches
    And both matches have pattern "stripe_secret"
    And the match spans are different (different positions)

  @low
  @edge-case
  Scenario: Empty string produces no matches
    Given text containing ""
    When the detector scans for credential patterns
    Then it returns no matches
