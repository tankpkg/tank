# Publish Module

## Anchor

**Why this module exists:** Skill authors need to upload verified, versioned skill packages to the Tank registry. The publish flow must atomically pack, upload, and confirm a tarball while enforcing authentication, manifest validity, org membership, version conflict detection, and permission-escalation rules — all before a security scan is triggered.

**Consumers:** CLI (`tank publish` / `publishCommand()`), MCP server (`publish-skill` tool), both delegating to the same 3-step web API flow.

**Single source of truth:** `packages/cli/src/commands/publish.ts` (CLI orchestration) → `apps/registry/src/api/routes/v1/skills-publish.ts` (step 1: initiate) → `apps/registry/src/api/routes/v1/skills-confirm.ts` (step 3: confirm + scan trigger).

---

## Layer 1: Structure

```
packages/cli/src/commands/publish.ts                     # CLI: pack → POST → PUT → confirm
apps/registry/src/api/routes/v1/skills-publish.ts        # POST /api/v1/skills — initiate publish
apps/registry/src/api/routes/v1/skills-confirm.ts        # POST /api/v1/skills/confirm — finalize
packages/cli/src/lib/packer.ts                           # Tarball packing, integrity computation
apps/registry/src/lib/skills/permission-escalation.ts    # Version permission-escalation check
apps/registry/src/lib/skills/audit-score.ts              # Audit score computation on confirm
TODO: port storage provider to apps/registry/src/lib/storage/provider.ts  # Signed URL generation (Supabase / S3)
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                              | Rationale                                                            | Verified by  |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| C1  | Auth token required for all publish steps (401 if missing)                                                        | Unauthenticated publish must be impossible                           | BDD scenario |
| C2  | Manifest must pass skillsJsonSchema validation (name, version, semver)                                            | Malformed skills must be rejected before storage                     | BDD scenario |
| C3  | Name is normalized to lowercase before persistence                                                                | Case-sensitive name collisions cause install errors                  | BDD scenario |
| C4  | Scoped names (`@org/skill`) require org membership; unknown org → 404                                             | Org namespace squatting prevention                                   | BDD scenario |
| C5  | Version conflict on same name+version → 409                                                                       | Immutable publish: re-publishing same version must be blocked        | BDD scenario |
| C6  | PATCH bump cannot add any new permissions → 400 with violations list                                              | Security contract: small bumps cannot silently expand authority      | BDD scenario |
| C7  | MINOR bump cannot add network.outbound or subprocess permissions → 400                                            | Dangerous permissions need a MAJOR bump                              | BDD scenario |
| C8  | MAJOR bump allows any permission change                                                                           | Major signal to users that authority is expanding                    | BDD scenario |
| C9  | `--dry-run` packs, verifies token, prints summary, does NOT upload                                                | Allows authors to check before real publish                          | BDD scenario |
| C10 | Step 2 is a direct PUT to signed URL (not proxied through API)                                                    | Avoids proxying large tarballs through Next.js                       | Architecture |
| C11 | `POST /confirm` only succeeds if version is `pending-upload` status                                               | Idempotency guard: prevents double-confirm                           | BDD scenario |
| C12 | Scan is triggered synchronously inside confirm; on scan failure → `scan-failed` status but publish still succeeds | Graceful degradation: registry must not go down when scanner is slow | Code review  |

---

## Layer 3: Examples

| #   | Input                                                            | Expected Output                                              |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| E1  | `tank publish` in a valid skill directory, authenticated         | 3-step flow completes; success message includes name@version |
| E2  | `tank publish` without token                                     | Error: "Not logged in. Run: tank login"                      |
| E3  | `tank publish` with `tank.json` missing `version` field          | 400: invalid manifest, fieldErrors listed                    |
| E4  | `tank publish` scoped `@nonexistent-org/skill`                   | 404: org not found                                           |
| E5  | `tank publish` version already in registry                       | 409: "Version already exists"                                |
| E6  | PATCH bump (`1.0.0 → 1.0.1`) that adds `network.outbound`        | 400: permission escalation, violations array                 |
| E7  | MAJOR bump (`1.0.0 → 2.0.0`) that adds `network.outbound`        | 200: allowed                                                 |
| E8  | `tank publish --dry-run`                                         | Prints size/file count, does NOT create a version record     |
| E9  | `tank publish --private`                                         | Skill created with `visibility = 'private'`                  |
| E10 | Duplicate confirm call (confirm called twice for same versionId) | 400: "Version is already confirmed or published"             |
