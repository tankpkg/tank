import { TankAuthError, TankClient } from '@tankpkg/sdk';
import { getConfig, type TankConfig } from './config.js';

export interface ApiClientOptions {
  configDir?: string;
}

export class TankApiClient {
  private client: TankClient;
  private config: TankConfig;

  constructor(options: ApiClientOptions = {}) {
    this.config = getConfig(options.configDir);
    this.client = new TankClient({
      token: this.config.token,
      registryUrl: this.config.registry,
      configDir: options.configDir
    });
  }

  get baseUrl(): string {
    return this.config.registry;
  }

  get token(): string | undefined {
    return this.config.token;
  }

  get isAuthenticated(): boolean {
    return !!this.config.token;
  }

  get sdk(): TankClient {
    return this.client;
  }

  async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ data: T; ok: true } | { error: string; status: number; ok: false }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return {
          error: (body as { error?: string }).error ?? response.statusText,
          status: response.status,
          ok: false
        };
      }

      const data = (await response.json()) as T;
      return { data, ok: true };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Network error',
        status: 0,
        ok: false
      };
    }
  }

  async verifyAuth(): Promise<
    | { valid: true; user: { name: string | null; email: string | null } }
    | { valid: false; reason: 'no-token' | 'unauthorized' | 'network-error'; error?: string }
  > {
    if (!this.config.token) {
      return { valid: false, reason: 'no-token' };
    }

    try {
      const user = await this.client.whoami();
      if (user) {
        return { valid: true, user: { name: user.name, email: user.email } };
      }
      return { valid: false, reason: 'unauthorized' };
    } catch (err) {
      if (err instanceof TankAuthError) {
        return { valid: false, reason: 'unauthorized' };
      }
      return {
        valid: false,
        reason: 'network-error',
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }
  }
}
