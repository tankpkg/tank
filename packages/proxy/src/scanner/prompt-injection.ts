import { scanToolDescription } from './tool-poisoning.ts';

export type { ScanMatch, ScanResult } from './tool-poisoning.ts';

export function scanForPromptInjection(text: string): ReturnType<typeof scanToolDescription> {
  return scanToolDescription(text);
}
