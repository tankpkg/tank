# Intent: idd/modules/atom-type-badges/INTENT.md
# Layer: Constraints (C1–C5, C13), Examples (E1–E8, E14)

@atom-type-badges
Feature: Atom type extraction and data layer
  As a registry user
  I need packages to expose their atom composition
  So that I can understand what I'm installing before I click

  # ── extractAtomKinds utility ─────────────────────────────────────────────
  @atom-type-badges
  @unit
  Scenario: Extract unique kinds from multi-atom manifest (E1)
    Given a manifest with atoms of kinds "hook", "hook", and "agent"
    When I call extractAtomKinds on the manifest
    Then the result is ["hook", "agent"]

  @atom-type-badges
  @unit
  Scenario: Extract three distinct kinds (E2)
    Given a manifest with atoms of kinds "instruction", "tool", and "rule"
    When I call extractAtomKinds on the manifest
    Then the result is ["instruction", "tool", "rule"]

  @atom-type-badges
  @unit
  Scenario: Legacy manifest with no atoms field returns skill fallback (E3)
    Given a manifest with no atoms field
    When I call extractAtomKinds on the manifest
    Then the result is ["skill"]

  @atom-type-badges
  @unit
  Scenario: Manifest with empty atoms array returns skill fallback (E4)
    Given a manifest with an empty atoms array
    When I call extractAtomKinds on the manifest
    Then the result is ["skill"]

  # ── isBundle utility ──────────────────────────────────────────────────────
  @atom-type-badges
  @unit
  Scenario: Two distinct real types is a bundle (E5)
    Given atom kinds ["hook", "agent"]
    When I call isBundle
    Then the result is true

  @atom-type-badges
  @unit
  Scenario: Single legacy kind is not a bundle (E6)
    Given atom kinds ["skill"]
    When I call isBundle
    Then the result is false

  @atom-type-badges
  @unit
  Scenario: Single real kind is not a bundle (E6)
    Given atom kinds ["instruction"]
    When I call isBundle
    Then the result is false
