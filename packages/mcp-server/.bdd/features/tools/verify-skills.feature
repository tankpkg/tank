Feature: Verify Skills Tool
  As an AI agent using Tank MCP
  I want to verify the integrity of installed skills
  So I can ensure nothing has been tampered with

  Scenario: Verify passes when all skills are intact
    Given I have a project with skills installed correctly
    When I call the "verify-skills" tool
    Then the response should confirm all skills verified

  Scenario: Verify detects missing skill directory
    Given I have a project with a skill in the lockfile but missing from disk
    When I call the "verify-skills" tool
    Then the response should report the missing skill

  Scenario: Verify with no lockfile
    Given I have a directory without skills.lock
    When I call the "verify-skills" tool
    Then the response should indicate no lockfile found
