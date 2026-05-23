'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePrivy } from '@privy-io/react-auth';
import {
  CheckCircle,
  Edit3,
  Info,
  Link as LinkIcon,
  MessageSquare,
  Scale,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useOpenTradeAuth } from '@/hooks/useOpenTradeAuth';
import { ApiClientError, submitReview } from '@/lib/api/client';

import type { FormEvent } from 'react';
import type {
  BrokerDetail,
  ReviewItem,
  SfcPerson,
  SfcComplaintsOfficer,
  SfcCondition,
  SfcDisciplinaryAction,
  SfcFormerName,
  SfcLicenceRecord,
} from '@/lib/api/client';

type Tab = 'reviews' | 'license' | 'arbitration';
type LicenseSubTab =
  | 'details'
  | 'address'
  | 'principals'
  | 'reps'
  | 'complaints'
  | 'conditions'
  | 'disciplinary'
  | 'formerNames'
  | 'history';

type Props = {
  broker: BrokerDetail;
  reviews: ReviewItem[];
  locale: string;
};

export function BrokerDetailTabs({ broker, reviews, locale }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('reviews');

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="w-full lg:w-2/3 space-y-8">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} broker={broker} />

        {activeTab === 'reviews' && (
          <ReviewsTab broker={broker} reviews={reviews} locale={locale} />
        )}
        {activeTab === 'license' && <LicenseTab broker={broker} />}
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
  const tabs: { key: Tab; label: string; extra?: string }[] = [
    { key: 'reviews', label: `${t('tabReviews')} (${broker.reviewCount})` },
    { key: 'license', label: t('tabLicense') },
    { key: 'arbitration', label: t('tabArbitration'), extra: '0' },
  ];

  return (
    <div className="flex border-b border-white/10">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === tab.key
              ? 'border-[#00FF88] text-[#00FF88]'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          {tab.label}
          {tab.extra !== undefined && (
            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] text-white">
              {tab.extra}
            </span>
          )}
        </button>
      ))}
    </div>
  );
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

  return (
    <>
      <RatingSummary broker={broker} />
      <SubmitReviewCta brokerId={broker.id} brokerName={broker.displayName} />

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-white/5">
        <h3 className="font-bold flex items-center gap-2">
          <MessageSquare size={16} /> {t('latestReviews')}
        </h3>
        <div className="flex gap-2">
          <select className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
            <option>{t('sortLatest')}</option>
            <option>{t('sortHighest')}</option>
            <option>{t('sortLowest')}</option>
          </select>
          <select className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
            <option>{t('filterAll')}</option>
            <option>{t('filterVerified')}</option>
            <option>{t('filterKol')}</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {reviews.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center border border-white/5 rounded-2xl bg-white/5 border-dashed">
            <Star size={40} className="text-white/20 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">{t('noReviews')}</h3>
          </div>
        ) : (
          reviews.map((review) => <ReviewCard key={review.id} review={review} locale={locale} />)
        )}
      </div>
    </>
  );
}

