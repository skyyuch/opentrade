'use client';

import { useTranslations } from 'next-intl';

import type { SignalItem } from '@/lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  signal: SignalItem;
};

export function SignalDetailClient({ signal }: Props): ReactNode {
  const t = useTranslations('kols');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <span className={`rounded px-3 py-1 text-sm font-bold ${directionColor(signal.direction)}`}>
          {t(`direction${signal.direction.charAt(0) + signal.direction.slice(1).toLowerCase()}`)}
        </span>
        <span className="text-xl font-bold text-white">{signal.symbol}</span>
        <span className="text-sm text-white/40">
          {t(`assetClass${assetClassKey(signal.assetClass)}`)}
        </span>
        <span
          className={`ml-auto rounded px-3 py-1 text-sm font-bold ${outcomeColor(signal.outcome)}`}
        >
          {t(outcomeKey(signal.outcome))}
        </span>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 bg-white/5 p-6 md:grid-cols-4">
        <div>
          <p className="text-xs text-white/40">{t('entry')}</p>
          <p className="text-lg font-bold text-white">{signal.entryPrice}</p>
        </div>
        <div>
          <p className="text-xs text-white/40">{t('target')}</p>
          <p className="text-lg font-bold text-[#00FF88]">{signal.targetPrice}</p>
        </div>
        <div>
          <p className="text-xs text-white/40">{t('stoploss')}</p>
          <p className="text-lg font-bold text-red-400">{signal.stoplossPrice ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-white/40">{t('horizon')}</p>
          <p className="text-lg font-bold text-white">{t('days', { count: signal.horizon })}</p>
        </div>
      </div>

      {/* Settlement info */}
      {signal.settlePrice && (
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 bg-white/5 p-6 md:grid-cols-3">
          <div>
            <p className="text-xs text-white/40">{t('settledAt')}</p>
            <p className="text-sm text-white">
              {signal.settledAt ? new Date(signal.settledAt).toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-white/40">Settle Price</p>
            <p className="text-sm text-white">{signal.settlePrice}</p>
          </div>
          <div>
            <p className="text-xs text-white/40">Period High / Low</p>
            <p className="text-sm text-white">
              {signal.periodHigh ?? '—'} / {signal.periodLow ?? '—'}
            </p>
          </div>
        </div>
      )}

      {/* Note */}
      {signal.note && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/60">{signal.note}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 text-xs text-white/40">
        <div>
          <p>{t('emittedAt')}</p>
          <p className="text-white/60">{new Date(signal.createdAt).toLocaleString()}</p>
        </div>
        <div>
          <p>Content Hash</p>
          <p className="font-mono text-white/60 truncate">{signal.contentHash}</p>
        </div>
      </div>
    </div>
  );
}

function directionColor(dir: string): string {
  switch (dir) {
    case 'BUY':
      return 'bg-[#00FF88]/20 text-[#00FF88]';
    case 'SELL':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-white/10 text-white/60';
  }
}

function outcomeColor(outcome: string): string {
  switch (outcome) {
    case 'HIT_TARGET':
      return 'bg-[#00FF88]/20 text-[#00FF88]';
    case 'HIT_DIRECTION':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'STOPPED':
      return 'bg-red-500/20 text-red-400';
    case 'EXPIRED':
      return 'bg-white/10 text-white/50';
    case 'ACTIVE':
      return 'bg-blue-500/20 text-blue-400';
    default:
      return 'bg-white/10 text-white/40';
  }
}

function outcomeKey(outcome: string): string {
  switch (outcome) {
    case 'HIT_TARGET':
      return 'hitTarget';
    case 'HIT_DIRECTION':
      return 'hitDirection';
    case 'STOPPED':
      return 'stopped';
    case 'EXPIRED':
      return 'expired';
    case 'ACTIVE':
      return 'active';
    default:
      return 'unresolved';
  }
}

function assetClassKey(ac: string): string {
  switch (ac) {
    case 'EQUITY_HK':
      return 'EquityHk';
    case 'EQUITY_US':
      return 'EquityUs';
    case 'FUTURES':
      return 'Futures';
    case 'SPOT':
      return 'Spot';
    case 'FOREX':
      return 'Forex';
    case 'CRYPTO':
      return 'Crypto';
    default:
      return 'Crypto';
  }
}
