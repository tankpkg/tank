@atom-architecture
@adapter-capabilities
Feature: Adapter capability gating and degradation
  As a compilation pipeline
  I need adapters to declare capabilities per atom kind
  So that unsupported atoms are skipped, degraded atoms produce warnings, and supported atoms translate faithfully

  # ─── Capability declaration ────────────────────────────────────────────────

  @high
  Scenario: Adapter declares capabilities for all 7 atom kinds
    Given a platform adapter named "test-adapter"
    When the adapter capabilities are validated
    Then all 7 atom kinds have a support level declared
    And each support level is one of "full", "degraded", or "none"

  # ─── Full support ──────────────────────────────────────────────────────────

  @high
  Scenario: Atom compiled with full support
    Given an instruction atom with content "./rules.md"
    And an adapter with instruction capability "full"
    When the atom is compiled through the adapter
    Then the output contains at least one file write
    And the output contains no warnings

  # ─── Degraded support ──────────────────────────────────────────────────────

  @high
  Scenario: Atom compiled with degraded support
    Given a hook atom with event "pre-tool-use" and DSL handler
    And an adapter with hook capability "degraded"
    When the atom is compiled through the adapter
    Then the output contains at least one file write
    And the output contains a warning with level "degraded"
    And the warning message mentions the atom kind "hook"

  # ─── No support ────────────────────────────────────────────────────────────

  @high
  Scenario: Atom skipped when capability is none
    Given a hook atom with event "pre-tool-use" and DSL handler
    And an adapter with hook capability "none"
    When the atom is compiled through the adapter
    Then the output contains zero file writes
    And the output contains a warning with level "skipped"
    And the warning message mentions the atom kind "hook"

  # ─── Version compatibility ─────────────────────────────────────────────────

  @high
  Scenario: Target version within supported range
    Given an adapter with supported range ">=2.4.0 <3.0.0"
    And a target platform version "2.5.0"
    When version compatibility is checked
    Then the check passes

  @high
  Scenario: Target version outside supported range
    Given an adapter with supported range ">=2.4.0 <3.0.0"
    And a target platform version "3.1.0"
    When version compatibility is checked
    Then the check fails
    And the failure message mentions the supported range and the actual version

  @medium
  Scenario: Target version at exact lower bound
    Given an adapter with supported range ">=2.4.0 <3.0.0"
    And a target platform version "2.4.0"
    When version compatibility is checked
    Then the check passes

  @medium
  Scenario: Target version at exact upper bound (exclusive)
    Given an adapter with supported range ">=2.4.0 <3.0.0"
    And a target platform version "3.0.0"
    When version compatibility is checked
    Then the check fails
