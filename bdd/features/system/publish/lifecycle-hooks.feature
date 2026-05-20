# Intent: idd/modules/publish/INTENT.md
# Layer: Constraints C13-C15, Examples E11-E13 (issue #454)
# Executable verification: packages/cli/src/__tests__/publish-lifecycle.test.ts

@publish
@lifecycle-hooks
Feature: publish.build and publish.files lifecycle hooks
  As a skill author shipping a compiled package (e.g. TypeScript -> dist/)
  I need tank.json to declare a pre-publish build command and an explicit
  files allow-list
  So that "tank publish" is a single idempotent command that cannot
  accidentally ship a broken or incomplete tarball.

  @high
  Scenario: publish.build runs before packing and aborts on failure (C13, E11)
    Given a tank.json containing "publish": { "build": "exit 1" }
    When I run "tank publish"
    Then the build hook is executed before pack
    And the publish aborts before any upload is attempted
    And the CLI exits non-zero

  @high
  Scenario: publish.files restricts the tarball to declared globs (C14, E12)
    Given a tank.json with publish.files = ["dist/**", "SKILL.md"]
    And a directory containing tank.json, SKILL.md, src/index.ts, dist/main.js, and .gitignore listing "dist/"
    When I run "tank publish --dry-run"
    Then the tarball contains tank.json, SKILL.md, and dist/main.js
    And the tarball does NOT contain src/index.ts
    And the tarball does NOT contain anything under node_modules or .git regardless of globs

  @medium
  Scenario: publish.build and publish.files compose; publish key is stripped from outbound manifest (C15, E13)
    Given a tank.json with both publish.build = "npm run build" and publish.files = ["dist/**"]
    When I run "tank publish"
    Then the build hook runs first
    And on build success the packer applies the files allow-list
    And the manifest body POSTed to /api/v1/skills has no "publish" key

  @medium
  Scenario: Manifest without publish block keeps legacy .tankignore/.gitignore behavior (backwards compat)
    Given a tank.json with no publish block
    When I run "tank publish --dry-run"
    Then the packer respects .tankignore then .gitignore then defaults exactly as before
