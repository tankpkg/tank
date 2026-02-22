# Admin App for Tank Skills Directory

## Context

### Original Request
Build an admin application for the Tank skills directory (npm/PyPI-like package registry for AI agent skills) to manage users, packages, organizations, and security/moderation.

### Interview Summary

**Key Discussions**:
- **Admin Hierarchy**: Registry-wide admins (like npm/PyPI) with database role field
- **Admin Actions**: ALL four categories selected - User management, Package management, Organization management, Security/moderation
- **User Status Model**: Audit-tracked status with separate `user_status` table (tracks reason, expiresAt, bannedBy)
- **Package Status Model**: Full moderation status with `skill.status` field (active/deprecated/quarantined/removed)
- **Deployment**: Embedded in existing Next.js web app at `/admin/*` routes
- **Test Strategy**: TDD with vitest
- **UI Approach**: Custom with existing shadcn/ui components

**Research Findings**:
- **npm Model**: Owner (manage members/billing), Admin (create/delete teams, manage access), Member (create/publish packages)
- **PyPI Model**: Org roles - Owner/Manager/Member/Billing Manager. Project roles - Owner (manage project + collaborators), Maintainer (upload releases)
- **Current System**: better-auth with GitHub OAuth, organization plugin, audit_events table exists

### Self-Review Gaps Addressed

**Critical Gaps (auto-resolved with sensible defaults)**:
- **First Admin Bootstrap**: Migration will auto-promote first user to admin (configurable via env var)
- **Rate Limiting**: Not in scope for MVP - can be added later
- **Impersonation**: NOT included - high-risk feature, defer to future iteration

**Minor Gaps (self-resolved)**:
- Existing audit_events table can be used for admin action logging
- better-auth session management already supports session revocation

---

## Work Objectives

### Core Objective
Build a comprehensive admin dashboard embedded in the Tank web app that allows registry admins to manage users, packages, organizations, and moderate content with full audit trail.

### Concrete Deliverables

**Database Schema**:
- `user.role` column ('user' | 'admin')
- `user_status` table for audit-tracked bans/suspensions
- `skills.status`, `status_reason`, `status_changed_by`, `featured` columns

**Backend**:
- Admin authorization middleware
- 15+ admin API endpoints (users, packages, orgs, moderation)
- Server actions for admin operations

**Frontend**:
- Admin layout with sidebar navigation
- Dashboard overview page
- User management page (list, detail, ban/suspend)
- Package management page (list, detail, moderate, feature)
- Organization management page (list, detail, manage)
- Audit log viewer

