Feature: SDK Discovery Methods
  As a developer using the Tank SDK
  I want to search, inspect, and browse skills programmatically
  So that I can build skill discovery into my application

  Background:
    Given an authenticated TankClient
    And the registry contains published skill "@tank/react" at version "1.0.0"

  # E8, C12: Search with results
  Scenario: Search returns matching skills
    When I call search("react")
    Then the result is a SearchResponse
    And the results array contains a skill with name "@tank/react"
    And the result includes "total" as a positive number
    And the result includes "page" and "limit" pagination fields

  # E9, C12: Search with no results
  Scenario: Search with no matches returns empty results
    When I call search("xyznonexistent123")
    Then the result is a SearchResponse
    And the results array is empty
    And the total is 0

  # E10, C13: Skill info
  Scenario: Info returns full skill metadata
    When I call info("@tank/react")
    Then the result is a SkillInfoResponse
    And the result includes "name" as "@tank/react"
    And the result includes "latestVersion" as "1.0.0"
    And the result includes "permissions" as an object
    And the result includes "auditScore" as a number between 0 and 10
    And the result includes "downloads" as a non-negative number

  # E11, C13: Skill not found
  Scenario: Info for nonexistent skill throws TankNotFoundError
    When I call info("@acme/nonexistent-skill-xyz")
    Then a TankNotFoundError is thrown
    And the error contains skill name "@acme/nonexistent-skill-xyz"

  # E12, C14: Version listing
  Scenario: Versions returns all published versions
    Given "@tank/react" has versions "0.9.0", "1.0.0"
    When I call versions("@tank/react")
    Then the result is an array with 2 entries
    And each entry includes "version", "auditScore", and "publishedAt"
