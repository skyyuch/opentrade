/**
 * Phase 0 placeholder home page.
 *
 * Renders the localised tagline so the i18n + Tailwind pipelines can be
 * smoke-tested end to end (`/`, `/zh-Hans`, `/en`) before the real page
 * lands. The `/status` route added in t5 is the first real surface.
 *
 * Per cursor rule 22 every utility class is a Tailwind token; no raw
 * hex / px values appear here.
 */

import { getTranslations } from 'next-intl/server';

import type { ReactNode } from 'react';

const HomePage = async (): Promise<ReactNode> => {
  const t = await getTranslations('home');

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t('phaseNotice')}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        {t('title')}
      </h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
        {t('tagline')}
      </p>
    </main>
  );
};

export default HomePage;
