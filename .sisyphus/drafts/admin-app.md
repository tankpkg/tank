# Draft: Admin App for Tank Skills Directory

## Current State Analysis

### Auth System
- **Provider**: better-auth with GitHub OAuth
- **Plugins**: `apiKey` (tank_* prefix), `organization`, `nextCookies`
- **No admin role exists** — users table has no role/status fields

### Database Models
**Users** (`user` table):
- Fields: `id`, `name`, `email`, `emailVerified`, `image`, `githubUsername`
- Missing: role, ban status, suspension, admin flag

**Organizations** (`organization`, `member` tables):
- Members have `role` field (default: "member")
- No org-level admin capabilities exposed

**Skills/Packages** (`skills` table):
- Fields: `id`, `name`, `description`, `publisherId`, `orgId`, `repositoryUrl`
- Missing: visibility, moderation status, featured flag

**Audit Events** (`audit_events` table):
- EXISTS: `action`, `actorId`, `targetType`, `targetId`, `metadata`
- Good foundation for admin audit trail

### Existing Admin Functionality
- **NONE** — No admin routes, no admin API endpoints, no admin UI

---

## Requirements (Confirmed)

### Admin Hierarchy (npm/PyPI-like model)
- **Registry-wide admins**: Super admins who can manage everything (like npm staff/PyPI superusers)
- **Designation**: Database `role` field on users table

### npm/PyPI Model Reference
| Platform | Org Roles | Project/Package Roles |
|----------|-----------|----------------------|
| **npm** | Owner, Admin, Member | Inherited from org teams |
| **PyPI** | Owner, Manager, Member, Billing | Owner, Maintainer per project |

**Key pattern**: 
- Org roles manage org-level access
- Project/package owners manage their packages
- Registry admins handle moderation, abuse, security

---

## Technical Decisions

### Deployment Approach (Recommendation: Embedded)
**Recommended**: Add `/admin/*` routes to existing `apps/web`

**Why embedded over separate app:**
1. ✅ Same deployment, no duplicate infra
2. ✅ Shared auth (better-auth already configured)
3. ✅ Reuse existing components and data layer (`lib/data/skills.ts`)
4. ✅ Simpler to maintain (one codebase)
5. ✅ Admin can use existing session/auth

**Security considerations for embedded approach:**
- Layout-level auth guard with role check
- Separate route group `(admin)` for isolation
- All admin actions via server actions with role verification

---

## Admin Actions (Confirmed - ALL selected)

### 1. User Management
- Ban/suspend users with audit trail
- View user details (profile, packages, API keys, sessions)
- Revoke API keys
- Impersonate users for debugging (optional, high-risk)

### 2. Package Management
- Delete packages
- Change visibility/status
- Feature/unfeature packages
- Transfer ownership (between users or orgs)

### 3. Organization Management
- View all organizations
- Manage org memberships
- Dissolve organizations
- Transfer org ownership

### 4. Security/Moderation
- View scan results
- Override security verdicts
- Quarantine malicious packages
- View flagged content

---

## Database Schema Changes Required

### User Status (Audit-tracked)
```sql
-- New table: user_status
CREATE TABLE user_status (
  id UUID PRIMARY KEY,
  user_id TEXT REFERENCES user(id),
  status TEXT NOT NULL, -- 'active', 'suspended', 'banned'
  reason TEXT,
  banned_by TEXT REFERENCES user(id),
  expires_at TIMESTAMP, -- NULL for permanent bans
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Package Status (Full moderation)
```sql
-- Add to skills table
ALTER TABLE skills ADD COLUMN status TEXT DEFAULT 'active';
-- Values: 'active', 'deprecated', 'quarantined', 'removed'
ALTER TABLE skills ADD COLUMN status_reason TEXT;
ALTER TABLE skills ADD COLUMN status_changed_by TEXT REFERENCES user(id);
ALTER TABLE skills ADD COLUMN status_changed_at TIMESTAMP;
ALTER TABLE skills ADD COLUMN featured BOOLEAN DEFAULT FALSE;
```

### User Role Field
```sql
-- Add to user table
ALTER TABLE user ADD COLUMN role TEXT DEFAULT 'user';
-- Values: 'user', 'admin'
```

---

## Open Questions (Remaining)
1. **Test strategy**: TDD with vitest or manual QA for admin features?
2. **UI framework preference**: Use existing shadcn/ui components or admin-specific library?
3. **Rate limiting for admin actions**: Any special rate limits needed?
