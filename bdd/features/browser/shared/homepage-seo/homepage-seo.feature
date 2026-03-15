@homepage
@seo
Feature: Homepage content and SEO metadata
  The homepage should present trust signals, correct metadata,
  and structured data for search engines.

  # ── robots.txt ──────────────────────────────────────────────
  @seo
  @robots
  Scenario: robots.txt allows search engine crawling of docs
    When I fetch "/robots.txt"
    Then the response status should be 200
    And the response body should contain "Allow: /docs/"
    And the response body should contain "Sitemap:"

  @seo
  @robots
  Scenario: robots.txt blocks internal routes
    When I fetch "/robots.txt"
    Then the response body should contain "Disallow: /api/"
    And the response body should contain "Disallow: /dashboard/"

  # ── Domain identity ────────────────────────────────────────
  @seo
  @domain
  Scenario: Homepage uses correct domain in canonical and OpenGraph
    When I fetch the homepage HTML
    Then the HTML should contain "tankpkg.dev"
    And the HTML should not contain "tankpkg.com"

  # ── OpenGraph and meta tags ────────────────────────────────
  @seo
  @opengraph
  Scenario: Homepage includes OpenGraph metadata
    When I fetch the homepage HTML
    Then the HTML should contain meta property "og:title"
    And the HTML should contain meta property "og:description"
    And the HTML should contain meta property "og:url"
    And the HTML should contain meta property "og:image"

  @seo
  @meta
  Scenario: Homepage includes essential meta tags
    When I fetch the homepage HTML
    Then the HTML should contain a meta description
    And the HTML should contain a canonical link to "https://tankpkg.dev"

  # ── JSON-LD structured data ────────────────────────────────
  @seo
  @schema
  Scenario: Homepage includes JSON-LD FAQPage schema
    When I fetch the homepage HTML
    Then the HTML should contain JSON-LD structured data
    And the JSON-LD should include a type "FAQPage"
    And the JSON-LD should include a type "Organization"

  # ── Homepage CTAs ──────────────────────────────────────────
  @homepage
  @cta
  Scenario: Primary CTA is Browse Skills
    When I fetch the homepage HTML
    Then the primary CTA should link to "/skills"
    And the secondary CTA should link to "/login"
