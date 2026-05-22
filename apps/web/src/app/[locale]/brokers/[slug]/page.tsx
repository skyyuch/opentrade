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
          <div className="flex flex-col divide-y divide-border">
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
  <article className="flex flex-col gap-2 py-5 first:pt-0 last:pb-0">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`size-4 ${i < review.rating ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`}
              aria-hidden
            />
          ))}
        </div>
        <StatusBadge status={review.status} t={t} />
      </div>
      <time className="text-xs text-muted-foreground" dateTime={review.createdAt}>
        {new Date(review.createdAt).toLocaleDateString()}
      </time>
    </div>
    <h3 className="font-semibold">{review.title}</h3>
    <p className="text-sm leading-relaxed text-muted-foreground">{review.body}</p>
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
