import { describe, expect, it } from 'vitest';
import { spawnChild } from '../transport/stdio-wrapper.ts';

describe('spawnChild — child process stdio wrapper', () => {
  it('pipes stdin to child and receives stdout as newline-delimited messages', async () => {
    const handle = spawnChild('node', [
      '-e',
      `
      process.stdin.setEncoding('utf8');
      let buf = '';
      process.stdin.on('data', (chunk) => {
        buf += chunk;
        let i = buf.indexOf('\\n');
        while (i !== -1) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          process.stdout.write('echo:' + line + '\\n');
          i = buf.indexOf('\\n');
        }
      });
    `
    ]);

    const received: string[] = [];
    handle.onMessage((line) => received.push(line));

    handle.write('hello');
    handle.write('world');

    await new Promise((r) => setTimeout(r, 200));

    expect(received).toContain('echo:hello');
    expect(received).toContain('echo:world');

    handle.kill();
    await new Promise<void>((resolve) => handle.onExit(() => resolve()));
  });

  it('propagates exit code when child exits cleanly', async () => {
    const handle = spawnChild('node', ['-e', 'process.exit(7)']);
    const code = await new Promise<number>((resolve) => handle.onExit(resolve));
    expect(code).toBe(7);
  });

  it('reports exit when child is killed via SIGTERM', async () => {
    const handle = spawnChild('node', ['-e', 'setInterval(() => {}, 1000)']);
    setTimeout(() => handle.kill('SIGTERM'), 50);
    const code = await new Promise<number>((resolve) => handle.onExit(resolve));
    expect(typeof code).toBe('number');
  });

  it('buffers partial lines correctly when stdout arrives in chunks', async () => {
    const handle = spawnChild('node', [
      '-e',
      `
      process.stdout.write('{"jsonrpc":"2.0",');
      setTimeout(() => process.stdout.write('"id":1,"method":"ping"}\\n'), 50);
    `
    ]);

    const received: string[] = [];
    handle.onMessage((line) => received.push(line));

    await new Promise((r) => setTimeout(r, 300));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('{"jsonrpc":"2.0","id":1,"method":"ping"}');

    handle.kill();
  });
});
