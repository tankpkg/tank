# Intent: idd/modules/url-install/INTENT.md
# Layer: Constraints (C1–C16), Examples (E1–E10)

@url-install
Feature: Install skills from URLs with security scanning
  As a developer who found a skill online
  I want to install it via tank install <url>
  So that Tank scans it for security issues before it touches my system

  # ── URL detection and routing (C1, C12, E10) ─────────────────────────
  @high
  Scenario: URL input is routed to URL install flow (E1)
    Given a valid GitHub skill URL "https://github.com/user/clean-skill"
    When I run "tank install https://github.com/user/clean-skill"
    Then the URL install flow is triggered (not the registry install flow)

  @high
  Scenario: Package name input still uses registry install (C12, E10)
    Given a registered skill "@org/my-skill"
    When I run "tank install @org/my-skill"
    Then the registry install flow is used (not the URL install flow)

  # ── Source support (C2, E1, E3, E5) ──────────────────────────────────
  @high
  Scenario: Install from GitHub URL (E1)
    Given a GitHub repository "https://github.com/user/clean-skill" with a valid SKILL.md
    And the security scan returns verdict "pass"
    When I run "tank install https://github.com/user/clean-skill"
    Then the skill is installed to ".tank/skills/clean-skill/"
    And the lockfile entry has source "github"
    And the lockfile entry has scan_verdict "pass"
    And the lockfile entry has a scanned_at timestamp

  @high
  Scenario: Install from ClawHub URL (E3)
    Given a ClawHub skill page "https://clawhub.ai/user/cool-skill"
    And the security scan returns verdict "pass"
    When I run "tank install https://clawhub.ai/user/cool-skill"
    Then the skill is installed to ".tank/skills/cool-skill/"
    And the lockfile entry has source "clawhub"

  @high
  Scenario: Install from skills.sh URL (E5)
    Given a skills.sh skill "https://skills.sh/owner/repo/my-skill"
    And the security scan returns verdict "pass"
    When I run "tank install https://skills.sh/owner/repo/my-skill"
    Then the skill is installed to ".tank/skills/my-skill/"
    And the lockfile entry has source "skills_sh"

  # ── Disallowed hosts (C2, E8) ────────────────────────────────────────
  @high
  Scenario: URL from disallowed host is rejected (C2, E8)
    When I run "tank install https://evil.example.com/skill.tgz"
    Then the install fails with an error mentioning "not a known registry"
    And no files are downloaded

  # ── Scan verdicts (C3, C4, C5, C6, E1, E2, E3, E4) ─────────────────
  @high
  Scenario: Scan runs before install — pass verdict proceeds (C3, C6, E1)
    Given a GitHub repository with a valid SKILL.md
    And the security scan returns verdict "pass"
    When I run "tank install https://github.com/user/clean-skill"
    Then the scan results are displayed
    And the skill is installed successfully

  @high
  Scenario: Fail verdict blocks install unconditionally (C4, E2)
    Given a GitHub repository with a valid SKILL.md
    And the security scan returns verdict "fail" with critical findings
    When I run "tank install https://github.com/user/malicious-skill"
    Then the install is blocked with exit code 1
    And the findings are displayed
    And no files are placed in ".tank/skills/"

  @high
  Scenario: Flagged verdict prompts user — user accepts (C5, E3)
    Given a GitHub repository with a valid SKILL.md
    And the security scan returns verdict "flagged" with medium findings
    When I run "tank install https://github.com/user/flagged-skill" interactively
    And the security prompt appears showing findings
    And I accept the prompt
    Then the skill is installed successfully

  @high
  Scenario: Flagged verdict prompts user — user declines (C5, E4)
    Given a GitHub repository with a valid SKILL.md
    And the security scan returns verdict "flagged" with medium findings
    When I run "tank install https://github.com/user/flagged-skill" interactively
    And the security prompt appears showing findings
    And I decline the prompt
    Then the install is cancelled
    And no files are placed in ".tank/skills/"

  @high
  Scenario: --yes flag auto-accepts flagged verdict (C7, E9)
    Given a GitHub repository with a valid SKILL.md
    And the security scan returns verdict "flagged"
    When I run "tank install https://github.com/user/flagged-skill --yes"
    Then no prompt is shown
    And the skill is installed successfully

  # ── Skill structure validation (C8, C9, E6, E7) ─────────────────────
  @high
  Scenario: Missing SKILL.md rejects install (C8, E6)
    Given a GitHub repository with no SKILL.md file
    And the security scan returns verdict "pass"
    When I run "tank install https://github.com/user/no-skillmd"
    Then the install fails with an error mentioning "SKILL.md"

  @high
  Scenario: Missing tank.json is generated automatically (C9, E7)
    Given a GitHub repository with a valid SKILL.md but no tank.json
    And the security scan returns verdict "pass"
    When I run "tank install https://github.com/user/no-manifest"
    Then a tank.json is generated with name inferred from URL
    And the version is "0.0.0"
    And the skill is installed successfully

  # ── Lockfile tracking (C10, C11) ─────────────────────────────────────
  @high
  Scenario: Lockfile entry contains provenance metadata (C10, C11)
    Given a successful URL install from "https://github.com/user/clean-skill"
    Then the lockfile entry key is "clean-skill@0.0.0"
    And the lockfile entry "resolved" is "https://github.com/user/clean-skill"
    And the lockfile entry "integrity" starts with "sha512-"
    And the lockfile entry "source" is "github"
    And the lockfile entry "scan_verdict" is "pass"
    And the lockfile entry "scanned_at" is a valid ISO 8601 timestamp

  # ── Global install (E11, E12) ─────────────────────────────────────────
  @high
  Scenario: Global install places skill in ~/.tank/skills/ (E11)
    Given a GitHub repository with a valid SKILL.md
    And the security scan returns verdict "pass"
    When I run "tank install -g https://github.com/user/clean-skill"
    Then the skill is installed to "~/.tank/skills/clean-skill/"
    And the lockfile is written to "~/.tank/tank.lock"

  @medium
  Scenario: Global install works with ClawHub URLs (E12)
    Given a ClawHub skill page "https://clawhub.ai/user/cool-skill"
    And the security scan returns verdict "pass"
    When I run "tank install --global https://clawhub.ai/user/cool-skill"
    Then the skill is installed to "~/.tank/skills/cool-skill/"

  # ── Agent linking ────────────────────────────────────────────────────
  @medium
  Scenario: Installed skill is linked to detected agents
    Given a successful URL install from "https://github.com/user/clean-skill"
    And Claude Code is detected as an installed agent
    Then the skill is symlinked to the Claude Code skills directory

  # ── Cleanup (C13) ───────────────────────────────────────────────────
  @medium
  Scenario: Temp directory is cleaned up after successful install (C13)
    Given a successful URL install
    Then no temporary directories remain in the system temp path

  @medium
  Scenario: Temp directory is cleaned up after failed install (C13)
    Given a URL install that fails due to scan verdict "fail"
    Then no temporary directories remain in the system temp path

  # ── Authentication and rate limits (C15, C16) ────────────────────────
  @medium
  Scenario: Scan works without authentication (C15)
    Given no Tank auth token is configured
    When I run "tank install https://github.com/user/clean-skill"
    Then the scan API is called without an Authorization header
    And the scan still executes (public endpoint)

  @low
  Scenario: Authenticated user gets higher rate limit (C16)
    Given a Tank auth token is configured
    When I run "tank install https://github.com/user/clean-skill"
    Then the scan API is called with the Authorization header
