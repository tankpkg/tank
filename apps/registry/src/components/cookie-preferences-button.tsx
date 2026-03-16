import * as CookieConsent from 'vanilla-cookieconsent';

export function CookiePreferencesButton() {
  return (
    <button type="button" onClick={() => CookieConsent.showPreferences()} className="hover:text-tank transition-colors">
      Cookie Settings
    </button>
  );
}
