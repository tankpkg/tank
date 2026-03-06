# Root Cause Analysis: MCP Documentation & Security Scan Issues

**Date:** 2026-03-05
**Issue:** MCP documentation not in menu, security scans not running, no LLM scan indication
**Severity:** High
**Status:** In Progress
**Tracker:** Direct

## Issue Summary

**Description:**
Three related issues affecting the Tank MCP server and security scanning features:

1. **MCP documentation not in menu** - The `/docs/mcp` page exists but is not listed in the sidebar navigation
2. **Security scans don't run** - Users cannot trigger security scans via MCP
3. **No indication of LLM scans** - The LLM corroboration layer exists but is not visible to users in scan output

**Expected Behavior:**
1. MCP documentation should be visible in the docs sidebar under a "Reference" or "Integrations" section
2. The `scan-skill` MCP tool should successfully run security scans and return results
3. Scan results should clearly indicate when LLM analysis was performed and what verdicts were returned

**Actual Behavior:**
1. MCP docs page (`/docs/mcp`) is accessible via URL but not in navigation
2. Security scan tool exists in code but integration may be broken
3. LLM scan results are returned in API response but not clearly surfaced in MCP tool output

**Impact:**
- Affected users: All MCP users (Claude Code, Cursor, VS Code Copilot)
- Affected features: Security scanning, LLM-based false positive reduction
- Severity: High (core feature not discoverable/usable)

## Reproduction

**Can Reproduce:** Yes

**Reproduction Steps:**

### Issue 1: MCP Documentation Missing from Menu
1. Navigate to https://tankpkg.dev/docs
2. Look at sidebar navigation
3. MCP Server page is NOT listed (but exists at /docs/mcp)

### Issue 2: Security Scans Not Running
1. Configure MCP server in Claude Code
2. Ask Claude to scan a skill: "Scan my skill for security issues"
3. Tool may fail or return incomplete results

### Issue 3: No LLM Scan Indication
1. Run `tank scan` on a skill
2. Review output
3. No indication of LLM analysis mode or verdicts displayed

**Environment:**
- Mode: LOCAL / PRODUCTION
- Platform: MCP tools (Claude Code, Cursor, VS Code)

## Analysis

### Related Files:

