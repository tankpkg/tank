# Plan: Disable Vercel Preview Deployments on PRs

## Summary

**Objective:** Prevent Vercel from deploying on pull requests. Only deploy on merges/commits to `main`.

**Deliverables:** One new file (`vercel.json`)
**Task count:** 1
**Parallel waves:** 1 (single task)
**Estimated effort:** Trivial (~5 minutes)

## Context

**Original request:** PRs should not trigger Vercel deployments. Only merges or direct commits to `main` should deploy.

**Current state:**
- Vercel deploys via its GitHub integration (automatic Git deployments)
- Every push — including PR branches — triggers a Vercel preview deployment
- GitHub Actions CI (`.github/workflows/ci.yml`) already runs `pnpm build` + `pnpm test` + `pytest` on all PRs and pushes to `main`
- No `vercel.json` exists in the repo
- No `.vercel/` directory exists

**User constraint:** CI should still lint/build/test on PRs via GitHub Actions. Only the Vercel deployment should be suppressed.

## Objectives

**Core goal:** PRs trigger CI (build + test) but NOT Vercel deployments. `main` branch triggers both CI and Vercel deployment.

**Concrete deliverables:**
1. `vercel.json` at repo root with `ignoreCommand` that skips builds on non-`main` branches

**Definition of done:**
- PRs no longer trigger Vercel deployments (preview or production)
- Commits/merges to `main` continue to deploy normally
- GitHub Actions CI is unaffected (still runs on PRs)

**Scope boundaries:**
- **In scope:** Vercel build skip configuration
- **Out of scope:** CI workflow changes, Vercel Dashboard settings, build optimization

## Verification Strategy

**How to verify:**
1. After merging, open a test PR → confirm Vercel shows "Build Skipped" (not a deployment)
2. Merge/push to `main` → confirm Vercel deploys normally
3. Check GitHub Actions → confirm CI still runs build+test on the PR

**No automated tests needed** — this is infrastructure config, verified by observing Vercel behavior.

## Execution

### Wave 1: Create `vercel.json` (single task)

#### Task 1: Add `vercel.json` with `ignoreCommand`

**Agent profile:** `quick`
**Skills:** none required
**File:** `vercel.json` (repo root — new file)

**What to do:**

Create `vercel.json` at the repository root with the following content:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"
}
```

**How it works:**
- Vercel runs `ignoreCommand` before every build
- Exit code `0` → build is **skipped** (deployment cancelled)
- Exit code `1` → build **proceeds** (deployment happens)
- `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`:
  - On a PR branch (e.g., `feature-x`): `"feature-x" != "main"` → true → exit 0 → **skip**
  - On `main`: `"main" != "main"` → false → exit 1 → **build and deploy**

**Acceptance criteria:**
- [ ] `vercel.json` exists at repo root
- [ ] File is valid JSON
- [ ] `ignoreCommand` uses `VERCEL_GIT_COMMIT_REF` to gate on `main`
- [ ] No other Vercel settings are changed

**Must NOT do:**
- Do not modify `.github/workflows/ci.yml`
- Do not add any Vercel CLI commands or tokens
- Do not change Vercel Dashboard settings

## Success Criteria

- [ ] `vercel.json` committed to repo with correct `ignoreCommand`
- [ ] PR opened → Vercel shows "Ignored Build" (no deployment)
- [ ] Push/merge to `main` → Vercel deploys successfully
- [ ] GitHub Actions CI unaffected on PRs
