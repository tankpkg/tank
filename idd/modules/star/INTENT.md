# Star Module

## Anchor

**Why this module exists:** Users need a way to bookmark and signal appreciation for skills. Stars provide social proof, help surface quality skills, and let users maintain a personal collection of favorites. The feature is gated behind authentication for write operations, and degrades gracefully if the `skill_stars` migration hasn't been applied.

**Consumers:** Web UI, authenticated users. `GET /api/v1/skills/[name]/star` (public read), `POST`/`DELETE` (authenticated write).

**Single source of truth:** `Implemented: apps/registry/src/api/routes/v1/star.ts`.

---

## Layer 1: Structure

```
# Implemented: apps/registry/src/api/routes/v1/star.ts  # GET (count + isStarred), POST (star), DELETE (unstar)
apps/registry/src/lib/db/schema.ts                     # skill_stars table: skillId, userId, unique constraint
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                                                                       | Rationale                                   | Verified by  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------ |
| C1  | `GET /star` returns `{ starCount, isStarred }` without auth                                                                                                | Anyone can see star counts                  | BDD scenario |
| C2  | `POST /star` requires auth; 401 if unauthenticated                                                                                                         | Stars are tied to user identity             | BDD scenario |
| C3  | `POST /star` on already-starred skill returns `{ message: "Already starred" }` (idempotent)                                                                | No duplicate star records                   | BDD scenario |
| C4  | `DELETE /star` removes the star and returns updated count                                                                                                  | Unstar must be symmetric with star          | BDD scenario |
| C5  | `GET /star` for nonexistent skill → 404                                                                                                                    | Star endpoint must respect skill visibility | BDD scenario |
| C6  | If `skill_stars` table does not exist (migration pending), `GET` returns `{ starCount: 0, isStarred: false, starsAvailable: false }` and writes return 503 | Graceful degradation during migration       | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                      | Expected                             |
| --- | ---------------------------------------------------------- | ------------------------------------ |
| E1  | `GET /skills/@org/react/star` (skill exists, no stars yet) | `{ starCount: 0, isStarred: false }` |
| E2  | `POST /skills/@org/react/star` authenticated               | `{ starCount: 1, isStarred: true }`  |
| E3  | `POST /skills/@org/react/star` again (already starred)     | `{ message: "Already starred" }`     |
| E4  | `DELETE /skills/@org/react/star`                           | `{ starCount: 0, isStarred: false }` |
| E5  | `POST /skills/@org/react/star` unauthenticated             | 401                                  |
| E6  | `GET /skills/@org/nonexistent/star`                        | 404                                  |
