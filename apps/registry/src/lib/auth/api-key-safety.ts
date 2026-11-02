import { AsyncLocalStorage } from 'node:async_hooks';

import { API_KEY_ERROR_CODES, API_KEY_TABLE_NAME } from '@better-auth/api-key';
import type { DBTransactionAdapter } from 'better-auth';
import { APIError } from 'better-auth/api';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '~/lib/db';
import { apikey, user } from '~/lib/db/auth-schema';
import { serviceAccounts, userStatus } from '~/lib/db/schema';

type KeyRow = typeof apikey.$inferSelect;
type AdapterKey = Omit<KeyRow, 'metadata'> & { metadata: unknown };
type RequestState = {
  keys: Map<string, { key: AdapterKey; verification: boolean }>;
  signal?: AbortSignal;
  managementFailure?: 'conflict' | 'timeout';
  cleanupFailure?: 'timeout' | 'error';
  deferVerification?: boolean;
  deferredApiClaimed?: boolean;
  pendingVerification?: AdapterKey;
  legacyRevocation?: { configId: unknown };
};
export type ApiKeyTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ApiKeyDeletionConflict extends Error {
  constructor() {
    super('Account deletion is blocked because an API-key secret is shared with another owner.');
  }
}

export class ServiceAccountDeletionConflict extends Error {
  constructor() {
    super('Account deletion is blocked while it owns a separate service account.');
  }
}

export class ServiceAccountSafetyUnavailable extends Error {
  constructor() {
    super('Account safety checks are unavailable. Contact an administrator and retry.');
  }
}

class ApiKeyPoolTimeout extends Error {
  readonly code = 'API_KEY_POOL_TIMEOUT';
}

class ApiKeyDisabledDuringVerification extends Error {}
class ApiKeyOwnerPolicyDenied extends Error {}

// A timed-out query remains in postgres-js's pool queue. Keep its slot until it
// actually settles so overload cannot grow that queue without bound.
const maxPendingApiKeyOperations = 64;
let pendingApiKeyOperations = 0;

function admitApiKeyOperation<T>(start: () => PromiseLike<T>): Promise<T> {
  if (pendingApiKeyOperations >= maxPendingApiKeyOperations) {
    throw new ApiKeyPoolTimeout('Too many pending API-key database operations');
  }
  pendingApiKeyOperations++;
  return Promise.resolve()
    .then(start)
    .finally(() => {
      pendingApiKeyOperations--;
    });
}

/** Only wrap one read: it can finish after the caller times out, but cannot write. */
export async function withApiKeyReadTimeout<T>(read: () => PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiKeyPoolTimeout('Timed out waiting for an API-key read')), 5_000);
  });
  try {
    return await Promise.race([admitApiKeyOperation(read), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function verificationUnavailable(): APIError {
  return APIError.fromStatus('SERVICE_UNAVAILABLE', {
    code: 'API_KEY_VERIFICATION_UNAVAILABLE',
    message: 'Please retry verification.'
  });
}

export function isApiKeyLockTimeout(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== 'object') return false;
    const code: unknown = Reflect.get(current, 'code');
    if (code === '55P03' || code === '57014' || code === '40P01' || code === 'API_KEY_POOL_TIMEOUT') return true;
    current = Reflect.get(current, 'cause');
  }
  return false;
}

function isMissingRelation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== 'object') return false;
    if (Reflect.get(current, 'code') === '42P01') return true;
    current = Reflect.get(current, 'cause');
  }
  return false;
}

/** Keep the relation present throughout verification, including concurrent DDL. */
async function lockServiceAccountRead(tx: ApiKeyTransaction): Promise<void> {
  try {
    await tx.execute(sql`LOCK TABLE service_accounts IN ACCESS SHARE MODE`);
  } catch (error) {
    if (isMissingRelation(error)) throw new ServiceAccountSafetyUnavailable();
    throw error;
  }
}

