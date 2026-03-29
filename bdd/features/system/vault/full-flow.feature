# Intent: idd/modules/vault/INTENT.md

@vault
@full-flow
@e2e
Feature: Full credential vault lifecycle — end to end
  As an AI agent developer
  I need to verify that the entire vault pipeline works as a single unit
  from launching an agent through credential redaction to clean shutdown
  So that I have confidence the system protects my secrets in real usage

  @high
  @happy-flow
  Scenario: Complete lifecycle — launch, discover from traffic, redact, restore, shutdown
    # ── Setup ─────────────────────────────────────────────────────────
    Given a mock AI provider is running on a local port
    And "claude" is available in PATH (or a test harness simulating it)

    # ── Phase 1: Launch — tank run starts proxy + agent ───────────────
    When the user runs "tank run claude"
    Then the vault proxy starts on a random available port
    And NODE_OPTIONS is set with the proxy bootstrap (Claude Code = Node.js)
    And the agent process is launched
    And the vault session is empty (no pre-registered credentials)

    # ── Phase 2: First request — proxy discovers credentials in traffic ─
    When the agent sends a chat completion request through the proxy with message:
      """
      Deploy a payment service. Use Stripe key sk_live_4eC39HqLyjWDarjtT1zdp7dc
      and AWS access key AKIAIOSFODNN7EXAMPLE to provision resources.
      """
    Then the proxy scans the message body and discovers 2 credential-shaped values
    And generates format-preserving fakes on the fly for each
    And stores bidirectional mappings in the session vault
    And the forwarded message has both credentials replaced with fakes
    And the fakes have the same prefix and length as the originals
    And the real values do not appear anywhere in the forwarded request

    # ── Phase 3: Response — provider responds with fakes, proxy restores ─
    When the AI provider responds with code containing the fake tokens
    Then the proxy detects the fakes in the response
    And replaces them with the real credentials before delivering to the agent
    And the agent receives working code with real credentials

    # ── Phase 4: Second request — same credentials reuse same fakes ───
    When the agent sends a second request referencing "sk_live_4eC39HqLyjWDarjtT1zdp7dc" again
    Then the proxy uses the SAME fake as in the first request (session consistency)
    And the provider sees consistent fake values across the conversation

    # ── Phase 5: Verify provider isolation ────────────────────────────
    Then the mock AI provider's request log contains 0 occurrences of "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    And the mock AI provider's request log contains 0 occurrences of "AKIAIOSFODNN7EXAMPLE"

    # ── Phase 6: Shutdown ─────────────────────────────────────────────
    When the agent process exits with code 0
    Then the proxy server shuts down
    And the session vault is cleared (0 mappings remain in memory)
    And "tank run" exits with code 0

  @high
  @happy-flow
  Scenario: Multi-turn conversation — credentials discovered in turn 1 stay consistent
    Given a mock AI provider is running
    And "tank run claude" is running with an active proxy session

    # ── Turn 1: credential first appears in traffic ───────────────────
    When the agent sends turn 1 with message "Use sk_live_4eC39HqLyjWDarjtT1zdp7dc to create a charge"
    Then the proxy discovers the credential and generates a fake
    And the provider receives the fake

    # ── Turn 2: conversation history re-sends the credential ──────────
    When the agent sends turn 2 with full history (turn 1 included)
    Then all occurrences of the real credential in the history are replaced with the SAME fake
    And the provider sees a consistent conversation

    # ── Turn 3: provider references the credential in response ────────
    When the provider responds referencing the fake token
    Then the agent receives the response with the real credential restored

  @high
  @happy-flow
  Scenario: Streaming response — credentials restored correctly across SSE chunks
    Given a mock AI provider is running with SSE streaming enabled
    And "tank run claude" is running with an active proxy session

    When the agent sends a request and the message contains "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    Then the proxy discovers and tokenizes the credential

    When the provider streams back SSE chunks where the fake token is split across two chunks
    Then the proxy buffers until the full fake token is assembled
    And restores the real credential in the delivered output
    And no partial fake token is emitted to the agent