### Definition of Done
- [ ] Admin can view and manage all users (list, detail, ban/suspend)
- [ ] Admin can view and moderate all packages (list, detail, quarantine, deprecate, remove, feature)
- [ ] Admin can view and manage all organizations (list, detail)
- [ ] All admin actions are logged to audit_events
- [ ] Non-admin users cannot access /admin/* routes
- [ ] All tests pass with `pnpm test --filter=web`
- [ ] TypeScript compiles with no errors

### Must Have
- Registry-wide admin role stored in database
- Audit-tracked user status (banned/suspended with reason and expiry)
- Package moderation status (active/deprecated/quarantined/removed)
- Feature flag for packages (admin can feature on homepage)
- Admin-only route protection
- Comprehensive audit logging

### Must NOT Have (Guardrails)
- NO admin impersonation feature (high-risk, deferred)
- NO rate limiting in MVP (add later)
- NO separate admin app (embedded only)
- NO changes to better-auth core library
- NO raw SQL queries (Drizzle ORM only)
- NO client-side admin checks (server-side only)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest in apps/web)
- **User wants tests**: TDD
- **Framework**: vitest

### TDD Workflow
Each TODO follows RED-GREEN-REFACTOR:
1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

---

## Task Flow

```
Phase 1: Foundation
  Task 1 → Task 2 → Task 3
              ↘ Task 4 (parallel)

Phase 2: User Management
  Task 5 → Task 6 → Task 7

Phase 3: Package Management
  Task 8 → Task 9 → Task 10

Phase 4: Organization Management
  Task 11 → Task 12

Phase 5: Audit & Dashboard
  Task 13 → Task 14

Phase 6: Integration
  Task 15 → Task 16
```

---

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 2, 3, 4 | Database schema, types, and middleware can be done in parallel |

| Task | Depends On | Reason |
|------|------------|--------|
| 5 | 2, 3 | User API needs schema and types |
| 6 | 5 | UI needs API endpoints |
| 8 | 2, 3 | Package API needs schema and types |
| 13 | 5, 8, 11 | Audit log viewer needs all actions logged |
| 14 | 5, 8, 11, 13 | Dashboard needs data from all modules |

---

## TODOs

### Phase 1: Foundation

- [ ] 1. Add Admin Role to User Schema

  **What to do**:
  - Add `role` column to `user` table in `apps/web/lib/db/auth-schema.ts`
  - Create migration with `pnpm --filter=web drizzle-kit generate`
  - Default value: 'user', nullable: false
  - Add index on `role` for fast admin queries

  **Must NOT do**:
  - Do NOT modify better-auth core types
  - Do NOT add multiple role levels (keep simple: user/admin)

  **Parallelizable**: NO (foundation for everything else)

  **References**:
  - `apps/web/lib/db/auth-schema.ts:user` - Current user table schema
  - `apps/web/lib/db.ts` - Database connection pattern
  - Drizzle docs: https://orm.drizzle.team/docs/column-types/pg/enum

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/lib/db/__tests__/auth-schema.test.ts`
  - [ ] Test covers: role column exists, default value is 'user', enum values are 'user' | 'admin'
  - [ ] `pnpm --filter=web drizzle-kit generate` → migration file created
  - [ ] `pnpm --filter=web drizzle-kit push` → schema applied to dev database

  **Commit**: YES
  - Message: `feat(db): add role column to user table`
  - Files: `apps/web/lib/db/auth-schema.ts`, migrations

---

- [ ] 2. Create User Status Table

  **What to do**:
  - Create `user_status` table in `apps/web/lib/db/schema.ts`
  - Columns: `id`, `user_id`, `status` ('banned' | 'suspended' | 'active'), `reason` (text), `banned_by` (user id), `expires_at` (timestamp, nullable), `created_at`, `updated_at`
  - Foreign key to `user` table
  - Add current_status view or computed field

  **Must NOT do**:
  - Do NOT modify user table directly (keep audit trail separate)
  - Do NOT delete status records (append-only for audit)

  **Parallelizable**: YES (with Task 1, Task 3)

  **References**:
  - `apps/web/lib/db/schema.ts` - Domain schema patterns
  - `apps/web/lib/db/auth-schema.ts:user` - Foreign key target

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/lib/db/__tests__/schema.test.ts`
  - [ ] Test covers: table exists, foreign key constraint, status enum values
  - [ ] `pnpm --filter=web drizzle-kit generate` → migration file created
  - [ ] Manual: Can insert status record for existing user

  **Commit**: YES
  - Message: `feat(db): add user_status table for audit-tracked status`

---

- [ ] 3. Extend Skills Table with Moderation Fields

  **What to do**:
  - Add columns to `skills` table in `apps/web/lib/db/schema.ts`:
    - `status` ('active' | 'deprecated' | 'quarantined' | 'removed'), default 'active'
    - `status_reason` (text, nullable)
    - `status_changed_by` (user id, nullable)
    - `status_changed_at` (timestamp, nullable)
    - `featured` (boolean), default false
    - `featured_by` (user id, nullable)
    - `featured_at` (timestamp, nullable)
  - Add indexes on `status` and `featured`

  **Must NOT do**:
  - Do NOT cascade delete on status_changed_by (keep audit even if admin deleted)
  - Do NOT auto-populate status_changed_at (set explicitly)

  **Parallelizable**: YES (with Task 1, Task 2)

  **References**:
  - `apps/web/lib/db/schema.ts:skills` - Current skills table
  - `apps/web/lib/db/auth-schema.ts:user` - Foreign key target

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/lib/db/__tests__/schema.test.ts`
  - [ ] Test covers: status enum, featured boolean, foreign keys
  - [ ] `pnpm --filter=web drizzle-kit generate` → migration file created
  - [ ] Manual: Can update skill status via Drizzle

  **Commit**: YES
  - Message: `feat(db): add moderation fields to skills table`

---

- [ ] 4. Create Admin Types and Permissions

  **What to do**:
  - Add `AdminRole` type and `UserRole` type to `packages/shared/src/schemas/permissions.ts`
  - Create `AdminAction` enum for audit logging (user.ban, user.suspend, package.quarantine, etc.)
  - Add `requireAdmin` helper function for server-side checks
  - Export from `packages/shared/src/index.ts`

  **Must NOT do**:
  - Do NOT add client-side permission checks (server-side only)
  - Do NOT expose admin types to browser bundle

  **Parallelizable**: YES (with Task 1, Task 2, Task 3)

  **References**:
  - `packages/shared/src/schemas/permissions.ts` - Existing permission schemas
  - `packages/shared/src/index.ts` - Barrel export

  **Acceptance Criteria**:
  - [ ] Test file created: `packages/shared/src/__tests__/permissions.test.ts`
  - [ ] Test covers: AdminRole type, AdminAction enum, requireAdmin helper
  - [ ] `pnpm test --filter=shared` → all tests pass
  - [ ] `pnpm build --filter=shared` → compiles without errors

  **Commit**: YES
  - Message: `feat(shared): add admin types and permissions`

---

- [ ] 5. Create Admin Authorization Middleware

  **What to do**:
  - Create `apps/web/lib/admin-middleware.ts`
  - Export `requireAdmin` function that:
    1. Gets current session from better-auth
    2. Queries user.role from database
    3. Returns user if admin, throws 403 otherwise
  - Create `withAdminAuth` wrapper for server actions
  - Add admin check to layout level for `/admin/*` routes

  **Must NOT do**:
  - Do NOT check admin status on client-side
  - Do NOT cache admin status (always query fresh)
  - Do NOT expose admin middleware to browser

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  - `apps/web/lib/auth.ts` - better-auth configuration
  - `apps/web/lib/db.ts` - Database connection
  - `packages/shared/src/schemas/permissions.ts` - AdminRole type

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/lib/__tests__/admin-middleware.test.ts`
  - [ ] Test covers: admin user passes, non-admin throws 403, no session throws 401
  - [ ] `pnpm test --filter=web` → test passes
  - [ ] Manual: Non-admin user cannot access /admin/* routes

  **Commit**: YES
  - Message: `feat(web): add admin authorization middleware`

---

### Phase 2: User Management

- [ ] 6. Create Admin User API Endpoints

  **What to do**:
  - Create `apps/web/app/api/admin/users/route.ts`:
    - GET: List all users with pagination, search, status filter
  - Create `apps/web/app/api/admin/users/[id]/route.ts`:
    - GET: Get user details with status history
    - PATCH: Update user role (promote/demote admin)
  - Create `apps/web/app/api/admin/users/[id]/status/route.ts`:
    - POST: Set user status (ban/suspend with reason and expiry)
    - DELETE: Remove status (unban/unsuspend)

  **Must NOT do**:
  - Do NOT allow admin to delete users (only ban/suspend)
  - Do NOT allow admin to demote themselves
  - Do NOT modify user email or github data

  **Parallelizable**: NO (depends on Task 2, Task 5)

  **References**:
  - `apps/web/app/api/v1/skills/route.ts` - API route pattern
  - `apps/web/lib/admin-middleware.ts` - requireAdmin helper
  - `apps/web/lib/db/schema.ts:user_status` - Status table

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/app/api/admin/users/__tests__/route.test.ts`
  - [ ] Test covers: list users, get user detail, ban user, suspend user, unban user
  - [ ] `pnpm test --filter=web` → all tests pass
  - [ ] Manual: Admin can list users, ban user, see status history

  **Commit**: YES
  - Message: `feat(api): add admin user management endpoints`

---

- [ ] 7. Create Admin User Management UI

  **What to do**:
  - Create `apps/web/app/(admin)/layout.tsx` - Admin layout with sidebar
  - Create `apps/web/app/(admin)/users/page.tsx` - User list with search, filters
  - Create `apps/web/app/(admin)/users/[id]/page.tsx` - User detail with status management
  - Create `apps/web/app/(admin)/users/[id]/components/status-dialog.tsx` - Ban/suspend dialog
  - Add navigation to admin sidebar

  **Must NOT do**:
  - Do NOT fetch user data on client-side (use server components)
  - Do NOT show ban button for current admin
  - Do NOT allow role changes without confirmation

  **Parallelizable**: NO (depends on Task 6)

  **References**:
  - `apps/web/app/(dashboard)/tokens/page.tsx` - Dashboard page pattern
  - `apps/web/components/ui/data-table.tsx` - Table component
  - `apps/web/components/ui/dialog.tsx` - Dialog component

  **Acceptance Criteria**:
  - [ ] Test: Navigate to /admin/users → shows user list
  - [ ] Test: Search for user → filters list
  - [ ] Test: Click user → shows detail page
  - [ ] Test: Ban user with reason → status updates, audit log created
  - [ ] `pnpm build --filter=web` → compiles without errors

  **Commit**: YES
  - Message: `feat(ui): add admin user management pages`

---

### Phase 3: Package Management

- [ ] 8. Create Admin Package API Endpoints

  **What to do**:
  - Create `apps/web/app/api/admin/packages/route.ts`:
    - GET: List all packages with pagination, search, status filter
  - Create `apps/web/app/api/admin/packages/[id]/route.ts`:
    - GET: Get package details with status history
  - Create `apps/web/app/api/admin/packages/[id]/status/route.ts`:
    - PATCH: Update package status (deprecate/quarantine/remove with reason)
  - Create `apps/web/app/api/admin/packages/[id]/feature/route.ts`:
    - POST: Feature package (set featured=true)
    - DELETE: Unfeature package

  **Must NOT do**:
  - Do NOT allow admin to modify package content
  - Do NOT allow admin to transfer package ownership (use existing transfer flow)
  - Do NOT delete package records (use status=removed)

  **Parallelizable**: NO (depends on Task 3, Task 5)

  **References**:
  - `apps/web/app/api/v1/skills/route.ts` - API route pattern
  - `apps/web/lib/db/schema.ts:skills` - Skills table with status fields

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/app/api/admin/packages/__tests__/route.test.ts`
  - [ ] Test covers: list packages, get detail, update status, feature/unfeature
  - [ ] `pnpm test --filter=web` → all tests pass

  **Commit**: YES
  - Message: `feat(api): add admin package management endpoints`

---

- [ ] 9. Create Admin Package Management UI

  **What to do**:
  - Create `apps/web/app/(admin)/packages/page.tsx` - Package list with search, status filter
  - Create `apps/web/app/(admin)/packages/[id]/page.tsx` - Package detail with status management
  - Create `apps/web/app/(admin)/packages/[id]/components/status-dialog.tsx` - Status change dialog
  - Create `apps/web/app/(admin)/packages/[id]/components/feature-button.tsx` - Feature toggle
  - Add navigation to admin sidebar

  **Must NOT do**:
  - Do NOT show "delete" option (use status=removed instead)
  - Do NOT allow status changes without reason
  - Do NOT cache package data

  **Parallelizable**: NO (depends on Task 8)

  **References**:
  - `apps/web/app/(registry)/skills/[slug]/page.tsx` - Package detail pattern
  - `apps/web/components/ui/badge.tsx` - Status badge component

  **Acceptance Criteria**:
  - [ ] Test: Navigate to /admin/packages → shows package list
  - [ ] Test: Filter by status → filters list
  - [ ] Test: Click package → shows detail page
  - [ ] Test: Quarantine package → status updates, audit log created
  - [ ] Test: Feature package → featured badge appears

  **Commit**: YES
  - Message: `feat(ui): add admin package management pages`

---

### Phase 4: Organization Management

- [ ] 10. Create Admin Organization API Endpoints

  **What to do**:
  - Create `apps/web/app/api/admin/orgs/route.ts`:
    - GET: List all organizations with pagination, search
  - Create `apps/web/app/api/admin/orgs/[id]/route.ts`:
    - GET: Get org details with members
  - Create `apps/web/app/api/admin/orgs/[id]/members/route.ts`:
    - GET: List org members
  - Create `apps/web/app/api/admin/orgs/[id]/members/[memberId]/route.ts`:
    - PATCH: Update member role
    - DELETE: Remove member from org

  **Must NOT do**:
  - Do NOT allow admin to delete organizations
  - Do NOT allow admin to modify org billing
  - Do NOT create new orgs via admin API

  **Parallelizable**: NO (depends on Task 5)

  **References**:
  - `apps/web/lib/db/auth-schema.ts:organization` - Org table
  - `apps/web/lib/db/auth-schema.ts:member` - Membership table

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/app/api/admin/orgs/__tests__/route.test.ts`
  - [ ] Test covers: list orgs, get detail, manage members
  - [ ] `pnpm test --filter=web` → all tests pass

  **Commit**: YES
  - Message: `feat(api): add admin organization management endpoints`

---

- [ ] 11. Create Admin Organization Management UI

  **What to do**:
  - Create `apps/web/app/(admin)/orgs/page.tsx` - Org list with search
  - Create `apps/web/app/(admin)/orgs/[id]/page.tsx` - Org detail with member list
  - Create `apps/web/app/(admin)/orgs/[id]/components/member-list.tsx` - Member management
  - Add navigation to admin sidebar

  **Must NOT do**:
  - Do NOT allow org deletion
  - Do NOT modify org slug or name

  **Parallelizable**: NO (depends on Task 10)

  **References**:
  - `apps/web/app/(dashboard)/orgs/page.tsx` - Existing org page pattern

  **Acceptance Criteria**:
  - [ ] Test: Navigate to /admin/orgs → shows org list
  - [ ] Test: Click org → shows detail with members
  - [ ] Test: Remove member → member removed, audit log created

  **Commit**: YES
  - Message: `feat(ui): add admin organization management pages`

---

### Phase 5: Audit & Dashboard

- [ ] 12. Create Audit Log API Endpoint

  **What to do**:
  - Create `apps/web/app/api/admin/audit-logs/route.ts`:
    - GET: List audit events with pagination, filters (action type, actor, target, date range)
  - Ensure all admin actions log to `audit_events` table
  - Add action types for all admin operations (admin.user.ban, admin.package.quarantine, etc.)

  **Must NOT do**:
  - Do NOT allow modification of audit logs
  - Do NOT delete audit logs

  **Parallelizable**: NO (depends on Tasks 6, 8, 10)

  **References**:
  - `apps/web/lib/db/schema.ts:audit_events` - Existing audit table
  - `packages/shared/src/schemas/permissions.ts:AdminAction` - Action types

  **Acceptance Criteria**:
  - [ ] Test file created: `apps/web/app/api/admin/audit-logs/__tests__/route.test.ts`
  - [ ] Test covers: list logs, filter by action, filter by date
  - [ ] `pnpm test --filter=web` → test passes

  **Commit**: YES
  - Message: `feat(api): add audit log endpoint`

---

- [ ] 13. Create Admin Dashboard

  **What to do**:
  - Create `apps/web/app/(admin)/page.tsx` - Dashboard overview
  - Show stats cards: total users, active users, banned users, total packages, packages by status
  - Show recent audit activity (last 20 actions)
  - Show flagged items (packages pending review)

  **Must NOT do**:
  - Do NOT add real-time updates (static data on page load)
  - Do NOT add charts (MVP - simple counts)

  **Parallelizable**: NO (depends on Tasks 6, 8, 10, 12)

  **References**:
  - `apps/web/app/(dashboard)/page.tsx` - Existing dashboard pattern

  **Acceptance Criteria**:
  - [ ] Test: Navigate to /admin → shows dashboard
  - [ ] Test: Stats cards show correct counts
  - [ ] Test: Recent activity shows last 20 actions

  **Commit**: YES
  - Message: `feat(ui): add admin dashboard`

---

### Phase 6: Integration & Polish

- [ ] 14. Add Admin Bootstrap Migration

  **What to do**:
  - Create migration to promote first user to admin (or user specified by env var)
  - Add `FIRST_ADMIN_EMAIL` env var support
  - Add seed script for development admin user
  - Document admin creation process in README

  **Must NOT do**:
  - Do NOT auto-promote based on GitHub username
  - Do NOT create admin user if none exists

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  - `apps/web/lib/db/auth-schema.ts:user` - User table

  **Acceptance Criteria**:
  - [ ] Test: Migration promotes user with FIRST_ADMIN_EMAIL to admin
  - [ ] Test: If FIRST_ADMIN_EMAIL not set, no users promoted
  - [ ] Manual: Can set admin via env var

  **Commit**: YES
  - Message: `feat(db): add admin bootstrap migration`

---

- [ ] 15. Final Integration Testing

  **What to do**:
  - Write E2E test for full admin workflow:
    1. Admin logs in
    2. Views dashboard
    3. Bans a user
    4. Quarantines a package
    5. Features a package
    6. Views audit logs
  - Verify non-admin cannot access /admin/*
  - Verify all audit events are logged correctly

  **Must NOT do**:
  - Do NOT use real user data in tests
  - Do NOT skip auth checks in tests

  **Parallelizable**: NO (depends on all previous tasks)

  **References**:
  - `e2e/` - Existing E2E test patterns

  **Acceptance Criteria**:
  - [ ] E2E test file created: `e2e/admin-flow.test.ts`
  - [ ] Test covers: full admin workflow
  - [ ] `pnpm test:e2e` → all E2E tests pass

  **Commit**: YES
  - Message: `test(e2e): add admin workflow integration test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(db): add role column to user table` | auth-schema.ts, migration | drizzle-kit push |
| 2 | `feat(db): add user_status table` | schema.ts, migration | drizzle-kit push |
| 3 | `feat(db): add moderation fields to skills` | schema.ts, migration | drizzle-kit push |
| 4 | `feat(shared): add admin types` | permissions.ts | pnpm test --filter=shared |
| 5 | `feat(web): add admin middleware` | admin-middleware.ts | pnpm test --filter=web |
| 6 | `feat(api): add admin user endpoints` | api/admin/users/* | pnpm test --filter=web |
| 7 | `feat(ui): add admin user pages` | app/(admin)/users/* | pnpm build --filter=web |
| 8 | `feat(api): add admin package endpoints` | api/admin/packages/* | pnpm test --filter=web |
| 9 | `feat(ui): add admin package pages` | app/(admin)/packages/* | pnpm build --filter=web |
| 10 | `feat(api): add admin org endpoints` | api/admin/orgs/* | pnpm test --filter=web |
| 11 | `feat(ui): add admin org pages` | app/(admin)/orgs/* | pnpm build --filter=web |
| 12 | `feat(api): add audit log endpoint` | api/admin/audit-logs/* | pnpm test --filter=web |
| 13 | `feat(ui): add admin dashboard` | app/(admin)/page.tsx | pnpm build --filter=web |
| 14 | `feat(db): add admin bootstrap` | migration, seed | pnpm test --filter=web |
| 15 | `test(e2e): add admin workflow test` | e2e/admin-flow.test.ts | pnpm test:e2e |

---

## Success Criteria

### Verification Commands
```bash
pnpm test --filter=web      # All unit tests pass
pnpm build --filter=web     # Compiles without errors
pnpm test:e2e               # E2E tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Admin can manage users (list, detail, ban, suspend)
- [ ] Admin can manage packages (list, detail, moderate, feature)
- [ ] Admin can manage organizations (list, detail, members)
- [ ] All actions logged to audit_events
- [ ] Non-admins blocked from /admin/*
- [ ] All tests pass
