/**
 * Base error for all Tank SDK errors.
 * All typed errors extend this — catch TankError to handle any SDK failure.
 */
export class TankError extends Error {
  /** HTTP status code (if applicable) */
  readonly status?: number;
  /** Original cause of the error */
  override readonly cause?: Error;

  constructor(message: string, options?: { status?: number; cause?: Error }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'TankError';
    this.status = options?.status;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/** Thrown when authentication fails (401). */
export class TankAuthError extends TankError {
  constructor(message = 'Authentication failed. Valid API key required.') {
    super(message, { status: 401 });
    this.name = 'TankAuthError';
  }
}

/** Thrown when a requested resource is not found (404). */
export class TankNotFoundError extends TankError {
  /** The skill name that was not found (if applicable) */
  readonly skillName?: string;

  constructor(message: string, skillName?: string) {
    super(message, { status: 404 });
    this.name = 'TankNotFoundError';
    this.skillName = skillName;
  }
}

/** Thrown when the user lacks permission for an action (403). */
export class TankPermissionError extends TankError {
  /** Required permissions that exceeded the budget */
  readonly required?: Record<string, unknown>;
  /** Allowed permissions in the project budget */
  readonly allowed?: Record<string, unknown>;

  constructor(message: string, details?: { required?: Record<string, unknown>; allowed?: Record<string, unknown> }) {
    super(message, { status: 403 });
    this.name = 'TankPermissionError';
    this.required = details?.required;
    this.allowed = details?.allowed;
  }
}

/** Thrown when a network request fails (connection, timeout, DNS). */
export class TankNetworkError extends TankError {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'TankNetworkError';
  }
}

/** Thrown when SHA-512 integrity verification fails. */
export class TankIntegrityError extends TankError {
  /** Expected integrity hash */
  readonly expected?: string;
  /** Actual computed hash */
  readonly actual?: string;

  constructor(message: string, details?: { expected?: string; actual?: string }) {
    super(message);
    this.name = 'TankIntegrityError';
    this.expected = details?.expected;
    this.actual = details?.actual;
  }
}

/** Thrown when dependency resolution encounters a conflict. */
export class TankConflictError extends TankError {
  /** Details about the resolution failure */
  readonly details?: string;

  constructor(message: string, details?: string) {
    super(message, { status: 409 });
    this.name = 'TankConflictError';
    this.details = details;
  }
}
