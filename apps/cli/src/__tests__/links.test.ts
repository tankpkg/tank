import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createEmptyManifest,
  readLinks,
  writeLinks,
  readLocalLinks,
  readGlobalLinks,
  addLink,
  removeLink,
  getLinksForSkill,
  addAgentLink,
  removeAgentLink,
  type LinksManifest,
  type LinkEntry,
} from '../lib/links.js';

const sampleEntry = (overrides?: Partial<LinkEntry>): LinkEntry => ({
  source: 'local',
  sourceDir: '/tmp/skills/example',
  installedAt: '2026-02-15T10:00:00.000Z',
  agentLinks: {},
  ...overrides,
});

describe('readLinks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-links-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty manifest when directory does not exist', () => {
    const result = readLinks(path.join(tmpDir, 'missing'));
    expect(result).toEqual({ version: 1, links: {} });
  });

  it('returns empty manifest when links.json is missing', () => {
    const linksDir = path.join(tmpDir, 'links');
    fs.mkdirSync(linksDir, { recursive: true });
    const result = readLinks(linksDir);
    expect(result).toEqual({ version: 1, links: {} });
  });

  it('returns parsed manifest when valid', () => {
    const linksDir = path.join(tmpDir, 'links');
    fs.mkdirSync(linksDir, { recursive: true });
    const manifest: LinksManifest = {
      version: 1,
      links: {
        '@org/skill': sampleEntry({ agentLinks: { agentA: '/tmp/agentA' } }),
      },
    };
    fs.writeFileSync(
      path.join(linksDir, 'links.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );

    const result = readLinks(linksDir);
    expect(result).toEqual(manifest);
  });

  it('returns empty manifest on corrupt JSON', () => {
    const linksDir = path.join(tmpDir, 'links');
    fs.mkdirSync(linksDir, { recursive: true });
    fs.writeFileSync(path.join(linksDir, 'links.json'), '{not valid json!!!');
    const result = readLinks(linksDir);
    expect(result).toEqual({ version: 1, links: {} });
  });
});

describe('writeLinks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-links-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes valid JSON with trailing newline', () => {
    const manifest = createEmptyManifest();
    writeLinks(tmpDir, manifest);
    const raw = fs.readFileSync(path.join(tmpDir, 'links.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw)).toEqual(manifest);
  });

  it('sorts skill keys alphabetically', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'z-skill': sampleEntry(),
        'a-skill': sampleEntry(),
        'middle-skill': sampleEntry(),
      },
    };

    writeLinks(tmpDir, manifest);
    const raw = fs.readFileSync(path.join(tmpDir, 'links.json'), 'utf-8');
    const parsed = JSON.parse(raw) as LinksManifest;
    expect(Object.keys(parsed.links)).toEqual(['a-skill', 'middle-skill', 'z-skill']);
  });

  it('sorts agent link keys alphabetically', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'alpha-skill': sampleEntry({
          agentLinks: {
            zeta: '/tmp/zeta',
            alpha: '/tmp/alpha',
            middle: '/tmp/middle',
          },
        }),
      },
    };

    writeLinks(tmpDir, manifest);
    const raw = fs.readFileSync(path.join(tmpDir, 'links.json'), 'utf-8');
    const parsed = JSON.parse(raw) as LinksManifest;
    expect(Object.keys(parsed.links['alpha-skill'].agentLinks)).toEqual([
      'alpha',
      'middle',
      'zeta',
    ]);
  });

  it('produces deterministic output (same input → same bytes)', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'b-skill': sampleEntry({ agentLinks: { b: '/tmp/b' } }),
        'a-skill': sampleEntry({ agentLinks: { a: '/tmp/a' } }),
      },
    };

    writeLinks(tmpDir, manifest);
    const first = fs.readFileSync(path.join(tmpDir, 'links.json'), 'utf-8');

    writeLinks(tmpDir, manifest);
    const second = fs.readFileSync(path.join(tmpDir, 'links.json'), 'utf-8');

    expect(first).toBe(second);
  });

  it('creates directory if it does not exist', () => {
    const linksDir = path.join(tmpDir, 'nested', 'links');
    const manifest = createEmptyManifest();

    writeLinks(linksDir, manifest);
    const raw = fs.readFileSync(path.join(linksDir, 'links.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual(manifest);
  });
});

describe('readLocalLinks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-links-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns manifest from .tank/links.json', () => {
    const tankDir = path.join(tmpDir, '.tank');
    fs.mkdirSync(tankDir, { recursive: true });
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'local-skill': sampleEntry(),
      },
    };
    fs.writeFileSync(
      path.join(tankDir, 'links.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );

    const result = readLocalLinks(tmpDir);
    expect(result).toEqual(manifest);
  });

  it('returns empty manifest if .tank directory does not exist', () => {
    const result = readLocalLinks(tmpDir);
    expect(result).toEqual({ version: 1, links: {} });
  });
});

