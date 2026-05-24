/**
 * `/verify` — L2 SBT verification UI.
 *
 * UX flow (per ADR-0022 + Google dark crypto design):
 *   1. User selects broker (searchable combobox; locale-aware label)
 *   2. User drag-drops or picks a statement file (PDF/JPG/PNG/WebP, max 10MB)
 *   3. File is uploaded to IPFS via POST /v1/auth/verify-broker/upload
 *      → server returns the CID; raw bytes are never stored in our DB
 *   4. Browser computes commitment = keccak256(walletAddress, brokerSlug,
 *      ipfsCid, randomSalt32) locally
 *   5. User submits → POST /v1/auth/verify-broker stores the request,
 *      admin reviews, on approval the outbox triggers an on-chain SBT mint
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Fingerprint,
  Lock,
  Search,
  Shield,
  Upload,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodePacked, keccak256 } from 'viem';

import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import { apiPost, fetchBrokers, fetchMyProfile, uploadVerifyEvidence } from '../../lib/api/client';

import type { UserProfile } from '../../lib/api/client';
import type { DragEvent as ReactDragEvent, FormEvent } from 'react';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type Broker = {
  slug: string;
  displayName: string;
  legalName: string;
};

type VerifyFormProps = {
  brokers: Broker[];
};

type UploadedFile = {
  file: File;
  cid: string;
};

/** Locale-aware broker label.
 *  - en      → English legal name
 *  - zh-Hant/zh-Hans → displayName (Chinese; falls back to English when no
 *    Chinese name was in the SFC seed, see packages/db/src/sfc/sync-brokers.ts).
 */
const localizedBrokerName = (b: Broker, locale: string): string =>
  locale === 'en' ? b.legalName : b.displayName;