/** Serialize key decisions with all PostgreSQL writers, including inserts without existing rows. */
export async function withApiKeyWriteLock<T>(
  operation: (tx: ApiKeyTransaction) => Promise<T>,
  requestSignal = requests.getStore()?.signal,
  beforeKeyLock?: (tx: ApiKeyTransaction) => Promise<unknown>
): Promise<T> {
  let expired = false;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const assertActive = () => {
    if (requestSignal?.aborted) throw new ApiKeyPoolTimeout('API-key request was cancelled');
  };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (started) return;
      expired = true;
      reject(new ApiKeyPoolTimeout('Timed out waiting for an API-key database transaction'));
    }, 5_000);
  });
  try {
    const transaction = admitApiKeyOperation(() =>
      db.transaction(
        async (tx) => {
          started = true;
          if (expired) throw new ApiKeyPoolTimeout('API-key database transaction expired before starting');
          assertActive();
          clearTimeout(timer);
          await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
          await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
          await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15s'`);
          await beforeKeyLock?.(tx);
          assertActive();
          await tx.execute(sql`LOCK TABLE apikey IN SHARE ROW EXCLUSIVE MODE`);
          assertActive();
          const result = await operation(tx);
          if (requestSignal) {
            // Execute deferred checks before the final cancellation check, not at COMMIT.
            await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
            assertActive();
          }
          return result;
        },
        { isolationLevel: 'read committed' }
      )
    );
    return await Promise.race([transaction, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** A surviving reference is a claim even if its user does not currently exist. */
export async function assertUserDeletionSafe(tx: ApiKeyTransaction, userId: string): Promise<void> {
  if (await lockServiceAccounts(tx)) {
    const ownedAccounts = await tx.execute(sql`
      SELECT 1 FROM service_accounts
      WHERE owner_user_id COLLATE "C" = ${userId} COLLATE "C"
        AND user_id COLLATE "C" <> ${userId} COLLATE "C"
      LIMIT 1
    `);
    if (ownedAccounts.length) throw new ServiceAccountDeletionConflict();
  }
  const conflicts = await tx.execute(sql`
    SELECT 1
    FROM apikey removed
    JOIN apikey survivor ON survivor.key COLLATE "C" = removed.key COLLATE "C" AND survivor.id <> removed.id
    WHERE removed.user_id = ${userId}
      AND (survivor.user_id IS NULL OR survivor.user_id <> ${userId})
      AND NOT EXISTS (
        SELECT 1 FROM apikey retained
        WHERE retained.key COLLATE "C" = removed.key COLLATE "C"
          AND retained.reference_id COLLATE "C" = ${userId} COLLATE "C"
          AND (retained.user_id IS NULL OR retained.user_id <> ${userId})
      )
      AND ((NULLIF(survivor.user_id, '') IS NOT NULL
            AND survivor.user_id COLLATE "C" <> ${userId} COLLATE "C")
        OR (NULLIF(survivor.reference_id, '') IS NOT NULL
            AND survivor.reference_id COLLATE "C" <> ${userId} COLLATE "C"))
    LIMIT 1
  `);
  if (conflicts.length) throw new ApiKeyDeletionConflict();
}

/** Must be taken before reading service-account rows in a deletion transaction. */
export async function lockServiceAccounts(tx: ApiKeyTransaction): Promise<boolean> {
  let [result] = await tx.execute(sql`SELECT to_regclass('service_accounts') AS relation`);
  if (!result.relation) {
    // FK creation takes a conflicting lock on the referenced user table. Recheck
    // after acquiring it so an in-flight migration cannot appear after the guard.
    await tx.execute(sql`LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE`);
    [result] = await tx.execute(sql`SELECT to_regclass('service_accounts') AS relation`);
    if (!result.relation) throw new ServiceAccountSafetyUnavailable();
  }
  try {
    await tx.execute(sql`LOCK TABLE service_accounts IN SHARE ROW EXCLUSIVE MODE`);
  } catch (error) {
    if (isMissingRelation(error)) throw new ServiceAccountSafetyUnavailable();
    throw error;
  }
  return true;
}

const requests = new AsyncLocalStorage<RequestState>();

export function withApiKeyRequest<T>(operation: () => T, signal?: AbortSignal): T {
  return requests.getStore() ? operation() : withFreshApiKeyRequest(operation, signal);
}

/** Isolate a verification even when its caller already has an auth request context. */
export function withFreshApiKeyRequest<T>(operation: () => T, signal?: AbortSignal): T {
  const parentSignal = requests.getStore()?.signal;
  const combined =
    parentSignal && signal && parentSignal !== signal
      ? AbortSignal.any([parentSignal, signal])
      : (signal ?? parentSignal);
  return requests.run({ keys: new Map(), signal: combined }, operation);
}

/** Let the plugin's default configuration authorize revocation of a proven legacy user key. */
export function allowLegacyApiKeyRevocation(configId: unknown): void {
  const state = requests.getStore();
  if (state) state.legacyRevocation = { configId };
}

/** Defer a CLI verification's usage write until its owner checks can share its transaction. */
export function deferApiKeyVerification(): void {
  const state = requests.getStore();
  if (!state) throw new Error('API-key verification requires request context');
  state.deferVerification = true;
  state.deferredApiClaimed = false;
}

/** Only the first plugin verification may share a CLI verification's deferred state. */
export function claimDeferredApiKeyVerification(): boolean {
  const state = requests.getStore();
  if (!state?.deferVerification || state.deferredApiClaimed) return false;
  state.deferredApiClaimed = true;
  return true;
}

export async function finishApiKeyVerification(
  validateOwner: (tx: ApiKeyTransaction, owner: string) => Promise<boolean>
): Promise<AdapterKey | null> {
  const state = requests.getStore();
  const snapshot = state?.pendingVerification;
  if (!snapshot || !state) return null;
  delete state.pendingVerification;
  delete state.deferredApiClaimed;
  state.deferVerification = false;
  try {
    return await updateVerification(snapshot, validateOwner);
  } catch (error) {
    if (error instanceof APIError && error.body?.code === 'KEY_DISABLED') return null;
    throw error;
  }
}

function assertRequestActive(): void {
  if (requests.getStore()?.signal?.aborted) throw verificationUnavailable();
}

export function takeApiKeyManagementFailure(): RequestState['managementFailure'] {
  const state = requests.getStore();
  const failure = state?.managementFailure;
  if (state) delete state.managementFailure;
  return failure;
}

export function takeApiKeyCleanupFailure(): RequestState['cleanupFailure'] {
  const state = requests.getStore();
  const failure = state?.cleanupFailure;
  if (state) delete state.cleanupFailure;
  return failure;
}

function markManagementFailure(failure: NonNullable<RequestState['managementFailure']>): void {
  const state = requests.getStore();
  if (state) state.managementFailure = failure;
}

async function managedWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isApiKeyLockTimeout(error)) markManagementFailure('timeout');
    throw error;
  }
}

