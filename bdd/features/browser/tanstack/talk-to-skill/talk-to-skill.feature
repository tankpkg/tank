@tanstack
@talk-to-skill
Feature: Talk to this Skill
  As a developer browsing skills
  I want to chat with an AI that knows about a specific skill
  So I can evaluate it before installing

  Background:
    Given a public skill exists in the registry

  Scenario: Header button is visible on skill detail page
    When I visit the talk skill detail page
    Then I see the "Talk to this skill" header button

  Scenario: Floating chat bubble is visible on skill detail page
    When I visit the talk skill detail page
    Then I see the floating chat bubble

  Scenario: Clicking the header button loads the alice-and-bot chat widget without name prompt
    When I visit the talk skill detail page
    And I click the "Talk to this skill" header button
    Then the alice-and-bot chat widget is rendered on the page
    And I do not see the display-name dialog

  Scenario: Clicking the floating bubble loads the alice-and-bot chat widget without name prompt
    When I visit the talk skill detail page
    And I click the floating chat bubble
    Then the alice-and-bot chat widget is rendered on the page
    And I do not see the display-name dialog

  Scenario: Talk API endpoint creates a bot and returns chat link
    When I call the talk API for the skill
    Then the talk API returns a chat link
    And the talk API returns a bot public key

  Scenario: Talk API returns cached bot on second call
    Given I have already called the talk API for the skill
    When I call the talk API for the skill again
    Then the talk API returns the same chat link

  Scenario: Closing and reopening the chat preserves conversation
    When I visit the talk skill detail page
    And I click the "Talk to this skill" header button
    Then the alice-and-bot chat widget is rendered on the page
    When I close the alice-and-bot chat
    Then the alice-and-bot chat panel is not visible
    When I click the floating chat bubble
    Then the alice-and-bot chat widget is rendered on the page

  Scenario: Bot secret is never exposed in skill detail response
    When I visit the talk skill detail page
    Then the page source does not contain "prompt2botSecret"
