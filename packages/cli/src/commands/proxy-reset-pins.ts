import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ProxyResetPinsOptions {
  pinsDir?: string;
  log?: (line: string) => void;
}

function defaultPinsDir(): string {
  return path.join(os.homedir(), '.tank', 'proxy', 'pins');
}

function deletePinFiles(pinsDir: string): number {
  if (!fs.existsSync(pinsDir)) return 0;
  const entries = fs.readdirSync(pinsDir);
  let count = 0;
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    fs.rmSync(path.join(pinsDir, name), { force: true });
    count += 1;
  }
  return count;
}

export function proxyResetPinsCommand(options: ProxyResetPinsOptions = {}): void {
  const pinsDir = options.pinsDir ?? defaultPinsDir();
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const count = deletePinFiles(pinsDir);
  log(`tank proxy: reset ${count} pin file${count === 1 ? '' : 's'} under ${pinsDir}`);
}
