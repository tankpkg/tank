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
