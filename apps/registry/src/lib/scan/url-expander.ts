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

export type URLType =
  | 'tarball'
  | 'github_folder'
  | 'github_raw_file'
  | 'github_blob_file'
  | 'skills_sh'
  | 'agentskills_il'
  | 'unknown';

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

  // github.com/{owner}/{repo}/blob/{branch}/path/to/file.md
  if (hostname === 'github.com' && pathname.includes('/blob/')) {
    return 'github_blob_file';
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

  // agentskills.co.il/{he|en}/skills/{category}/{skill-name}
  if (hostname === 'agentskills.co.il' || hostname === 'www.agentskills.co.il') {
    if (pathname.includes('/skills/')) {
      return 'agentskills_il';
    }
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
 * → tarball: https://codeload.github.com/{owner}/{repo}/tar.gz/{default_branch}
 * → sub_path: null
 */
export async function expandGitHubFolder(url: string): Promise<{ tarballUrl: string; subPath: string | null } | null> {
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

  // Just owner/repo — resolve default branch
  const branch = await resolveDefaultBranch(owner, cleanRepo);
  return {
    tarballUrl: `https://codeload.github.com/${owner}/${cleanRepo}/tar.gz/${branch}`,
    subPath: null
  };
}

/**
 * Convert a GitHub blob URL to a raw.githubusercontent.com URL.
 *
 * github.com/{owner}/{repo}/blob/{branch}/path/to/file.md
 * → raw.githubusercontent.com/{owner}/{repo}/{branch}/path/to/file.md
 */
export function expandGitHubBlobUrl(
  url: string
): { rawUrl: string; owner: string; repo: string; branch: string; filePath: string } | null {
  const parsed = parseURL(url);
  if (!parsed || parsed.hostname !== 'github.com') return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  // parts: [owner, repo, 'blob', branch, ...pathParts]

  if (parts.length < 5 || parts[2] !== 'blob') return null;

  const owner = parts[0];
  const repo = parts[1];
  const branch = parts[3];
  const filePath = parts.slice(4).join('/');

  const cleanRepo = repo.endsWith('.git') ? repo.slice(0, -4) : repo;

  return {
    rawUrl: `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${filePath}`,
    owner,
    repo: cleanRepo,
    branch,
    filePath
  };
}

/**
 * Download raw file content from raw.githubusercontent.com.
 */
const ALLOWED_FETCH_HOSTS = ['raw.githubusercontent.com', 'agentskills.co.il', 'www.agentskills.co.il'];

/** Reject URLs that resolve to private/internal network ranges. */
const BLOCKED_HOSTNAMES =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|::1|fc|fe80|169\.254\.|metadata\.google\.internal)/i;

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.test(hostname)) return true;
  // Block any hostname without a dot (no TLD = likely internal)
  if (!hostname.includes('.')) return true;
  return false;
}

/**
 * In-memory cache for GitHub default branch lookups.
 * 10-minute TTL to avoid hitting the 60 req/hr unauthenticated rate limit.
 * Capped at 1000 entries to prevent unbounded growth in long-running processes.
 */
const MAX_BRANCH_CACHE_SIZE = 1000;
const branchCache = new Map<string, { branch: string; expires: number }>();
const BRANCH_CACHE_TTL_MS = 10 * 60 * 1000;

/** Evict expired entries; if cache is still full, drop oldest. */
function evictBranchCache(): void {
  const now = Date.now();
  for (const [key, val] of branchCache) {
    if (val.expires <= now) branchCache.delete(key);
  }
  if (branchCache.size >= MAX_BRANCH_CACHE_SIZE) {
    // Drop the oldest entry (first inserted — Map preserves insertion order)
    const oldest = branchCache.keys().next().value;
    if (oldest) branchCache.delete(oldest);
  }
}

/** Clear the entire branch cache (used in tests). */
export function clearBranchCache(): void {
  branchCache.clear();
}

/**
 * Resolve the default branch name for a GitHub repo.
 *
 * Strategy:
 * 1. Check in-memory cache
 * 2. Call GitHub API (`GET /repos/{owner}/{repo}`) with 5s timeout
 * 3. Fallback: HEAD probe `main` then `master` on codeload.github.com
 * 4. Final fallback: return `"main"`
 */
