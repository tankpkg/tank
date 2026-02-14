import open from 'open';
import { getConfig, setConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface LoginOptions {
  configDir?: string;
  timeout?: number;
  pollInterval?: number;
}

/**
 * Start the CLI login flow:
 * 1. Generate random state
 * 2. POST /api/v1/cli-auth/start → get authUrl + sessionCode
 * 3. Open browser to authUrl
 * 4. Poll POST /api/v1/cli-auth/exchange until authorized or timeout
 * 5. Write token + user to config
 */
export async function loginCommand(options: LoginOptions = {}): Promise<void> {
  const {
    configDir,
    timeout = DEFAULT_TIMEOUT_MS,
    pollInterval = DEFAULT_POLL_INTERVAL_MS,
  } = options;
  const config = getConfig(configDir);
  const baseUrl = config.registry;

  // Step 1: Generate random state for CSRF protection
  const state = crypto.randomUUID();

  // Step 2: Start auth session
  logger.info('Starting login...');

  const startRes = await fetch(`${baseUrl}/api/v1/cli-auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });

  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    throw new Error(
      `Failed to start auth session: ${(body as { error?: string }).error ?? startRes.statusText}`,
    );
  }

  const { authUrl, sessionCode } = (await startRes.json()) as {
    authUrl: string;
    sessionCode: string;
  };

  // Step 3: Open browser
  try {
    await open(authUrl);
    logger.info('Opened browser for authentication.');
  } catch {
    // Browser failed to open — print URL for manual copy
    logger.warn('Could not open browser automatically.');
    logger.info(`Open this URL in your browser:\n  ${authUrl}`);
  }

  logger.info('Waiting for authorization...');

  // Step 4: Poll exchange endpoint
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const exchangeRes = await fetch(`${baseUrl}/api/v1/cli-auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCode, state }),
      });

      if (exchangeRes.ok) {
        const { token, user } = (await exchangeRes.json()) as {
          token: string;
          user: { name: string | null; email: string | null };
        };

        // Step 5: Write to config
        setConfig({ token, user: user as { name: string; email: string } }, configDir);

        const displayName = user.name ?? user.email ?? 'unknown';
        logger.success(`Logged in as ${displayName}`);
        return;
      }

      // 400 means session not yet authorized — keep polling
      // Any other error is unexpected
      if (exchangeRes.status !== 400) {
        const body = await exchangeRes.json().catch(() => ({}));
        throw new Error(
          `Exchange failed: ${(body as { error?: string }).error ?? exchangeRes.statusText}`,
        );
      }
    } catch (err) {
      // If it's our own thrown error, re-throw
      if (err instanceof Error && err.message.startsWith('Exchange failed:')) {
        throw err;
      }
      // Network errors during polling are transient — keep trying
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error('Login timed out. Please try again.');
}
