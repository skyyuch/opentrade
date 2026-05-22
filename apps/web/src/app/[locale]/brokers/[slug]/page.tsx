/**
 * `/brokers/:slug` — Broker detail page with reviews.
 *
 * Server Component that fetches broker details and reviews in parallel.
 * The review submission form is a Client Component island imported below.
 */

import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  Stamp,
  Star,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ReviewForm } from '../../../../components/reviews/ReviewForm';
import { ApiClientError, fetchBroker, fetchBrokerReviews } from '../../../../lib/api/client';

import type { BrokerDetail, ReviewItem } from '../../../../lib/api/client';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string; slug: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const t = await getTranslations({ locale: params.locale, namespace: 'brokerDetail' });
  try {
    const { broker } = await fetchBroker(params.slug, { next: { revalidate: 60 } });
    return {
      title: `${broker.displayName} | OpenTrade`,
      description: `${broker.displayName} — ${t('reviews')}`,
    };
  } catch {
    return { title: 'Broker | OpenTrade' };
  }
};

const BrokerDetailPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const t = await getTranslations('brokerDetail');

  const { broker, reviews } = await fetchBrokerData(params.slug);

  return (
    <main className="container mx-auto flex flex-col gap-8 px-4 py-12 md:py-16">
      <Link
        href={`/${params.locale}/brokers`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('backToBrokers')}
      </Link>

      <BrokerHeader broker={broker} />

      {broker.licenses.length > 0 ? <LicensesSection broker={broker} t={t} /> : null}

      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">{t('reviews')}</h2>
          <span className="text-sm text-muted-foreground">{broker.reviewCount}</span>
        </div>

        <ReviewForm brokerId={broker.id} brokerName={broker.displayName} />

        {reviews.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noReviews')}</p>
        ) : (
          <div className="grid gap-4">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} t={t} />
            ))}
          </div>
        )}
      </section>

      <footer className="text-xs text-muted-foreground">{t('disclaimer')}</footer>
    </main>
  );
};

export default BrokerDetailPage;

const fetchBrokerData = async (
  slug: string,
): Promise<{ broker: BrokerDetail; reviews: ReviewItem[] }> => {
  try {
    const [brokerRes, reviewsRes] = await Promise.all([
      fetchBroker(slug, { next: { revalidate: 60 } }),
      fetchBrokerReviews(slug, { next: { revalidate: 0 } }),
    ]);
    return { broker: brokerRes.broker, reviews: reviewsRes.reviews };
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type DetailTranslator = Awaited<ReturnType<typeof getTranslations<'brokerDetail'>>>;

const BrokerHeader = ({ broker }: { broker: BrokerDetail }): ReactNode => (
  <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex items-start gap-4">
      <div className="flex size-14 items-center justify-center rounded-xl bg-muted">
        <Building2 className="size-7 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{broker.displayName}</h1>
        <p className="text-sm text-muted-foreground">{broker.legalName}</p>
        {broker.isClaimed ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <ShieldCheck className="size-3.5" aria-hidden />
            Claimed
          </span>
        ) : null}
      </div>
    </div>
    {broker.websiteUrl ? (
      <a
        href={broker.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
      >
        <ExternalLink className="size-3.5" aria-hidden />
        Website
      </a>
    ) : null}
  </header>
);

const LicensesSection = ({
  broker,
  t,
}: {
  broker: BrokerDetail;
  t: DetailTranslator;
}): ReactNode => (
  <section className="flex flex-col gap-3">
    <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
      {t('licenses')}
    </h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {broker.licenses.map((lic) => (
        <article
          key={`${lic.regulator}-${lic.licenseNumber}`}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {lic.regulator}
            </span>
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              {lic.status}
            </span>
          </div>
          <p className="mt-1 font-medium">{lic.licenseType}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('licenseNumber')}: {lic.licenseNumber}
          </p>
        </article>
      ))}
    </div>
  </section>
);

const ReviewCard = ({ review, t }: { review: ReviewItem; t: DetailTranslator }): ReactNode => (
  <article className="group relative flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-5 transition-all duration-150 hover:border-primary/20 hover:shadow-[0_0_12px_-4px_hsl(var(--ring)/0.15)]">
    {/* Author row */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
          {review.author?.displayName?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">
              {review.author?.displayName ?? t('anonymous')}
            </span>
            {review.author?.sbtTier && review.author.sbtTier !== 'L1' ? (
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                  review.author.sbtTier === 'L2'
                    ? 'border-primary/30 bg-primary/5 text-primary shadow-[0_0_6px_-2px_hsl(var(--ring)/0.2)]'
                    : review.author.sbtTier === 'L3'
                      ? 'border-accent/40 bg-accent/5 text-accent shadow-[0_0_8px_-2px_hsl(var(--accent)/0.3)]'
                      : 'border-accent/60 bg-accent/10 text-accent shadow-[0_0_10px_-3px_hsl(var(--accent)/0.4)]'
                }`}
                title={`Identity Tier: ${review.author.sbtTier}`}
              >
                <ShieldCheck className="size-3" aria-hidden />
                {review.author.sbtTier}
              </span>
            ) : null}
          </div>
          <time className="text-[11px] text-muted-foreground" dateTime={review.createdAt}>
            {new Date(review.createdAt).toLocaleDateString()}
          </time>
        </div>
      </div>
      <StatusBadge status={review.status} t={t} />
    </div>

    {/* Rating */}
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < review.rating ? 'fill-warning text-warning' : 'text-muted-foreground/20'}`}
          aria-hidden
        />
      ))}
    </div>

    {/* Content */}
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold leading-snug">{review.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{review.body}</p>
    </div>

    {/* On-chain proof footer */}
    {review.txHash ? (
      <div className="mt-1 flex items-center gap-2 border-t border-border/40 pt-3">
        <a
          href={`https://sepolia.basescan.org/tx/${review.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group/link inline-flex items-center gap-1.5 rounded-md border border-chain-border bg-chain-bg px-2 py-1 font-mono text-[10px] font-medium text-chain-ink transition-colors hover:border-primary/40 hover:text-foreground"
          title={`Verify on-chain: ${review.txHash}`}
        >
          <Stamp className="size-3" aria-hidden />
          <span className="tabular-nums">
            {review.txHash.slice(0, 6)}…{review.txHash.slice(-4)}
          </span>
          <ExternalLink
            className="size-2.5 opacity-0 transition-opacity group-hover/link:opacity-100"
            aria-hidden
          />
        </a>
        <span className="text-[10px] text-muted-foreground/60">{t('onChain')}</span>
      </div>
    ) : null}
  </article>
);

const StatusBadge = ({ status, t }: { status: string; t: DetailTranslator }): ReactNode => {
  if (status === 'CONFIRMED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 className="size-3" aria-hidden />
        {t('verified')}
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
        <XCircle className="size-3" aria-hidden />
        {t('failed')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Clock className="size-3" aria-hidden />
      {t('pending')}
    </span>
  );
};