| File | Role |
|------|------|
| `apps/web/content/docs/meta.json` | Defines sidebar navigation structure |
| `apps/web/content/docs/mcp.mdx` | MCP documentation content (exists but not in menu) |
| `packages/mcp-server/src/tools/scan-skill.ts` | MCP scan tool implementation |
| `packages/mcp-server/src/tools/audit-skill.ts` | MCP audit tool (doesn't show LLM info) |
| `python-api/lib/scan/stage3_injection.py` | LLM corroboration layer |
| `python-api/lib/scan/llm_analyzer.py` | LLM analyzer implementation |
| `apps/web/app/api/v1/scan/route.ts` | Scan API endpoint |

### Code Flow:

#### Issue 1: Navigation Structure
The sidebar is built from `apps/web/content/docs/meta.json`:
```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "getting-started",
    "---Guides---",
    "publishing",
    "installing",
    "cicd",
    "self-hosting",
    "---Reference---",
    "cli",
    "api",
    "---Quick Starts---",
    "publish-first-skill",
    "security-checklist",
    "self-host-quickstart"
  ]
}
```
**Missing:** `mcp` page is NOT in this list!

#### Issue 2: Security Scan Tool
The `scan-skill.ts` tool:
1. Calls `/api/v1/scan` endpoint
2. Endpoint calls Python API `/api/analyze/scan`
3. Python API runs 6-stage pipeline including LLM corroboration
4. Results include `llm_analysis` field but output formatting doesn't show it clearly

#### Issue 3: LLM Indication
The `scan-skill.ts` output formatting shows:
```typescript
// Stages run
if (scanResult.stage_results?.length > 0) {
  lines.push('### Scan Stages');
  lines.push('');
  for (const stage of scanResult.stage_results) {
    const status = stage.status === 'passed' ? '✓' : '✗';
    lines.push(`- ${status} ${stage.stage} (${stage.duration_ms}ms)`);
  }
}
```
**Missing:** No display of `llm_analysis` field which contains mode, provider, and verdicts!

## Root Cause

### Root Cause 1: MCP Documentation Not in Menu
**Category:** Missing configuration

The `mcp.mdx` file exists in `/docs` but was never added to `meta.json` pages array. This is a simple oversight during development.

### Root Cause 2: Security Scans May Not Run
**Category:** Potential API configuration issue

The scan requires:
1. `PYTHON_API_URL` environment variable to be set
2. Python API service to be running
3. Proper authentication

The MCP tool may fail silently if these are misconfigured.

### Root Cause 3: No LLM Scan Indication
**Category:** Missing feature in output formatting

The API returns `llm_analysis` with:
- `enabled`: boolean
- `mode`: "byollm" | "builtin" | "disabled"
- `provider_used`: string
- `findings_reviewed`, `findings_dismissed`, `findings_confirmed`: counts

But `scan-skill.ts` output formatting never displays this information!

**Why it Happened:**
- LLM corroboration was added later as an enhancement
- Output formatting was not updated to surface the new data
- Documentation was not updated when MCP page was created

## Fix Strategy

### Recommended Fix:

**Three-part fix addressing all issues:**

### Part 1: Add MCP to Navigation

**File:** `apps/web/content/docs/meta.json`

Add `"mcp"` to the pages array under Reference section:
```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "getting-started",
    "---Guides---",
    "publishing",
    "installing",
    "cicd",
    "self-hosting",
    "---Reference---",
    "cli",
    "mcp",      // <-- ADD THIS
    "api",
    ...
  ]
}
```

### Part 2: Improve MCP Scan Output

**File:** `packages/mcp-server/src/tools/scan-skill.ts`

Add LLM analysis display after scan stages:
```typescript
// Add after stage_results section
if (scanResult.llm_analysis) {
  const llm = scanResult.llm_analysis;
  lines.push('### LLM Analysis');
  lines.push('');
  lines.push(`**Mode:** ${llm.mode}`);
  if (llm.provider_used) {
    lines.push(`**Provider:** ${llm.provider_used}`);
  }
  if (llm.findings_reviewed) {
    lines.push(`**Findings Reviewed:** ${llm.findings_reviewed}`);
  }
  if (llm.findings_dismissed) {
    lines.push(`**False Positives Dismissed:** ${llm.findings_dismissed}`);
  }
  if (llm.findings_confirmed) {
    lines.push(`**Threats Confirmed:** ${llm.findings_confirmed}`);
  }
  lines.push('');
}
```

### Part 3: Update MCP Documentation

**File:** `apps/web/content/docs/mcp.mdx`

Add section about LLM analysis in scan output:
```markdown
### Understanding LLM Analysis

When LLM scanning is enabled, the scan output includes additional context:

- **Mode:** `byollm` (custom provider), `builtin` (Groq/OpenRouter), or `disabled`
- **Provider:** The specific LLM used for analysis
- **Findings Reviewed:** Number of ambiguous findings sent to LLM
- **False Positives Dismissed:** Findings classified as benign by LLM
- **Threats Confirmed:** Findings confirmed as genuine threats
```

**Files to Modify:**
1. `apps/web/content/docs/meta.json` - Add MCP to navigation
2. `packages/mcp-server/src/tools/scan-skill.ts` - Add LLM analysis display
3. `apps/web/content/docs/mcp.mdx` - Document LLM analysis output

**Testing Strategy:**
- Unit tests: Verify meta.json parsing includes MCP
- Integration tests: Run scan via MCP tool, verify LLM info in output
- Edge cases: Test with LLM disabled, with findings, without findings

**Validation:**
- How to verify: Check docs sidebar for MCP link, run scan and see LLM section
- Regression testing: Existing scan tests should still pass

## Impact

**Current Impact:**
- Users affected: All MCP users (Claude Code, Cursor, VS Code Copilot users)
- Features affected: Security scanning discoverability, LLM false positive reduction transparency
- Data impact: None (no data corruption)

**Potential Side Effects:**
- Adding MCP to nav: None (purely additive)
- Changing scan output: Existing users may see new output format
- Needs testing: Ensure output doesn't break parsers

## Prevention

**How to Prevent:**
- [ ] Add test: Verify all docs pages are in meta.json
- [ ] Update checklist: When adding new doc page, add to meta.json
- [ ] Add monitoring: Log when LLM analysis is used/disabled
- [ ] Improve patterns: Create template for MCP tool output formatting

## Next Steps

1. Implement fix using: `/piv-speckit:implement-fix <this-rca>`
2. Validate fix:
   - Check docs sidebar shows MCP
   - Run scan and verify LLM info displayed
   - Test with LLM enabled/disabled
3. Update prevention measures
4. Close issue

---

**RCA Status:** Implementation Ready

---

## Appendix: Technical Details

### LLM Analysis Response Structure

```typescript
interface LLMAnalysis {
  enabled: boolean;
  mode: "byollm" | "builtin" | "disabled";
  providers?: Array<{
    name: string;
    model: string;
    api_key_configured: boolean;
    base_url: string;
    status: string;
    latency_ms: number | null;
    error: string | null;
  }>;
  provider_used?: string;
  findings_reviewed?: number;
  findings_dismissed?: number;
  findings_confirmed?: number;
  findings_uncertain?: number;
  latency_ms?: number;
  error?: string;
}
```

### Environment Variables for LLM

```bash
# Option 1: Disable LLM entirely (regex-only scanning)
LLM_SCAN_ENABLED=false

# Option 2: Use your own LLM provider (any OpenAI-compatible API)
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.example.com/v1
LLM_MODEL=gpt-4o-mini

# Option 3: Use built-in Groq (free tier available)
GROQ_API_KEY=gsk_xxx

# Option 4: Use OpenRouter
OPENROUTER_API_KEY=sk-or-xxx
```
