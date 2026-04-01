Feature: SDK Install Pipeline
  As a developer building an agent framework
  I want to install, update, and remove skills programmatically
  So that my tool can manage skills without shelling out to the CLI

  Background:
    Given an authenticated TankClient
    And the registry contains published skill "@tank/react" at version "1.0.0"
    And a clean project directory with an empty skills.json

  # E20, C20: Full install flow
  Scenario: Install resolves, downloads, extracts, writes lockfile, and links
    When I call install("@tank/react")
    Then the skill "@tank/react" is extracted to the project skills directory
    And the lockfile contains entry "@tank/react" with "sha512-" integrity hash
    And the skills.json "skills" map contains "@tank/react"
    And the skill is linked to detected agents

  # E21, C21: Progress callbacks
  Scenario: Install emits progress events for each phase
    Given a progress callback recorder
    When I call install("@tank/react", { onProgress: recorder })
    Then the recorder received events with phases in order:
      | phase       |
      | resolving   |
      | downloading |
      | extracting  |
      | verifying   |
      | linking     |
    And each event includes "skill", "current", "total", and "progress" fields

  # E22, C20: Idempotent install
  Scenario: Install of already-installed skill is a no-op
    Given "@tank/react" at "1.0.0" is already installed in the project
    When I call install("@tank/react")
    Then the result has "alreadyInstalled" as true
    And the lockfile is unchanged
    And no HTTP download request was made

  # E23, C22: Unresolvable version range
  Scenario: Install with unsatisfiable version range throws TankConflictError
    When I call install("@tank/react@^99.0.0")
    Then a TankConflictError is thrown
    And the error includes resolution details
    And no files were written to disk

  # E24, C23: Permission budget exceeded — rejected
  Scenario: Install rejects when skill exceeds permission budget
    Given the registry contains skill "@org/risky" requiring subprocess permission
    And the project skills.json has subprocess set to false
    When I call install("@org/risky")
    Then a TankPermissionError is thrown
    And the error includes required vs allowed permissions
    And no files were written to disk

  # E25, C23: Permission budget exceeded — auto-accept
  Scenario: Install with yes flag accepts permission expansion
    Given the registry contains skill "@org/risky" requiring subprocess permission
    And the project skills.json has subprocess set to false
    When I call install("@org/risky", { yes: true })
    Then the skill is installed successfully
    And the lockfile reflects the expanded permission budget

  # E26, C24: Update
  Scenario: Update downloads newer version within semver range
    Given "@tank/react" at "1.0.0" is installed
    And the registry has "@tank/react" version "1.1.0"
    When I call update("@tank/react")
    Then the lockfile entry for "@tank/react" shows version "1.1.0"
    And the skill files on disk are updated

  # E27, C25: Remove
  Scenario: Remove deletes skill files, lockfile entry, and agent links
    Given "@tank/react" at "1.0.0" is installed and linked
    When I call remove("@tank/react")
    Then the skill directory for "@tank/react" no longer exists
    And the lockfile no longer contains "@tank/react"
    And the skills.json no longer references "@tank/react"
    And the agent config no longer references "@tank/react"
