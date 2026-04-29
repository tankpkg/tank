import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getModelPath, isModelInstalled } from './classifier.ts';

export const MODEL_DOWNLOAD_SIZE_MB = 500;
const PLACEHOLDER_MARKER = 'PHASE_9_SCAFFOLD: model file will be replaced by real DeBERTa ONNX in follow-up.\n';

export type DownloadStatus = 'scaffold' | 'declined' | 'already-installed';

export interface DownloadOutcome {
  status: DownloadStatus;
  message: string;
  modelPath: string;
}

export interface DownloadModelOptions {
  modelsDir?: string;
  assumeYes?: boolean;
  skipDownload?: boolean;
  writePlaceholder?: boolean;
  confirm?: (message: string) => Promise<boolean>;
}

async function defaultConfirm(_message: string): Promise<boolean> {
  return false;
}

function buildPromptMessage(): string {
  return `Download the Tank ML prompt-injection model (~${MODEL_DOWNLOAD_SIZE_MB} MB) to ~/.tank/models/? [y/N]`;
}

export async function downloadModel(options: DownloadModelOptions): Promise<DownloadOutcome> {
  const modelsDirOpt = options.modelsDir !== undefined ? { modelsDir: options.modelsDir } : {};
  const modelPath = getModelPath(modelsDirOpt);
  if (isModelInstalled(modelsDirOpt)) {
    return {
      status: 'already-installed',
      message: `Model already installed at ${modelPath}`,
      modelPath
    };
  }

  if (!options.assumeYes) {
    const confirm = options.confirm ?? defaultConfirm;
    const accepted = await confirm(buildPromptMessage());
    if (!accepted) {
      return {
        status: 'declined',
        message: 'User declined model download',
        modelPath
      };
    }
  }

  const modelsDir = options.modelsDir ?? modelPath.replace(/\/[^/]+$/, '');
  if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true });
  if (options.writePlaceholder) writeFileSync(modelPath, PLACEHOLDER_MARKER);

  if (options.skipDownload) {
    return {
      status: 'scaffold',
      message: `tank proxy: ML model download is not yet shipped (Phase 9 scaffold). Model target: ${modelPath}`,
      modelPath
    };
  }

  return {
    status: 'scaffold',
    message: `tank proxy: ML model download is not yet shipped. The real DeBERTa ONNX download will land in a follow-up PR. Target: ${modelPath}`,
    modelPath
  };
}
