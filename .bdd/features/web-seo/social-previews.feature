Feature: Social Previews (Open Graph)
  As a user sharing Tank links on social platforms
  I want rich preview cards to appear
  So that Tank looks professional and trustworthy when shared

  Background:
    Given the Tank web app is running

  Scenario: Homepage OG image resolves to a real URL
    When I request the homepage HTML at "/"
    Then the response contains a meta tag with property "og:image"
    And the og:image URL does not contain "og-image.png"
    And the og:image URL resolves with HTTP 200

  Scenario: Homepage OG image endpoint returns a valid PNG
    When I request "GET /opengraph-image"
    Then the response status is 200
    And the content-type is "image/png"
    And the image dimensions are 1200x630

  Scenario: Homepage has complete Open Graph metadata
    When I request the homepage HTML at "/"
    Then the response contains a meta tag with property "og:title"
    And the response contains a meta tag with property "og:description"
    And the response contains a meta tag with property "og:url"
    And the response contains a meta tag with property "og:type"
    And the response contains a meta tag with property "og:image"

  Scenario: Homepage has Twitter Card metadata
    When I request the homepage HTML at "/"
    Then the response contains a meta tag with name "twitter:card" and content "summary_large_image"
    And the response contains a meta tag with name "twitter:image"

  Scenario: Skill detail page has dynamic OG image
    Given a skill "@tank/react" exists in the registry
    When I request the skill detail page HTML at "/skills/%40tank%2Freact"
    Then the response contains a meta tag with property "og:image"
    And the og:image URL contains "/api/og/"
    And the og:image URL resolves with HTTP 200

  Scenario: Skill OG image API returns PNG for unknown skill
    When I request "GET /api/og/@unknown/nonexistent"
    Then the response status is 200
    And the content-type is "image/png"
    And the image contains fallback text "AI agent skill on Tank"

  Scenario: Docs OG image continues to work
    When I request "GET /docs/opengraph-image"
    Then the response status is 200
    And the content-type is "image/png"
