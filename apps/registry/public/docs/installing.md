---
title: Installing AI Agent Skills
description: Install, update, remove, and verify AI agent skills with Tank — deterministic lockfiles, SHA-512 integrity checks, dependency resolution, and permission budget enforcement.
---

# Installing AI Agent Skills

Tank's install pipeline does significantly more than download a file. Every install resolves the full dependency tree, verifies SHA-512 integrity for every package, extracts tarballs through a security filter, enforces your project's permission budget, and writes a deterministic lockfile. This page covers every command and behavior you need for day-to-day skill management.

<svg viewBox="0 0 800 330" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <text x="400" y="20" text-anchor="middle" fill="currentColor" font-size="14" font-weight="600">What tank install Does That npm install Doesn't</text>
  <!-- Column 1: What's the same -->
  <rect x="15" y="40" width="250" height="130" rx="10" fill="none" stroke="currentColor" stroke-width="1"/>
  <text x="140" y="62" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Same as npm</text>
  <text x="30" y="84" fill="#64748b" font-size="10">Resolve semver ranges (^1.2.0)</text>
  <text x="30" y="102" fill="#64748b" font-size="10">Build dependency graph</text>
  <text x="30" y="120" fill="#64748b" font-size="10">Download tarballs in parallel</text>
  <text x="30" y="138" fill="#64748b" font-size="10">Write lockfile for determinism</text>
  <text x="30" y="158" fill="#64748b" font-size="10">Extract to local directory</text>
  <!-- Column 2: What Tank adds -->
  <rect x="280" y="40" width="505" height="130" rx="10" fill="none" stroke="#10b981" stroke-width="2"/>
  <text x="532" y="62" text-anchor="middle" fill="#10b981" font-size="12" font-weight="600">What Tank Adds</text>
  <!-- SHA-512 -->
  <text x="295" y="84" fill="#dc2626" font-size="10" font-weight="600">SHA-512 INTEGRITY</text>
  <text x="470" y="84" fill="#64748b" font-size="10">Every file hash-checked. Mismatch = hard failure. No override.</text>
  <!-- Permission budget -->
  <text x="295" y="106" fill="#dc2626" font-size="10" font-weight="600">PERMISSION BUDGET</text>
  <text x="470" y="106" fill="#64748b" font-size="10">Skill permissions checked against project ceiling before extract.</text>
  <!-- Extraction filter -->
  <text x="295" y="128" fill="#eab308" font-size="10" font-weight="600">EXTRACTION FILTER</text>
  <text x="470" y="128" fill="#64748b" font-size="10">Blocks symlinks, hardlinks, path traversal (../), absolute paths.</text>
  <!-- Size limits -->
  <text x="295" y="150" fill="#eab308" font-size="10" font-weight="600">SIZE LIMITS</text>
  <text x="470" y="150" fill="#64748b" font-size="10">50MB max tarball, 1000 files max. Prevents resource exhaustion.</text>
  <!-- What this prevents -->
  <rect x="15" y="190" width="770" height="130" rx="10" fill="none" stroke="#dc2626" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="400" y="212" text-anchor="middle" fill="#dc2626" font-size="12" font-weight="600">Real Attacks These Checks Prevent</text>
  <rect x="30" y="225" width="240" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="40" y="241" fill="#dc2626" font-size="10" font-weight="600">Symlink escape</text>
  <text x="40" y="255" fill="#64748b" font-size="9">skill/../../.ssh/id_rsa → reads private keys</text>
  <rect x="285" y="225" width="240" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="295" y="241" fill="#dc2626" font-size="10" font-weight="600">Path traversal</text>
  <text x="295" y="255" fill="#64748b" font-size="9">../../../etc/passwd in tarball entry name</text>
  <rect x="540" y="225" width="230" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="550" y="241" fill="#dc2626" font-size="10" font-weight="600">Tampered tarball</text>
  <text x="550" y="255" fill="#64748b" font-size="9">MITM modifies download → hash mismatch → blocked</text>
  <rect x="30" y="275" width="240" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="40" y="291" fill="#dc2626" font-size="10" font-weight="600">Permission creep</text>
  <text x="40" y="305" fill="#64748b" font-size="9">Skill wants network.* but budget says no → rejected</text>
  <rect x="285" y="275" width="240" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="295" y="291" fill="#dc2626" font-size="10" font-weight="600">Zip bomb</text>
  <text x="295" y="305" fill="#64748b" font-size="9">10KB compressed → 10GB extracted → size limit blocks</text>
  <rect x="540" y="275" width="230" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="550" y="291" fill="#dc2626" font-size="10" font-weight="600">Absolute path overwrite</text>
  <text x="550" y="305" fill="#64748b" font-size="9">/usr/bin/malware in tarball → absolute path rejected</text>
