import { Activity, Building2, Scale, ShieldCheck, TrendingUp } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '../../i18n/navigation';

import type { ReactNode } from 'react';

const ACCENT = '#00FF88';

const HomePage = async (): Promise<ReactNode> => {
  const t = await getTranslations('home');

  return (
    <div className="-mt-16 relative pt-16">
      {/* Background atmospheric glows — fixed to viewport so they bleed through the transparent header */}
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-[120px]" />

      {/* Hero Section */}
      <section className="relative z-10 mx-auto flex max-w-7xl flex-col items-center gap-12 px-6 py-16 lg:flex-row lg:items-center lg:px-10 lg:py-24">
        {/* Left: text content */}
        <div className="w-full space-y-8 lg:w-1/2">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00FF88]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#00FF88] sm:text-xs">
              {t('badge')}
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
            {t('heroTitle1')}
            <br />
            <span className="text-[#00FF88]">{t('heroTitle2')}</span>
          </h1>

          {/* Description */}
          <p className="max-w-lg text-lg leading-relaxed text-white/50">
            {t('heroDesc', { immutable: t('immutable') })}
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              href="/brokers"
              className="rounded-full bg-[#00FF88] px-6 py-3 text-sm font-bold text-[#050608] transition-all hover:bg-[#00D170]"
            >
              {t('ctaBrokers')}
            </Link>
            <Link
              href="/verify"
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/5"
            >
              {t('ctaLearnMore')}
            </Link>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 pt-4 sm:gap-8">
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-[#00FF88] sm:text-4xl">3,482</span>
              <span className="mt-1 text-xs uppercase tracking-wider text-white/40">
                {t('statBrokers')}
              </span>
            </div>
            <div className="mx-2 h-12 w-px self-center bg-white/10" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white sm:text-4xl">1.2M+</span>
              <span className="mt-1 text-xs uppercase tracking-wider text-white/40">
                {t('statReviews')}
              </span>
            </div>
          </div>
        </div>

        {/* Right: KOL Signal Tracker card */}
        <div className="relative mt-8 w-full lg:mt-0 lg:w-1/2">
          <div className="relative z-10 w-full max-w-[500px] rounded-2xl border border-white/10 bg-zinc-900/40 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:ml-auto">
            {/* Card header */}
            <div className="mb-8 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/40">
                <Activity size={16} style={{ color: ACCENT }} />
                KOL SIGNAL TRACKER
              </h3>
              <span className="rounded border border-[#00FF88]/30 bg-[#00FF88]/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#00FF88]">
                LIVE FEED
              </span>
            </div>

            <div className="space-y-4">
              {/* Trade record 1 */}
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/10">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-zinc-700 to-zinc-900 text-sm font-bold text-white">
                    HK
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">CryptoKing.eth</div>
                    <div className="mt-0.5 text-xs text-white/40">HSBC HK - Buy Order</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-[#00FF88]">+12.4%</div>
                  <div className="mt-1 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/30">
                    Verified on Chain
                  </div>
                </div>
              </div>

              {/* Trade record 2 */}
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/10">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-zinc-700 to-zinc-900 text-sm font-bold text-white">
                    TF
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">TradeFlow_KOL</div>
                    <div className="mt-0.5 text-xs text-white/40">Futubull - Sell Order</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-red-400">-4.2%</div>
                  <div className="mt-1 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/30">
                    Immutable Record
                  </div>
                </div>
              </div>

              {/* Jury consensus bar */}
              <div className="mt-4 border-t border-white/10 pt-6">
                <div className="mb-3 flex justify-between text-xs">
                  <span className="font-medium text-white/40">Decentralized Jury Status</span>
                  <span className="font-bold text-[#00FF88]">98.2% Consensus</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full w-[98.2%] rounded-full bg-[#00FF88]"
                    style={{ boxShadow: '0 0 10px #00FF88' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Decorative offset border */}
          <div className="absolute right-0 top-0 -z-10 hidden h-full w-full max-w-[500px] translate-x-3 translate-y-3 rounded-2xl border-2 border-[#00FF88]/20 sm:block lg:translate-x-4 lg:translate-y-4" />
        </div>
      </section>

      {/* Feature bar */}
      <section className="relative z-20 grid grid-cols-1 border-t border-white/10 bg-black/40 backdrop-blur-lg sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-start gap-4 border-b border-white/10 p-6 transition-colors hover:bg-white/5 sm:border-b-0 sm:border-r lg:p-8">
          <div className="rounded-lg bg-[#00FF88]/10 p-2 text-[#00FF88]">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-white">
              {t('featureImmutable')}
            </h4>
            <p className="text-xs leading-relaxed text-white/40">{t('featureImmutableDesc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 border-b border-white/10 p-6 transition-colors hover:bg-white/5 sm:border-r lg:border-b-0 lg:p-8">
          <div className="rounded-lg bg-[#00FF88]/10 p-2 text-[#00FF88]">
            <Scale size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-white">
              {t('featureJury')}
            </h4>
            <p className="text-xs leading-relaxed text-white/40">{t('featureJuryDesc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 border-b border-white/10 p-6 transition-colors hover:bg-white/5 sm:border-b-0 sm:border-r lg:p-8">
          <div className="rounded-lg bg-[#00FF88]/10 p-2 text-[#00FF88]">
            <TrendingUp size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-white">
              {t('featureKol')}
            </h4>
            <p className="text-xs leading-relaxed text-white/40">{t('featureKolDesc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-6 transition-colors hover:bg-white/5 lg:p-8">
          <div className="rounded-lg bg-[#00FF88]/10 p-2 text-[#00FF88]">
            <Building2 size={24} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-white">
              {t('featureBrokers')}
            </h4>
            <p className="text-xs leading-relaxed text-white/40">{t('featureBrokersDesc')}</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
