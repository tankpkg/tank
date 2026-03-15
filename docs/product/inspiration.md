# Inspiration

External patterns that influenced Tank, plus the parts we rejected.

## Workspace Shape

- `packages/` workspace layout: adopted
- shared pure-schema package: adopted
- co-versioning every package: rejected; published and internal packages have different release needs

## Tooling Choices

- Bun workspaces: adopted
- `just --list` as the human entry point: adopted
- `@tsconfig/bun`: adopted to reduce TS config noise
- one tool for lint/format where possible: adopted pragmatically, not as dogma

## Testing Philosophy

- real E2E over mock-heavy integration tests: adopted
- BDD as executable behavior docs: adopted where workflow risk is high
- detailed QA findings/resolutions loop: adopted in `bdd/qa/`

## What Not To Copy

- do not cargo-cult another repo’s folder names or conventions
- do not keep docs that merely restate code
- do not document runtime versions in agent docs unless the repo cannot enforce them
