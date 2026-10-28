import { createConnection, isIP, type Socket } from 'node:net';
import { type ConnectionOptions, checkServerIdentity, connect as connectTls, type TLSSocket } from 'node:tls';
import postgres from 'postgres';

import type { KVStore } from './store';

const COUNTER_LOCK_TIMEOUT_MS = 250;
const COUNTER_LOCK_RETRY_MS = 25;
const COUNTER_OPERATION_TIMEOUT_MS = 5_000;
const POSTGRES_OPERATION_TIMEOUT_MS = 7_000;
const RECONNECT_DELAY_MS = 250;
const STATEMENT_TIMEOUT_MARGIN_MS = 100;
const COUNTER_POOL_SIZE = 2;
const SOCKET_FACTORY_FAILURE = Symbol('socket factory failure');

// Deadlines apply per KV call, not to the enclosing HTTP flow. A lost COMMIT
// reply is unknown even if PostgreSQL committed; only an observed COMMIT
// acknowledgement permits reporting a known committed outcome.
type TransactionOutcome = 'committed' | 'unknown';

interface CounterDeadline {
  monotonic: number;
  wall: number;
  error: (outcome?: TransactionOutcome) => Error;
}

class CounterDeadlineExceededError extends Error {
  readonly code = 'COUNTER_DEADLINE_EXCEEDED';
  readonly outcome?: TransactionOutcome;

  constructor(outcome?: TransactionOutcome) {
    super(`PostgreSQL counter operation exceeded its ${COUNTER_OPERATION_TIMEOUT_MS} ms deadline`);
    this.name = 'CounterDeadlineExceededError';
    this.outcome = outcome;
  }
}

class PostgresDeadlineExceededError extends Error {
  readonly code = 'POSTGRES_DEADLINE_EXCEEDED';
  readonly outcome?: TransactionOutcome;

  constructor(outcome?: TransactionOutcome) {
    super(`PostgreSQL operation exceeded its ${POSTGRES_OPERATION_TIMEOUT_MS} ms deadline`);
    this.name = 'PostgresDeadlineExceededError';
    this.outcome = outcome;
  }
}

function deadline(counter = false): CounterDeadline {
  const timeout = counter ? COUNTER_OPERATION_TIMEOUT_MS : POSTGRES_OPERATION_TIMEOUT_MS;
  return {
    monotonic: performance.now() + timeout,
    wall: Date.now() + timeout,
    error: counter
      ? (outcome) => new CounterDeadlineExceededError(outcome)
      : (outcome) => new PostgresDeadlineExceededError(outcome)
  };
}

function counterRemaining(deadline: CounterDeadline): number {
  const remaining = Math.min(deadline.monotonic - performance.now(), deadline.wall - Date.now());
  if (remaining <= 0) throw deadline.error();
  return remaining;
}

function isStatementTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === '57014' &&
    error.message === 'canceling statement due to statement timeout'
  );
}

function isConnectionFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string') return false;
  return /^(ECONN|EHOST|ENET|ENOTFOUND|EAI_|ETIMEDOUT|EPIPE|EBADF|ERR_STREAM_(DESTROYED|WRITE_AFTER_END)|ERR_SSL_|ERR_TLS_|CONNECT_TIMEOUT|CONNECTION_)/.test(
    error.code
  );
}

function unknownCommitOutcome(error: Error): Error {
  if ('outcome' in error && error.outcome === 'unknown') return error;
  if (Object.isExtensible(error) && !('outcome' in error)) {
    Object.defineProperty(error, 'outcome', { value: 'unknown', enumerable: true });
    return error;
  }
  const replacement = Object.assign(new Error(error.message), { name: error.name, outcome: 'unknown' as const });
  if ('code' in error && typeof error.code === 'string') Object.assign(replacement, { code: error.code });
  return replacement;
}

function socketFactoryFailure(error: unknown): Error {
  const failure =
    error instanceof Error && Object.isExtensible(error) ? error : new Error('PostgreSQL connection failed');
  Object.defineProperty(failure, SOCKET_FACTORY_FAILURE, { value: true });
  return failure;
}

function isSocketFactoryFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && SOCKET_FACTORY_FAILURE in error;
}

class TargetSessionMismatch extends Error {}