export function apiKeyOwner(key: Pick<KeyRow, 'userId' | 'referenceId'>): string | null {
  const userId = key.userId || null;
  const referenceId = key.referenceId || null;
  return userId && referenceId && userId !== referenceId ? null : (referenceId ?? userId);
}

function sameValue(left: unknown, right: unknown): boolean {
  return left instanceof Date && right instanceof Date ? left.getTime() === right.getTime() : left === right;
}

function hashCondition(hash: string) {
  return and(eq(apikey.key, hash), sql`${apikey.key} COLLATE "C" = ${hash} COLLATE "C"`);
}

const policyFields = [
  'key',
  'expiresAt',
  'refillInterval',
  'refillAmount',
  'rateLimitTimeWindow',
  'rateLimitMax'
] as const;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${[...new Set(value.map(canonicalJson))].sort().join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizedPermissions(permissions: string | null): string {
  if (!permissions) return 'null';
  try {
    return canonicalJson(JSON.parse(permissions));
  } catch {
    return `invalid:${permissions}`;
  }
}

function samePolicy(left: AdapterKey | KeyRow, right: AdapterKey | KeyRow): boolean {
  return (
    policyFields.every((field) => sameValue(left[field], right[field])) &&
    (left.enabled !== false) === (right.enabled !== false) &&
    (left.rateLimitEnabled !== false) === (right.rateLimitEnabled !== false) &&
    normalizedPermissions(left.permissions) === normalizedPermissions(right.permissions) &&
    (left.configId || 'default') === (right.configId || 'default')
  );
}

function sameSnapshot(snapshot: AdapterKey, current: AdapterKey | KeyRow): boolean {
  return (
    samePolicy(snapshot, current) && snapshot.userId === current.userId && snapshot.referenceId === current.referenceId
  );
}

/** Unknown configurations may refer to organizations; user_id is the surviving user claim. */
function hasProvenUserReference(key: AdapterKey | KeyRow): boolean {
  return (key.configId || 'default') === 'default' || !!key.userId;
}

function equivalentKeys(keys: (AdapterKey | KeyRow)[]): boolean {
  const first = keys[0];
  const owner = first && apiKeyOwner(first);
  return (
    !!owner &&
    keys.every(
      (key) =>
        apiKeyOwner(key) === owner &&
        hasProvenUserReference(key) &&
        samePolicy(first, key) &&
        (first.remaining === null) === (key.remaining === null)
    )
  );
}

function keysHaveOwner(keys: (AdapterKey | KeyRow)[], owner: string | null): boolean {
  return !!owner && keys.length > 0 && keys.every((key) => hasProvenUserReference(key) && apiKeyOwner(key) === owner);
}

function rememberKey(key: AdapterKey, verification: boolean): void {
  requests.getStore()?.keys.set(key.id, { key, verification });
}

function managedKey(key: AdapterKey): AdapterKey | null {
  const owner = apiKeyOwner(key);
  if (!owner) return null;
  rememberKey(key, false);
  return { ...key, referenceId: owner };
}

async function visibleKeys(adapter: DBTransactionAdapter, candidates: AdapterKey[]): Promise<AdapterKey[]> {
  if (!candidates.length) return [];
  const related = await adapter.findMany<AdapterKey>({
    model: API_KEY_TABLE_NAME,
    where: [{ field: 'key', operator: 'in', value: [...new Set(candidates.map((key) => key.key))] }],
    limit: 2147483647
  });
  const groups = new Map<string, AdapterKey[]>();
  for (const key of related) {
    const group = groups.get(key.key);
    if (group) group.push(key);
    else groups.set(key.key, [key]);
  }
  return candidates.flatMap((candidate) => {
    const group = groups.get(candidate.key) ?? [];
    const current = group.find((key) => key.id === candidate.id);
    if (!current || !sameSnapshot(candidate, current) || !keysHaveOwner(group, apiKeyOwner(candidate))) return [];
    const visible = managedKey(current);
    return visible ? [visible] : [];
  });
}

function usageUpdate(keys: KeyRow[], now: Date): Partial<typeof apikey.$inferInsert> | null {
  const first = keys[0];
  if (first.enabled === false || (first.expiresAt && now.getTime() > first.expiresAt.getTime())) return null;
  let remaining =
    first.remaining === null ? null : keys.reduce((value, key) => Math.min(value, key.remaining ?? 0), first.remaining);
  let lastRefillAt = keys.reduce<Date | null>((latest, key) => {
    if (!key.lastRefillAt) return latest;
    return !latest || key.lastRefillAt > latest ? key.lastRefillAt : latest;
  }, null);
  if (remaining !== null) {
    if (remaining === 0 && first.refillAmount === null) return null;
    const lastRefill = keys.reduce((latest, key) => Math.max(latest, (key.lastRefillAt ?? key.createdAt).getTime()), 0);
    if (first.refillInterval && first.refillAmount && now.getTime() - lastRefill > first.refillInterval) {
      remaining = first.refillAmount;
      lastRefillAt = now;
    } else if (keys.length > 1 && first.refillInterval && first.refillAmount) {
      lastRefillAt = new Date(lastRefill);
    }
    if (remaining <= 0) return null;
    remaining--;
  }
  const update: Partial<typeof apikey.$inferInsert> = { remaining, lastRefillAt, updatedAt: now };
  if (first.rateLimitEnabled === false) return { ...update, lastRequest: now };
  if (first.rateLimitTimeWindow === null || first.rateLimitMax === null) return update;
  const window = first.rateLimitTimeWindow;
  const active = keys.filter((key) => key.lastRequest && now.getTime() - key.lastRequest.getTime() <= window);
  const count = active.reduce((maximum, key) => Math.max(maximum, key.requestCount ?? 0), 0);
  if (active.length && count >= first.rateLimitMax) return null;
  return { ...update, lastRequest: now, requestCount: active.length ? count + 1 : 1 };
}

async function isOwnerAllowed(tx: ApiKeyTransaction, ownerId: string): Promise<boolean> {
  const [status] = await tx
    .select({ status: userStatus.status })
    .from(userStatus)
    .where(eq(userStatus.userId, ownerId))
    .orderBy(desc(userStatus.createdAt))
    .limit(1);
  if (status?.status === 'banned' || status?.status === 'suspended') return false;
  const [service] = await tx
    .select({ disabled: serviceAccounts.disabled })
    .from(serviceAccounts)
    .where(eq(serviceAccounts.userId, ownerId))
    .limit(1);
  return !service?.disabled;
}

async function updateVerification(
  snapshot: AdapterKey,
  validateOwner?: (tx: ApiKeyTransaction, owner: string) => Promise<boolean>
): Promise<AdapterKey | null> {
  try {
    assertRequestActive();
    return await withApiKeyWriteLock(
      async (tx) => {
        assertRequestActive();
        const owner = apiKeyOwner(snapshot);
        if (!owner) return null;
        const owners = await tx
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.id, owner), sql`${user.id} COLLATE "C" = ${owner} COLLATE "C"`))
          .for('key share');
        if (!owners.length) return null;
        const keys = await tx
          .select()
          .from(apikey)
          .where(hashCondition(snapshot.key))
          .orderBy(asc(apikey.id))
          .for('update');
        const selected = keys.find((key) => key.id === snapshot.id);
        if (selected?.enabled === false && keysHaveOwner(keys, owner)) throw new ApiKeyDisabledDuringVerification();
        if (!selected || !sameSnapshot(snapshot, selected)) return null;
        if (!equivalentKeys(keys)) return null;
        const changes = usageUpdate(keys, new Date());
        if (!changes) return null;
        assertRequestActive();
        const updated = await tx
          .update(apikey)
          .set(changes)
          .where(
            inArray(
              apikey.id,
              keys.map((key) => key.id)
            )
          )
          .returning();
        assertRequestActive();
        if (updated.length !== keys.length) throw new Error('Incomplete API-key usage update');
        if (!(await isOwnerAllowed(tx, owner))) throw new ApiKeyOwnerPolicyDenied();
        if (validateOwner && !(await validateOwner(tx, owner))) throw new ApiKeyOwnerPolicyDenied();
        assertRequestActive();
        const result = updated.find((key) => key.id === snapshot.id);
        // Return the owner verified under the lock, including for legacy user_id-only keys.
        return result ? { ...result, referenceId: owner, metadata: snapshot.metadata } : null;
      },
      undefined,
      lockServiceAccountRead
    );
  } catch (error) {
    if (error instanceof ApiKeyOwnerPolicyDenied) return null;
    if (error instanceof ServiceAccountSafetyUnavailable) {
      throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
        code: 'SERVICE_ACCOUNT_SAFETY_UNAVAILABLE',
        message: error.message
      });
    }
    if (error instanceof ApiKeyDisabledDuringVerification) {
      throw APIError.from('UNAUTHORIZED', API_KEY_ERROR_CODES.KEY_DISABLED);
    }
    if (isApiKeyLockTimeout(error)) {
      throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
        code: 'API_KEY_LOCK_TIMEOUT',
        message: 'Please retry verification.'
      });
    }
    throw verificationUnavailable();
  }
}

