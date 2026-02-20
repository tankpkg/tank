import { type TankConfig, getConfig } from './config.js';
import { httpLog } from './debug-logger.js';
import { USER_AGENT } from '../version.js';

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
    const url = `${this.baseUrl}${path}`;
    httpLog.info({ method: 'GET', url }, 'Request');
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(false),
    });
    httpLog.info({ method: 'GET', url, status: res.status, ok: res.ok }, 'Response');
    return res;
  }

  async post(path: string, body: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    httpLog.info({ method: 'POST', url, bodyKeys: body && typeof body === 'object' ? Object.keys(body) : undefined }, 'Request');
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    httpLog.info({ method: 'POST', url, status: res.status, ok: res.ok }, 'Response');
    return res;
  }

  async put(path: string, body: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    httpLog.info({ method: 'PUT', url, bodyKeys: body && typeof body === 'object' ? Object.keys(body) : undefined }, 'Request');
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    httpLog.info({ method: 'PUT', url, status: res.status, ok: res.ok }, 'Response');
    return res;
  }
}

/**
 * Factory: reads config and returns an ApiClient instance.
 */
export function createApiClient(configDir?: string): ApiClient {
  const config = getConfig(configDir);
  return new ApiClient(config);
}
