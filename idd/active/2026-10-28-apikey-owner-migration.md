# API key ownership compatibility

## Intent

- Fresh migrated databases with the required `service_accounts` table can exchange a CLI login for a usable API key.
- A fresh database created only by Drizzle push can create API keys with a real cascading `user_id` link, without replaying historical migrations.
- Existing `user_id`-only and default-configuration reference-only key values and ownership links are not rewritten, and remain usable while their owner exists.
- Deleting a user cascades to newly created keys. CLI authorization rejects an existing reference-only key if its user is deleted, even when Better Auth still regards the key itself as valid.
- CLI/API authorization rejects keys whose stored non-empty `user_id` and `reference_id` disagree, without changing, reassigning, or deleting those rows. User-only, default-configuration reference-only, and matching-owner keys continue to work.
- Non-default-configuration reference-only keys are rejected and hidden from normal key management when their user-versus-organization ownership cannot be proven. The user chose replacement and explicit administrator remediation rather than inferring an owner; a read-only preflight found none in production or nightly.
- Account deletion must be rejected without side effects if it would erase a disputed cross-owner duplicate key while leaving another copy valid. The user selected blocking deletion until the dispute is resolved rather than revoking another owner's key.
- Deleting a user who owns a separate service account must be rejected until that service account is deleted or its ownership is transferred, so cascading deletion cannot reactivate a disabled account's key.
- If `service_accounts` is missing, API-key authentication and guarded account deletion fail closed with a retryable 503, even on a fresh migration-only database.
- Equivalent duplicate keys remain usable under the selected policy, even when their historical usage cannot be reconstructed. Independently consumed duplicate rows can therefore permit additional requests beyond their configured rate or finite-use limits; this limitation is explicitly accepted.
- No existing orphan is deleted or reassigned automatically.

## Deployment boundary

The Better Auth adapter inserts both the current `reference_id` and the existing cascading `user_id` in the same operation. Better Auth's API-key plugin bypasses its core database hooks, so a runtime schema extension and adapter wrapper are required. The wrapper is scoped to the configured user-owned API-key model, including adapter transactions.

No API-key column migration or backfill is needed: the insert satisfies the historical `NOT NULL` schema and also works on a push-created nullable schema. Existing reference-only orphans remain in the database but are rejected by `verifyCliAuth`. Callers using Better Auth's raw `verifyApiKey` must independently check the stored owner fields for disagreement and verify that the owner exists.

The `service_accounts` table is a prerequisite for API-key authentication and guarded account deletion. The historical `0007_parched_scream.sql` is not in the migration journal, so a fresh journal-only installation may lack it. An administrator must verify why it is absent and restore the correct schema and records before retrying. Do not create an empty table over a damaged installation without investigating: lost or renamed records may contain disabled-account state.

The user explicitly chose to reject keys with conflicting non-empty owner fields. Read-only production aggregates on October 28 found zero conflicting owners, dangling references, and duplicate key hashes; other installations are unknown, and counts can change. Conflicting rows are left intact for an explicit remediation decision.

Operators can check for rows needing an ownership decision without changing data:

```sql
SELECT count(*) AS dangling_references
FROM apikey AS a LEFT JOIN "user" AS u ON u.id = a.reference_id
WHERE a.reference_id IS NOT NULL AND a.reference_id <> '' AND u.id IS NULL;

SELECT count(*) AS conflicting_owners
FROM apikey
WHERE user_id IS NOT NULL AND octet_length(user_id) > 0
  AND reference_id IS NOT NULL AND octet_length(reference_id) > 0
  AND user_id COLLATE "C" <> reference_id COLLATE "C";

SELECT count(*) AS duplicate_hashes
FROM (SELECT 1 FROM apikey GROUP BY key HAVING count(*) > 1) AS duplicates;
```

## Verification

`e2e/cli/pr492-migrated-api-keys.e2e.test.ts` exercises owned PostgreSQL databases and the real signup, CLI authorization, exchange, token-verification and Better Auth user-deletion paths. It covers fresh migrations, push-only schemas, unchanged conflicting rows, old keys, adapter transactions and existing reference-only orphans. A separate probe demonstrates that the API-key plugin bypasses Better Auth database hooks.
