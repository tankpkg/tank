# Intent: .idd/modules/admin-service-accounts/INTENT.md
# Layer: Constraints (C1–C5), Examples (E1–E5)

@admin-service-accounts
@real-db
Feature: Admin service account management
  As a Tank administrator
  I need to create and manage service accounts with scoped API keys
  So that CI/CD pipelines can publish skills without using personal credentials

  Background:
    Given I am authenticated as an admin

  # ── Auth enforcement (C1) ─────────────────────────────────────────────
  @high
  Scenario: Any service account endpoint without auth returns 401 (E5)
    Given I am not authenticated
    When I call GET /api/admin/service-accounts
    Then the response is 401

  # ── Create service account (C2) ───────────────────────────────────────
  @high
  Scenario: POST /admin/service-accounts creates an account (E1)
    When I POST to /api/admin/service-accounts with name "BDD CI Publisher" and scopes ["skills:publish"]
    Then the response is 200 or 201
    And the response contains a service account ID

  # ── Create API key (C3) ────────────────────────────────────────────────
  @high
  Scenario: POST /admin/service-accounts/[id]/keys returns the raw key once (E2)
    Given a service account exists
    When I POST to /api/admin/service-accounts/{id}/keys
    Then the response contains a "key" field starting with "tank_"
    And the key is only shown in this response

  # ── Revoke key (C4) ───────────────────────────────────────────────────
  @high
  Scenario: DELETE /admin/service-accounts/[id]/keys/[keyId] revokes the key (E3)
    Given a service account with an API key exists
    When I DELETE /api/admin/service-accounts/{id}/keys/{keyId}
    Then the response is 200
    And the key no longer appears in the account's key list

  # ── Delete service account (C5) ───────────────────────────────────────
  @medium
  Scenario: DELETE /admin/service-accounts/[id] removes account and keys (E4)
    Given a service account with keys exists
    When I DELETE /api/admin/service-accounts/{id}
    Then the response is 200
    And the service account no longer exists