interface CounterWaiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** A timed-out waiter is removed instead of being allowed to run later. */
class CounterGate {
  private active = 0;
  private readonly waiters = new Set<CounterWaiter>();
  private readonly limit: number;
  private readonly onIdle?: () => void;

  constructor(limit: number, onIdle?: () => void) {
    this.limit = limit;
    this.onIdle = onIdle;
  }

  async run<T>(deadline: CounterDeadline, action: () => Promise<T>): Promise<T> {
    try {
      await this.acquire(deadline);
    } catch (error) {
      if (this.active === 0 && this.waiters.size === 0) this.onIdle?.();
      throw error;
    }
    try {
      counterRemaining(deadline);
      return await action();
    } finally {
      this.release();
    }
  }

  private async acquire(deadline: CounterDeadline): Promise<void> {
    const remaining = counterRemaining(deadline);
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const waiter: CounterWaiter = {
        resolve,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(deadline.error());
        }, Math.ceil(remaining))
      };
      this.waiters.add(waiter);
    });
  }

  private release(): void {
    const waiter = this.waiters.values().next().value;
    if (waiter) {
      this.waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve();
      return;
    }
    this.active--;
    if (this.active === 0) this.onIdle?.();
  }
}

interface SocketOptions {
  host: string[];
  port: number[];
  path?: string;
  connect_timeout: number;
}

interface CachedClientOptions extends postgres.ParsedOptions {
  shared: { retries: number; typeArrayMap: Record<number, number> };
  sslnegotiation: string | null;
}

