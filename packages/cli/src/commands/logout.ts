import { getConfig, setConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export interface LogoutOptions {
  configDir?: string;
}

/**
 * Logout command: Remove token and user from config.
 * If not logged in, prints "Not logged in" and returns.
 * If logged in, removes token and user, prints success message.
 */
export async function logoutCommand(options: LogoutOptions = {}): Promise<void> {
  const { configDir } = options;
  const config = getConfig(configDir);

  // Check if logged in
  if (!config.token) {
    logger.warn('Not logged in. Run: tank login');
    return;
  }

  // Remove token and user from config
  setConfig({ token: undefined, user: undefined }, configDir);

  logger.success('Logged out');
}