export async function resolveDefaultBranch(owner: string, repo: string): Promise<string> {
  const cacheKey = `${owner}/${repo}`;
  const cached = branchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.branch;
  }

  // Strategy 1: GitHub API
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal: AbortSignal.timeout(5_000),
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Tank-Security-Scanner/1.0'
      }
    });

    if (response.ok) {
      const data = (await response.json()) as { default_branch?: string };
      const branch = data.default_branch ?? 'main';
      evictBranchCache();
      branchCache.set(cacheKey, { branch, expires: Date.now() + BRANCH_CACHE_TTL_MS });
      return branch;
    }
  } catch {
    // API failed — fall through to HEAD probe
  }

  // Strategy 2: HEAD probe on codeload.github.com
  for (const candidate of ['main', 'master'] as const) {
    try {
      const probeUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/${candidate}`;
      const probeResponse = await fetch(probeUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5_000),
        redirect: 'follow',
        headers: { 'User-Agent': 'Tank-Security-Scanner/1.0' }
      });
      if (probeResponse.ok) {
        evictBranchCache();
        branchCache.set(cacheKey, { branch: candidate, expires: Date.now() + BRANCH_CACHE_TTL_MS });
        return candidate;
      }
    } catch {
      // Probe failed — try next candidate
    }
  }

  // Strategy 3: hardcoded fallback — cache it to avoid repeat failures
  evictBranchCache();
  branchCache.set(cacheKey, { branch: 'main', expires: Date.now() + BRANCH_CACHE_TTL_MS });
  return 'main';
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
 * → https://codeload.github.com/{owner}/{repo}/tar.gz/{default_branch}
 * → sub_path: {skill-name}
 */
export async function expandSkillsShUrl(url: string): Promise<{ tarballUrl: string; subPath: string } | null> {
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

  const branch = await resolveDefaultBranch(owner, repo);
  return {
    tarballUrl: `https://codeload.github.com/${owner}/${repo}/tar.gz/${branch}`,
    subPath: skillName
  };
}

/**
 * Try to fetch a skill file directly from a GitHub repo subdirectory.
 * Returns the file content if found, or null.
 *
 * Attempts common skill file names: SKILL.md, skill.md, README.md
 */
export async function fetchSkillFileFromGitHub(
  owner: string,
  repo: string,
  skillPath: string
): Promise<{ content: string; contentType: string } | null> {
  const candidates = ['SKILL.md', 'skill.md', 'README.md', 'README'];
  const branch = await resolveDefaultBranch(owner, repo);

  for (const filename of candidates) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}/${filename}`;
    try {
      const response = await fetch(rawUrl, {
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
        headers: { 'User-Agent': 'Tank-Security-Scanner/1.0' }
      });

      if (!response.ok) continue;

      // Validate redirect stayed on allowed host
      const finalUrl = new URL(response.url);
      if (isBlockedHost(finalUrl.hostname)) continue;
      if (!ALLOWED_FETCH_HOSTS.some((h) => finalUrl.hostname === h || finalUrl.hostname.endsWith(`.${h}`))) continue;

      const content = await response.text();
      return { content, contentType: 'text/markdown' };
    } catch {
      // File not found, try next candidate
    }
  }

  return null;
}

/**
 * Scrape an agentskills.co.il page to extract the GitHub owner/repo.
 *
 * Returns { owner, repo, subPath } for tarball construction, or null.
 */
async function scrapeAgentskillsGithub(
  url: string,
  _category: string,
  skillName: string
): Promise<{ tarballUrl: string; subPath: string; owner: string; repo: string } | null> {
  // Validate the target host before fetching
  const parsed = parseURL(url);
  if (!parsed || (parsed.hostname !== 'agentskills.co.il' && parsed.hostname !== 'www.agentskills.co.il')) {
    return null;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Tank-Security-Scanner/1.0',
        Accept: 'text/html'
      }
    });

    if (!response.ok) {
      log.warn({ url, status: response.status }, 'Failed to fetch agentskills.co.il page');
      return null;
    }

    // Validate redirect stayed on agentskills.co.il
    const finalUrl = new URL(response.url);
    if (finalUrl.hostname !== 'agentskills.co.il' && finalUrl.hostname !== 'www.agentskills.co.il') {
      log.warn({ url, finalUrl: response.url }, 'Blocked redirect away from agentskills.co.il');
      return null;
    }

    const html = await response.text();

    // Extract GitHub owner/repo from page content
    // Pattern 1: npx skills-il add skills-il/food-and-dining --skill israeli-grocery-price-intelligence
    const npxMatch = html.match(/npx\s+([a-zA-Z0-9_-]+)\s+add\s+([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
    if (npxMatch) {
      const owner = npxMatch[2];
      const repo = npxMatch[3];
      const branch = await resolveDefaultBranch(owner, repo);
      return {
        tarballUrl: `https://codeload.github.com/${owner}/${repo}/tar.gz/${branch}`,
        subPath: skillName,
        owner,
        repo
      };
    }

    // Pattern 2: Direct GitHub link in the page
    const ghMatch = html.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/);
    if (ghMatch) {
      const owner = ghMatch[1];
      const repo = ghMatch[2];
      const branch = await resolveDefaultBranch(owner, repo);
      return {
        tarballUrl: `https://codeload.github.com/${owner}/${repo}/tar.gz/${branch}`,
        subPath: skillName,
        owner,
        repo
      };
    }

    log.warn({ url }, 'Could not extract GitHub repo from agentskills.co.il page');
    return null;
  } catch (err) {
    log.warn({ url, error: String(err) }, 'Failed to resolve agentskills.co.il URL');
    return null;
  }
}

/**
 * Resolve agentskills.co.il URL to inline content.
 * Returns the SKILL.md file content directly, avoiding tarball download.
 */
