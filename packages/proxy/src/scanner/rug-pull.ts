import * as fs from 'node:fs';
import * as path from 'node:path';
import { hashSchema } from './canonicalize.ts';
import { type PinFile, readPinFile, writePinFile } from './pin-io.ts';

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface PinOrCompareOptions {
  pinsDir: string;
  now?: () => Date;
}

export interface Mismatch {
  toolName: string;
  expectedHash: string;
  actualHash: string;
}

export interface PinOrCompareResult {
  verdict: 'first_run' | 'match' | 'mismatch';
  mismatches: Mismatch[];
  removed: string[];
}

function buildToolHashes(tools: readonly ToolSchema[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const tool of tools) {
    hashes[tool.name] = hashSchema(tool);
  }
  return hashes;
}

function pinFilePath(pinsDir: string, packageHash: string): string {
  return path.join(pinsDir, `${packageHash}.json`);
}

function writeFreshPin(target: string, packageHash: string, currentHashes: Record<string, string>, now: Date): void {
  const pin: PinFile = {
    packageHash,
    pinnedAt: now.toISOString(),
    tools: currentHashes
  };
  writePinFile(target, pin);
}

function detectMismatches(expected: Record<string, string>, actual: Record<string, string>): Mismatch[] {
  const mismatches: Mismatch[] = [];
  for (const [toolName, expectedHash] of Object.entries(expected)) {
    const actualHash = actual[toolName];
    if (actualHash !== undefined && actualHash !== expectedHash) {
      mismatches.push({ toolName, expectedHash, actualHash });
    }
  }
  return mismatches;
}

function detectRemoved(expected: Record<string, string>, actual: Record<string, string>): string[] {
  return Object.keys(expected).filter((name) => !(name in actual));
}

export function pinOrCompare(
  packageHash: string,
  tools: readonly ToolSchema[],
  options: PinOrCompareOptions
): PinOrCompareResult {
  const now = (options.now ?? (() => new Date()))();
  const target = pinFilePath(options.pinsDir, packageHash);
  const currentHashes = buildToolHashes(tools);
  const existing = readPinFile(target);
  if (existing === null) {
    writeFreshPin(target, packageHash, currentHashes, now);
    return { verdict: 'first_run', mismatches: [], removed: [] };
  }
  const mismatches = detectMismatches(existing.tools, currentHashes);
  const removed = detectRemoved(existing.tools, currentHashes);
  if (mismatches.length > 0) {
    return { verdict: 'mismatch', mismatches, removed };
  }
  return { verdict: 'match', mismatches: [], removed };
}

export function resetPins(pinsDir: string): number {
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
