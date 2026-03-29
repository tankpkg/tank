import { describe, expect, it } from 'vitest';
import { getAgentConfig, getSupportedAgentIds } from '../runner/agents.ts';
import { buildAgentEnv } from '../runner/run.ts';

describe('agent configs', () => {
  it('contains all 6 Tank-supported agents', () => {
    const ids = getSupportedAgentIds();
    expect(ids).toContain('claude');
    expect(ids).toContain('opencode');
    expect(ids).toContain('cursor');
    expect(ids).toContain('codex');
    expect(ids).toContain('openclaw');
    expect(ids).toContain('universal');
    expect(ids).toHaveLength(6);
  });

  it('claude is configured as Node.js with node-options strategy', () => {
    const config = getAgentConfig('claude');
    expect(config).toBeDefined();
    expect(config!.runtime).toBe('node');
    expect(config!.strategy).toBe('node-options');
  });

  it('opencode is configured as Bun with base-url-overrides strategy', () => {
    const config = getAgentConfig('opencode');
    expect(config).toBeDefined();
    expect(config!.runtime).toBe('bun');
    expect(config!.strategy).toBe('base-url-overrides');
  });

  it('cursor is configured as Electron with https-proxy strategy', () => {
    const config = getAgentConfig('cursor');
    expect(config).toBeDefined();
    expect(config!.runtime).toBe('electron');
    expect(config!.strategy).toBe('https-proxy');
  });

  it('codex is configured as Rust with https-proxy strategy', () => {
    const config = getAgentConfig('codex');
    expect(config).toBeDefined();
    expect(config!.runtime).toBe('rust');
    expect(config!.strategy).toBe('https-proxy');
  });

  it('openclaw uses best-effort strategy', () => {
    const config = getAgentConfig('openclaw');
    expect(config).toBeDefined();
    expect(config!.strategy).toBe('best-effort');
  });

  it('universal uses best-effort strategy', () => {
    const config = getAgentConfig('universal');
    expect(config).toBeDefined();
    expect(config!.strategy).toBe('best-effort');
  });

  it('returns undefined for unknown agent', () => {
    expect(getAgentConfig('nonexistent')).toBeUndefined();
  });
});

describe('buildAgentEnv()', () => {
  const proxyUrl = 'http://localhost:9999';
  const baseEnv: Record<string, string | undefined> = {
    PATH: '/usr/bin',
    HOME: '/home/user'
  };

  describe('node-options strategy (Claude Code)', () => {
    it('sets NODE_OPTIONS with proxy bootstrap require', () => {
      const env = buildAgentEnv('node-options', proxyUrl, baseEnv);
      expect(env.NODE_OPTIONS).toBeDefined();
      expect(env.NODE_OPTIONS).toContain('--require');
      expect(env.NODE_OPTIONS).toContain('proxy-bootstrap');
    });

    it('also sets HTTPS_PROXY as secondary mechanism', () => {
      const env = buildAgentEnv('node-options', proxyUrl, baseEnv);
      expect(env.HTTPS_PROXY).toBe(proxyUrl);
      expect(env.HTTP_PROXY).toBe(proxyUrl);
    });

    it('preserves existing NODE_OPTIONS when appending', () => {
      const envWithNodeOpts = { ...baseEnv, NODE_OPTIONS: '--max-old-space-size=4096' };
      const env = buildAgentEnv('node-options', proxyUrl, envWithNodeOpts);
      expect(env.NODE_OPTIONS).toContain('--max-old-space-size=4096');
      expect(env.NODE_OPTIONS).toContain('--require');
    });

    it('sets TANK_VAULT_PROXY_URL for the bootstrap script to read', () => {
      const env = buildAgentEnv('node-options', proxyUrl, baseEnv);
      expect(env.TANK_VAULT_PROXY_URL).toBe(proxyUrl);
    });
  });

  describe('https-proxy strategy (Cursor, Codex)', () => {
    it('sets HTTPS_PROXY and HTTP_PROXY', () => {
      const env = buildAgentEnv('https-proxy', proxyUrl, baseEnv);
      expect(env.HTTPS_PROXY).toBe(proxyUrl);
      expect(env.HTTP_PROXY).toBe(proxyUrl);
    });

    it('does NOT set NODE_OPTIONS', () => {
      const env = buildAgentEnv('https-proxy', proxyUrl, baseEnv);
      expect(env.NODE_OPTIONS).toBeUndefined();
    });
  });

  describe('base-url-overrides strategy (OpenCode/Bun)', () => {
    it('sets provider base URLs to proxy with encoded upstream path', () => {
      const env = buildAgentEnv('base-url-overrides', proxyUrl, baseEnv);
      expect(env.ANTHROPIC_BASE_URL).toContain(proxyUrl);
      expect(env.ANTHROPIC_BASE_URL).toContain('/_/');
      expect(env.OPENAI_BASE_URL).toContain(proxyUrl);
      expect(env.OPENAI_BASE_URL).toContain('/_/');
    });

    it('encoded upstream decodes back to original URL', () => {
      const env = buildAgentEnv('base-url-overrides', proxyUrl, baseEnv);
      const anthropicUrl = env.ANTHROPIC_BASE_URL!;
      const encoded = anthropicUrl.split('/_/')[1]!;
      const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
      expect(decoded).toBe('https://api.anthropic.com/v1');
    });

    it('does not set HTTPS_PROXY', () => {
      const env = buildAgentEnv('base-url-overrides', proxyUrl, baseEnv);
      expect(env.HTTPS_PROXY).toBeUndefined();
    });
  });

  describe('best-effort strategy (OpenClaw, Universal)', () => {
    it('sets everything: NODE_OPTIONS + HTTPS_PROXY + encoded base URLs', () => {
      const env = buildAgentEnv('best-effort', proxyUrl, baseEnv);
      expect(env.NODE_OPTIONS).toBeDefined();
      expect(env.NODE_OPTIONS).toContain('--require');
      expect(env.HTTPS_PROXY).toBe(proxyUrl);
      expect(env.HTTP_PROXY).toBe(proxyUrl);
      expect(env.ANTHROPIC_BASE_URL).toContain('/_/');
      expect(env.OPENAI_BASE_URL).toContain('/_/');
    });
  });

  describe('preserves existing env vars', () => {
    it('keeps PATH and HOME from original env', () => {
      const env = buildAgentEnv('https-proxy', proxyUrl, baseEnv);
      expect(env.PATH).toBe('/usr/bin');
      expect(env.HOME).toBe('/home/user');
    });
  });
});
