Feature: Admin rescan a specific package version
  As a registry administrator
  I want to trigger a security rescan for a specific package version
  So that I can re-evaluate packages that previously failed scanning

  Background:
    Given the Tank registry is running

  Scenario: Successfully rescan a version (scanner unavailable — marks scan-failed)
    Given an admin user exists with a valid session
    And a published package "@e2e/rescan-test" exists with version "1.0.0"
    When the admin triggers a rescan for "@e2e/rescan-test" version "1.0.0"
    Then the response status should be 200
    And the response should indicate the rescan was processed
    And the version audit status should be updated in the database

  Scenario: Rescan requires admin authentication
    When an unauthenticated request triggers a rescan for "@e2e/rescan-test" version "1.0.0"
    Then the response status should be 401

  Scenario: Rescan returns 404 for non-existent package
    Given an admin user exists with a valid session
    When the admin triggers a rescan for "@e2e/nonexistent" version "1.0.0"
    Then the response status should be 404

  Scenario: Rescan returns 404 for non-existent version
    Given an admin user exists with a valid session
    And a published package "@e2e/rescan-test" exists with version "1.0.0"
    When the admin triggers a rescan for "@e2e/rescan-test" version "99.99.99"
    Then the response status should be 404
