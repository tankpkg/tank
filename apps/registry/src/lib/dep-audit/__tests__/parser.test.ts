import { describe, expect, it } from 'vitest';
import { detectEcosystem, parseDependencies } from '../parser';

describe('parseDependencies', () => {
  it('returns empty array for empty manifest', () => {
    const result = parseDependencies({});
    expect(result).toEqual([]);
  });

  it('extracts npm dependencies from package.json-style manifest', () => {
    const manifest = {
      dependencies: {
        lodash: '^4.17.21',
        express: '~4.18.0'
      },
      devDependencies: {
        typescript: '>=5.0.0'
      }
    };

    const result = parseDependencies(manifest);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'lodash', version: '4.17.21', ecosystem: 'npm' });
    expect(result[1]).toEqual({ name: 'express', version: '4.18.0', ecosystem: 'npm' });
    expect(result[2]).toEqual({ name: 'typescript', version: '5.0.0', ecosystem: 'npm' });
  });

  it('extracts Python dependencies from requirements.txt in files', () => {
    const manifest = {
      files: {
        'requirements.txt': 'flask==2.3.0\nrequests>=2.28.0\n# comment\n\nnumpy'
      }
    };

    const result = parseDependencies(manifest);

    expect(result).toHaveLength(3);
    expect(result.find((d) => d.name === 'flask')).toEqual({
      name: 'flask',
      version: '2.3.0',
      ecosystem: 'pypi'
    });
    expect(result.find((d) => d.name === 'requests')).toEqual({
      name: 'requests',
      version: '2.28.0',
      ecosystem: 'pypi'
    });
    expect(result.find((d) => d.name === 'numpy')).toEqual({
      name: 'numpy',
      version: '*',
      ecosystem: 'pypi'
    });
  });

  it('handles mixed npm + pypi dependencies', () => {
    const manifest = {
      dependencies: { react: '^18.0.0' },
      files: {
        'requirements.txt': 'flask==2.0.0'
      }
    };

    const result = parseDependencies(manifest);
    expect(result).toHaveLength(2);

    const npmDeps = result.filter((d) => d.ecosystem === 'npm');
    const pypiDeps = result.filter((d) => d.ecosystem === 'pypi');
    expect(npmDeps).toHaveLength(1);
    expect(pypiDeps).toHaveLength(1);
  });

  it('deduplicates packages by name + ecosystem', () => {
    const manifest = {
      dependencies: { lodash: '^4.17.0' },
      devDependencies: { lodash: '^4.17.21' }
    };

    const result = parseDependencies(manifest);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('lodash');
  });

  it('handles manifest with no dependencies section', () => {
    const manifest = { name: 'my-skill', version: '1.0.0' };
    const result = parseDependencies(manifest);
    expect(result).toEqual([]);
  });
});

describe('detectEcosystem', () => {
  it('returns "none" for empty deps', () => {
    expect(detectEcosystem([])).toBe('none');
  });

  it('returns "npm" for npm-only deps', () => {
    const deps = [{ name: 'lodash', version: '4.0.0', ecosystem: 'npm' as const }];
    expect(detectEcosystem(deps)).toBe('npm');
  });

  it('returns "pypi" for pypi-only deps', () => {
    const deps = [{ name: 'flask', version: '2.0.0', ecosystem: 'pypi' as const }];
    expect(detectEcosystem(deps)).toBe('pypi');
  });

  it('returns "mixed" for mixed ecosystems', () => {
    const deps = [
      { name: 'lodash', version: '4.0.0', ecosystem: 'npm' as const },
      { name: 'flask', version: '2.0.0', ecosystem: 'pypi' as const }
    ];
    expect(detectEcosystem(deps)).toBe('mixed');
  });
});
