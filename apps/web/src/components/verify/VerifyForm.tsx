'use client';

import { usePrivy } from '@privy-io/react-auth';
import { CheckCircle2, Fingerprint, Hash, Lock, Shield, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { keccak256, encodePacked } from 'viem';

import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import { apiPost, fetchMyProfile } from '../../lib/api/client';

import type { UserProfile } from '../../lib/api/client';

type VerifyFormProps = {
  brokers: { slug: string; displayName: string }[];
};

export const VerifyForm = ({ brokers }: VerifyFormProps) => {
  const t = useTranslations('verify');
  const { authenticated, login } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [brokerSlug, setBrokerSlug] = useState('');
  const [evidenceCid, setEvidenceCid] = useState('');
  const [commitment, setCommitment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const load = async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      try {
        const res = await fetchMyProfile({ accessToken: token });
        if (!cancelled) setProfile(res.user);
      } catch {
        /* swallow — user may not have profile yet */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  const computeCommitment = useCallback(() => {
    if (!brokerSlug || !evidenceCid || !profile?.walletAddressFull) return;

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const saltHex: `0x${string}` = `0x${Array.from(salt)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;

    const hash = keccak256(
      encodePacked(
        ['address', 'string', 'string', 'bytes32'],
        [profile.walletAddressFull as `0x${string}`, brokerSlug, evidenceCid, saltHex],
      ),
    );
    setCommitment(hash);
  }, [brokerSlug, evidenceCid, profile?.walletAddressFull]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await apiPost(
        '/v1/auth/verify-broker',
        { brokerSlug, commitment, evidenceIpfsCid: evidenceCid },
        { accessToken: token },
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border/60 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('loginRequired')}</p>
        <button
          onClick={() => void login()}
          className="h-10 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('login')}
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-success/30 bg-success/5 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="size-6 text-success" />
        </div>
        <h3 className="text-lg font-semibold">{t('successTitle')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('successMessage')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{t('formTitle')}</h2>

      {/* Broker select */}
      <div className="flex flex-col gap-2">
        <label htmlFor="broker-slug" className="text-sm font-medium">
          {t('brokerSlug')}
        </label>
        <select
          id="broker-slug"
          value={brokerSlug}
          onChange={(e) => setBrokerSlug(e.target.value)}
          required
          className="h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-all duration-150 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:shadow-[0_0_12px_-4px_hsl(var(--ring)/0.25)]"
        >
          <option value="">{t('brokerSlugPlaceholder')}</option>
          {brokers.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Evidence CID */}
      <div className="flex flex-col gap-2">
        <label htmlFor="evidence-cid" className="text-sm font-medium">
          {t('evidenceLabel')}
        </label>
        <input
          id="evidence-cid"
          type="text"
          value={evidenceCid}
          onChange={(e) => setEvidenceCid(e.target.value)}
          placeholder={t('evidencePlaceholder')}
          required
          className="h-11 rounded-lg border border-border bg-card px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:shadow-[0_0_12px_-4px_hsl(var(--ring)/0.25)]"
        />
        <p className="text-xs text-muted-foreground">{t('evidenceHint')}</p>
      </div>

      {/* Commitment hash */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">{t('commitmentLabel')}</label>
        {commitment ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 font-mono text-xs text-primary shadow-[0_0_8px_-2px_hsl(var(--ring)/0.2)]">
            <Hash className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{commitment}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={computeCommitment}
            disabled={!brokerSlug || !evidenceCid || !profile?.walletAddressFull}
            className="h-11 rounded-lg border border-dashed border-border bg-muted/30 px-4 text-sm text-muted-foreground transition-all duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <Lock className="size-4" aria-hidden />
              {t('computeCommitment')}
            </span>
          </button>
        )}
        <p className="text-xs text-muted-foreground">{t('commitmentHint')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t('errorTitle')}: {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !commitment || !brokerSlug || !evidenceCid}
        className="h-12 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
      >
        {submitting ? t('submitting') : t('submit')}
      </button>
    </form>
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
    <div className="flex flex-col gap-6">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {t('steps.title')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {steps.map((step, i) => (
          <div
            key={i}
            className="relative flex gap-4 rounded-lg border border-border/60 bg-card p-4 transition-all duration-150 hover:border-primary/20 hover:shadow-[0_0_10px_-4px_hsl(var(--ring)/0.12)]"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <step.icon className="size-4" aria-hidden />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{step.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{step.desc}</span>
            </div>
            <span className="absolute right-3 top-3 font-mono text-[10px] text-muted-foreground/40">
              {String(i + 1).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
