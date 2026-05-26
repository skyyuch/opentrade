'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  AlertTriangle,
  CheckCircle,
  Edit3,
  ExternalLink,
  FileText,
  Info,
  Link as LinkIcon,
  MessageSquare,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { localizedBrokerName } from '@opentrade/shared';
import { SentimentBadge, SentimentPicker, type Sentiment } from '@opentrade/ui';

import { useOpenTradeAuth } from '@/hooks/useOpenTradeAuth';
import { Link } from '@/i18n/navigation';
import {
  ApiClientError,
  deriveComplaintStatus,
  fetchBrokerKols,
  reviewIpfsContentUrl,
  submitReview,
} from '@/lib/api/client';

import type {
  BrokerDetail,
  BrokerKolItem,
  ComplaintItem,
  ComplaintStatus,
  ReviewItem,
  SfcCondition,
  SfcDetailJson,
  SfcDisciplinaryAction,
  SfcLicenceRecord,
  SfcPerson,
} from '@/lib/api/client';
import type { FormEvent } from 'react';

type Tab = 'reviews' | 'complaints' | 'license' | 'kols' | 'arbitration';
type LicenseSubTab =
  | 'overview'
  | 'licensedActivities'
  | 'conditions'
  | 'responsibleOfficers'
  | 'representatives'
  | 'disciplinary'
  | 'complianceHistory'
  | 'relatedEntities'
  | 'documents';

type Props = {
  broker: BrokerDetail;
  reviews: ReviewItem[];
  complaints: ComplaintItem[];
  locale: string;
};

export function BrokerDetailTabs({ broker, reviews, complaints, locale }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('reviews');

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="w-full lg:w-2/3 space-y-8">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} broker={broker} />

        {activeTab === 'reviews' && (
          <ReviewsTab broker={broker} reviews={reviews} locale={locale} />
        )}
        {activeTab === 'complaints' && (
          <ComplaintsTab broker={broker} complaints={complaints} locale={locale} />
        )}
        {activeTab === 'license' && <LicenseTab broker={broker} />}
        {activeTab === 'kols' && <RelatedKolsTab brokerSlug={broker.slug} />}
        {activeTab === 'arbitration' && <ArbitrationTab />}
      </div>

      <Sidebar broker={broker} />
    </div>
  );
}

