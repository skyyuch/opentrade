/**
 * Default dashboard for `apps/console`.
 *
 * Shows feature overview cards for non-admin, non-broker users.
 * UI design by Google — dark theme.
 */

import { Gavel, Megaphone, ShieldCheck, Sparkles, Star, TrendingUp } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { ReactNode } from 'react';

const SECTION_KEYS = ['claim', 'reviews', 'signals', 'disputes'] as const;

const SECTION_ICONS: Record<(typeof SECTION_KEYS)[number], typeof ShieldCheck> = {
  claim: ShieldCheck,
  reviews: Star,
  signals: TrendingUp,
  disputes: Gavel,
};

const DashboardPage = async (): Promise<ReactNode> => {
  const t = await getTranslations('dashboard');

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[#00FF88]">
          <Sparkles aria-hidden className="h-3.5 w-3.5" />
          {t('eyebrow')}
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('shellTitle')}</h1>
        <p className="max-w-3xl text-base leading-relaxed text-white/50 md:text-lg">
          {t('shellDescription')}
        </p>
        <p className="inline-block rounded-full bg-[#00FF88]/10 border border-[#00FF88]/20 px-4 py-1.5 text-xs font-bold text-[#00FF88]">
          {t('phaseNotice')}
        </p>
      </header>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white/40">
          {t('sectionsTitle')}
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {SECTION_KEYS.map((key) => {
            const Icon = SECTION_ICONS[key];
            return (
              <article
                key={key}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 group hover:border-[#00FF88]/20 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 group-hover:bg-[#00FF88]/20 transition-colors"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-bold tracking-tight">
                    {t(`sections.${key}.title`)}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-white/50">
                  {t(`sections.${key}.description`)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/50">
        <div className="flex items-center gap-2 text-white mb-2">
          <Megaphone aria-hidden className="h-4 w-4" />
          <span className="font-bold">{t('phaseHint')}</span>
        </div>
        <p>{t('subtitle')}</p>
      </aside>

      <footer className="border-t border-white/10 pt-6 text-xs leading-relaxed text-white/40">
        {t('disclaimer')}
      </footer>
    </div>
  );
};

export default DashboardPage;
