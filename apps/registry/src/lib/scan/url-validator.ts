/**
 * SSRF protection for the public scan API.
 *
 * Validates tarball URLs to prevent Server-Side Request Forgery attacks.
 * Rejects private/internal IPs, non-HTTPS URLs, and suspicious patterns.
 */

import { env } from '~/consts/env';

const isDev = env.NODE_ENV === 'development';

// Private IP ranges (RFC 1918 + loopback + link-local)
const PRIVATE_IP_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^127\./, // Loopback
  /^0\./, // 0.0.0.0/8
  /^169\.254\./, // Link-local
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?fd/, // IPv6 ULA
  /^\[?fe80/ // IPv6 link-local
];

// Allowed tarball URL patterns
const ALLOWED_HOSTS = [
  'registry.npmjs.org',
  'npm.pkg.github.com',
  'ghcr.io',
  'github.com',
  'codeload.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'skills.sh',
  'www.skills.sh',
  'agentskills.co.il',
  'www.agentskills.co.il'
];

export interface URLValidationResult {
  valid: boolean;
  error?: string;
}

export function validateScanUrl(rawUrl: string): URLValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol check
  if (isDev) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { valid: false, error: 'URL must use HTTP or HTTPS' };
    }
  } else if (url.protocol !== 'https:') {
    return { valid: false, error: 'URL must use HTTPS' };
  }

  // Host check — must be a known registry host
  const hostname = url.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));

  if (!isAllowedHost) {
    return {
      valid: false,
      error: 'URL host must be a known registry (npmjs.org, github.com, ghcr.io, skills.sh, agentskills.co.il)'
    };
  }

  // SSRF: Check for private IPs in hostname
  const isPrivate = PRIVATE_IP_PATTERNS.some((p) => p.test(hostname));
  if (isPrivate && !isDev) {
    return { valid: false, error: 'URL must not point to a private IP address' };
  }

  // Block common internal hostnames
  const blockedHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal'];
  if (blockedHosts.includes(hostname) && !isDev) {
    return { valid: false, error: 'URL must not point to localhost' };
  }

  // URL length sanity check
  if (rawUrl.length > 2048) {
    return { valid: false, error: 'URL is too long (max 2048 characters)' };
  }

  return { valid: true };
}
