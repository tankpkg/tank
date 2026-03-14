import { describe, expect, it } from 'vitest';

import {
  checkPermissionEscalation,
  detectEscalations,
  determineBump,
  parseSemver,
  type VersionPermissions
} from '../permission-escalation';

describe('parseSemver', () => {
  it('parses standard semver', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('parses semver with prerelease suffix', () => {
    expect(parseSemver('2.0.0-beta.1')).toEqual({ major: 2, minor: 0, patch: 0 });
  });

  it('returns null for invalid input', () => {
    expect(parseSemver('not-semver')).toBeNull();
    expect(parseSemver('')).toBeNull();
  });
});

describe('determineBump', () => {
  it('detects major bump', () => {
    expect(determineBump('1.0.0', '2.0.0')).toBe('major');
    expect(determineBump('1.9.9', '2.0.0')).toBe('major');
  });

  it('detects minor bump', () => {
    expect(determineBump('1.0.0', '1.1.0')).toBe('minor');
    expect(determineBump('1.2.3', '1.3.0')).toBe('minor');
  });

  it('detects patch bump', () => {
    expect(determineBump('1.0.0', '1.0.1')).toBe('patch');
    expect(determineBump('1.2.3', '1.2.4')).toBe('patch');
  });

  it('returns unknown for invalid versions', () => {
    expect(determineBump('bad', '1.0.0')).toBe('unknown');
    expect(determineBump('1.0.0', 'bad')).toBe('unknown');
  });

  it('returns unknown for downgrade', () => {
    expect(determineBump('2.0.0', '1.0.0')).toBe('unknown');
    expect(determineBump('1.1.0', '1.0.0')).toBe('unknown');
  });
});

describe('detectEscalations', () => {
  it('returns empty for identical permissions', () => {
    const perms: VersionPermissions = {
      network: { outbound: ['api.example.com'] },
      subprocess: false
    };
    expect(detectEscalations(perms, perms)).toEqual([]);
  });

  it('detects new outbound domains', () => {
    const oldPerms: VersionPermissions = { network: { outbound: ['api.example.com'] } };
    const newPerms: VersionPermissions = { network: { outbound: ['api.example.com', 'evil.com'] } };
    const result = detectEscalations(oldPerms, newPerms);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('network.outbound');
    expect(result[0].requiredBump).toBe('major');
    expect(result[0].description).toContain('evil.com');
  });

  it('detects subprocess escalation from false to true', () => {
    const result = detectEscalations({ subprocess: false }, { subprocess: true });
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('subprocess');
    expect(result[0].requiredBump).toBe('major');
  });

  it('detects subprocess escalation from undefined to true', () => {
    const result = detectEscalations({}, { subprocess: true });
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('subprocess');
  });

  it('does not flag subprocess staying true', () => {
    expect(detectEscalations({ subprocess: true }, { subprocess: true })).toEqual([]);
  });

  it('detects new filesystem write paths', () => {
    const oldPerms: VersionPermissions = { filesystem: { write: ['./output/**'] } };
    const newPerms: VersionPermissions = { filesystem: { write: ['./output/**', '/tmp/**'] } };
    const result = detectEscalations(oldPerms, newPerms);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('filesystem.write');
    expect(result[0].requiredBump).toBe('minor');
  });

  it('detects new filesystem read paths', () => {
    const oldPerms: VersionPermissions = { filesystem: { read: ['./src/**'] } };
    const newPerms: VersionPermissions = { filesystem: { read: ['./src/**', './secrets/**'] } };
    const result = detectEscalations(oldPerms, newPerms);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('filesystem.read');
    expect(result[0].requiredBump).toBe('minor');
  });

  it('detects multiple escalations at once', () => {
    const oldPerms: VersionPermissions = {};
    const newPerms: VersionPermissions = {
      network: { outbound: ['evil.com'] },
      subprocess: true,
      filesystem: { write: ['/etc/**'] }
    };
    const result = detectEscalations(oldPerms, newPerms);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty when permissions are removed', () => {
    const oldPerms: VersionPermissions = {
      network: { outbound: ['api.example.com', 'extra.com'] },
      subprocess: true
    };
    const newPerms: VersionPermissions = {
      network: { outbound: ['api.example.com'] },
      subprocess: false
    };
    expect(detectEscalations(oldPerms, newPerms)).toEqual([]);
  });
});

describe('checkPermissionEscalation', () => {
  it('allows first publish (no previous version scenario handled by caller)', () => {
    const result = checkPermissionEscalation('0.0.0', {}, '1.0.0', { subprocess: true });
    expect(result.allowed).toBe(true);
  });

  it('allows any changes on MAJOR bump', () => {
    const result = checkPermissionEscalation('1.0.0', {}, '2.0.0', {
      network: { outbound: ['evil.com'] },
      subprocess: true
    });
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('rejects dangerous escalation on MINOR bump', () => {
    const result = checkPermissionEscalation('1.0.0', {}, '1.1.0', { network: { outbound: ['evil.com'] } });
    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('MINOR');
    expect(result.violations[0]).toContain('MAJOR');
  });

  it('allows non-dangerous escalation on MINOR bump', () => {
    const result = checkPermissionEscalation('1.0.0', {}, '1.1.0', { filesystem: { write: ['./output/**'] } });
    expect(result.allowed).toBe(true);
  });

  it('rejects subprocess escalation on MINOR bump', () => {
    const result = checkPermissionEscalation('1.0.0', {}, '1.1.0', { subprocess: true });
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('Subprocess');
  });

  it('rejects ANY escalation on PATCH bump', () => {
    const result = checkPermissionEscalation('1.0.0', {}, '1.0.1', { filesystem: { read: ['./new-path/**'] } });
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('PATCH');
  });

  it('allows PATCH with no permission changes', () => {
    const perms: VersionPermissions = { network: { outbound: ['api.example.com'] } };
    const result = checkPermissionEscalation('1.0.0', perms, '1.0.1', perms);
    expect(result.allowed).toBe(true);
  });

  it('allows PATCH when permissions are reduced', () => {
    const result = checkPermissionEscalation(
      '1.0.0',
      { network: { outbound: ['api.example.com', 'extra.com'] } },
      '1.0.1',
      { network: { outbound: ['api.example.com'] } }
    );
    expect(result.allowed).toBe(true);
  });

  it('provides clear error messages with field and required bump', () => {
    const result = checkPermissionEscalation('1.0.0', {}, '1.0.1', {
      network: { outbound: ['evil.com'] },
      subprocess: true
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    for (const v of result.violations) {
      expect(v).toMatch(/PATCH|MINOR|MAJOR/);
    }
  });
});
