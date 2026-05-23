# Intent: idd/modules/conversion-cross-cutting/INTENT.md

@conversion
@cross-cutting
Feature: Cross-cutting conversion improvements
  As a developer using the Tank ecosystem
  I need contextual CTAs, learnable interface, and opt-in telemetry
  So that I can discover Tank's value from anywhere in the product

  # ── Docs bottom CTA ─────────────────────────────────────────
  @docs
  @cta
  Scenario: Every docs page has a bottom CTA after the article
    When I fetch the docs overview page HTML
    Then the HTML should contain a post-article call to action
    And the CTA should contain an install command

  @docs
  @cta
  Scenario: Docs CTA appears before prev/next navigation
    When I fetch the docs overview page HTML
    Then the CTA should appear before the document navigation links

  # ── Command palette suggestions ──────────────────────────────
  @command-menu
  Scenario: Command menu includes educational suggestions
    When I inspect the command menu source
    Then the command menu should include a "What is Tank?" suggestion
    And the suggestion should link to the docs overview

  # ── Section anchors on homepage ─────────────────────────────
  @homepage
  @anchors
  Scenario: Key homepage sections have scroll targets
    When I fetch the homepage HTML
    Then the HTML should contain an element with id "vault"
    And the HTML should contain an element with id "atoms"
    And the HTML should contain an element with id "how-it-works"
    And the HTML should contain an element with id "why-tank"
