import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TankApiClient } from '../src/lib/api-client.js';
import { setConfig, getConfigPath } from '../src/lib/config.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TankApiClient', () => {
  let tempDir: string;
  let client: TankApiClient;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-mcp-test-'));
    client = new TankApiClient({ configDir: tempDir });
    mockFetch.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('properties', () => {
    it('returns base URL from config', () => {
      expect(client.baseUrl).toBe('https://tankpkg.dev');
    });

    it('returns token when set', () => {
      setConfig({ token: 'test-token' }, tempDir);
      client = new TankApiClient({ configDir: tempDir });
      expect(client.token).toBe('test-token');
    });

    it('isAuthenticated is false without token', () => {
      expect(client.isAuthenticated).toBe(false);
    });

    it('isAuthenticated is true with token', () => {
      setConfig({ token: 'test-token' }, tempDir);
      client = new TankApiClient({ configDir: tempDir });
      expect(client.isAuthenticated).toBe(true);
    });
  });

  describe('fetch', () => {
    it('makes authenticated request with token', async () => {
      setConfig({ token: 'test-token' }, tempDir);
      client = new TankApiClient({ configDir: tempDir });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      const result = await client.fetch<{ data: string }>('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://tankpkg.dev/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ data: 'test' });
      }
    });

    it('returns error on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Resource not found' }),
      });

      const result = await client.fetch('/api/test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.error).toBe('Resource not found');
      }
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await client.fetch('/api/test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(0);
        expect(result.error).toBe('Network failure');
      }
    });
  });

  describe('verifyAuth', () => {
    it('returns invalid when no token', async () => {
      const result = await client.verifyAuth();
      expect(result.valid).toBe(false);
    });

    it('returns valid when token is valid', async () => {
      setConfig({ token: 'test-token' }, tempDir);
      client = new TankApiClient({ configDir: tempDir });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Test User', email: 'test@example.com', userId: 'u1' }),
      });

      const result = await client.verifyAuth();
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.user.name).toBe('Test User');
      }
    });

    it('returns invalid when token is invalid', async () => {
      setConfig({ token: 'invalid-token' }, tempDir);
      client = new TankApiClient({ configDir: tempDir });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid token' }),
      });

      const result = await client.verifyAuth();
      expect(result.valid).toBe(false);
    });
  });
});