function ownerCondition(owner: string) {
  return sql`COALESCE(NULLIF(${apikey.referenceId}, ''), NULLIF(${apikey.userId}, '')) COLLATE "C" = ${owner} COLLATE "C"
    AND (NULLIF(${apikey.userId}, '') IS NULL OR NULLIF(${apikey.referenceId}, '') IS NULL
      OR ${apikey.userId} COLLATE "C" = ${apikey.referenceId} COLLATE "C")`;
}

async function updateManagedKey(snapshot: AdapterKey, update: Record<string, unknown>): Promise<AdapterKey | null> {
  const owner = apiKeyOwner(snapshot);
  if (!owner) return null;
  const allowed = new Set([
    'name',
    'enabled',
    'expiresAt',
    'metadata',
    'remaining',
    'refillAmount',
    'refillInterval',
    'rateLimitEnabled',
    'rateLimitTimeWindow',
    'rateLimitMax',
    'permissions'
  ]);
  if (Object.keys(update).some((field) => !allowed.has(field))) throw new Error('Invalid API-key update');
  const values = { ...update };
  if ('metadata' in values) values.metadata = JSON.stringify(values.metadata);
  return withApiKeyWriteLock(async (tx) => {
    const keys = await tx
      .select()
      .from(apikey)
      .where(hashCondition(snapshot.key))
      .orderBy(asc(apikey.id))
      .for('update');
    const selected = keys.find((key) => key.id === snapshot.id);
    if (!selected || apiKeyOwner(selected) !== owner || !equivalentKeys(keys)) return null;
    const [result] = await tx
      .update(apikey)
      .set(values as Partial<typeof apikey.$inferInsert>)
      .where(and(eq(apikey.id, snapshot.id), ownerCondition(owner)))
      .returning();
    if (!result) return null;
    const shared = Object.fromEntries(
      Object.entries(values).filter(([field]) => field !== 'name' && field !== 'metadata')
    );
    const others = keys.filter((key) => key.id !== snapshot.id).map((key) => key.id);
    if (others.length && Object.keys(shared).length) {
      const updated = await tx
        .update(apikey)
        .set(shared as Partial<typeof apikey.$inferInsert>)
        .where(inArray(apikey.id, others))
        .returning({ id: apikey.id });
      if (updated.length !== others.length) throw new Error('Incomplete API-key policy update');
    }
    return { ...result, referenceId: owner, metadata: 'metadata' in update ? update.metadata : snapshot.metadata };
  });
}

