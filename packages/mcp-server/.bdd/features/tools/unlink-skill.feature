Feature: Unlink Skill Tool
  As an AI agent using Tank MCP
  I want to unlink a skill from agent workspaces
  So I can remove development links when done

  Scenario: Unlink a linked skill
    Given I have a skill that is currently linked
    When I call the "unlink-skill" tool with:
      | directory | ./my-skill |
    Then the response should confirm the skill was unlinked

  Scenario: Unlink a skill that is not linked
    Given I have a skill directory with a valid skills.json
    When I call the "unlink-skill" tool with:
      | directory | ./my-skill |
    Then the response should indicate the skill was not linked
