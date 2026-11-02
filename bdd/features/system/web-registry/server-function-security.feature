# Intent: idd/modules/web-registry/INTENT.md
@security
Feature: Server-function dependencies include the CVE-2026-102989 fix

  Scenario: The resolved registry dependency tree contains patched versions (C7)
    Given the registry dependencies are installed
    Then every resolved TanStack Start server-function package meets the patched minimum version

  Scenario: Public pages render with the patched production runtime (C8, E6)
    Given the registry has been built for production
    When an anonymous visitor requests public and login pages
    Then each page returns HTML successfully
