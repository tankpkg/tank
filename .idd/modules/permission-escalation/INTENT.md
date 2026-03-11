# Permission Escalation Module

## Anchor

**Why this module exists:** Skills execute with an agent's full authority. A malicious or compromised publisher could silently add dangerous permissions (network access, subprocess execution) in a PATCH update that users auto-install. The escalation check enforces that permission expansions require proportional version bumps, giving users a visible signal of increased authority.

**Consumers:** `POST /api/v1/skills` (publish step 1) calls `checkPermissionEscalation()` before creating the version record.

**Single source of truth:** `packages/web/lib/permission-escalation.ts` — `checkPermissionEscalation()`, `detectEscalations()`, `determineBump()`.

---

## Layer 1: Structure

```
packages/web/lib/permission-escalation.ts     # All logic: parseSemver, determineBump, detectEscalations, checkPermissionEscalation
packages/web/app/api/v1/skills/route.ts       # Consumer: calls checkPermissionEscalation on publish
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                        | Rationale                                                                     | Verified by  |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| C1  | MAJOR bump (X+1.0.0) → all permission changes allowed                                                       | Major version signals intentional breaking change                             | BDD scenario |
| C2  | MINOR bump (X.Y+1.0) → allowed for filesystem.read/write additions; blocked for network.outbound/subprocess | Filesystem is less dangerous than network; minor must not silently phone home | BDD scenario |
| C3  | PATCH bump (X.Y.Z+1) → blocked for ANY new permission                                                       | Patch fixes must not expand authority                                         | BDD scenario |
| C4  | First publish (no previous version) → always allowed                                                        | No baseline to compare against                                                | BDD scenario |
| C5  | Removing permissions is always allowed at any bump level                                                    | Reducing authority is always safe                                             | BDD scenario |
| C6  | Violations array contains human-readable messages naming the field and required bump                        | Publishers need actionable feedback                                           | BDD scenario |
| C7  | `network.outbound` and `subprocess` require MAJOR bump                                                      | These are the most dangerous permissions                                      | BDD scenario |
| C8  | `filesystem.read` and `filesystem.write` require MINOR bump minimum                                         | Less dangerous but still need explicit acknowledgment                         | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                         | Expected                                       |
| --- | ------------------------------------------------------------- | ---------------------------------------------- |
| E1  | `1.0.0 → 2.0.0`, adds `network.outbound: ["api.example.com"]` | `allowed: true`                                |
| E2  | `1.0.0 → 1.1.0`, adds `network.outbound: ["api.example.com"]` | `allowed: false`, violation mentions MAJOR     |
| E3  | `1.0.0 → 1.0.1`, adds `network.outbound: ["api.example.com"]` | `allowed: false`, violation mentions MAJOR     |
| E4  | `1.0.0 → 1.0.1`, adds `filesystem.write: ["./output"]`        | `allowed: false`, violation mentions MINOR     |
| E5  | `1.0.0 → 1.1.0`, adds `filesystem.read: ["./src"]`            | `allowed: true` (minor bump for non-dangerous) |
| E6  | `1.0.0 → 1.0.1`, no permission changes                        | `allowed: true`                                |
| E7  | `1.0.0 → 1.0.1`, removes `network.outbound`                   | `allowed: true`                                |
| E8  | First publish (no previous version)                           | `allowed: true`                                |
| E9  | `1.0.0 → 1.0.1`, adds `subprocess: true`                      | `allowed: false`, violation mentions MAJOR     |
