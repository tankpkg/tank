/** A pinned, dedicated browser for the CLI login regression; never a user's browser. */
import os from 'node:os';
import path from 'node:path';

import { Browser, computeExecutablePath, install } from '@puppeteer/browsers';

const options = {
  browser: Browser.CHROMEHEADLESSSHELL,
  buildId: '154.0.8037.92',
  cacheDir: path.join(os.homedir(), '.cache', 'going-up-browsers')
};

if (process.argv[2] === '--install') {
  const browser = await install(options);
  process.stdout.write(`${browser.executablePath}\n`);
} else if (process.argv[2] === '--path') {
  process.stdout.write(`${computeExecutablePath(options)}\n`);
} else {
  throw new Error('Expected --install or --path');
}
