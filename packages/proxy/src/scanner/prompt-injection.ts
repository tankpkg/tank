import type { ClassifierHandle } from '../ml/classifier.ts';
import { type ScanResult, scanToolDescription } from './tool-poisoning.ts';

export type { ScanMatch, ScanResult } from './tool-poisoning.ts';

export interface PromptInjectionOptions {
  classifier?: ClassifierHandle | null;
}

export function scanForPromptInjection(text: string, options: PromptInjectionOptions = {}): ScanResult {
  const regexResult = scanToolDescription(text);
  if (regexResult.matched) return regexResult;
  const classifier = options.classifier;
  if (!classifier) return regexResult;
  const mlVerdict = classifier.classify(text);
  if (!mlVerdict.matched) return regexResult;
  return {
    matched: true,
    matches: [
      ...regexResult.matches,
      {
        patternName: `ml_classifier:${classifier.phase}`,
        category: 'prompt_injection',
        severity: 'high'
      }
    ]
  };
}
