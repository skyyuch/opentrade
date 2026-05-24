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
import { Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

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
  const { authenticated, login } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();
  // Per ADR-0027 D2: send the author's current next-intl locale as the
  // canonical sourceLocale; the server falls back to Accept-Language
  // only when this is missing.
  const currentLocale = useLocale();

  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (rating === 0 || !title.trim() || body.trim().length < 10) return;

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
          { brokerId, title: title.trim(), body: body.trim(), rating, sourceLocale },
          { accessToken },
        );

        setState({ kind: 'success' });
        setRating(0);
        setTitle('');
        setBody('');
      } catch (err) {
        const message =
          err instanceof ApiClientError ? err.message : 'An unexpected error occurred';
        setState({ kind: 'error', message });
      }
    },
    [brokerId, rating, title, body, getAccessToken, t, currentLocale],
  );

  if (!authenticated) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">{t('loginRequired')}</p>
        <button
          type="button"
          onClick={() => void login()}
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
        <legend className="text-sm font-medium">{t('ratingLabel')}</legend>
        <div className="flex gap-1" role="radiogroup" aria-label={t('ratingLabel')}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={t('stars', { count: value })}
              onMouseEnter={() => setHoverRating(value)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(value)}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                className={`size-6 ${
                  value <= (hoverRating || rating)
                    ? 'fill-warning text-warning'
                    : 'text-muted-foreground/30'
                }`}
              />
            </button>
          ))}
        </div>
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
        disabled={state.kind === 'submitting' || rating === 0}
        className="self-start rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.kind === 'submitting' ? t('submitting') : t('submit')}
      </button>
    </form>
  );
};
