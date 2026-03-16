import posthog from 'posthog-js';

let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === 'undefined') return;

  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST;

  if (!key || !host) return;

  posthog.init(key, {
    api_host: host,
    ui_host: 'https://eu.posthog.com',
    opt_out_capturing_by_default: true,
    opt_out_capturing_persistence_type: 'localStorage',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true
  });

  initialized = true;
}

export function optInAnalytics() {
  if (typeof window === 'undefined') return;
  posthog.opt_in_capturing();
}

export function optOutAnalytics() {
  if (typeof window === 'undefined') return;
  posthog.opt_out_capturing();
}

export function capturePageview() {
  if (typeof window === 'undefined') return;
  posthog.capture('$pageview');
}
