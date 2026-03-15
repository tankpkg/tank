@private-packages
Feature: Search respects visibility

  Background:
    Given Alice has published a private skill "private-access-skill"
    And Alice has published a public skill "public-search-skill"

  @smoke
  @critical
  @private-packages
  Scenario: Publisher sees both public and private skills in search
    When Alice searches for skills
    Then Alice should see "private-access-skill" in the results
    And Alice should see "public-search-skill" in the results

  @smoke
  @critical
  @private-packages
  Scenario: Org member sees both public and private skills in search
    Given Bob is an authenticated member of Alice's organization
    When Bob searches for skills
    Then Bob should see "private-access-skill" in the results
    And Bob should see "public-search-skill" in the results

  @smoke
  @critical
  @private-packages
  Scenario: Unauthenticated user only sees public skills
    When an unauthenticated user searches for skills
    Then the user should see "public-search-skill" in the results
    And the user should not see "private-access-skill" in the results

  @smoke
  @critical
  @private-packages
  Scenario: Non-org member only sees public skills
    Given Charlie is authenticated but not in Alice's organization
    When Charlie searches for skills
    Then Charlie should see "public-search-skill" in the results
    And Charlie should not see "private-access-skill" in the results
