Feature: Landing page CTA buttons are stable after hydration
  As a visitor to the Tank landing page
  I want the CTA buttons to show consistent text from first render through hydration
  So that I never see a jarring button flash or replacement

  Background:
    Given the Tank landing page is loaded in a browser

  # C1, C3: Unauthenticated visitor — button must be stable
  Scenario: Unauthenticated visitor sees "Get Started" consistently
    Given the visitor is not logged in
    When the page finishes loading and React hydrates
    Then the hero CTA button text is "Get Started" immediately on load
    And the hero CTA button text remains "Get Started" after hydration completes
    And the navbar CTA button text is "Get Started" immediately on load
    And the navbar CTA button text remains "Get Started" after hydration completes

  # C2: Authenticated user — button must update AFTER hydration, not flash before
  Scenario: Authenticated user sees "Open Dashboard" after hydration without a flash
    Given the visitor is logged in as a registered user
    When the page finishes loading and React hydrates
    Then the hero CTA button text is "Get Started" on initial server render
    And the hero CTA button text becomes "Open Dashboard" after hydration completes
    And there is no intermediate flash where the button text changes more than once

  # C4: No hydration mismatch
  Scenario: No hydration mismatch warning is emitted
    Given the visitor is logged in as a registered user
    When the page finishes loading and React hydrates
    Then no React hydration mismatch warning appears in the browser console

  # C3: Session loading state — must show unauthenticated variant
  Scenario: Button shows "Get Started" while session is loading
    Given the visitor's session state is indeterminate (loading)
    When the page renders
    Then the hero CTA button text is "Get Started"
    And the navbar CTA button text is "Get Started"
