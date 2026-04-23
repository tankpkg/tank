# Intent: idd/modules/sdk-pypi-publish/INTENT.md
# Layer: Constraints (C1-C15), Examples (E1-E10)

@sdk-pypi-publish
Feature: Tank Python SDK publishes to PyPI in lockstep with the monorepo
  As a maintainer releasing Tank
  I want tank-sdk and tank-core to publish to PyPI on every tag push
  So that downstream Python consumers can `pip install tank-sdk`

  # -- Version lockstep (C5, C6, E5) ------------------------------------------
  @high
  Scenario: just bump updates Python SDK version sources (E5)
    Given the monorepo is at version 0.14.0
    When I run "just bump 0.15.0"
    Then packages/sdk-python/tankpkg/_version.py contains `__version__ = "0.15.0"`
    And packages/sdk-core/crates/python/pyproject.toml version is "0.15.0"
    And packages/sdk-core/crates/python/Cargo.toml version is "0.15.0"
    And "bash scripts/check-versions.sh" exits 0

  # -- Build correctness (C1, E1) ---------------------------------------------
  @high
  Scenario: ci-build-pypi-sdk produces a valid pure-Python wheel (E1)
    Given packages/sdk-python exists
    And the current version is 0.14.0
    When I run "just ci-build-pypi-sdk 0.14.0"
    Then packages/sdk-python/dist/tank_sdk-0.14.0-py3-none-any.whl exists
    And packages/sdk-python/dist/tank_sdk-0.14.0.tar.gz exists
    And "python -m twine check packages/sdk-python/dist/*" exits 0

  # -- Version mismatch detection (C5) ----------------------------------------
  @high
  Scenario: ci-build-pypi-sdk fails when built version does not match expected
    Given packages/sdk-python/tankpkg/_version.py declares "0.14.0"
    When I run "just ci-build-pypi-sdk 9.9.9"
    Then the command exits non-zero
    And stderr contains "Built version 0.14.0 != expected 9.9.9"

  # -- Name identity fix (C11) ------------------------------------------------
  @high
  Scenario: tank-sdk and tank-core are distinct PyPI names with distinct imports
    Given packages/sdk-python/pyproject.toml
    And packages/sdk-core/crates/python/pyproject.toml
    Then the sdk-python project name is "tank-sdk"
    And the sdk-core/python project name is "tank-core"
    And packages/sdk-core/crates/python/src/lib.rs declares `fn tankpkg_core`
    And packages/sdk-core/crates/python/Cargo.toml lib name is "tankpkg_core"

  # -- Graceful fallback (C4, E3, E8) -----------------------------------------
  @high
  Scenario: tank-sdk works without tank-core installed (E3, E8)
    Given tank-sdk 0.14.0 is installed in a fresh virtualenv
    And tank-core is NOT installed
    When I import tankpkg
    Then `tankpkg.has_native()` returns False
    And `TankClient()` constructs successfully
    And SHA-512 integrity verification uses the pure-Python hashlib path

  @high
  Scenario: tank-sdk uses native acceleration when tank-core is installed (E2, E7)
    Given tank-sdk 0.14.0 is installed in a fresh virtualenv
    And tank-core 0.14.0 is installed in the same virtualenv
    When I import tankpkg
    Then `tankpkg.has_native()` returns True
    And SHA-512 integrity verification uses the Rust `verify_integrity` function

  # -- Release cascade (C7, E4) -----------------------------------------------
  @medium
  Scenario: Tag push triggers PyPI publish in parallel with npm + Docker (E4)
    Given the release workflow is at .github/workflows/release.yml
    When the "v0.14.0" tag is pushed
    Then the publish-pypi-sdk job runs in the "pypi" environment
    And the publish-pypi-core job runs in the "pypi" environment
    And both jobs use `pypa/gh-action-pypi-publish@release/v1`
    And neither job reads PYPI_API_TOKEN from secrets

  # -- No partial release on PyPI (Oracle H4) ---------------------------------
  @medium
  Scenario: tank-core publish is atomic across all platform wheels
    Given the release workflow builds tank-core wheels in a matrix
    And the matrix covers linux-x86_64, linux-aarch64, darwin-x86_64, darwin-arm64, windows-x86_64
    When publish-pypi-core runs
    Then all wheels and the sdist are uploaded by a single pypa/gh-action-pypi-publish step
    And the step has `print-hash: true`

  # -- Version check invariant (C5) -------------------------------------------
  @medium
  Scenario: check-versions.sh rejects drift across all 11 version sources
    Given packages/sdk-python/tankpkg/_version.py declares "0.14.0"
    And packages/sdk-core/crates/python/pyproject.toml declares "0.13.0"
    When I run "bash scripts/check-versions.sh"
    Then the command exits non-zero
    And stdout contains "Version mismatch"
