'use client';

/**
 * Instrument target picker for the KOL signal form (ADR-0038 D6).
 *
 * Replaces the legacy free-text symbol input + 6-option asset-class dropdown
 * with a category-scoped autocomplete backed by `GET /v1/instruments`. The
 * five surfaced categories come from `@opentrade/shared`
 * (`INSTRUMENT_CATEGORIES`). A free-text fallback is always available so a KOL
 * can still call an instrument that is not in the catalog (ADR-0038 D6 — the
 * catalog is an aid, never a gate).
 *
 * Ported from the Google Studio UI; localized names are resolved by the
 * caller's `searchInstruments` adapter (never a raw column, per ADR-0038 D4).
 */

import { Check, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { INSTRUMENT_CATEGORIES } from '../../lib/api/client';

import type { InstrumentCategory } from '../../lib/api/client';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

/**
 * A picker-ready instrument option. `name` is already localized for the
 * reader's locale by the `searchInstruments` adapter (mapped from
 * `InstrumentDto` via `localizedInstrumentName`). `id === null` only appears
 * for the synthetic free-text fallback row.
 */
export type InstrumentOption = {
  id: string | null;
  category: InstrumentCategory;
  symbol: string;
  displayCode: string;
  name: string;
};

export type InstrumentPickerValue =
  | { kind: 'catalog'; instrument: InstrumentOption }
  | { kind: 'freeText'; symbol: string; category: InstrumentCategory }
  | null;

export type InstrumentPickerLabels = {
  categoryLabel: string;
  categories: Record<InstrumentCategory, string>;
  searchPlaceholder: string;
  loading: string;
  noResults: string;
  useFreeText: (input: string) => string;
  clear: string;
  customLabel: string;
};

export type InstrumentPickerProps = {
  value: InstrumentPickerValue;
  onChange: (v: InstrumentPickerValue) => void;
  searchInstruments: (category: InstrumentCategory, query: string) => Promise<InstrumentOption[]>;
  labels: InstrumentPickerLabels;
};

export function InstrumentPicker({
  value,
  onChange,
  searchInstruments,
  labels,
}: InstrumentPickerProps): ReactNode {
  const [selectedCategory, setSelectedCategory] = useState<InstrumentCategory>('CRYPTO');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<InstrumentOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query || !isOpen) {
      setOptions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      void searchInstruments(selectedCategory, query)
        .then((results) => {
          if (cancelled) return;
          setOptions(results);
          setFocusedIndex(-1);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selectedCategory, searchInstruments, isOpen]);

  const handleCategoryChange = (cat: InstrumentCategory): void => {
    setSelectedCategory(cat);
    setQuery('');
    setOptions([]);
    onChange(null);
  };

  const handleSelectOption = (index: number): void => {
    const option = options[index];
    if (option) {
      onChange({ kind: 'catalog', instrument: option });
    } else {
      // The fallback row (index === options.length) creates a free-text target.
      onChange({ kind: 'freeText', symbol: query.trim(), category: selectedCategory });
    }
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: ReactKeyboardEvent): void => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    const totalOptions = options.length + (query ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < totalOptions) {
          handleSelectOption(focusedIndex);
        } else if (query) {
          handleSelectOption(options.length);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Category selection */}
      <div className="mb-4">
        <label className="mb-2 block text-xs uppercase tracking-wider text-white/50">
          {labels.categoryLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                selectedCategory === cat
                  ? 'border border-[#00FF88]/50 bg-[#00FF88]/20 text-[#00FF88] shadow-[0_0_10px_rgba(0,255,136,0.1)]'
                  : 'border border-white/5 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {labels.categories[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Selected chip or search input */}
      {value ? (
        <div className="flex w-full items-center justify-between rounded-xl border border-[#00FF88]/30 bg-black/40 p-3 shadow-[0_0_15px_rgba(0,255,136,0.05)]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00FF88]/10">
              <Check size={16} className="text-[#00FF88]" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-sm font-bold text-white">
                {value.kind === 'catalog' ? value.instrument.displayCode : value.symbol}
              </span>
              <span className="text-xs text-white/50">
                {value.kind === 'catalog'
                  ? value.instrument.name || value.instrument.symbol
                  : labels.customLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="group flex cursor-pointer items-center gap-1 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-red-400/10 hover:text-red-400"
            aria-label={labels.clear}
          >
            <X size={16} />
            <span className="hidden pr-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 sm:block">
              {labels.clear}
            </span>
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={labels.searchPlaceholder}
              className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-10 font-mono text-white transition-all placeholder:text-white/30 focus:border-[#00FF88]/50 focus:outline-none focus:ring-1 focus:ring-[#00FF88]/50"
            />
            {isLoading && (
              <Loader2
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#00FF88]"
              />
            )}
            {query && !isLoading && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {isOpen && query && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 flex max-h-[300px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0b0f] shadow-2xl">
              <div className="flex-1 overflow-y-auto p-1">
                {options.length === 0 && !isLoading ? (
                  <div className="px-4 py-3 text-center text-sm text-white/40">
                    {labels.noResults}
                  </div>
                ) : (
                  options.map((opt, idx) => (
                    <button
                      key={opt.id ?? opt.symbol}
                      type="button"
                      onClick={() => handleSelectOption(idx)}
                      onMouseEnter={() => setFocusedIndex(idx)}
                      className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left transition-colors ${
                        focusedIndex === idx
                          ? 'bg-white/10 text-white'
                          : 'text-white/70 hover:bg-white/5'
                      }`}
                    >
                      <span className="font-mono text-[#00FF88]">{opt.displayCode}</span>
                      <span className="ml-4 truncate text-sm">{opt.name || opt.symbol}</span>
                    </button>
                  ))
                )}

                {/* Free-text fallback row */}
                {query && (
                  <button
                    type="button"
                    onClick={() => handleSelectOption(options.length)}
                    onMouseEnter={() => setFocusedIndex(options.length)}
                    className={`flex w-full items-center border-t border-white/5 px-4 py-3 text-left transition-colors ${
                      focusedIndex === options.length
                        ? 'bg-[#00FF88]/10 text-[#00FF88]'
                        : 'text-white/50 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-sm">{labels.useFreeText(query)}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
