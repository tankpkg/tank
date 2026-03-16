# Manual Publish E2E

Manual end-to-end publish verification for local development.

## Prerequisites

- local Postgres / storage / auth env configured
- CLI built
- one registry target running:
  - Next: `just dev registry-legacy` on `http://localhost:3000`
  - TanStack: `just dev registry` on `http://localhost:3001`

## Target Selection

Set the local CLI registry before testing:

```bash
mkdir -p ~/.tank
cat > ~/.tank/config.json <<'EOF'
{
  "registry": "http://localhost:3001"
}
EOF
```

Switch to `http://localhost:3000` when verifying the Next app.

## Flow

1. Verify auth/device flow
   - run `bunx tank login`
   - complete the browser flow against the selected local registry
   - confirm `~/.tank/config.json` now contains `registry`, `token`, and `user`
2. Create a disposable skill directory with:
   - `skills.json`
   - `SKILL.md`
   - at least one additional source file
3. Run dry-run publish
   - `bunx tank publish --dry-run`
   - verify name, version, file count, and no upload side effects
4. Run real publish
   - `bunx tank publish`
   - verify success output includes the published package coordinate
5. Verify the registry read path
   - `bunx tank info @scope/name`
   - confirm metadata resolves from the selected target
6. Verify download/install path
   - install the newly published skill in a disposable consumer project
   - verify lockfile entry and extracted files

## Acceptance

- login flow succeeds against the selected target
- publish dry-run succeeds without upload
- publish succeeds with a real registry write
- metadata read succeeds after publish
- install succeeds after publish

Prefer automated `bdd/` and `e2e/` coverage for regressions. Use this guide for local smoke validation and auth/device-flow checks.
