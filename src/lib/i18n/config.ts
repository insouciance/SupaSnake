/**
 * Internationalization Configuration
 * Defines supported locales and default language settings
 */

export const i18nConfig = {
  defaultLocale: 'en',
  locales: ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh'] as const,
} as const;

export type Locale = (typeof i18nConfig.locales)[number];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  de: '🇩🇪',
  fr: '🇫🇷',
  es: '🇪🇸',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
};

/**
 * Check if a locale is supported
 */
export function isValidLocale(locale: string): locale is Locale {
  return i18nConfig.locales.includes(locale as Locale);
}

/**
 * Get the best matching locale from Accept-Language header
 */
export function getPreferredLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) {
    return i18nConfig.defaultLocale;
  }

  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, priority = '1'] = lang.trim().split(';q=');
      return {
        code: code.split('-')[0].toLowerCase(),
        priority: parseFloat(priority),
      };
    })
    .sort((a, b) => b.priority - a.priority);

  for (const { code } of languages) {
    if (isValidLocale(code)) {
      return code;
    }
  }

  return i18nConfig.defaultLocale;
}
