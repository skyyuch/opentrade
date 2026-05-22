'use client';

import { CheckCircle2, FileText, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import { apiPost } from '../../lib/api/client';

type ClaimFormProps = {
  brokerSlug: string;
  isClaimed: boolean;
};

export const ClaimForm = ({ brokerSlug, isClaimed }: ClaimFormProps) => {
  const t = useTranslations('brokerManage');
  const { getAccessToken } = useOpenTradeAuth();

  const [ceRef, setCeRef] = useState('');
  const [letterCid, setLetterCid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isClaimed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
        <ShieldAlert className="size-4 text-accent" aria-hidden />
        <span className="text-sm text-accent">{t('alreadyClaimed')}</span>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="size-5 text-success" />
        </div>
        <h3 className="text-sm font-semibold">{t('claimSuccess')}</h3>
        <p className="max-w-sm text-xs text-muted-foreground">{t('claimSuccessMessage')}</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await apiPost(
        `/v1/brokers/${brokerSlug}/claim`,
        { ceRefNumber: ceRef, companyLetterIpfsCid: letterCid },
        { accessToken: token },
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border/60 bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
          <FileText className="size-4 text-primary" aria-hidden />
        </div>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{t('claimTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('claimSubtitle')}</p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {/* CE Ref */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ce-ref" className="text-xs font-medium">
            {t('ceRefNumber')}
          </label>
          <input
            id="ce-ref"
            type="text"
            value={ceRef}
            onChange={(e) => setCeRef(e.target.value)}
            placeholder={t('ceRefPlaceholder')}
            required
            className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:shadow-[0_0_10px_-4px_hsl(var(--ring)/0.2)]"
          />
        </div>

        {/* Company letter CID */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="letter-cid" className="text-xs font-medium">
            {t('companyLetterCid')}
          </label>
          <input
            id="letter-cid"
            type="text"
            value={letterCid}
            onChange={(e) => setLetterCid(e.target.value)}
            placeholder={t('companyLetterPlaceholder')}
            required
            className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:shadow-[0_0_10px_-4px_hsl(var(--ring)/0.2)]"
          />
          <p className="text-[11px] text-muted-foreground">{t('companyLetterHint')}</p>
        </div>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
            {t('claimError')}: {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !ceRef || !letterCid}
          className="h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
        >
          {submitting ? t('submittingClaim') : t('submitClaim')}
        </button>
      </form>
    </section>
  );
};
