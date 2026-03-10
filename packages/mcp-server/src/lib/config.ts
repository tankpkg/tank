import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TankConfig {
  token?: string;
  user?: { name: string; email: string };
  registry: string;
}

const DEFAULT_CONFIG: TankConfig = {
  registry: 'https://tankpkg.dev'
};

/**
 * Get the path to the tank config directory.
 */
export function getConfigDir(configDir?: string): string {
  return configDir ?? path.join(os.homedir(), '.tank');
}

/**
 * Get the path to the tank config file.
 */
export function getConfigPath(configDir?: string): string {
  return path.join(getConfigDir(configDir), 'config.json');
}

/**
 * Read the tank config file. Returns defaults if file doesn't exist.
 */
export function getConfig(configDir?: string): TankConfig {
  const configPath = getConfigPath(configDir);

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TankConfig>;
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    // TANK_TOKEN env var takes priority
    const envToken = process.env.TANK_TOKEN?.trim();
    if (envToken) {
      merged.token = envToken;
    }
    return merged;
  } catch {
    const envToken = process.env.TANK_TOKEN?.trim();
    return {
      ...DEFAULT_CONFIG,
      ...(envToken ? { token: envToken } : {})
    };
  }
}

/**
 * Write config to disk. Merges with existing config.
 */
export function setConfig(partial: Partial<TankConfig>, configDir?: string): void {
  const dir = getConfigDir(configDir);
  const configPath = getConfigPath(configDir);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const existing = getConfig(configDir);
  const merged = { ...existing, ...partial };

  fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600
  });
}
