'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  CheckCircle,
  BadgeCheck,
  FileText,
  Info,
  Loader2,
  LogIn,
  ShieldCheck,
  Upload,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useLoginRedirect } from '../../../../hooks/useLoginRedirect';
import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { Link } from '../../../../i18n/navigation';
import { applyKol, fetchMyKolProfile, ApiClientError } from '../../../../lib/api/client';

import type { ReactNode } from 'react';

type KolApplicationStatus = 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export default function KolOnboardingPage(): ReactNode {
  const t = useTranslations('kolConsole');
  const { authenticated } = usePrivy();
  const goLogin = useLoginRedirect();
  const { getAccessToken } = useOpenTradeAuth();

  const [appStatus, setAppStatus] = useState<KolApplicationStatus>('NOT_STARTED');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [twitter, setTwitter] = useState('');
  const [youtube, setYoutube] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
      if (!token || cancelled) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetchMyKolProfile({ accessToken: token });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (cancelled) return;
        const status = res.kol.status;
        if (status === 'APPROVED') setAppStatus('APPROVED');
        else if (status === 'PENDING') setAppStatus('PENDING');
        else if (status === 'REJECTED') setAppStatus('REJECTED');
      } catch {
        // No KOL profile — start fresh
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const input: Parameters<typeof applyKol>[0] = {
        displayName: displayName.trim(),
      };
      if (bio.trim()) input.bio = bio.trim();

      const hasSocials = youtube.trim() || twitter.trim();
      if (hasSocials) {
        const sl: { youtube?: string; twitter?: string } = {};
        if (youtube.trim()) sl.youtube = youtube.trim();
        if (twitter.trim()) sl.twitter = twitter.trim();
        input.socialLinks = sl;
      }
      if (licenseType) {
        input.credentials = [{ type: licenseType, verified: false as const }];
      }

      await applyKol(input, { accessToken: token });
      setAppStatus('PENDING');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 409) {
          setError(t('onboardingAlreadyApplied'));
        } else {
          setError(err.message);
        }
      } else {
        setError(t('onboardingSubmitError'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [getAccessToken, displayName, bio, youtube, twitter, licenseType, t]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <LogIn className="h-12 w-12 text-white/30" />
        <h2 className="text-xl font-bold text-white">{t('loginRequired')}</h2>
        <p className="max-w-md text-sm text-white/50">{t('loginRequiredDesc')}</p>
        <button
          onClick={goLogin}
          className="mt-2 rounded-xl bg-[#00FF88] px-6 py-3 font-bold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
        >
          {t('loginButton')}
        </button>
      </div>
    );
  }

  if (appStatus === 'PENDING') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center animate-in fade-in">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border-4 border-yellow-500/30 bg-yellow-500/20 text-yellow-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
        </div>
        <h1 className="mb-4 text-3xl font-bold">{t('onboardingPendingTitle')}</h1>
        <p className="mb-8 leading-relaxed text-white/60">{t('onboardingPendingDesc')}</p>
        <Link
          href="/kol/dashboard"
          className="text-sm text-white/40 transition-colors hover:text-white"
        >
          {t('onboardingBackToDashboard')}
        </Link>
      </div>
    );
  }

  if (appStatus === 'APPROVED') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center animate-in fade-in">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#00FF88]/30 bg-[#00FF88]/20 text-[#00FF88]">
          <BadgeCheck size={40} />
        </div>
        <h1 className="mb-4 text-3xl font-bold">{t('onboardingApprovedTitle')}</h1>
        <p className="mb-8 leading-relaxed text-white/60">{t('onboardingApprovedDesc')}</p>
        <Link
          href="/kol/dashboard"
          className="rounded-xl bg-[#00FF88] px-8 py-4 font-bold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
        >
          {t('onboardingGoToDashboard')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-in fade-in">
      <div>
        <h1 className="mb-2 text-3xl font-bold">{t('onboardingTitle')}</h1>
        <p className="text-white/50">{t('onboardingSubtitle')}</p>
      </div>

      {/* Progress Steps */}
      <div className="relative mb-8 flex items-center justify-between">
        <div className="absolute left-0 top-1/2 -z-10 h-1 w-full -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="absolute left-0 top-1/2 -z-10 h-1 -translate-y-1/2 rounded-full bg-[#00FF88] transition-all duration-500"
          style={{ width: `${((step - 1) / 3) * 100}%` }}
        />
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`flex h-10 w-10 items-center justify-center rounded-full border-4 border-[#0a0b0d] text-sm font-bold transition-colors ${
              s <= step ? 'bg-[#00FF88] text-black' : 'bg-[#121418] text-white/40'
            }`}
          >
            {s < step ? <CheckCircle size={16} /> : s}
          </div>
        ))}
      </div>

      {/* Step 1: Identity */}
      {step === 1 && (
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 animate-in fade-in slide-in-from-right-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/20 p-2 text-blue-400">
              <ShieldCheck size={24} />
            </div>
            <h2 className="text-2xl font-bold">{t('onboardingStep1Title')}</h2>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/5 bg-black/30 p-6 text-center">
            <div className="mb-2 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#1e4a2d]/30">
              <span className="text-lg font-bold text-[#00FF88]">iAM Smart</span>
            </div>
            <h3 className="text-lg font-bold">{t('onboardingIamSmartTitle')}</h3>
            <p className="mx-auto max-w-sm text-sm text-white/50">{t('onboardingIamSmartDesc')}</p>
            <button className="mt-4 rounded-xl bg-[#1e4a2d] px-8 py-3 font-bold text-white transition-colors hover:bg-[#2a683f]">
              {t('onboardingIamSmartButton')}
            </button>
            <div className="mt-4 flex items-center justify-center gap-1 text-xs text-white/40">
              <Info size={12} />
              {t('onboardingIamSmartFallback')}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="rounded-xl bg-white px-8 py-3 font-bold text-black transition-colors hover:bg-white/90"
            >
              {t('onboardingNext')} &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Profile */}
      {step === 2 && (
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 animate-in fade-in slide-in-from-right-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/20 p-2 text-purple-400">
              <User size={24} />
            </div>
            <h2 className="text-2xl font-bold">{t('onboardingStep2Title')}</h2>
          </div>

          <div className="space-y-6">
            <div className="flex gap-6">
              <div className="flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10">
                <Upload size={20} className="mb-1 text-white/40" />
                <span className="text-[10px] text-white/40">{t('onboardingUploadAvatar')}</span>
              </div>
              <div className="flex-1">
                <label className="mb-2 block text-sm font-bold text-white/70">
                  {t('onboardingDisplayName')}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white transition-colors focus:border-purple-400 focus:outline-none"
                  placeholder={t('onboardingDisplayNamePlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-white/70">
                {t('onboardingBio')}
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="min-h-[120px] w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white transition-colors focus:border-purple-400 focus:outline-none"
                placeholder={t('onboardingBioPlaceholder')}
                maxLength={500}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-white/70">X / Twitter</label>
                <input
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white transition-colors focus:border-purple-400 focus:outline-none"
                  placeholder="https://x.com/..."
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-white/70">YouTube</label>
                <input
                  type="text"
                  value={youtube}
                  onChange={(e) => setYoutube(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white transition-colors focus:border-purple-400 focus:outline-none"
                  placeholder="https://youtube.com/..."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between border-t border-white/10 pt-6">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 font-bold text-white/50 transition-colors hover:text-white"
            >
              &larr; {t('onboardingBack')}
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!displayName.trim()}
              className="rounded-xl bg-white px-8 py-3 font-bold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('onboardingNext')} &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 3: License */}
      {step === 3 && (
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 animate-in fade-in slide-in-from-right-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/20 p-2 text-orange-400">
                <FileText size={24} />
              </div>
              <h2 className="text-2xl font-bold">{t('onboardingStep3Title')}</h2>
            </div>
            <span className="rounded bg-white/10 px-2 py-1 text-xs text-white/50">
              {t('onboardingStep3Badge')}
            </span>
          </div>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-bold text-white/70">
                {t('onboardingLicenseType')}
              </label>
              <select
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white transition-colors focus:border-orange-400 focus:outline-none"
              >
                <option value="">{t('onboardingLicenseSelect')}</option>
                <option value="SFC Type 9">{t('onboardingLicenseSfc9')}</option>
                <option value="SFC Type 4">{t('onboardingLicenseSfc4')}</option>
                <option value="CFA">{t('onboardingLicenseCfa')}</option>
                <option value="CFP">{t('onboardingLicenseCfp')}</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-white/70">
                {t('onboardingLicenseUpload')}
              </label>
              <div className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 text-white/40 transition-colors hover:border-white/40 hover:bg-white/5">
                <Upload size={32} className="mb-2" />
                <span className="text-sm font-bold">{t('onboardingLicenseUploadCta')}</span>
                <span className="mt-1 text-xs">{t('onboardingLicenseUploadHint')}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between border-t border-white/10 pt-6">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-3 font-bold text-white/50 transition-colors hover:text-white"
            >
              &larr; {t('onboardingBack')}
            </button>
            <button
              onClick={() => setStep(4)}
              className="rounded-xl bg-white px-8 py-3 font-bold text-black transition-colors hover:bg-white/90"
            >
              {t('onboardingPreview')} &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 animate-in fade-in slide-in-from-right-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#00FF88]/20 p-2 text-[#00FF88]">
              <CheckCircle size={24} />
            </div>
            <h2 className="text-2xl font-bold">{t('onboardingStep4Title')}</h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
            <h3 className="mb-4 text-lg font-bold text-[#00FF88]">{t('onboardingSummaryTitle')}</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-white/50">{t('onboardingSummaryIdentity')}</span>
                <span className="font-bold text-white">{t('onboardingSummaryReady')}</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-white/50">{t('onboardingDisplayName')}</span>
                <span className="font-bold text-white">{displayName || '—'}</span>
              </li>
              <li className="flex justify-between pb-2">
                <span className="text-white/50">{t('onboardingSummaryLicense')}</span>
                <span className="font-bold text-white">
                  {licenseType || t('onboardingSummaryNone')}
                </span>
              </li>
            </ul>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-white/5 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              id="terms"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <label htmlFor="terms" className="leading-relaxed text-white/60">
              {t('onboardingTerms')}
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-between border-t border-white/10 pt-6">
            <button
              onClick={() => setStep(3)}
              className="px-6 py-3 font-bold text-white/50 transition-colors hover:text-white"
            >
              &larr; {t('onboardingBackEdit')}
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!agreed || !displayName.trim() || submitting}
              className="flex items-center gap-2 rounded-xl bg-[#00FF88] px-8 py-3 font-bold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 size={18} className="animate-spin" />}
              {t('onboardingSubmit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
