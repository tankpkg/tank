# Finding 004: Talk API 500s after prompt2bot dropped `secret` field

**Date:** 2026-04-20
**Feature:** talk-to-skill.feature — Scenario: Talk API endpoint creates a bot and returns chat link
**Severity:** Bug (application code — upstream contract drift)

## Symptom

`POST /api/v1/skills/{name}/talk` returned HTTP 500 `{"error":"Failed to create bot"}` for every skill that did not already have a cached `prompt2bot_bot_id`. Skills published before the regression kept working because they hit the cached-bot short-circuit at `talk.ts:84`.

Vercel runtime log (production, 2026-04-20):

```
error λ POST /api/v1/skills/%40uriva%2Fsafescript/talk
[prompt2bot] create-bot-api returned error: unknown
```

## Root Cause

The prompt2bot `create-bot-api` endpoint changed its response shape. The `secret` field (Remote Tools secret) is no longer issued unless the bot is configured with custom tools. Our bots have none, so `secret` was absent.

`prompt2bot.ts:96` required `secret` in the guard:

```ts
if (!data.success || !data.botId || !data.secret || !data.chatLink) { … return null; }
```

The guard tripped on `!data.secret`, `createSkillBot()` returned `null`, and `talk.ts:124` mapped that to HTTP 500.

The `'unknown'` log was a second defect — `data.error` was also absent (the upstream returned `success: true`), so the fallback `data.error ?? 'unknown'` evaluated to the literal string `'unknown'` and produced a useless log line that hid the actual failure mode for weeks.

Live probe against `https://api.prompt2bot.com/api` (2026-04-20) confirmed the new response:

```json
{
  "success": true,
  "botId": "…",
  "chatLink": "https://aliceandbot.com/chat?chatWith=…",
  "aliceAndBotPublicId": "…",
  "conversationsLink": "…",
  "viewChatGroupId": "…"
}
```

No `secret`. No `error`.

## Why BDD didn't catch it

`bdd/features/browser/tanstack/talk-to-skill/talk-to-skill.feature` has a scenario ("Talk API endpoint creates a bot and returns chat link") whose assertions would have caught this regression. But `.github/workflows/ci.yml:105` excludes `@internal/bdd` from the CI test filter:

```yaml
run: bunx turbo run test --filter='!@internal/e2e' --filter='!@internal/bdd'
```

This is the Bulletproof rule-4 violation the methodology warns against: a BDD scenario exists but is not executed against real dependencies in CI. Running the BDD suite in CI (separate issue) would have surfaced this the day the upstream contract changed.

## Resolution

See: [resolution 004](../resolutions/004-prompt2bot-missing-secret.md)
