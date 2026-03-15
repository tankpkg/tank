# Intent: idd/modules/permission-escalation/INTENT.md
# Layer: Constraints (C1–C8), Examples (E1–E9)

@permission-escalation
Feature: Permission escalation detection logic
  As the Tank registry
  I need to block unauthorized permission expansions on new version publishes
  So that a PATCH update cannot silently gain network access or subprocess execution

  # ── MAJOR bump always allowed (C1) ───────────────────────────────────
  @high
  Scenario: MAJOR bump with any new permission is allowed (E1)
    Given previous version "1.0.0" has no network permissions
    When checking escalation for new version "2.0.0" with network.outbound added
    Then the result is allowed

  # ── MINOR bump rules (C2) ─────────────────────────────────────────────
  @high
  Scenario: MINOR bump adding network.outbound is blocked (E2)
    Given previous version "1.0.0" has no network permissions
    When checking escalation for new version "1.1.0" with network.outbound added
    Then the result is not allowed
    And the violations mention "MAJOR"

  @high
  Scenario: MINOR bump adding subprocess is blocked (E3 variant)
    Given previous version "1.0.0" has subprocess disabled
    When checking escalation for new version "1.1.0" with subprocess enabled
    Then the result is not allowed

  @medium
  Scenario: MINOR bump adding filesystem.read is allowed (E5)
    Given previous version "1.0.0" has no filesystem.read permissions
    When checking escalation for new version "1.1.0" with filesystem.read added
    Then the result is allowed

  # ── PATCH bump rules (C3) ─────────────────────────────────────────────
  @high
  Scenario: PATCH bump with any new permission is blocked (E3, E4)
    Given previous version "1.0.0" has no permissions
    When checking escalation for new version "1.0.1" with network.outbound added
    Then the result is not allowed
    And the violations mention "PATCH"

  @high
  Scenario: PATCH bump adding filesystem.write is blocked (E4)
    Given previous version "1.0.0" has no filesystem.write permissions
    When checking escalation for new version "1.0.1" with filesystem.write added
    Then the result is not allowed

  # ── No escalation (C3 negative) ───────────────────────────────────────
  @high
  Scenario: PATCH bump with no permission changes is allowed (E6)
    Given previous version "1.0.0" has network.outbound "api.example.com"
    When checking escalation for new version "1.0.1" with same permissions
    Then the result is allowed

  # ── Removing permissions (C5) ─────────────────────────────────────────
  @medium
  Scenario: Removing permissions is always allowed (E7)
    Given previous version "1.0.0" has network.outbound "api.example.com"
    When checking escalation for new version "1.0.1" with network.outbound removed
    Then the result is allowed

  # ── First publish (C4) ────────────────────────────────────────────────
  @high
  Scenario: First publish with no previous version is always allowed (E8)
    When checking escalation with no previous version
    Then the result is allowed
