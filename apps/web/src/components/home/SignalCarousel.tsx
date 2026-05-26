'use client';

import { Database, ShieldCheck, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { TopSignal } from '../../lib/api/client';

function formatSettledTime(
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

  const settledLabels = {
    justNow: t('settledJustNow'),
    minutes: (c: number) => t('settledMinutesAgo', { count: c }),
    hours: (c: number) => t('settledHoursAgo', { count: c }),
    days: (c: number) => t('settledDaysAgo', { count: c }),
  };

  if (signals.length === 0) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-b from-white/[0.02] to-transparent p-6 md:p-8">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#00FF88]/5 blur-3xl" />
        <div className="mb-6 flex items-start justify-between">
          <h3 className="flex w-fit items-center gap-2 rounded bg-[#00FF88]/10 px-2 py-1 text-xs font-bold tracking-widest text-[#00FF88]">
            <TrendingUp size={14} className="text-[#00FF88]" />
            {t('signalTop5Title')}
          </h3>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/30">
          {t('terminalSync')}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-white/[0.02] to-transparent p-6 md:p-8">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#00FF88]/5 blur-3xl" />

      <div className="mb-6 flex items-start justify-between">
        <h3 className="flex w-fit items-center gap-2 rounded bg-[#00FF88]/10 px-2 py-1 text-xs font-bold tracking-widest text-[#00FF88]">
          <TrendingUp size={14} className="text-[#00FF88]" />
          {t('signalTop5Title')}
        </h3>
        <div
          key={activeIndex}
          className="flex shrink-0 items-center gap-1.5 animate-in fade-in font-mono text-[10px] text-white/30 duration-300"
        >
          <Database size={12} />
          {formatSettledTime(signals[activeIndex]?.settledAt ?? '', settledLabels)}
        </div>
      </div>

      {/* Stacked cards — matches Google design exactly */}
      <div className="relative h-[200px] w-full sm:h-[135px]">
        {signals.map((signal, idx) => {
          let relativeIndex = idx - activeIndex;
          if (relativeIndex < 0) relativeIndex += signals.length;

          let y = 40;
          let cardScale = 0.85;
          let cardOpacity = 0;
          let shadowOpacity = 1;
          let zIndex = 0;

          if (relativeIndex === 0) {
            y = 0;
            cardScale = 1;
            cardOpacity = 1;
            shadowOpacity = 0;
            zIndex = 30;
          } else if (relativeIndex === 1) {
            y = 16;
            cardScale = 0.95;
            cardOpacity = 1;
            shadowOpacity = 0.6;
            zIndex = 20;
          } else if (relativeIndex === 2) {
            y = 32;
            cardScale = 0.9;
            cardOpacity = 1;
            shadowOpacity = 0.85;
            zIndex = 10;
          } else if (relativeIndex === signals.length - 1) {
            y = -24;
            cardScale = 1.05;
            cardOpacity = 0;
            shadowOpacity = 0;
            zIndex = 40;
          }

          return (
            <div
              key={signal.symbol + signal.kolName + String(idx)}
              className="absolute left-0 top-0 w-full origin-top transition-all duration-[600ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{
                transform: `translateY(${String(y)}px) scale(${String(cardScale)})`,
                opacity: cardOpacity,
                zIndex,
              }}
            >
              <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#00FF88]/20 bg-zinc-950 p-5 shadow-[0_15px_30px_rgba(0,0,0,0.6)] sm:flex-row sm:items-center">
                {/* Dark overlay for depth */}
                <div
                  className="pointer-events-none absolute inset-0 z-10 bg-[#050608] transition-opacity duration-[600ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
                  style={{ opacity: shadowOpacity }}
                />

                {/* Card content */}
                <div className="relative z-20 flex w-full flex-col justify-between sm:flex-row sm:items-center">
                  <div className="mb-4 flex items-center gap-4 sm:mb-0">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-800 to-black shadow-lg">
                      <span className="font-mono text-sm font-bold text-white/80">
                        {signal.kolName.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[#00FF88] shadow-[0_0_5px_#00FF88]" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-base font-bold text-white">
                        {signal.kolName}
                        <span className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/80">
                          RANK #{String(idx + 1)}
                        </span>
                        {signal.kolVerified && (
                          <span className="hidden items-center gap-1 rounded border border-[#00FF88]/30 bg-[#00FF88]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#00FF88] sm:flex">
                            <ShieldCheck size={10} /> VERIFIED
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {signal.direction === 'BUY' ? 'Long' : 'Short'} ${signal.symbol}
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/40">
                      {t('signalYieldLabel')}
                    </div>
                    <div
                      className={`inline-block rounded-lg px-3 py-1.5 font-mono text-sm font-bold ${
                        signal.yieldValue >= 0
                          ? 'bg-[#00FF88] text-black shadow-[0_0_15px_rgba(0,255,136,0.2)]'
                          : 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                      }`}
                    >
                      {signal.yield}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
