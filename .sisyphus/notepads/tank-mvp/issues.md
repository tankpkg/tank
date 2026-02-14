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

## Resolved: Vercel Deployment

Deployed successfully to Vercel:
- **URL**: `https://tank-web-seven.vercel.app`
- **Project**: `tank-web` in `elad12390-gmailcoms-projects`
- **Root directory**: `apps/web` (configured via Vercel API)
- **Install command**: `cd ../.. && pnpm install` (monorepo pattern)
- **Build command**: `cd ../.. && pnpm build --filter=@tank/web`
- **Python functions**: Working (`POST /api/analyze` returns 200)
- **45 commits pushed** to `github.com/tankpkg/tank`

**Vercel env vars set**: `DATABASE_URL`, `SUPABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
**Still need on Vercel**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`

**Custom domain `tankpkg.dev`**: Added to project but DNS needs CNAME → `cname.vercel-dns.com` on Cloudflare.

## Blocked: 17 Live E2E Verification Items

All 35 tasks + 255 sub-criteria complete. 17 remaining items require credentials:

| Variable | Items Blocked | How to Get |
|----------|--------------|------------|
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | 5 items (OAuth, login, whoami) | github.com/settings/developers → New OAuth App |
| `SUPABASE_SERVICE_ROLE_KEY` | 4 items (Storage bucket, publish) | Supabase Dashboard → Settings → API |
| `OPENROUTER_API_KEY` | 1 item (live LLM test) | openrouter.ai → API Keys |
| Above + published skill | 7 items (search, install, update, remove) | Need publish to work first |

**To create GitHub OAuth App**: Homepage URL: `https://tankpkg.dev`, Callback URL: `https://tankpkg.dev/api/auth/callback/github`
