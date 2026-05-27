import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredPreference, setStoredPreference, getSystemPreference, resolveTheme, applyTheme, initTheme } from './theme';

describe('theme utils', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-transition');
  });

  describe('getStoredPreference', () => {
    it('returns null when nothing stored', () => {
      expect(getStoredPreference()).toBeNull();
    });

    it('returns stored preference when valid', () => {
      localStorage.setItem('theme-preference', 'dark');
      expect(getStoredPreference()).toBe('dark');
    });

    it('returns null for invalid stored value', () => {
      localStorage.setItem('theme-preference', 'invalid');
      expect(getStoredPreference()).toBeNull();
    });

    it('returns null when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error(); });
      expect(getStoredPreference()).toBeNull();
      vi.restoreAllMocks();
    });
  });

  describe('setStoredPreference', () => {
    it('stores preference in localStorage', () => {
      setStoredPreference('dark');
      expect(localStorage.getItem('theme-preference')).toBe('dark');
    });

    it('does not throw when localStorage unavailable', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error(); });
      expect(() => setStoredPreference('light')).not.toThrow();
      vi.restoreAllMocks();
    });
  });

  describe('getSystemPreference', () => {
    it('returns light or dark based on matchMedia', () => {
      const result = getSystemPreference();
      expect(['light', 'dark']).toContain(result);
    });
  });

  describe('resolveTheme', () => {
    it('returns light for light preference', () => {
      expect(resolveTheme('light')).toBe('light');
    });

    it('returns dark for dark preference', () => {
      expect(resolveTheme('dark')).toBe('dark');
    });

    it('returns system preference for system', () => {
      const result = resolveTheme('system');
      expect(['light', 'dark']).toContain(result);
    });
  });

  describe('applyTheme', () => {
    it('sets data-theme attribute to preference', () => {
      applyTheme('dark', false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('sets data-theme to system for system preference', () => {
      applyTheme('system', false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('system');
    });

    it('adds transition attribute when enableTransition is true', () => {
      applyTheme('light', true);
      expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(true);
    });

    it('does not add transition attribute when enableTransition is false', () => {
      applyTheme('light', false);
      expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false);
    });
  });

  describe('initTheme', () => {
    it('returns system when nothing stored', () => {
      const result = initTheme();
      expect(result).toBe('system');
    });

    it('returns stored preference when available', () => {
      localStorage.setItem('theme-preference', 'dark');
      const result = initTheme();
      expect(result).toBe('dark');
    });

    it('applies theme without transition', () => {
      initTheme();
      expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false);
    });
  });
});
