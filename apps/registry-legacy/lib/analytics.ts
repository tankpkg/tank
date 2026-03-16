/**
 * GA4 custom event tracking. Only fires when `window.gtag` exists
 * (safe for dev, tests, ad-blockers). Event names follow GA4 snake_case convention.
 */

import posthog from 'posthog-js';

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
  }
}

function sendEvent(eventName: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
  if (posthog.__loaded) {
    posthog.capture(eventName, params);
  }
}

export function trackCtaClick(label: string, destination: string): void {
  sendEvent('cta_click', { label, destination });
}

export function trackSkillView(name: string, score: number | null): void {
  sendEvent('skill_view', {
    skill_name: name,
    ...(score !== null ? { audit_score: score } : {})
  });
}

export function trackSkillSearch(query: string): void {
  sendEvent('skill_search', { search_term: query });
}

export function trackSkillDownload(name: string, version: string): void {
  sendEvent('skill_download', { skill_name: name, version });
}

export function trackSkillStar(name: string, starred: boolean): void {
  sendEvent('skill_star', { skill_name: name, action: starred ? 'star' : 'unstar' });
}

export function trackInstallCopy(name: string, scope: 'project' | 'global'): void {
  sendEvent('install_copy', { skill_name: name, scope });
}