function configuredSsl(connectionString: string, parsed: CachedClientOptions['ssl']): CachedClientOptions['ssl'] {
  // Use the same URL normalization as postgres.js, without parsing its
  // potentially multi-host authority as a WHATWG URL.
  const queryStart = connectionString.search(/[?#]/);
  const suffix = queryStart < 0 ? '' : connectionString.slice(queryStart);
  const query = new URL(`http://localhost/${suffix}`).searchParams;
  for (const name of ['sslmode', 'ssl']) {
    if (query.has(name) && !query.getAll(name).at(-1)) throw new Error(`PostgreSQL ${name} cannot be empty`);
  }
  if (query.has('sslmode') || query.has('ssl') || query.getAll('sslrootcert').at(-1) === 'system') return parsed;
  const mode = process.env.PGSSLMODE;
  if (!mode) return parsed;
  if (mode === 'disable') {
    if (parsed && !['disable', 'false'].includes(process.env.PGSSL ?? '')) {
      throw new Error('Conflicting PostgreSQL TLS settings');
    }
    return false;
  }
  if (!['allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(mode)) {
    throw new Error('Unsupported PostgreSQL TLS mode');
  }
  return 'verify-full';
}

interface TransactionCheck {
  (): void;
  markCommitPending(): void;
}

/** One client owns one socket, so a deadline never destroys another operation. */
class PostgresSlot {
  private readonly connectionString: string;
  private client: postgres.Sql | undefined;
  private options: CachedClientOptions | undefined;
  private socket: Socket | undefined;
  private tlsSocket: TLSSocket | undefined;
  private ssl: CachedClientOptions['ssl'] = false;
  private sslNegotiation: string | null = null;
  private targetSessionAttrs: CachedClientOptions['target_session_attrs'];
  private targetChecked = false;
  private readonly targetHostsSeen = new Set<number>();
  private abort = new AbortController();
  private attempts = 0;
  private hostIndex = 0;
  private retired = false;
  private retirement: Promise<void> | undefined;
  private onTransportFailure: ((error: Error) => Promise<void> | undefined) | undefined;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    // Capture postgres.js's environment-derived settings at store construction,
    // not later when the first request or a replacement connection arrives.
    this.createClient();
  }

  async run<T>(
    deadline: CounterDeadline,
    action: (sql: postgres.Sql, check: TransactionCheck, verify: (tx: postgres.Sql) => Promise<void>) => Promise<T>
  ): Promise<T> {
    this.targetHostsSeen.clear();
    while (true) {
      try {
        return await this.runOnce(deadline, action);
      } catch (error) {
        if (!(error instanceof TargetSessionMismatch)) throw error;
        const remaining = counterRemaining(deadline);
        await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, RECONNECT_DELAY_MS)));
      }
    }
  }

  private async runOnce<T>(
    deadline: CounterDeadline,
    action: (sql: postgres.Sql, check: TransactionCheck, verify: (tx: postgres.Sql) => Promise<void>) => Promise<T>
  ): Promise<T> {
    const remaining = counterRemaining(deadline);
    if (!this.client || this.retired) this.createClient();
    const client = this.client;
    const signal = this.abort.signal;
    if (!client) throw new Error('PostgreSQL client was not created');
    let transactionStarted = false;
    let commitPending = false;
    let transportError: Error | undefined;
    const deadlineError = () => deadline.error(commitPending ? 'unknown' : undefined);
    const check: TransactionCheck = Object.assign(
      () => {
        transactionStarted = true;
        if (signal.aborted) throw deadlineError();
        counterRemaining(deadline);
      },
      {
        // The body has finished and postgres.js may now issue COMMIT. A lost
        // connection from this point is uncertain even if no bytes were sent.
        markCommitPending: () => {
          commitPending = true;
        }
      }
    );
    const verify = (tx: postgres.Sql) => this.verifyTarget(tx, check);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retirement: Promise<void> | undefined;
    const onTransportFailure = (error: Error) => {
      if (!transactionStarted || signal.aborted || this.retired) return undefined;
      transportError = error;
      retirement = this.retire(client);
      return retirement;
    };
    this.onTransportFailure = onTransportFailure;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        retirement = this.retire(client);
        void retirement.then(
          () => reject(deadlineError()),
          () => reject(deadlineError())
        );
      }, Math.ceil(remaining));
    });
    try {
      // The timeout fences the client and closes its owned socket before the
      // deadline is reported; no unrelated connection is touched.
      const result = await Promise.race([action(client, check, verify), timeout]);
      if (signal.aborted) {
        await retirement?.catch(() => undefined);
        if (transportError) throw commitPending ? unknownCommitOutcome(transportError) : transportError;
        throw deadlineError();
      }
      // The transaction result is only returned after PostgreSQL acknowledges
      // COMMIT. A delayed event loop must not turn a late result into success.
      if (Math.min(deadline.monotonic - performance.now(), deadline.wall - Date.now()) <= 0) {
        throw deadline.error('committed');
      }
      return result;
    } catch (error) {
      if (signal.aborted) {
        await retirement?.catch(() => undefined);
        if (transportError) throw commitPending ? unknownCommitOutcome(transportError) : transportError;
        throw deadlineError();
      }
      const connectionFailure = isConnectionFailure(error);
      if (error instanceof TargetSessionMismatch || connectionFailure || isSocketFactoryFailure(error)) {
        await this.retire(client).catch(() => undefined);
      }
      if (commitPending && connectionFailure && error instanceof Error) throw unknownCommitOutcome(error);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (this.onTransportFailure === onTransportFailure) this.onTransportFailure = undefined;
    }
  }

  private createClient(): void {
    this.abort = new AbortController();
    this.retired = false;
    this.attempts = 0;
    this.socket = undefined;
    this.tlsSocket = undefined;
    this.retirement = undefined;
    const signal = this.abort.signal;
    const options = {
      max: 1,
      prepare: false,
      // postgres.js makes query arguments enumerable on errors when debug is
      // truthy, including when PGDEBUG or the connection URL enables it.
      debug: false,
      // KV queries use only postgres.js's built-in scalar types, not arrays.
      fetch_types: false,
      connect_timeout: 5,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      socket: (options: SocketOptions) => this.connect(options, signal)
    };
    if (!this.options) {
      // Parse once while the caller's environment is in scope. A zero-size
      // parser client opens no connections; the real client below gets an
      // already-negotiated socket and must not wrap it in another TLSSocket.
      const parser = postgres(this.connectionString, { ...options, max: 0 });
      this.options = parser.options as unknown as CachedClientOptions;
      this.ssl = configuredSsl(this.connectionString, this.options.ssl);
      this.sslNegotiation = this.options.sslnegotiation;
      if (this.sslNegotiation === 'direct' && !this.ssl) {
        throw new Error('PostgreSQL direct TLS negotiation requires TLS to be enabled');
      }
      this.targetSessionAttrs = this.options.target_session_attrs;
      this.options.ssl = false;
      this.options.max = 1;
    }
    const saved = {
      ...this.options,
      socket: options.socket,
      no_subscribe: true,
      // Verify this inside the owned transaction instead of postgres.js's
      // unobserved startup query, which can crash when a connection is killed.
      target_session_attrs: null,
      parameters: {},
      shared: { retries: 0, typeArrayMap: { ...this.options.shared.typeArrayMap } }
    };
    // postgres.js recognizes its own parsed options via the `shared` field.
    this.client = postgres(saved as unknown as postgres.Options<Record<string, never>>);
  }

  private retire(client: postgres.Sql): Promise<void> {
    if (!this.retirement) this.retirement = this.shutdown(client);
    return this.retirement;
  }

  private async shutdown(client: postgres.Sql): Promise<void> {
    this.retired = true;
    const socket = this.socket;
    const tlsSocket = this.tlsSocket;
    // Make terminate reject the pending initial query even for a multi-host
    // configuration, which normally suppresses that error.
    client.options.host = client.options.host.slice(0, 1);
    // Do not deliver another server response while postgres.js is shutting
    // down: its transaction helper could otherwise issue COMMIT or ROLLBACK.
    tlsSocket?.pause();
    socket?.pause();
    this.abort.abort();
    try {
      // Terminate the driver first. Destroying the socket before this lets its
      // transaction helper schedule a write against a now-null socket.
      // A COMMIT already received by PostgreSQL may still complete without its
      // response reaching us; a network failure cannot prove its outcome.
      await client.end({ timeout: 0 });
    } finally {
      tlsSocket?.destroy();
      socket?.destroy();
      if (this.client === client) this.client = undefined;
      if (this.tlsSocket === tlsSocket) this.tlsSocket = undefined;
      if (this.socket === socket) this.socket = undefined;
    }
  }

  private async connect(options: SocketOptions, signal: AbortSignal): Promise<Socket> {
    if (signal.aborted) throw new Error('PostgreSQL connection retired');
    let lastError: unknown;
    while (true) {
      for (let tried = 0; tried < options.host.length; tried++) {
        if (this.attempts++) await this.reconnectDelay(signal);
        if (signal.aborted) throw new Error('PostgreSQL connection retired');
        const index = this.hostIndex++ % options.host.length;
        if (this.targetSessionAttrs === 'prefer-standby') this.targetHostsSeen.add(index);
        try {
          const socket = await this.openSocket(options, index, signal);
          this.guardTransport(socket, signal);
          return this.ssl ? await this.secureSocket(socket, options, index, signal) : socket;
        } catch (error) {
          lastError = error;
        }
      }
      // postgres.js suppresses a failed socket factory for multi-host clients.
      // A clean close during our TLS handshake is also retryable, as it was
      // when postgres.js owned that handshake itself.
      const retryTlsClose =
        this.ssl &&
        typeof lastError === 'object' &&
        lastError !== null &&
        'code' in lastError &&
        lastError.code === 'CONNECTION_CLOSED';
      if (options.host.length <= 1 && !retryTlsClose) throw socketFactoryFailure(lastError);
    }
  }

  private reconnectDelay(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        reject(new Error('PostgreSQL connection retired'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', stop);
        resolve();
      }, RECONNECT_DELAY_MS);
      if (signal.aborted) return stop();
      signal.addEventListener('abort', stop, { once: true });
    });
  }

  private async verifyTarget(tx: postgres.Sql, check: () => void): Promise<void> {
    if (!this.targetSessionAttrs || this.targetChecked) return;
    check();
    const [state] = await tx`
      SELECT current_setting('transaction_read_only') AS read_only, pg_is_in_recovery() AS in_recovery
    `;
    check();
    const readOnly = state.read_only === 'on';
    const standby = state.in_recovery === true;
    const rejected =
      (this.targetSessionAttrs === 'read-write' && readOnly) ||
      (this.targetSessionAttrs === 'read-only' && !readOnly) ||
      (this.targetSessionAttrs === 'primary' && standby) ||
      (this.targetSessionAttrs === 'standby' && !standby) ||
      (this.targetSessionAttrs === 'prefer-standby' &&
        !standby &&
        this.targetHostsSeen.size < (this.options?.host.length ?? 1));
    if (rejected) throw new TargetSessionMismatch();
    this.targetChecked = true;
  }

  private async secureSocket(
    socket: Socket,
    options: SocketOptions,
    index: number,
    signal: AbortSignal
  ): Promise<Socket> {
    try {
      if (this.sslNegotiation !== 'direct') {
        const response = await this.sslResponse(socket, options.connect_timeout, signal);
        if (response !== 83) throw new Error('PostgreSQL server does not support TLS');
      }
      const host = options.host[index];
      const settings: ConnectionOptions = {
        ...(typeof this.ssl === 'object' ? this.ssl : {}),
        socket,
        host,
        servername: isIP(host) ? undefined : host,
        rejectUnauthorized: true,
        checkServerIdentity
      };
      if (this.sslNegotiation === 'direct') settings.ALPNProtocols = ['postgresql'];
      const tlsSocket = connectTls(settings);
      this.tlsSocket = tlsSocket;
      Object.assign(tlsSocket, { host, port: options.port[index] });
      this.guardTransport(tlsSocket, signal);
      await this.tlsReady(tlsSocket, options.connect_timeout, signal);
      if (this.sslNegotiation === 'direct' && tlsSocket.alpnProtocol !== 'postgresql') {
        throw new Error('PostgreSQL server did not negotiate the PostgreSQL TLS protocol');
      }
      return tlsSocket;
    } catch (error) {
      this.tlsSocket?.destroy();
      socket.destroy();
      throw error;
    }
  }

  private sslResponse(socket: Socket, timeout: number, signal: AbortSignal): Promise<number> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeListener('data', received);
        socket.removeListener('error', failed);
        socket.removeListener('close', closed);
        signal.removeEventListener('abort', stopped);
      };
      const received = (data: Buffer) => {
        cleanup();
        resolve(data[0]);
      };
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () =>
        failed(Object.assign(new Error('PostgreSQL connection closed'), { code: 'CONNECTION_CLOSED' }));
      const stopped = () => failed(new Error('PostgreSQL connection retired'));
      const timer = setTimeout(
        () => failed(Object.assign(new Error('PostgreSQL connection timed out'), { code: 'CONNECT_TIMEOUT' })),
        timeout * 1_000
      );
      socket.once('data', received);
      socket.once('error', failed);
      socket.once('close', closed);
      if (signal.aborted) return stopped();
      signal.addEventListener('abort', stopped, { once: true });
      try {
        socket.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]));
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  private tlsReady(socket: TLSSocket, timeout: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeListener('secureConnect', ready);
        socket.removeListener('error', failed);
        socket.removeListener('close', closed);
        signal.removeEventListener('abort', stopped);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () =>
        failed(Object.assign(new Error('PostgreSQL connection closed'), { code: 'CONNECTION_CLOSED' }));
      const stopped = () => failed(new Error('PostgreSQL connection retired'));
      const timer = setTimeout(
        () => failed(Object.assign(new Error('PostgreSQL connection timed out'), { code: 'CONNECT_TIMEOUT' })),
        timeout * 1_000
      );
      socket.once('secureConnect', ready);
      socket.once('error', failed);
      socket.once('close', closed);
      if (signal.aborted) return stopped();
      signal.addEventListener('abort', stopped, { once: true });
    });
  }

  private guardTransport(socket: Socket, signal: AbortSignal): void {
    // Keep the driver's close/error callbacks from racing its rollback helper:
    // the affected client must be terminated before those callbacks can clear
    // its socket. Preserve an error listener even after driver cleanup.
    const guard = () => {};
    const remove = socket.removeAllListeners;
    socket.on('error', guard);
    socket.removeAllListeners = function (event?: string | symbol) {
      if (event === undefined) remove.call(this);
      else remove.call(this, event);
      if (event === undefined || event === 'error') this.on('error', guard);
      return this;
    };
    const emitter = socket as unknown as { emit: (event: string | symbol, ...args: unknown[]) => boolean };
    const emit = emitter.emit.bind(socket);
    let retirement: Promise<void> | undefined;
    let closeDeferred = false;
    emitter.emit = (event, ...args) => {
      if ((event === 'error' || event === 'close') && this.abort.signal === signal) {
        const error =
          event === 'error' && args[0] instanceof Error
            ? args[0]
            : Object.assign(new Error('PostgreSQL connection closed'), { code: 'CONNECTION_CLOSED' });
        retirement ??= this.onTransportFailure?.(error) ?? this.retirement;
        if (retirement) {
          if (event === 'close' && !closeDeferred) {
            closeDeferred = true;
            void retirement.then(
              () => emit(event, ...args),
              () => emit(event, ...args)
            );
          }
          return true;
        }
      }
      return emit(event, ...args);
    };
  }

  private openSocket(options: SocketOptions, index: number, signal: AbortSignal): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const host = options.host[index];
      const port = options.port[index];
      const socket = options.path ? createConnection(options.path) : createConnection({ host, port });
      this.socket = socket;
      this.targetChecked = false;
      Object.assign(socket, { host, port }); // postgres.js uses these for TLS SNI.
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        socket.removeListener('error', fail);
      };
      const fail = (error: Error) => {
        cleanup();
        socket.destroy();
        reject(error);
      };
      const stop = () => fail(new Error('PostgreSQL connection retired'));
      // With the socket hook, postgres.js starts its own connect timer only
      // after TCP connects. Keep its per-host timeout for DNS/TCP as well.
      const timer = setTimeout(() => {
        const error = Object.assign(new Error('PostgreSQL connection timed out'), { code: 'CONNECT_TIMEOUT' });
        fail(error);
      }, options.connect_timeout * 1_000);
      socket.once('error', fail);
      socket.once('connect', () => {
        cleanup();
        resolve(socket);
      });
      if (signal.aborted) return stop();
      signal.addEventListener('abort', stop, { once: true });
    });
  }
}

