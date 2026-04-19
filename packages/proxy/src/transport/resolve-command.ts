import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

export function resolveCommandPath(command: string, cwd: string = process.cwd()): string {
  if (isAbsolute(command)) return command;

  if (command.includes('/') || command.includes('\\')) {
    return resolve(cwd, command);
  }

  const pathVar = process.env.PATH ?? '';
  const pathExt = (process.env.PATHEXT ?? '').split(delimiter).filter(Boolean);
  const candidates = pathExt.length > 0 ? ['', ...pathExt] : [''];

  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    for (const ext of candidates) {
      const full = join(dir, command + ext);
      if (isExecutableFile(full)) return full;
    }
  }

  return command;
}

function isExecutableFile(path: string): boolean {
  try {
    const s = statSync(path);
    return s.isFile();
  } catch {
    return false;
  }
}
