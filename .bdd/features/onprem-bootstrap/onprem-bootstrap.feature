# Intent: .idd/modules/onprem-bootstrap/INTENT.md
# Layer: Constraints (C1–C9), Examples (E1–E7)

@onprem-bootstrap
@real-db
Feature: On-prem admin bootstrap without SMTP or OAuth
  As a platform engineer deploying Tank internally
  I want to set admin credentials via environment variables
  So that I can log into the web UI immediately without configuring SMTP or an IdP

  # ── init-db.sh creates admin (C1, C2) ──────────────────────────────────
  @high
  Scenario: Bootstrap creates verified admin account from env vars (E1)
    Given FIRST_ADMIN_EMAIL is set to "admin@corp.com"
    And FIRST_ADMIN_PASSWORD is set to a non-empty value
    When I run init-db.sh
    Then a user with email "admin@corp.com" exists in the database
    And the user's email_verified flag is true
    And the user has the admin role

  # ── Idempotent re-run (C7) ────────────────────────────────────────────
  @high
  Scenario: Re-running init-db.sh does not duplicate or overwrite (E2)
    Given an admin account "admin@corp.com" already exists from a previous bootstrap
    When I run init-db.sh again with the same FIRST_ADMIN_EMAIL
    Then only one account with email "admin@corp.com" exists
    And no error is returned
    And the password is not overwritten

  # ── Missing password (C1) ─────────────────────────────────────────────
  @high
  Scenario: Bootstrap fails when FIRST_ADMIN_PASSWORD is unset (E3)
    Given FIRST_ADMIN_EMAIL is set to "admin@corp.com"
    And FIRST_ADMIN_PASSWORD is not set
    When I run init-db.sh
    Then the script exits with a non-zero code
    And the error message contains "FIRST_ADMIN_PASSWORD"

  # ── Admin can log in after bootstrap (C8) ─────────────────────────────
  @high
  Scenario: Admin logs into web UI with bootstrapped credentials (E4)
    Given init-db.sh has been run with "admin@corp.com" and a known password
    And SKIP_EMAIL_VERIFICATION is true
    When I POST to the sign-in endpoint with those credentials
    Then the response is 200
    And a valid session cookie is returned

  # ── Skip verification for new signups (C3) ─────────────────────────────
  @high
  Scenario: New credential signup skips email verification when flag is set (E5)
    Given SKIP_EMAIL_VERIFICATION is true
    When a new user signs up with email "dev@corp.com" and a password
    Then the account is created with email_verified=true
    And no verification email is sent
    And the user can log in immediately

  # ── Default behavior preserved (C3 negative) ──────────────────────────
  @high
  Scenario: Credential signup requires verification when flag is unset (E6)
    Given SKIP_EMAIL_VERIFICATION is not set
    When a new user signs up with email "dev@corp.com" and a password
    Then the account is created with email_verified=false
    And the user cannot log in until email is verified

  # ── Startup warning (C5) ───────────────────────────────────────────────
  @medium
  Scenario: Startup logs warning when email verification is disabled (E7)
    Given SKIP_EMAIL_VERIFICATION is true
    When the Tank web application starts
    Then the console output contains "Email verification disabled"