async function resolveAgentskillsContent(url: string): Promise<{ content: string; contentType: string } | null> {
  const parsed = parseURL(url);
  if (!parsed) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  const skillsIdx = parts.indexOf('skills');
  if (skillsIdx < 0 || parts.length < skillsIdx + 3) return null;

  const category = parts[skillsIdx + 1];
  const skillName = parts[skillsIdx + 2];

  // Strategy 1: Try skills-il org directly (covers majority of skills)
  const directResult = await fetchSkillFileFromGitHub('skills-il', category, skillName);
  if (directResult) return directResult;

  // Strategy 2: Scrape page to find GitHub owner/repo, then fetch file
  const scraped = await scrapeAgentskillsGithub(url, category, skillName);
  if (scraped) {
    const fileResult = await fetchSkillFileFromGitHub(scraped.owner, scraped.repo, skillName);
    if (fileResult) return fileResult;

    // Return tarball info for fallback
    return null;
  }

  return null;
}

/**
 * Expand agentskills.co.il URL to tarball URL (fallback).
 * Used when direct file fetch fails.
 */
async function expandAgentskillsUrl(url: string): Promise<{ tarballUrl: string; subPath: string } | null> {
  const parsed = parseURL(url);
  if (!parsed) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  const skillsIdx = parts.indexOf('skills');
  if (skillsIdx < 0 || parts.length < skillsIdx + 3) return null;

  const category = parts[skillsIdx + 1];
  const skillName = parts[skillsIdx + 2];

  const scraped = await scrapeAgentskillsGithub(url, category, skillName);
  if (scraped) {
    return { tarballUrl: scraped.tarballUrl, subPath: scraped.subPath };
  }

  return null;
}

/**
 * Main entry point: expand any supported URL into a scanner-compatible format.
 */
export async function expandScanUrl(rawUrl: string): Promise<ExpandedURL> {
  const urlType = detectURLType(rawUrl);

  switch (urlType) {
    case 'github_folder': {
      const expanded = await expandGitHubFolder(rawUrl);
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

    case 'github_blob_file': {
      // Convert blob URL to raw.githubusercontent.com URL and fetch directly
      const blobExpanded = expandGitHubBlobUrl(rawUrl);
      if (blobExpanded) {
        const blobResult = await fetchRawFileContent(blobExpanded.rawUrl);
        if (blobResult) {
          return {
            tarballUrl: '',
            subPath: null,
            fileContent: blobResult.content,
            urlType: 'github_blob_file',
            contentType: blobResult.contentType
          };
        }
      }
      // Fallback to tarball
      const folderExpanded = await expandGitHubFolder(rawUrl);
      if (!folderExpanded) {
        return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'unknown', contentType: null };
      }
      return {
        tarballUrl: folderExpanded.tarballUrl,
        subPath: folderExpanded.subPath,
        fileContent: null,
        urlType: 'github_folder',
        contentType: null
      };
    }

    case 'skills_sh': {
      const expanded = await expandSkillsShUrl(rawUrl);
      if (!expanded) {
        return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'unknown', contentType: null };
      }

      // Extract owner/repo from the tarball URL for direct file fetch
      const parsed = parseURL(rawUrl);
      const shParts = parsed?.pathname.split('/').filter(Boolean) ?? [];
      const owner = shParts[0];
      const repo = shParts[1];

      // Try fetching the skill file directly (avoids downloading huge repos)
      if (owner && repo) {
        const fileResult = await fetchSkillFileFromGitHub(owner, repo, expanded.subPath);
        if (fileResult) {
          log.info({ url: rawUrl, subPath: expanded.subPath }, 'Resolved skills.sh to direct file fetch');
          return {
            tarballUrl: '',
            subPath: null,
            fileContent: fileResult.content,
            urlType: 'skills_sh',
            contentType: fileResult.contentType
          };
        }
      }

      // Fallback to tarball + sub_path
      return {
        tarballUrl: expanded.tarballUrl,
        subPath: expanded.subPath,
        fileContent: null,
        urlType: 'skills_sh',
        contentType: null
      };
    }

    case 'agentskills_il': {
      // Try resolving to inline content first (avoids tarball download)
      const content = await resolveAgentskillsContent(rawUrl);
      if (content) {
        log.info({ url: rawUrl }, 'Resolved agentskills.co.il to direct file fetch');
        return {
          tarballUrl: '',
          subPath: null,
          fileContent: content.content,
          urlType: 'agentskills_il',
          contentType: content.contentType
        };
      }

      // Fallback: try page scraping to get GitHub tarball URL
      const expanded = await expandAgentskillsUrl(rawUrl);
      if (expanded) {
        return {
          tarballUrl: expanded.tarballUrl,
          subPath: expanded.subPath,
          fileContent: null,
          urlType: 'agentskills_il',
          contentType: null
        };
      }

      return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'unknown', contentType: null };
    }

    default:
      return { tarballUrl: rawUrl, subPath: null, fileContent: null, urlType: 'tarball', contentType: null };
  }
}
