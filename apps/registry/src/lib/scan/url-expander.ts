/**
 * URL expander for the scan API.
 *
 * Resolves various URL types into a format the Python scanner can consume:
 * - GitHub folder URLs → GitHub tarball URL
 * - raw.githubusercontent.com → inline file content
 * - skills.sh URLs → GitHub tarball URL (resolved via GitHub)
 */

import { log as baseLog } from '~/services/logger';

const log = baseLog.child({ module: 'scan:url-expander' });

export type URLType = 'tarball' | 'github_folder' | 'github_raw_file' | 'skills_sh' | 'unknown';

export interface ExpandedURL {
  /** The resolved tarball URL to send to the Python scanner */
  tarballUrl: string;
  /** For GitHub folders: the sub_path within the tarball */
  subPath: string | null;
  /** For raw files: the inline content (scanner will use single-file mode) */
  fileContent: string | null;
  /** The detected URL type */
  urlType: URLType;
  /** Content type hint for single-file mode */
  contentType: string | null;
}

/**
 * Detect what kind of URL was provided.
 */
export function detectURLType(url: string): URLType {
  const parsed = parseURL(url);
  if (!parsed) return 'unknown';

  const { hostname, pathname } = parsed;

  // raw.githubusercontent.com/{owner}/{repo}/{branch}/path/to/file.md
  if (hostname === 'raw.githubusercontent.com') {
    return 'github_raw_file';
  }

  // github.com/{owner}/{repo}/tree/{branch}/path
  if (hostname === 'github.com' && pathname.includes('/tree/')) {
    return 'github_folder';
  }

  // github.com/{owner}/{repo} (no /tree/) — standard repo URL
  if (hostname === 'github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return 'github_folder';
    }
  }

  // skills.sh/{owner}/{repo}/{skill-name}
  if (hostname === 'skills.sh' || hostname === 'www.skills.sh') {
    return 'skills_sh';
  }

  // Anything ending in .tgz or .tar.gz — treat as tarball
  if (url.endsWith('.tgz') || url.endsWith('.tar.gz')) {
    return 'tarball';
  }

  // Known registry hosts
  if (hostname === 'registry.npmjs.org' || hostname === 'npm.pkg.github.com') {
    return 'tarball';
  }

  return 'tarball'; // default: pass through
}

/**
 * Parse URL safely.
 */
function parseURL(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Expand a GitHub folder URL into a tarball URL + sub_path.
 *
 * github.com/{owner}/{repo}/tree/{branch}/{path}
 * → tarball: https://codeload.github.com/{owner}/{repo}/tar.gz/{branch}
 * → sub_path: {path}
 *
 * github.com/{owner}/{repo} (no tree)
 * → tarball: https://codeload.github.com/{owner}/{repo}/tar.gz/main
 * → sub_path: null
 */
export function expandGitHubFolder(url: string): { tarballUrl: string; subPath: string | null } | null {
  const parsed = parseURL(url);
  if (!parsed || parsed.hostname !== 'github.com') return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  // parts: [owner, repo] or [owner, repo, 'tree', branch, ...pathParts]

  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];

  // Strip trailing .git from repo name
  const cleanRepo = repo.endsWith('.git') ? repo.slice(0, -4) : repo;

  if (parts.length >= 4 && parts[2] === 'tree') {
    const branch = parts[3];
    const pathParts = parts.slice(4);
    const subPath = pathParts.length > 0 ? pathParts.join('/') : null;

    return {
      tarballUrl: `https://codeload.github.com/${owner}/${cleanRepo}/tar.gz/${branch}`,
      subPath
    };
  }

  // Just owner/repo — use main branch, no sub_path
  return {
    tarballUrl: `https://codeload.github.com/${owner}/${cleanRepo}/tar.gz/main`,
    subPath: null
  };
}

/**
 * Download raw file content from raw.githubusercontent.com.
 */
const ALLOWED_FETCH_HOSTS = ['raw.githubusercontent.com'];