</svg>

## Installing a Skill

### Basic install

```bash
tank install @org/skill-name
```

This resolves the latest published version that satisfies `*`, downloads and verifies the tarball, extracts it to `.tank/skills/@org/skill-name/`, and writes the resolved version and SHA-512 integrity hash to `tank.lock`.

### With a version range

```bash
tank install @org/skill-name '^1.2.0'
```

Tank resolves the highest version that satisfies the semver range, not necessarily the latest. Use `^` for compatible minor updates, `~` for patch-only updates, or an exact version like `1.2.3` to pin precisely.

### Global install

```bash
tank install @org/skill-name '*' -g
```

Global skills are stored in `~/.tank/skills/` and are available to all agents on the machine. Local installs (no `-g`) are stored in `.tank/skills/` relative to your current working directory, scoped to that project.

### Install from lockfile (deterministic)

When a `tank.lock` file already exists in your project, running `tank install` with no arguments performs a **deterministic install** — equivalent to `npm ci`. It installs exactly the versions and integrity hashes recorded in the lockfile, ignoring `tank.json` version ranges entirely.

```bash
# Deterministic install — uses tank.lock, not tank.json ranges
tank install
```

This is the correct command for CI/CD pipelines, where reproducibility is critical.

## Dependency Resolution

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 750 100" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="dep-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <rect x="5" y="25" width="105" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="57" y="47" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Read</text>
  <text x="57" y="62" text-anchor="middle" fill="currentColor" font-size="9">tank.json</text>
  <line x1="110" y1="50" x2="125" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#dep-arrow)"/>
  <rect x="130" y="25" width="105" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="182" y="47" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Resolve</text>
  <text x="182" y="62" text-anchor="middle" fill="currentColor" font-size="9">semver ranges</text>
  <line x1="235" y1="50" x2="250" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#dep-arrow)"/>
  <rect x="255" y="25" width="105" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="307" y="47" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Fetch</text>
  <text x="307" y="62" text-anchor="middle" fill="currentColor" font-size="9">metadata</text>
  <line x1="360" y1="50" x2="375" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#dep-arrow)"/>
  <rect x="380" y="25" width="105" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="432" y="47" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Build</text>
  <text x="432" y="62" text-anchor="middle" fill="currentColor" font-size="9">dependency graph</text>
  <line x1="485" y1="50" x2="500" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#dep-arrow)"/>
  <rect x="505" y="25" width="105" height="50" rx="8" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="557" y="47" text-anchor="middle" fill="#dc2626" font-size="10" font-weight="600">Detect</text>
  <text x="557" y="62" text-anchor="middle" fill="currentColor" font-size="9">conflicts</text>
  <line x1="610" y1="50" x2="625" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#dep-arrow)"/>
  <rect x="630" y="25" width="110" height="50" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="685" y="47" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">Flatten</text>
  <text x="685" y="62" text-anchor="middle" fill="currentColor" font-size="9">install set</text>
  <text x="375" y="16" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Dependency Resolution</text>
</svg>
</div>

Tank uses a **fixpoint iteration algorithm** to resolve the full dependency tree. This means it doesn't just install the skill you named — it walks every skill's own `tank.json` to discover transitive dependencies, then iterates until the resolved set stabilizes.

### How it works

1. **Seed** — Start with the skills declared in your `tank.json`.
2. **Expand** — For each resolved skill, fetch its manifest and add its dependencies to the working set.
3. **Iterate** — Repeat expansion until no new dependencies are added (fixpoint).
4. **Conflict detection** — If two skills require incompatible versions of the same dependency, Tank errors with a detailed conflict report showing which packages conflict and why.
5. **Install order** — Compute a topological sort so dependencies always install before the skills that need them.
6. **Parallel downloads** — All tarballs are downloaded in parallel after the resolution phase completes, minimizing install time.

### Version conflict detection

If two skills require incompatible versions of a shared dependency, Tank surfaces an explicit error:

```
ERROR  Dependency conflict detected:
  @org/skill-a requires @shared/dep@^1.0.0 (resolves to 1.4.2)
  @org/skill-b requires @shared/dep@^2.0.0 (resolves to 2.1.0)
  Cannot satisfy both constraints simultaneously.

  Fix: pin one skill to a version compatible with the other, or
  open an issue with the upstream skill authors.
```