function TabBar({
  activeTab,
  onTabChange,
  broker,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  broker: BrokerDetail;
}) {
  const t = useTranslations('brokerDetail');

  // Per M7.6b: the complaints tab carries a pill that goes red when
  // > 0 verified complaints exist, grey when 0. This is the public
  // credibility signal — rejected complaints intentionally don't
  // colour the pill (per rule 00 «reject != delete»; rejected entries
  // remain visible inside the tab but don't drive the headline).
  const hasVerifiedComplaints = broker.verifiedComplaintCount > 0;

  type TabDescriptor = {
    key: Tab;
    label: string;
    pill?:
      | {
          text: string;
          variant: 'neutral' | 'danger';
          title?: string;
        }
      | undefined;
  };

  const tabs: TabDescriptor[] = [
    { key: 'reviews', label: `${t('tabReviews')} (${broker.reviewCount})` },
    {
      key: 'complaints',
      label: t('tabComplaints'),
      pill: {
        text: String(broker.verifiedComplaintCount),
        variant: hasVerifiedComplaints ? 'danger' : 'neutral',
        title: hasVerifiedComplaints
          ? t('tabComplaintsPillVerifiedTooltip', { count: broker.verifiedComplaintCount })
          : t('tabComplaintsPillEmptyTooltip'),
      },
    },
    { key: 'license', label: t('tabLicense') },
    { key: 'kols', label: t('tabKols') },
    { key: 'arbitration', label: t('tabArbitration'), pill: { text: '0', variant: 'neutral' } },
  ];

  return (
    <div className="flex border-b border-white/10 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === tab.key
              ? 'border-[#00FF88] text-[#00FF88]'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          {tab.label}
          {tab.pill && (
            <span
              title={tab.pill.title}
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tab.pill.variant === 'danger'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : 'bg-white/10 text-white'
              }`}
            >
              {tab.pill.text}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

type ReviewSortOption = 'latest' | 'positive_first' | 'negative_first';
type ReviewFilterOption = 'all' | 'verified' | 'kol';

const SENTIMENT_ORDER: Record<string, number> = { POSITIVE: 3, NEUTRAL: 2, NEGATIVE: 1 };

function sortAndFilterReviews(
  reviews: ReviewItem[],
  sort: ReviewSortOption,
  filter: ReviewFilterOption,
): ReviewItem[] {
  let filtered = reviews;

  if (filter === 'verified') {
    filtered = filtered.filter((r) => r.author && r.author.sbtTier !== 'L1');
  } else if (filter === 'kol') {
    filtered = filtered.filter((r) => r.author?.isKol);
  }

  if (sort === 'latest') return filtered;

  return [...filtered].sort((a, b) => {
    const aVal = SENTIMENT_ORDER[a.sentiment ?? ''] ?? 0;
    const bVal = SENTIMENT_ORDER[b.sentiment ?? ''] ?? 0;
    if (sort === 'positive_first') return bVal - aVal;
    return aVal - bVal;
  });
}

function ReviewsTab({
  broker,
  reviews,
  locale,
}: {
  broker: BrokerDetail;
  reviews: ReviewItem[];
  locale: string;
}) {
  const t = useTranslations('brokerDetail');
  const [sortOption, setSortOption] = useState<ReviewSortOption>('latest');
  const [authorFilter, setAuthorFilter] = useState<ReviewFilterOption>('all');

  const displayedReviews = useMemo(
    () => sortAndFilterReviews(reviews, sortOption, authorFilter),
    [reviews, sortOption, authorFilter],
  );

  return (
    <>
      <SentimentDistribution broker={broker} />
      <SubmitReviewCta brokerId={broker.id} brokerName={localizedBrokerName(broker, locale)} />

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-white/5">
        <h3 className="font-bold flex items-center gap-2">
          <MessageSquare size={16} /> {t('latestReviews')}
        </h3>
        <div className="flex gap-2">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as ReviewSortOption)}
            className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="latest">{t('sortLatest')}</option>
            <option value="positive_first">{t('sortHighest')}</option>
            <option value="negative_first">{t('sortLowest')}</option>
          </select>
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value as ReviewFilterOption)}
            className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="all">{t('filterAll')}</option>
            <option value="verified">{t('filterVerified')}</option>
            <option value="kol">{t('filterKol')}</option>
          </select>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-white/40 px-1">
        <Info size={12} className="mt-0.5 flex-shrink-0" />
        <span>{t('reviewDisclaimer')}</span>
      </div>

      <div className="space-y-4">
        {displayedReviews.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center border border-white/5 rounded-2xl bg-white/5 border-dashed">
            <Star size={40} className="text-white/20 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">{t('noReviews')}</h3>
          </div>
        ) : (
          displayedReviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              locale={locale}
              currentBrokerSlug={broker.slug}
            />
          ))
        )}
      </div>
    </>
  );
}

/**
 * ComplaintsTab — broker detail third tab per M7.6b / ADR-0029.
 *
 * Renders the full complaint list (OPEN / VERIFIED / REJECTED) with a
 * status badge per row plus the admin reject reason inline when the
 * status is REJECTED. Per rule 00 «reject != delete» rejected
 * complaints stay visible exactly as authored; only the badge text
 * changes to communicate the platform's assessment.
 *
 * The CTA at the top points to `/brokers/{slug}/complaints/new`
 * (M7.5c) — only L2-verified users can submit, but the gate happens
 * on the new-complaint page itself rather than here so the link is
 * always navigable.
 */
function ComplaintsTab({
  broker,
  complaints,
  locale,
}: {
  broker: BrokerDetail;
  complaints: ComplaintItem[];
  locale: string;
}) {
  const t = useTranslations('brokerDetail');
  const tc = useTranslations('complaintCard');

  const verifiedCount = broker.verifiedComplaintCount;
  const totalCount = complaints.length;
  const openCount = complaints.filter((c) => deriveComplaintStatus(c) === 'OPEN').length;
  const rejectedCount = complaints.filter((c) => deriveComplaintStatus(c) === 'REJECTED').length;

  return (
    <>
      <ComplaintsSummaryCard
        verifiedCount={verifiedCount}
        openCount={openCount}
        rejectedCount={rejectedCount}
        totalCount={totalCount}
        brokerSlug={broker.slug}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-white/5">
        <h3 className="font-bold flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-400" />
          {t('complaintsListHeading')}
        </h3>
        <span className="text-xs text-white/40">
          {t('complaintsListCount', { count: totalCount })}
        </span>
      </div>

      <div className="flex items-start gap-2 text-xs text-white/40 px-1">
        <Info size={12} className="mt-0.5 flex-shrink-0" />
        <span>{t('complaintsDisclaimer')}</span>
      </div>

      <div className="space-y-4">
        {complaints.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center border border-white/5 rounded-2xl bg-white/5 border-dashed">
            <ShieldCheck size={40} className="text-white/20 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">{t('noComplaints')}</h3>
            <p className="text-white/40 text-sm max-w-sm">{t('noComplaintsDesc')}</p>
          </div>
        ) : (
          complaints.map((complaint) => (
            <ComplaintCard key={complaint.id} complaint={complaint} locale={locale} t={tc} />
          ))
        )}
      </div>
    </>
  );
}

function ComplaintsSummaryCard({
  verifiedCount,
  openCount,
  rejectedCount,
  totalCount,
  brokerSlug,
}: {
  verifiedCount: number;
  openCount: number;
  rejectedCount: number;
  totalCount: number;
  brokerSlug: string;
}) {
  const t = useTranslations('brokerDetail');
  const hasVerified = verifiedCount > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl bg-zinc-900/60 border border-white/10">
      <div className="flex flex-col justify-center items-center md:items-start md:border-r border-white/10 md:pr-6">
        <div className="text-white/50 mb-2 font-medium">{t('verifiedComplaintsHeadline')}</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-5xl font-bold ${hasVerified ? 'text-red-400' : 'text-[#00FF88]'}`}>
            {verifiedCount}
          </span>
        </div>
        <div className="text-sm text-white/40 mt-3">
          {t('totalComplaintsCaption', { count: totalCount })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {openCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-400/10 px-3 py-1.5 rounded-full font-bold">
              <AlertTriangle size={14} />
              {t('openComplaintsBadge', { count: openCount })}
            </div>
          )}
          {rejectedCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-white/60 bg-white/5 px-3 py-1.5 rounded-full">
              <XCircle size={14} />
              {t('rejectedComplaintsBadge', { count: rejectedCount })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center items-start gap-3">
        <p className="text-sm text-white/60 leading-relaxed">{t('complaintsHowto')}</p>
        <Link
          href={`/brokers/${brokerSlug}/complaints/new`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-400/15 border border-orange-400/30 text-orange-300 text-sm font-bold hover:bg-orange-400/25 transition-colors"
        >
          <ShieldAlert size={14} />
          {t('submitComplaintCta')}
        </Link>
      </div>
    </div>
  );
}

function ComplaintCard({
  complaint,
  locale,
  t,
}: {
  complaint: ComplaintItem;
  locale: string;
  t: ReturnType<typeof useTranslations<'complaintCard'>>;
}) {
  const status = deriveComplaintStatus(complaint);

  // Per ADR-0029 D4: each status maps to a distinct visual treatment so
  // a reader can scan the list and immediately see the verdict mix.
  // - OPEN: orange (under review)
  // - VERIFIED: red (platform-confirmed against the broker)
  // - REJECTED: grey (platform reviewed and did not substantiate, but
  //   the body stays visible per rule 00 «reject != delete»)
  const statusMeta: Record<
    ComplaintStatus,
    { label: string; chipClass: string; Icon: typeof AlertTriangle }
  > = {
    OPEN: {
      label: t('statusOpen'),
      chipClass: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
      Icon: AlertTriangle,
    },
    VERIFIED: {
      label: t('statusVerified'),
      chipClass: 'bg-red-500/15 text-red-300 border-red-500/30',
      Icon: ShieldAlert,
    },
    REJECTED: {
      label: t('statusRejected'),
      chipClass: 'bg-white/10 text-white/60 border-white/15',
      Icon: XCircle,
    },
  };
  const { label: statusLabel, chipClass, Icon: StatusIcon } = statusMeta[status];

  const sourceLocaleLabel: string | null =
    complaint.sourceLocale === 'zh-Hant'
      ? t('sourceLocaleZhHant')
      : complaint.sourceLocale === 'zh-Hans'
        ? t('sourceLocaleZhHans')
        : complaint.sourceLocale === 'en'
          ? t('sourceLocaleEn')
          : null;

  return (
    <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-white/20 transition-colors">
      <div className="flex justify-between items-start mb-4 gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${chipClass}`}
              title={t('statusTooltip', { status: statusLabel })}
            >
              <StatusIcon size={12} />
              {statusLabel}
            </span>
            {sourceLocaleLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/50">
                {sourceLocaleLabel}
              </span>
            )}
          </div>
          <div className="text-xs text-white/40">
            {new Date(complaint.createdAt).toLocaleDateString(locale)}
          </div>
        </div>
      </div>

      {complaint.title && <h4 className="font-semibold text-sm mb-1">{complaint.title}</h4>}
      <p className="text-sm text-white/80 leading-relaxed mb-4 whitespace-pre-wrap">
        {complaint.body}
      </p>

      {status === 'REJECTED' && complaint.adminNote && (
        // Per ADR-0029 D4: the admin reject reason is shipped to the
        // public surface so readers see WHY the platform did not
        // substantiate the complaint. This block is intentionally
        // styled subdued (no red) — the verdict pill above carries the
        // emotional weight; this is the explanation.
        <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-[10px] uppercase tracking-wide font-bold text-white/40 mb-1">
            {t('adminNoteHeading')}
          </div>
          <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">
            {complaint.adminNote}
          </p>
        </div>
      )}

      {complaint.brokerResponse && (
        <div className="mb-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
          <div className="text-[10px] uppercase tracking-wide font-bold text-blue-400 mb-2">
            {t('brokerResponseHeading')}
          </div>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap mb-2">
            {complaint.brokerResponse.body}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-white/30">
            <span>{new Date(complaint.brokerResponse.createdAt).toLocaleDateString(locale)}</span>
            <span className="flex items-center gap-1 font-mono">
              <LinkIcon size={10} />
              {complaint.brokerResponse.contentHash.slice(0, 10)}…
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 flex-wrap">
          {complaint.evidenceIpfsCid && (
            <a
              href={`https://gateway.pinata.cloud/ipfs/${complaint.evidenceIpfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/30 border border-white/5 group"
              title={t('evidenceLinkTooltip')}
            >
              <FileText size={12} className="text-white/40" />
              <span className="text-[10px] font-mono text-white/40 group-hover:text-white transition-colors">
                {t('evidenceLink')}
              </span>
            </a>
          )}
          {complaint.contentHash && (
            <span
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/30 border border-white/5"
              title={t('contentHashTooltip')}
            >
              <LinkIcon size={12} className="text-white/30" />
              <span className="text-[10px] font-mono text-white/30">
                {complaint.contentHash.slice(0, 10)}…{complaint.contentHash.slice(-4)}
              </span>
            </span>
          )}
        </div>
        {status === 'VERIFIED' && complaint.verifiedAt && (
          <div className="text-[10px] text-red-300/70">
            {t('verifiedAtCaption', {
              date: new Date(complaint.verifiedAt).toLocaleDateString(locale),
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SentimentDistribution — broker detail headline widget (per ADR-0028 D7).
 * Replaces the legacy RatingSummary five-star distribution. The headline
 * keeps `positiveRate` because the field is still reliable: at the API
 * layer (M4.4) the rate is computed from rows where the sentiment is
 * known, so it remains a useful "share of positive verdicts" signal even
 * during the deprecation window.
 *
 * The three-bar mini-chart uses `broker.sentimentAggregate` (M4.4) and
 * renders each bar at a width normalised against the maximum count, so a
 * broker with very few neutrals still gets a visible bar segment. Null
 * sentiments are already excluded server-side (per ADR-0028 D7) so the
 * totals here are definitive verdicts only.
 */
function SentimentDistribution({ broker }: { broker: BrokerDetail }) {
  const t = useTranslations('brokerDetail');
  const agg = broker.sentimentAggregate;
  const totalKnown = agg.positive + agg.neutral + agg.negative;
  const maxCount = Math.max(agg.positive, agg.neutral, agg.negative, 1);

  const rows: {
    key: 'positive' | 'neutral' | 'negative';
    label: string;
    count: number;
    barClass: string;
    chipClass: string;
  }[] = [
    {
      key: 'positive',
      label: t('sentimentPositive'),
      count: agg.positive,
      barClass: 'bg-[#00FF88]',
      chipClass: 'text-[#00FF88]',
    },
    {
      key: 'neutral',
      label: t('sentimentNeutral'),
      count: agg.neutral,
      barClass: 'bg-white/40',
      chipClass: 'text-white/70',
    },
    {
      key: 'negative',
      label: t('sentimentNegative'),
      count: agg.negative,
      barClass: 'bg-red-400',
      chipClass: 'text-red-300',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl bg-zinc-900/60 border border-white/10">
      <div className="flex flex-col justify-center items-center md:items-start md:border-r border-white/10 md:pr-6">
        <div className="text-white/50 mb-2 font-medium">{t('positiveRate')}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold text-[#00FF88]">{broker.positiveRate ?? 0}%</span>
        </div>
        <div className="text-sm text-white/40 mt-3">
          {t('totalReviews', { count: broker.reviewCount })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {broker.reviewCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#00FF88] bg-[#00FF88]/10 px-3 py-1.5 rounded-full">
              <TrendingUp size={14} />
              {t('trendUp')}
            </div>
          )}
          {broker.verifiedUserCount > 0 && (
            <div
              className="flex items-center gap-2 text-xs text-[#00FF88] bg-[#00FF88]/10 px-3 py-1.5 rounded-full font-bold"
              title={t('verifiedUsersTooltip', { count: broker.verifiedUserCount })}
            >
              <Users size={14} />
              {t('verifiedUsers', { count: broker.verifiedUserCount })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center gap-3" aria-label={t('sentimentDistribution')}>
        {totalKnown === 0 ? (
          <div className="text-sm text-white/40">{t('sentimentDistributionEmpty')}</div>
        ) : (
          rows.map((row) => {
            const pct = Math.round((row.count / maxCount) * 100);
            const sharePct = Math.round((row.count / totalKnown) * 100);
            return (
              <div key={row.key} className="flex items-center gap-3 text-sm">
                <div className={`w-20 font-bold text-xs uppercase tracking-wide ${row.chipClass}`}>
                  {row.label}
                </div>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full ${row.barClass}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-10 text-right text-white/40 text-xs tabular-nums">
                  {sharePct}%
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

type ReviewFormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

function SubmitReviewCta({ brokerId, brokerName }: { brokerId: string; brokerName: string }) {
  const t = useTranslations('brokerDetail');
  const tf = useTranslations('reviewForm');
  const { authenticated, login } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();
  // Per ADR-0027 D2: the author's current locale is the trustworthy
  // signal for sourceLocale. next-intl exposes it directly because the
  // user reached this component through the `[locale]` route segment.
  const currentLocale = useLocale();

  const [formState, setFormState] = useState<ReviewFormState>({ kind: 'idle' });
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');

  // Per ADR-0028 D7: labels resolved here via next-intl, then handed to the
  // packages/ui primitive so the design system stays framework-agnostic.
  const sentimentLabels = useMemo(
    () => ({
      positive: tf('sentimentPositive'),
      neutral: tf('sentimentNeutral'),
      negative: tf('sentimentNegative'),
    }),
    [tf],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (sentiment === null || body.trim().length < 10) return;
      setFormState({ kind: 'submitting' });
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setFormState({ kind: 'error', message: tf('loginRequired') });
          return;
        }
        const sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en' =
          currentLocale === 'zh-Hans' || currentLocale === 'en' ? currentLocale : 'zh-Hant';
        await submitReview(
          {
            brokerId,
            title: title.trim() || brokerName,
            body: body.trim(),
            sentiment,
            sourceLocale,
          },
          { accessToken },
        );
        setFormState({ kind: 'success' });
        setSentiment(null);
        setTitle('');
        setBody('');
      } catch (err) {
        const message = err instanceof ApiClientError ? err.message : 'Unexpected error';
        setFormState({ kind: 'error', message });
      }
    },
    [brokerId, brokerName, sentiment, title, body, getAccessToken, tf, currentLocale],
  );

  if (!authenticated) {
    return (
      <div className="flex items-center justify-between p-4 px-6 bg-gradient-to-r from-[#00FF88]/10 to-transparent border border-[#00FF88]/20 rounded-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#00FF88]/20 flex items-center justify-center text-[#00FF88]">
            <Edit3 size={18} />
          </div>
          <div>
            <div className="font-bold text-sm text-[#00FF88]">{t('writeCta')}</div>
            <div className="text-xs text-white/50">{t('writeCtaDesc')}</div>
          </div>
        </div>
        <button
          onClick={() => void login()}
          className="px-5 py-2.5 bg-[#00FF88] text-[#050608] font-bold text-sm rounded-full hover:shadow-[0_0_15px_#00FF8840] transition-all whitespace-nowrap"
        >
          {t('loginAndReview')}
        </button>
      </div>
    );
  }

  if (formState.kind === 'success') {
    return (
      <div className="p-6 rounded-xl bg-[#00FF88]/5 border border-[#00FF88]/20">
        <h3 className="font-bold text-[#00FF88]">{tf('successTitle')}</h3>
        <p className="mt-1 text-sm text-white/50">{tf('successMessage')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl bg-zinc-900/60 border border-white/10 p-6 space-y-5"
    >
      <div className="flex items-center gap-3">
        <Edit3 size={18} className="text-[#00FF88]" />
        <div className="font-bold text-sm text-[#00FF88]">{t('writeCta')}</div>
      </div>

      <div className="space-y-4">
        {formState.kind === 'error' && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-400">
            {tf('errorTitle')}: {formState.message}
          </div>
        )}

        <div>
          <div className="text-sm font-medium text-white/60 mb-2">{tf('sentimentLabel')}</div>
          <SentimentPicker
            value={sentiment}
            onChange={setSentiment}
            labels={sentimentLabels}
            groupLabel={tf('sentimentLabel')}
            disabled={formState.kind === 'submitting'}
          />
        </div>

        <div>
          <div className="text-sm font-medium text-white/60 mb-2">{tf('titleLabel')}</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tf('titlePlaceholder')}
            maxLength={200}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#00FF88]/40 transition-colors"
          />
        </div>

        <div>
          <div className="text-sm font-medium text-white/60 mb-2">{tf('bodyLabel')}</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tf('bodyPlaceholder')}
            required
            minLength={10}
            rows={4}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#00FF88]/40 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <CheckCircle size={14} className="text-[#00FF88]" />
          {t('writeCtaDesc')}
        </div>
        <button
          type="submit"
          disabled={formState.kind === 'submitting' || sentiment === null}
          className="px-5 py-2.5 bg-[#00FF88] text-[#050608] font-bold text-sm rounded-full hover:shadow-[0_0_15px_#00FF8840] transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {formState.kind === 'submitting' ? tf('submitting') : t('signAndPublish')}
        </button>
      </div>
    </form>
  );
}

function ReviewCard({
  review,
  locale,
  currentBrokerSlug,
}: {
  review: ReviewItem;
  locale: string;
  currentBrokerSlug: string;
}) {
  const t = useTranslations('brokerDetail');
  const sbtTier = review.author?.sbtTier ?? 'L1';
  const userTypeLabel =
    sbtTier === 'L3' || sbtTier === 'L4'
      ? t('kolSource')
      : sbtTier === 'L2'
        ? t('verifiedUser')
        : t('generalUser');
  const userTypeStyle =
    sbtTier === 'L2'
      ? 'border-[#00FF88]/30 text-[#00FF88] bg-[#00FF88]/10'
      : sbtTier === 'L3' || sbtTier === 'L4'
        ? 'border-purple-500/30 text-purple-400 bg-purple-500/10'
        : 'border-white/20 text-white/50 bg-white/5';

  const displayName =
    review.author?.displayName ??
    (review.contentHash
      ? `${review.contentHash.slice(0, 6)}...${review.contentHash.slice(-4)}`
      : t('anonymous'));

  // Per ADR-0025 + cursor rule 51: a verified review card surfaces the
  // author's broker coverage as a credibility signal, with each badge
  // rendered in the reader's locale. The API ships
  // `{ brokerSlug, displayName, legalName }[]` so we drop straight into
  // `localizedBrokerName()` instead of rendering the routing slug.
  const verifiedBrokers = review.author?.verifiedBrokers ?? [];
  const isAuthorVerifiedHere = verifiedBrokers.some((b) => b.brokerSlug === currentBrokerSlug);
  const otherVerifiedBrokers = verifiedBrokers.filter((b) => b.brokerSlug !== currentBrokerSlug);
  const VISIBLE_OTHER = 2;
  const visibleOthers = otherVerifiedBrokers.slice(0, VISIBLE_OTHER);
  const hiddenOthersCount = otherVerifiedBrokers.length - visibleOthers.length;

  // Per ADR-0027 D6: show the source language as a small neutral pill.
  // Pre-D8-backfill rows have null sourceLocale; we hide the badge in
  // that case rather than guessing, to avoid mislabelling history.
  const sourceLocaleLabel: string | null =
    review.sourceLocale === 'zh-Hant'
      ? t('sourceLocaleZhHant')
      : review.sourceLocale === 'zh-Hans'
        ? t('sourceLocaleZhHans')
        : review.sourceLocale === 'en'
          ? t('sourceLocaleEn')
          : null;

  // Per ADR-0028 D7: sentiment is the canonical review axis. The card
  // renders a `SentimentBadge` (neon theme, xs size to preserve the 11px
  // chip text the surface already shipped) for rows where sentiment is
  // set, and falls back to a one-line caption derived from the legacy
  // `rating` value for pre-backfill rows (no star widget — D7 explicitly
  // forbids re-rendering stars during the deprecation window).
  const sentimentLabel =
    review.sentiment === 'POSITIVE'
      ? t('sentimentPositive')
      : review.sentiment === 'NEUTRAL'
        ? t('sentimentNeutral')
        : review.sentiment === 'NEGATIVE'
          ? t('sentimentNegative')
          : null;

  return (
    <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-white/20 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-sm">{displayName}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${userTypeStyle}`}>
                {userTypeLabel}
              </span>
              {isAuthorVerifiedHere && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#00FF88]/40 bg-[#00FF88]/15 text-[#00FF88] font-bold"
                  title={t('verifiedAtThisBroker')}
                >
                  ✓ {t('verifiedAtThisBrokerShort')}
                </span>
              )}
              {visibleOthers.map((b) => {
                const name = localizedBrokerName(
                  {
                    slug: b.brokerSlug,
                    displayName: b.displayName,
                    displayNameZhHans: b.displayNameZhHans,
                    legalName: b.legalName,
                  },
                  locale,
                );
                return (
                  <span
                    key={b.brokerSlug}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/60"
                    title={t('verifiedAtBroker', { broker: name })}
                  >
                    ✓ {name}
                  </span>
                );
              })}
              {hiddenOthersCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/50">
                  +{hiddenOthersCount}
                </span>
              )}
              {sourceLocaleLabel && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/50"
                  title={t('sourceLocaleTooltip', { language: sourceLocaleLabel })}
                >
                  {sourceLocaleLabel}
                </span>
              )}
            </div>
            <div className="text-xs text-white/40 mt-1">
              {new Date(review.createdAt).toLocaleDateString(locale)}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {review.sentiment && sentimentLabel ? (
            <SentimentBadge
              sentiment={review.sentiment}
              label={sentimentLabel}
              theme="neon"
              size="xs"
              ariaLabel={t('sentimentBadgeAria', { value: sentimentLabel })}
            />
          ) : (
            // Per ADR-0028 D7: legacy row with no sentiment shows a small
            // caption derived from the deprecated five-star rating, but
            // NEVER renders the star widget itself — the goal is to nudge
            // every reader toward the new axis without losing history.
            <span
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40"
              title={t('legacyRatingCaptionTooltip')}
            >
              {t('legacyRatingCaption', { rating: review.rating })}
            </span>
          )}
        </div>
      </div>

      {review.title && <h4 className="font-semibold text-sm mb-1">{review.title}</h4>}
      <p className="text-sm text-white/80 leading-relaxed mb-4">{review.body}</p>

      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 flex-wrap">
          {review.txHash ? (
            <a
              href={`https://sepolia.basescan.org/tx/${review.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/30 border border-white/5 group"
            >
              <LinkIcon size={12} className="text-white/40" />
              <span className="text-[10px] font-mono text-white/40 group-hover:text-white transition-colors">
                Tx: {review.txHash.slice(0, 10)}…{review.txHash.slice(-4)}
              </span>
              <div className="ml-1 w-2 h-2 rounded-full bg-[#00FF88] animate-pulse" />
            </a>
          ) : (
            <span className="text-[10px] text-white/30">{t('pending')}</span>
          )}
          {review.ipfsCid && (
            <a
              href={reviewIpfsContentUrl(review.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/30 border border-white/5 group"
              title={t('ipfsContentLinkTooltip')}
            >
              <FileText size={12} className="text-white/40" />
              <span className="text-[10px] font-mono text-white/40 group-hover:text-white transition-colors">
                {t('ipfsContentLink')}
              </span>
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 text-white/40">
          <button className="flex items-center gap-1.5 hover:text-[#00FF88] transition-colors">
            <ThumbsUp size={14} />
          </button>
          <button className="flex items-center gap-1.5 hover:text-red-400 transition-colors">
            <ThumbsDown size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function LicenseTab({ broker }: { broker: BrokerDetail }) {
  const [subTab, setSubTab] = useState<LicenseSubTab>('overview');
  const t = useTranslations('brokerDetail');

  const subTabs: { key: LicenseSubTab; label: string }[] = [
    { key: 'overview', label: t('licenseSubTabOverview') },
    { key: 'licensedActivities', label: t('licenseSubTabLicensedActivities') },
    { key: 'conditions', label: t('licenseSubTabConditions') },
    { key: 'responsibleOfficers', label: t('licenseSubTabResponsibleOfficers') },
    { key: 'representatives', label: t('licenseSubTabRepresentatives') },
    { key: 'disciplinary', label: t('licenseSubTabDisciplinary') },
    { key: 'complianceHistory', label: t('licenseSubTabComplianceHistory') },
    { key: 'relatedEntities', label: t('licenseSubTabRelatedEntities') },
    { key: 'documents', label: t('licenseSubTabDocuments') },
  ];

  const detail = broker.sfcDetailJson;

  return (
    <div className="p-6 rounded-2xl bg-zinc-900/20 border border-white/5">
      <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
        <ShieldCheck className="text-[#00FF88]" /> {t('sfcPublicRecord')}
      </h3>

      <div className="space-y-6">
        <div className="flex overflow-x-auto whitespace-nowrap items-center gap-x-2 pb-4 border-b border-white/10 text-sm font-bold no-scrollbar">
          {subTabs.map((tab, idx, arr) => (
            <span key={tab.key} className="flex items-center">
              <button
                onClick={() => setSubTab(tab.key)}
                className={`pb-1 transition-colors ${
                  subTab === tab.key
                    ? 'text-[#00FF88] border-b-2 border-[#00FF88]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
              {idx < arr.length - 1 && <span className="text-white/20 pb-1 px-2">|</span>}
            </span>
          ))}
        </div>

        <div className="space-y-4 text-sm animate-in fade-in duration-300">
          {subTab === 'overview' && <OverviewView broker={broker} />}
          {subTab === 'licensedActivities' && <LicensedActivitiesView broker={broker} />}
          {subTab === 'conditions' && (
            <ConditionsView sfo={detail?.conditionsSfo} amlo={detail?.conditionsAmlo} />
          )}
          {subTab === 'responsibleOfficers' && (
            <PersonTable
              persons={detail?.principals}
              headerLabel={t('licenseSubTabResponsibleOfficers')}
              emptyText={t('noData')}
            />
          )}
          {subTab === 'representatives' && (
            <PersonTable
              persons={detail?.representatives}
              headerLabel={t('licenseSubTabRepresentatives')}
              emptyText={t('noData')}
            />
          )}
          {subTab === 'disciplinary' && <DisciplinaryView actions={detail?.disciplinaryActions} />}
          {subTab === 'complianceHistory' && (
            <LicenseRecordsView sfo={detail?.licenseRecordsSfo} amlo={detail?.licenseRecordsAmlo} />
          )}
          {subTab === 'relatedEntities' && <RelatedEntitiesView detail={detail} />}
          {subTab === 'documents' && <DocumentsView broker={broker} />}
        </div>
      </div>

      <div className="mt-8 bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
        <Info size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300 leading-relaxed">{t('sfcDataNote')}</p>
      </div>
    </div>
  );
}

function OverviewView({ broker }: { broker: BrokerDetail }) {
  const t = useTranslations('brokerDetail');
  const detail = broker.sfcDetailJson;
  const officer = detail?.complaintsOfficer;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 py-3 border-b border-white/5">
        <span className="text-white/40">{t('corpName')}</span>
        <span className="col-span-2 font-bold">
          {broker.legalName} {broker.displayName}
        </span>
      </div>
      <div className="grid grid-cols-3 py-3 border-b border-white/5">
        <span className="text-white/40">{t('ceNumber')}</span>
        <span className="col-span-2 font-mono">{broker.ceNumber ?? t('noData')}</span>
      </div>
      <div className="grid grid-cols-3 py-3 border-b border-white/5">
        <span className="text-white/40">{t('regulatedActivities')}</span>
        <span className="col-span-2">
          {broker.licenses.map((l) => l.licenseType.replace('HK_SFC_TYPE_', 'Type ')).join(', ') ||
            t('noData')}
        </span>
      </div>
      {broker.licenses[0]?.issuedAt && (
        <div className="grid grid-cols-3 py-3 border-b border-white/5">
          <span className="text-white/40">{t('effectiveDate')}</span>
          <span className="col-span-2">
            {new Date(broker.licenses[0].issuedAt).toLocaleDateString()}
          </span>
        </div>
      )}

      {detail?.addresses && detail.addresses.length > 0 && (
        <div className="mt-4 space-y-4 bg-black/20 rounded-xl border border-white/5 overflow-hidden">
          <div className="font-bold text-white px-4 py-3 bg-white/5">{t('businessAddresses')}</div>
          <div className="px-4 pb-4 space-y-3">
            {detail.addresses.map((addr, i) => (
              <div
                key={i}
                className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors"
              >
                <p className="text-white/80">{addr.addressEn}</p>
                {addr.addressZh && addr.addressZh !== addr.addressEn && (
                  <p className="text-white/50 mt-1">{addr.addressZh}</p>
                )}
                {addr.isPrimary && (
                  <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20">
                    {t('primaryAddress')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {officer && (
        <div className="mt-4 space-y-3">
          <div className="font-bold text-white">{t('contactDetails')}</div>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-teal-900/40 text-[#00FF88] border-b border-white/10">
                <tr>
                  <th className="p-4 font-bold border-r border-white/5">{t('telephone')}</th>
                  <th className="p-4 font-bold border-r border-white/5">{t('fax')}</th>
                  <th className="p-4 font-bold border-r border-white/5">{t('email')}</th>
                  <th className="p-4 font-bold">{t('postalAddress')}</th>
                </tr>
              </thead>
              <tbody className="bg-black/20">
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-white/80 border-r border-white/5">
                    {officer.tel ?? '-'}
                  </td>
                  <td className="p-4 text-white/80 border-r border-white/5">
                    {officer.fax ?? '-'}
                  </td>
                  <td className="p-4 border-r border-white/5">
                    {officer.email ? (
                      <a
                        href={`mailto:${officer.email}`}
                        className="text-[#00FF88] hover:underline"
                      >
                        {officer.email}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="p-4 text-white/80">{officer.address ?? '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LicensedActivitiesView({ broker }: { broker: BrokerDetail }) {
  const t = useTranslations('brokerDetail');
  const detail = broker.sfcDetailJson;
  const sfo = detail?.licenseRecordsSfo;

  const raDescriptions: Record<number, { en: string; zh: string }> = {
    1: { en: 'Dealing in Securities', zh: '證券交易' },
    2: { en: 'Dealing in Futures Contracts', zh: '期貨合約交易' },
    3: { en: 'Leveraged Foreign Exchange Trading', zh: '槓桿式外匯交易' },
    4: { en: 'Advising on Securities', zh: '就證券提供意見' },
    5: { en: 'Advising on Futures Contracts', zh: '就期貨合約提供意見' },
    6: { en: 'Advising on Corporate Finance', zh: '就機構融資提供意見' },
    7: { en: 'Providing Automated Trading Services', zh: '提供自動化交易服務' },
    8: { en: 'Securities Margin Financing', zh: '提供證券保證金融資' },
    9: { en: 'Asset Management', zh: '提供資產管理' },
  };

  const locale = useLocale();
  const isZh = locale === 'zh-Hant' || locale === 'zh-Hans';

  const activeActivities = sfo ? [...new Set(sfo.map((r) => r.actType))].sort((a, b) => a - b) : [];

  return (
    <div className="space-y-6">
      <div className="font-bold text-white mb-2">{t('licensedActivitiesHeading')}</div>

      {activeActivities.length === 0 ? (
        <p className="text-white/40 py-4">{t('noData')}</p>
      ) : (
        <div className="grid gap-3">
          {activeActivities.map((ra) => {
            const desc = raDescriptions[ra];
            const records = sfo?.filter((r) => r.actType === ra) ?? [];
            const isActive = records.some((r) => r.periods.some((p) => !p.to));
            return (
              <div
                key={ra}
                className="p-4 rounded-xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#00FF88]/10 text-[#00FF88] font-bold text-xs">
                    {ra}
                  </span>
                  <div className="flex-1">
                    <div className="font-bold text-white text-sm">
                      {isZh ? (desc?.zh ?? `RA${ra}`) : (desc?.en ?? `RA${ra}`)}
                    </div>
                    <div className="text-xs text-white/40">{isZh ? desc?.en : desc?.zh}</div>
                  </div>
                  {isActive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20">
                      {t('licenseActive')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {broker.licenses.length > 0 && (
        <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5">
          <div className="text-xs text-white/40 mb-2">{t('licenseTypeSummary')}</div>
          <div className="flex flex-wrap gap-2">
            {broker.licenses.map((l, i) => (
              <span
                key={i}
                className="text-[10px] uppercase font-bold px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70"
              >
                {l.licenseType.replace('HK_SFC_TYPE_', 'Type ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const RA_LABELS = ['RA1', 'RA2', 'RA3', 'RA4', 'RA5', 'RA6', 'RA7', 'RA8', 'RA9'];

function PersonTable({
  persons,
  headerLabel,
  emptyText,
}: {
  persons: SfcPerson[] | undefined;
  headerLabel: string;
  emptyText: string;
}) {
  const t = useTranslations('brokerDetail');
  if (!persons || persons.length === 0) {
    return <p className="text-white/40 py-4">{emptyText}</p>;
  }
  return (
    <div className="space-y-4">
      <div className="font-bold mb-2">{t('underSfo')}</div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-[#00FF88]/10 text-[#00FF88] border-b border-white/10">
            <tr>
              <th className="p-3 font-bold">
                {headerLabel}
                {t('nameLabel')}
              </th>
              <th className="p-3 font-bold border-r border-[#00FF88]/10">{t('ceNumber')}</th>
              {RA_LABELS.map((ra) => (
                <th key={ra} className="p-3 font-normal text-center">
                  {ra}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-black/20">
            {persons.map((person, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="p-3 text-white/80 underline decoration-[#00FF88]/30 underline-offset-4">
                  {person.nameEn}
                  {person.nameZh && <span className="text-white/40 ml-1">{person.nameZh}</span>}
                </td>
                <td className="p-3 text-white/50 border-r border-white/5 font-mono">
                  {person.ceRef ?? '-'}
                </td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((raNum) => (
                  <td key={raNum} className="p-3 text-center text-white/30">
                    {person.raTypes.includes(raNum) ? 'X' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function useConditionText() {
  const locale = useLocale();
  const isZh = locale === 'zh-Hant' || locale === 'zh-Hans';
  return (c: SfcCondition) => {
    const raw = isZh && c.textZh ? c.textZh : c.text;
    return decodeHtmlEntities(raw);
  };
}

function ConditionsView({
  sfo,
  amlo,
}: {
  sfo: SfcCondition[] | undefined;
  amlo: SfcCondition[] | undefined;
}) {
  const t = useTranslations('brokerDetail');
  const getText = useConditionText();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="font-bold text-white">{t('underSfo')}</div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#00FF88]/10 text-[#00FF88] border-b border-white/10">
              <tr>
                <th className="p-4 font-bold w-1/4 border-r border-[#00FF88]/10">
                  {t('effectiveDate')}
                </th>
                <th className="p-4 font-bold">{t('licenseConditions')}</th>
              </tr>
            </thead>
            <tbody className="bg-black/20">
              {sfo && sfo.length > 0 ? (
                sfo.map((c, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white/50 border-r border-white/5">
                      {c.effectiveDate ?? '-'}
                    </td>
                    <td className="p-4 text-white/80 whitespace-normal">{getText(c)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-white/50 border-r border-white/5">-</td>
                  <td className="p-4 text-white/80">{t('none')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-bold text-white">{t('underAmlo')}</div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#00FF88]/10 text-[#00FF88] border-b border-white/10">
              <tr>
                <th className="p-4 font-bold w-1/4 border-r border-[#00FF88]/10">
                  {t('effectiveDate')}
                </th>
                <th className="p-4 font-bold">{t('licenseConditions')}</th>
              </tr>
            </thead>
            <tbody className="bg-black/20">
              {amlo && amlo.length > 0 ? (
                amlo.map((c, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white/50 border-r border-white/5">
                      {c.effectiveDate ?? '-'}
                    </td>
                    <td className="p-4 text-white/80 whitespace-normal">{getText(c)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-4 text-white/50 border-r border-white/5">-</td>
                  <td className="p-4 text-white/80">{t('noLicenseRecord')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DisciplinaryView({ actions }: { actions: SfcDisciplinaryAction[] | undefined }) {
  const t = useTranslations('brokerDetail');
  const locale = useLocale();
  const isZh = locale === 'zh-Hant' || locale === 'zh-Hans';
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-red-500/10 text-red-400 border-b border-white/10">
            <tr>
              <th className="p-4 font-bold border-r border-red-500/10">{t('actionDate')}</th>
              <th className="p-4 font-bold border-r border-red-500/10">{t('actionTaken')}</th>
              <th className="p-4 font-bold">{t('pressRelease')}</th>
            </tr>
          </thead>
          <tbody className="bg-black/20">
            {actions && actions.length > 0 ? (
              actions.map((a, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-white/80 border-r border-white/5">{a.date ?? '-'}</td>
                  <td className="p-4 text-white/80 border-r border-white/5 whitespace-normal">
                    {decodeHtmlEntities(isZh && a.descriptionZh ? a.descriptionZh : a.description)}
                  </td>
                  <td className="p-4">
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#00FF88] hover:underline"
                      >
                        {t('viewPressRelease')}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="p-4 text-white/60 text-center">
                  {t('none')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-white/40 italic">{t('disciplinaryNote')}</div>
    </div>
  );
}

function RelatedEntitiesView({ detail }: { detail: SfcDetailJson | null | undefined }) {
  const t = useTranslations('brokerDetail');
  const names = detail?.formerNames;
  return (
    <div className="space-y-4">
      <div className="font-bold mb-2">{t('formerNamesRecord')}</div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#00FF88]/10 text-[#00FF88] border-b border-white/10">
            <tr>
              <th className="p-4 font-bold border-r border-[#00FF88]/10">{t('effectiveUntil')}</th>
              <th className="p-4 font-bold border-r border-[#00FF88]/10">{t('englishName')}</th>
              <th className="p-4 font-bold">{t('chineseName')}</th>
            </tr>
          </thead>
          <tbody className="bg-black/20">
            {names && names.length > 0 ? (
              names.map((n, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-white/80 border-r border-white/5">
                    {n.effectiveUntil ?? '-'}
                  </td>
                  <td className="p-4 text-white/80 border-r border-white/5">{n.nameEn ?? '-'}</td>
                  <td className="p-4 text-white/80">{n.nameZh ?? '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="p-4 text-white/60 text-center">
                  {t('noFormerNames')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentsView({ broker }: { broker: BrokerDetail }) {
  const t = useTranslations('brokerDetail');
  const detail = broker.sfcDetailJson;
  const actions =
    detail?.disciplinaryActions?.filter(
      (a): a is SfcDisciplinaryAction & { url: string } => !!a.url,
    ) ?? [];

  return (
    <div className="space-y-6">
      <div className="font-bold text-white mb-2">{t('documentsHeading')}</div>

      <div className="space-y-3">
        <a
          href={`https://apps.sfc.hk/publicregWeb/corp/${broker.ceNumber ?? ''}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 rounded-xl bg-black/20 border border-white/5 hover:border-[#00FF88]/30 transition-colors group"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#00FF88]/10 text-[#00FF88]">
            <ShieldCheck size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm text-white group-hover:text-[#00FF88] transition-colors">
              {t('sfcRegistryLink')}
            </div>
            <div className="text-xs text-white/40">{t('sfcRegistryLinkDesc')}</div>
          </div>
          <ExternalLink
            size={16}
            className="text-white/30 group-hover:text-[#00FF88] transition-colors"
          />
        </a>

        {actions.length > 0 && (
          <>
            <div className="text-xs text-white/50 mt-4 mb-2 font-bold uppercase tracking-wide">
              {t('pressReleases')}
            </div>
            {actions.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 rounded-xl bg-black/20 border border-white/5 hover:border-red-500/30 transition-colors group"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/10 text-red-400">
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white group-hover:text-red-300 transition-colors truncate">
                    {decodeHtmlEntities(a.description)}
                  </div>
                  {a.date && <div className="text-xs text-white/40 mt-0.5">{a.date}</div>}
                </div>
                <ExternalLink
                  size={16}
                  className="text-white/30 shrink-0 group-hover:text-red-300 transition-colors"
                />
              </a>
            ))}
          </>
        )}

        {actions.length === 0 && (
          <div className="p-6 rounded-xl bg-white/5 border border-white/5 border-dashed text-center">
            <FileText size={32} className="text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/40">{t('noDocuments')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatLicRecordDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}年${m}月${day}日`;
  } catch {
    return dateStr;
  }
}

function LicenseRecordsView({
  sfo,
  amlo,
}: {
  sfo: SfcLicenceRecord[] | undefined;
  amlo: SfcLicenceRecord[] | undefined;
}) {
  const t = useTranslations('brokerDetail');
  const lcTypeMap: Record<string, string> = { C: t('licensedCorp'), I: t('licensedIndividual') };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="font-bold text-white mb-2 flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${sfo && sfo.length > 0 ? 'bg-[#00FF88]' : 'bg-white/20'}`}
          />
          {t('underSfo')}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#00FF88]/10 text-[#00FF88] border-b border-white/10">
              <tr>
                <th className="p-4 font-bold border-r border-[#00FF88]/10 w-1/4">
                  {t('licenseCategory')}
                </th>
                <th className="p-4 font-bold border-r border-[#00FF88]/10 w-1/3">
                  {t('regulatedActivities')}
                </th>
                <th className="p-4 font-bold">{t('effectivePeriod')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-black/20">
              {sfo && sfo.length > 0 ? (
                sfo.map((rec, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white/80 border-r border-white/5">
                      {lcTypeMap[rec.lcType] ?? rec.lcType}
                    </td>
                    <td className="p-4 text-white/80 border-r border-white/5">
                      {rec.actDescZh || rec.actDesc}
                    </td>
                    <td className="p-4 text-white/60">
                      {rec.periods.map((p, j) => (
                        <div key={j}>
                          {p.to
                            ? `${formatLicRecordDate(p.from)} - ${formatLicRecordDate(p.to)}`
                            : `由 ${formatLicRecordDate(p.from)}`}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="p-4 text-white/60 text-left">
                    {t('noLicenseRecord')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-bold text-white mb-2 flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${amlo && amlo.length > 0 ? 'bg-[#00FF88]' : 'bg-white/20'}`}
          />
          {t('underAmlo')}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#00FF88]/10 text-[#00FF88] border-b border-white/10">
              <tr>
                <th className="p-4 font-bold border-r border-[#00FF88]/10 w-1/4">
                  {t('licenseCategory')}
                </th>
                <th className="p-4 font-bold border-r border-[#00FF88]/10 w-1/3">
                  {t('vaServices')}
                </th>
                <th className="p-4 font-bold">{t('effectivePeriod')}</th>
              </tr>
            </thead>
            <tbody className="bg-black/20">
              {amlo && amlo.length > 0 ? (
                amlo.map((rec, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white/80 border-r border-white/5">
                      {lcTypeMap[rec.lcType] ?? rec.lcType}
                    </td>
                    <td className="p-4 text-white/80 border-r border-white/5">
                      {rec.actDescZh || rec.actDesc}
                    </td>
                    <td className="p-4 text-white/60">
                      {rec.periods.map((p, j) => (
                        <div key={j}>
                          {p.to
                            ? `${formatLicRecordDate(p.from)} - ${formatLicRecordDate(p.to)}`
                            : `由 ${formatLicRecordDate(p.from)}`}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="p-4 text-white/60 text-left">
                    {t('noLicenseRecord')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RelatedKolsTab({ brokerSlug }: { brokerSlug: string }) {
  const t = useTranslations('brokerDetail');
  const [kols, setKols] = useState<BrokerKolItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBrokerKols(brokerSlug)
      .then((data) => setKols(data.kols))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brokerSlug]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  if (kols.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/5 bg-white/5 py-20 text-center">
        <Users size={40} className="mb-4 text-white/20" />
        <h3 className="mb-2 text-lg font-bold text-white">{t('noRelatedKols')}</h3>
        <p className="max-w-sm text-sm text-white/40">{t('noRelatedKolsDesc')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {kols.map((kol) => (
        <Link
          key={kol.id}
          href={`/kols/${kol.slug}`}
          className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-[#00FF88]/30 hover:bg-white/10"
        >
          {kol.avatarUrl ? (
            <img
              src={kol.avatarUrl}
              alt={kol.displayName}
              className="size-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white/60">
              {kol.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{kol.displayName}</p>
            <p className="text-xs text-white/40">@{kol.slug}</p>
            <div className="mt-1 flex gap-3 text-[10px] text-white/50">
              <span>
                {kol.signalCount} {t('kolSignals')}
              </span>
              <span>
                {kol.followerCount} {t('kolFollowers')}
              </span>
            </div>
          </div>
          {kol.iamSmartVerified && (
            <span className="shrink-0 rounded bg-[#00FF88]/20 px-2 py-1 text-[10px] font-bold text-[#00FF88]">
              智方便
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function ArbitrationTab() {
  const t = useTranslations('brokerDetail');
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center border border-white/5 rounded-2xl bg-white/5 border-dashed">
      <Scale size={40} className="text-white/20 mb-4" />
      <h3 className="text-lg font-bold text-white mb-2">{t('noArbitration')}</h3>
      <p className="text-white/40 text-sm max-w-sm">{t('noArbitrationDesc')}</p>
    </div>
  );
}

function Sidebar({ broker }: { broker: BrokerDetail }) {
  const t = useTranslations('brokerDetail');
  const locale = useLocale();

  return (
    <div className="w-full lg:w-1/3 flex flex-col gap-6">
      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h3 className="font-bold text-sm mb-4">{t('brokerInfo')}</h3>
        {broker.description && (
          <p className="text-sm text-white/60 leading-relaxed mb-6">{broker.description}</p>
        )}
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-white/40">{t('claimStatus')}</span>
            {broker.isClaimed ? (
              <span className="text-[#00FF88]">{t('claimedByOfficial')}</span>
            ) : (
              <span className="text-orange-400">{t('notYetClaimed')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h3 className="font-bold text-sm mb-4">{t('contractAddresses')}</h3>
        <div className="space-y-3">
          <ContractLink
            label={t('reviewContract')}
            address="0x8aB5f61Cd0817BE0B9f09Ec09d28de302aDAf187"
          />
          <ContractLink
            label={t('sbtContract')}
            address="0x31D8e863ce71c90d399Ff69eeACeC84226b3e61b"
          />
        </div>
      </div>

      {broker.similarBrokers.length > 0 && (
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="font-bold text-sm mb-4">{t('similarBrokers')}</h3>
          <div className="space-y-4">
            {broker.similarBrokers.map((sb) => {
              // Per cursor rule 51: localise both the avatar fallback
              // initials and the visible name. Without this, English
              // locale users saw Chinese names and avatars rendered the
              // first 2 chars of Chinese ("匯豐" → "匯豐").
              const sbName = localizedBrokerName(sb, locale);
              return (
                <Link
                  key={sb.id}
                  href={`/brokers/${sb.slug}`}
                  className="flex gap-3 items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors"
                >
                  {sb.logoUrl ? (
                    <img
                      src={sb.logoUrl}
                      alt={sbName}
                      className="w-10 h-10 rounded-lg object-contain bg-white p-1 border border-white/5"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-xs border border-white/5">
                      {sbName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm group-hover:text-[#00FF88] transition-colors truncate">
                      {sbName}
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      {sb.licenseTypes.map((l) => l.replace('HK_SFC_TYPE_', 'Type ')).join(', ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/60 text-xs">{sb.reviewCount}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ContractLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={`https://sepolia.basescan.org/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="p-3 bg-black/40 rounded-lg border border-white/5 hover:border-white/20 transition-colors cursor-pointer group block"
    >
      <div className="text-xs text-white/40 mb-1">{label}</div>
      <div className="font-mono text-xs text-white/80 group-hover:text-[#00FF88] transition-colors truncate">
        {address.slice(0, 6)}…{address.slice(-4)}
      </div>
    </a>
  );
}
