# Decisions — Admin App

## 2026-02-20 Planning
- Admin model: registry-wide role field on user table (user | admin)
- User status: separate user_status table (append-only audit trail)
- Package moderation: status field on skills (active/deprecated/quarantined/removed) + featured
- Deployment: embedded in web app at /admin/* via (admin) route group
- NO admin impersonation (deferred)
- NO rate limiting (MVP)
