import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../lib/api-client.js';
import type { TankConfig } from '../lib/config.js';

// Mock global fetch
const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
vi.stubGlobal('fetch', mockFetch);

describe('ApiClient', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const configWithToken: TankConfig = {
    registry: 'https://tankpkg.dev',
    token: 'test-token-123',
  };

  const configWithoutToken: TankConfig = {
    registry: 'https://tankpkg.dev',
  };

  describe('Authorization header', () => {
    it('attaches Bearer token when token exists', async () => {
      const client = new ApiClient(configWithToken);
      await client.get('/api/v1/skills');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer test-token-123');
    });

    it('omits Authorization header when no token', async () => {
      const client = new ApiClient(configWithoutToken);
      await client.get('/api/v1/skills');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  describe('User-Agent header', () => {
    it('sets User-Agent on GET requests', async () => {
      const client = new ApiClient(configWithoutToken);
      await client.get('/api/v1/skills');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['User-Agent']).toBe('tank-cli/0.1.0');
    });

    it('sets User-Agent on POST requests', async () => {
      const client = new ApiClient(configWithoutToken);
      await client.post('/api/v1/skills', { name: 'test' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['User-Agent']).toBe('tank-cli/0.1.0');
    });
  });

  describe('HTTP methods', () => {
    it('GET sends correct method and URL', async () => {
      const client = new ApiClient(configWithToken);
      await client.get('/api/v1/skills');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://tankpkg.dev/api/v1/skills');
      expect(options.method).toBe('GET');
    });

    it('GET does not set Content-Type', async () => {
      const client = new ApiClient(configWithToken);
      await client.get('/api/v1/skills');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('POST sends JSON body and Content-Type', async () => {
      const client = new ApiClient(configWithToken);
      const body = { name: 'test-skill' };
      await client.post('/api/v1/skills', body);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://tankpkg.dev/api/v1/skills');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.body).toBe(JSON.stringify(body));
    });

    it('PUT sends JSON body and Content-Type', async () => {
      const client = new ApiClient(configWithToken);
      const body = { version: '1.0.0' };
      await client.put('/api/v1/skills/test', body);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://tankpkg.dev/api/v1/skills/test');
      expect(options.method).toBe('PUT');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.body).toBe(JSON.stringify(body));
    });
  });
});
