@private-packages
Feature: Private skill access control

  Background:
    Given Alice has published a private skill "private-access-skill"

  @smoke
  @critical
  @private-packages
  Scenario: Publisher can view their own private skill via tank info
    When Alice requests info for "private-access-skill"
    Then Alice should see the skill metadata

  @smoke
  @critical
  @private-packages
  Scenario: Org member can view private skill in their org via tank info
    Given Bob is an authenticated member of Alice's organization
    When Bob requests info for "private-access-skill"
    Then Bob should see the skill metadata

  @smoke
  @critical
  @private-packages
  Scenario: Org member can install private skill
    Given Bob is an authenticated member of Alice's organization
    When Bob tries to install "private-access-skill"
    Then the skill should be installed successfully

  @smoke
  @critical
  @private-packages
  Scenario: Unauthenticated user gets not found for private skill via tank info
    When an unauthenticated user requests info for "private-access-skill"
    Then the request should return "not found"

  @smoke
  @critical
  @private-packages
  Scenario: Non-org member gets not found for private skill via tank info
    Given Charlie is authenticated but not in Alice's organization
    When Charlie requests info for "private-access-skill"
    Then the request should return "not found"

  @smoke
  @critical
  @private-packages
  Scenario: Non-org member fails to install private skill
    Given Charlie is authenticated but not in Alice's organization
    When Charlie tries to install "private-access-skill"
    Then the installation should fail with "not found"
