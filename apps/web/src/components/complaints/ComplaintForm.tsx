/**
 * Client-side complaint submission form (M7.5c → S22.1 wizard redesign).
 *
 * Per Google design reference `ComplaintForm.tsx`:
 *   Step 1 — Guidelines / notices (new)
 *   Step 2 — Form details (sentiment + title + body)
 *   Step 3 — Evidence upload
 *   Success — Confirmation card
 *
 * Architecture mirrors the existing `VerifyForm` 3-step wizard pattern
 * introduced in S19. The auth gates (loading / unauth / requires-sbt) fire
 * before the wizard is reached.
 *
 * State machines:
 *   - `viewMode` — gates the entire surface (loading / unauth / needs L2
 *     SBT / ready / success).
 *   - `wizardStep` — within "ready" view, tracks 1 | 2 | 3
 *   - `uploadState` — owns the EvidenceUpload primitive lifecycle
 *   - `formState` — owns the submit lifecycle (idle → submitting → error)
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Info,
  ShieldCheck,
} from 'lucide-react';
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
type WizardStep = 1 | 2 | 3;

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
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
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
        setViewMode('ready');
        return;
      }
      setProfile(profileRes.user);
      setViewMode(profileRes.user.sbtTier === 'L2' ? 'ready' : 'requires-sbt');
    };

    void load();
    return () => controller.abort();
  }, [authenticated, getAccessToken]);

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
      <div className="text-center py-10 space-y-6">
        <div className="w-24 h-24 bg-[#00FF88]/20 text-[#00FF88] rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={48} />
        </div>
        <h2 className="text-3xl font-bold text-white">{t('successTitle')}</h2>
        <p className="text-white/60 max-w-md mx-auto">{t('successMessage')}</p>
        <div className="pt-8 flex flex-col gap-3 max-w-xs mx-auto">
          <Link
            href={`/brokers/${brokerSlug}`}
            className="w-full py-3 bg-[#00FF88] text-black font-bold rounded-xl hover:bg-[#00e67a] transition-all text-center"
          >
            {t('successBackToBroker')}
          </Link>
          <Link
            href="/brokers"
            className="w-full py-3 bg-white/5 text-white font-bold rounded-xl border border-white/10 hover:bg-white/10 transition-all text-center"
          >
            {t('successBrowseBrokers')}
          </Link>
        </div>
      </div>
    );
  }

  // ── Ready: 3-step wizard ──────────────────────────────────────────────

  const bodyTrimmedLength = body.trim().length;
  const isUploadReady = uploadState.status === 'uploaded';
  const isBodyValid = bodyTrimmedLength >= BODY_MIN;
  const isSentimentValid = sentiment !== null;
  const canSubmit =
    isUploadReady && isBodyValid && isSentimentValid && formState.kind !== 'submitting';

  const stepLabels = [t('wizard.step1'), t('wizard.step2'), t('wizard.step3')];

  return (
    <div className="space-y-8">
      {/* Progress Steps Indicator */}
      <div className="flex items-center justify-between overflow-hidden relative">
        <div className="absolute top-4 left-0 w-full h-[1px] bg-white/10 -z-10" />
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex flex-col items-center gap-2 bg-[#050608] px-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                wizardStep >= step
                  ? 'bg-[#00FF88]/20 border-[#00FF88] text-[#00FF88]'
                  : 'bg-zinc-900 border-white/10 text-white/40'
              }`}
            >
              {step}
            </div>
            <span
              className={`text-xs font-bold ${wizardStep >= step ? 'text-[#00FF88]' : 'text-white/40'}`}
            >
              {stepLabels[step - 1]}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 1: Guidelines */}
      {wizardStep === 1 && (
        <div className="space-y-6 animate-in fade-in">
          <h2 className="text-2xl font-bold text-white">
            {t('wizard.guidelinesTitle', { broker: brokerName })}
          </h2>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-sm text-orange-400 space-y-4">
            <h3 className="font-bold flex items-center gap-2 text-base">
              <AlertTriangle size={18} />
              {t('wizard.guidelinesHeading')}
            </h3>
            <p className="text-orange-300/80">{t('wizard.guidelinesIntro')}</p>
            <ul className="list-disc pl-5 space-y-2 text-orange-300/80">
              <li>{t('wizard.guidelinesRule1')}</li>
              <li>{t('wizard.guidelinesRule2')}</li>
              <li>{t('wizard.guidelinesRule3')}</li>
              <li>{t('wizard.guidelinesRule4')}</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setWizardStep(2)}
            className="w-full py-4 bg-[#00FF88] text-black font-bold rounded-xl hover:bg-[#00e67a] hover:shadow-[0_0_20px_#00FF8840] transition-all"
          >
            {t('wizard.guidelinesAccept')}
          </button>
        </div>
      )}

      {/* STEP 2: Form Details */}
      {wizardStep === 2 && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
              {t('wizard.back')}
            </button>
          </div>

          <h2 className="text-2xl font-bold text-white">{t('wizard.formHeading')}</h2>

          {formState.kind === 'error' && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              <span className="font-bold">{t('errorTitle')}: </span>
              {formState.message}
            </div>
          )}

          <div className="space-y-5 bg-white/5 border border-white/10 p-6 rounded-2xl">
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-white/70">{t('sentimentLabel')}</legend>
              <SentimentPicker
                value={sentiment}
                onChange={setSentiment}
                labels={sentimentLabels}
                groupLabel={t('sentimentLabel')}
                disabled={formState.kind === 'submitting'}
              />
            </fieldset>

            <div className="space-y-2">
              <label className="text-sm font-bold text-white/70 flex justify-between">
                <span>{t('titleLabel')}</span>
                <span className="text-xs text-white/30 font-normal">{t('titleOptional')}</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('titlePlaceholder')}
                maxLength={TITLE_MAX}
                disabled={formState.kind === 'submitting'}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00FF88] transition-colors disabled:opacity-60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-white/70 flex justify-between">
                <span>{t('bodyLabel')}</span>
                <span
                  className={
                    bodyTrimmedLength > BODY_MAX
                      ? 'text-xs font-normal text-red-400'
                      : 'text-xs font-normal text-white/30'
                  }
                >
                  {bodyTrimmedLength}/{BODY_MAX}
                </span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('bodyPlaceholder')}
                required
                minLength={BODY_MIN}
                maxLength={BODY_MAX}
                rows={6}
                disabled={formState.kind === 'submitting'}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00FF88] min-h-[150px] resize-none transition-colors disabled:opacity-60"
              />
              <p className="text-xs text-white/40">{t('bodyHint')}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={!isBodyValid || !isSentimentValid}
            onClick={() => setWizardStep(3)}
            className="w-full py-4 bg-[#00FF88] text-black font-bold rounded-xl hover:bg-[#00e67a] hover:shadow-[0_0_20px_#00FF8840] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('wizard.nextEvidence')}
          </button>
        </div>
      )}

      {/* STEP 3: Evidence Upload + Submit */}
      {wizardStep === 3 && (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 animate-in fade-in">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardStep(2)}
              className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
              {t('wizard.back')}
            </button>
          </div>

          <h2 className="text-2xl font-bold text-white">{t('wizard.evidenceHeading')}</h2>

          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex gap-3 text-sm text-blue-300">
            <Info className="shrink-0 mt-0.5 text-blue-400" size={18} />
            <p className="leading-relaxed">{t('wizard.evidenceHint')}</p>
          </div>

          {formState.kind === 'error' && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              <span className="font-bold">{t('errorTitle')}: </span>
              {formState.message}
            </div>
          )}

          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-4">
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

          <div className="space-y-3">
            <p className="text-xs text-white/40">{t('immutableHint')}</p>
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-4 bg-[#00FF88] text-black font-bold rounded-xl hover:bg-[#00e67a] hover:shadow-[0_0_20px_#00FF8840] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {formState.kind === 'submitting' ? t('submitting') : t('wizard.submitFinal')}
            </button>
          </div>
        </form>
      )}

      {/* Profile display */}
      {profile?.displayName && (
        <p className="text-xs text-white/30 text-center">
          {t('formSubtitle', { broker: brokerName })} · {profile.displayName}
        </p>
      )}
    </div>
  );
};
