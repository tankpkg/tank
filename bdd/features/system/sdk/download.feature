Feature: SDK Download Methods
  As a developer using the Tank SDK
  I want to download skill tarballs with flexible output options
  So that I can integrate skill acquisition into my build pipeline

  Background:
    Given an authenticated TankClient
    And the registry contains published skill "@tank/react" at version "1.0.0" with known integrity hash

  # E13, C15: Stream download (default)
  Scenario: Download returns a ReadableStream by default
    When I call download("@tank/react", "1.0.0")
    Then the result is a ReadableStream
    And reading the stream produces a valid tarball

  # E14, C15, C16: Download to disk with integrity verification
  Scenario: Download to disk writes tarball and verifies integrity
    When I call download("@tank/react", "1.0.0", { dest: "./test-skills/" })
    Then the file "./test-skills/@tank/react-1.0.0.tgz" exists
    And the file SHA-512 hash matches the registry's integrity value

  # E15, C15: Download as buffer
  Scenario: Download as buffer returns complete tarball in memory
    When I call download("@tank/react", "1.0.0", { buffer: true })
    Then the result is a Buffer
    And the buffer contains a valid tarball

  # E16, C16: Integrity mismatch
  Scenario: Tampered tarball throws TankIntegrityError
    Given the download stream for "@tank/react" "1.0.0" returns corrupted data
    When I call download("@tank/react", "1.0.0", { dest: "./test-skills/" })
    Then a TankIntegrityError is thrown
    And the error includes expected and actual hash values
    And no file is written to disk

  # E17: Nonexistent skill download
  Scenario: Download of nonexistent skill throws TankNotFoundError
    When I call download("@acme/nonexistent", "1.0.0")
    Then a TankNotFoundError is thrown
