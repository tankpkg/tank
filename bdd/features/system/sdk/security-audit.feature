Feature: SDK Security and Audit Methods
  As a developer evaluating skill safety
  I want to inspect audit results and permissions programmatically
  So that I can enforce security policies in my pipeline

  Background:
    Given an authenticated TankClient
    And the registry contains published skill "@tank/react" at version "1.0.0" with completed scan

  # E18, C17: Audit results
  Scenario: Audit returns full security analysis
    When I call audit("@tank/react")
    Then the result includes "score" as a number between 0 and 10
    And the result includes "findings" as an array
    And the result includes "stages" with analysis details

  # C17: Audit specific version
  Scenario: Audit with explicit version returns that version's analysis
    When I call audit("@tank/react", "1.0.0")
    Then the result reflects the analysis for version "1.0.0"

  # E19, C18: Permissions
  Scenario: Permissions returns declared permission set
    When I call permissions("@tank/react")
    Then the result is a Permissions object
    And the result may include "network.outbound" as an array of URL patterns
    And the result may include "filesystem.read" as an array of glob patterns
    And the result may include "filesystem.write" as an array of glob patterns
    And the result may include "subprocess" as a boolean

  # C19: Whoami authenticated
  Scenario: Whoami returns user info when authenticated
    When I call whoami()
    Then the result includes "userId", "name", and "email"

  # C19: Whoami unauthenticated
  Scenario: Whoami returns null when not authenticated
    Given an unauthenticated TankClient
    When I call whoami()
    Then the result is null
