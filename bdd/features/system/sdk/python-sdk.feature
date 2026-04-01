Feature: Python SDK
  As a Python developer using agent frameworks
  I want a Pythonic Tank SDK with full skill access
  So that I can search, read, and load skills from Python

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
    And the exception has attribute "status" with value 404

  # E32, C43: Python download with base64 integrity
  Scenario: Python SDK downloads and verifies tarball integrity
    Given a Python TankClient with token "tank_test_token"
    And the registry contains published skill "@tank/react" at version "1.0.0"
    When I call download("@tank/react", "1.0.0", dest="./test-skills/") from Python
    Then the file "./test-skills/@tank/react-1.0.0.tgz" exists
    And the integrity hash uses sha512-base64 format

  # E41, C30: Python read_skill
  Scenario: Python SDK read_skill returns full content with references
    Given a Python TankClient
    And the registry contains published skill with references
    When I call read_skill from Python
    Then the result is a SkillContent dataclass
    And the result has content, references, scripts, and files

  # E42, C31: Context manager
  Scenario: Python SDK supports context manager
    When I create a TankClient with "with" statement
    Then the client is usable inside the block
    And the httpx client is closed after exit

  # E43, C41: URL validation
  Scenario: Python SDK rejects invalid registry URLs
    When I create a Python TankClient with registry_url "ftp://evil.com"
    Then a ValueError is raised

  Scenario: Python SDK rejects registry URLs with credentials
    When I create a Python TankClient with registry_url "https://user:pass@evil.com"
    Then a ValueError is raised

  # C42: Download size limit
  Scenario: Python SDK enforces streaming download size limit
    Given a Python TankClient
    When downloading a tarball larger than 100MB
    Then a TankNetworkError is raised
