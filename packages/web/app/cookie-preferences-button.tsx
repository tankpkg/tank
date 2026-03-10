'use client';

import { showCookiePreferences } from '@/components/cookie-consent-manager';

export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={showCookiePreferences}
      data-testid="cookie-preferences-btn"
      className="hover:text-emerald-400 transition-colors">
      Cookie Settings
    </button>
  );
}
