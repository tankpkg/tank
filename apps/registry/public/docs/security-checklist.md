---
title: Secure AI Skills Checklist
description: Security best practices checklist for publishing safe AI agent skills — covering permissions, code security, prompt injection prevention, and dependency management.
---

# Secure AI Skills Checklist

Use this checklist before publishing any AI agent skill to ensure it follows security best practices.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 90" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="sec-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#64748b"/>
    </marker>
  </defs>
  <rect x="10" y="15" width="115" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="67" y="35" text-anchor="middle" fill="#10b981" font-weight="600" font-size="13">Manifest</text>
  <text x="67" y="52" text-anchor="middle" fill="#64748b" font-weight="600" font-size="18">&#x2713;</text>
  <line x1="125" y1="40" x2="148" y2="40" stroke="#64748b" stroke-width="1.5" marker-end="url(#sec-arrow)"/>
  <rect x="153" y="15" width="115" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="210" y="35" text-anchor="middle" fill="#10b981" font-weight="600" font-size="13">Code</text>
  <text x="210" y="52" text-anchor="middle" fill="#64748b" font-weight="600" font-size="18">&#x2713;</text>
  <line x1="268" y1="40" x2="291" y2="40" stroke="#64748b" stroke-width="1.5" marker-end="url(#sec-arrow)"/>
  <rect x="296" y="15" width="115" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="353" y="35" text-anchor="middle" fill="#10b981" font-weight="600" font-size="13">Prompts</text>
  <text x="353" y="52" text-anchor="middle" fill="#64748b" font-weight="600" font-size="18">&#x2713;</text>
  <line x1="411" y1="40" x2="434" y2="40" stroke="#64748b" stroke-width="1.5" marker-end="url(#sec-arrow)"/>
  <rect x="439" y="15" width="115" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="496" y="35" text-anchor="middle" fill="#10b981" font-weight="600" font-size="13">Secrets</text>
  <text x="496" y="52" text-anchor="middle" fill="#64748b" font-weight="600" font-size="18">&#x2713;</text>
  <line x1="554" y1="40" x2="577" y2="40" stroke="#64748b" stroke-width="1.5" marker-end="url(#sec-arrow)"/>
  <rect x="582" y="15" width="115" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="639" y="35" text-anchor="middle" fill="#10b981" font-weight="600" font-size="13">Dependencies</text>
  <text x="639" y="52" text-anchor="middle" fill="#64748b" font-weight="600" font-size="18">&#x2713;</text>
</svg>
</div>

## Manifest Security

- [ ] **Minimal permissions** — Only declare permissions your skill actually needs
- [ ] **Explicit network allowlist** — List specific domains, avoid wildcards
- [ ] **Scoped filesystem access** — Use specific paths, never `/` or `~`
- [ ] **No hardcoded secrets** — Use environment variables for credentials
- [ ] **Version pinned dependencies** — Lock all dependency versions

## Code Security

- [ ] **No `eval()` or `Function()`** — Dynamic code execution is blocked
- [ ] **No shell injection** — Sanitize all inputs to shell commands
- [ ] **No SQL injection** — Use parameterized queries
- [ ] **No path traversal** — Validate and sanitize file paths
- [ ] **No SSRF vulnerabilities** — Validate and restrict URLs

## Prompt Injection Prevention

- [ ] **Input sanitization** — Escape or remove special characters from user input
- [ ] **Output validation** — Check LLM outputs before executing actions
- [ ] **Separation of concerns** — Don't mix user input with system prompts
- [ ] **Rate limiting** — Implement request limits to prevent abuse

## Secret Management

- [ ] **No secrets in code** — Never hardcode API keys, tokens, or passwords
- [ ] **No secrets in packages** — Do not ship `.env` files, private keys, or credential-bearing config
- [ ] **Secret rotation support** — Design for key rotation without code changes
- [ ] **Audit logging** — Log sensitive operations without logging secret values

## Dependency Security

- [ ] **Minimal dependencies** — Only include what you need
- [ ] **Trusted sources** — Only use well-maintained packages
- [ ] **No deprecated packages** — Use actively maintained alternatives
- [ ] **Lockfile committed** — Include `bun.lock` or equivalent

## Permission Best Practices

| Permission Type  | ✅ Good Practice              | ❌ Avoid                    |
| ---------------- | ----------------------------- | --------------------------- |
| Network          | `["https://api.example.com"]` | `["*"]` or `["https://*"]`  |
| Filesystem Read  | `["./data/**"]`               | `["/**"]` or `["~/**"]`     |
| Filesystem Write | `["./output/**"]`             | `["/**"]` or home directory |

## Runtime Security

- [ ] **Graceful degradation** — Handle permission denials without crashing
- [ ] **Clear error messages** — Tell users what permission is needed and why
- [ ] **No privilege escalation** — Don't attempt to bypass permission checks
- [ ] **Secure defaults** — Fail closed, not open

## Before Publishing

```bash
# Run the security scanner (6-stage pipeline)
tank scan

# Verify lockfile integrity
tank verify

# Check for secrets accidentally committed
git diff --cached | grep -i "api_key\|secret\|token\|password"

# Audit dependencies
npm audit
```

## Security Scan Results

Tank's 6-stage pipeline will flag:

| Severity | Examples                           | Result                       |
| -------- | ---------------------------------- | ---------------------------- |
| Critical | Hardcoded secrets, code injection  | ❌ FAIL — Must fix           |
| High     | SQL injection, path traversal      | ❌ FAIL — Must fix           |
| Medium   | Deprecated deps, broad permissions | ⚠️ FLAGGED — Review required |
| Low      | Missing docs, style issues         | ✅ PASS with notes           |

## Scanning Tools

Tank uses multiple security scanners in a 6-stage pipeline:

| Stage   | Tool                 | Purpose                                     |
| ------- | -------------------- | ------------------------------------------- |
| Stage 2 | AST + regex analysis | Static analysis for code patterns           |
| Stage 2 | Bandit               | Python security linter                      |
| Stage 3 | Cisco Skill Scanner  | AI agent threat detection                   |
| Stage 3 | Snyk Agent Scan      | Prompt injection & tool poisoning detection |
| Stage 4 | detect-secrets       | Secret/credential detection                 |
| Stage 5 | OSV API              | Dependency vulnerability scanning           |

<Callout type="info">
  Snyk Agent Scan is optional and cloud-dependent. If unavailable, scanning continues with local tools.
</Callout>

## Getting Help

- **Security questions**: Open an issue on [GitHub](https://github.com/tankpkg/tank)
- **Vulnerability report**: Email security@tankpkg.dev
- **Documentation**: [Security Model](/docs/security)

---

<Callout type="info">
  This checklist is partially enforced automatically by `tank scan` and install-time checks. Run it early and often
  during development. See the [Security Model](/docs/security) for the actual enforcement model.
</Callout>
