import { spawn } from 'node:child_process';

export function runBuildHook(directory: string, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: directory,
      shell: true,
      stdio: 'inherit'
    });

    child.on('error', (err) => {
      reject(new Error(`Build hook failed to start: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (signal) {
        reject(new Error(`Build hook terminated by signal ${signal}`));
        return;
      }
      reject(new Error(`Build hook exited with code ${code ?? 'unknown'}`));
    });
  });
}
