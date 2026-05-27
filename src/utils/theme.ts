export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

export function getStoredPreference(): ThemePreference | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredPreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // localStorage unavailable
  }
}

export function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return getSystemPreference();
  return preference;
}

export function applyTheme(preference: ThemePreference, enableTransition = true): void {
  const html = document.documentElement;

  if (enableTransition) {
    html.setAttribute('data-theme-transition', '');
    setTimeout(() => {
      html.removeAttribute('data-theme-transition');
    }, 250);
  }

  html.setAttribute('data-theme', preference);
}

export function initTheme(): ThemePreference {
  const stored = getStoredPreference();
  const preference = stored || 'system';
  applyTheme(preference, false);
  return preference;
}

export function onSystemPreferenceChange(callback: (isDark: boolean) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
}
