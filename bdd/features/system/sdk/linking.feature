Feature: SDK Agent Linking
  As a developer managing agent configurations
  I want to link and unlink skills to specific agents
  So that my tools can configure agents without manual file editing

  # E28, C26: Link
  Scenario: Link adds skill path to agent config
    Given an authenticated TankClient
    And a skill directory at "./my-skill/" containing a valid SKILL.md
    And the OpenCode agent config exists
    When I call link("./my-skill/", { agents: ["opencode"] })
    Then the OpenCode agent config includes a path to "./my-skill/"

  # E29, C26: Unlink
  Scenario: Unlink removes skill path from agent config
    Given an authenticated TankClient
    And skill "@org/my-skill" is linked to the OpenCode agent
    When I call unlink("@org/my-skill", { agents: ["opencode"] })
    Then the OpenCode agent config no longer references "@org/my-skill"
