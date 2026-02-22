# Learnings — Admin App

## 2026-02-20 Session Start
- Conventions: strict TypeScript, ESM only, 2-space indent, Drizzle ORM only
- Test pattern: `__tests__/*.test.ts` colocated, vitest, TDD
- Import pattern: web uses `@/*` (tsconfig paths), shared uses barrel
- Auth: better-auth with GitHub OAuth, `apiKey` plugin, `organization` plugin
- Existing audit_events table available for admin action logging
