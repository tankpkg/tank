'use client';

import { useEffect } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';
import posthog from 'posthog-js';

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

function updateGtagConsent(analyticsGranted: boolean): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('consent', 'update', {
    analytics_storage: analyticsGranted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
}

function syncConsent(): void {
  const analyticsAccepted = CookieConsent.acceptedCategory('analytics');

  if (analyticsAccepted) {
    posthog.opt_in_capturing();
    posthog.capture('$pageview');
  } else {
    posthog.opt_out_capturing();
  }

  updateGtagConsent(analyticsAccepted);
}

export function CookieConsentManager() {
  useEffect(() => {
    CookieConsent.run({
      cookie: {
        name: 'cc_cookie',
        expiresAfterDays: 365,
        sameSite: 'Lax'
      },
      // GDPR: opt-in mode means nothing fires until user explicitly accepts
      mode: 'opt-in',
      categories: {
        necessary: {
          enabled: true,
          readOnly: true
        },
        analytics: {
          autoClear: {
            cookies: [{ name: /^_ga/ }, { name: '_gid' }, { name: /^ph_/ }, { name: /^__ph/ }]
          }
        }
      },
      onConsent: () => syncConsent(),
      onChange: () => syncConsent(),
      language: {
        default: 'en',
        translations: {
          en: {
            consentModal: {
              title: 'We use cookies',
              description:
                'We use essential cookies to make our site work. With your consent, we also use analytics cookies (PostHog, Google Analytics) to understand how you use Tank and improve your experience. No data is sold to third parties.',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Reject all',
              showPreferencesBtn: 'Manage preferences'
            },
            preferencesModal: {
              title: 'Cookie preferences',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Reject all',
              savePreferencesBtn: 'Save preferences',
              closeIconLabel: 'Close',
              sections: [
                {
                  title: 'Strictly necessary cookies',
                  description: 'These cookies are required for the website to function and cannot be disabled.',
                  linkedCategory: 'necessary'
                },
                {
                  title: 'Analytics cookies',
                  description:
                    'These cookies help us understand how visitors interact with our website. We use PostHog and Google Analytics. All data is used solely to improve Tank.',
                  linkedCategory: 'analytics',
                  cookieTable: {
                    headers: {
                      name: 'Cookie',
                      domain: 'Domain',
                      description: 'Description'
                    },
                    body: [
                      {
                        name: '_ga',
                        domain: 'tankpkg.dev',
                        description: 'Google Analytics — distinguishes users (2 years)'
                      },
                      {
                        name: '_gid',
                        domain: 'tankpkg.dev',
                        description: 'Google Analytics — distinguishes users (24 hours)'
                      },
                      {
                        name: 'ph_*',
                        domain: 'tankpkg.dev',
                        description: 'PostHog — product analytics (1 year)'
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    });
  }, []);

  return <div data-testid="cookie-consent-manager" data-analytics="posthog" />;
}

export function showCookiePreferences(): void {
  CookieConsent.showPreferences();
}
