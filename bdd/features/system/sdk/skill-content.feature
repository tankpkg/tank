Feature: SDK Skill Content Access
  As a developer building an AI agent framework
  I want to load complete skill content programmatically
  So that I can feed SKILL.md + references + scripts to an LLM as context

  Background:
    Given an authenticated TankClient
    And the registry contains published skill "@org/demo" with references and scripts

  # E35, C36: List files
  Scenario: listFiles returns all file paths in the skill package
    When I call listFiles("@org/demo")
    Then the result is an array of strings
    And the result contains "SKILL.md"
    And the result contains paths starting with "references/"
    And the result contains paths starting with "scripts/"

  # E36, C37: Read individual file
  Scenario: readFile returns SKILL.md content
    When I call readFile("@org/demo", "1.0.0", "SKILL.md")
    Then the result is a non-empty string
    And the result starts with "# "

  # E37, C37: Read reference file
  Scenario: readFile returns reference file content
    When I call readFile("@org/demo", "1.0.0", "references/guide.md")
    Then the result is a non-empty string

  # E38, C37: Path traversal rejected
  Scenario: readFile rejects path traversal
    When I call readFile("@org/demo", "1.0.0", "../etc/passwd")
    Then a TankNetworkError is thrown with message containing "Invalid file path"

  Scenario: readFile rejects backslash paths
    When I call readFile("@org/demo", "1.0.0", "..\\etc\\passwd")
    Then a TankNetworkError is thrown

  Scenario: readFile rejects absolute paths
    When I call readFile("@org/demo", "1.0.0", "/etc/passwd")
    Then a TankNetworkError is thrown

  # E39, C38: readSkill full content
  Scenario: readSkill returns SKILL.md content, references, and scripts
    When I call readSkill("@org/demo")
    Then the result has "content" as a non-empty string
    And the result has "references" as a non-empty dict
    And the result has "scripts" as a non-empty dict
    And the result has "files" as an array containing "SKILL.md"
    And the result "name" is "@org/demo"

  # E40, C38: readSkill nonexistent
  Scenario: readSkill throws TankNotFoundError for nonexistent skill
    When I call readSkill("@nonexistent/missing")
    Then a TankNotFoundError is thrown

  # C40: Visibility enforcement
  Scenario: listFiles returns 404 for private skill when not authorized
    Given an unauthenticated TankClient
    And a private skill "@org/private-skill" exists
    When I call listFiles("@org/private-skill")
    Then a TankNotFoundError is thrown

  Scenario: readFile returns 404 for private skill when not authorized
    Given an unauthenticated TankClient
    And a private skill "@org/private-skill" exists
    When I call readFile("@org/private-skill", "1.0.0", "SKILL.md")
    Then a TankNotFoundError is thrown