/** The caller must hold the API-key table lock in this transaction. */
export async function revokeOwnedApiKey(
  tx: ApiKeyTransaction,
  selection: { keyId: string; ownerId: string; expectedHash?: string }
): Promise<boolean> {
  const [selected] = await tx.select().from(apikey).where(eq(apikey.id, selection.keyId));
  if (!selected || apiKeyOwner(selected) !== selection.ownerId) return false;
  if (selection.expectedHash !== undefined && selected.key !== selection.expectedHash) return false;
  const keys = await tx.select().from(apikey).where(hashCondition(selected.key));
  if (!keysHaveOwner(keys, selection.ownerId)) return false;
  const rows = await tx
    .delete(apikey)
    .where(
      inArray(
        apikey.id,
        keys.map((key) => key.id)
      )
    )
    .returning();
  if (rows.length !== keys.length) throw new Error('Incomplete API-key revocation');
  return true;
}

async function deleteManagedKey(snapshot: AdapterKey): Promise<boolean> {
  const ownerId = apiKeyOwner(snapshot);
  if (!ownerId) return false;
  return withApiKeyWriteLock((tx) =>
    revokeOwnedApiKey(tx, { keyId: snapshot.id, ownerId, expectedHash: snapshot.key })
  );
}

/** Preserve Better Auth's cleanup only when the current single key is still ineligible. */
async function deleteVerificationKey(snapshot: AdapterKey): Promise<void> {
  try {
    assertRequestActive();
    await withApiKeyWriteLock(async (tx) => {
      assertRequestActive();
      const keys = await tx.select().from(apikey).where(hashCondition(snapshot.key));
      if (keys.length !== 1 || keys[0].id !== snapshot.id || !sameSnapshot(snapshot, keys[0])) return;
      const key = keys[0];
      const owner = apiKeyOwner(key);
      if (!owner || !keysHaveOwner(keys, owner)) return;
      const owners = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.id, owner), sql`${user.id} COLLATE "C" = ${owner} COLLATE "C"`));
      if (!owners.length) return;
      const expired = key.expiresAt && Date.now() > key.expiresAt.getTime();
      const exhausted = key.remaining === 0 && key.refillAmount === null;
      if (!expired && !exhausted) return;
      assertRequestActive();
      const deleted = await tx.delete(apikey).where(eq(apikey.id, key.id)).returning({ id: apikey.id });
      assertRequestActive();
      if (deleted.length !== 1) throw new Error('Incomplete API-key cleanup');
    });
  } catch {
    throw verificationUnavailable();
  }
}

