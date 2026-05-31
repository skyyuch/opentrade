'use client';

import { ArrowDownRight, ArrowUpRight, Info, Link as LinkIcon, Loader2, Radio } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { InstrumentPicker } from '../../../../../components/kols/InstrumentPicker';
import { useOpenTradeAuth } from '../../../../../hooks/useOpenTradeAuth';
import { Link } from '../../../../../i18n/navigation';
import {
  fetchInstruments,
  fetchMyKolProfile,
  localizedInstrumentName,
  submitSignal,
  ApiClientError,
} from '../../../../../lib/api/client';

import type {
  InstrumentOption,
  InstrumentPickerLabels,
  InstrumentPickerValue,
} from '../../../../../components/kols/InstrumentPicker';
import type {
  InstrumentCategory,
  SignalDirection,
  SignalItem,
} from '../../../../../lib/api/client';
import type { ReactNode } from 'react';

type ViewMode = 'form' | 'preview' | 'submitting' | 'success';

// Maps the five surfaced instrument categories to their `instrumentPicker`
// i18n label keys (reused on the preview screen).
const CATEGORY_LABEL_KEY: Record<InstrumentCategory, string> = {
  EQUITY_HK: 'categoryEquityHk',
  EQUITY_US: 'categoryEquityUs',
  INDEX: 'categoryIndex',
  CRYPTO: 'categoryCrypto',
  COMMODITY: 'categoryCommodity',
};

const HORIZON_OPTIONS: { value: number; labelKey: string }[] = [
  { value: 1, labelKey: 'horizon1d' },
  { value: 3, labelKey: 'horizon3d' },
  { value: 7, labelKey: 'horizon7d' },
  { value: 14, labelKey: 'horizon14d' },
  { value: 30, labelKey: 'horizon30d' },
  { value: 90, labelKey: 'horizon90d' },
  { value: 365, labelKey: 'horizonLong' },
];

const PRICE_REGEX = /^\d+(\.\d+)?$/;

