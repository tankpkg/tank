import { getConfig, type TankConfig } from './config.js';

export interface ApiClientOptions {
  configDir?: string;
}

/**
 * Tank API client for MCP server.
 */
export class TankApiClient {
  private config: TankConfig;

  constructor(options: ApiClientOptions = {}) {
    this.config = getConfig(options.configDir);
  }

  /**
   * Get the base URL for the Tank API.
   */
  get baseUrl(): string {
    return this.config.registry;
  }

  /**
   * Get the auth token (if available).
   */
  get token(): string | undefined {
    return this.config.token;
  }

  /**
   * Check if authenticated.
   */
  get isAuthenticated(): boolean {
    return !!this.config.token;
  }

  /**
   * Make an authenticated API request.
   */
  async fetch<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<{ data: T; ok: true } | { error: string; status: number; ok: false }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return {
          error: (body as { error?: string }).error ?? response.statusText,
          status: response.status,
          ok: false,
        };
      }

      const data = await response.json() as T;
      return { data, ok: true };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Network error',
        status: 0,
        ok: false,
      };
    }
  }

  /**
   * Verify current auth token is valid.
   */
  async verifyAuth(): Promise<{ valid: boolean; user?: { name: string | null; email: string | null } }> {
    if (!this.config.token) {
      return { valid: false };
    }

    const result = await this.fetch<{ user: { name: string | null; email: string | null } }>(
      '/api/v1/auth/whoami',
    );

    if (result.ok) {
      return { valid: true, user: result.data.user };
    }

    return { valid: false };
  }
}
