@schemas
Feature: Versioned JSON Schemas for skill manifests and lockfiles
  As a Tank user configuring editor validation
  I need stable, versioned schema URLs for manifest and lockfile formats
  So that my editor can autocomplete and validate files consistently across machines

  @high
  Scenario: Web build generates versioned schema files from shared Zod definitions
    Given shared Zod schemas define the manifest and lockfile contracts
    When the schema generation build step runs
    Then public/schemas/v1/skills.json is generated
    And public/schemas/v1/skills.lock is generated
    And both generated files are valid JSON Schema documents

  @high
  Scenario: Generated manifest schema is suitable for editor validation
    Given the generated file public/schemas/v1/skills.json exists
    When an editor resolves "$schema" to https://www.tankpkg.dev/schemas/v1/skills.json
    Then the schema declares object properties for manifest fields
    And the schema validates a real project tank.json manifest

  @high
  Scenario: tank init writes a schema URL into generated manifest files
    Given a user initializes a new skill project
    When tank init writes tank.json
    Then tank.json contains "$schema": "https://www.tankpkg.dev/schemas/v1/skills.json"
    And the generated file still passes runtime Zod validation
