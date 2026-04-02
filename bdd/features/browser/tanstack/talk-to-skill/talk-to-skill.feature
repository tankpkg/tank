Feature: Talk to this Skill
  As a developer browsing skills
  I want to chat with an AI that knows about a specific skill
  So I can evaluate it before installing

  Background:
    Given PROMPT2BOT_API_TOKEN is configured
    And the skill "@test/hello-skill" version "1.0.0" is published with a README

  Scenario: Header button is visible on skill page
    When I navigate to the skill page for "@test/hello-skill"
    Then the "Talk to this skill" button is visible in the header section

  Scenario: Floating chat bubble is visible on skill page
    When I navigate to the skill page for "@test/hello-skill"
    Then the floating chat bubble is visible in the bottom-right corner

  Scenario: First click creates a bot and opens chat
    When I navigate to the skill page for "@test/hello-skill"
    And I click the "Talk to this skill" button
    Then a POST request is made to "/api/skills/%40test%2Fhello-skill/talk"
    And the chat dialog opens
    And the chat dialog shows "Powered by prompt2bot" attribution
    And the skill version now has a prompt2botBotId in the database

  Scenario: Second click reuses the cached bot
    Given the skill "@test/hello-skill" version "1.0.0" already has a prompt2bot bot
    When I navigate to the skill page for "@test/hello-skill"
    And I click the "Talk to this skill" button
    Then no POST request is made to the talk endpoint
    And the chat dialog opens immediately

  Scenario: Button hidden when PROMPT2BOT_API_TOKEN is unset
    Given PROMPT2BOT_API_TOKEN is not configured
    When I navigate to the skill page for "@test/hello-skill"
    Then no "Talk to this skill" button is visible
    And no floating chat bubble is visible

  Scenario: Skill without README still gets a bot
    Given the skill "@test/no-readme" version "1.0.0" is published without a README
    When I navigate to the skill page for "@test/no-readme"
    And I click the "Talk to this skill" button
    Then a bot is created using the skill description as context
    And the chat dialog opens

  Scenario: Mobile action bar includes talk button
    Given the viewport is mobile width
    When I navigate to the skill page for "@test/hello-skill"
    Then the "Talk to this skill" button is visible in the mobile action bar

  Scenario: Bot secret is never exposed to the client
    When I navigate to the skill page for "@test/hello-skill"
    Then the page data does not contain "prompt2botSecret"
    And no network response contains the field "prompt2botSecret"
