Feature: On-Prem Setup Wizard
  As a self-hosted admin deploying Tank for the first time
  I need a guided setup wizard
  So I can configure Tank without CLI tools or git clone

  Background:
    Given a fresh Tank deployment with no system_config table

  # ── Step 1: Database ──

  Scenario: Wizard shows DB config on first boot
    When I visit "/"
    Then I am redirected to "/setup"
    And the wizard shows the "Database" step

  Scenario: Valid database connection initializes schema
    Given I am on the "Database" step
    When I enter a valid DATABASE_URL
    And I click "Test & Initialize"
    Then the connection test succeeds
    And the database schema is created
    And the wizard advances to the "Instance URL" step

  Scenario: Invalid database URL shows error
    Given I am on the "Database" step
    When I enter an invalid DATABASE_URL
    And I click "Test & Initialize"
    Then I see an error "Could not connect to database"
    And the wizard stays on the "Database" step

  # ── Step 4: Admin Account ──

  Scenario: Create admin account
    Given the database is initialized
    And I am on the "Admin Account" step
    When I enter email "admin@company.com" and password "securepass123"
    And I click "Create Admin"
    Then a user with email "admin@company.com" is created
    And the user has role "admin"
    And the wizard advances to the "Auth Providers" step

  Scenario: Weak password is rejected
    Given I am on the "Admin Account" step
    When I enter email "admin@company.com" and password "short"
    And I click "Create Admin"
    Then I see an error "Password must be at least 8 characters"

  # ── Step 6: Scanner LLM ──

  Scenario: Configure Groq as scanner LLM
    Given I am on the "Scanner LLM" step
    When I select provider "Groq"
    And I enter API key "gsk-test-key"
    And I click "Test Connection"
    Then the LLM test returns a response
    And the API key is stored encrypted in system_config
    And the wizard advances to the "Complete" step

  Scenario: Disable scanner LLM
    Given I am on the "Scanner LLM" step
    When I select provider "Disabled"
    And I click "Continue"
    Then scanner_provider is set to "disabled" in system_config
    And the wizard advances to the "Complete" step

  # ── Completion ──

  Scenario: Complete setup unlocks the application
    Given all wizard steps are completed
    When I click "Complete Setup"
    Then system_config.setup_completed is true
    And I am redirected to "/"
    And the application loads normally

  Scenario: Setup wizard is inaccessible after completion
    Given setup is already completed
    When I visit "/setup"
    Then I am redirected to "/"

  # ── Health endpoint always accessible ──

  Scenario: Health endpoint works during setup
    Given setup is not completed
    When I request "GET /api/health"
    Then the response status is 200

  # ── Headless mode ──

  Scenario: Headless mode skips wizard
    Given environment variables are set:
      | FIRST_ADMIN_EMAIL    | admin@company.com |
      | FIRST_ADMIN_PASSWORD | securepass123     |
      | AUTO_MIGRATE         | true              |
    When the container starts
    Then the database schema is created automatically
    And a user with email "admin@company.com" is created with role "admin"
    And system_config.setup_completed is true
    And the application loads normally at "/"

  Scenario: Headless mode fails without password
    Given environment variables are set:
      | FIRST_ADMIN_EMAIL | admin@company.com |
      | AUTO_MIGRATE      | true              |
    When the container starts
    Then the entrypoint fails with "FIRST_ADMIN_PASSWORD required for headless setup"

Feature: Encrypted Config Storage
  As a self-hosted admin
  I need API keys stored encrypted at rest
  So that database access alone doesn't expose secrets

  Scenario: API key round-trips through encryption
    Given BETTER_AUTH_SECRET is "test-master-key-32-chars-long!!"
    When I encrypt "sk-groq-my-secret-key"
    And I decrypt the result
    Then I get "sk-groq-my-secret-key"

  Scenario: Decryption with wrong key fails
    Given BETTER_AUTH_SECRET is "correct-key"
    When I encrypt "sk-groq-my-secret-key"
    And I try to decrypt with key "wrong-key"
    Then decryption fails with an error

Feature: Scanner Per-Request LLM Config
  As the Tank web application
  I need to inject LLM config into scan requests
  So the scanner uses admin-configured providers without direct DB access

  Scenario: Scanner uses per-request config over env vars
    Given the scanner has GROQ_API_KEY set in environment
    When a scan request includes llm_config with provider "openrouter"
    Then the scanner uses "openrouter" not "groq"

  Scenario: Scanner falls back to env vars when no request config
    Given the scanner has GROQ_API_KEY set in environment
    When a scan request has no llm_config field
    Then the scanner uses "groq" from env vars
