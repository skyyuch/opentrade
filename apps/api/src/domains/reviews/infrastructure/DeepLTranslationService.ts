/**
 * DeepL-backed translation service for user-generated content.
 *
 * Per ADR-0023: translates review title and body into the two non-source
 * locales at submission time. Stores results in ReviewTranslation rows.
 *
 * DeepL language codes:
 *   - zh-Hant → ZH (DeepL auto-detects traditional)
 *   - zh-Hans → ZH (target uses ZH for simplified, but we can't distinguish)
 *   - en → EN-US
 *
 * For Phase 1 we map OpenTrade locales to DeepL target_lang codes. DeepL's
 * source auto-detection handles the input language.
 */

import type { PrismaClient } from '@opentrade/db';

const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';

const LOCALE_TO_DEEPL_TARGET: Record<string, string> = {
  'zh-Hant': 'ZH-HANT',
  'zh-Hans': 'ZH-HANS',
  en: 'EN-US',
};

const ALL_LOCALES = ['zh-Hant', 'zh-Hans', 'en'] as const;

type TranslateResult = {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
};

export class DeepLTranslationService {
  constructor(
    private readonly apiKey: string,
    private readonly prisma: PrismaClient,
  ) {}

  async translateReview(reviewId: string, title: string, body: string): Promise<string | null> {
    const detectResult = await this.callDeepL(title, 'EN-US');
    const detectedLang = detectResult?.detected_source_language ?? 'EN';

    const sourceLocale = this.deeplLangToLocale(detectedLang);

    await this.prisma.review.update({
      where: { id: reviewId },
      data: { sourceLocale },
    });

    const targetLocales = ALL_LOCALES.filter((l) => l !== sourceLocale);

    for (const locale of targetLocales) {
      const targetLang = LOCALE_TO_DEEPL_TARGET[locale];
      if (!targetLang) continue;

      const [translatedTitle, translatedBody] = await Promise.all([
        this.callDeepL(title, targetLang),
        this.callDeepL(body, targetLang),
      ]);

      if (translatedTitle && translatedBody) {
        await this.prisma.reviewTranslation.upsert({
          where: { reviewId_locale: { reviewId, locale } },
          create: {
            reviewId,
            locale,
            title: translatedTitle.text,
            body: translatedBody.text,
          },
          update: {
            title: translatedTitle.text,
            body: translatedBody.text,
            translatedAt: new Date(),
          },
        });
      }
    }

    return sourceLocale;
  }

  private async callDeepL(
    text: string,
    targetLang: string,
  ): Promise<{ text: string; detected_source_language: string } | null> {
    try {
      const res = await fetch(DEEPL_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [text],
          target_lang: targetLang,
        }),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as TranslateResult;
      const first = data.translations[0];
      return first ?? null;
    } catch {
      return null;
    }
  }

  private deeplLangToLocale(deeplLang: string): string {
    const upper = deeplLang.toUpperCase();
    if (upper === 'ZH' || upper === 'ZH-HANT') return 'zh-Hant';
    if (upper === 'ZH-HANS') return 'zh-Hans';
    return 'en';
  }
}
