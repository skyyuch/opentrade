import { ArrowRight, Database, Lock, Scale, ShieldCheck, TrendingUp } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { FaqSection } from '../../components/home/FaqSection';
import { Link } from '../../i18n/navigation';

import type { ReactNode } from 'react';

const HomePage = async (): Promise<ReactNode> => {
  const t = await getTranslations('home');

  const faqs = [
    { question: t('faqQ1'), answer: t('faqA1') },
    { question: t('faqQ2'), answer: t('faqA2') },
    { question: t('faqQ3'), answer: t('faqA3') },
  ];

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

        {/* Live Feed Terminal */}
        <div className="relative w-full lg:w-[40%]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-2xl">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                <div className="h-3 w-3 rounded-full bg-[#00FF88]/50" />
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                {t('terminalTitle')}
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex gap-4 font-mono text-sm">
                <div className="w-20 shrink-0 text-blue-400">{t('feedLabelReview')}</div>
                <div className="flex-1 truncate text-white/70">{t('feedReview')}</div>
                <div className="whitespace-nowrap text-right text-xs text-white/30">
                  {t('feedJustNow')}
                </div>
              </div>

              <div className="-mx-6 flex gap-4 border-y border-[#00FF88]/20 bg-[#00FF88]/10 px-6 py-2 font-mono text-sm">
                <div className="w-20 shrink-0 text-[#00FF88]">{t('feedLabelSignal')}</div>
                <div className="flex-1 truncate text-white/70">{t('feedSignal')}</div>
                <div className="whitespace-nowrap text-right text-xs text-white/30">
                  {t('feed2mAgo')}
                </div>
              </div>

              <div className="flex gap-4 font-mono text-sm">
                <div className="w-20 shrink-0 text-orange-400">{t('feedLabelJury')}</div>
                <div className="flex-1 truncate text-white/70">{t('feedArbitration')}</div>
                <div className="whitespace-nowrap text-right text-xs text-white/30">
                  {t('feed15mAgo')}
                </div>
              </div>

              <div className="flex gap-4 font-mono text-sm">
                <div className="w-20 shrink-0 text-purple-400">{t('feedLabelVerify')}</div>
                <div className="flex-1 truncate text-white/70">{t('feedVerify')}</div>
                <div className="whitespace-nowrap text-right text-xs text-white/30">
                  {t('feed18mAgo')}
                </div>
              </div>

              {/* Terminal Footer */}
              <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-white/30" />
                  <span className="font-mono text-xs text-white/40">{t('terminalSync')}</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-3 w-1 animate-pulse rounded-sm bg-[#00FF88]/50"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Decorative glow */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#00FF88]/10 to-blue-500/10 blur-[100px]" />
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