Tank does **not** silently pick one version. Conflicts are hard errors.

## The Lockfile (`tank.lock`)

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 640 95" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="lock-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <text x="185" y="16" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Lockfile Structure</text>
  <rect x="15" y="24" width="340" height="58" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="185" y="41" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">tank.lock</text>
  <text x="32" y="61" fill="currentColor" font-size="10" font-weight="600">package</text>
  <text x="105" y="61" fill="#64748b" font-size="10">@org/skill-name</text>
  <text x="280" y="61" fill="currentColor" font-size="10" font-weight="600">v</text>
  <text x="296" y="61" fill="#64748b" font-size="10">1.2.3</text>
  <text x="32" y="76" fill="currentColor" font-size="10" font-weight="600">integrity</text>
  <text x="105" y="76" fill="#64748b" font-size="10">sha512-abc123...==</text>
  <line x1="355" y1="53" x2="410" y2="53" stroke="#64748b" stroke-width="1.5" marker-end="url(#lock-arrow)"/>
  <rect x="418" y="30" width="205" height="46" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="520.5" y="49" text-anchor="middle" fill="#16a34a" font-size="11" font-weight="600">Deterministic install</text>
  <text x="520.5" y="64" text-anchor="middle" fill="#64748b" font-size="9">same versions on every machine</text>
</svg>
</div>

The `tank.lock` file is the source of truth for your install state. Commit it to version control.

### What's in a lockfile

```json
{
  "lockfileVersion": 2,
  "skills": {
    "@org/skill-name@1.2.3": {
      "version": "1.2.3",
      "resolved": "https://tankpkg.dev/api/v1/skills/@org/skill-name/1.2.3",
      "integrity": "sha512-abc123...==",
      "dependencies": {
        "@shared/dep": "^1.4.0"
      }
    },
    "@shared/dep@1.4.2": {
      "version": "1.4.2",
      "resolved": "https://tankpkg.dev/api/v1/skills/@shared/dep/1.4.2",
      "integrity": "sha512-xyz789...==",
      "dependencies": {}
    }
  }
}
```

### Key properties

- **Deterministic** — Keys are sorted alphabetically, and the file is always produced with stable formatting. The same dependency tree always produces byte-for-byte identical output.
- **SHA-512 integrity** — Every package entry includes its SHA-512 hash. Tank recomputes this hash on every install and refuses to proceed if it doesn't match.
- **Lockfile v2 `dependencies` field** — Introduced to support full tree reconstruction. Each package records its own declared dependencies so the lockfile alone is sufficient to reconstruct the complete install without re-fetching manifests from the registry.
- **Deterministic install mode** — When `tank.lock` is present and `tank install` is run with no arguments, Tank performs a lockfile-only install. It does not resolve version ranges from `tank.json`. This is by design — CI pipelines should always use this mode.

<Callout type="info">
  Always commit `tank.lock` to version control. It is the guarantee that every developer and every CI run installs
  exactly the same code. Excluding it from git means losing reproducibility.
</Callout>

## Security on Install

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 520 120" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <text x="260" y="18" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Install Security Checks</text>
  <rect x="15" y="30" width="235" height="28" rx="6" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="132.5" y="49" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">✓ SHA-512 integrity verify</text>
  <rect x="270" y="30" width="235" height="28" rx="6" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="387.5" y="49" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">✓ No symlinks / hardlinks</text>
  <rect x="15" y="64" width="235" height="28" rx="6" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="132.5" y="83" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">✓ No path traversal (../)</text>
  <rect x="270" y="64" width="235" height="28" rx="6" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="387.5" y="83" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">✓ No absolute paths</text>
  <rect x="95" y="98" width="330" height="18" rx="6" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="260" y="111" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">✓ Size limits: 50MB tarball / 1000 files</text>
</svg>
</div>

Tank applies multiple security filters during tarball extraction. These checks run before any file touches disk and cannot be bypassed:

| Check                      | Behavior                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| **Symlinks**               | Rejected — symlinks in tarballs are a well-known path traversal vector |
| **Hardlinks**              | Rejected — hardlinks can escape the extraction sandbox                 |
| **Path traversal** (`../`) | Rejected — any entry with `..` in the path is refused                  |
| **Absolute paths**         | Rejected — entries with absolute paths are refused                     |
| **Total size**             | Max **50 MB** per skill tarball — extraction aborts if exceeded        |
| **File count**             | Max **1,000 files** per skill — extraction aborts if exceeded          |
| **SHA-512 integrity**      | Tarball hash must match the registry record exactly                    |