/** Reject URLs that resolve to private/internal network ranges. */
const BLOCKED_HOSTNAMES =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|::1|fc|fe80|169\.254\.|metadata\.google\.internal)/i;

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.test(hostname)) return true;
  // Block any hostname without a dot (no TLD = likely internal)
  if (!hostname.includes('.')) return true;
  return false;
}

export async function fetchRawFileContent(url: string): Promise<{ content: string; contentType: string } | null> {
  // Validate fetch target (defense-in-depth against SSRF)
  const parsed = parseURL(url);
  if (!parsed || !ALLOWED_FETCH_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
    log.warn({ url, host: parsed?.hostname }, 'Blocked fetch to disallowed host');
    return null;
  }

  // Block private/internal hostnames even if allowlist somehow passes
  if (isBlockedHost(parsed.hostname)) {
    log.warn({ url, host: parsed.hostname }, 'Blocked fetch to private/internal host');
    return null;
  }

  // Enforce HTTPS only
  if (parsed.protocol !== 'https:') {
    log.warn({ url, protocol: parsed.protocol }, 'Blocked non-HTTPS fetch');
    return null;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Tank-Security-Scanner/1.0' }
    });

    // Validate redirect destination didn't land on an internal host
    const finalUrl = new URL(response.url);
    if (isBlockedHost(finalUrl.hostname)) {
      log.warn({ url, finalUrl: response.url }, 'Blocked redirect to private/internal host');
      return null;
    }

    if (!response.ok) {
      log.warn({ url, status: response.status }, 'Failed to fetch raw file content');
      return null;
    }

    const content = await response.text();
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase() ?? '';

    const contentType =
      ext === 'md'
        ? 'text/markdown'
        : ext === 'py'
          ? 'text/python'
          : ext === 'js' || ext === 'ts'
            ? 'text/javascript'
            : 'text/plain';

    return { content, contentType };
  } catch (err) {
    log.warn({ url, error: String(err) }, 'Error fetching raw file content');
    return null;
  }
}

/**
 * Resolve a skills.sh URL to a GitHub tarball URL.
 *
 * skills.sh/{owner}/{repo}/{skill-name}
 * → https://codeload.github.com/{owner}/{repo}/tar.gz/main
 * → sub_path: {skill-name}
 */
export function expandSkillsShUrl(url: string): { tarballUrl: string; subPath: string } | null {
  const parsed = parseURL(url);
  if (!parsed) return null;

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'skills.sh' && hostname !== 'www.skills.sh') return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  // parts: [owner, repo, skill-name]

  if (parts.length < 3) {
    log.warn({ url }, 'Invalid skills.sh URL: expected /{owner}/{repo}/{skill-name}');
    return null;
  }

  const owner = parts[0];
  const repo = parts[1];
  const skillName = parts[2];

  return {
    tarballUrl: `https://codeload.github.com/${owner}/${repo}/tar.gz/main`,
    subPath: skillName
  };
}

/**
 * Main entry point: expand any supported URL into a scanner-compatible format.
 */
export async function expandScanUrl(rawUrl: string): Promise<ExpandedURL> {
  const urlType = detectURLType(rawUrl);

  switch (urlType) {
    case 'github_folder': {
      const expanded = expandGitHubFolder(rawUrl);
      if (!expanded) {
        return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'unknown', contentType: null };
      }
      return {
        tarballUrl: expanded.tarballUrl,
        subPath: expanded.subPath,
        fileContent: null,
        urlType: 'github_folder',
        contentType: null
      };
    }

    case 'github_raw_file': {
      const result = await fetchRawFileContent(rawUrl);
      if (!result) {
        return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'github_raw_file', contentType: null };
      }
      return {
        tarballUrl: '',
        subPath: null,
        fileContent: result.content,
        urlType: 'github_raw_file',
        contentType: result.contentType
      };
    }

    case 'skills_sh': {
      const expanded = expandSkillsShUrl(rawUrl);
      if (!expanded) {
        return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'unknown', contentType: null };
      }
      return {
        tarballUrl: expanded.tarballUrl,
        subPath: expanded.subPath,
        fileContent: null,
        urlType: 'skills_sh',
        contentType: null
      };
    }

    default:
      return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'tarball', contentType: null };
  }
}