export default function KolSignalNewPage(): ReactNode {
  const t = useTranslations('kolConsole');
  const tPicker = useTranslations('instrumentPicker');
  const locale = useLocale();
  const { getAccessToken } = useOpenTradeAuth();

  const [kolId, setKolId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignalItem | null>(null);

  // Form state — the asset-class dropdown + free-text symbol were replaced by
  // a single instrument picker selection (ADR-0038 D6).
  const [instrument, setInstrument] = useState<InstrumentPickerValue>(null);
  const [direction, setDirection] = useState<SignalDirection>('BUY');
  const [entryPrice, setEntryPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [horizon, setHorizon] = useState(7);
  const [notes, setNotes] = useState('');

  // Derived from the picker selection. `category` doubles as the signal's
  // assetClass (it is a subset of the AssetClass union); the backend re-derives
  // the canonical symbol + assetClass from `instrumentId` when present.
  const selectedSymbol = instrument
    ? instrument.kind === 'catalog'
      ? instrument.instrument.displayCode
      : instrument.symbol
    : '';
  const selectedCategory: InstrumentCategory | null = instrument
    ? instrument.kind === 'catalog'
      ? instrument.instrument.category
      : instrument.category
    : null;

  const searchInstruments = useCallback(
    async (category: InstrumentCategory, q: string): Promise<InstrumentOption[]> => {
      const res = await fetchInstruments({ category, q, limit: 20 });
      return res.instruments.map((dto) => ({
        id: dto.id,
        category: dto.category,
        symbol: dto.symbol,
        displayCode: dto.displayCode,
        name: localizedInstrumentName(dto, locale),
      }));
    },
    [locale],
  );

  const pickerLabels: InstrumentPickerLabels = {
    categoryLabel: tPicker('categoryLabel'),
    categories: {
      EQUITY_HK: tPicker('categoryEquityHk'),
      EQUITY_US: tPicker('categoryEquityUs'),
      INDEX: tPicker('categoryIndex'),
      CRYPTO: tPicker('categoryCrypto'),
      COMMODITY: tPicker('categoryCommodity'),
    },
    searchPlaceholder: tPicker('searchPlaceholder'),
    loading: tPicker('loading'),
    noResults: tPicker('noResults'),
    useFreeText: (input: string) => tPicker('useFreeText', { input }),
    clear: tPicker('clear'),
    customLabel: tPicker('customLabel'),
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
      if (cancelled) return;
      try {
        const res = await fetchMyKolProfile({ accessToken: token });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (!cancelled) setKolId(res.kol.id);
      } catch {
        // layout auth gate protects; swallow
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  const canPreview =
    instrument !== null && selectedSymbol.trim().length > 0 && PRICE_REGEX.test(targetPrice);

  const handleSubmit = useCallback(async () => {
    if (!kolId || !instrument || !selectedCategory) return;
    setViewMode('submitting');
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const canonicalSymbol =
        instrument.kind === 'catalog'
          ? instrument.instrument.symbol
          : instrument.symbol.trim().toUpperCase();

      const input: Parameters<typeof submitSignal>[0] = {
        kolId,
        assetClass: selectedCategory,
        symbol: canonicalSymbol,
        direction,
        entryPrice: entryPrice || '0',
        targetPrice,
        horizon,
      };
      // When a catalog instrument was chosen, send its id so the backend
      // derives the canonical symbol + assetClass from the catalog (ADR-0038
      // D6); free-text selections leave instrumentId unset.
      if (instrument.kind === 'catalog' && instrument.instrument.id) {
        input.instrumentId = instrument.instrument.id;
      }
      if (stopLoss && PRICE_REGEX.test(stopLoss)) input.stoplossPrice = stopLoss;
      if (notes.trim()) input.note = notes.trim();

      const res = await submitSignal(input, { accessToken: token });
      setResult(res.signal);
      setViewMode('success');
    } catch (err) {
      setViewMode('preview');
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(t('signalSubmitError'));
      }
    }
  }, [
    kolId,
    instrument,
    selectedCategory,
    getAccessToken,
    direction,
    entryPrice,
    targetPrice,
    stopLoss,
    horizon,
    notes,
    t,
  ]);

  // --- Success view ---
  if (viewMode === 'success' && result) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center animate-in fade-in">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#00FF88]/30 bg-[#00FF88]/20 text-[#00FF88]">
          <Radio size={40} className="animate-pulse" />
        </div>
        <h1 className="mb-4 text-3xl font-bold">{t('signalSuccessTitle')}</h1>
        <div className="mb-8 w-full space-y-2 rounded-xl border border-white/10 bg-black/30 p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">{t('signalSuccessId')}</span>
            <span className="font-bold font-mono text-white">{result.id.slice(0, 8)}</span>
          </div>
          {result.contentHash && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">{t('signalSuccessHash')}</span>
              <span className="font-mono text-xs text-blue-400">
                {result.contentHash.slice(0, 10)}...
              </span>
            </div>
          )}
        </div>
        <div className="flex w-full gap-4">
          <Link
            href="/kol/signals"
            className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 py-4 font-bold text-white transition-colors hover:bg-white/10"
          >
            {t('signalSuccessBackToList')}
          </Link>
          <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1DA1F2] py-4 font-bold text-white transition-colors hover:bg-[#1a91da]">
            <LinkIcon size={18} /> {t('signalSuccessShare')}
          </button>
        </div>
      </div>
    );
  }

  // --- Preview view ---
  if (viewMode === 'preview' || viewMode === 'submitting') {
    const isSubmitting = viewMode === 'submitting';
    return (
      <div className="mx-auto max-w-3xl space-y-8 animate-in fade-in">
        <div>
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold">
            {t('signalPreviewTitle')}{' '}
            <span className="self-center rounded-md bg-yellow-500/20 px-2 py-1 text-sm font-bold text-yellow-500">
              {t('signalPreviewBadge')}
            </span>
          </h1>
          <p className="text-white/50">{t('signalPreviewSubtitle')}</p>
        </div>

        <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8">
          {/* Immutable warning */}
          <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-500">
            <Info size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="mb-1 font-bold">{t('signalPreviewWarningTitle')}</p>
              <p className="opacity-80">{t('signalPreviewWarningDesc')}</p>
            </div>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 border-b border-white/10 pb-6">
            <div>
              <div className="mb-1 text-xs font-bold text-white/40">{t('signalAssetClass')}</div>
              <div className="font-bold">
                {selectedCategory ? tPicker(CATEGORY_LABEL_KEY[selectedCategory]) : 'N/A'}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-bold text-white/40">{t('signalSymbol')}</div>
              <div className="font-bold font-mono text-xl">{selectedSymbol || 'N/A'}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-bold text-white/40">{t('signalDirection')}</div>
              <div
                className={`flex items-center gap-1 font-bold ${direction === 'BUY' ? 'text-[#00FF88]' : 'text-red-400'}`}
              >
                {direction === 'BUY' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {direction}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-bold text-white/40">{t('signalHorizon')}</div>
              <div className="font-bold">
                {t(HORIZON_OPTIONS.find((o) => o.value === horizon)?.labelKey ?? 'horizon7d')}
              </div>
            </div>
          </div>

          {/* Price grid */}
          <div className="grid grid-cols-3 gap-4 border-b border-white/10 pb-6">
            <div className="rounded-xl border border-white/5 bg-black/40 p-4">
              <div className="mb-1 inline-block border-b border-white/10 pb-1 text-xs font-bold text-white/40">
                {t('signalEntryPrice')}
              </div>
              <div className="mt-1 font-bold font-mono text-lg">
                {entryPrice || t('signalCurrentPrice')}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-[#00FF88]/20 bg-black/40 p-4">
              <div className="absolute right-0 top-0 h-16 w-16 bg-[#00FF88]/10 blur-xl" />
              <div className="mb-1 inline-block border-b border-white/10 pb-1 text-xs font-bold text-white/40">
                {t('signalTargetPrice')}
              </div>
              <div className="mt-1 font-bold font-mono text-lg text-[#00FF88]">
                {targetPrice || 'N/A'}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-red-500/20 bg-black/40 p-4">
              <div className="absolute right-0 top-0 h-16 w-16 bg-red-500/10 blur-xl" />
              <div className="mb-1 inline-block border-b border-white/10 pb-1 text-xs font-bold text-white/40">
                {t('signalStopLoss')}
              </div>
              <div className="mt-1 font-bold font-mono text-lg text-red-400">
                {stopLoss || 'N/A'}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="mb-2 text-xs font-bold text-white/40">{t('signalNotes')}</div>
            <div className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/40 p-4 text-sm leading-relaxed text-white/80">
              {notes || t('signalNotesNone')}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            disabled={isSubmitting}
            onClick={() => setViewMode('form')}
            className="flex-1 rounded-xl border border-white/20 bg-transparent py-4 font-bold text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('signalPreviewBackEdit')}
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#00FF88] py-4 font-extrabold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                {t('signalSubmitting')}
              </>
            ) : (
              t('signalConfirmPost')
            )}
          </button>
        </div>
      </div>
    );
  }

  // --- Form view ---
  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-in fade-in">
      <div>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold">
          <div className="rounded-xl bg-[#00FF88]/20 p-2 text-[#00FF88]">
            <Radio size={24} />
          </div>
          {t('signalNewTitle')}
        </h1>
        <p className="text-white/50">{t('signalNewSubtitle')}</p>
      </div>

      <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8">
        {/* Instrument target picker (asset class + symbol) */}
        <div>
          <label className="mb-4 block text-sm font-bold text-white/70">{t('signalSymbol')}</label>
          <InstrumentPicker
            value={instrument}
            onChange={setInstrument}
            searchInstruments={searchInstruments}
            labels={pickerLabels}
          />
        </div>

        {/* Direction */}
        <div className="space-y-4">
          <label className="block text-sm font-bold text-white/70">{t('signalDirection')}</label>
          <div className="flex gap-2 rounded-xl border border-white/5 bg-black/40 p-1">
            <button
              onClick={() => setDirection('BUY')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 font-bold transition-all ${
                direction === 'BUY'
                  ? 'bg-[#00FF88]/20 text-[#00FF88] shadow-[0_0_15px_rgba(0,255,136,0.1)]'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <ArrowUpRight size={18} /> {t('signalBuy')}
            </button>
            <button
              onClick={() => setDirection('SELL')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 font-bold transition-all ${
                direction === 'SELL'
                  ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <ArrowDownRight size={18} /> {t('signalSell')}
            </button>
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-3">
            <label className="block text-sm font-bold text-white/70">{t('signalEntryPrice')}</label>
            <input
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              type="text"
              placeholder={t('signalEntryPricePlaceholder')}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-white focus:border-white/50 focus:outline-none"
            />
          </div>
          <div className="space-y-3">
            <label className="flex justify-between text-sm font-bold text-white/70">
              {t('signalTargetPrice')}{' '}
              <span className="text-xs text-[#00FF88]">{t('signalRequired')}</span>
            </label>
            <input
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              type="text"
              placeholder="Take Profit"
              className="w-full rounded-xl border border-[#00FF88]/30 bg-black/40 px-4 py-3 font-mono text-[#00FF88] shadow-[0_0_10px_rgba(0,255,136,0.05)] focus:border-[#00FF88] focus:outline-none"
            />
          </div>
          <div className="space-y-3">
            <label className="flex justify-between text-sm font-bold text-white/70">
              {t('signalStopLoss')}{' '}
              <span className="text-xs text-white/30">{t('signalOptional')}</span>
            </label>
            <input
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              type="text"
              placeholder="Stop Loss"
              className="w-full rounded-xl border border-red-500/30 bg-black/40 px-4 py-3 font-mono text-red-400 focus:border-red-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Horizon */}
        <div className="space-y-4">
          <label className="block text-sm font-bold text-white/70">{t('signalHorizon')}</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="w-full appearance-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-[#00FF88] focus:outline-none"
          >
            {HORIZON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div className="space-y-4">
          <label className="flex justify-between text-sm font-bold text-white/70">
            {t('signalNotes')}
            <span className="text-xs text-white/30">{notes.length}/500</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            className="min-h-[120px] w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 leading-relaxed text-white focus:border-[#00FF88] focus:outline-none"
            placeholder={t('signalNotesPlaceholder')}
          />
        </div>

        {/* Preview button */}
        <div className="border-t border-white/10 pt-4">
          <button
            disabled={!canPreview}
            onClick={() => setViewMode('preview')}
            className="w-full rounded-xl bg-white py-4 font-extrabold text-black transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('signalPreviewButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