function RatingSummary({ broker }: { broker: BrokerDetail }) {
  const t = useTranslations('brokerDetail');
  const starsFilled = broker.positiveRate != null ? Math.round(broker.positiveRate / 20) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl bg-zinc-900/60 border border-white/10">
      <div className="flex flex-col justify-center items-center md:items-start md:border-r border-white/10 md:pr-6">
        <div className="text-white/50 mb-2 font-medium">{t('positiveRate')}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold text-[#00FF88]">{broker.positiveRate ?? 0}%</span>
        </div>
        <div className="flex items-center gap-1 mt-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={18}
              className={
                i <= starsFilled ? 'fill-[#00FF88] text-[#00FF88]' : 'fill-white/10 text-white/10'
              }
            />
          ))}
        </div>
        <div className="text-sm text-white/40 mt-2">
          {t('totalReviews', { count: broker.reviewCount })}
        </div>
        {broker.reviewCount > 0 && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[#00FF88] bg-[#00FF88]/10 px-3 py-1.5 rounded-full">
            <TrendingUp size={14} />
            {t('trendUp')}
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center space-y-2.5">
        {broker.ratingDistribution.map((row) => (
          <div key={row.stars} className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1 w-12 text-white/60">
              <span>{row.stars}</span>
              <Star size={12} className="fill-white/60" />
            </div>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#00FF88]" style={{ width: `${row.percentage}%` }} />
            </div>
            <div className="w-8 text-right text-white/40 text-xs">{row.percentage}%</div>
          </div>
        ))}
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

  const [formState, setFormState] = useState<ReviewFormState>({ kind: 'idle' });
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (rating === 0 || body.trim().length < 10) return;
      setFormState({ kind: 'submitting' });
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setFormState({ kind: 'error', message: tf('loginRequired') });
          return;
        }
        await submitReview(
          { brokerId, title: title.trim() || brokerName, body: body.trim(), rating },
          { accessToken },
        );
        setFormState({ kind: 'success' });
        setRating(0);
        setTitle('');
        setBody('');
      } catch (err) {
        const message = err instanceof ApiClientError ? err.message : 'Unexpected error';
        setFormState({ kind: 'error', message });
      }
    },
    [brokerId, brokerName, rating, title, body, getAccessToken, tf],
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
          <div className="text-sm font-medium text-white/60 mb-2">{tf('ratingLabel')}</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onMouseEnter={() => setHoverRating(value)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(value)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  size={24}
                  className={
                    value <= (hoverRating || rating)
                      ? 'fill-[#00FF88] text-[#00FF88]'
                      : 'fill-white/10 text-white/10'
                  }
                />
              </button>
            ))}
          </div>
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
          disabled={formState.kind === 'submitting' || rating === 0}
          className="px-5 py-2.5 bg-[#00FF88] text-[#050608] font-bold text-sm rounded-full hover:shadow-[0_0_15px_#00FF8840] transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {formState.kind === 'submitting' ? tf('submitting') : t('signAndPublish')}
        </button>
      </div>
    </form>
  );
}

