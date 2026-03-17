# Badge Module

## Anchor

**Why this module exists:** Skill publishers want to embed visual trust signals in READMEs and documentation. The badge API generates SVG badges that display a skill's trust status, giving consumers a quick security signal without visiting the registry.

**Consumers:** External tools, README badges (`![audit score](https://registry.tank.sh/api/v1/badge/@org/skill))`).

**Single source of truth:** `apps/registry-legacy/app/api/v1/badge/[...name]/route.ts`.

---

## Layer 1: Structure

```
apps/registry-legacy/app/api/v1/badge/[...name]/route.ts  # GET — returns SVG badge with trust level
```

---

## Layer 2: Constraints

| #   | Rule                                                                                   | Rationale                                      | Verified by  |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------ |
| C1  | Response `Content-Type` is `image/svg+xml`                                             | Browsers and GitHub must render it as an image | BDD scenario |
| C2  | Badge shows trust status label (`verified`, `review`, `concerns`, `unsafe`, `pending`) | Badge language must match trust model          | BDD scenario |
| C3  | Unknown skill returns an "unknown" badge (not 404)                                     | Badge URLs embedded in READMEs must not break  | BDD scenario |
| C4  | Badge is cache-controlled with short TTL to reflect re-scans                           | Stale badges would mislead users               | BDD scenario |
| C5  | Badge may include score in SVG title metadata only                                     | Backward compatibility without score-first UI  | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                              | Expected                                   |
| --- | -------------------------------------------------- | ------------------------------------------ |
| E1  | `GET /api/v1/badge/@org/react` (pass + 0 findings) | SVG containing "verified" with green color |
| E2  | `GET /api/v1/badge/@org/nonexistent`               | SVG with "unknown" label, 200 status       |
| E3  | SVG response for any skill                         | `Content-Type: image/svg+xml`              |
