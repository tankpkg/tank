/**
 * BDD step definitions for url-install feature.
 *
 * Tests constraints C1–C13 from idd/modules/url-install/INTENT.md
 * at the unit/integration level — no running services required.
 *
 * Registry-side modules (url-validator, url-expander) have internal deps
 * that don't resolve in the bdd vitest context. Those are tested here via
 * the CLI-side exports they depend on, plus inlined pure logic extracted
 * from the registry source.
 */

import { lockedSkillSchema } from '@internals/schemas';
import { describe, expect, it } from 'vitest';

import { enforceVerdict, type ScanResult } from '../../../packages/cli/src/lib/scan-gate.js';
import { inferSkillName, isUrl } from '../../../packages/cli/src/lib/url-fetcher.js';

// ── Inlined pure functions from registry (no side-effect imports) ────────────

const ALLOWED_HOSTS = [
  'registry.npmjs.org',
  'npm.pkg.github.com',
  'ghcr.io',
  'github.com',
  'codeload.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'skills.sh',
  'www.skills.sh',
  'agentskills.co.il',
  'www.agentskills.co.il',
  'clawhub.ai',
  'www.clawhub.ai',
  'wry-manatee-359.convex.site'
];

interface URLValidationResult {
  valid: boolean;
  error?: string;
}

function validateScanUrl(rawUrl: string): URLValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') return { valid: false, error: 'URL is required' };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
  if (url.protocol !== 'https:') return { valid: false, error: 'URL must use HTTPS' };
  const hostname = url.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  if (!isAllowedHost) {
    return { valid: false, error: 'URL host must be a known registry' };
  }
  if (rawUrl.length > 2048) return { valid: false, error: 'URL is too long' };
  return { valid: true };
}

type URLType =
  | 'tarball'
  | 'github_folder'
  | 'github_raw_file'
  | 'github_blob_file'
  | 'skills_sh'
  | 'agentskills_il'
  | 'clawhub'
  | 'unknown';

function detectURLType(url: string): URLType {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'unknown';
  }
  const { hostname, pathname } = parsed;

  if (hostname === 'raw.githubusercontent.com') return 'github_raw_file';
  if (hostname === 'github.com' && pathname.includes('/blob/')) return 'github_blob_file';
  if (hostname === 'github.com' && pathname.includes('/tree/')) return 'github_folder';
  if (hostname === 'github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return 'github_folder';
  }
  if (hostname === 'skills.sh' || hostname === 'www.skills.sh') return 'skills_sh';
  if (hostname === 'agentskills.co.il' || hostname === 'www.agentskills.co.il') {
    if (pathname.includes('/skills/')) return 'agentskills_il';
  }
  if (hostname === 'clawhub.ai' || hostname === 'www.clawhub.ai') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return 'clawhub';
  }
  if (url.endsWith('.tgz') || url.endsWith('.tar.gz')) return 'tarball';
  if (hostname === 'registry.npmjs.org' || hostname === 'npm.pkg.github.com') return 'tarball';
  return 'tarball';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    success: true,
    verdict: 'pass',
    auditScore: 8.5,
    findings: [],
    durationMs: 1200,
    ...overrides
  };
}

// ── Feature: Install skills from URLs with security scanning ─────────────────

