Feature: Content-addressable tarball cache for install

  Scenario: Cache hit skips tarball download
    Given a lockfile entry for "@test-org/my-skill@2.0.0" with integrity "sha512-<valid>"
    And a cached tarball exists at "~/.tank/cache/<sha512-hex>.tgz"
    When install runs from lockfile
    Then the tarball download URL is not fetched
    And the skill is extracted from the cached tarball

  Scenario: Cache miss downloads and persists tarball
    Given a lockfile entry for "@test-org/my-skill@2.0.0" with integrity "sha512-<valid>"
    And no tarball exists in "~/.tank/cache/" for that integrity
    When install runs from lockfile
    Then the tarball is downloaded once
    And the tarball is stored as "~/.tank/cache/<sha512-hex>.tgz"
    And the skill is extracted successfully

  Scenario: Corrupted cached tarball is invalidated and re-downloaded
    Given a lockfile entry for "@test-org/my-skill@2.0.0" with integrity "sha512-<valid>"
    And a cached tarball exists at "~/.tank/cache/<sha512-hex>.tgz"
    And extraction from that cached tarball fails
    When install runs from lockfile
    Then the cached tarball is removed
    And the tarball is downloaded again
    And extraction succeeds from the re-downloaded tarball

  Scenario: Cache clean removes global tarball cache
    Given cached tarballs exist under "~/.tank/cache/"
    When I run "tank cache clean"
    Then "~/.tank/cache/" does not exist