export function createPostgresStore(connectionString: string): KVStore {
  // Keep counters off the auth connection and bound each store to three
  // connections: one for auth and two for counters.
  const auth = new PostgresSlot(connectionString);
  const authSlot = new CounterGate(1);
  const counters = Array.from({ length: COUNTER_POOL_SIZE }, () => new PostgresSlot(connectionString));
  let initialized = false;
  // Timed-out waiters never enter postgres.js's connection queue.
  const counterSlots = new CounterGate(COUNTER_POOL_SIZE);
  const counterKeys = new Map<string, CounterGate>();

  async function runAuth<T>(deadline: CounterDeadline, action: (sql: postgres.Sql, check: () => void) => Promise<T>) {
    return authSlot.run(deadline, () =>
      auth.run(deadline, async (sql, check, verify) => {
        let created = false;
        let deadlineOwnsTimeout = false;
        let bodyError: unknown;
        try {
          const result = await sql.begin(async (tx) => {
            const query = tx as unknown as postgres.Sql;
            const configureTimeout = async () => {
              check();
              const timeoutMs = Math.max(1, Math.ceil(counterRemaining(deadline)) - STATEMENT_TIMEOUT_MARGIN_MS);
              const [settings] = await query`
                WITH limits AS MATERIALIZED (
                  SELECT (SELECT setting::integer FROM pg_settings WHERE name = 'statement_timeout') AS statement_ms
                )
                SELECT set_config('statement_timeout',
                  LEAST(${timeoutMs}::integer, COALESCE(NULLIF(statement_ms, 0), ${timeoutMs}::integer))::text || 'ms', true),
                  statement_ms AS previous_statement_ms
                FROM limits
              `;
              const previous = Number((settings as { previous_statement_ms: number }).previous_statement_ms);
              deadlineOwnsTimeout =
                previous === 0 || timeoutMs < previous || (deadlineOwnsTimeout && timeoutMs === previous);
              check();
            };
            try {
              check();
              await verify(query);
              await configureTimeout();
              if (!initialized) {
                await query`
                  CREATE TABLE IF NOT EXISTS kv_store (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL
                  )
                `;
                check();
                created = true;
                await configureTimeout();
              }
              const value = await action(query, check);
              check();
              check.markCommitPending();
              return value;
            } catch (error) {
              bodyError = error;
              throw error;
            }
          });
          if (created) initialized = true;
          return result;
        } catch (error) {
          if (error === bodyError && deadlineOwnsTimeout && isStatementTimeout(error)) throw deadline.error();
          throw error;
        }
      })
    );
  }

  async function ensureTable(deadline: CounterDeadline): Promise<void> {
    if (!initialized) await runAuth(deadline, async () => {});
  }

  function counterGate(key: string): CounterGate {
    const existing = counterKeys.get(key);
    if (existing) return existing;
    const gate = new CounterGate(1, () => {
      if (counterKeys.get(key) === gate) counterKeys.delete(key);
    });
    counterKeys.set(key, gate);
    return gate;
  }

  async function runCounterTransaction(
    sql: postgres.Sql,
    check: TransactionCheck,
    verify: (tx: postgres.Sql) => Promise<void>,
    key: string,
    ttlMs: number,
    deadline: CounterDeadline
  ): Promise<number> {
    let deadlineOwnsStatementTimeout = false;
    let bodyError: unknown;
    const execute = async (tx: postgres.TransactionSql): Promise<number> => {
      // postgres.js transaction clients are callable; its TransactionSql type omits the call signature.
      const query = tx as typeof tx & ((...args: Parameters<typeof sql>) => ReturnType<typeof sql>);
      check();
      await verify(tx as unknown as postgres.Sql);
      async function setTimeouts() {
        check();
        const remainingMs = Math.ceil(counterRemaining(deadline));
        const statementMs = Math.max(1, remainingMs - STATEMENT_TIMEOUT_MARGIN_MS);
        const lockMs = Math.min(COUNTER_LOCK_TIMEOUT_MS, remainingMs);
        // Never relax a stricter timeout already configured for the session.
        const [settings] = await query`
          WITH limits AS MATERIALIZED (
            SELECT
              (SELECT setting::integer FROM pg_settings WHERE name = 'lock_timeout') AS lock_ms,
              (SELECT setting::integer FROM pg_settings WHERE name = 'statement_timeout') AS statement_ms
          )
          SELECT set_config('lock_timeout',
              LEAST(${lockMs}::integer, COALESCE(NULLIF(lock_ms, 0), ${lockMs}::integer))::text || 'ms', true),
            set_config('statement_timeout',
              LEAST(${statementMs}::integer, COALESCE(NULLIF(statement_ms, 0), ${statementMs}::integer))::text || 'ms', true),
            statement_ms AS previous_statement_ms
          FROM limits
        `;
        const previousStatementMs = Number((settings as { previous_statement_ms: number }).previous_statement_ms);
        deadlineOwnsStatementTimeout =
          previousStatementMs === 0 ||
          statementMs < previousStatementMs ||
          (deadlineOwnsStatementTimeout && statementMs === previousStatementMs);
        check();
      }
      while (true) {
        await setTimeouts();
        const rows = await query`
          WITH locked AS MATERIALIZED (
            SELECT key, value, expires_at FROM kv_store WHERE key = ${key} FOR UPDATE
          ), checked AS MATERIALIZED (
            SELECT key, value, expires_at, clock_timestamp() AS checked_at FROM locked
          )
          UPDATE kv_store SET
            value = CASE WHEN checked.expires_at > checked.checked_at
              THEN (checked.value::int + 1)::text ELSE '1' END,
            expires_at = CASE WHEN checked.expires_at > checked.checked_at
              THEN checked.expires_at
              ELSE checked.checked_at + ${ttlMs}::double precision * interval '1 millisecond' END
          FROM checked WHERE kv_store.key = checked.key
          RETURNING kv_store.value
        `;
        check();
        if (rows.length) {
          const row = rows[0] as { value: string };
          return Number.parseInt(row.value, 10);
        }

        // The provisional expiry is never committed. Set it only after an
        // insert has won any conflict wait, within this same transaction.
        await setTimeouts();
        const inserted = await query`
          INSERT INTO kv_store (key, value, expires_at) VALUES (${key}, '1', clock_timestamp())
          ON CONFLICT (key) DO NOTHING RETURNING key
        `;
        check();
        if (inserted.length) {
          await setTimeouts();
          await query`
            UPDATE kv_store SET expires_at = clock_timestamp() + ${ttlMs}::double precision * interval '1 millisecond'
            WHERE key = ${key}
          `;
          check();
          return 1;
        }
        // A concurrent insert won; retry the locked update against its row.
      }
    };
    const transaction = sql.begin(async (tx) => {
      try {
        const result = await execute(tx);
        check();
        check.markCommitPending();
        return result;
      } catch (error) {
        bodyError = error;
        throw error;
      }
    });
    try {
      return await transaction;
    } catch (error) {
      // postgres.js rethrows the body error only after rollback succeeds.
      // Never translate a different rollback/commit or cancellation error.
      if (error === bodyError && deadlineOwnsStatementTimeout && isStatementTimeout(error)) {
        throw new CounterDeadlineExceededError();
      }
      throw error;
    }
  }

  async function incrementCounter(key: string, ttlMs: number, deadline: CounterDeadline): Promise<number> {
    while (true) {
      counterRemaining(deadline);
      try {
        // A lock timeout rolls back the whole transaction. Retry outside the
        // pool until the caller's overall deadline, freeing it for other keys.
        return await counterSlots.run(deadline, async () => {
          const slot = counters.pop();
          if (!slot) throw new Error('PostgreSQL counter slot unavailable');
          try {
            return await slot.run(deadline, (sql, check, verify) =>
              runCounterTransaction(sql, check, verify, key, ttlMs, deadline)
            );
          } finally {
            counters.push(slot);
          }
        });
      } catch (error) {
        if (typeof error !== 'object' || error === null || !('code' in error)) throw error;
        if (error.code !== '55P03') throw error;
        const remaining = counterRemaining(deadline);
        await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, COUNTER_LOCK_RETRY_MS)));
      }
    }
  }

  return {
    async get(key) {
      return runAuth(deadline(), async (sql, check) => {
        const rows = await sql`
          SELECT value FROM kv_store WHERE key = ${key} AND expires_at > clock_timestamp()
        `;
        check();
        if (rows.length === 0) return null;
        return rows[0].value as string;
      });
    },

    async set(key, value, ttlMs) {
      await runAuth(deadline(), async (sql, check) => {
        await sql`
          INSERT INTO kv_store (key, value, expires_at)
          VALUES (${key}, ${value}, clock_timestamp() + ${ttlMs}::double precision * interval '1 millisecond')
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
        `;
        check();
      });
    },

    async del(key) {
      await runAuth(deadline(), async (sql, check) => {
        await sql`DELETE FROM kv_store WHERE key = ${key}`;
        check();
      });
    },

    async compareAndSet(key, expected, value, deadlineMs) {
      if (deadlineMs !== undefined && !Number.isSafeInteger(deadlineMs)) return false;
      return runAuth(deadline(), async (sql, check) => {
        // Evaluate expiry after acquiring the row lock, not before a potentially long wait.
        const rows = await sql`
          WITH locked AS MATERIALIZED (
            SELECT key, value, expires_at FROM kv_store WHERE key = ${key} FOR UPDATE
          ), checked AS MATERIALIZED (
            SELECT key, value, expires_at, clock_timestamp() AS checked_at FROM locked
          )
          UPDATE kv_store SET value = ${value} FROM checked
          WHERE kv_store.key = checked.key AND checked.value = ${expected}
            AND checked.expires_at > checked.checked_at
            AND (${deadlineMs ?? null}::bigint IS NULL OR checked.checked_at < to_timestamp(${deadlineMs ?? null}::double precision / 1000))
          RETURNING kv_store.key
        `;
        check();
        return rows.length === 1;
      });
    },

    async compareAndDelete(key, expected, deadlineMs) {
      if (deadlineMs !== undefined && !Number.isSafeInteger(deadlineMs)) return false;
      return runAuth(deadline(), async (sql, check) => {
        const rows = await sql`
          WITH locked AS MATERIALIZED (
            SELECT key, value, expires_at FROM kv_store WHERE key = ${key} FOR UPDATE
          ), checked AS MATERIALIZED (
            SELECT key, value, expires_at, clock_timestamp() AS checked_at FROM locked
          )
          DELETE FROM kv_store USING checked
          WHERE kv_store.key = checked.key AND checked.value = ${expected}
            AND checked.expires_at > checked.checked_at
            AND (${deadlineMs ?? null}::bigint IS NULL OR checked.checked_at < to_timestamp(${deadlineMs ?? null}::double precision / 1000))
          RETURNING kv_store.key
        `;
        check();
        return rows.length === 1;
      });
    },

    async incr(key, ttlMs) {
      const limit = deadline(true);
      return counterGate(key).run(limit, async () => {
        await ensureTable(limit);
        // The database clock is sampled after lock acquisition but before commit;
        // an unusually slow commit can still consume part of the window.
        return incrementCounter(key, ttlMs, limit);
      });
    }
  };
}
