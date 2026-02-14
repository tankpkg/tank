# Tank MVP — Issues & Gotchas

## Known
- GH_TOKEN / GITHUB_TOKEN env vars override gh CLI auth — must `unset` both for gh commands
- Vercel 4.5MB body limit — packages upload directly to Supabase Storage via signed URLs
- look_at MCP tool is broken on user's PC — don't use it

## Resolved: Tasks 5.1-5.3 (formerly "blocked on partner")

Tasks 5.1, 5.2, 5.3 were originally partner's domain but built ourselves. All 3 committed:
- **5.1** `a78a594` — Python scaffold (_lib.py, index.py, requirements.txt)
- **5.2** `092f568` — Permission extraction (permissions.py)
- **5.3** `6f6fa04` — Security scanning (security.py + 16 pytest tests)

**Remaining integration**: `confirm/route.ts` still passes `analysisResults: null` to `computeAuditScore()`. To activate real analysis, set `OPENROUTER_API_KEY` and call the Python endpoints before scoring.

## Blocked: 18 Live E2E Verification Items

All 35 implementation tasks and 254 sub-criteria are complete. The remaining 18 unchecked items are **live integration tests** that require env vars and deployment. None are code tasks.

**Blockers (env vars needed from user):**
| Variable | Items Blocked | How to Get |
|----------|--------------|------------|
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | 3 items (OAuth flow, account creation) | GitHub Developer Settings → OAuth App |
| `SUPABASE_SERVICE_ROLE_KEY` | 4 items (Storage bucket, publish flow) | Supabase Dashboard → Settings → API |
| `OPENROUTER_API_KEY` | 1 item (live LLM false-positive test) | openrouter.ai → API Keys |
| Vercel deployment | 1 item (deploy verification) | `vercel deploy` or push to GitHub |
| All of the above | 9 items (full E2E checklist) | Need live server with all vars set |

**Action required**: User must provide these credentials. Once set, all 18 items can be verified in a single E2E test session.
