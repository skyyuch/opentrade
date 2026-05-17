/**
 * Phase 0 placeholder home page.
 *
 * Renders the localised tagline so the i18n plumbing can be smoke-tested
 * end to end (`/`, `/zh-Hans`, `/en`) before the real page lands. The
 * `/status` route added in t5 will be the first non-placeholder surface.
 */

import { getTranslations } from 'next-intl/server';

import type { ReactNode } from 'react';

const HomePage = async (): Promise<ReactNode> => {
  const t = await getTranslations('home');

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('tagline')}</p>
      <small>{t('phaseNotice')}</small>
    </main>
  );
};

export default HomePage;
