# Intent: idd/modules/conversion-homepage/INTENT.md

@homepage
@conversion
Feature: Homepage conversion improvements
  As a first-time visitor
  I need to quickly understand Tank's value and navigate to key features
  So that I can decide whether Tank solves my problem

  # ── Hero: Differentiator pills ──────────────────────────────
  @conversion
  @hero
  Scenario: Hero subtitle is followed by scannable differentiator pills
    When I fetch the homepage HTML
    Then the HTML should contain a four-pill differentiator row
    And each pill should have an href fragment pointing to its section

  @conversion
  @hero
  Scenario: Credential Vault pill scrolls to vault section
    When I fetch the homepage HTML
    Then one of the differentiator pills should link to "#vault"

  @conversion
  @hero
  Scenario: Atoms pill scrolls to atoms section
    When I fetch the homepage HTML
    Then one of the differentiator pills should link to "#atoms"

  @conversion
  @hero
  Scenario: How It Works pill scrolls to how-it-works section
    When I fetch the homepage HTML
    Then one of the differentiator pills should link to "#how-it-works"

  # ── Hero: Visible CTAs ──────────────────────────────────────
  @conversion
  @hero
  @cta
  Scenario: Primary CTA is Browse Packages button
    When I fetch the homepage HTML
    Then the primary CTA should link to "/skills"

  @conversion
  @hero
  @cta
  Scenario: Secondary CTA is View Docs button below primary CTA
    When I fetch the homepage HTML
    Then the HTML should contain a secondary CTA linking to documentation

  # ── Hero: Social proof stats ─────────────────────────────────
  @conversion
  @hero
  @stats
  Scenario: Hero includes social proof statistics
    When I fetch the homepage HTML
    Then the HTML should contain a hero stats row with package count or GitHub stars

  # ── Section ordering ────────────────────────────────────────
  @conversion
  @sections
  Scenario: Differentiating sections appear before comparison table
    When I fetch the homepage HTML
    Then the vault section should appear before the comparison table
    And the atoms section should appear before the comparison table

  @conversion
  @sections
  Scenario: Why Tank exists appears before comparison table
    When I fetch the homepage HTML
    Then the "Why Tank Exists" section should appear before the comparison table

  # ── Section anchors for pill links ──────────────────────────
  @conversion
  @sections
  Scenario: Key sections have id attributes for scroll navigation
    When I fetch the homepage HTML
    Then the HTML should contain an element with id "vault"
    And the HTML should contain an element with id "atoms"
    And the HTML should contain an element with id "how-it-works"
    And the HTML should contain an element with id "why-tank"

  # ── Sticky section navigation ──────────────────────────────
  @conversion
  @nav
  Scenario: Sticky section nav component is rendered
    When I fetch the homepage HTML
    Then the HTML should contain a sticky section navigation element
