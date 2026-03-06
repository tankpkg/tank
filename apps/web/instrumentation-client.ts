/**
 * PostHog client initialization — runs once before any page renders.
 * This is the recommended Next.js 15 pattern (instrumentation-client.ts).
 *
 * GDPR: Capturing is opted-out by default. Nothing is sent until the user
 * accepts analytics cookies via the CookieConsentManager component, which
 * calls posthog.opt_in_capturing().
 */
import posthog from 'posthog-js';

if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_POSTHOG_KEY &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    ui_host: 'https://eu.posthog.com',
    // GDPR: don't track until user accepts cookies
    opt_out_capturing_by_default: true,
    opt_out_capturing_persistence_type: 'localStorage',
    // If user rejects, use cookieless mode (no _ph_ cookies)
    person_profiles: 'identified_only',
    capture_pageview: false, // We send pageviews manually for SPA routing
    capture_pageleave: true,
  });
}
