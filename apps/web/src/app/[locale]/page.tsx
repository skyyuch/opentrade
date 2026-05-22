import { Activity, Building2, Scale, ShieldCheck, TrendingUp } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '../../i18n/navigation';

import type { ReactNode } from 'react';

const HomePage = async (): Promise<ReactNode> => {
  const t = await getTranslations('home');

  return (
    <div className="relative overflow-hidden">
      {/* Background atmospheric glows */}
      <div className="pointer-events-none absolute right-[-5%] top-[-10%] h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[100px]" />

      {/* Hero Section */}
      <section className="relative z-10 mx-auto flex max-w-7xl flex-col items-center gap-12 px-6 py-16 lg:flex-row lg:items-center lg:px-10 lg:py-24">
        {/* Left: text content */}
        <div className="w-full space-y-8 lg:w-1/2">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 sm:text-xs">
              {t('badge')}
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t('heroTitle1')}
            <br />
            <span className="text-emerald-500">{t('heroTitle2')}</span>
          </h1>

          {/* Description */}
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            {t.rich('heroDesc', {
              immutable: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              href="/brokers"
              className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-background transition-opacity hover:opacity-90"
            >
              {t('ctaBrokers')}
            </Link>
            <Link
              href="/verify"
              className="rounded-full border border-border px-6 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted"
            >
              {t('ctaLearnMore')}
            </Link>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 pt-4 sm:gap-8">
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-emerald-500 sm:text-4xl">3,482</span>
              <span className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {t('statBrokers')}
              </span>
            </div>
            <div className="mx-2 h-12 w-px self-center bg-border" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-foreground sm:text-4xl">100%</span>
              <span className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {t('statReviews')}
              </span>
            </div>
          </div>
        </div>

        {/* Right: KOL Signal Tracker card */}
        <div className="relative mt-8 w-full lg:mt-0 lg:w-1/2">
          <div className="relative z-10 w-full max-w-[500px] rounded-2xl border border-border bg-card/40 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:ml-auto">
            {/* Card header */}
            <div className="mb-8 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                <Activity size={16} className="text-emerald-500" />
                {t('kolTracker')}
              </h3>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                {t('liveFeed')}
              </span>
            </div>

            <div className="space-y-4">
              {/* Trade record 1 */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-gradient-to-br from-muted to-background text-sm font-bold">
                    HK
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">CryptoKing.eth</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      HSBC HK - {t('kolBuyOrder')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-emerald-500">+12.4%</div>
                  <div className="mt-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t('verifiedOnChain')}
                  </div>
                </div>
              </div>

              {/* Trade record 2 */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-gradient-to-br from-muted to-background text-sm font-bold">
                    TF
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">TradeFlow_KOL</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Futu - {t('kolSellOrder')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-red-400">-4.2%</div>
                  <div className="mt-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t('immutableRecord')}
                  </div>
                </div>
              </div>

              {/* Jury consensus bar */}
              <div className="mt-4 border-t border-border pt-6">
                <div className="mb-3 flex justify-between text-xs">
                  <span className="font-medium text-muted-foreground">{t('juryStatus')}</span>
                  <span className="font-bold text-emerald-500">98.2%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[98.2%] rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                </div>
              </div>
            </div>
          </div>

          {/* Decorative offset border */}
          <div className="absolute right-0 top-0 -z-10 hidden h-full w-full max-w-[500px] translate-x-3 translate-y-3 rounded-2xl border-2 border-emerald-500/20 sm:block lg:translate-x-4 lg:translate-y-4" />
        </div>
      </section>

      {/* Feature bar */}
      <section className="relative z-20 grid grid-cols-1 border-t border-border bg-card/40 backdrop-blur-lg sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-start gap-4 border-b border-border p-6 transition-colors hover:bg-muted/30 sm:border-b-0 sm:border-r lg:p-8">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-foreground">
              {t('featureImmutable')}
            </h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('featureImmutableDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 border-b border-border p-6 transition-colors hover:bg-muted/30 sm:border-r lg:border-b-0 lg:p-8">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
            <Scale size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-foreground">
              {t('featureJury')}
            </h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('featureJuryDesc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 border-b border-border p-6 transition-colors hover:bg-muted/30 sm:border-b-0 sm:border-r lg:p-8">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
            <TrendingUp size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-foreground">
              {t('featureKol')}
            </h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('featureKolDesc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-6 transition-colors hover:bg-muted/30 lg:p-8">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
            <Building2 size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-foreground">
              {t('featureBrokers')}
            </h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('featureBrokersDesc')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