export const VerifyForm = ({ brokers }: VerifyFormProps) => {
  const t = useTranslations('verify');
  const locale = useLocale();
  const { authenticated, login } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [brokerSlug, setBrokerSlug] = useState('');
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [commitment, setCommitment] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return undefined;
    const controller = new AbortController();
    const load = async () => {
      const token = await getAccessToken();
      if (!token || controller.signal.aborted) return;
      try {
        const res = await fetchMyProfile({ accessToken: token, signal: controller.signal });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- signal.aborted may flip during await
        if (!controller.signal.aborted) setProfile(res.user);
      } catch {
        /* swallow — user may not have profile yet */
      }
    };
    void load();
    return () => controller.abort();
  }, [authenticated, getAccessToken]);

  // Reset commitment when broker or uploaded file changes.
  useEffect(() => {
    setCommitment('');
  }, [brokerSlug, uploaded?.cid]);

  const handleFile = useCallback(
    async (selectedFile: File) => {
      setError(null);
      if (!ALLOWED_MIME.includes(selectedFile.type)) {
        setError(t('uploadInvalidType'));
        return;
      }
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError(t('uploadTooLarge'));
        return;
      }

      setIsUploading(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Not authenticated');
        const res = await uploadVerifyEvidence(selectedFile, { accessToken: token });
        setUploaded({ file: selectedFile, cid: res.cid });
      } catch {
        setError(t('uploadFailed'));
      } finally {
        setIsUploading(false);
      }
    },
    [getAccessToken, t],
  );

  const handleDragOver = (e: ReactDragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: ReactDragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleRemoveFile = () => {
    setUploaded(null);
    setCommitment('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const computeCommitment = () => {
    if (!brokerSlug || !uploaded || !profile?.walletAddressFull) return;

    setIsComputing(true);
    setTimeout(() => {
      const saltBytes = crypto.getRandomValues(new Uint8Array(32));
      const saltHex: `0x${string}` = `0x${Array.from(saltBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`;

      const hash = keccak256(
        encodePacked(
          ['address', 'string', 'string', 'bytes32'],
          [profile.walletAddressFull as `0x${string}`, brokerSlug, uploaded.cid, saltHex],
        ),
      );
      setCommitment(hash);
      setIsComputing(false);
    }, 400);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!brokerSlug || !uploaded || !commitment) return;

    setSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await apiPost(
        '/v1/auth/verify-broker',
        { brokerSlug, commitment, evidenceIpfsCid: uploaded.cid },
        { accessToken: token },
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
        <Shield className="size-10 text-[#00FF88]" aria-hidden />
        <p className="text-sm text-white/60">{t('loginRequired')}</p>
        <button
          onClick={() => void login()}
          className="rounded-full bg-[#00FF88] px-6 py-2.5 text-sm font-bold text-[#050608] transition-colors hover:bg-[#00D170]"
        >
          {t('login')}
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/5 p-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-[#00FF88]/15">
          <CheckCircle2 className="size-7 text-[#00FF88]" />
        </div>
        <h3 className="text-xl font-bold">{t('successTitle')}</h3>
        <p className="max-w-md text-sm text-white/60">{t('successMessage')}</p>
      </div>
    );
  }

  const canCompute = Boolean(brokerSlug && uploaded && profile?.walletAddressFull);
  const canSubmit = Boolean(brokerSlug && uploaded && commitment && !submitting);

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
      <h2 className="border-b border-white/10 pb-4 text-2xl font-bold">{t('formTitle')}</h2>

      {/* Broker selection */}
      <div className="space-y-3">
        <label htmlFor="broker-combobox" className="block text-sm font-bold text-white/80">
          {t('brokerSlug')}
        </label>
        <BrokerCombobox
          initialBrokers={brokers}
          locale={locale}
          value={brokerSlug}
          onChange={setBrokerSlug}
        />
      </div>

      {/* File upload */}
      <div className="space-y-3">
        <label className="flex items-center justify-between text-sm font-bold text-white/80">
          <span>{t('uploadLabel')}</span>
          <span className="text-xs font-normal text-white/40">{t('uploadSizeHint')}</span>
        </label>

        <div
          className={`group relative w-full overflow-hidden rounded-xl border-2 border-dashed p-8 transition-all
            ${isDragging ? 'border-[#00FF88] bg-[#00FF88]/5' : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'}
            ${uploaded ? 'border-blue-500/50 bg-blue-500/5 hover:border-blue-500/60' : ''}
            ${!uploaded ? 'cursor-pointer' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploaded && !isUploading && fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
          />

          {isUploading ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-[#00FF88]/15">
                <div className="size-5 animate-spin rounded-full border-2 border-[#00FF88]/30 border-t-[#00FF88]" />
              </div>
              <span className="text-sm font-bold text-white">{t('uploadingFile')}</span>
            </div>
          ) : uploaded ? (
            <div className="z-10 flex flex-col items-center justify-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                <FileText size={24} />
              </div>
              <span className="mb-1 max-w-xs truncate font-bold text-white">
                {uploaded.file.name}
              </span>
              <span className="mb-4 text-sm text-white/50">
                {(uploaded.file.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <div className="mb-3 flex items-center gap-2 rounded-full bg-[#00FF88]/10 px-3 py-1 font-mono text-xs text-[#00FF88]">
                <span className="text-white/40">{t('ipfsCid')}:</span>
                <span className="truncate" title={uploaded.cid}>
                  {uploaded.cid.slice(0, 10)}...{uploaded.cid.slice(-6)}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile();
                }}
                className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:text-red-300"
              >
                <X size={14} /> {t('removeFile')}
              </button>
            </div>
          ) : (
            <div className="pointer-events-none flex flex-col items-center justify-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-white/5 text-white/50 transition-transform group-hover:scale-110">
                <Upload size={24} />
              </div>
              <span className="mb-2 font-bold text-white">{t('uploadDropTitle')}</span>
              <span className="max-w-xs text-center text-sm text-white/40">
                {t('uploadDropDesc')}
              </span>
            </div>
          )}
        </div>
        <p className="pt-1 text-xs text-white/40">{t('uploadIpfsHint')}</p>
      </div>

      {/* Commitment hash */}
      <div className="space-y-3">
        <label className="block text-sm font-bold text-white/80">{t('commitmentLabel')}</label>
        <div className="relative">
          <div className="flex min-h-[50px] w-full items-center overflow-hidden rounded-xl border border-white/10 bg-black/40 px-4 py-3.5">
            {commitment ? (
              <span className="break-all font-mono text-sm text-[#00FF88]">{commitment}</span>
            ) : (
              <button
                type="button"
                disabled={!canCompute || isComputing}
                onClick={computeCommitment}
                className="flex h-full w-full items-center justify-center gap-2 text-white/40 transition-colors hover:text-white disabled:pointer-events-none"
              >
                {isComputing ? (
                  <span className="flex animate-pulse items-center gap-2 font-bold text-white">
                    <Lock size={16} /> {t('computing')}
                  </span>
                ) : (
                  <>
                    <Lock size={16} />{' '}
                    {canCompute ? t('computeCommitment') : t('computeCommitmentReady')}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <p className="pt-1 text-xs text-white/40">{t('commitmentHint')}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {t('errorTitle')}: {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold transition-all enabled:bg-blue-600 enabled:text-white enabled:shadow-[0_0_20px_rgba(37,99,235,0.4)] enabled:hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/20 disabled:text-blue-200/30"
      >
        {submitting ? t('submitting') : t('submit')}
      </button>

      <p className="text-center text-xs text-white/30">{t('disclaimer')}</p>
    </form>
  );
};

// =========================================================================
// BrokerCombobox — searchable broker picker
// =========================================================================
// Server-side debounced search via /v1/brokers?search=...&limit=50.
// Local fallback filtering on the initial 100-broker batch shipped from SSR
// so the dropdown feels instant before the API responds.

type BrokerComboboxProps = {
  initialBrokers: Broker[];
  locale: string;
  value: string;
  onChange: (slug: string) => void;
};

const SEARCH_DEBOUNCE_MS = 250;

const BrokerCombobox = ({ initialBrokers, locale, value, onChange }: BrokerComboboxProps) => {
  const t = useTranslations('verify');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [remoteBrokers, setRemoteBrokers] = useState<Broker[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Selected broker — search both the cached + initial pools so the label
  // survives even after the dropdown list changes.
  const selectedBroker = useMemo(() => {
    if (!value) return null;
    return (
      remoteBrokers?.find((b) => b.slug === value) ??
      initialBrokers.find((b) => b.slug === value) ??
      null
    );
  }, [value, remoteBrokers, initialBrokers]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Debounced server search. Reset to initial when query < 2 chars to avoid
  // hammering the API on single-character noise.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setRemoteBrokers(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const controller = new AbortController();
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetchBrokers({
            search: trimmed,
            limit: 50,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            setRemoteBrokers(
              res.brokers.map((b) => ({
                slug: b.slug,
                displayName: b.displayName,
                legalName: b.legalName,
              })),
            );
          }
        } catch {
          /* keep stale list on error */
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [search]);

  // List shown in dropdown: remote results (when searching) or initial 100.
  // For initial-list mode we also locally filter so the typing feels instant.
  const visibleBrokers = useMemo(() => {
    if (remoteBrokers) return remoteBrokers;
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return initialBrokers;
    return initialBrokers.filter(
      (b) =>
        b.displayName.toLowerCase().includes(trimmed) ||
        b.legalName.toLowerCase().includes(trimmed),
    );
  }, [remoteBrokers, search, initialBrokers]);

  const handleSelect = (slug: string) => {
    onChange(slug);
    setOpen(false);
    setSearch('');
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
    setRemoteBrokers(null);
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button / search input */}
      <div
        className={`flex w-full items-center gap-2 rounded-xl border bg-white/5 px-4 py-3 transition-colors
          ${open ? 'border-[#00FF88] ring-1 ring-[#00FF88]' : 'border-white/10 hover:border-white/20'}`}
      >
        <Search className="size-4 shrink-0 text-white/40" aria-hidden />
        <input
          id="broker-combobox"
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={open ? search : selectedBroker ? localizedBrokerName(selectedBroker, locale) : ''}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
            if (value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          placeholder={selectedBroker ? '' : t('brokerSearchPlaceholder')}
          className="flex-1 bg-transparent text-white placeholder:text-white/40 focus:outline-none"
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t('removeFile')}
            className="shrink-0 rounded-full p-1 text-white/40 hover:bg-white/5 hover:text-white"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown
            className={`size-4 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-md">
          {loading && (
            <div className="px-4 py-3 text-xs text-white/40">{t('brokerSearchLoading')}</div>
          )}
          <ul className="max-h-72 overflow-y-auto">
            {visibleBrokers.length === 0 && !loading ? (
              <li className="px-4 py-3 text-sm text-white/40">{t('brokerSearchNoResults')}</li>
            ) : (
              visibleBrokers.map((b) => {
                const primary = localizedBrokerName(b, locale);
                const secondary = locale === 'en' ? b.displayName : b.legalName;
                const showSecondary = secondary && secondary !== primary;
                const selected = b.slug === value;
                return (
                  <li key={b.slug}>
                    <button
                      type="button"
                      onClick={() => handleSelect(b.slug)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors
                        ${selected ? 'bg-[#00FF88]/10 text-[#00FF88]' : 'text-white/80 hover:bg-white/5'}`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{primary}</span>
                        {showSecondary && (
                          <span className="truncate text-xs text-white/40">{secondary}</span>
                        )}
                      </span>
                      {selected && <Check size={14} className="shrink-0" aria-hidden />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-t border-white/5 px-4 py-2 text-[11px] text-white/30">
            {t('brokerSearchHint')}
          </div>
        </div>
      )}
    </div>
  );
};

export const VerifySteps = () => {
  const t = useTranslations('verify');

  const steps = [
    { icon: Upload, title: t('steps.step1Title'), desc: t('steps.step1Desc') },
    { icon: Fingerprint, title: t('steps.step2Title'), desc: t('steps.step2Desc') },
    { icon: Shield, title: t('steps.step3Title'), desc: t('steps.step3Desc') },
    { icon: CheckCircle2, title: t('steps.step4Title'), desc: t('steps.step4Desc') },
  ];

  return (
    <div className="space-y-6">
      <h3 className="border-b border-white/10 pb-4 text-lg font-bold">{t('steps.title')}</h3>
      <div className="space-y-4">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={i}
              className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50">
                <Icon size={18} aria-hidden />
              </div>
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="font-bold text-white">{step.title}</h4>
                  <span className="font-mono text-xs text-white/30">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-white/50">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
