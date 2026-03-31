# Intent: idd/modules/vault/INTENT.md

@vault
@proxy
Feature: Credential proxy — intercept, redact, restore
  As an AI agent developer
  I need Tank Vault to transparently redact credentials from outgoing AI requests
  and restore them in incoming responses
  So that AI providers never see my real API keys
  but the agent can still execute code with real credentials

  Background:
    Given the vault proxy is running on a local port
    And the vault session is empty (no pre-registered credentials)

  # ── Full happy flow ──────────────────────────────────────────────────────
  @high
  @happy-flow
  Scenario: End-to-end — proxy discovers credentials in traffic, redacts, restores
    When the agent sends a chat completion request to the proxy targeting "api.anthropic.com"
    And the request has header "x-api-key" with "sk-ant-valid-anthropic-key"
    And the user message is:
      """
      Create a Lambda function that uses AWS key AKIAIOSFODNN7EXAMPLE
      and calls Stripe with sk_live_4eC39HqLyjWDarjtT1zdp7dc to process payments.
      """
    Then the proxy scans the message body and discovers 2 credential-shaped values
    And for each, it generates a format-preserving fake on the fly and stores the mapping
    And the forwarded "x-api-key" header is unchanged (provider's own key)
    And the forwarded user message has both credentials replaced with fakes
    And the fakes preserve the original prefix and length
    And the real credentials do not appear anywhere in the forwarded request
    When the AI provider responds with code containing the fake tokens
    Then the proxy restores the fakes to real values in the response
    And the agent receives working code with real credentials

  # ── Traffic-based discovery (C13, C14) ───────────────────────────────────
  @high
  Scenario: First-seen credential is tokenized on the fly from traffic
    When the agent sends a chat completion request to the proxy
    And the message content is "Call Stripe with sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    Then the proxy detects "sk_live_4eC39HqLyjWDarjtT1zdp7dc" as credential pattern "stripe_secret"
    And generates a format-preserving fake on the fly
    And stores the mapping in the session vault
    And the forwarded message contains the fake instead
    And the real credential does not appear anywhere in the forwarded request

  @high
  Scenario: Second occurrence of same credential reuses the same fake
    When the agent sends request 1 with message "Key is sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And the proxy tokenizes it with a generated fake
    And the agent sends request 2 with message "Use sk_live_4eC39HqLyjWDarjtT1zdp7dc again"
    Then request 2 uses the SAME fake as request 1 (session consistency)

  @high
  Scenario: Multiple credentials in one message are all discovered and redacted
    When the agent sends a chat completion request to the proxy
    And the message content is "Use sk_live_4eC39HqLyjWDarjtT1zdp7dc and AKIAIOSFODNN7EXAMPLE"
    Then the proxy discovers both credential-shaped values
    And generates fakes for each
    And both are replaced in the forwarded request

  # ── Provider's own key passes through (C15) ──────────────────────────────
  @high
  Scenario: Provider API key in auth header is not redacted
    When the agent sends a request to the proxy targeting "api.anthropic.com"
    And the request has header "x-api-key" with an Anthropic API key
    Then the proxy does not modify the "x-api-key" header
    And only the message body is scanned for credential patterns

  # ── No-credential passthrough (E15) ──────────────────────────────────────
  @high
  Scenario: Message without credentials passes through unmodified
    When the agent sends a chat completion request to the proxy
    And the message content is "What is the weather in San Francisco?"
    Then the proxy forwards the request with identical message content
    And no modifications are made to the request body

  # ── Incoming response restoration (C17) ──────────────────────────────────
  @high
  Scenario: Fake credential in response is restored to real value
    Given the proxy previously tokenized "sk_live_4eC39HqLyjWDarjtT1zdp7dc" to a fake
    When the AI provider responds with code containing that fake token
    Then the proxy restores the fake to "sk_live_4eC39HqLyjWDarjtT1zdp7dc" in the response
    And the agent receives working code with the real credential

  @high
  Scenario: Response without fake tokens passes through unmodified
    Given the AI provider responds with "Here is a Python function that adds two numbers."
    When the proxy processes the response
    Then the agent receives the response unmodified

  # ── SSE streaming support (C16) ──────────────────────────────────────────
  @high
  Scenario: Streaming response with fake token in a single chunk is restored
    Given the proxy previously tokenized "sk_live_4eC39HqLyjWDarjtT1zdp7dc" to a fake
    And the AI provider streams SSE chunks
    And chunk 1 contains the fake token
    When the proxy processes the streaming response
    Then the agent receives chunk 1 with the real credential restored

  @high
  Scenario: Streaming response with fake token split across chunks is restored
    Given the proxy previously tokenized "sk_live_4eC39HqLyjWDarjtT1zdp7dc" to a fake
    And the AI provider streams SSE chunks
    And the fake token is split across chunk 1 and chunk 2
    When the proxy processes the streaming response
    Then the reassembled output contains "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And no partial fake token is emitted to the agent

  # ── Fail closed (C18) ───────────────────────────────────────────────────
  @high
  Scenario: Proxy crash causes agent request to fail, not bypass
    Given the vault proxy encounters a fatal error during request processing
    When the agent sends a chat completion request
    Then the agent receives a connection error
    And the request is NOT forwarded to the AI provider unsanitized

  # ── Edge cases ──────────────────────────────────────────────────────────
  @medium
  @edge-case
  Scenario: Credential in system message is also redacted
    When the agent sends a chat completion request to the proxy
    And the system message is "You have access to Stripe key sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And the user message is "List my charges"
    Then the forwarded system message contains the fake "sk_live_xKr9mPq2wNv8jL3dT4fG5hJ6"
    And the forwarded system message does not contain the real credential

  @medium
  @edge-case
  Scenario: Credential in tool call arguments is redacted
    When the agent sends a request with tool call arguments containing "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    Then the forwarded tool call arguments contain the fake instead

  @medium
  @edge-case
  Scenario: Credential appearing in assistant message history is redacted
    When the agent sends a multi-turn conversation where a previous assistant message contains "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    Then the forwarded assistant message contains the fake instead

  @medium
  @edge-case
  Scenario: Request to non-AI-provider URL passes through without scanning
    When the agent sends a request through the proxy to "api.github.com"
    Then the proxy forwards the request unmodified
    And no credential scanning is performed on the body

  @medium
  @edge-case
  Scenario: Very large request body (1MB) with credentials is handled
    When the agent sends a chat completion request with a 1MB message body
    And the body contains "sk_live_4eC39HqLyjWDarjtT1zdp7dc" at position 500000
    Then the credential is still detected and replaced with the fake
    And the proxy completes within 200ms

  @medium
  @edge-case
  Scenario: Provider returns 4xx error — proxy still restores fakes in error body
    Given the AI provider responds with status 400 and body containing "Invalid key format: sk_live_xKr9mPq2wNv8jL3dT4fG5hJ6"
    When the proxy processes the error response
    Then the agent receives the error with the fake replaced by the real credential

  @medium
  @edge-case
  Scenario: Provider returns 5xx error — proxy forwards error transparently
    Given the AI provider responds with status 500 and body "Internal server error"
    When the proxy processes the error response
    Then the agent receives status 500 with body "Internal server error" unmodified

  @medium
  @edge-case
  Scenario: Concurrent requests are processed independently
    When 10 agents send chat completion requests simultaneously through the proxy
    And each request contains a different credential from the vault
    Then all 10 requests are forwarded with correct credential-to-fake replacements
    And no cross-contamination occurs between requests

  @medium
  @edge-case
  Scenario: Malformed JSON in request body — proxy returns error, does not crash
    When the agent sends a request with invalid JSON body "{ broken json"
    Then the proxy returns a 400 error to the agent
    And the proxy remains running and healthy for subsequent requests

  @medium
  @edge-case
  Scenario: Streaming response where multiple fake tokens appear in different chunks
    Given the vault also knows about "AKIAIOSFODNN7EXAMPLE" mapped to fake "AKIAFAKEXAMPLE12345"
    And the AI provider streams SSE chunks
    And chunk 1 contains "Use sk_live_xKr9mPq2wNv8jL3dT4fG5hJ6 for Stripe"
    And chunk 5 contains "and AKIAFAKEXAMPLE12345 for AWS"
    When the proxy processes the streaming response
    Then chunk 1 is restored with "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And chunk 5 is restored with "AKIAIOSFODNN7EXAMPLE"

  @low
  @edge-case
  Scenario: Request with empty message content passes through
    When the agent sends a chat completion request with an empty messages array
    Then the proxy forwards the request unmodified
