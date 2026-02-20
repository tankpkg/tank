# Issues

## [2026-02-20T15:06:47Z] Task 0 - SEA PoC
- `npx esbuild ...` failed with `sh: esbuild: command not found` (required pnpm dlx).
- SEA binary crashed: `./build/tank --version` exit 139 (no output); `./build/tank init/login` produced no output.
- SEA binary size 113M (build/tank-sea) exceeds 60MB target.
- Bundled init can throw ExitPromptError when prompt interrupted or stdin closes mid-flow.

## [2026-02-20T15:05:37Z] Task 0 - SEA PoC
- Node SEA binary (`build/tank`) consistently exits with `-11` (segmentation fault) for `--version`, `init`, and `login` despite successful blob injection.
- Current SEA output size (`113M`) violates project distribution size guideline (<60MB target).
- Interactive `init` automation cannot fully complete in headless non-TTY run; prompt appears but closes when input stream ends (expected for CI-style smoke checks).
- Actionable pivot: use Bun compile path for standalone artifacts unless SEA crash root cause is resolved in a dedicated follow-up investigation.

## [2026-02-20T17:19:00Z] Task 2 - Binary Build Scripts
- Initial `build:binary` attempt failed because CJS bundle path (`tank-bundle.cjs`) conflicted with `import.meta.url` usage in version loader; fixed by switching bundle format to ESM (`tank-bundle.mjs`).
- Binary runtime then failed to resolve `../package.json` from bunfs virtual filesystem; fixed by JSON import in `src/version.ts` so bundler inlines metadata.
