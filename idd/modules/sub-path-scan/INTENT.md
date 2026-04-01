# Sub-Path Scan (Monorepo Support)

## What

Add optional `sub_path` field to `ScanRequest` that narrows Stage 0 ingestion to a specific subdirectory within the tarball. All downstream stages (1–5) scan only the narrowed content.

## Why

Monorepo skill directories (e.g. a category repo with 20 skills) currently force a full-tarball scan. This wastes compute, mixes findings across skills, and prevents per-skill attribution. External contributors (agentskills.co.il) need to scan individual skills via the `/api/analyze/scan` endpoint.

## Acceptance Criteria

- [ ] `sub_path` is optional on `ScanRequest` — omitting it preserves full-tarball behavior
- [ ] `sub_path` is capped at 255 characters
- [ ] Path traversal (`../`, absolute paths, `.` as component) is rejected with a critical finding
- [ ] GitHub tarball prefix directories (e.g. `owner-repo-sha/`) are auto-detected
- [ ] Narrowed content is copied to a fresh temp dir; original is cleaned up
- [ ] Copy failures do not leak temp directories
- [ ] `shutil.copytree`/`copy2` do not follow symlinks (defense-in-depth)
- [ ] Missing sub_path returns a medium finding and falls back to full scan
- [ ] Directory names containing `..` as substring (e.g. `skill-v2..0`) are not false-positived

## Security Constraints

- Per-component path validation + `resolve().relative_to()` (matches `safe_extract` pattern)
- Error messages truncate user input to 255 chars to prevent log/DB pollution
- `max_length=255` on Pydantic field prevents oversized payloads

## Contributed By

External PR #293 by @choroshin — security-hardened by maintainers.
