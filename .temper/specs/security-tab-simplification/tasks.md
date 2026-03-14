# Tasks: Security Tab Simplification

## Status

- [x] T1: Replace ScoreBadge with TrustBadge in skill list
- [x] T2: Simplify SecurityOverview component
- [x] T3: Use QualityChecks in security tab
- [x] T4: Cleanup unused ScoreBreakdown
- [x] E2E: BDD feature + steps + INTENT.md created

---

## T1: Replace ScoreBadge with TrustBadge in skill list

**File:** `packages/web/app/(registry)/skills/page.tsx`

**Changes:**

- Import `TrustBadge` from `@/components/security`
- Import `computeTrustLevel` from `@/lib/trust-level`
- Replace `<ScoreBadge score={skill.auditScore} />` with `<TrustBadge trustLevel={...} findings={...} size="sm" />`
- Delete `ScoreBadge` function

**Verification:**

- Visit `/skills` → TrustBadge shows (Verified/Review Recommended/etc.)
- No "Score: X" visible

---

## T2: Simplify SecurityOverview component

**File:** `packages/web/components/security/SecurityOverview.tsx`

**Changes:**

- Remove score display (`text-5xl` number)
- Remove progress bar
- Add `TrustBadge` component prominently at top
- Keep: verdict badge, finding counts, scan metadata, LLM indicator

**Verification:**

- Visit skill detail → Security tab
- TrustBadge shows prominently
- No numeric score visible

---

## T3: Use QualityChecks in security tab

**File:** `packages/web/app/(registry)/skills/[...name]/page.tsx`

**Changes:**

- Import `QualityChecks`, `computeQualityChecks` from `@/components/security`
- Replace `ScoreBreakdown` with `QualityChecks`
- Build checks data from existing skill data
- Add "Security Scan" category (no critical/high findings)

**Verification:**

- Security tab shows pass/fail indicators
- No points like "+1/1" visible
- All 4 quality categories shown

---

## T4: Cleanup unused ScoreBreakdown

**File:** `packages/web/components/security/ScoreBreakdown.tsx`

**Changes:**

- Check if `ScoreBreakdown` is used elsewhere
- Remove or deprecate if unused

**Verification:**

- `grep -r "ScoreBreakdown" packages/web` returns no imports
- File removed or deprecated
