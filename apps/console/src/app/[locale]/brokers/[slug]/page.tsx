/**
 * `/brokers/:slug` — Broker detail view for the merchant console.
 *
 * Server Component that fetches broker details + reviews in parallel.
 * Read-only for now; claim flow + response functionality is Phase 2.
 */

import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Star,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ClaimForm } from '../../../../components/brokers/ClaimForm';
import { ApiClientError, fetchBroker, fetchBrokerReviews } from '../../../../lib/api/client';

import type { BrokerDetail, ReviewItem } from '../../../../lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string; slug: string };
};

const BrokerDetailPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const t = await getTranslations('brokerManage');
  const { broker, reviews } = await fetchData(params.slug);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <Link
        href={`/${params.locale}/brokers`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('backToList')}
      </Link>

      <BrokerHeader broker={broker} />

      <ClaimForm brokerSlug={broker.slug} isClaimed={broker.isClaimed} />

      {broker.licenses.length > 0 ? <LicensesSection broker={broker} t={t} /> : null}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{t('reviews')}</h2>
          <span className="text-sm text-muted-foreground">{broker.reviewCount}</span>
        </div>

        {reviews.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('noReviews')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {reviews.map((review) => (
              <ReviewRow key={review.id} review={review} t={t} />
            ))}
          </div>
        )}
      </section>

      <footer className="text-xs text-muted-foreground">{t('disclaimer')}</footer>
    </div>
  );
};

export default BrokerDetailPage;

// ---------------------------------------------------------------------------

const fetchData = async (
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

type ManageTranslator = Awaited<ReturnType<typeof getTranslations<'brokerManage'>>>;

const BrokerHeader = ({ broker }: { broker: BrokerDetail }): ReactNode => (
  <header className="flex items-start justify-between gap-4">
    <div className="flex items-start gap-3">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <Building2 className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight">{broker.displayName}</h1>
        <p className="text-sm text-muted-foreground">{broker.legalName}</p>
      </div>
    </div>
    {broker.websiteUrl ? (
      <a
        href={broker.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
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
  t: ManageTranslator;
}): ReactNode => (
  <section className="flex flex-col gap-3">
    <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {t('licenses')}
    </h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {broker.licenses.map((lic) => (
        <div
          key={`${lic.regulator}-${lic.licenseNumber}`}
          className="rounded-lg border border-border p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {lic.regulator}
            </span>
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              {lic.status}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium">{lic.licenseType}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('licenseNumber')}: {lic.licenseNumber}
          </p>
        </div>
      ))}
    </div>
  </section>
);

const ReviewRow = ({ review, t }: { review: ReviewItem; t: ManageTranslator }): ReactNode => (
  <div className="flex flex-col gap-1.5 px-4 py-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`size-3.5 ${i < review.rating ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`}
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
    <h3 className="text-sm font-medium">{review.title}</h3>
    <p className="text-xs leading-relaxed text-muted-foreground">{review.body}</p>
  </div>
);

const StatusBadge = ({ status, t }: { status: string; t: ManageTranslator }): ReactNode => {
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
