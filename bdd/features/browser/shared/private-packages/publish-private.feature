@private-packages
Feature: Publishing private skills

  Background:
    Given Alice is authenticated with the registry

  @smoke
  @critical
  @private-packages
  Scenario: Alice publishes a skill as private
    Given Alice has a skill "private-visibility-skill" ready to publish
    When Alice publishes the skill with private visibility
    Then the skill should be published successfully
    And the skill should have "private" visibility in the registry

  @smoke
  @critical
  @private-packages
  Scenario: Alice publishes a skill without visibility
    Given Alice has a skill "default-visibility-skill" ready to publish
    When Alice publishes the skill without specifying visibility
    Then the skill should be published successfully
    And the skill should have "public" visibility in the registry

  @smoke
  @critical
  @private-packages
  Scenario: Alice publishes with the private flag
    Given Alice has a skill "flag-private-skill" ready to publish
    When Alice publishes the skill with the private flag
    Then the skill should be published successfully
    And the skill should have "private" visibility in the registry
