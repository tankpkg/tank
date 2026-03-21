Feature: Unlink Skill (MCP)
  As a developer using an AI editor
  I want to unlink a locally-linked skill
  So that my project uses the published version instead

  Background:
    Given a Tank project with a linked skill "@test/linked-skill"

  Scenario: Unlink a linked skill
    When I run the "unlink-skill" MCP tool with name "@test/linked-skill"
    Then the skill should be unlinked
    And tank.lock should no longer reference the local path

  Scenario: Unlink a skill that is not linked
    When I run the "unlink-skill" MCP tool with name "@test/not-linked"
    Then I should receive an error "not linked"
