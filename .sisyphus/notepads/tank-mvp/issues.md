# Tank MVP — Issues & Gotchas

## Known
- GH_TOKEN / GITHUB_TOKEN env vars override gh CLI auth — must `unset` both for gh commands
- Vercel 4.5MB body limit — packages upload directly to Supabase Storage via signed URLs
- look_at MCP tool is broken on user's PC — don't use it
