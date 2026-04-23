# Resolution 004: Make `secret` optional in prompt2bot create-bot-api response

**Finding:** [004](../findings/004-prompt2bot-missing-secret.md)
**Date:** 2026-04-20
**Files changed:**

- `apps/registry/src/lib/prompt2bot.ts`
- `idd/modules/talk-to-skill/INTENT.md`
- `bdd/features/browser/tanstack/talk-to-skill/talk-to-skill.feature`
- `bdd/steps/browser/talk-to-skill.steps.ts`
- `bdd/steps/browser/fixtures.ts`

## Change

### 1. `CreateSkillBotResult.secret` is now `string | null`

```ts
export interface CreateSkillBotResult {
  botId: string;
  /** Remote Tools secret. Only issued when bot has custom tools; `null` otherwise. */
  secret: string | null;
  chatLink: string;
  botPublicKey: string | null;
}
```

### 2. Guard requires `botId` + `chatLink` only

```ts
if (!data.success || !data.botId || !data.chatLink) {
  const missing = [!data.success && "success=false", !data.botId && "botId", !data.chatLink && "chatLink"]
    .filter(Boolean)
    .join(",");
  console.error(`[prompt2bot] create-bot-api rejected: ${data.error ?? `missing=${missing}`}`);
  return null;
}
```

The new log enumerates missing fields instead of the opaque `'unknown'`. Future upstream contract changes are now a one-line diagnosis.

### 3. DB column already nullable

`skill_versions.prompt2bot_secret` (`schema.ts:169`) was declared without `.notNull()` from day one. `result.secret ?? null` stores correctly. No migration needed.

### 4. Intent + Gherkin

- `INTENT.md` gained two rows under **Examples** covering the present (secret absent) and future (missing required field) behaviour, plus an **Upstream API tolerance** constraint block.
- `talk-to-skill.feature` gained a `@regression` scenario asserting HTTP 200 + stored `prompt2bot_secret` is either null or non-empty.
- `talk-to-skill.steps.ts` gained `the talk API returns HTTP {int}` and `the stored prompt2bot_secret is either null or a non-empty string` step definitions.
- `fixtures.ts:BddState` gained `lastResponseStatus?: number`.

## Verification

Real-system verification against the prompt2bot upstream + Vercel preview deployment (`safe-skills-directory-my4in81ik…vercel.app`, PR #414 preview):

| Skill               | Before                     | After                                    |
| ------------------- | -------------------------- | ---------------------------------------- |
| `@uriva/safescript` | 500 `Failed to create bot` | **200** with `chatLink` + `botPublicKey` |
| `@tank/react`       | 500                        | **200**                                  |
| `@tank/nextjs`      | 500                        | **200**                                  |

Direct probe of the upstream with a live token returned `success:true, botId, chatLink, aliceAndBotPublicId` (no `secret`). Fix handles it.

- `bunx tsc --noEmit --project apps/registry/tsconfig.json` → clean
- `bun run --filter '@internal/bdd' typecheck` → clean
- `bunx biome check apps/registry/src/lib/prompt2bot.ts` → clean

## Follow-up work

- **CI gap:** `@internal/bdd` is excluded from CI (`ci.yml:105`). The new regression scenario is future-proofing but does not actively guard until BDD is wired into CI or a dedicated scheduled job. Tracking separately is worthwhile.
- **Rotation telemetry:** If prompt2bot rotates `invalid-api-token` again, the new log (`create-bot-api rejected: invalid-api-token`) will surface in Vercel logs but still only after a user-visible 500. A Sentry breadcrumb or similar alerting would close this loop.
