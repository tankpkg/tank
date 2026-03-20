# Web Publish API Module

## Anchor

**Why this module exists:** The registry must expose a 3-step HTTP API that allows authenticated CLI/MCP clients to publish skill packages. The API must validate manifests, enforce org membership and permission-escalation rules, generate signed upload URLs for direct-to-storage uploads, and trigger security scanning on confirmation.

**Consumers:** CLI `publishCommand()`, MCP `publish-skill` tool. Both use the same 3-step flow.

**Single source of truth:**

- `apps/registry/src/api/routes/v1/skills-publish.ts` — POST (step 1: initiate)
- `apps/registry/src/api/routes/v1/skills-confirm.ts` — POST (step 3: confirm + trigger scan)

See also: `idd/modules/publish/INTENT.md` (CLI-side perspective) and `idd/modules/permission-escalation/INTENT.md`.

---

## Layer 1: Structure

```
apps/registry/src/api/routes/v1/skills-publish.ts        # POST — validate, escalation check, create record, signed URL
apps/registry/src/api/routes/v1/skills-confirm.ts        # POST — verify upload, trigger scan, compute audit score
apps/registry/src/lib/skills/permission-escalation.ts    # Escalation logic
apps/registry/src/lib/skills/audit-score.ts              # Score computation
TODO: port storage provider to apps/registry/src/lib/storage/provider.ts  # Signed URL generation
```

---

## Layer 2: Constraints

| #   | Rule                                                                               | Rationale                                          | Verified by  |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------- | ------------ |
| C1  | `POST /skills` requires `Authorization: Bearer` token with `skills:publish` scope  | Service account keys with wrong scope must get 403 | BDD scenario |
| C2  | Manifest `name` is forced to lowercase before validation                           | Prevents case-variant name collisions              | BDD scenario |
| C3  | Invalid manifest schema → 400 with `fieldErrors`                                   | Authors need actionable error messages             | BDD scenario |
| C4  | Scoped name requires org to exist in DB → 404 if missing                           | Must not create skills in nonexistent orgs         | BDD scenario |
| C5  | Scoped name requires user to be an org member → 403                                | Namespace integrity: only members can publish      | BDD scenario |
| C6  | Duplicate version → 409                                                            | Versions are immutable                             | BDD scenario |
| C7  | Permission escalation on PATCH/MINOR → 400 with `violations`                       | Enforced at API level, not just CLI                | BDD scenario |
| C8  | Response includes `uploadUrl` (signed), `skillId`, `versionId`                     | CLI needs these to proceed to step 2               | BDD scenario |
| C9  | `POST /confirm` sets status `pending-upload → scanning → completed/flagged/failed` | Audit trail of scan lifecycle                      | BDD scenario |
| C10 | Confirm with non-`pending-upload` versionId → 400                                  | Prevents double-confirm race condition             | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                               | Expected Output                                            |
| --- | --------------------------------------------------- | ---------------------------------------------------------- |
| E1  | Valid POST with authenticated user + valid manifest | 200: `{ uploadUrl, skillId, versionId }`                   |
| E2  | POST without auth                                   | 401                                                        |
| E3  | POST with API key missing `skills:publish` scope    | 403                                                        |
| E4  | POST with `@nonexistent-org/skill`                  | 404                                                        |
| E5  | POST version already exists                         | 409                                                        |
| E6  | POST PATCH bump adding network permission           | 400 with violations                                        |
| E7  | POST confirm with valid versionId                   | 200: `{ success, name, version, auditScore, scanVerdict }` |
| E8  | POST confirm twice (already confirmed)              | 400                                                        |
