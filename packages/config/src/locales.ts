/**
 * Locale configuration for OpenTrade.
 *
 * Single source of truth for supported locales and the default locale.
 * Consumed by apps/web and apps/console (next-intl routing) and apps/api
 * (AI translation target languages).
 *
 * Per ADR-0003: zh-Hant default, zh-Hans, en.
 */

export const defaultLocale = 'zh-Hant' as const;

export const supportedLocales = ['zh-Hant', 'zh-Hans', 'en'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (supportedLocales as readonly string[]).includes(value);
}
