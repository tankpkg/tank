# Resolution 006: Admin package delete fails silently due to missing FK cascades

**Date:** 2026-04-14
**Symptom:** Clicking "Delete" on admin packages page does nothing — package reappears after refresh.

**Files changed:**

- `apps/registry/src/lib/db/schema.ts`
- `apps/registry/src/routes/admin/packages.tsx`
- `idd/modules/admin-packages/INTENT.md`
- `bdd/features/system/admin-packages/packages.feature`
- `bdd/steps/system/admin-packages.steps.ts`

## Root Cause

`skill_access.skill_id` and `skill_versions.skill_id` FK references to `skills.id` lacked `onDelete: 'cascade'`. Deleting a skill with versions or access grants triggered a PostgreSQL FK constraint violation (23503). The server returned 500, but the UI mutation had no `onError` handler — so the dialog closed and the query cache refreshed, making it look like nothing happened.

Same gap existed downstream: `scan_results.version_id` → `skill_versions.id`, `scan_findings.scan_id` → `scan_results.id`, `dep_audit_results.version_id` → `skill_versions.id`.

## Fix

Added `{ onDelete: 'cascade' }` to all FK references in the delete chain:

| Table               | FK Column    | References          | Added                 |
| ------------------- | ------------ | ------------------- | --------------------- |
| `skill_access`      | `skill_id`   | `skills.id`         | `onDelete: 'cascade'` |
| `skill_versions`    | `skill_id`   | `skills.id`         | `onDelete: 'cascade'` |
| `scan_results`      | `version_id` | `skill_versions.id` | `onDelete: 'cascade'` |
| `scan_findings`     | `scan_id`    | `scan_results.id`   | `onDelete: 'cascade'` |
| `dep_audit_results` | `version_id` | `skill_versions.id` | `onDelete: 'cascade'` |

Added `onError` handler to `deleteMutation` in admin packages page to surface future failures.

## Verification

BDD scenario `DELETE /admin/packages/:name cascades to versions and access grants (E6)` — RED before fix (500), GREEN after (200 + skill removed from DB).

## Production Migration

Run against production DB:

```sql
ALTER TABLE skill_access DROP CONSTRAINT IF EXISTS skill_access_skill_id_skills_id_fk;
ALTER TABLE skill_access ADD CONSTRAINT skill_access_skill_id_skills_id_fk
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE;

ALTER TABLE skill_versions DROP CONSTRAINT IF EXISTS skill_versions_skill_id_skills_id_fk;
ALTER TABLE skill_versions ADD CONSTRAINT skill_versions_skill_id_skills_id_fk
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE;

ALTER TABLE scan_results DROP CONSTRAINT IF EXISTS scan_results_version_id_skill_versions_id_fk;
ALTER TABLE scan_results ADD CONSTRAINT scan_results_version_id_skill_versions_id_fk
  FOREIGN KEY (version_id) REFERENCES skill_versions(id) ON DELETE CASCADE;

ALTER TABLE scan_findings DROP CONSTRAINT IF EXISTS scan_findings_scan_id_scan_results_id_fk;
ALTER TABLE scan_findings ADD CONSTRAINT scan_findings_scan_id_scan_results_id_fk
  FOREIGN KEY (scan_id) REFERENCES scan_results(id) ON DELETE CASCADE;

ALTER TABLE dep_audit_results DROP CONSTRAINT IF EXISTS dep_audit_results_version_id_skill_versions_id_fk;
ALTER TABLE dep_audit_results ADD CONSTRAINT dep_audit_results_version_id_skill_versions_id_fk
  FOREIGN KEY (version_id) REFERENCES skill_versions(id) ON DELETE CASCADE;
```
