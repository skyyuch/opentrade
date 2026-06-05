/**
 * Client-side review submission form.
 *
 * Gated behind Privy auth — unauthenticated visitors see a CTA to log in.
 * On submission exchanges the Privy token for an OpenTrade ES256 JWT
 * (via useOpenTradeAuth) then calls POST /v1/reviews. The API handles
 * IPFS pinning, keccak256 hashing, and outbox event creation; chain
 * anchoring happens asynchronously via the outbox worker.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { BASELINE_MODERATION_TERMS, moderateContent } from '@opentrade/shared';
import { SentimentPicker, type Sentiment } from '@opentrade/ui';

import { useLoginRedirect } from '../../hooks/useLoginRedirect';
import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import { ApiClientError, submitReview } from '../../lib/api/client';

import type { FormEvent, ReactNode } from 'react';

type Props = {
  brokerId: string;
  brokerName: string;
};

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export const ReviewForm = ({ brokerId, brokerName }: Props): ReactNode => {
  const t = useTranslations('reviewForm');
  const { authenticated } = usePrivy();
  const goLogin = useLoginRedirect();
  const { getAccessToken } = useOpenTradeAuth();
  // Per ADR-0027 D2: send the author's current next-intl locale as the
  // canonical sourceLocale; the server falls back to Accept-Language
  // only when this is missing.
  const currentLocale = useLocale();

  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // Per ADR-0028 D7: labels are caller-supplied so packages/ui keeps no
  // next-intl coupling. We memoise so the picker's reference identity stays
  // stable across renders.
  const sentimentLabels = useMemo(
    () => ({
      positive: t('sentimentPositive'),
      neutral: t('sentimentNeutral'),
      negative: t('sentimentNegative'),
    }),
    [t],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (sentiment === null || !title.trim() || body.trim().length < 10) return;

      // ADR-0034: advisory client-side mirror of the server's content-neutral
      // gate. Catches obvious cases instantly so the user can fix them before a
      // round-trip; the API (full DB blocklist) remains the sole authority.
      const verdict = moderateContent(`${title.trim()}\n${body.trim()}`, BASELINE_MODERATION_TERMS);
      if (!verdict.ok) {
        const listFormat = new Intl.ListFormat(currentLocale, {
          style: 'long',
          type: 'conjunction',
        });
        const categories = listFormat.format(
          verdict.categories.map((category) => t(`moderationCategory.${category}`)),
        );
        setState({ kind: 'error', message: t('moderationBlocked', { categories }) });
        return;
      }

      setState({ kind: 'submitting' });

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setState({ kind: 'error', message: t('loginRequired') });
          return;
        }

        const sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en' =
          currentLocale === 'zh-Hans' || currentLocale === 'en' ? currentLocale : 'zh-Hant';

        await submitReview(
          { brokerId, title: title.trim(), body: body.trim(), sentiment, sourceLocale },
          { accessToken },
        );

        setState({ kind: 'success' });
        setSentiment(null);
        setTitle('');
        setBody('');
      } catch (err) {
        const message =
          err instanceof ApiClientError ? err.message : 'An unexpected error occurred';
        setState({ kind: 'error', message });
      }
    },
    [brokerId, sentiment, title, body, getAccessToken, t, currentLocale],
  );

  if (!authenticated) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">{t('loginRequired')}</p>
        <button
          type="button"
          onClick={goLogin}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t('login')}
        </button>
      </div>
    );
  }

  if (state.kind === 'success') {
    return (
      <div className="rounded-lg border border-success/40 bg-success/5 p-6">
        <h3 className="font-semibold text-success">{t('successTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('successMessage')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
    >
      <h3 className="font-semibold">{t('title')}</h3>
      <p className="text-xs text-muted-foreground">{brokerName}</p>

      {state.kind === 'error' ? (
        <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {t('errorTitle')}: {state.message}
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">{t('sentimentLabel')}</legend>
        <SentimentPicker
          value={sentiment}
          onChange={setSentiment}
          labels={sentimentLabels}
          groupLabel={t('sentimentLabel')}
          disabled={state.kind === 'submitting'}
        />
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('titleLabel')}</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          required
          maxLength={200}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('bodyLabel')}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('bodyPlaceholder')}
          required
          minLength={10}
          rows={4}
          className="resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <button
        type="submit"
        disabled={state.kind === 'submitting' || sentiment === null}
        className="self-start rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.kind === 'submitting' ? t('submitting') : t('submit')}
      </button>
    </form>
  );
};
