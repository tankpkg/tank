# Intent: idd/modules/cicd/INTENT.md
# Layer: Constraints (C1–C3), Examples (E1–E5)

@cicd
@build-integrity
Feature: Build artifact integrity for npm-published packages
  As the Tank release pipeline
  I need built dist artifacts and package.json to be free of workspace-only references
  So that `npm install -g @tankpkg/cli` works on any machine without 404 errors

  Background:
    Given the monorepo packages have been built with `bun run build`

  # ── No workspace imports in dist (C1) ────────────────────────────────
  @high
  Scenario: CLI dist contains no @internal/* imports (E1)
    When I scan all .js files in the CLI dist directory
    Then no file contains an import from "@internal/"

  @high
  Scenario: MCP server dist contains no @internal/* imports (E3)
    When I scan all .js files in the MCP server dist directory
    Then no file contains an import from "@internal/"

  # ── No workspace deps in published package.json (C2) ─────────────────
  @high
  Scenario: CLI package.json has no workspace-only dependencies (E2)
    When I read the CLI package.json dependencies
    Then no dependency name starts with "@internal/"
    And no dependency version contains "workspace:"

  @high
  Scenario: MCP server package.json has no workspace-only dependencies (E4)
    When I read the MCP server package.json dependencies
    Then no dependency name starts with "@internal/"
    And no dependency version contains "workspace:"

  # ── Transitive deps surfaced (C3) ────────────────────────────────────
  @medium
  Scenario: CLI lists transitive deps of bundled @internal/shared
    When I read the CLI package.json dependencies
    Then "semver" is listed as a dependency
    And "zod" is listed as a dependency

  @medium
  Scenario: MCP server lists transitive deps of bundled @internal/shared
    When I read the MCP server package.json dependencies
    Then "semver" is listed as a dependency
