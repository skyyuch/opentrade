/**
 * `/embed/kols/[slug]` — Embeddable KOL signal widget.
 *
 * Per Google `KolEmbedWidget.tsx` design reference:
 * A compact card (300×150 default) showing KOL name, verified badge,
 * direction win rate, and target win rate. Supports dark/light theme
 * via `?theme=dark|light` query param (default: dark).
 *
 * This page has NO header/footer (inherits from embed/layout.tsx).
 * KOLs can embed this via iframe on their external sites.
 */

import { CheckCircle2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ApiClientError, fetchKolProfile, fetchKolStats } from '@/lib/api/client';

type Props = {
  params: { locale: string; slug: string };
  searchParams: { theme?: string; size?: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  try {
    const data = await fetchKolProfile(params.slug, { next: { revalidate: 60 } });
    return {
      title: `${data.kol.displayName} — OpenTrade Widget`,
    };
  } catch {
    return { title: 'KOL Widget | OpenTrade' };
  }
};

const KolEmbedPage = async ({ params, searchParams }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const theme = searchParams.theme === 'light' ? 'light' : 'dark';
  const size = searchParams.size === 'large' ? 'large' : 'normal';
  const isDark = theme === 'dark';

  let kolName: string;
  let directionWinRate: number | null;
  let targetWinRate: number | null;

  try {
    const [profileData, statsData] = await Promise.all([
      fetchKolProfile(params.slug, { next: { revalidate: 60 } }),
      fetchKolStats(params.slug, { next: { revalidate: 60 } }),
    ]);
    kolName = profileData.kol.displayName;
    directionWinRate = statsData.directionWinRate;
    targetWinRate = statsData.targetWinRate;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const containerClass = isDark
    ? 'bg-zinc-950 border-white/10 text-white'
    : 'bg-white border-black/10 text-black';

  const sizeClass = size === 'normal' ? 'w-[300px] h-[150px] p-5' : 'w-[400px] h-[200px] p-6';

  const labelColor = isDark ? 'text-white/50' : 'text-black/50';
  const secondaryValueColor = isDark ? 'text-white' : 'text-black';
  const fontSize = size === 'normal' ? 'text-2xl' : 'text-3xl';

  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent p-4">
      <div
        className={`relative overflow-hidden rounded-2xl border flex flex-col justify-between shadow-2xl transition-all ${containerClass} ${sizeClass}`}
      >
        {isDark && (
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00FF88]/10 blur-3xl rounded-full" />
        )}

        {/* Top: Name + Verified badge + Logo */}
        <div className="relative z-10 flex items-start justify-between mb-4">
          <div>
            <div
              className="font-bold mb-0.5"
              style={{ fontSize: size === 'normal' ? '1.125rem' : '1.25rem' }}
            >
              {kolName}
            </div>
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold inline-flex ${
                isDark
                  ? 'bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20'
                  : 'bg-green-100 text-green-700 border border-green-200'
              }`}
            >
              <CheckCircle2 size={10} /> Verified on OpenTrade
            </div>
          </div>
          <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded bg-black relative">
            <div className="w-5 h-5 bg-[#00FF88] rounded-sm rotate-45 flex items-center justify-center z-10">
              <div className="w-2.5 h-2.5 border border-black rotate-[-45deg]" />
            </div>
          </div>
        </div>

        {/* Bottom: Win rates */}
        <div className="relative z-10 grid grid-cols-2 gap-4">
          <div>
            <div className={`text-xs mb-0.5 ${labelColor}`}>Direction Win Rate</div>
            <div className={`font-mono font-bold ${fontSize} text-[#00FF88]`}>
              {directionWinRate !== null ? `${directionWinRate.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div>
            <div className={`text-xs mb-0.5 ${labelColor}`}>Target Win Rate</div>
            <div className={`font-mono font-bold ${fontSize} ${secondaryValueColor}`}>
              {targetWinRate !== null ? `${targetWinRate.toFixed(1)}%` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KolEmbedPage;
