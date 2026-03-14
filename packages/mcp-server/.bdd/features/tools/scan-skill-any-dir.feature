Feature: Scan Skill Without Manifest
  As an AI agent using Tank MCP
  I want to scan any directory for security issues
  So I can check code safety without requiring Tank packaging

  @auth
  @network
  Scenario: Scan a directory without skills.json
    Given I am authenticated with Tank
    And I have a directory with Python and Markdown files but no skills.json
    When I call the "scan-skill" tool with:
      | directory | ./arbitrary-code |
    Then the response should show scan results
    And the verdict should be one of: PASS, PASS_WITH_NOTES, FLAGGED, FAIL

  @auth
  @network
  Scenario: Scan a directory with skills.json uses full packing
    Given I am authenticated with Tank
    And I have a valid Tank skill directory
    When I call the "scan-skill" tool with:
      | directory | ./tank-skill |
    Then the response should show scan results
    And the skill name should come from skills.json

  @auth
  @network
  Scenario: Scan detects security issues in arbitrary code
    Given I am authenticated with Tank
    And I have a directory with suspicious code patterns
    When I call the "scan-skill" tool with:
      | directory | ./suspicious-code |
    Then the response should contain findings
    And findings should include severity levels
