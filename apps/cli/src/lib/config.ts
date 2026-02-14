import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface TankConfig {
  token?: string;
  user?: { name: string; email: string };
  registry: string;
}

const DEFAULT_CONFIG: TankConfig = {
  registry: 'https://tankpkg.dev',
};

/**
 * Get the path to the tank config directory.
 * Override with configDir parameter for testing.
 */
export function getConfigDir(configDir?: string): string {
  return configDir ?? path.join(os.homedir(), '.tank');
}

/**
 * Get the path to the tank config file.
 * Override with configDir parameter for testing.
 */
export function getConfigPath(configDir?: string): string {
  return path.join(getConfigDir(configDir), 'config.json');
}

/**
 * Read the tank config file. Returns defaults if file doesn't exist.
 * Override configDir for testing (avoids writing to real ~/.tank/).
 */
export function getConfig(configDir?: string): TankConfig {
  const configPath = getConfigPath(configDir);

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TankConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write config to disk. Merges with existing config.
 * Creates ~/.tank/ directory if it doesn't exist.
 * Sets file permissions to 0600 (owner read/write only) on Unix.
 */
export function setConfig(
  partial: Partial<TankConfig>,
  configDir?: string,
): void {
  const dir = getConfigDir(configDir);
  const configPath = getConfigPath(configDir);

  // Create directory with 0700 permissions if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Merge with existing config
  const existing = getConfig(configDir);
  const merged = { ...existing, ...partial };

  // Write config file
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}
