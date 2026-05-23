'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePrivy } from '@privy-io/react-auth';
import {
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
import { ReviewForm } from '@/components/reviews/ReviewForm';

import type { BrokerDetail, BrokerLicense, ReviewItem } from '@/lib/api/client';

type Tab = 'reviews' | 'license' | 'arbitration';
type LicenseSubTab =
  | 'details'
  | 'address'
  | 'principals'
  | 'reps'
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

function SubmitReviewCta({ brokerId, brokerName }: { brokerId: string; brokerName: string }) {
  const t = useTranslations('brokerDetail');
  const { authenticated, login } = usePrivy();

  if (authenticated) {
    return <ReviewForm brokerId={brokerId} brokerName={brokerName} />;
  }

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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 pb-4 border-b border-white/10 text-sm font-bold">
        {subTabs.map((tab, idx) => (
          <span key={tab.key} className="flex items-center gap-3">
            {idx > 0 && <span className="text-white/20">|</span>}
            <button
              onClick={() => setSubTab(tab.key)}
              className={
                subTab === tab.key
                  ? 'text-[#00FF88] border-b-2 border-[#00FF88] pb-1'
                  : 'text-white/60 hover:text-white pb-1'
              }
            >
              {tab.label}
            </button>
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {subTab === 'details' && <LicenseDetails broker={broker} />}
        {subTab === 'address' && (
          <InfoRow label={t('licenseSubTabAddress')} value={broker.addressEn || broker.addressZh} />
        )}
        {subTab === 'principals' && (
          <PersonList items={detail?.principals} emptyText={t('noData')} />
        )}
        {subTab === 'reps' && (
          <PersonList items={detail?.representatives} emptyText={t('noData')} />
        )}
        {subTab === 'conditions' && (
          <TextList items={detail?.conditions?.map((c) => c.text)} emptyText={t('noData')} />
        )}
        {subTab === 'disciplinary' && (
          <TextList
            items={detail?.disciplinaryActions?.map((d) => d.description)}
            emptyText={t('noData')}
          />
        )}
        {subTab === 'formerNames' && (
          <TextList items={detail?.formerNames?.map((f) => f.name)} emptyText={t('noData')} />
        )}
        {subTab === 'history' && <LicenseHistory licenses={broker.licenses} />}
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
      <InfoRow label={t('ceNumber')} value={broker.ceNumber} mono />
      <InfoRow
        label={t('regulatedActivities')}
        value={broker.licenses
          .map((l) => l.licenseType.replace('HK_SFC_TYPE_', 'Type '))
          .join(', ')}
      />
      {broker.licenses[0]?.issuedAt && (
        <InfoRow
          label={t('effectiveDate')}
          value={new Date(broker.licenses[0].issuedAt).toLocaleDateString()}
        />
      )}
    </>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const t = useTranslations('brokerDetail');
  return (
    <div className="grid grid-cols-3 py-3 border-b border-white/5 text-sm">
      <span className="text-white/40">{label}</span>
      <span className={`col-span-2 ${mono ? 'font-mono' : ''}`}>{value || t('noData')}</span>
    </div>
  );
}

function PersonList({
  items,
  emptyText,
}: {
  items: Array<{ nameEn: string; nameZh?: string; role?: string; raTypes?: string[] }> | undefined;
  emptyText: string;
}) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-white/40 py-4">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((p, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5"
        >
          <div>
            <div className="text-sm font-medium">{p.nameEn}</div>
            {p.nameZh && <div className="text-xs text-white/40">{p.nameZh}</div>}
          </div>
          {p.role && <span className="text-xs text-white/50">{p.role}</span>}
          {p.raTypes && <span className="text-xs text-white/50">{p.raTypes.join(', ')}</span>}
        </div>
      ))}
    </div>
  );
}

function TextList({ items, emptyText }: { items: string[] | undefined; emptyText: string }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-white/40 py-4">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((text, i) => (
        <div key={i} className="p-3 bg-black/20 rounded-lg border border-white/5 text-sm">
          {text}
        </div>
      ))}
    </div>
  );
}

function LicenseHistory({ licenses }: { licenses: BrokerLicense[] }) {
  return (
    <div className="space-y-2">
      {licenses.map((lic, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5"
        >
          <div>
            <div className="text-sm font-medium">
              {lic.licenseType.replace('HK_SFC_TYPE_', 'Type ')}
            </div>
            <div className="text-xs text-white/40">#{lic.licenseNumber}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">
              {new Date(lic.issuedAt).toLocaleDateString()}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded ${
                lic.status === 'ACTIVE'
                  ? 'bg-[#00FF88]/10 text-[#00FF88]'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {lic.status}
            </span>
          </div>
        </div>
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
