/**
 * `/verify` — L2 SBT verification wizard.
 *
 * 3-step wizard with left progress tracker (sticky sidebar) + right content:
 *   Step 1: Select broker + upload evidence
 *   Step 2: Commitment hash generation with decorative terminal animation
 *   Step 3: Submit → pending/approved/rejected status card
 *
 * Per ADR-0022 + ADR-0025: keeps all real API calls (uploadVerifyEvidence,
 * POST /v1/auth/verify-broker, fetchVerificationStatus) + Privy auth gate.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Fingerprint,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Terminal,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodePacked, keccak256 } from 'viem';

import { localizedBrokerName } from '@opentrade/shared';

import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import {
  apiPost,
  fetchBrokers,
  fetchMyProfile,
  fetchVerificationStatus,
  uploadVerifyEvidence,
} from '../../lib/api/client';
import { translateApiError } from '../../lib/api/errorMessage';

import type {
  UserProfile,
  VerificationStatusItem,
  VerifiedBrokerEntry,
} from '../../lib/api/client';
import type { DragEvent as ReactDragEvent, FormEvent } from 'react';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type Broker = {
  slug: string;
  displayName: string;
  displayNameZhHans: string | null;
  legalName: string;
};

type VerifyFormProps = {
  brokers: Broker[];
};

type UploadedFile = {
  file: File;
  cid: string;
  previewUrl: string | null;
};

type ViewMode = 'loading' | 'idle' | 'pending' | 'rejected' | 'approved' | 'adding';
type WizardStep = 1 | 2 | 3;

export const VerifyForm = ({ brokers }: VerifyFormProps) => {
  const t = useTranslations('verify');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const { authenticated, login } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [latestVerification, setLatestVerification] = useState<VerificationStatusItem | null>(null);
  const [verifiedBrokers, setVerifiedBrokers] = useState<VerifiedBrokerEntry[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [brokerSlug, setBrokerSlug] = useState('');
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [commitment, setCommitment] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Terminal animation logs for step 2
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [hashReady, setHashReady] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      setViewMode('idle');
      return undefined;
    }
    const controller = new AbortController();
    setViewMode('loading');
    const load = async () => {
      const token = await getAccessToken();
      if (!token || controller.signal.aborted) return;

      const profilePromise = fetchMyProfile({
        accessToken: token,
        signal: controller.signal,
      }).catch(() => null);
      const statusPromise = fetchVerificationStatus({
        accessToken: token,
        signal: controller.signal,
      }).catch(() => null);

      const [profileRes, statusRes] = await Promise.all([profilePromise, statusPromise]);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- signal.aborted may flip during await
      if (controller.signal.aborted) return;

      if (profileRes) setProfile(profileRes.user);

      const latest = statusRes?.verifications[0] ?? null;
      const vBrokers = statusRes?.verifiedBrokers ?? [];
      setLatestVerification(latest);
      setVerifiedBrokers(vBrokers);

      if (latest?.status === 'PENDING') {
        setViewMode('pending');
      } else if (latest?.status === 'REJECTED') {
        setViewMode('rejected');
      } else if (vBrokers.length > 0 || profileRes?.user.sbtTier === 'L2') {
        setViewMode('approved');
      } else {
        setViewMode('idle');
      }
    };
    void load();
    return () => controller.abort();
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    setCommitment('');
    setHashReady(false);
    setTerminalLogs([]);
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
        const previewUrl = selectedFile.type.startsWith('image/')
          ? URL.createObjectURL(selectedFile)
          : null;
        setUploaded((prev) => {
          if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return { file: selectedFile, cid: res.cid, previewUrl };
        });
      } catch (err) {
        setError(translateApiError(err, tErrors, t('uploadFailed')));
      } finally {
        setIsUploading(false);
      }
    },
    [getAccessToken, t, tErrors],
  );

  useEffect(() => {
    const url = uploaded?.previewUrl;
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [uploaded?.previewUrl]);

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
    if (uploaded?.previewUrl) URL.revokeObjectURL(uploaded.previewUrl);
    setUploaded(null);
    setCommitment('');
    setHashReady(false);
    setTerminalLogs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startHashComputation = () => {
    if (!brokerSlug || !uploaded || !profile?.walletAddressFull) return;

    setIsComputing(true);
    setTerminalLogs([]);
    setHashReady(false);

    const logs = [
      '[System] Initializing keccak256 engine...',
      '[Engine] Loading wallet address parameter...',
      `[Engine] Broker slug: ${brokerSlug}`,
      `[IPFS] Content identifier: ${uploaded.cid.slice(0, 16)}...`,
      '[Crypto] Generating random 32-byte salt...',
      '[Crypto] Computing encodePacked(address, string, string, bytes32)...',
      '[keccak256] Hashing packed data...',
    ];

    let idx = 0;
    const interval = setInterval(() => {
      if (idx < logs.length) {
        setTerminalLogs((prev) => [...prev, logs[idx] ?? '']);
        idx++;
      } else {
        clearInterval(interval);

        // Real keccak256 computation
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
        setTerminalLogs((prev) => [
          ...prev,
          '[System] Proof generation successful.',
          `[Result] Commitment: ${hash}`,
        ]);
        setHashReady(true);
        setIsComputing(false);
      }
    }, 450);
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!brokerSlug || !uploaded || !commitment) return;

    setSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await apiPost(
        '/v1/auth/verify-broker',
        {
          brokerSlug,
          commitment,
          evidenceIpfsCid: uploaded.cid,
          evidenceMimeType: uploaded.file.type,
        },
        { accessToken: token },
      );
      const pickedBroker = brokers.find((b) => b.slug === brokerSlug);
      setLatestVerification({
        id: 'pending-local',
        brokerSlug,
        brokerDisplayName: pickedBroker?.displayName ?? brokerSlug,
        brokerDisplayNameZhHans: pickedBroker?.displayNameZhHans ?? null,
        brokerLegalName: pickedBroker?.legalName ?? null,
        commitment,
        status: 'PENDING',
        adminNote: null,
        createdAt: new Date().toISOString(),
        reviewedAt: null,
      });
      setViewMode('pending');
    } catch (err) {
      setError(translateApiError(err, tErrors));
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    if (uploaded?.previewUrl) URL.revokeObjectURL(uploaded.previewUrl);
    setBrokerSlug('');
    setUploaded(null);
    setCommitment('');
    setHashReady(false);
    setTerminalLogs([]);
    setError(null);
    setWizardStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setViewMode('idle');
  };

  // -------------------------------------------------------------------------
  // Auth gate
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

  if (viewMode === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
        <p className="text-sm text-white/50">{t('loadingStatus')}</p>
      </div>
    );
  }

  if (viewMode === 'approved') {
    return (
      <VerifyApprovedCard
        verifiedBrokers={verifiedBrokers}
        locale={locale}
        canAddMore={verifiedBrokers.length < brokers.length}
        onAddAnother={() => {
          setViewMode('adding');
          setWizardStep(1);
        }}
      />
    );
  }

  if (viewMode === 'pending' && latestVerification) {
    return (
      <VerifyPendingCard
        record={latestVerification}
        brokerName={localizedBrokerName(
          {
            slug: latestVerification.brokerSlug,
            displayName: latestVerification.brokerDisplayName,
            displayNameZhHans: latestVerification.brokerDisplayNameZhHans,
            legalName: latestVerification.brokerLegalName,
          },
          locale,
        )}
      />
    );
  }

  if (viewMode === 'rejected' && latestVerification) {
    return (
      <VerifyRejectedCard
        record={latestVerification}
        brokerName={localizedBrokerName(
          {
            slug: latestVerification.brokerSlug,
            displayName: latestVerification.brokerDisplayName,
            displayNameZhHans: latestVerification.brokerDisplayNameZhHans,
            legalName: latestVerification.brokerLegalName,
          },
          locale,
        )}
        onRetry={handleRetry}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Wizard
  // -------------------------------------------------------------------------
  const canProceedToStep2 = Boolean(brokerSlug && uploaded);
  const canSubmit = Boolean(commitment && hashReady && !submitting);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
      {/* Left: Progress Tracker */}
      <div className="lg:col-span-3">
        <div className="sticky top-24 space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">
            {t('wizard.protocol')}
          </h3>

          <div className="space-y-3">
            {[
              { s: 1 as const, title: t('wizard.step1Title'), desc: t('wizard.step1Desc') },
              { s: 2 as const, title: t('wizard.step2Title'), desc: t('wizard.step2Desc') },
              { s: 3 as const, title: t('wizard.step3Title'), desc: t('wizard.step3Desc') },
            ].map((step) => {
              const isActive = wizardStep === step.s;
              const isPassed = wizardStep > step.s;
              return (
                <div
                  key={step.s}
                  className={`flex items-start gap-4 rounded-xl p-4 transition-all ${isActive ? 'border border-white/20 bg-white/5 shadow-lg' : 'opacity-60'}`}
                >
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${isPassed ? 'border-[#00FF88] bg-[#00FF88] text-black' : isActive ? 'border-[#00FF88] text-[#00FF88]' : 'border-white/20 text-white/40'}`}
                  >
                    {isPassed ? (
                      <Check size={14} strokeWidth={3} />
                    ) : (
                      <span className="text-sm font-bold">{step.s}</span>
                    )}
                  </div>
                  <div>
                    <div className={`font-bold ${isActive ? 'text-white' : 'text-white/60'}`}>
                      {step.title}
                    </div>
                    <div className="mt-1 text-xs text-white/40">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* SBT warning callout */}
          <div className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/10 p-4">
            <Shield size={16} className="mt-0.5 shrink-0 text-orange-400" />
            <p className="text-xs leading-relaxed text-orange-200/80">{t('wizard.sbtWarning')}</p>
          </div>
        </div>
      </div>

      {/* Right: Content Area */}
      <div className="lg:col-span-9">
        {/* STEP 1: Select broker + upload */}
        {wizardStep === 1 && (
          <div className="animate-in slide-in-from-right-4 space-y-8 duration-500">
            <div>
              <h2 className="mb-2 text-2xl font-bold">{t('wizard.step1Heading')}</h2>
              <p className="text-sm text-white/50">{t('wizard.step1Subtitle')}</p>
            </div>

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
                excludeSlugs={verifiedBrokers.map((b) => b.brokerSlug)}
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
                    {uploaded.previewUrl ? (
                      <div className="mb-3 flex size-32 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        <img
                          src={uploaded.previewUrl}
                          alt={uploaded.file.name}
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                        <FileText size={24} />
                      </div>
                    )}
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

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button
                type="button"
                disabled={!canProceedToStep2}
                onClick={() => {
                  setError(null);
                  setWizardStep(2);
                }}
                className="flex items-center gap-2 rounded-xl bg-white px-8 py-3 font-bold text-black transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t('wizard.next')} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Hash computation with terminal animation */}
        {wizardStep === 2 && (
          <div className="animate-in slide-in-from-right-4 space-y-8 duration-500">
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold">
                <Fingerprint size={24} className="text-[#00FF88]" />
                {t('wizard.step2Heading')}
              </h2>
              <p className="text-sm text-white/50">{t('wizard.step2Subtitle')}</p>
            </div>

            {/* Terminal */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
                <Terminal size={14} className="text-white/40" />
                <span className="font-mono text-xs text-white/40">keccak256-engine</span>
              </div>

              <div className="h-64 space-y-2 overflow-y-auto p-6 font-mono text-xs sm:text-sm">
                {terminalLogs.length === 0 && !isComputing && (
                  <div className="flex h-full items-center justify-center">
                    <button
                      type="button"
                      onClick={startHashComputation}
                      className="flex items-center gap-3 rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/10 px-6 py-4 font-sans text-base font-bold text-[#00FF88] transition-all hover:bg-[#00FF88]/20 hover:shadow-[0_0_20px_rgba(0,255,136,0.2)]"
                    >
                      <Lock size={20} /> {t('wizard.startCompute')}
                    </button>
                  </div>
                )}
                {terminalLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 ${
                      log.includes('[Result]')
                        ? 'mt-4 font-bold text-[#00FF88]'
                        : log.includes('[Crypto]')
                          ? 'text-blue-400'
                          : log.includes('[System]')
                            ? 'text-white/70'
                            : 'text-white/50'
                    }`}
                  >
                    <span className="shrink-0 opacity-30">{String(i + 1).padStart(2, '0')}</span>
                    <span className="break-all">{log}</span>
                  </div>
                ))}
                {isComputing && (
                  <div className="flex items-center gap-2 text-[#00FF88]">
                    <span className="opacity-30">
                      {String(terminalLogs.length + 1).padStart(2, '0')}
                    </span>
                    <span className="h-4 w-2 animate-pulse bg-[#00FF88]" />
                  </div>
                )}
              </div>
            </div>

            {/* Hash result card */}
            {hashReady && commitment && (
              <div className="animate-in slide-in-from-bottom-2 flex items-center justify-between rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/10 p-6 duration-300">
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-widest text-[#00FF88]">
                    {t('wizard.commitmentGenerated')}
                  </div>
                  <div className="break-all font-mono text-sm text-white lg:text-base">
                    {commitment}
                  </div>
                </div>
                <CheckCircle2 size={32} className="ml-4 shrink-0 text-[#00FF88]" />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {t('errorTitle')}: {error}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                className="px-6 py-3 text-white/50 transition-colors hover:text-white"
              >
                {t('wizard.back')}
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
                className="flex items-center gap-2 rounded-xl px-8 py-3 font-bold transition-all disabled:cursor-not-allowed disabled:opacity-30 enabled:bg-[#00FF88] enabled:text-black enabled:shadow-[0_0_20px_rgba(0,255,136,0.3)] enabled:hover:bg-[#00e67a]"
              >
                {submitting ? t('submitting') : t('submit')} <ArrowRight size={18} />
              </button>
            </div>

            <p className="text-center text-xs text-white/30">{t('disclaimer')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// =========================================================================
// BrokerCombobox — searchable broker picker (unchanged from prior version)
// =========================================================================

type BrokerComboboxProps = {
  initialBrokers: Broker[];
  locale: string;
  value: string;
  onChange: (slug: string) => void;
  excludeSlugs?: string[];
};

const SEARCH_DEBOUNCE_MS = 250;

const BrokerCombobox = ({
  initialBrokers,
  locale,
  value,
  onChange,
  excludeSlugs,
}: BrokerComboboxProps) => {
  const t = useTranslations('verify');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [remoteBrokers, setRemoteBrokers] = useState<Broker[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(
    () => initialBrokers.find((b) => b.slug === value) ?? null,
  );

  useEffect(() => {
    if (!value) {
      setSelectedBroker(null);
      return;
    }
    if (selectedBroker?.slug === value) return;
    const found =
      remoteBrokers?.find((b) => b.slug === value) ?? initialBrokers.find((b) => b.slug === value);
    if (found) setSelectedBroker(found);
  }, [value, remoteBrokers, initialBrokers, selectedBroker]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
                displayNameZhHans: b.displayNameZhHans,
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

  const visibleBrokers = useMemo(() => {
    const excluded = new Set(excludeSlugs ?? []);
    const filterExcluded = (list: Broker[]) =>
      excluded.size === 0 ? list : list.filter((b) => !excluded.has(b.slug));

    if (remoteBrokers) return filterExcluded(remoteBrokers);
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return filterExcluded(initialBrokers);
    return filterExcluded(
      initialBrokers.filter(
        (b) =>
          b.displayName.toLowerCase().includes(trimmed) ||
          b.legalName.toLowerCase().includes(trimmed),
      ),
    );
  }, [remoteBrokers, search, initialBrokers, excludeSlugs]);

  const handleSelect = (broker: Broker) => {
    setSelectedBroker(broker);
    onChange(broker.slug);
    setOpen(false);
    setSearch('');
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBroker(null);
    onChange('');
    setSearch('');
    setRemoteBrokers(null);
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
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
            if (value) {
              onChange('');
              setSelectedBroker(null);
            }
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
                      onClick={() => handleSelect(b)}
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

// =========================================================================
// Status sub-components — Pending / Rejected / AlreadyVerified
// =========================================================================

const formatDateTime = (
  iso: string,
  locale: string,
  formatter: ReturnType<typeof useFormatter>,
): string => {
  try {
    return formatter.dateTime(new Date(iso), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(iso).toLocaleString(locale);
  }
};

const shortenCommitment = (hash: string): string =>
  hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;

type PendingCardProps = {
  record: VerificationStatusItem;
  brokerName: string;
};

const VerifyPendingCard = ({ record, brokerName }: PendingCardProps) => {
  const t = useTranslations('verify');
  const locale = useLocale();
  const formatter = useFormatter();
  const submittedAt = formatDateTime(record.createdAt, locale, formatter);

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent shadow-xl">
      <div className="flex flex-col items-center gap-4 px-8 pb-2 pt-10 text-center">
        <div className="relative flex size-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/30" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/40">
            <Clock className="size-8 text-amber-400" aria-hidden />
          </span>
        </div>
        <h2 className="text-2xl font-bold text-white">{t('pendingTitle')}</h2>
        <p className="max-w-md text-sm leading-relaxed text-white/60">
          {t('pendingDescription', { broker: brokerName })}
        </p>
      </div>

      <div className="space-y-3 px-8 py-8">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/40">
            {t('submittedAtLabel')}
          </div>
          <div className="font-mono text-sm text-white/80">{submittedAt}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/40">
            {t('commitmentLabel')}
          </div>
          <div className="break-all font-mono text-sm text-[#00FF88]/80" title={record.commitment}>
            {shortenCommitment(record.commitment)}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-400/80">
            {t('statusLabel')}
          </div>
          <div className="flex items-center gap-2 text-sm text-amber-200">
            <span className="size-2 animate-pulse rounded-full bg-amber-400" />
            {t('statusPending')}
          </div>
        </div>
      </div>
    </div>
  );
};

type RejectedCardProps = {
  record: VerificationStatusItem;
  brokerName: string;
  onRetry: () => void;
};

const VerifyRejectedCard = ({ record, brokerName, onRetry }: RejectedCardProps) => {
  const t = useTranslations('verify');
  const locale = useLocale();
  const formatter = useFormatter();
  const submittedAt = formatDateTime(record.createdAt, locale, formatter);
  const reviewedAt = record.reviewedAt
    ? formatDateTime(record.reviewedAt, locale, formatter)
    : null;
  const reason = record.adminNote?.trim() ?? '';

  return (
    <div className="overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-b from-red-500/10 to-transparent shadow-xl">
      <div className="flex flex-col items-center gap-4 px-8 pb-2 pt-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-400/40">
          <XCircle className="size-8 text-red-400" aria-hidden />
        </div>
        <h2 className="text-2xl font-bold text-white">{t('rejectedTitle')}</h2>
        <p className="max-w-md text-sm leading-relaxed text-white/60">
          {t('rejectedDescription', { broker: brokerName })}
        </p>
      </div>

      <div className="space-y-3 px-8 py-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-red-400">
            {t('rejectionReason')}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-red-100/90">
            {reason || t('rejectionReasonEmpty')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/40">
              {t('submittedAtLabel')}
            </div>
            <div className="font-mono text-sm text-white/80">{submittedAt}</div>
          </div>
          {reviewedAt && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/40">
                {t('rejectedAtLabel')}
              </div>
              <div className="font-mono text-sm text-white/80">{reviewedAt}</div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 bg-white/5 px-8 py-5">
        <button
          type="button"
          onClick={onRetry}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500"
        >
          <RefreshCw size={16} /> {t('retry')}
        </button>
      </div>
    </div>
  );
};

type ApprovedCardProps = {
  verifiedBrokers: VerifiedBrokerEntry[];
  locale: string;
  canAddMore: boolean;
  onAddAnother: () => void;
};

const VerifyApprovedCard = ({
  verifiedBrokers,
  locale,
  canAddMore,
  onAddAnother,
}: ApprovedCardProps) => {
  const t = useTranslations('verify');
  const formatter = useFormatter();

  return (
    <div className="overflow-hidden rounded-2xl border border-[#00FF88]/30 bg-gradient-to-b from-[#00FF88]/10 to-transparent shadow-xl">
      <div className="flex flex-col items-center gap-4 px-8 pb-2 pt-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#00FF88]/15 ring-1 ring-[#00FF88]/40">
          <CheckCircle2 className="size-8 text-[#00FF88]" />
        </div>
        <h2 className="text-2xl font-bold text-white">{t('alreadyVerified')}</h2>
        {verifiedBrokers.length > 0 && (
          <p className="max-w-md text-sm leading-relaxed text-white/60">
            {t('verifiedBrokersCount', { count: verifiedBrokers.length })}
          </p>
        )}
      </div>

      {verifiedBrokers.length > 0 && (
        <div className="space-y-3 px-8 py-6">
          <div className="text-xs font-bold uppercase tracking-wider text-white/40">
            {t('verifiedBrokersTitle')}
          </div>
          <ul className="space-y-2">
            {verifiedBrokers.map((b) => {
              const name = localizedBrokerName(
                {
                  slug: b.brokerSlug,
                  displayName: b.displayName,
                  displayNameZhHans: b.displayNameZhHans,
                  legalName: b.legalName,
                },
                locale,
              );
              const approvedAt = formatDateTime(b.approvedAt, locale, formatter);
              return (
                <li
                  key={b.brokerSlug}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-white">{name}</span>
                    <span className="text-xs text-white/40">
                      {t('verifiedAtLabel')} · {approvedAt}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#00FF88]/15 px-2.5 py-1 text-xs font-bold text-[#00FF88]">
                    <Check size={12} aria-hidden /> {t('brokerAlreadyVerifiedBadge')}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canAddMore && (
        <div className="border-t border-white/10 bg-white/5 px-8 py-5">
          <p className="mb-3 text-xs leading-relaxed text-white/50">
            {t('addAnotherBrokerDescription')}
          </p>
          <button
            type="button"
            onClick={onAddAnother}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500"
          >
            <Upload size={16} /> {t('addAnotherBroker')}
          </button>
        </div>
      )}
    </div>
  );
};
