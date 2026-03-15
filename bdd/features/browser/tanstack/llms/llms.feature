@tanstack
@llm
Feature: TanStack LLM endpoint publishing
  TanStack exposes LLM-oriented text endpoints that agents can index directly.

  Scenario: llms.txt is available
    When I fetch "/llms.txt"
    Then the response status should be 200
    And the response body should contain "Tank"

  Scenario: llms-full.txt is available
    When I fetch "/llms-full.txt"
    Then the response status should be 200
    And the response body should contain "Tank"