If any check fails, the partial extraction is cleaned up and the install exits with a non-zero code. Tank will never leave a partially extracted skill on disk.

<Callout type="info">
  These limits are enforced at the tarball level, not just at publish time. Even if a malicious actor somehow bypassed
  the publisher-side limits, the installer enforces them independently.
</Callout>

## Install Location

| Mode            | Location                                                        |
| --------------- | --------------------------------------------------------------- |
| Local (default) | `.tank/skills/@org/skill-name/` (relative to working directory) |
| Global (`-g`)   | `~/.tank/skills/@org/skill-name/`                               |

Agent symlinks are also created so your AI agent runtime can discover installed skills by name without knowing the full path.

## Updating Skills

Update a specific skill to the latest version satisfying its declared range:

```bash
tank update @org/skill-name
```

Update all installed skills:

```bash
tank update
```

Global update:

```bash
tank update @org/skill-name -g
```

`tank update` re-resolves the version range from `tank.json`, downloads the new tarball, verifies integrity, and updates `tank.lock`. It does **not** upgrade beyond the declared version range — use `tank install @org/skill-name '^2.0.0'` to change the range.

## Removing Skills

```bash
tank remove @org/skill-name
tank remove @org/skill-name -g
```

`tank remove` does all of the following in one operation:

1. Removes the entry from `tank.json`
2. Removes the skill and all its exclusive transitive dependencies from `tank.lock`
3. Deletes the extracted files from `.tank/skills/` (or `~/.tank/skills/` for global)
4. Removes any agent symlinks pointing to the removed skill

<Callout type="info">
  Transitive dependencies shared with other installed skills are NOT removed. Tank only removes packages that are
  exclusively required by the skill being removed.
</Callout>

## Verify and Audit

After any change to your install state, confirm integrity:

```bash
# Recompute SHA-512 for every installed file and compare against tank.lock
tank verify

# Show the aggregated permission summary for all installed skills
tank permissions

# Show security scan results for all installed skills
tank audit

# Show security scan results for a specific skill
tank audit @org/skill-name
```

`tank verify` failing means installed files have been modified since they were written. Treat this as a security event — remove and reinstall the affected skills.

`tank permissions` is particularly useful before enabling a new skill in a production agent. It shows you the union of all declared permissions so you can confirm the agent's access is what you expect.

## Discovering Skills

Search the registry:

```bash
tank search "embedding"
tank search "code review"
```

Inspect a specific skill's metadata before installing:

```bash
tank info @org/skill-name
```

`tank info` shows the latest version, description, declared permissions, security scan score, download count, and available version history — without downloading anything.

## Operational Guidance

### CI/CD pipelines

Always use lockfile-mode install in CI:

```bash
# Uses tank.lock exactly — equivalent to npm ci
tank install
```

Never run `tank update` in CI. Updates should be intentional developer actions that produce a reviewed lockfile change.

### Production agents

Run the full verification suite before deploying:

```bash
tank verify
tank permissions
tank audit
```

Gate deployments on `tank verify` exiting with code `0`.

### Prefer pinned versions for production stability

Use exact version pins (`1.2.3`) for skills in production agents. Use ranges (`^1.2.0`) in development where you want compatible updates. The lockfile provides determinism regardless of which you choose, but exact pins make your `tank.json` intent explicit.

## Failure Handling

### Install fails — auth or network

```bash
tank doctor
```

`tank doctor` checks token validity, registry connectivity, and your local config. It prints actionable diagnostics for each check.

### Install fails — integrity mismatch

The downloaded tarball's hash did not match the registry record. This is a hard failure — do not bypass it.

1. Check for an intercepting proxy or corporate firewall modifying HTTPS responses.
2. Retry on a different network.
3. If the problem persists for a specific skill, report it as a potential registry integrity issue.

### Unexpected permission scope after install

```bash
tank info @org/skill-name
tank audit @org/skill-name
```

Review the declared permissions and scanner findings. If the permissions are broader than expected or don't match what the scanner extracted, remove the skill and choose an alternative.

### `tank verify` fails after install

Files were modified on disk after installation. Remove and reinstall:

```bash
tank remove @org/skill-name
tank install @org/skill-name
tank verify
```

If verify fails immediately after reinstall, the issue is likely a proxy or antivirus tool modifying files at write time.
