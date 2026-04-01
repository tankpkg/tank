Feature: Python SDK
  As a Python developer using agent frameworks
  I want a Pythonic Tank SDK with full install pipeline
  So that I can manage skills from Python without the CLI

  # E30, C31: Python conventions
  Scenario: Python SDK uses snake_case and Python conventions
    Given a Python TankClient with token "tank_test_token"
    When I call search("react") from Python
    Then the result uses snake_case field names
    And the result is a Python dict with "results", "total", "page", "limit" keys

  # E31, C32: Python typed exceptions
  Scenario: Python SDK raises TankNotFoundError for missing skills
    Given a Python TankClient with token "tank_test_token"
    When I call info("@acme/nonexistent") from Python
    Then a TankNotFoundError exception is raised
    And the exception has attribute "status_code" with value 404

  # E32, C30: Python download with integrity verification
  Scenario: Python SDK downloads and verifies tarball integrity
    Given a Python TankClient with token "tank_test_token"
    And the registry contains published skill "@tank/react" at version "1.0.0"
    When I call download("@tank/react", "1.0.0", dest="./test-skills/") from Python
    Then the file "./test-skills/@tank/react-1.0.0.tgz" exists
    And the file integrity is verified

  # C33, C34: Python install via Rust core
  Scenario: Python SDK install uses shared Rust core
    Given a Python TankClient with token "tank_test_token"
    And a clean project directory with an empty skills.json
    When I call install("@tank/react") from Python
    Then the skill "@tank/react" is extracted to the project skills directory
    And the lockfile contains entry "@tank/react" with integrity hash
    And the install used the Rust core for dependency resolution
