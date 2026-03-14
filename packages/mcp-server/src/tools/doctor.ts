import fs from 'node:fs';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { TankApiClient } from '~/lib/api-client.js';
import { getConfig, getConfigPath } from '~/lib/config.js';

const MIN_NODE_MAJOR = 24;

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL';
  message: string;
}

function checkConfigFile(): CheckResult {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return {
      name: 'Configuration File',
      status: 'FAIL',
      message: `Configuration file not found at ${configPath}. Run the login tool to create it.`
    };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    JSON.parse(raw);
    return {
      name: 'Configuration File',
      status: 'PASS',
      message: `Configuration file exists and is valid JSON (${configPath}).`
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      name: 'Configuration File',
      status: 'FAIL',
      message: `Configuration file at ${configPath} is malformed: ${detail}`
    };
  }
}

async function checkAuthentication(): Promise<CheckResult> {
  const client = new TankApiClient();

  if (!client.isAuthenticated) {
    return {
      name: 'Authentication',
      status: 'FAIL',
      message: 'Not authenticated. Use the login tool to authenticate with Tank.'
    };
  }

  const authCheck = await client.verifyAuth();

  if (authCheck.valid) {
    const name = authCheck.user.name ?? 'unknown';
    return {
      name: 'Authentication',
      status: 'PASS',
      message: `Authenticated as ${name}.`
    };
  }

  if (authCheck.reason === 'network-error') {
    return {
      name: 'Authentication',
      status: 'FAIL',
      message: `Could not verify credentials (network error). ${authCheck.error ?? ''}`.trim()
    };
  }

  return {
    name: 'Authentication',
    status: 'FAIL',
    message: 'Credentials are expired or invalid. Use the login tool to re-authenticate.'
  };
}

async function checkRegistryConnectivity(): Promise<CheckResult> {
  const config = getConfig();
  const registryUrl = config.registry;

  try {
    const healthUrl = `${registryUrl}/api/health`;
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(10_000)
    });

    if (response.ok) {
      return {
        name: 'Registry Connectivity',
        status: 'PASS',
        message: `Registry at ${registryUrl} is reachable.`
      };
    }

    return {
      name: 'Registry Connectivity',
      status: 'FAIL',
      message: `Registry at ${registryUrl} returned HTTP ${response.status}.`
    };
  } catch {
    return {
      name: 'Registry Connectivity',
      status: 'FAIL',
      message: `Cannot reach registry at ${registryUrl}. Check your network connection.`
    };
  }
}

function checkNodeVersion(): CheckResult {
  const raw = process.version;
  const match = raw.match(/^v(\d+)/);
  const major = match ? Number.parseInt(match[1], 10) : 0;

  if (major >= MIN_NODE_MAJOR) {
    return {
      name: 'Node.js Version',
      status: 'PASS',
      message: `Node.js ${raw} meets the minimum requirement (v${MIN_NODE_MAJOR}.0.0).`
    };
  }

  return {
    name: 'Node.js Version',
    status: 'FAIL',
    message: `Node.js ${raw} is below the minimum required version v${MIN_NODE_MAJOR}.0.0. Please upgrade Node.js.`
  };
}

function formatChecks(checks: CheckResult[]): string {
  const lines: string[] = [];

  lines.push('Tank Doctor Report');
  lines.push('==================');
  lines.push('');

  for (const check of checks) {
    const icon = check.status === 'PASS' ? 'PASS' : 'FAIL';
    lines.push(`[${icon}] ${check.name}`);
    lines.push(`      ${check.message}`);
  }

  lines.push('');

  const failedChecks = checks.filter((c) => c.status === 'FAIL');
  const allPassed = failedChecks.length === 0;

  if (allPassed) {
    lines.push('All checks passed. Your Tank environment is ready to use.');
  } else {
    lines.push('Suggestions:');
    for (const check of failedChecks) {
      if (check.name === 'Authentication') {
        lines.push('  - Use the login tool to authenticate with Tank.');
      } else if (check.name === 'Registry Connectivity') {
        lines.push('  - Check your network connection and verify the registry URL.');
      } else if (check.name === 'Node.js Version') {
        lines.push(`  - Upgrade Node.js to v${MIN_NODE_MAJOR}.0.0 or later.`);
      } else if (check.name === 'Configuration File') {
        lines.push('  - Use the login tool to create a valid configuration file.');
      }
    }
    lines.push('');
    lines.push('The environment is not healthy. Please address the issues above.');
  }

  return lines.join('\n');
}

export function registerDoctorTool(server: McpServer): void {
  server.tool('doctor', 'Diagnose Tank setup and environment.', {}, async () => {
    const checks: CheckResult[] = [];

    checks.push(checkConfigFile());
    checks.push(await checkAuthentication());
    checks.push(await checkRegistryConnectivity());
    checks.push(checkNodeVersion());

    return {
      content: [{ type: 'text' as const, text: formatChecks(checks) }]
    };
  });
}
