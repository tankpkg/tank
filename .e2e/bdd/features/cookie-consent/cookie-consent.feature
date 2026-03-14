@homepage
@privacy
Feature: Cookie consent and analytics compliance
  The website must obtain user consent before setting analytics cookies.
  GA4 must use Google Consent Mode v2 (defaults to denied).
  PostHog must be initialized with opt-out-by-default.
  A cookie consent banner must be rendered for GDPR/CCPA compliance.

  # ── Consent Mode defaults ────────────────────────────────────
  @privacy
  @gdpr
  Scenario: GA4 uses Consent Mode v2 with analytics_storage denied by default
    When I fetch the homepage HTML
    Then the HTML should contain a gtag consent default script
    And the consent default should set analytics_storage to "denied"

  @privacy
  @gdpr
  Scenario: GA4 tracking ID is loaded from environment variable
    When I fetch the homepage HTML
    Then the HTML should include a Google Analytics script

  # ── Cookie consent banner ───────────────────────────────────
  @privacy
  @banner
  Scenario: Cookie consent manager component is included
    When I fetch the homepage HTML
    Then the HTML should contain the cookie consent component marker

  # ── PostHog initialization ─────────────────────────────────
  @privacy
  @posthog
  Scenario: PostHog client script is loaded
    When I fetch the homepage HTML
    Then the HTML should contain PostHog initialization script

  # ── Footer cookie settings ─────────────────────────────────
  @privacy
  @footer
  Scenario: Footer includes a cookie preferences link
    When I fetch the homepage HTML
    Then the footer should contain a cookie preferences button