function idWhere(where: { field: string; value: unknown }[]): string | null {
  return where.length === 1 && where[0].field === 'id' && typeof where[0].value === 'string' ? where[0].value : null;
}

export function withSafeApiKeys(adapter: DBTransactionAdapter, inTransaction = false): DBTransactionAdapter {
  return {
    ...adapter,
    async findOne<T>(input: Parameters<DBTransactionAdapter['findOne']>[0]): Promise<T | null> {
      if (input.model !== API_KEY_TABLE_NAME) return adapter.findOne(input);
      const verification = input.where.length === 1 && input.where[0].field === 'key';
      let key: AdapterKey | null | undefined;
      if (verification) {
        try {
          const candidates = await withApiKeyReadTimeout(() =>
            adapter.findMany<AdapterKey>({ ...input, sortBy: { field: 'id', direction: 'asc' }, limit: 2147483647 })
          );
          key = candidates.find((candidate) => candidate.key === input.where[0].value);
        } catch {
          throw verificationUnavailable();
        }
      } else key = await adapter.findOne<AdapterKey>(input);
      if (!key) return null;
      if (verification) {
        rememberKey(key, true);
        return key as T;
      }
      const visible = (await visibleKeys(adapter, [key]))[0];
      if (!visible) return null;
      const revocation = requests.getStore()?.legacyRevocation;
      if (
        revocation &&
        idWhere(input.where) &&
        visible.configId &&
        visible.configId !== 'default' &&
        (revocation.configId === undefined ||
          revocation.configId === 'default' ||
          revocation.configId === visible.configId)
      ) {
        // This is only the plugin's lookup view; the saved snapshot and row keep their config ID.
        return { ...visible, configId: 'default' } as T;
      }
      return visible as T;
    },
    async findMany<T>(input: Parameters<DBTransactionAdapter['findMany']>[0]): Promise<T[]> {
      const reference = input.where?.length === 1 && input.where[0].field === 'referenceId' ? input.where[0] : null;
      if (input.model !== API_KEY_TABLE_NAME || !reference) return adapter.findMany(input);
      const keys = await adapter.findMany<AdapterKey>({
        ...input,
        limit: 2147483647,
        where: [
          { ...reference, connector: 'OR' },
          { field: 'userId', value: reference.value, connector: 'OR' }
        ]
      });
      return (await visibleKeys(adapter, keys)).filter((key) => key.referenceId === reference.value) as T[];
    },
    async update<T>(input: Parameters<DBTransactionAdapter['update']>[0]): Promise<T | null> {
      if (input.model !== API_KEY_TABLE_NAME) return adapter.update(input);
      if (inTransaction) throw new Error('API-key updates are unavailable inside adapter transactions');
      const id = idWhere(input.where);
      const state = requests.getStore();
      const found = id ? state?.keys.get(id) : undefined;
      if (!found) throw new Error('API-key update requires an authorized key read');
      if (found.verification && typeof input.update.key !== 'string') return found.key as T;
      if (found.verification && state?.deferVerification) {
        const owner = apiKeyOwner(found.key);
        if (!owner) return null;
        state.pendingVerification = found.key;
        return { ...found.key, referenceId: owner } as T;
      }
      const result = found.verification
        ? await updateVerification(found.key)
        : await managedWrite(() => updateManagedKey(found.key, input.update));
      if (!result && !found.verification) {
        markManagementFailure('conflict');
        throw new Error('API-key ownership changed');
      }
      return result as T | null;
    },
    async updateMany(input): Promise<number> {
      if (input.model === API_KEY_TABLE_NAME) throw new Error('Unsafe API-key bulk update');
      return adapter.updateMany(input);
    },
    async delete(input): Promise<void> {
      if (input.model !== API_KEY_TABLE_NAME) return adapter.delete(input);
      if (inTransaction) throw new Error('API-key deletion is unavailable inside adapter transactions');
      const id = idWhere(input.where);
      const found = id ? requests.getStore()?.keys.get(id) : undefined;
      if (!found) throw new Error('API-key deletion requires an authorized key read');
      if (found.verification) return deleteVerificationKey(found.key);
      if (!(await managedWrite(() => deleteManagedKey(found.key)))) {
        markManagementFailure('conflict');
        throw new Error('API-key ownership changed');
      }
    },
    async deleteMany(input): Promise<number> {
      if (input.model !== API_KEY_TABLE_NAME) return adapter.deleteMany(input);
      if (inTransaction) throw new Error('API-key deletion is unavailable inside adapter transactions');
      const where = input.where ?? [];
      const expiry = where.find((item) => item.field === 'expiresAt' && item.operator === 'lt')?.value;
      const notNull = where.find((item) => item.field === 'expiresAt' && item.operator === 'ne' && item.value === null);
      try {
        if (
          where.length !== 2 ||
          !(expiry instanceof Date) ||
          !notNull ||
          where.some((item) => item.connector === 'OR')
        ) {
          throw new Error('Unsafe API-key bulk deletion');
        }
        const deleted = await withApiKeyWriteLock((tx) =>
          tx.execute(sql`
        DELETE FROM apikey AS a
        WHERE a.expires_at < ${expiry.toISOString()}::timestamp
          AND (NULLIF(a.user_id, '') IS NULL OR NULLIF(a.reference_id, '') IS NULL
            OR a.user_id COLLATE "C" = a.reference_id COLLATE "C")
          AND (COALESCE(NULLIF(a.config_id, ''), 'default') COLLATE "C" = 'default' COLLATE "C"
            OR NULLIF(a.user_id, '') IS NOT NULL)
          AND EXISTS (SELECT 1 FROM "user" u
            WHERE u.id COLLATE "C" = COALESCE(NULLIF(a.reference_id, ''), NULLIF(a.user_id, '')) COLLATE "C")
          AND NOT EXISTS (SELECT 1 FROM apikey other
            WHERE other.key COLLATE "C" = a.key COLLATE "C" AND other.id <> a.id)
        RETURNING a.id
          `)
        );
        return deleted.length;
      } catch (error) {
        const state = requests.getStore();
        if (state) state.cleanupFailure = isApiKeyLockTimeout(error) ? 'timeout' : 'error';
        throw error;
      }
    }
  };
}
