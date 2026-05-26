import {
  ArrowRight,
  Database,
  Globe,
  Lock,
  Scale,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { FaqSection } from '../../components/home/FaqSection';
import { Link } from '../../i18n/navigation';
import { fetchRecentFeed } from '../../lib/api/client';

import type { FeedItem, LatestSignal } from '../../lib/api/client';
import type { ReactNode } from 'react';

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getFeedItemConfig(
  item: FeedItem,
  labels: { review: string; signal: string; complaint: string },
): {
  label: string;
  badgeClasses: string;
  content: string;
} {
  switch (item.type) {
    case 'review':
      return {
        label: labels.review,
        badgeClasses: 'text-[#00FF88] bg-[#00FF88]/10 border-[#00FF88]/30',
        content: `${item.brokerDisplayName} — ${item.sentiment === 'POSITIVE' ? '👍' : item.sentiment === 'NEGATIVE' ? '👎' : '—'}`,
      };
    case 'signal':
      return {
        label: labels.signal,
        badgeClasses: 'text-red-400 bg-red-400/10 border-red-400/20',
        content: `${item.kolName} ${item.direction} $${item.symbol}`,
      };
    case 'complaint':
      return {
        label: labels.complaint,
        badgeClasses: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
        content: `${item.brokerDisplayName}`,
      };
  }
}

const HomePage = async (): Promise<ReactNode> => {
  const t = await getTranslations('home');

  const faqs = [
    { question: t('faqQ1'), answer: t('faqA1') },
    { question: t('faqQ2'), answer: t('faqA2') },
    { question: t('faqQ3'), answer: t('faqA3') },
  ];

  let feedItems: FeedItem[] = [];
  let latestSignal: LatestSignal | null = null;
  try {
    const feed = await fetchRecentFeed({ next: { revalidate: 30 } });
    feedItems = feed.items;
    latestSignal = feed.latestSignal;
  } catch {
    // Non-fatal: render empty terminal on API failure
  }

  return (
    <div className="-mt-16 relative pt-16">
      {/* Background Effects */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-[#00FF88]/5 blur-[150px] mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-blue-500/5 blur-[150px] mix-blend-screen" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-12 px-6 pb-20 pt-20 lg:flex-row lg:px-10 lg:py-32">
        <div className="w-full space-y-8 lg:w-[55%]">
          {/* Badge */}
          <div className="inline-flex flex-wrap items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
            <span className="relative flex h-2 w-2 shadow-[0_0_8px_#00FF88]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00FF88]" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#00FF88] sm:text-xs">
              {t('badgeMain')}
            </span>
            <span className="hidden px-1 text-white/20 sm:inline">|</span>
            <span className="hidden text-[10px] uppercase tracking-wider text-white/50 sm:inline sm:text-xs">
              {t('badgeSub')}
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[5.5rem]">
            {t('heroLine1')}
            <br />
            <span className="bg-gradient-to-br from-[#00FF88] to-emerald-600 bg-clip-text text-transparent">
              {t('heroLine2')}
            </span>
            <br />
            {t('heroLine3')}
          </h1>

          {/* Description */}
          <p className="max-w-xl text-lg font-medium leading-relaxed text-white/50 sm:text-xl">
            {t('heroDescPrefix')}
            <span className="text-white">{t('heroDescHighlight')}</span>
            {t('heroDescSuffix')}
          </p>

          {/* CTAs */}
          <div className="flex flex-col gap-4 pt-4 sm:flex-row">
            <Link
              href="/brokers"
              className="group flex items-center justify-center gap-2 rounded-xl bg-[#00FF88] px-8 py-4 text-lg font-extrabold text-black transition-all hover:scale-[1.02] hover:bg-[#00e67a] hover:shadow-[0_0_25px_rgba(0,255,136,0.4)]"
            >
              {t('ctaBrokers')}
              <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/verify"
              className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-lg font-bold text-white transition-all hover:bg-white/10"
            >
              {t('ctaVerify')}
            </Link>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-8 border-t border-white/10 pt-8">
            <div className="flex flex-col">
              <span className="text-3xl font-bold tracking-tight text-white">3,482</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                {t('statPlatforms')}
              </span>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="flex items-center gap-2 text-3xl font-bold tracking-tight text-[#00FF88]">
                98.2% <TrendingUp size={16} />
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                {t('statKolHitRate')}
              </span>
            </div>
            <div className="hidden h-10 w-px bg-white/10 sm:block" />
            <div className="hidden flex-col sm:flex">
              <span className="flex items-center gap-2 text-3xl font-bold tracking-tight text-white">
                <Lock size={20} className="text-blue-400" /> AES-256
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                {t('statEncryption')}
              </span>
            </div>
          </div>
        </div>

        {/* Unified Network Core Explorer */}
        <div className="relative mt-16 w-full lg:mt-0 lg:w-[45%] xl:pl-6">
          {/* Background glows */}
          <div className="pointer-events-none absolute -left-20 top-1/2 z-0 hidden h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-[#00FF88]/10 blur-[100px] lg:block" />
          <div className="pointer-events-none absolute right-0 top-1/2 z-0 h-[200px] w-[200px] -translate-y-1/2 rounded-full bg-blue-500/10 blur-[100px]" />

          {/* Unified Window */}
          <div className="group relative z-10 mx-auto w-full max-w-[540px] overflow-hidden rounded-2xl border border-white/10 bg-[#050608]/90 shadow-2xl backdrop-blur-2xl transition-all duration-500 hover:border-white/20">
            {/* Window Header */}
            <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="mr-3 flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                </div>
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white/40">
                  <Database size={12} className="text-[#00FF88]" />
                  OpenTrade Core Engine
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00FF88]" />
                </span>
                <span className="hidden font-mono text-[10px] font-bold tracking-widest text-[#00FF88] sm:inline">
                  NETWORK SYNCED
                </span>
              </div>
            </div>

            {/* Content Layout - Split View */}
            <div className="grid grid-cols-1 divide-y divide-white/5">
              {/* Top Section: KOL Signal Highlight */}
              <div className="relative overflow-hidden bg-gradient-to-b from-white/[0.02] to-transparent p-6 md:p-8">
                <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#00FF88]/5 blur-3xl" />

                <div className="mb-6 flex items-start justify-between">
                  <h3 className="flex items-center gap-2 rounded bg-[#00FF88]/10 px-2 py-1 text-xs font-bold tracking-widest text-[#00FF88]">
                    <Zap size={14} className="text-[#00FF88]" />
                    {t('feedLatestSignal')}
                  </h3>
                  {latestSignal && (
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/30">
                      <Globe size={12} />
                      {formatRelativeTime(latestSignal.createdAt)}
                    </div>
                  )}
                </div>

                {latestSignal ? (
                  <div className="flex flex-col justify-between rounded-xl border border-[#00FF88]/20 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.05] sm:flex-row sm:items-center">
                    <div className="mb-4 flex items-center gap-4 sm:mb-0">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-800 to-black shadow-lg">
                        <span className="font-mono text-sm font-bold text-white/80">
                          {latestSignal.kolName.slice(0, 2).toUpperCase()}
                        </span>
                        {latestSignal.kolVerified && (
                          <div className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[#00FF88] shadow-[0_0_5px_#00FF88]" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-base font-bold text-white">
                          {latestSignal.kolName}
                          {latestSignal.kolVerified && (
                            <span className="flex items-center gap-1 rounded border border-[#00FF88]/30 bg-[#00FF88]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#00FF88]">
                              <ShieldCheck size={10} /> SBT
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-white/50">
                          {latestSignal.direction} ${latestSignal.symbol}
                        </div>
                      </div>
                    </div>
                    {latestSignal.yield && (
                      <div className="text-left sm:text-right">
                        <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/40">
                          Net Yield
                        </div>
                        <div className="inline-block rounded-lg bg-[#00FF88] px-3 py-1.5 font-mono text-sm font-bold text-black shadow-[0_0_15px_rgba(0,255,136,0.2)]">
                          {latestSignal.yield}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/30">
                    {t('terminalSync')}
                  </div>
                )}
              </div>

              {/* Bottom Section: Live Protocol Events */}
              <div className="p-6 md:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#00FF88]">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00FF88]" />
                    </span>
                    {t('feedLiveEvents')}
                  </h3>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-3 w-1 animate-pulse rounded-sm bg-[#00FF88]/50"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4 font-mono text-xs">
                  {feedItems.length > 0 ? (
                    feedItems.slice(0, 4).map((item) => {
                      const config = getFeedItemConfig(item, {
                        review: 'REVIEW',
                        signal: 'SIGNAL',
                        complaint: 'VERIFY',
                      });
                      return (
                        <div key={item.id} className="group flex items-center gap-3 transition-all">
                          <div
                            className={`w-14 shrink-0 rounded border text-center text-[10px] font-bold py-1 ${config.badgeClasses}`}
                          >
                            {config.label}
                          </div>
                          <div className="flex-1 truncate text-white/60 transition-colors group-hover:text-white">
                            {config.content}
                          </div>
                          <div className="whitespace-nowrap text-right text-[10px] text-white/20">
                            {formatRelativeTime(item.createdAt)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-4 text-center text-sm text-white/30">
                      {t('terminalSync')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section */}
      <section className="relative z-10 border-t border-white/5 bg-black/40">
        <div className="mx-auto max-w-[1440px] px-6 py-24 lg:px-10">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold lg:text-4xl">{t('featuresTitle')}</h2>
            <p className="mx-auto max-w-2xl text-white/50">{t('featuresSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="group rounded-3xl border border-white/10 bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#00FF88]/10 text-[#00FF88] transition-transform group-hover:scale-110">
                <ShieldCheck size={32} />
              </div>
              <h3 className="mb-3 text-xl font-bold">{t('featureImmutable')}</h3>
              <p className="text-sm leading-relaxed text-white/50">{t('featureImmutableDesc')}</p>
            </div>

            <div className="group rounded-3xl border border-white/10 bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 transition-transform group-hover:scale-110">
                <Scale size={32} />
              </div>
              <h3 className="mb-3 text-xl font-bold">{t('featureJury')}</h3>
              <p className="text-sm leading-relaxed text-white/50">{t('featureJuryDesc')}</p>
            </div>

            <div className="group rounded-3xl border border-white/10 bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 transition-transform group-hover:scale-110">
                <TrendingUp size={32} />
              </div>
              <h3 className="mb-3 text-xl font-bold">{t('featureKol')}</h3>
              <p className="text-sm leading-relaxed text-white/50">{t('featureKolDesc')}</p>
            </div>

            <div className="group rounded-3xl border border-white/10 bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 transition-transform group-hover:scale-110">
                <Lock size={32} />
              </div>
              <h3 className="mb-3 text-xl font-bold">{t('featureZk')}</h3>
              <p className="text-sm leading-relaxed text-white/50">{t('featureZkDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FaqSection title={t('faqTitle')} subtitle={t('faqSubtitle')} items={faqs} />

      {/* CTA Footer */}
      <section className="relative z-10 border-t border-white/5 bg-gradient-to-b from-transparent to-[#00FF88]/5">
        <div className="mx-auto max-w-[1440px] px-6 py-24 pb-32 text-center lg:px-10">
          <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">{t('ctaTitle')}</h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-white/50">{t('ctaDescription')}</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/verify"
              className="w-full rounded-xl bg-[#00FF88] px-8 py-4 font-extrabold text-black transition-all hover:scale-105 hover:bg-[#00e67a] sm:w-auto"
            >
              {t('ctaGetSbt')}
            </Link>
            <Link
              href="/kol"
              className="w-full rounded-xl border border-white/20 bg-transparent px-8 py-4 font-bold text-white transition-all hover:bg-white/5 sm:w-auto"
            >
              {t('ctaKolDashboard')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
