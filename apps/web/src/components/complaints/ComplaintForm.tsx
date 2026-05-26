/**
 * Client-side complaint submission form (M7.5c).
 *
 * Architecture mirrors `VerifyForm` (multi-state view + Pinata-via-API
 * upload) and `SubmitReviewCta` (sentiment-picker + body + sourceLocale)
 * but cleanly separates the two state machines:
 *
 *   - `viewMode` — gates the entire surface (loading / unauth / needs L2
 *     SBT / ready / success). Decided once on mount + when auth flips.
 *   - `uploadState` — owns the EvidenceUpload primitive lifecycle
 *     (idle → uploading → uploaded) plus the most recent upload error
 *     surfaced under the drop-zone.
 *   - `formState` — owns the submit lifecycle once the form is ready
 *     (idle → submitting → success | error).
 *
 * Authorisation gate:
 *   POST /v1/complaints requires `authMiddleware('reviewer')` (L2-
 *   equivalent per the auth hierarchy), so a plain logged-in user with
 *   `sbtTier === 'NONE'` would be rejected with a 403 at submit time.
 *   We pre-fetch `/v1/auth/me` on mount to give a friendlier UX:
 *   non-L2 users see a "verify a broker first" CTA that links to
 *   `/verify` instead of having to discover the requirement by failing.
 *
 * Pinata flow:
 *   The same `POST /v1/auth/verify-broker/upload` endpoint that backs
 *   `/verify` is reused end-to-end per ADR-0029 D3 (10MB cap, PNG /
 *   JPEG / PDF / WebP). We never touch Pinata client-side; the host
 *   passes the raw File to `uploadVerifyEvidence` which returns the
 *   IPFS CID. The CID is then submitted with the complaint body.
 *
 * Per rule 10: `EvidenceUpload` and `SentimentPicker` are caller-label
 * primitives — every visible string is resolved here via next-intl,
 * then handed down through props.
 *
 * Per ADR-0029 D6: `respondsToReviewId` (broker public-response wiring)
 * is schema-only in Phase 1; the form intentionally does NOT expose it.
 * The merchant-side write API lands with M10 商戶後台 (`STAGING.md` S8).
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import { AlertCircle, CheckCircle, ChevronRight, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  EvidenceUpload,
  type EvidenceUploadFile,
  type EvidenceUploadLabels,
  SentimentPicker,
  type Sentiment,
} from '@opentrade/ui';

import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import { Link } from '../../i18n/navigation';
import { fetchMyProfile, submitComplaint, uploadVerifyEvidence } from '../../lib/api/client';
import { translateApiError } from '../../lib/api/errorMessage';

import type { UserProfile } from '../../lib/api/client';
import type { FormEvent, ReactNode } from 'react';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png,.webp';

const BODY_MIN = 10;
const BODY_MAX = 2000;
const TITLE_MAX = 80;

type Props = {
  brokerId: string;
  brokerSlug: string;
  brokerName: string;
};

type ViewMode = 'loading' | 'unauthenticated' | 'requires-sbt' | 'ready' | 'success';

type UploadState =
  | { status: 'idle'; error: string | null }
  | { status: 'uploading' }
  | { status: 'uploaded'; uploaded: EvidenceUploadFile };

type FormState = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

export const ComplaintForm = ({ brokerId, brokerSlug, brokerName }: Props): ReactNode => {
  const t = useTranslations('complaintForm');
  const tReview = useTranslations('reviewForm');
  const tErrors = useTranslations('errors');
  const currentLocale = useLocale();
  const { authenticated, login } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', error: null });
  const [sentiment, setSentiment] = useState<Sentiment | null>('NEGATIVE');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formState, setFormState] = useState<FormState>({ kind: 'idle' });

  const evidenceLabels: EvidenceUploadLabels = useMemo(
    () => ({
      dropTitle: t('evidenceDropTitle'),
      dropDesc: t('evidenceDropDesc'),
      sizeHint: t('evidenceSizeHint'),
      uploading: t('evidenceUploading'),
      removeFile: t('evidenceRemoveFile'),
      ipfsCidLabel: t('evidenceCidLabel'),
    }),
    [t],
  );

  const sentimentLabels = useMemo(
    () => ({
      positive: tReview('sentimentPositive'),
      neutral: tReview('sentimentNeutral'),
      negative: tReview('sentimentNegative'),
    }),
    [tReview],
  );

  // Resolve view mode once auth settles. Re-runs when authenticated flips
  // (login / logout) so the gate stays accurate without a manual reload.
  useEffect(() => {
    if (!authenticated) {
      setViewMode('unauthenticated');
      setProfile(null);
      return undefined;
    }

    const controller = new AbortController();
    setViewMode('loading');

    const load = async (): Promise<void> => {
      const token = await getAccessToken();
      if (!token || controller.signal.aborted) return;

      const profileRes = await fetchMyProfile({
        accessToken: token,
        signal: controller.signal,
      }).catch(() => null);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- signal.aborted may flip during await
      if (controller.signal.aborted) return;

      if (!profileRes) {
        // Network blip — fall through to ready and let submit fail with
        // a localised error rather than blocking the entire surface.
        setViewMode('ready');
        return;
      }
      setProfile(profileRes.user);
      setViewMode(profileRes.user.sbtTier === 'L2' ? 'ready' : 'requires-sbt');
    };

    void load();
    return () => controller.abort();
  }, [authenticated, getAccessToken]);

  // Object-URL cleanup for image previews (mirrors VerifyForm:217-221).
  useEffect(() => {
    if (uploadState.status !== 'uploaded') return undefined;
    const url = uploadState.uploaded.previewUrl;
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [uploadState]);

  const handleFileSelected = useCallback(
    async (file: File): Promise<void> => {
      if (!ALLOWED_MIME.includes(file.type)) {
        setUploadState({ status: 'idle', error: t('evidenceInvalidType') });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setUploadState({ status: 'idle', error: t('evidenceTooLarge') });
        return;
      }
      setUploadState({ status: 'uploading' });
      try {
        const token = await getAccessToken();
        if (!token) {
          setUploadState({ status: 'idle', error: t('loginRequired') });
          return;
        }
        const res = await uploadVerifyEvidence(file, { accessToken: token });
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        setUploadState({
          status: 'uploaded',
          uploaded: {
            fileName: file.name,
            fileSize: file.size,
            cid: res.cid,
            previewUrl,
          },
        });
      } catch (err) {
        const message = translateApiError(err, tErrors, t('evidenceUploadFailed'));
        setUploadState({ status: 'idle', error: message });
      }
    },
    [getAccessToken, t, tErrors],
  );

  const handleRemoveEvidence = useCallback((): void => {
    setUploadState((prev) => {
      if (prev.status === 'uploaded' && prev.uploaded.previewUrl) {
        URL.revokeObjectURL(prev.uploaded.previewUrl);
      }
      return { status: 'idle', error: null };
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent): Promise<void> => {
      e.preventDefault();
      if (uploadState.status !== 'uploaded') return;
      if (sentiment === null) return;
      if (body.trim().length < BODY_MIN) return;

      setFormState({ kind: 'submitting' });
      try {
        const token = await getAccessToken();
        if (!token) {
          setFormState({ kind: 'error', message: t('loginRequired') });
          return;
        }
        const sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en' =
          currentLocale === 'zh-Hans' || currentLocale === 'en' ? currentLocale : 'zh-Hant';
        const trimmedTitle = title.trim();
        await submitComplaint(
          {
            brokerId,
            ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
            body: body.trim(),
            evidenceIpfsCid: uploadState.uploaded.cid,
            sentiment: sentiment,
            sourceLocale,
          },
          { accessToken: token },
        );
        setViewMode('success');
      } catch (err) {
        const message = translateApiError(err, tErrors, t('submitFailed'));
        setFormState({ kind: 'error', message });
      }
    },
    [brokerId, body, currentLocale, getAccessToken, sentiment, t, tErrors, title, uploadState],
  );

  // ── Gated views ─────────────────────────────────────────────────────────

  if (viewMode === 'loading') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-zinc-900/40 border border-white/10 p-6 text-sm text-white/50">
        <div className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
        {t('loading')}
      </div>
    );
  }

  if (viewMode === 'unauthenticated') {
    return (
      <div className="rounded-xl bg-gradient-to-r from-[#00FF88]/10 to-transparent border border-[#00FF88]/20 p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#00FF88]/20 text-[#00FF88]">
            <AlertCircle size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-[#00FF88]">{t('loginRequiredTitle')}</div>
            <p className="mt-1 text-sm text-white/60">{t('loginRequired')}</p>
            <button
              type="button"
              onClick={() => void login()}
              className="mt-4 rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-bold text-[#050608] transition-all hover:shadow-[0_0_15px_#00FF8840]"
            >
              {t('login')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'requires-sbt') {
    return (
      <div className="rounded-xl bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/20 p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
            <ShieldCheck size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-blue-400">{t('sbtRequiredTitle')}</div>
            <p className="mt-1 text-sm text-white/60">{t('sbtRequired')}</p>
            <Link
              href="/verify"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-500 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-400"
            >
              {t('sbtRequiredCta')}
              <ChevronRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'success') {
    return (
      <div className="rounded-xl bg-[#00FF88]/5 border border-[#00FF88]/20 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle size={20} className="mt-0.5 shrink-0 text-[#00FF88]" />
          <div className="flex-1">
            <h3 className="font-bold text-[#00FF88]">{t('successTitle')}</h3>
            <p className="mt-1 text-sm text-white/60">{t('successMessage')}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/brokers/${brokerSlug}`}
                className="rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-bold text-[#050608] transition-all hover:shadow-[0_0_15px_#00FF8840]"
              >
                {t('successBackToBroker')}
              </Link>
              <Link
                href="/brokers"
                className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/70 hover:border-white/40 hover:bg-white/10"
              >
                {t('successBrowseBrokers')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready: render the form ─────────────────────────────────────────────

  const bodyTrimmedLength = body.trim().length;
  const isUploadReady = uploadState.status === 'uploaded';
  const isBodyValid = bodyTrimmedLength >= BODY_MIN;
  const isSentimentValid = sentiment !== null;
  const canSubmit =
    isUploadReady && isBodyValid && isSentimentValid && formState.kind !== 'submitting';

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-6 rounded-2xl bg-zinc-900/60 border border-white/10 p-6 md:p-8 backdrop-blur-xl"
    >
      <div className="space-y-1">
        <div className="text-xs font-bold uppercase tracking-wider text-[#00FF88]">
          {t('formEyebrow')}
        </div>
        <h2 className="text-xl font-bold text-white md:text-2xl">{t('formTitle')}</h2>
        <p className="text-sm text-white/50">
          {t('formSubtitle', { broker: brokerName })}
          {profile?.displayName ? ` · ${profile.displayName}` : null}
        </p>
      </div>

      {formState.kind === 'error' && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <span className="font-bold">{t('errorTitle')}: </span>
          {formState.message}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-white/70">{t('evidenceLabel')}</label>
        <EvidenceUpload
          status={uploadState.status === 'uploaded' ? 'uploaded' : uploadState.status}
          uploaded={uploadState.status === 'uploaded' ? uploadState.uploaded : null}
          acceptAttribute={ACCEPT_ATTRIBUTE}
          onFileSelected={(file) => void handleFileSelected(file)}
          onRemove={handleRemoveEvidence}
          labels={evidenceLabels}
          theme="neon"
          disabled={formState.kind === 'submitting'}
        />
        {uploadState.status === 'idle' && uploadState.error ? (
          <p className="text-xs text-red-400">{uploadState.error}</p>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-white/70">{t('sentimentLabel')}</legend>
        <SentimentPicker
          value={sentiment}
          onChange={setSentiment}
          labels={sentimentLabels}
          groupLabel={t('sentimentLabel')}
          disabled={formState.kind === 'submitting'}
        />
      </fieldset>

      <label className="block space-y-2">
        <span className="flex items-baseline justify-between text-sm font-medium text-white/70">
          {t('titleLabel')}
          <span className="text-xs font-normal text-white/40">{t('titleOptional')}</span>
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          maxLength={TITLE_MAX}
          disabled={formState.kind === 'submitting'}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#00FF88]/40 transition-colors disabled:opacity-60"
        />
      </label>

      <label className="block space-y-2">
        <span className="flex items-baseline justify-between text-sm font-medium text-white/70">
          {t('bodyLabel')}
          <span
            className={
              bodyTrimmedLength > BODY_MAX
                ? 'text-xs font-normal text-red-400'
                : 'text-xs font-normal text-white/40'
            }
          >
            {bodyTrimmedLength}/{BODY_MAX}
          </span>
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('bodyPlaceholder')}
          required
          minLength={BODY_MIN}
          maxLength={BODY_MAX}
          rows={6}
          disabled={formState.kind === 'submitting'}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#00FF88]/40 transition-colors disabled:opacity-60"
        />
        <p className="text-xs text-white/40">{t('bodyHint')}</p>
      </label>

      <div className="flex flex-col gap-3 border-t border-white/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-white/40">{t('immutableHint')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/brokers/${brokerSlug}`}
            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:border-white/40 hover:bg-white/10"
          >
            {t('cancel')}
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-[#00FF88] px-6 py-2.5 text-sm font-bold text-[#050608] transition-all hover:shadow-[0_0_15px_#00FF8840] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
          >
            {formState.kind === 'submitting' ? t('submitting') : t('submit')}
          </button>
        </div>
      </div>
    </form>
  );
};
