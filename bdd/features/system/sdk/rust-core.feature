Feature: Shared Rust Core
  As the SDK maintainer
  I want a single Rust implementation for install logic
  So that both TS and Python SDKs behave identically

  # C33: Rust core implements core install logic
  Scenario: Rust core resolves dependency tree
    Given a skill "@org/parent" that depends on "@org/child@^1.0.0"
    And the registry has "@org/child" at versions "1.0.0" and "1.1.0"
    When the Rust resolver is invoked for "@org/parent"
    Then the resolved tree includes "@org/child" at "1.1.0"

  Scenario: Rust core checks permission budget
    Given a skill requiring network outbound to "*.external.com"
    And a project permission budget allowing only "*.internal.com"
    When the Rust permission checker evaluates the skill
    Then it reports a permission violation for network.outbound

  Scenario: Rust core extracts and verifies tarball
    Given a tarball with known SHA-512 hash
    When the Rust extractor processes the tarball to a destination directory
    Then the extracted files match the tarball contents
    And the integrity check passes

  Scenario: Rust core writes lockfile in v2 format
    Given resolved skills "@org/a@1.0.0" and "@org/b@2.0.0" with integrity hashes
    When the Rust lockfile writer creates a lockfile
    Then the lockfile has "lockfileVersion" 2
    And each entry includes "resolved", "integrity", "permissions"

  # C34: NAPI-RS bindings work from Node.js
  Scenario: Node.js can call Rust resolver via NAPI-RS
    When I call the NAPI resolver binding from TypeScript with skill "@org/parent"
    Then the result is a resolved dependency tree
    And the call completes without native binding errors

  # C34: PyO3 bindings work from Python
  Scenario: Python can call Rust resolver via PyO3
    When I call the PyO3 resolver binding from Python with skill "@org/parent"
    Then the result is a resolved dependency tree
    And the call completes without native binding errors

  # C35: Graceful fallback when native binary unavailable
  Scenario: TS SDK falls back to pure-TS implementation when Rust binary is missing
    Given the NAPI-RS native binary is not installed
    When I call install("@tank/react") from the TS SDK
    Then the install succeeds using the pure-TS implementation
    And a warning is logged about missing native acceleration
