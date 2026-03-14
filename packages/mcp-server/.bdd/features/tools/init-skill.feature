Feature: Init Skill Tool
  As an AI agent using Tank MCP
  I want to create a skills.json manifest for a new skill
  So I can prepare it for publishing to the Tank registry

  Scenario: Create skills.json with all parameters
    Given a directory without skills.json
    When I call the "init-skill" tool with:
      | name        | @test/my-skill         |
      | version     | 1.0.0                  |
      | description | A test skill for demos |
      | private     | false                  |
    Then a skills.json file should be created
    And it should have name "@test/my-skill"
    And it should have version "1.0.0"
    And it should have a permissions section

  Scenario: Create skills.json with minimal parameters
    Given a directory without skills.json
    When I call the "init-skill" tool with:
      | name | @test/minimal |
    Then a skills.json file should be created
    And it should have version "1.0.0" as default

  Scenario: Refuse to overwrite existing skills.json
    Given a directory with an existing skills.json
    When I call the "init-skill" tool with:
      | name | @test/overwrite |
    Then the response should indicate skills.json already exists

  Scenario: Force overwrite existing skills.json
    Given a directory with an existing skills.json
    When I call the "init-skill" tool with:
      | name  | @test/forced |
      | force | true         |
    Then a skills.json file should be created
    And it should have name "@test/forced"

  Scenario: Reject invalid skill name
    Given a directory without skills.json
    When I call the "init-skill" tool with:
      | name | invalid name! |
    Then the response should indicate an invalid name
