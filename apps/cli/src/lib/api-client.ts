import { type TankConfig, getConfig } from './config.js';

const USER_AGENT = 'tank-cli/0.1.0';

export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(config: TankConfig) {
    this.baseUrl = config.registry;
    this.token = config.token;
  }

  private headers(hasBody: boolean): Record<string, string> {
    const h: Record<string, string> = {
      'User-Agent': USER_AGENT,
    };

    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }

    if (hasBody) {
      h['Content-Type'] = 'application/json';
    }

    return h;
  }

  async get(path: string): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(false),
    });
  }

  async post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
  }
}

/**
 * Factory: reads config and returns an ApiClient instance.
 */
export function createApiClient(configDir?: string): ApiClient {
  const config = getConfig(configDir);
  return new ApiClient(config);
}