describe('readGlobalLinks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-links-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns manifest from ~/.tank/links.json using homedir param', () => {
    const homeDir = path.join(tmpDir, 'home');
    const tankDir = path.join(homeDir, '.tank');
    fs.mkdirSync(tankDir, { recursive: true });
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'global-skill': sampleEntry(),
      },
    };
    fs.writeFileSync(
      path.join(tankDir, 'links.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );

    const result = readGlobalLinks(homeDir);
    expect(result).toEqual(manifest);
  });

  it('returns empty manifest if ~/.tank directory does not exist', () => {
    const homeDir = path.join(tmpDir, 'missing-home');
    const result = readGlobalLinks(homeDir);
    expect(result).toEqual({ version: 1, links: {} });
  });
});

describe('addLink', () => {
  it('adds new skill entry', () => {
    const manifest = createEmptyManifest();
    const entry = sampleEntry();

    const updated = addLink(manifest, 'new-skill', entry);
    expect(updated.links['new-skill']).toEqual(entry);
  });

  it('replaces existing skill entry', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'replace-skill': sampleEntry({ sourceDir: '/tmp/old' }),
      },
    };

    const updated = addLink(
      manifest,
      'replace-skill',
      sampleEntry({ sourceDir: '/tmp/new' }),
    );

    expect(updated.links['replace-skill'].sourceDir).toBe('/tmp/new');
  });

  it('does not mutate original manifest', () => {
    const manifest = createEmptyManifest();
    const updated = addLink(manifest, 'new-skill', sampleEntry());

    expect(manifest.links).toEqual({});
    expect(updated).not.toBe(manifest);
    expect(updated.links).not.toBe(manifest.links);
  });
});

describe('removeLink', () => {
  it('removes existing skill entry', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'remove-skill': sampleEntry(),
      },
    };

    const updated = removeLink(manifest, 'remove-skill');
    expect(updated.links).toEqual({});
  });

  it('returns unchanged copy if skill not found', () => {
    const manifest = createEmptyManifest();
    const updated = removeLink(manifest, 'missing-skill');

    expect(updated).toEqual(manifest);
    expect(updated).not.toBe(manifest);
  });

  it('does not mutate original manifest', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'keep-skill': sampleEntry(),
      },
    };

    const updated = removeLink(manifest, 'keep-skill');
    expect(manifest.links).toEqual({ 'keep-skill': sampleEntry() });
    expect(updated.links).toEqual({});
  });
});

describe('getLinksForSkill', () => {
  it('returns entry for existing skill', () => {
    const entry = sampleEntry();
    const manifest: LinksManifest = {
      version: 1,
      links: { 'existing-skill': entry },
    };

    expect(getLinksForSkill(manifest, 'existing-skill')).toEqual(entry);
  });

  it('returns undefined for missing skill', () => {
    const manifest = createEmptyManifest();
    expect(getLinksForSkill(manifest, 'missing-skill')).toBeUndefined();
  });
});

describe('addAgentLink / removeAgentLink', () => {
  it('adds agent link to existing skill', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'skill-a': sampleEntry({ agentLinks: { alpha: '/tmp/alpha' } }),
      },
    };

    const updated = addAgentLink(manifest, 'skill-a', 'beta', '/tmp/beta');
    expect(updated.links['skill-a'].agentLinks).toEqual({
      alpha: '/tmp/alpha',
      beta: '/tmp/beta',
    });
  });

  it('creates skill entry when missing', () => {
    const manifest = createEmptyManifest();
    const updated = addAgentLink(manifest, 'new-skill', 'agent1', '/tmp/agent1');

    const entry = updated.links['new-skill'];
    expect(entry.agentLinks).toEqual({ agent1: '/tmp/agent1' });
    expect(entry.source).toBe('local');
    expect(entry.sourceDir).toBe(process.cwd());
    expect(Number.isNaN(Date.parse(entry.installedAt))).toBe(false);
  });

  it('removes agent link from skill', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'skill-a': sampleEntry({ agentLinks: { alpha: '/tmp/alpha', beta: '/tmp/beta' } }),
      },
    };

    const updated = removeAgentLink(manifest, 'skill-a', 'alpha');
    expect(updated.links['skill-a'].agentLinks).toEqual({ beta: '/tmp/beta' });
  });

  it('removes entire skill entry when last agent link is removed', () => {
    const manifest: LinksManifest = {
      version: 1,
      links: {
        'skill-a': sampleEntry({ agentLinks: { alpha: '/tmp/alpha' } }),
      },
    };

    const updated = removeAgentLink(manifest, 'skill-a', 'alpha');
    expect(updated.links).toEqual({});
  });
});
