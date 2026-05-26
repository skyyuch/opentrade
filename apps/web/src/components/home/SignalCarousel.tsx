'use client';

import { Globe, ShieldCheck, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { TopSignal } from '../../lib/api/client';

function formatRelativeTimeClient(
  isoDate: string,
  labels: {
    justNow: string;
    minutes: (c: number) => string;
    hours: (c: number) => string;
    days: (c: number) => string;
  },
): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return labels.justNow;
  if (mins < 60) return labels.minutes(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return labels.hours(hours);
  const days = Math.floor(hours / 24);
  return labels.days(days);
}

export function SignalCarousel({ signals }: { signals: TopSignal[] }) {
  const t = useTranslations('home');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (signals.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % signals.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [signals.length]);

  const timeLabels = {
    justNow: t('timeJustNow'),
    minutes: (c: number) => t('timeMinutesAgo', { count: c }),
    hours: (c: number) => t('timeHoursAgo', { count: c }),
    days: (c: number) => t('timeDaysAgo', { count: c }),
  };

  if (signals.length === 0) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-b from-white/[0.02] to-transparent p-6 md:p-8">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#00FF88]/5 blur-3xl" />
        <div className="mb-6 flex items-start justify-between">
          <h3 className="flex items-center gap-2 rounded bg-[#00FF88]/10 px-2 py-1 text-xs font-bold tracking-widest text-[#00FF88]">
            <Zap size={14} className="text-[#00FF88]" />
            {t('feedLatestSignal')}
          </h3>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/30">
          {t('terminalSync')}
        </div>
      </div>
    );
  }

  const current = signals[activeIndex];
  if (!current) return null;
  const isPositive = current.yieldValue >= 0;

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-white/[0.02] to-transparent p-6 md:p-8">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#00FF88]/5 blur-3xl" />

      <div className="mb-6 flex items-start justify-between">
        <h3 className="flex items-center gap-2 rounded bg-[#00FF88]/10 px-2 py-1 text-xs font-bold tracking-widest text-[#00FF88]">
          <Zap size={14} className="text-[#00FF88]" />
          {t('feedLatestSignal')}
        </h3>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/30">
          <Globe size={12} />
          {formatRelativeTimeClient(current.settledAt, timeLabels)}
        </div>
      </div>

      <div className="relative min-h-[130px] sm:min-h-[88px]">
        <div
          key={activeIndex}
          className="absolute inset-x-0 animate-in fade-in slide-in-from-bottom-2 duration-400"
        >
          <div className="flex flex-col justify-between rounded-xl border border-[#00FF88]/20 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.05] sm:flex-row sm:items-center">
            <div className="mb-4 flex items-center gap-4 sm:mb-0">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-800 to-black shadow-lg">
                <span className="font-mono text-sm font-bold text-white/80">
                  {current.kolName.slice(0, 2).toUpperCase()}
                </span>
                {current.kolVerified && (
                  <div className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[#00FF88] shadow-[0_0_5px_#00FF88]" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  {current.kolName}
                  {current.kolVerified && (
                    <span className="flex items-center gap-1 rounded border border-[#00FF88]/30 bg-[#00FF88]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#00FF88]">
                      <ShieldCheck size={10} /> SBT VERIFIED
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  {current.direction} ${current.symbol}
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/40">
                Net Yield
              </div>
              <div
                className={`inline-block rounded-lg px-3 py-1.5 font-mono text-sm font-bold ${
                  isPositive
                    ? 'bg-[#00FF88] text-black shadow-[0_0_15px_rgba(0,255,136,0.2)]'
                    : 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                }`}
              >
                {current.yield}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dots indicator */}
      {signals.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {signals.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === activeIndex ? 'w-4 bg-[#00FF88]' : 'w-1 bg-white/20'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
