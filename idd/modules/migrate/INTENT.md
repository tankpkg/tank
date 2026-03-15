# Migrate Module

## Anchor

**Why this module exists:** Tank renamed its manifest and lockfile from `skills.json`/`skills.lock` to `tank.json`/`tank.lock` (feat #122). Projects using the old filenames need a one-command migration. The `tank migrate` command copies the old files to the new names without deleting the originals, so users can verify the migration before cleaning up.

**Consumers:** CLI (`tank migrate` / `migrateCommand()`).

**Single source of truth:** `packages/cli/src/commands/migrate.ts`. Constants in `@internal/shared`: `LEGACY_MANIFEST_FILENAME`, `LEGACY_LOCKFILE_FILENAME`, `MANIFEST_FILENAME`, `LOCKFILE_FILENAME`.

---

## Layer 1: Structure

```
packages/cli/src/commands/migrate.ts    # Migration logic: copy old → new files
packages/shared/src/constants.ts        # LEGACY_MANIFEST_FILENAME = 'skills.json', MANIFEST_FILENAME = 'tank.json'
```

---

## Layer 2: Constraints

| #   | Rule                                                                         | Rationale                                            | Verified by  |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| C1  | `skills.json` → `tank.json` is copied (not moved); original preserved        | Allows rollback and manual verification              | BDD scenario |
| C2  | `skills.lock` → `tank.lock` is copied; original preserved                    | Same rationale as manifest                           | BDD scenario |
| C3  | If `tank.json` already exists, migration is skipped with a notice            | Idempotent — safe to run twice                       | BDD scenario |
| C4  | If `tank.lock` already exists, lockfile migration is skipped                 | Same as C3 for lockfile                              | BDD scenario |
| C5  | If neither legacy file exists, prints "nothing to migrate" and exits cleanly | Command must be a no-op in already-migrated projects | BDD scenario |
| C6  | After migration, prints removal instructions (`rm skills.json`)              | Users must be told what to clean up                  | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                           | Expected Output                                           |
| --- | ----------------------------------------------- | --------------------------------------------------------- |
| E1  | Directory with `skills.json` and `skills.lock`  | Both copied; originals kept; removal instructions printed |
| E2  | Directory with `skills.json` only (no lockfile) | Manifest copied; lockfile migration skipped               |
| E3  | Directory with `tank.json` already present      | "tank.json already exists — skipping manifest migration"  |
| E4  | Directory with no legacy files                  | "Already migrated — nothing to do"                        |
| E5  | Run `tank migrate` twice in same directory      | Second run is a no-op                                     |
