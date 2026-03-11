# Badge Module

## Anchor

**Why this module exists:** Skill publishers want to embed visual trust signals in READMEs and documentation. The badge API generates SVG badges that display a skill's audit score, giving consumers a quick visual indicator of security quality without visiting the registry.

**Consumers:** External tools, README badges (`![audit score](https://registry.tank.sh/api/v1/badge/@org/skill))`).

**Single source of truth:** `packages/web/app/api/v1/badge/[...name]/route.ts`.

---

## Layer 1: Structure

```
packages/web/app/api/v1/badge/[...name]/route.ts  # GET — returns SVG badge with auditScore
```

---

## Layer 2: Constraints

| #   | Rule                                                           | Rationale                                      | Verified by  |
| --- | -------------------------------------------------------------- | ---------------------------------------------- | ------------ |
| C1  | Response `Content-Type` is `image/svg+xml`                     | Browsers and GitHub must render it as an image | BDD scenario |
| C2  | Badge shows audit score (0–10) or "unknown" if not yet scanned | Score must be human-readable in the badge      | BDD scenario |
| C3  | Unknown skill returns an "unknown" badge (not 404)             | Badge URLs embedded in READMEs must not break  | BDD scenario |
| C4  | Badge is cache-controlled with short TTL to reflect re-scans   | Stale badges would mislead users               | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                               | Expected                              |
| --- | --------------------------------------------------- | ------------------------------------- |
| E1  | `GET /api/v1/badge/@org/react` (scanned, score 8.5) | SVG containing "8.5" with green color |
| E2  | `GET /api/v1/badge/@org/nonexistent`                | SVG with "unknown" label, 200 status  |
| E3  | SVG response for any skill                          | `Content-Type: image/svg+xml`         |
