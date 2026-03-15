@download-counting
Feature: Weekly download counting
  Downloads are counted per-skill per-day with no IP deduplication.
  Every version metadata fetch records a download. The API returns
  a rolling 7-day total.

  Background:
    Given a published skill exists in the registry

  @smoke
  @critical
  Scenario: Fetching version metadata records a download
    Given the skill has no prior downloads today
    When the version metadata endpoint is fetched
    Then the daily download count for today should be 1

  @smoke
  Scenario: Multiple fetches accumulate without deduplication
    Given the skill has no prior downloads today
    When the version metadata endpoint is fetched 3 times
    Then the daily download count for today should be 3

  @smoke
  Scenario: Downloads aggregate into a single daily row
    Given the skill has no prior downloads today
    When the version metadata endpoint is fetched 5 times
    Then only one download row exists for today

  Scenario: Download count appears in version metadata response
    Given the skill has 10 recorded downloads for today
    When the version metadata endpoint is fetched
    Then the response should include a downloads field of at least 10
