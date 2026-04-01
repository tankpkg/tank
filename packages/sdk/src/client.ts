import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_MAX_RETRIES, DEFAULT_REGISTRY_URL, DEFAULT_TIMEOUT_MS, SDK_VERSION } from './constants.js';
import {
  TankAuthError,
  TankIntegrityError,
  TankNetworkError,
  TankNotFoundError,
  TankPermissionError
} from './errors.js';
import type {
  DownloadOptions,
  Permissions,
  SearchResponse,
  SkillContent,
  SkillInfoResponse,
  TankClientOptions,
  UserInfo,
  VersionDetail
} from './types.js';

interface ConfigFile {
  token?: string;
  registry?: string;
  user?: { name: string; email: string };
}

function resolveConfigDir(configDir?: string): string {
  if (configDir) return configDir.replace(/^~/, os.homedir());
  return path.join(os.homedir(), '.tank');
}

function readConfigFile(configDir?: string): ConfigFile {
  try {
    const configPath = path.join(resolveConfigDir(configDir), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as ConfigFile;
  } catch {
    return {};
  }
}

function resolveToken(options: TankClientOptions, config: ConfigFile): string | undefined {
  if (options.token) return options.token;
  const envToken = process.env.TANK_TOKEN?.trim();
  if (envToken) return envToken;
  return config.token;
}

function parseRegistryOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid registry URL: ${raw}`);
  }
  if (url.username || url.password) {
    throw new Error(`Registry URL must not contain credentials: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Registry URL must use https or http: ${raw}`);
  }
  return url.origin;
}

function resolveRegistryUrl(options: TankClientOptions, config: ConfigFile): string {
  const raw = options.registryUrl || process.env.TANK_REGISTRY_URL?.trim() || config.registry || DEFAULT_REGISTRY_URL;
  return parseRegistryOrigin(raw);
}

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class TankClient {
  private readonly token: string | undefined;
  private readonly registryUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(options: TankClientOptions = {}) {
    const config = readConfigFile(options.configDir);
    this.token = resolveToken(options, config);
    this.registryUrl = resolveRegistryUrl(options, config);
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async readStreamWithLimit(body: ReadableStream<Uint8Array>, limit: number): Promise<Buffer> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        reader.cancel();
        throw new TankNetworkError(`Response body exceeds ${limit} byte limit`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  private headers(hasBody: boolean): Record<string, string> {
    const h: Record<string, string> = {
      'User-Agent': `tankpkg-sdk/${SDK_VERSION}`
    };
    if (this.token) {
      h.Authorization = `Bearer ${this.token}`;
    }
    if (hasBody) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  }

  private async request(method: string, apiPath: string, body?: unknown): Promise<Response> {
    const url = `${this.registryUrl}/api/v1${apiPath}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: this.headers(!!body),
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: this.token ? 'manual' : 'follow'
        });

        if (res.status >= 300 && res.status < 400) {
          throw new TankNetworkError(
            `Unexpected redirect (${res.status}) from ${url}. Refusing to follow to prevent credential leakage.`
          );
        }

        const isRetryable = res.status === 429 || res.status >= 500;
        if (isRetryable && attempt < this.maxRetries) {
          const delay = Math.min(1000 * 2 ** attempt, 30_000);
          await sleep(delay);
          continue;
        }

        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * 2 ** attempt, 30_000);
          await sleep(delay);
        }
      }
    }

    throw new TankNetworkError(`Request to ${url} failed after ${this.maxRetries + 1} attempts`, lastError);
  }

  private async json<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const res = await this.request(method, apiPath, body);

    if (res.status === 401) {
      throw new TankAuthError();
    }
    if (res.status === 403) {
      const data = await res.json().catch(() => ({ error: 'Forbidden' }));
      throw new TankPermissionError((data as { error?: string }).error || 'Permission denied');
    }
    if (res.status === 404) {
      const data = await res.json().catch(() => ({ error: 'Not found' }));
      throw new TankNotFoundError((data as { error?: string }).error || 'Not found');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new TankNetworkError(`HTTP ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  async search(query: string, options?: { page?: number; limit?: number }): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    return this.json('GET', `/search?${params}`);
  }

  async info(name: string): Promise<SkillInfoResponse> {
    return this.json('GET', `/skills/${encodeURIComponent(name)}`);
  }

  async versions(name: string): Promise<{
    name: string;
    versions: Array<{
      version: string;
      integrity: string;
      auditScore: number | null;
      auditStatus: string;
      publishedAt: string;
    }>;
  }> {
    return this.json('GET', `/skills/${encodeURIComponent(name)}/versions`);
  }

  async download(name: string, version: string, options?: DownloadOptions): Promise<ReadableStream | Buffer | void> {
    const detail = await this.json<VersionDetail>('GET', `/skills/${encodeURIComponent(name)}/${version}`);

    const dlUrl = new URL(detail.downloadUrl);
    if (dlUrl.username || dlUrl.password) {
      throw new TankNetworkError(`Download URL must not contain credentials: ${detail.downloadUrl}`);
    }
    if (dlUrl.protocol !== 'https:' && dlUrl.protocol !== 'http:') {
      throw new TankNetworkError(`Download URL must use https or http: ${detail.downloadUrl}`);
    }

    const res = await fetch(detail.downloadUrl, {
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'manual'
    });

    if (res.status >= 300 && res.status < 400) {
      throw new TankNetworkError(`Unexpected redirect (${res.status}) from download URL`);
    }
    if (!res.ok || !res.body) {
      throw new TankNetworkError(`Failed to download tarball: HTTP ${res.status}`);
    }

    if (options?.buffer || options?.dest) {
      const buffer = await this.readStreamWithLimit(res.body, MAX_DOWNLOAD_BYTES);

      const nodeCrypto = await import('node:crypto');
      const hash = nodeCrypto.createHash('sha512').update(buffer).digest('base64');
      const computed = `sha512-${hash}`;
      if (detail.integrity && detail.integrity !== 'pending' && computed !== detail.integrity) {
        throw new TankIntegrityError('Integrity verification failed', {
          expected: detail.integrity,
          actual: computed
        });
      }

      if (options?.dest) {
        const destDir = options.dest.replace(/^~/, os.homedir());
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const safeName = name.replace(/[/\\]/g, '-').replace(/\.\./g, '');
        const filename = `${safeName}-${version}.tgz`;
        const destPath = path.join(destDir, filename);
        fs.writeFileSync(destPath, buffer);
        return;
      }

      return buffer;
    }

    return res.body;
  }

  async audit(name: string, version?: string): Promise<VersionDetail> {
    if (version) {
      return this.json<VersionDetail>('GET', `/skills/${encodeURIComponent(name)}/${version}`);
    }
    const skillInfo = await this.info(name);
    const latest = skillInfo.latestVersion;
    if (!latest) throw new TankNotFoundError(`No versions found for ${name}`, name);
    return this.json<VersionDetail>('GET', `/skills/${encodeURIComponent(name)}/${latest}`);
  }

  async permissions(name: string, version?: string): Promise<Permissions | null> {
    const detail = await this.audit(name, version);
    return detail.permissions;
  }

  async whoami(): Promise<UserInfo | null> {
    if (!this.token) return null;
    try {
      return await this.json<UserInfo>('GET', '/auth/whoami');
    } catch (err) {
      if (err instanceof TankAuthError) return null;
      throw err;
    }
  }

  async startLoginFlow(): Promise<{ authUrl: string; sessionCode: string }> {
    const state = crypto.randomUUID().replace(/-/g, '');
    return this.json('POST', '/cli-auth/start', { state });
  }

  async exchangeLoginCode(
    sessionCode: string,
    state: string
  ): Promise<{ token: string; user: { name: string | null; email: string | null } } | null> {
    try {
      return await this.json('POST', '/cli-auth/exchange', { sessionCode, state });
    } catch (err) {
      if (err instanceof TankAuthError || err instanceof TankNotFoundError) return null;
      throw err;
    }
  }

  async listFiles(name: string, version?: string): Promise<string[]> {
    const ver = version ?? (await this.info(name)).latestVersion;
    if (!ver) throw new TankNotFoundError(`No versions found for ${name}`, name);
    const result = await this.json<{ files: string[] }>('GET', `/skills/${encodeURIComponent(name)}/${ver}/files`);
    return result.files;
  }

  async readFile(name: string, version: string, filePath: string): Promise<string> {
    const normalized = filePath.replace(/\\/g, '/').replace(/\0/g, '');
    if (!normalized || normalized.startsWith('/') || normalized.split('/').some((s) => s === '..')) {
      throw new TankNetworkError(`Invalid file path: ${filePath}`);
    }
    const encodedName = encodeURIComponent(name);
    const encodedPath = normalized.split('/').map(encodeURIComponent).join('/');
    const res = await this.request('GET', `/skills/${encodedName}/${version}/files/${encodedPath}`);
    if (res.status === 404) throw new TankNotFoundError(`File not found: ${filePath}`, name);
    if (!res.ok) throw new TankNetworkError(`Failed to read file: HTTP ${res.status}`);
    return res.text();
  }

  private async batchRead(
    name: string,
    ver: string,
    items: Array<{ f: string; prefix: string }>,
    concurrency = 6
  ): Promise<Array<{ key: string; prefix: string; content: string }>> {
    const results: Array<{ key: string; prefix: string; content: string }> = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async ({ f, prefix }) => ({
          key: f.slice(prefix.length),
          prefix,
          content: await this.readFile(name, ver, f)
        }))
      );
      results.push(...batchResults);
    }
    return results;
  }

  async readSkill(name: string, version?: string): Promise<SkillContent> {
    const ver = version ?? (await this.info(name)).latestVersion;
    if (!ver) throw new TankNotFoundError(`No versions found for ${name}`, name);

    const files = await this.listFiles(name, ver);

    const skillMd = files.find((f) => f === 'SKILL.md');
    const content = skillMd ? await this.readFile(name, ver, 'SKILL.md') : '';

    const filesToRead = [
      ...files.filter((f) => f.startsWith('references/')).map((f) => ({ f, prefix: 'references/' })),
      ...files.filter((f) => f.startsWith('scripts/')).map((f) => ({ f, prefix: 'scripts/' }))
    ];

    const results = await this.batchRead(name, ver, filesToRead);
    const refEntries = results.filter((r) => r.prefix === 'references/').map((r) => [r.key, r.content] as const);
    const scriptEntries = results.filter((r) => r.prefix === 'scripts/').map((r) => [r.key, r.content] as const);

    return {
      name,
      version: ver,
      content,
      references: Object.fromEntries(refEntries),
      scripts: Object.fromEntries(scriptEntries),
      files
    };
  }

  async getStarCount(name: string): Promise<{ count: number; isStarred: boolean }> {
    return this.json('GET', `/skills/${encodeURIComponent(name)}/star`);
  }

  async star(name: string): Promise<void> {
    await this.json('POST', `/skills/${encodeURIComponent(name)}/star`);
  }

  async unstar(name: string): Promise<void> {
    await this.json('DELETE', `/skills/${encodeURIComponent(name)}/star`);
  }
}
