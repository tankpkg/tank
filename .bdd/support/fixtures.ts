import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface CleanupHandle {
  cleanup: () => Promise<void>;
}

export interface SkillFixture extends CleanupHandle {
  dir: string;
  name: string;
  version: string;
}

export interface ConfigFixture extends CleanupHandle {
  home: string;
  configPath: string;
}

export interface ConsumerProjectFixture extends CleanupHandle {
  dir: string;
}

export function createSkillFixture(options: {
  name: string;
  version: string;
  description?: string;
  files?: Record<string, string>;
}): SkillFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-bdd-skill-'));

  const manifest = {
    name: options.name,
    version: options.version,
    description: options.description ?? `BDD fixture skill ${options.name}`,
  };

  fs.writeFileSync(
    path.join(dir, 'skills.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `# ${options.name}\n\nBDD fixture skill for MCP tests.\n`,
  );

  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `export function run() { return '${options.name}@${options.version}'; }\n`,
  );

  if (options.files) {
    for (const [relativePath, content] of Object.entries(options.files)) {
      const absolutePath = path.join(dir, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
    }
  }

  return {
    dir,
    name: options.name,
    version: options.version,
    cleanup: async () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function createConfigDir(options: {
  token?: string;
  registry?: string;
  user?: { name: string; email: string };
} = {}): ConfigFixture {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-bdd-home-'));
  const tankDir = path.join(home, '.tank');
  const configPath = path.join(tankDir, 'config.json');

  fs.mkdirSync(tankDir, { recursive: true, mode: 0o700 });

  const config: {
    registry: string;
    token?: string;
    user?: { name: string; email: string };
  } = {
    registry: options.registry ?? process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  };

  if (options.token) {
    config.token = options.token;
  }
  if (options.user) {
    config.user = options.user;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });

  return {
    home,
    configPath,
    cleanup: async () => {
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

export function createConsumerProject(): ConsumerProjectFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-bdd-consumer-'));
  const manifest = {
    name: 'tank-bdd-consumer',
    version: '1.0.0',
    skills: {},
    permissions: {
      network: { outbound: [] },
      filesystem: { read: [], write: [] },
      subprocess: false,
    },
  };

  fs.writeFileSync(path.join(dir, 'skills.json'), JSON.stringify(manifest, null, 2) + '\n');

  return {
    dir,
    cleanup: async () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
