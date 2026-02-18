# Tank: Complete User Flow Diagram

> A security-first package manager for AI agent skills

---

## Quick Overview: What is Tank?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TANK ECOSYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                │
│   │  DEVELOPERS │      │  CONSUMERS  │      │   ADMINS    │                │
│   │  (Authors)  │      │  (Users)    │      │ (Org/Tokens)│                │
│   └──────┬──────┘      └──────┬──────┘      └──────┬──────┘                │
│          │                    │                    │                        │
│          ▼                    ▼                    ▼                        │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                      TANK REGISTRY (Web + API)                   │      │
│   │  • Skill Discovery  • Security Scanning  • Version Management   │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                              │                                              │
│                              ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                        AI AGENTS                                 │      │
│   │  Claude Code • Cursor • Copilot • Custom Agents                  │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Problem Tank Solves

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WHY TANK EXISTS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ❌ CURRENT STATE (Feb 2026 Incident: ClawHavoc)                           │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ • 341 malicious skills discovered (12% of a marketplace)              │ │
│  │ • Skills run with FULL agent authority (read files, API calls, etc.)  │ │
│  │ • No versioning → supply chain attacks                                 │ │
│  │ • No lockfiles → unreproducible installs                              │ │
│  │ • No permissions → unchecked capabilities                             │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                              ⬇️                                             │
│                                                                             │
│  ✅ TANK SOLUTION                                                           │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ ✓ Integrity verification with sha512 hashes                           │ │
│  │ ✓ Permission budgets (network, filesystem, subprocess)                │ │
│  │ ✓ 6-stage security scanning (0-10 audit score)                        │ │
│  │ ✓ Lockfiles for reproducibility (skills.lock)                         │ │
│  │ ✓ Semver versioning enforced                                           │ │
│  │ ✓ Safe tarball extraction with path traversal protection              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Real CLI Commands (14 Total)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TANK CLI COMMANDS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AUTHENTICATION                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  tank login              Authenticate via browser OAuth              │   │
│  │  tank logout             Remove authentication token                 │   │
│  │  tank whoami             Show current user                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  SKILL MANAGEMENT                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  tank init               Create skills.json in current directory     │   │
│  │  tank publish            Pack and publish skill to registry          │   │
│  │  tank search <query>     Search for skills in registry               │   │
│  │  tank info <name>        Show detailed skill information             │   │
│  │  tank audit [name]       Show security audit results                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  INSTALLATION                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  tank install [name]     Install skill (or from lockfile)            │   │
│  │  tank update [name]      Update to latest version                    │   │
│  │  tank remove <name>      Remove installed skill                      │   │
│  │  tank verify             Verify skills match lockfile                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  PERMISSIONS & AGENT INTEGRATION                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  tank permissions        Show resolved permission summary            │   │
│  │  tank link               Link skills to AI agent directories         │   │
│  │  tank unlink             Remove skill links from agents              │   │
│  │  tank doctor             Diagnose agent integration health           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  FLAGS: -g, --global for global installation                                │
│         --dry-run for publish (test without uploading)                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 1: Consumer - Discover & Install Skills

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONSUMER WORKFLOW: INSTALL A SKILL                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: AUTHENTICATE                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank login                                                     │   │
│  │                                                                     │   │
│  │    Opening browser for authentication...                            │   │
│  │    Waiting for authorization...                                     │   │
│  │    ✓ Logged in as yourname@example.com                              │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 2: DISCOVER                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank search "code review"                                      │   │
│  │                                                                     │   │
│  │    ┌──────────────────────────────────────────────────────────────┐│   │
│  │    │ Name                    Version    Score   Description        ││   │
│  │    ├──────────────────────────────────────────────────────────────┤│   │
│  │    │ @security/reviewer      2.1.0     9.2/10  Code review skill  ││   │
│  │    │ @anthropic/pr-review    1.5.0     8.7/10  PR automation      ││   │
│  │    │ @tank/feature-dev       3.0.0     9.5/10  Feature planning   ││   │
│  │    └──────────────────────────────────────────────────────────────┘││   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 3: INSPECT                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank info @tank/feature-dev                                    │   │
│  │                                                                     │   │
│  │    Name:        @tank/feature-dev                                   │   │
│  │    Version:     3.0.0                                               │   │
│  │    Author:      Tank Team                                           │   │
│  │    Audit Score: 9.5/10 ████████████░                               │   │
│  │    Status:      pass                                                 │   │
│  │    Permissions:                                                      │   │
│  │      - filesystem: read access to ./src/**                          │   │
│  │      - network: api calls to *.anthropic.com                        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 4: INSTALL                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank install @tank/feature-dev                                 │   │
│  │                                                                     │   │
│  │    ✓ Resolving version...                                           │   │
│  │    ✓ Downloading tarball...                                         │   │
│  │    ✓ Verifying integrity (sha512)...                                │   │
│  │    ✓ Extracting skill files...                                      │   │
│  │    ✓ Validating permissions...                                      │   │
│  │    ✓ Updating skills.lock                                           │   │
│  │    ✓ Linking to Claude Code                                         │   │
│  │                                                                     │   │
│  │    Installed @tank/feature-dev@3.0.0                                │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 5: VERIFY & AUDIT                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank verify                                                    │   │
│  │    ✓ All skills match lockfile                                      │   │
│  │                                                                     │   │
│  │    $ tank audit                                                     │   │
│  │                                                                     │   │
│  │    @tank/feature-dev@3.0.0                                          │   │
│  │    Score: 9.5/10  Status: pass                                      │   │
│  │    Permissions: filesystem:read, network:api                        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 2: Developer - Create & Publish Skills

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPER WORKFLOW: PUBLISH A SKILL                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: AUTHENTICATE                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank login                                                     │   │
│  │    ✓ Logged in as developer@example.com                             │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 2: INITIALIZE SKILL                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank init                                                      │   │
│  │                                                                     │   │
│  │    ? Skill name: my-code-reviewer                                   │   │
│  │    ? Version: 1.0.0                                                 │   │
│  │    ? Description: Automated code review skill                       │   │
│  │    ? Author: Your Name                                              │   │
│  │                                                                     │   │
│  │    ✓ Created skills.json                                            │   │
│  │                                                                     │   │
│  │    Now create SKILL.md with your skill instructions                 │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 3: CREATE SKILL.MD                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    # SKILL.md                                                       │   │
│  │    ---                                                              │   │
│  │    name: my-code-reviewer                                           │   │
│  │    version: 1.0.0                                                   │   │
│  │    ---                                                              │   │
│  │                                                                     │   │
│  │    ## Purpose                                                       │   │
│  │    Reviews code for security issues, style violations,              │   │
│  │    and best practices.                                              │   │
│  │                                                                     │   │
│  │    ## Usage                                                         │   │
│  │    Point me to a file or directory and I'll analyze it.             │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 4: PUBLISH                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank publish                                                   │   │
│  │                                                                     │   │
│  │    ✓ Validating skills.json...                                      │   │
│  │    ✓ Packing skill directory...                                     │   │
│  │    • Files: 3  Size: 4.2KB                                          │   │
│  │    ✓ Uploading to registry...                                       │   │
│  │    ✓ Triggering security scan...                                    │   │
│  │    ✓ Publishing confirmed                                           │   │
│  │                                                                     │   │
│  │    Published my-code-reviewer@1.0.0                                 │   │
│  │                                                                     │   │
│  │    Test first? Use: tank publish --dry-run                          │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 3: Admin - Organizations & Tokens (Web Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 ADMIN WORKFLOW: ORGANIZATIONS & TOKENS (WEB UI)              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NOTE: Organization and token management is available via the web UI only  │
│        at https://your-registry/dashboard                                   │
│                                                                             │
│  STEP 1: ACCESS DASHBOARD                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    1. Go to https://your-registry/login                             │   │
│  │    2. Sign in with GitHub                                           │   │
│  │    3. Access dashboard at /dashboard                                │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 2: MANAGE ORGANIZATIONS                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    /dashboard/orgs                                                  │   │
│  │    • View your organizations                                        │   │
│  │    • Create new organizations                                       │   │
│  │    • View organization details at /orgs/[slug]                      │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  STEP 3: MANAGE API TOKENS                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    /dashboard/tokens                                                │   │
│  │    • View active tokens                                             │   │
│  │    • Create new tokens                                              │   │
│  │    • Revoke existing tokens                                         │   │
│  │                                                                     │   │
│  │    Tokens are used for:                                             │   │
│  │    • CI/CD authentication                                           │   │
│  │    • Automated skill publishing                                     │   │
│  │    • Programmatic API access                                        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TANK SECURITY FEATURES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAYER 1: INTEGRITY VERIFICATION                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    Every skill tarball is hashed with sha512                        │   │
│  │                                                                     │   │
│  │    Download ──────► Compute Hash ──────► Compare with Lockfile     │   │
│  │                                                                     │   │
│  │    ✓ Prevents tampering in transit                                  │   │
│  │    ✓ Guarantees reproducible installs                              │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  LAYER 2: PERMISSION BUDGETS                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    # skills.json defines what skills CAN do                         │   │
│  │    {                                                                │   │
│  │      "permissions": {                                               │   │
│  │        "network": { "outbound": ["*.anthropic.com"] },              │   │
│  │        "filesystem": { "read": ["./src/**"], "write": [] },         │   │
│  │        "subprocess": false                                          │   │
│  │      }                                                              │   │
│  │    }                                                                │   │
│  │                                                                     │   │
│  │    $ tank permissions                                               │   │
│  │    Shows aggregated permissions and budget violations               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  LAYER 3: SECURITY SCANNING (6 Stages)                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    Stage 1: INGEST         - Validate structure                     │   │
│  │    Stage 2: STRUCTURE      - Verify file layout                     │   │
│  │    Stage 3: STATIC_ANALYSIS - Code patterns                         │   │
│  │    Stage 4: INJECTION      - Detect injection risks                 │   │
│  │    Stage 5: SECRETS        - Find hardcoded credentials             │   │
│  │    Stage 6: DEPENDENCIES   - Vulnerability scanning                 │   │
│  │                                                                     │   │
│  │    Result: 0-10 audit score with pass/pass_with_notes/flagged/reject│   │
│  │                                                                     │   │
│  │    $ tank audit @tank/feature-dev                                   │   │
│  │    Shows detailed security analysis                                 │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  LAYER 4: SAFE EXTRACTION                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    Tarball extraction prevents:                                     │   │
│  │    • Path traversal attacks (../../../etc/passwd)                   │   │
│  │    • Symlink attacks                                                │   │
│  │    • Writing outside target directory                               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI AGENT INTEGRATION                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  HOW SKILLS WORK WITH AI AGENTS                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank install @tank/feature-dev                                 │   │
│  │    ✓ Linking to Claude Code                                         │   │
│  │    ✓ Linking to Cursor                                              │   │
│  │                                                                     │   │
│  │    Skills are symlinked to agent directories:                       │   │
│  │    ~/.claude/skills/@tank/feature-dev → ~/.tank/skills/...         │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  MANUAL LINK MANAGEMENT                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    $ tank link                   # Link current skill to agents     │   │
│  │    $ tank unlink                 # Remove links from agents         │   │
│  │    $ tank doctor                 # Diagnose integration issues      │   │
│  │                                                                     │   │
│  │    $ tank doctor                                                    │   │
│  │                                                                     │   │
│  │    Detected Agents:                                                  │   │
│  │      ✓ Claude Code: linked                                          │   │
│  │      ✓ Cursor: linked                                               │   │
│  │      ○ Windsurf: not installed                                      │   │
│  │                                                                     │   │
│  │    All skills properly linked!                                      │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Web App Features

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WEB APP PAGES                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PUBLIC PAGES                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  /                   Landing page with features & CLI examples      │   │
│  │  /skills             Browse and search the skills registry         │   │
│  │  /skills/[name]      Skill detail page:                            │   │
│  │                      • README viewer                                │   │
│  │                      • Version history                              │   │
│  │                      • File explorer                               │   │
│  │                      • Security audit results                       │   │
│  │                      • Download button                              │   │
│  │                      • Install command                              │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  AUTHENTICATED PAGES (/dashboard)                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  /dashboard         Dashboard with quick links                     │   │
│  │  /dashboard/orgs    List and create organizations                   │   │
│  │  /dashboard/orgs/[slug]  Organization details                       │   │
│  │  /dashboard/tokens  Manage API tokens                               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Best Practices

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECOMMENDED BEST PRACTICES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✅ FOR CONSUMERS                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  1. Check audit score before installing                             │   │
│  │     $ tank info @tank/skill-name                                    │   │
│  │     Look for: Score ≥ 8.0, Status: pass                            │   │
│  │                                                                     │   │
│  │  2. Review permissions before install                               │   │
│  │     $ tank info @tank/skill-name                                    │   │
│  │     Question: Does skill need subprocess permissions?              │   │
│  │                                                                     │   │
│  │  3. Commit skills.lock to version control                          │   │
│  │     Ensures team uses same verified versions                        │   │
│  │                                                                     │   │
│  │  4. Run tank verify in CI/CD                                       │   │
│  │     Catches integrity issues early                                  │   │
│  │                                                                     │   │
│  │  5. Use tank audit regularly                                       │   │
│  │     Monitor security status of installed skills                    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ✅ FOR DEVELOPERS                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  1. Use tank init to create proper skills.json                     │   │
│  │                                                                     │   │
│  │  2. Declare minimum permissions needed                              │   │
│  │     Don't request subprocess if you only read files                │   │
│  │                                                                     │   │
│  │  3. Include clear SKILL.md documentation                           │   │
│  │     Users need to understand what your skill does                  │   │
│  │                                                                     │   │
│  │  4. Test with --dry-run before publishing                          │   │
│  │     $ tank publish --dry-run                                        │   │
│  │                                                                     │   │
│  │  5. Keep dependencies minimal                                       │   │
│  │     Reduces attack surface                                         │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start Guide

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GET STARTED IN 5 MINUTES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1️⃣  INSTALL TANK CLI                                                       │
│      $ npm install -g @tankpkg/cli                                          │
│                                                                             │
│  2️⃣  AUTHENTICATE                                                           │
│      $ tank login                                                           │
│      → Browser opens for GitHub OAuth                                       │
│                                                                             │
│  3️⃣  DISCOVER SKILLS                                                        │
│      $ tank search "your need"                                              │
│      → Browse by query, see audit scores                                    │
│                                                                             │
│  4️⃣  INSPECT & INSTALL                                                      │
│      $ tank info @tank/feature-dev                                          │
│      $ tank install @tank/feature-dev                                       │
│      → Verify integrity, check permissions                                  │
│                                                                             │
│  5️⃣  VERIFY & USE                                                           │
│      $ tank verify                                                          │
│      $ tank doctor                                                          │
│      → Skills auto-linked to your AI agents                                 │
│                                                                             │
│  🎉 DONE! Your AI agents now have secure, verified skills                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary: Why Tank is Good

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TANK VALUE PROPOSITION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔒 SECURITY FIRST                                                           │
│  ├── sha512 integrity verification for all downloads                       │
│  ├── Permission budgets limit skill capabilities                           │
│  ├── 6-stage security scanning with 0-10 scores                            │
│  └── Safe tarball extraction prevents path traversal                       │
│                                                                             │
│  🎯 EASE OF USE                                                              │
│  ├── npm-like CLI workflow                                                 │
│  ├── Browser-based OAuth authentication                                     │
│  ├── Automatic AI agent integration                                        │
│  └── Clear commands with helpful output                                    │
│                                                                             │
│  🔄 REPRODUCIBILITY                                                          │
│  ├── skills.lock pins exact versions with hashes                           │
│  ├── tank verify ensures consistency                                       │
│  └── Semver versioning enforced                                            │
│                                                                             │
│  🌐 WEB REGISTRY                                                             │
│  ├── Browse and search skills                                              │
│  ├── View security audits and permissions                                  │
│  ├── Download skill tarballs                                               │
│  └── Manage organizations and API tokens                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*Generated for Tank - The secure package manager for AI agent skills*
