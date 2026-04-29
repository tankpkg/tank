import { describe, expect, it } from 'vitest';
import { scanForCredentialLeak } from '~/scanner/credential-leak.js';

describe('scanForCredentialLeak — C23/C25/C25a gate at ≥4.5 bits/char entropy', () => {
  it('returns matched=false for benign text', () => {
    const result = scanForCredentialLeak('Code reviews require two approvals.');
    expect(result.matched).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it('returns matched=false for empty input', () => {
    expect(scanForCredentialLeak('').matched).toBe(false);
  });

  it('does NOT flag the AWS documentation example (entropy < 4.5)', () => {
    const result = scanForCredentialLeak('aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
    expect(result.matched).toBe(false);
  });

  it('flags a realistic AWS access key (entropy ≥ 4.5)', () => {
    const result = scanForCredentialLeak('aws_access_key_id = AKIA8F3DL2NXRZ0Q7W2X');
    expect(result.matched).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it('flags a GitHub Personal Access Token', () => {
    const result = scanForCredentialLeak('export GH_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890');
    expect(result.matched).toBe(true);
  });

  it('returns patternId on each match so audit entries can reference it', () => {
    const result = scanForCredentialLeak('aws_access_key_id = AKIA8F3DL2NXRZ0Q7W2X');
    expect(result.matches[0]).toHaveProperty('patternId');
    expect(typeof result.matches[0]!.patternId).toBe('string');
  });

  it('delegates to helper strict-mode per-pattern entropy gates (C25a)', () => {
    const result = scanForCredentialLeak('AKIA8F3DL2NXRZ0Q7W2X');
    expect(result.matched).toBe(true);
  });

  it('scans multi-line text with credential embedded among other content', () => {
    const text = `
      # Configuration file
      Project: my-project
      aws_access_key_id = AKIA8F3DL2NXRZ0Q7W2X
      database_url = postgres://localhost:5432/app
    `;
    const result = scanForCredentialLeak(text);
    expect(result.matched).toBe(true);
  });
});
