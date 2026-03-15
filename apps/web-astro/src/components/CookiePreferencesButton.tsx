export function CookiePreferencesButton() {
  const handleClick = () => {
    // Will be wired to vanilla-cookieconsent when consent is set up
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="cookie-preferences-btn"
      className="hover:text-emerald-400 transition-colors">
      Cookie Settings
    </button>
  );
}