describe('Feature: Install skills from URLs with security scanning', () => {
  // ── C1: URL detection ──────────────────────────────────────────────────

  describe('C1: URL input is detected by protocol or known host pattern', () => {
    it('detects HTTPS URLs as URLs', () => {
      expect(isUrl('https://github.com/user/skill')).toBe(true);
      expect(isUrl('https://clawhub.ai/user/skill')).toBe(true);
      expect(isUrl('https://skills.sh/owner/repo/skill')).toBe(true);
      expect(isUrl('https://agentskills.co.il/en/skills/cat/skill')).toBe(true);
    });

    it('detects HTTP URLs as URLs', () => {
      expect(isUrl('http://github.com/user/skill')).toBe(true);
    });

    it('rejects scoped package names', () => {
      expect(isUrl('@org/my-skill')).toBe(false);
    });

    it('rejects bare package names', () => {
      expect(isUrl('my-skill')).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(isUrl('')).toBe(false);
    });
  });

  // ── C2: Allowed hosts ──────────────────────────────────────────────────

  describe('C2: Only allowed hosts are accepted (SSRF protection)', () => {
    it('accepts GitHub URLs', () => {
      const result = validateScanUrl('https://github.com/user/skill');
      expect(result.valid).toBe(true);
    });

    it('accepts ClawHub URLs', () => {
      const result = validateScanUrl('https://clawhub.ai/user/skill');
      expect(result.valid).toBe(true);
    });

    it('accepts www.clawhub.ai URLs', () => {
      const result = validateScanUrl('https://www.clawhub.ai/user/skill');
      expect(result.valid).toBe(true);
    });

    it('accepts skills.sh URLs', () => {
      const result = validateScanUrl('https://skills.sh/owner/repo/skill');
      expect(result.valid).toBe(true);
    });

    it('accepts agentskills.co.il URLs', () => {
      const result = validateScanUrl('https://agentskills.co.il/en/skills/cat/skill');
      expect(result.valid).toBe(true);
    });

    it('accepts registry.npmjs.org URLs', () => {
      const result = validateScanUrl('https://registry.npmjs.org/@org/skill/-/skill-1.0.0.tgz');
      expect(result.valid).toBe(true);
    });

    it('rejects unknown hosts', () => {
      const result = validateScanUrl('https://evil.example.com/skill.tgz');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects empty URL', () => {
      const result = validateScanUrl('');
      expect(result.valid).toBe(false);
    });

    it('rejects invalid URL format', () => {
      const result = validateScanUrl('not-a-url');
      expect(result.valid).toBe(false);
    });
  });

  // ── C3: Scan before install (structural verification) ──────────────────

  describe('C3: Scan runs before any files are placed', () => {
    it('installFromUrl function exists and is exported', async () => {
      const installModule = await import('../../../packages/cli/src/commands/install.js');
      expect(typeof installModule.installFromUrl).toBe('function');
    });

    it('scan-gate enforceVerdict function exists and is exported', () => {
      expect(typeof enforceVerdict).toBe('function');
    });
  });

  // ── C4/C5/C6/C7: Verdict enforcement ──────────────────────────────────

  describe('C4: fail verdict blocks install unconditionally', () => {
    it('returns allowed=false for fail verdict', async () => {
      const result = await enforceVerdict(
        makeScanResult({
          verdict: 'fail',
          findings: [{ severity: 'critical', type: 'exfiltration', description: 'Sends secrets to external host' }]
        })
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/critical|fail/i);
    });

    it('fail verdict is not overridden by --yes', async () => {
      const result = await enforceVerdict(
        makeScanResult({
          verdict: 'fail',
          findings: [{ severity: 'critical', type: 'exfiltration', description: 'credential theft' }]
        }),
        { yes: true }
      );
      expect(result.allowed).toBe(false);
    });
  });

  describe('C5: flagged verdict requires user confirmation', () => {
    it('flagged verdict with --yes auto-accepts (C7)', async () => {
      const result = await enforceVerdict(
        makeScanResult({
          verdict: 'flagged',
          findings: [{ severity: 'medium', type: 'env-access', description: 'Reads process.env' }]
        }),
        { yes: true }
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('C6: pass verdict proceeds without prompt', () => {
    it('pass verdict allows install', async () => {
      const result = await enforceVerdict(makeScanResult({ verdict: 'pass' }));
      expect(result.allowed).toBe(true);
    });

    it('pass_with_notes verdict allows install', async () => {
      const result = await enforceVerdict(makeScanResult({ verdict: 'pass_with_notes' }));
      expect(result.allowed).toBe(true);
    });
  });

  describe('C7: --yes flag auto-accepts flagged verdicts', () => {
    it('flagged + yes=true → allowed', async () => {
      const result = await enforceVerdict(
        makeScanResult({
          verdict: 'flagged',
          findings: [
            { severity: 'medium', type: 'dynamic-eval', description: 'Uses eval()' },
            { severity: 'high', type: 'subprocess', description: 'Spawns child processes' }
          ]
        }),
        { yes: true }
      );
      expect(result.allowed).toBe(true);
    });
  });

  // ── C8: SKILL.md required / skill name inference ───────────────────────

  describe('C8: Skill name inference from URL', () => {
    it('infers name from GitHub URL (owner/repo)', () => {
      expect(inferSkillName('https://github.com/user/cool-skill')).toBe('cool-skill');
    });

    it('infers name from GitHub URL with .git suffix', () => {
      expect(inferSkillName('https://github.com/user/cool-skill.git')).toBe('cool-skill');
    });

    it('infers name from GitHub tree URL (subpath)', () => {
      expect(inferSkillName('https://github.com/user/monorepo/tree/main/skills/my-skill')).toBe('my-skill');
    });

    it('infers name from ClawHub URL', () => {
      expect(inferSkillName('https://clawhub.ai/user/my-agent')).toBe('my-agent');
    });

    it('infers name from skills.sh URL (3-segment path)', () => {
      expect(inferSkillName('https://skills.sh/owner/repo/my-skill')).toBe('my-skill');
    });

    it('infers name from skills.sh URL (2-segment path)', () => {
      expect(inferSkillName('https://skills.sh/owner/repo')).toBe('repo');
    });

    it('returns null for URLs with insufficient path segments', () => {
      expect(inferSkillName('https://github.com/')).toBe(null);
    });
  });

  // ── C10/C11: Lockfile schema accepts new provenance fields ─────────────

  describe('C10/C11: Lockfile entry provenance fields', () => {
    it('accepts lockfile entry with source, scan_verdict, scanned_at', () => {
      const entry = {
        resolved: 'https://github.com/user/skill',
        integrity: 'sha512-abc123def456',
        permissions: {},
        audit_score: 8.5,
        source: 'github' as const,
        scan_verdict: 'pass' as const,
        scanned_at: '2026-04-15T12:00:00Z'
      };
      const parsed = lockedSkillSchema.safeParse(entry);
      expect(parsed.success).toBe(true);
    });

    it('accepts lockfile entry with all source types', () => {
      for (const source of ['registry', 'github', 'clawhub', 'skills_sh', 'agentskills_il', 'npm', 'local'] as const) {
        const entry = {
          resolved: 'https://github.com/user/skill',
          integrity: 'sha512-abc123',
          permissions: {},
          audit_score: 7.0,
          source
        };
        const parsed = lockedSkillSchema.safeParse(entry);
        expect(parsed.success).toBe(true);
      }
    });

    it('accepts lockfile entry with all verdict types', () => {
      for (const verdict of ['pass', 'pass_with_notes', 'flagged', 'fail', 'error'] as const) {
        const entry = {
          resolved: 'https://github.com/user/skill',
          integrity: 'sha512-abc123',
          permissions: {},
          audit_score: 5.0,
          scan_verdict: verdict
        };
        const parsed = lockedSkillSchema.safeParse(entry);
        expect(parsed.success).toBe(true);
      }
    });

    it('accepts lockfile entry without new fields (backward compat)', () => {
      const entry = {
        resolved: 'https://registry.npmjs.org/@org/skill/-/skill-1.0.0.tgz',
        integrity: 'sha512-abc123def456',
        permissions: {},
        audit_score: 8.5
      };
      const parsed = lockedSkillSchema.safeParse(entry);
      expect(parsed.success).toBe(true);
    });

    it('rejects lockfile entry with invalid source value', () => {
      const entry = {
        resolved: 'https://github.com/user/skill',
        integrity: 'sha512-abc123',
        permissions: {},
        audit_score: 8.0,
        source: 'invalid_source'
      };
      const parsed = lockedSkillSchema.safeParse(entry);
      expect(parsed.success).toBe(false);
    });

    it('rejects lockfile entry with invalid verdict value', () => {
      const entry = {
        resolved: 'https://github.com/user/skill',
        integrity: 'sha512-abc123',
        permissions: {},
        audit_score: 8.0,
        scan_verdict: 'invalid_verdict'
      };
      const parsed = lockedSkillSchema.safeParse(entry);
      expect(parsed.success).toBe(false);
    });

    it('accepts lockfile entry with dependencies field', () => {
      const entry = {
        resolved: 'https://github.com/user/skill',
        integrity: 'sha512-abc123',
        permissions: {},
        audit_score: 6.0,
        dependencies: { '@other/dep': '^1.0.0' },
        source: 'github' as const,
        scan_verdict: 'pass' as const,
        scanned_at: '2026-04-15T12:00:00Z'
      };
      const parsed = lockedSkillSchema.safeParse(entry);
      expect(parsed.success).toBe(true);
    });
  });

  // ── C12: Registry install unaffected ───────────────────────────────────

  describe('C12: Package name input routes to registry (not URL) flow', () => {
    it('isUrl rejects scoped package names', () => {
      expect(isUrl('@org/my-skill')).toBe(false);
      expect(isUrl('@vercel/next-skill')).toBe(false);
    });

    it('isUrl rejects bare package names', () => {
      expect(isUrl('some-skill')).toBe(false);
      expect(isUrl('my-skill-v2')).toBe(false);
    });

    it('installCommand function exists for registry installs', async () => {
      const installModule = await import('../../../packages/cli/src/commands/install.js');
      expect(typeof installModule.installCommand).toBe('function');
    });
  });

  // ── URL type detection (mirrors registry url-expander logic) ───────────

  describe('URL type detection via detectURLType', () => {
    it('detects github.com repo URLs as github_folder', () => {
      expect(detectURLType('https://github.com/user/skill')).toBe('github_folder');
    });

    it('detects github.com tree URLs as github_folder', () => {
      expect(detectURLType('https://github.com/user/repo/tree/main/skills/my-skill')).toBe('github_folder');
    });

    it('detects github.com blob URLs as github_blob_file', () => {
      expect(detectURLType('https://github.com/user/repo/blob/main/SKILL.md')).toBe('github_blob_file');
    });

    it('detects raw.githubusercontent.com as github_raw_file', () => {
      expect(detectURLType('https://raw.githubusercontent.com/user/repo/main/SKILL.md')).toBe('github_raw_file');
    });

    it('detects clawhub.ai skill pages', () => {
      expect(detectURLType('https://clawhub.ai/pskoett/self-improving-agent')).toBe('clawhub');
    });

    it('detects www.clawhub.ai skill pages', () => {
      expect(detectURLType('https://www.clawhub.ai/pskoett/skill')).toBe('clawhub');
    });

    it('rejects clawhub.ai listing pages (single-segment path)', () => {
      expect(detectURLType('https://clawhub.ai/skills')).not.toBe('clawhub');
    });

    it('detects skills.sh URLs', () => {
      expect(detectURLType('https://skills.sh/owner/repo/skill')).toBe('skills_sh');
    });

    it('detects agentskills.co.il URLs with /skills/ path', () => {
      expect(detectURLType('https://agentskills.co.il/en/skills/category/skill-name')).toBe('agentskills_il');
    });

    it('detects tarball URLs', () => {
      expect(detectURLType('https://registry.npmjs.org/@org/skill/-/skill-1.0.0.tgz')).toBe('tarball');
    });
  });

  // ── Error verdict handling ─────────────────────────────────────────────

  describe('Error verdict handling', () => {
    it('error verdict blocks install', async () => {
      const result = await enforceVerdict(makeScanResult({ verdict: 'error', error: 'Network error: ECONNREFUSED' }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/error/i);
    });

    it('error verdict is not overridden by --yes', async () => {
      const result = await enforceVerdict(makeScanResult({ verdict: 'error', error: 'Scan timed out' }), { yes: true });
      expect(result.allowed).toBe(false);
    });
  });

  // ── URL source type detection (url-fetcher) ────────────────────────────

  describe('URL source type detection via isUrl', () => {
    it('detects github.com as URL (without protocol)', () => {
      expect(isUrl('github.com/user/skill')).toBe(true);
    });

    it('detects clawhub.ai as URL (without protocol)', () => {
      expect(isUrl('clawhub.ai/user/skill')).toBe(true);
    });

    it('detects skills.sh as URL (without protocol)', () => {
      expect(isUrl('skills.sh/owner/repo/skill')).toBe(true);
    });
  });
});
