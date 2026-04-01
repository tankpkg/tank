Feature: OpenAPI Specification
  As an SDK maintainer
  I want the OpenAPI spec to be auto-generated from Hono routes
  So that the spec never drifts from the actual API implementation

  Background:
    Given the registry server is running

  # C1, C4: Spec is generated and served at a stable URL
  Scenario: OpenAPI spec is available at /api/v1/openapi.json
    When I request GET /api/v1/openapi.json
    Then the response status is 200
    And the response content-type is "application/json"
    And the response body contains "openapi" with value "3.1.0"
    And the response body contains "info.title" with value "Tank Registry API"

  # C2: All public v1 endpoints are documented
  Scenario: Spec covers all public v1 endpoints
    When I request GET /api/v1/openapi.json
    Then the spec includes path "/api/v1/search" with method "get"
    And the spec includes path "/api/v1/skills/{name}" with method "get"
    And the spec includes path "/api/v1/skills/{name}/versions" with method "get"
    And the spec includes path "/api/v1/skills/{name}/{version}" with method "get"
    And the spec includes path "/api/v1/skills" with method "post"
    And the spec includes path "/api/v1/skills/confirm" with method "post"
    And the spec includes path "/api/v1/skills/{name}/star" with method "get"
    And the spec includes path "/api/v1/skills/{name}/star" with method "post"
    And the spec includes path "/api/v1/skills/{name}/star" with method "delete"
    And the spec includes path "/api/v1/badge/{name}" with method "get"
    And the spec includes path "/api/v1/auth/whoami" with method "get"
    And the spec includes path "/api/v1/cli-auth/start" with method "post"
    And the spec includes path "/api/v1/cli-auth/exchange" with method "post"

  # C3: Request/response schemas are included
  Scenario: Spec includes typed schemas for request and response bodies
    When I request GET /api/v1/openapi.json
    Then the spec defines schema "SearchResponse" with property "results"
    And the spec defines schema "SkillInfoResponse" with property "name"
    And the spec defines schema "PublishStartRequest" with property "manifest"
    And the spec defines schema "Permissions" with property "network"

  # C2 negative: Admin endpoints are NOT in the public spec
  Scenario: Admin endpoints are excluded from the public spec
    When I request GET /api/v1/openapi.json
    Then the spec does not include path "/api/admin/users"
    And the spec does not include path "/api/admin/packages"
    And the spec does not include path "/api/admin/orgs"
