/**
 * i18n Configuration Tests
 * Validates locale handling and language detection
 */

import {
  i18nConfig,
  Locale,
  localeNames,
  localeFlags,
  isValidLocale,
  getPreferredLocale,
} from './config';

describe('i18n Configuration', () => {
  describe('i18nConfig', () => {
    it('should have default locale as English', () => {
      expect(i18nConfig.defaultLocale).toBe('en');
    });

    it('should have supported locales', () => {
      expect(i18nConfig.locales).toContain('en');
      expect(i18nConfig.locales).toContain('de');
      expect(i18nConfig.locales).toContain('fr');
      expect(i18nConfig.locales).toContain('es');
      expect(i18nConfig.locales).toContain('ja');
      expect(i18nConfig.locales).toContain('ko');
      expect(i18nConfig.locales).toContain('zh');
    });

    it('should have 7 supported locales', () => {
      expect(i18nConfig.locales.length).toBe(7);
    });
  });

  describe('localeNames', () => {
    it('should have display names for all locales', () => {
      i18nConfig.locales.forEach((locale) => {
        expect(localeNames[locale]).toBeDefined();
        expect(typeof localeNames[locale]).toBe('string');
        expect(localeNames[locale].length).toBeGreaterThan(0);
      });
    });

    it('should have correct English name', () => {
      expect(localeNames.en).toBe('English');
    });

    it('should have correct German name', () => {
      expect(localeNames.de).toBe('Deutsch');
    });

    it('should have correct Japanese name', () => {
      expect(localeNames.ja).toBe('日本語');
    });
  });

  describe('localeFlags', () => {
    it('should have flag emojis for all locales', () => {
      i18nConfig.locales.forEach((locale) => {
        expect(localeFlags[locale]).toBeDefined();
        expect(typeof localeFlags[locale]).toBe('string');
      });
    });

    it('should have UK flag for English', () => {
      expect(localeFlags.en).toBe('🇬🇧');
    });

    it('should have German flag for German', () => {
      expect(localeFlags.de).toBe('🇩🇪');
    });
  });

  describe('isValidLocale', () => {
    it('should return true for valid locales', () => {
      expect(isValidLocale('en')).toBe(true);
      expect(isValidLocale('de')).toBe(true);
      expect(isValidLocale('fr')).toBe(true);
      expect(isValidLocale('es')).toBe(true);
      expect(isValidLocale('ja')).toBe(true);
      expect(isValidLocale('ko')).toBe(true);
      expect(isValidLocale('zh')).toBe(true);
    });

    it('should return false for invalid locales', () => {
      expect(isValidLocale('invalid')).toBe(false);
      expect(isValidLocale('pt')).toBe(false);
      expect(isValidLocale('it')).toBe(false);
      expect(isValidLocale('ru')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidLocale('')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isValidLocale('EN')).toBe(false);
      expect(isValidLocale('En')).toBe(false);
    });
  });

  describe('getPreferredLocale', () => {
    it('should return default locale for null Accept-Language', () => {
      expect(getPreferredLocale(null)).toBe('en');
    });

    it('should return default locale for empty string', () => {
      expect(getPreferredLocale('')).toBe('en');
    });

    it('should parse simple Accept-Language header', () => {
      expect(getPreferredLocale('de')).toBe('de');
      expect(getPreferredLocale('fr')).toBe('fr');
      expect(getPreferredLocale('ja')).toBe('ja');
    });

    it('should parse Accept-Language with region', () => {
      expect(getPreferredLocale('en-US')).toBe('en');
      expect(getPreferredLocale('de-DE')).toBe('de');
      expect(getPreferredLocale('zh-CN')).toBe('zh');
      expect(getPreferredLocale('ja-JP')).toBe('ja');
    });

    it('should handle multiple languages with priorities', () => {
      expect(getPreferredLocale('de,en;q=0.9')).toBe('de');
      expect(getPreferredLocale('en;q=0.8,de;q=0.9')).toBe('de');
      expect(getPreferredLocale('ja;q=0.5,ko;q=0.9,en;q=0.8')).toBe('ko');
    });

    it('should fall back to default for unsupported languages', () => {
      expect(getPreferredLocale('pt')).toBe('en');
      expect(getPreferredLocale('it,ru')).toBe('en');
    });

    it('should find first supported language from list', () => {
      expect(getPreferredLocale('pt,it,de')).toBe('de');
      expect(getPreferredLocale('ru,zh,en')).toBe('zh');
    });

    it('should handle complex Accept-Language header', () => {
      const header = 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6';
      expect(getPreferredLocale(header)).toBe('de');
    });

    it('should handle whitespace in header', () => {
      expect(getPreferredLocale('de, en; q=0.9')).toBe('de');
      expect(getPreferredLocale('  fr  ')).toBe('fr');
    });
  });
});
