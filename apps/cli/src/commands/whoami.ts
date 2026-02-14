import { getConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export interface WhoamiOptions {
  configDir?: string;
}

export async function whoamiCommand(options: WhoamiOptions = {}): Promise<void> {
  const { configDir } = options;
  const config = getConfig(configDir);

  if (!config.token) {
    logger.warn('Not logged in. Run: tank login');
    return;
  }

  try {
    const res = await fetch(`${config.registry}/api/v1/auth/whoami`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'User-Agent': 'tank-cli/0.1.0',
      },
    });

    if (res.status === 401) {
      logger.error('Token is invalid or expired. Run: tank login');
      return;
    }

    if (!res.ok) {
      if (config.user) {
        printUserInfo(config.user);
        logger.warn('Could not verify token with server.');
      } else {
        logger.error('Could not verify token. Server returned an error.');
      }
      return;
    }

    if (config.user) {
      printUserInfo(config.user);
    } else {
      logger.info('Logged in (token verified).');
    }
  } catch {
    if (config.user) {
      logger.info(`Logged in as: ${config.user.name ?? 'unknown'} (offline)`);
      logger.info(`Email: ${config.user.email ?? 'unknown'}`);
      logger.warn('Could not reach server to verify token.');
    } else {
      logger.error('Could not verify token. Check your network connection.');
    }
  }
}

function printUserInfo(user: { name: string; email: string }): void {
  logger.info(`Logged in as: ${user.name ?? 'unknown'}`);
  logger.info(`Email: ${user.email ?? 'unknown'}`);
}
