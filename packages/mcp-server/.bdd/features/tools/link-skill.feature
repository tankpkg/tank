Feature: Link Skill Tool
  As an AI agent using Tank MCP
  I want to link a skill into agent workspaces
  So agents can discover and use the skill during development

  Scenario: Link a skill to detected agents
    Given I have a skill directory with a valid skills.json
    And there are AI agent workspaces detected
    When I call the "link-skill" tool with:
      | directory | ./my-skill |
    Then the response should confirm the skill was linked
    And it should list which agents received the link

  Scenario: Link with no agents detected
    Given I have a skill directory with a valid skills.json
    And there are no AI agent workspaces detected
    When I call the "link-skill" tool with:
      | directory | ./my-skill |
    Then the response should indicate no agents found

  Scenario: Link a directory without skills.json
    Given I have a directory without skills.json
    When I call the "link-skill" tool with:
      | directory | ./not-a-skill |
    Then the response should indicate skills.json is required
