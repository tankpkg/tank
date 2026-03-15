@private-packages
@api-bypass
Feature: API endpoints do not leak private skills
  Verify that every REST API read endpoint returns 404 (not 403)
  for private skills when accessed by an unauthorized user.
  This prevents information disclosure — outsiders must not learn
  that a private skill even exists.

  Background:
    Given Alice has published a private skill "private-access-skill"

  @critical
  @private-packages
  Scenario: Publisher can fetch private skill metadata via API
    When Alice calls GET "/api/v1/skills/{skill}" with auth
    Then the API response status should be 200

  @critical
  @private-packages
  Scenario: Outsider gets 404 for private skill metadata via API
    Given Charlie is authenticated but not in Alice's organization
    When Charlie calls GET "/api/v1/skills/{skill}" with auth
    Then the API response status should be 404

  @critical
  @private-packages
  Scenario: Unauthenticated request gets 404 for private skill metadata
    When an unauthenticated user calls GET "/api/v1/skills/{skill}"
    Then the API response status should be 404

  @critical
  @private-packages
  Scenario: Publisher can list versions via API
    When Alice calls GET "/api/v1/skills/{skill}/versions" with auth
    Then the API response status should be 200

  @critical
  @private-packages
  Scenario: Outsider gets 404 for version listing via API
    Given Charlie is authenticated but not in Alice's organization
    When Charlie calls GET "/api/v1/skills/{skill}/versions" with auth
    Then the API response status should be 404

  @critical
  @private-packages
  Scenario: Publisher can fetch specific version via API
    When Alice calls GET "/api/v1/skills/{skill}/1.0.0" with auth
    Then the API response status should be 200

  @critical
  @private-packages
  Scenario: Outsider gets 404 for specific version via API
    Given Charlie is authenticated but not in Alice's organization
    When Charlie calls GET "/api/v1/skills/{skill}/1.0.0" with auth
    Then the API response status should be 404

  @critical
  @private-packages
  Scenario: Publisher can fetch file content via API
    When Alice calls GET "/api/v1/skills/{skill}/1.0.0/files/skills.json" with auth
    Then the API response status should be 200

  @critical
  @private-packages
  Scenario: Outsider gets 404 for file content via API
    Given Charlie is authenticated but not in Alice's organization
    When Charlie calls GET "/api/v1/skills/{skill}/1.0.0/files/skills.json" with auth
    Then the API response status should be 404

  @critical
  @private-packages
  Scenario: Publisher can fetch star status via API
    When Alice calls GET "/api/v1/skills/{skill}/star" with auth
    Then the API response status should be 200

  @critical
  @private-packages
  Scenario: Outsider gets 404 for star status via API
    Given Charlie is authenticated but not in Alice's organization
    When Charlie calls GET "/api/v1/skills/{skill}/star" with auth
    Then the API response status should be 404

  @critical
  @private-packages
  Scenario: Private skill does not appear in search API for outsider
    Given Charlie is authenticated but not in Alice's organization
    When Charlie calls GET "/api/v1/search?q={searchQuery}" with auth
    Then the API response status should be 200
    And the API response body should not contain the private skill name

  @critical
  @private-packages
  Scenario: Private skill appears in search API for publisher
    When Alice calls GET "/api/v1/search?q={searchQuery}" with auth
    Then the API response status should be 200
    And the API response body should contain the private skill name
