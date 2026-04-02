Feature: SDK Dynamic Tool Generator
  As a developer building an AI agent framework
  I want to generate tool definitions from Tank skills
  So that agents can discover and read skills through standard tool interfaces

  Background:
    Given an authenticated TankClient
    And the registry contains published skill "@org/demo" with references and scripts

  # C44, E44: createSkillTool returns a SkillTool
  Scenario: createSkillTool returns a valid SkillTool object
    When I call createSkillTool(client, "@org/demo")
    Then the result has property "name" matching "org_demo"
    And the result has property "skillName" equal to "@org/demo"
    And the result has property "version" as a non-empty string
    And the result has property "description" as a non-empty string
    And the result has property "files" as a non-empty array
    And the result has methods "execute", "toOpenAI", "toMCP"

  # C52, E44: Tool name derived safely from skill name
  Scenario: Tool name sanitizes scoped skill names into valid identifiers
    When I call createSkillTool(client, "@org/my-skill")
    Then the tool name is "org_my_skill"

  # C47: Description includes skill info
  Scenario: Tool description includes skill metadata and file listing
    When I call createSkillTool(client, "@org/demo")
    Then the description contains "@org/demo"
    And the description contains the skill version
    And the description contains "references/"
    And the description contains "scripts/"
    And the description contains "read_all"

  # C45, E45: toOpenAI format
  Scenario: toOpenAI returns valid OpenAI function calling schema
    Given a SkillTool for "@org/demo"
    When I call toOpenAI()
    Then the result has "type" equal to "function"
    And the result has "function.name" matching "org_demo"
    And the result has "function.description" as a non-empty string
    And the result has "function.parameters.type" equal to "object"
    And the result has "function.parameters.properties.action" with enum ["read", "list", "read_all"]
    And the result has "function.parameters.properties.path" with type "string"
    And the result has "function.parameters.required" containing "action"

  # C46, E46: toMCP format
  Scenario: toMCP returns valid MCP tool definition
    Given a SkillTool for "@org/demo"
    When I call toMCP()
    Then the result has "name" matching "org_demo"
    And the result has "description" as a non-empty string
    And the result has "inputSchema.type" equal to "object"
    And the result has "inputSchema.properties.action" with enum ["read", "list", "read_all"]

  # C48, E47: execute read_all
  Scenario: execute read_all returns full skill content
    Given a SkillTool for "@org/demo"
    When I call execute({ action: "read_all" })
    Then the result has "success" equal to true
    And the result has "skill.content" as a non-empty string
    And the result has "skill.references" as an object with keys
    And the result has "skill.scripts" as an object with keys
    And the result has "skill.files" as a non-empty array

  # C49, E48: execute list
  Scenario: execute list returns file paths
    Given a SkillTool for "@org/demo"
    When I call execute({ action: "list" })
    Then the result has "success" equal to true
    And the result has "files" containing "SKILL.md"

  # C50, E49: execute read with valid path
  Scenario: execute read returns file content
    Given a SkillTool for "@org/demo"
    When I call execute({ action: "read", path: "SKILL.md" })
    Then the result has "success" equal to true
    And the result has "content" as a non-empty string

  # C50, E50: execute read without path
  Scenario: execute read without path returns error
    Given a SkillTool for "@org/demo"
    When I call execute({ action: "read" })
    Then the result has "success" equal to false
    And the result has "error" containing "path is required"

  # C50, E51: execute read with nonexistent path
  Scenario: execute read with nonexistent file returns error
    Given a SkillTool for "@org/demo"
    When I call execute({ action: "read", path: "nonexistent.md" })
    Then the result has "success" equal to false
    And the result has "error" containing "File not found"

  # C51, E52: createSkillTools batch
  Scenario: createSkillTools creates multiple tools efficiently
    When I call createSkillTools(client, ["@org/demo", "@tank/react"])
    Then the result is an array with 2 entries
    And each entry has methods "execute", "toOpenAI", "toMCP"
