Feature: SDK Typed Errors
  As a developer handling SDK errors programmatically
  I want typed error classes with structured data
  So that I can route errors to the right handler in my application

  # E33: Error hierarchy
  Scenario: TankAuthError extends TankError extends Error
    When a TankAuthError is thrown
    Then the error is an instance of TankAuthError
    And the error is an instance of TankError
    And the error is an instance of Error

  # E34: Structured error properties
  Scenario: TankNotFoundError includes structured data
    When a TankNotFoundError is thrown for skill "@acme/missing"
    Then the error has property "status" with value 404
    And the error has property "skillName" with value "@acme/missing"
    And the error has property "message" containing "not found"

  # C11: All error types have correct status codes
  Scenario Outline: Each error type maps to the correct HTTP status
    When a <error_class> is thrown
    Then the error has property "status" with value <status>

    Examples:
      | error_class          | status |
      | TankAuthError        | 401    |
      | TankNotFoundError    | 404    |
      | TankPermissionError  | 403    |

  # C10: Network errors include cause
  Scenario: TankNetworkError wraps the original connection error
    When a TankNetworkError is thrown from a connection failure
    Then the error has property "cause" that is the original Error
    And the error message describes the network failure
