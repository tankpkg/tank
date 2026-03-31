# Quickstart: Skill Trust Badge

## Start Here

```bash
# 1. Create feature branch
git checkout -b feat/trust-badge-system

# 2. Start with types
cd packages/web
bun run dev
```

## Implementation Order

### Step 1: Core Logic (30 min)

```bash
# Create trust-level.ts
touch packages/web/lib/trust-level.ts
```

Implement `TrustLevel` type and `computeTrustLevel()` function.

### Step 2: TrustBadge Component (45 min)

```bash
touch packages/web/components/security/TrustBadge.tsx
```

Start with `size="sm"` for cards, then add `md` and `lg`.

### Step 3: Update Card Display (30 min)

Edit `packages/web/app/(registry)/skills/skills-results.tsx`:

1. Import `TrustBadge`
2. Replace `ScoreBadge` with `TrustBadge`
3. Add `verdict` to `SkillSearchResult` type

### Step 4: Update Detail Page (30 min)

Edit `packages/web/app/(registry)/skills/[...name]/page.tsx`:

1. Add `TrustBadge` to hero section
2. Import `computeTrustLevel`

### Step 5: Update Security Tab (30 min)

Edit `packages/web/components/security/SecurityOverview.tsx`:

1. Add `TrustBadge` as primary indicator
2. Move score to secondary position

### Step 6: Version History (15 min)

Edit `packages/web/app/(registry)/skills/[...name]/skill-tabs.tsx`:

1. Replace score column with security status

### Step 7: Tests (30 min)

```bash
bun run test -- --update
```

## Files Changed

```
packages/web/
├── lib/
│   ├── trust-level.ts          # NEW
│   └── data/skills.ts          # Add verdict fields
├── components/security/
│   ├── TrustBadge.tsx          # NEW
│   ├── QualityChecks.tsx       # NEW (optional)
│   └── SecurityOverview.tsx    # Refactor
└── app/(registry)/skills/
    ├── skills-results.tsx      # Replace ScoreBadge
    └── [...name]/
        ├── page.tsx            # Add hero badge
        └── skill-tabs.tsx      # Update version table
```

## Test Locally

1. Start dev server: `bun run dev`
2. Visit `/skills` - check card badges
3. Click a skill - check hero badge
4. Check Security tab - verify breakdown still works
5. Check version history table

## Design Decisions

See `plan.md` → Design Decisions table for all resolved choices.
