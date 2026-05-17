/**
 * Phase 0 placeholder dashboard for `apps/console`.
 *
 * Renders the localised back-office overview so the i18n + Tailwind +
 * dark-default pipelines can be smoke-tested end to end (`/`,
 * `/zh-Hans`, `/en`) before the real KYC-gated dashboard lands. Every
 * surface here is intentionally read-only and locally rendered:
 *
 *   - No API call (auth + KYC + RBAC arrive in Phase 1; the network
 *     contract for those endpoints is still on the design board).
 *   - No `<ImmutableMark>` — per ADR-0011 §5.1 the on-chain stamp is
 *     only ever shown over real chain data, never on Phase 0 mock copy.
 *     ImmutableMark's first non-Storybook home is the first real review
 *     card in Phase 1 MVP-A.
 *   - No personal user content yet, so PDPO + log redaction concerns
 *     (rule 50) are inert; we still keep the page free of any
 *     hard-coded broker/KOL identifiers.
 *
 * Per cursor rule 22 every utility class is a Tailwind token; no raw
 * hex / px values appear here.
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
    <main className="container mx-auto flex min-h-screen flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles aria-hidden className="h-3.5 w-3.5" />
          {t('eyebrow')}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {t('shellTitle')}
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {t('shellDescription')}
        </p>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('phaseNotice')}</p>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t('sectionsTitle')}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SECTION_KEYS.map((key) => {
            const Icon = SECTION_ICONS[key];
            return (
              <article
                key={key}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6 text-card-foreground"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {t(`sections.${key}.title`)}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`sections.${key}.description`)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Megaphone aria-hidden className="h-4 w-4" />
          <span className="font-medium">{t('phaseHint')}</span>
        </div>
        <p>{t('subtitle')}</p>
      </aside>

      <footer className="border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
        {t('disclaimer')}
      </footer>
    </main>
  );
};

export default DashboardPage;
