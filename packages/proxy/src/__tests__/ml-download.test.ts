import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DownloadOutcome, downloadModel, MODEL_DOWNLOAD_SIZE_MB } from '~/ml/download.js';

let sandbox: string;
let modelsDir: string;

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'tank-ml-download-'));
  modelsDir = path.join(sandbox, 'models');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('MODEL_DOWNLOAD_SIZE_MB — documents the expected download size', () => {
  it('is a positive number (~500MB for DeBERTa ONNX)', () => {
    expect(MODEL_DOWNLOAD_SIZE_MB).toBeGreaterThan(0);
    expect(MODEL_DOWNLOAD_SIZE_MB).toBeLessThan(2000);
  });
});

describe('downloadModel — non-interactive (assumeYes=true) scaffold path (C41)', () => {
  it('returns outcome=scaffold when assumeYes=true and skipDownload=true', async () => {
    const outcome = await downloadModel({ modelsDir, assumeYes: true, skipDownload: true });
    expect(outcome.status).toBe('scaffold');
    expect(outcome.message).toContain('not yet shipped');
  });

  it('creates the models directory even in scaffold mode', async () => {
    await downloadModel({ modelsDir, assumeYes: true, skipDownload: true });
    expect(existsSync(modelsDir)).toBe(true);
  });

  it('writes a placeholder marker file so isModelInstalled() can be tested', async () => {
    const outcome = await downloadModel({ modelsDir, assumeYes: true, skipDownload: true, writePlaceholder: true });
    expect(outcome.status).toBe('scaffold');
    const marker = path.join(modelsDir, 'prompt-injection.onnx');
    expect(existsSync(marker)).toBe(true);
    const content = readFileSync(marker, 'utf-8');
    expect(content).toContain('PHASE_9_SCAFFOLD');
  });
});

describe('downloadModel — consent required when assumeYes=false (C41)', () => {
  it('returns outcome=declined when the prompt returns false', async () => {
    const outcome = await downloadModel({
      modelsDir,
      assumeYes: false,
      skipDownload: true,
      confirm: async () => false
    });
    expect(outcome.status).toBe('declined');
    expect(existsSync(path.join(modelsDir, 'prompt-injection.onnx'))).toBe(false);
  });

  it('proceeds when the prompt returns true and reports scaffold status', async () => {
    const outcome = await downloadModel({
      modelsDir,
      assumeYes: false,
      skipDownload: true,
      confirm: async () => true
    });
    expect(outcome.status).toBe('scaffold');
  });

  it('passes a size-annotated message to the confirm prompt', async () => {
    let seenMessage = '';
    await downloadModel({
      modelsDir,
      assumeYes: false,
      skipDownload: true,
      confirm: async (msg) => {
        seenMessage = msg;
        return false;
      }
    });
    expect(seenMessage).toContain(String(MODEL_DOWNLOAD_SIZE_MB));
    expect(seenMessage.toLowerCase()).toContain('mb');
  });
});

describe('downloadModel — idempotency (C41)', () => {
  it('reports outcome=already-installed when the model file is already present', async () => {
    await downloadModel({ modelsDir, assumeYes: true, skipDownload: true, writePlaceholder: true });
    const second = await downloadModel({ modelsDir, assumeYes: true, skipDownload: true });
    expect(second.status).toBe('already-installed');
  });

  it('does not re-prompt when the model is already installed', async () => {
    await downloadModel({ modelsDir, assumeYes: true, skipDownload: true, writePlaceholder: true });
    let prompted = false;
    const second = await downloadModel({
      modelsDir,
      assumeYes: false,
      skipDownload: true,
      confirm: async () => {
        prompted = true;
        return true;
      }
    });
    expect(prompted).toBe(false);
    expect(second.status).toBe('already-installed');
  });
});

describe('downloadModel — DownloadOutcome shape', () => {
  it('has a stable shape: { status, message, modelPath }', async () => {
    const outcome: DownloadOutcome = await downloadModel({
      modelsDir,
      assumeYes: true,
      skipDownload: true
    });
    expect(outcome).toHaveProperty('status');
    expect(outcome).toHaveProperty('message');
    expect(outcome).toHaveProperty('modelPath');
    expect(outcome.modelPath).toBe(path.join(modelsDir, 'prompt-injection.onnx'));
  });
});
