import { useEffect } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';

import { initPostHog, optInAnalytics, optOutAnalytics } from '~/lib/analytics';

import 'vanilla-cookieconsent/dist/cookieconsent.css';

export function CookieConsentManager() {
  useEffect(() => {
    initPostHog();

    CookieConsent.run({
      categories: {
        necessary: {
          enabled: true,
          readOnly: true
        },
        analytics: {}
      },

      onFirstConsent: ({ cookie }) => {
        if (cookie.categories.includes('analytics')) {
          optInAnalytics();
        }
      },

      onConsent: ({ cookie }) => {
        if (cookie.categories.includes('analytics')) {
          optInAnalytics();
        }
      },

      onChange: ({ cookie }) => {
        if (cookie.categories.includes('analytics')) {
          optInAnalytics();
        } else {
          optOutAnalytics();
        }
      },

      guiOptions: {
        consentModal: {
          layout: 'bar',
          position: 'bottom'
        }
      },

      language: {
        default: 'en',
        translations: {
          en: {
            consentModal: {
              title: 'Cookie preferences',
              description:
                'We use cookies to understand how you use Tank and to improve your experience. You can choose which cookies to allow.',
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
                  title: 'Cookie usage',
                  description:
                    'We use cookies to ensure basic site functionality and to improve your experience. You can choose to opt in or out of each category at any time.'
                },
                {
                  title: 'Strictly necessary cookies',
                  description: 'These cookies are essential for the website to function and cannot be switched off.',
                  linkedCategory: 'necessary'
                },
                {
                  title: 'Analytics cookies',
                  description:
                    'These cookies help us understand how visitors interact with Tank so we can improve the experience.',
                  linkedCategory: 'analytics'
                }
              ]
            }
          }
        }
      }
    });
  }, []);

  return null;
}
