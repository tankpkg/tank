import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_MODELS_DIR = join(homedir(), '.tank', 'models');
const MODEL_FILENAME = 'prompt-injection.onnx';

export interface ClassifierHandle {
  enabled: true;
  phase: 'scaffold';
  modelPath: string;
  classify(text: string): ClassifierVerdict;
}

export interface ClassifierVerdict {
  matched: boolean;
  confidence: number;
}

export interface ModelPathOptions {
  modelsDir?: string;
}

export interface LoadClassifierOptions {
  enableMl?: boolean;
  modelsDir?: string;
}

export function getModelPath(options: ModelPathOptions = {}): string {
  const dir = options.modelsDir ?? DEFAULT_MODELS_DIR;
  return join(dir, MODEL_FILENAME);
}

export function isModelInstalled(options: ModelPathOptions = {}): boolean {
  return existsSync(getModelPath(options));
}

export function loadClassifier(options: LoadClassifierOptions = {}): ClassifierHandle | null {
  if (!options.enableMl) return null;
  const modelPath = getModelPath({ modelsDir: options.modelsDir });
  if (!existsSync(modelPath)) {
    throw new Error(
      `ML model not installed at ${modelPath}. Run \`tank proxy download-ml-model\` to install it, or omit --enable-ml to use regex-only detection.`
    );
  }
  return {
    enabled: true,
    phase: 'scaffold',
    modelPath,
    classify(_text: string): ClassifierVerdict {
      return { matched: false, confidence: 0 };
    }
  };
}