function ReviewCard({ review, locale }: { review: ReviewItem; locale: string }) {
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

  return (
    <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-white/20 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{displayName}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${userTypeStyle}`}>
                {userTypeLabel}
              </span>
            </div>
            <div className="text-xs text-white/40 mt-1">
              {new Date(review.createdAt).toLocaleDateString(locale)}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={14}
              className={
                i <= review.rating ? 'fill-[#00FF88] text-[#00FF88]' : 'fill-white/10 text-white/10'
              }
            />
          ))}
        </div>
      </div>

      {review.title && <h4 className="font-semibold text-sm mb-1">{review.title}</h4>}
      <p className="text-sm text-white/80 leading-relaxed mb-4">{review.body}</p>

      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        {review.txHash ? (
          <a
            href={`https://sepolia.basescan.org/tx/${review.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/30 border border-white/5 w-fit group"
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
  const [subTab, setSubTab] = useState<LicenseSubTab>('details');
  const t = useTranslations('brokerDetail');

  const subTabs: { key: LicenseSubTab; label: string }[] = [
    { key: 'details', label: t('licenseSubTabLicense') },
    { key: 'address', label: t('licenseSubTabAddress') },
    { key: 'principals', label: t('licenseSubTabPrincipals') },
    { key: 'reps', label: t('licenseSubTabReps') },
    { key: 'complaints', label: t('licenseSubTabComplaints') },
    { key: 'conditions', label: t('licenseSubTabConditions') },
    { key: 'disciplinary', label: t('licenseSubTabDisciplinary') },
    { key: 'formerNames', label: t('licenseSubTabFormerNames') },
    { key: 'history', label: t('licenseSubTabHistory') },
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
          {subTab === 'details' && <LicenseDetails broker={broker} />}
          {subTab === 'address' && <AddressesView addresses={detail?.addresses} />}
          {subTab === 'principals' && (
            <PersonTable
              persons={detail?.principals}
              headerLabel={t('licenseSubTabPrincipals')}
              emptyText={t('noData')}
            />
          )}
          {subTab === 'reps' && (
            <PersonTable
              persons={detail?.representatives}
              headerLabel={t('licenseSubTabReps')}
              emptyText={t('noData')}
            />
          )}
          {subTab === 'complaints' && <ComplaintsOfficerView officer={detail?.complaintsOfficer} />}
          {subTab === 'conditions' && (
            <ConditionsView sfo={detail?.conditionsSfo} amlo={detail?.conditionsAmlo} />
          )}
          {subTab === 'disciplinary' && <DisciplinaryView actions={detail?.disciplinaryActions} />}
          {subTab === 'formerNames' && <FormerNamesView names={detail?.formerNames} />}
          {subTab === 'history' && (
            <LicenseRecordsView sfo={detail?.licenseRecordsSfo} amlo={detail?.licenseRecordsAmlo} />
          )}
        </div>
      </div>

      <div className="mt-8 bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
        <Info size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300 leading-relaxed">{t('sfcDataNote')}</p>
      </div>
    </div>
  );
}

function LicenseDetails({ broker }: { broker: BrokerDetail }) {
  const t = useTranslations('brokerDetail');
  return (
    <>
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
    </>
  );
}

function AddressesView({
  addresses,
}: {
  addresses: NonNullable<BrokerDetail['sfcDetailJson']>['addresses'] | undefined;
}) {
  const t = useTranslations('brokerDetail');
  if (!addresses || addresses.length === 0) {
    return <p className="text-white/40 py-4">{t('noData')}</p>;
  }
  return (
    <div className="space-y-4 bg-black/20 rounded-xl border border-white/5 overflow-hidden">
      <div className="font-bold text-white px-4 py-3 bg-white/5">{t('businessAddresses')}</div>
      <div className="px-4 pb-4 space-y-4">
        {addresses.map((addr, i) => (
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

function ComplaintsOfficerView({ officer }: { officer: SfcComplaintsOfficer | undefined }) {
  const t = useTranslations('brokerDetail');
  if (!officer) {
    return <p className="text-white/40 py-4">{t('noData')}</p>;
  }

  return (
    <div className="space-y-4">
      {(officer.entityName || officer.entityNameChi) && (
        <div className="text-center space-y-1">
          <div className="text-white/50">{t('corporation')}</div>
          <div className="font-bold">
            {officer.entityName}
            {officer.entityNameChi && ` ${officer.entityNameChi}`}
            {officer.ceRef && <span className="text-white/40 ml-1">({officer.ceRef})</span>}
          </div>
        </div>
      )}
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
              <td className="p-4 text-white/80 border-r border-white/5">{officer.tel ?? '-'}</td>
              <td className="p-4 text-white/80 border-r border-white/5">{officer.fax ?? '-'}</td>
              <td className="p-4 border-r border-white/5">
                {officer.email ? (
                  <a href={`mailto:${officer.email}`} className="text-[#00FF88] hover:underline">
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
  );
}

function ConditionsView({
  sfo,
  amlo,
}: {
  sfo: SfcCondition[] | undefined;
  amlo: SfcCondition[] | undefined;
}) {
  const t = useTranslations('brokerDetail');
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
                    <td className="p-4 text-white/80 whitespace-normal">{c.text}</td>
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
                    <td className="p-4 text-white/80 whitespace-normal">{c.text}</td>
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
                    {a.description}
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

function FormerNamesView({ names }: { names: SfcFormerName[] | undefined }) {
  const t = useTranslations('brokerDetail');
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
            {broker.similarBrokers.map((sb) => (
              <Link
                key={sb.id}
                href={`/brokers/${sb.slug}`}
                className="flex gap-3 items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors"
              >
                {sb.logoUrl ? (
                  <img
                    src={sb.logoUrl}
                    alt={sb.displayName}
                    className="w-10 h-10 rounded-lg object-contain bg-white p-1 border border-white/5"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-xs border border-white/5">
                    {sb.displayName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm group-hover:text-[#00FF88] transition-colors truncate">
                    {sb.displayName}
                  </div>
                  <div className="text-[10px] text-white/40 truncate">
                    {sb.licenseTypes.map((l) => l.replace('HK_SFC_TYPE_', 'Type ')).join(', ')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white/60 text-xs">{sb.reviewCount}</div>
                </div>
              </Link>
            ))}
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
