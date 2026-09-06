export type DisplayPreferences = { theme: "light" | "dark"; language: "zh" | "en" };

// Only non-sensitive display preferences are persisted. Restricted browser storage
// must never prevent theme/language controls from updating the current page.
export function readDisplayPreferences(): DisplayPreferences {
  const root = document.documentElement;
  const current: DisplayPreferences = {
    theme: root.dataset.theme === "light" ? "light" : "dark",
    language: root.dataset.language === "en" ? "en" : "zh",
  };
  try {
    const theme = localStorage.getItem("welinkbtc-theme");
    const language = localStorage.getItem("welinkbtc-language");
    if (theme === "light" || theme === "dark") current.theme = theme;
    if (language === "zh" || language === "en") current.language = language;
  } catch { /* Keep the current document preferences when storage is unavailable. */ }
  return current;
}

export function persistDisplayPreference<K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) {
  try { localStorage.setItem(`welinkbtc-${key}`, value); }
  catch { /* The preference still applies to this page without persistence. */ }
}
