import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

import { getConfig, setConfig } from '~/lib/config.js';
import { VERSION } from '~/version.js';

const POSTHOG_PROJECT_KEY = process.env.TANK_POSTHOG_KEY ?? '';
const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';

interface TelemetryStatus {
  enabled: boolean;
  reason: 'env-off' | 'env-on' | 'config' | 'default-off' | 'onprem' | 'no-key';
}

function getHost(): string {
  return process.env.TANK_TELEMETRY_HOST ?? POSTHOG_DEFAULT_HOST;
}

function isSelfhosted(): boolean {
  return process.env.TANK_MODE === 'selfhosted';
}

export function getTelemetryStatus(configDir?: string): TelemetryStatus {
  if (isSelfhosted()) return { enabled: false, reason: 'onprem' };
  if (!POSTHOG_PROJECT_KEY) return { enabled: false, reason: 'no-key' };

  const env = process.env.TANK_TELEMETRY?.trim();
  if (env === '0' || env === 'false' || env === 'off') {
    return { enabled: false, reason: 'env-off' };
  }
  if (env === '1' || env === 'true' || env === 'on') {
    return { enabled: true, reason: 'env-on' };
  }

  const cfg = getConfig(configDir);
  if (cfg.telemetry === true) return { enabled: true, reason: 'config' };
  return { enabled: false, reason: 'default-off' };
}

function getOrCreateDistinctId(configDir?: string): string {
  const cfg = getConfig(configDir);
  if (cfg.telemetryDistinctId) return cfg.telemetryDistinctId;
  const id = randomUUID();
  setConfig({ telemetryDistinctId: id }, configDir);
  return id;
}

export function setTelemetry(enabled: boolean, configDir?: string): void {
  setConfig({ telemetry: enabled }, configDir);
}

export interface TelemetryEvent {
  event: string;
  properties?: Record<string, unknown>;
}

export function captureEvent(evt: TelemetryEvent, configDir?: string): void {
  const status = getTelemetryStatus(configDir);
  if (!status.enabled) return;

  const distinctId = getOrCreateDistinctId(configDir);
  const payload = {
    api_key: POSTHOG_PROJECT_KEY,
    event: evt.event,
    distinct_id: distinctId,
    properties: {
      ...evt.properties,
      cli_version: VERSION,
      platform: process.platform,
      node_version: process.versions.node,
      $lib: 'tank-cli'
    },
    timestamp: new Date().toISOString()
  };

  const url = `${getHost()}/i/v0/e/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
}

export function describeTelemetryState(configDir?: string): string {
  const status = getTelemetryStatus(configDir);
  if (status.reason === 'onprem') return 'Telemetry: disabled (on-prem mode)';
  if (status.reason === 'no-key') return 'Telemetry: disabled (no key compiled in this build)';
  if (status.reason === 'env-off') return 'Telemetry: disabled (overridden by TANK_TELEMETRY env var)';
  if (status.reason === 'env-on') return 'Telemetry: enabled (overridden by TANK_TELEMETRY env var)';
  if (status.reason === 'config') return 'Telemetry: enabled';
  return 'Telemetry: disabled. Run `tank telemetry on` to opt in.';
}

/**
 * Prompt the user once for telemetry consent on first interactive use.
 * Skipped if: a decision is already recorded, no TTY (CI), on-prem, no key compiled.
 * The decision (true or false) is persisted to config so we never prompt again.
 */
export async function maybePromptForTelemetryConsent(configDir?: string): Promise<void> {
  if (isSelfhosted()) return;
  if (!POSTHOG_PROJECT_KEY) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  if (process.env.CI || process.env.TANK_TELEMETRY) return;

  const cfg = getConfig(configDir);
  if (typeof cfg.telemetry === 'boolean') return;

  const answer = await askYesNo(
    'Help improve Tank by sending anonymous usage analytics? (No package names, paths, or keys are ever sent.)'
  );
  setConfig({ telemetry: answer }, configDir);
  if (answer) {
    captureEvent({ event: 'cli_opted_in', properties: { source: 'first-run-prompt' } }, configDir);
    process.stderr.write('Telemetry: enabled. Disable any time with `tank telemetry off`.\n');
  } else {
    process.stderr.write('Telemetry: disabled. Re-enable any time with `tank telemetry on`.\n');
  }
}

function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(`${question} [y/N] `, (raw) => {
      rl.close();
      const a = raw.trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}
