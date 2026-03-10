import pkg from '../package.json' with { type: 'json' };

export const VERSION = pkg.version ?? '0.0.0';
export const USER_AGENT = `tank-cli/${VERSION}`;
