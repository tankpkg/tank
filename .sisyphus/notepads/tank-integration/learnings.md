# Tank Integration — Learnings

## 2026-02-14 Session Start
- CLI has 189 tests across 18 files, all passing
- Pre-existing LSP errors in e2e/helpers/setup.ts, scripts/backfill-readme.ts, Python tests — NOT related to integration work
- CLI lib has: api-client.ts, config.ts, debug-logger.ts, lockfile.ts, logger.ts, packer.ts
- CLI commands has 13 commands, none of the integration commands exist yet
- pnpm test --filter=tank uses Turbo caching

## 2026-02-15 Agent Registry
- Agent registry in CLI defines supported agents with homedir-resolved skills paths and detection by parent config dir.
- Symlink name mapping converts scoped skill names to scope--name and preserves unscoped names; tests follow tmpDir pattern from config.test.ts.

## 2026-02-15 Links Manifest
- Links manifest lives in `.tank/links.json` (local) or `~/.tank/links.json` (global), with read returning empty manifest on missing/corrupt files.
- Deterministic writes sort skill keys and agent link keys, and always include a trailing newline.

## 2026-02-15 Linker Core
- Linker uses fs.lstatSync + readlinkSync to verify symlinks without following targets; only unlinks confirmed symlinks.
- Link status checks resolve relative symlink targets to absolute paths before existence validation.

## 2026-02-15 Frontmatter Wrapper
- Added frontmatter generation for agent-ready SKILL.md, preserving original extract content and copying non-SKILL.md files into `.tank/agent-skills/<symlink>/`.
- Description source order: skills.json description override, else extract from markdown heading/paragraph, else fallback to "An AI agent skill".
## 2026-02-15 Link Command
- Link command uses skills.json name + optional description, and chooses CWD vs generated agent-skill wrapper based on SKILL.md frontmatter.
- Dev links are recorded in global ~/.tank/links.json with source=dev, while agent symlinks are created for detected agent config dirs.
- CLI registration lives in bin/tank.ts and uses the standard try/catch pattern with Link failed messaging.

## 2026-02-15 Unlink Command
- Unlink command reads skills.json name, unlinks via linker manifest, and removes wrapper dir under ~/.tank/agent-skills/<symlink>.
- When no links entry exists, it logs "No links found for <name>" and exits without error.

## 2026-02-15 Install + Global + Agent Linking
- Install now supports global lockfile + extraction paths under ~/.tank and routes agent linking through the agent-skills wrapper dir.
- Agent linking is always attempted post-install; no-agent and link failures are warnings, not fatal errors.

## 2026-02-15 Remove + Global + Auto-Unlink
- Remove now unlinks via linker before deleting skill dirs and also cleans agent-skills wrapper dirs for both local and global flows.
- Global remove operates only on ~/.tank paths and updates the global skills.lock without touching project skills.json.

## 2026-02-15 Update + Global + Re-link
- Update now supports a global mode that reads from ~/.tank/skills.lock and skips skills.json; update-all uses versionRange="*" while single update uses ">=currentVersion".
- Update passes global/homedir through to installCommand so agent re-linking runs for both local and global updates.

## 2026-02-15 Doctor Command
- Doctor diagnostics report lists detected agents, local/global skills, dev links, and suggestions based on link + extract status checks.
- Link status uses getSkillLinkStatus (symlink + target validity) and broken links surface install/link guidance in suggestions.

## 2026-02-15 Skill Detail Install Tabs
- InstallCommand now uses Tabs with project/global commands and per-tab copy feedback in the sidebar.

## 2026-02-15 Integration E2E
- Added integration E2E coverage for local/global/dev linking, verifying links.json entries, agent symlink targets, and doctor output across lifecycle.
