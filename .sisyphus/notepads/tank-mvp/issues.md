# Tank MVP — Issues & Gotchas

## Known
- GH_TOKEN / GITHUB_TOKEN env vars override gh CLI auth — must `unset` both for gh commands
- Vercel 4.5MB body limit — packages upload directly to Supabase Storage via signed URLs
- look_at MCP tool is broken on user's PC — don't use it

## Blocked Tasks (Partner's Domain)

Tasks 5.1, 5.2, 5.3 require partner to build:
- **5.1 Python Function Scaffold** — Create `api/analyze.py` with FastAPI on Vercel Python runtime. Needs `OPENROUTER_API_KEY`.
- **5.2 Permission Extraction** — `POST /api/analyze/permissions` using OpenRouter `qwen/qwen3-coder:free` to extract permissions from SKILL.md content.
- **5.3 Security Scanning** — `POST /api/analyze/security` using OpenRouter `deepseek/deepseek-r1-0528:free` to check for prompt injection, data exfiltration, obfuscated instructions, credential harvesting.

**Current state**: Tasks 5.4 (score computation), 5.5 (pipeline integration), and 5.6 (tank audit CLI) are COMPLETE and ready to consume Python analysis results. When the partner delivers 5.1-5.3, the only change needed is:
1. In `confirm/route.ts`: call the Python `/api/analyze/*` endpoints before computing the score
2. Pass `analysisResults` to `computeAuditScore()` (currently passed as `null`)

The audit score currently gives "benefit of doubt" for security checks (defaults to pass when no analysis runs). Once Python functions exist, the score will be more accurate.
