# Intent: idd/modules/install/INTENT.md
# Layer: Constraints (C19–C27)
# Executable coverage: packages/cli/src/__tests__/install-local.test.ts — one test per scenario, against an
# in-process fake registry that records every request. No bdd/steps file: the scenarios need fetch/tar mocks
# and no running services, so they live with the CLI's vitest suite rather than `just test bdd`.

@install
@local-skills
Feature: Install registry skills and link local skills from one manifest
  As a team that keeps private skills in a git repo next to public registry dependencies
  I want one tank.json and one "tank install"
  So that public skills are fetched and verified, local skills are linked, and nothing private reaches the registry

  @high
  Scenario: Fresh install links local skills and installs their registry deps (C19, C21, C22, C24)
    Given a tank.json with "@tank/clean-code": "3.1.0" and "@acme/pr-description": "link:./skills/pr-description"
    And ./skills/pr-description/tank.json depends on "@tank/crystal-clear-docs": "^1.1.0"
    And no tank.lock
    When I run "tank install"
    Then "@tank/clean-code@3.1.0" and "@tank/crystal-clear-docs" are downloaded and hash-checked
    And "@acme/pr-description" is linked to every detected agent from ./skills/pr-description
    And tank.lock has "@acme/pr-description@1.0.0" with source "local", resolved "link:./skills/pr-description" and integrity null
    And no request mentions "@acme/pr-description" or contains files from ./skills

  @high
  Scenario: Lockfile install never asks the registry for a local skill (C21, C25)
    Given a committed tank.lock with "@acme/pr-description@1.0.0" with source "local"
    And an empty .tank directory
    When I run "tank install"
    Then no registry request is made for "@acme/pr-description"
    And "@acme/pr-description" is linked from ./skills/pr-description
    And the install succeeds

  @high
  Scenario: Local skill changed since the lockfile was written (C25)
    Given a committed tank.lock with "@acme/pr-description@1.0.0"
    And ./skills/pr-description/tank.json now declares subprocess: true
    When I run "tank install"
    Then the install fails before any network request and names "permissions"

  @high
  Scenario: Locked local skill that left link: is rejected (C25)
    Given a committed tank.lock with local "@acme/pr-description@1.0.0"
    And tank.json no longer lists "@acme/pr-description" as "link:"
    When I run "tank install"
    Then the install fails before any network request and names "@acme/pr-description"

  @high
  Scenario: Local skill mcp_server is not registered (C23)
    Given ./skills/tool/tank.json declares an mcp_server
    When I run "tank install"
    Then "@acme/tool" is linked to agents
    And no agent config registers an MCP server for "@acme/tool"

  @high
  Scenario: Local skill over budget is rejected (C23)
    Given ./skills/code-review/tank.json declares subprocess: true
    And the project budget has subprocess: false
    When I run "tank install"
    Then the install fails and names "@acme/code-review" and "subprocess"
    And nothing is linked

  @high
  Scenario: Path escape is rejected (C19)
    Given tank.json has "@acme/evil": "link:../outside"
    When I run "tank install"
    Then the install fails before anything is fetched or linked

  @high
  Scenario: Name mismatch is rejected (C20)
    Given tank.json has "@acme/a": "link:./skills/b"
    And ./skills/b/tank.json has name "@acme/b"
    When I run "tank install"
    Then the install fails and shows both names

  @medium
  Scenario: Machine-local file:// lock entry is not sent to the registry (C26)
    Given tank.lock has an entry with source "local" resolved "file:///somewhere/else/my-skill"
    And the skill is not extracted on this machine
    When I run "tank install"
    Then the install fails with a message suggesting a "link:" entry
    And no registry request is made

  @medium
  Scenario: Other commands handle local skills (C27)
    Given an installed project with local skill "@acme/pr-description"
    Then "tank update @acme/pr-description" makes no registry request
    And "tank verify" fails if ./skills/pr-description is deleted or its permissions drift from tank.lock
    And "tank permissions" shows "@acme/pr-description (local)"
    And "tank remove @acme/pr-description" unlinks it and keeps ./skills/pr-description
