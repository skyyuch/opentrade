'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Save, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOpenTradeAuth } from '../../../../../hooks/useOpenTradeAuth';
import { fetchBroker, updateBrokerLogo, uploadBrokerLogo } from '../../../../../lib/api/client';

import type { BrokerDetail } from '../../../../../lib/api/client';
import type { ReactNode } from 'react';

type Props = { slug: string };

type LicenseTab =
  | 'details'
  | 'addresses'
  | 'ros'
  | 'reps'
  | 'complaints'
  | 'conditions'
  | 'actions'
  | 'names'
  | 'records';

export function AdminBrokerDetailClient({ slug }: Props): ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('adminBrokerDetail');
  const locale = useLocale();
  const [broker, setBroker] = useState<BrokerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [activeLicenseTab, setActiveLicenseTab] = useState<LicenseTab>('details');
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateScrollIndicators();
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    const ro = new ResizeObserver(updateScrollIndicators);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators);
      ro.disconnect();
    };
  }, [updateScrollIndicators, loading]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
  };

  useEffect(() => {
    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const res = await fetchBroker(slug, { accessToken: token });
        setBroker(res.broker);
        setLogoUrl(res.broker.logoUrl ?? '');
      } catch {
        setBroker(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken, slug]);

  const handleSaveLogo = async () => {
    const token = await getAccessToken();
    if (!token || !broker) return;
    setSaving(true);
    try {
      await updateBrokerLogo(slug, logoUrl, { accessToken: token });
      setBroker({ ...broker, logoUrl: logoUrl || null });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadError('');
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError(t('uploadInvalidType'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t('uploadTooLarge'));
      return;
    }
    const token = await getAccessToken();
    if (!token || !broker) return;
    setUploading(true);
    try {
      const res = await uploadBrokerLogo(slug, file, { accessToken: token });
      setBroker({ ...broker, logoUrl: res.logoUrl });
      setLogoUrl(res.logoUrl);
    } catch {
      setUploadError(t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  if (!broker) {
    return <div className="py-12 text-center text-white/40">{t('notFound')}</div>;
  }

  const sfcData = (broker.sfcDetailJson ?? {}) as Record<string, unknown>;
  const disputeCount = broker.ratingDistribution?.find((d) => d.stars === 1)?.count ?? 0;

  const licenseTabs: { id: LicenseTab; label: string }[] = [
    { id: 'details', label: t('tabDetails') },
    { id: 'addresses', label: t('tabAddresses') },
    { id: 'ros', label: t('tabRos') },
    { id: 'reps', label: t('tabReps') },
    { id: 'complaints', label: t('tabComplaints') },
    { id: 'conditions', label: t('tabConditions') },
    { id: 'actions', label: t('tabActions') },
    { id: 'names', label: t('tabNames') },
    { id: 'records', label: t('tabRecords') },
  ];

  return (
    <div className="animate-in fade-in max-w-6xl space-y-6 pb-12 duration-300">
      {/* Back link */}
      <Link
        href={`/${locale}/admin/brokers`}
        className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
      >
        <ArrowLeft size={16} /> {t('backToBrokers')}
      </Link>

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 md:flex-row md:items-center">
        <div className="flex items-center gap-6">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/50">
            {broker.logoUrl ? (
              <img src={broker.logoUrl} alt="Logo" className="size-full object-contain p-2" />
            ) : (
              <div className="text-xs text-white/20">{t('noLogo')}</div>
            )}
          </div>
          <div>
            <h1 className="mb-2 flex items-center gap-3 text-2xl font-bold">
              {locale === 'en' ? broker.legalName : broker.displayName}
              {broker.ceNumber && (
                <span className="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-white/50">
                  {broker.ceNumber}
                </span>
              )}
            </h1>
            <div className="flex items-center gap-3 text-sm">
              {broker.isClaimed ? (
                <span className="rounded border border-blue-500/20 bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-400">
                  {t('claimed')}
                </span>
              ) : (
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold text-white/50">
                  {t('unclaimed')}
                </span>
              )}
              <span className="text-xs text-white/50">
                {t('lastUpdated')}: {new Date().toISOString().split('T')[0]}
              </span>
            </div>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center gap-6 rounded-xl border border-white/5 bg-black/30 px-6 py-4 md:w-auto">
          <div className="flex-1 text-center md:flex-none">
            <div className="mb-1 text-xs font-bold text-white/40">{t('totalReviews')}</div>
            <div className="font-mono text-xl text-white">{broker.reviewCount}</div>
          </div>
          <div className="hidden h-8 w-px bg-white/10 md:block" />
          <div className="flex-1 text-center md:flex-none">
            <div className="mb-1 text-xs font-bold text-white/40">{t('disputes')}</div>
            <div className="font-mono text-xl text-yellow-500">{disputeCount}</div>
          </div>
        </div>
      </div>

      {/* Editable Settings */}
      <div className="relative overflow-hidden rounded-2xl border border-[#00FF88]/20 bg-white/5 p-6">
        <div className="absolute left-0 top-0 h-full w-1 bg-[#00FF88]" />
        <div className="pl-4">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-[#00FF88]">
            <ShieldCheck size={18} />
            {t('brandSettings')}
          </h2>
          <div className="flex max-w-3xl flex-col items-start gap-4 sm:flex-row sm:items-end">
            <div className="w-full flex-1">
              <label className="mb-2 block text-sm font-medium text-white/50">
                {t('logoUrlLabel')}
              </label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white shadow-inner transition-all focus:border-[#00FF88]/50 focus:outline-none focus:ring-1 focus:ring-[#00FF88]/50"
                placeholder={t('logoUrlPlaceholder')}
              />
            </div>
            <button
              onClick={handleSaveLogo}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#00FF88]/20 bg-[#00FF88]/10 px-6 py-3 font-bold text-[#00FF88] transition-colors hover:bg-[#00FF88]/20 disabled:opacity-50 sm:w-auto"
            >
              <Save size={16} />
              {saving ? t('saving') : t('saveSettings')}
            </button>
          </div>

          {/* File upload */}
          <div className="mt-6 max-w-3xl border-t border-white/5 pt-6">
            <label className="mb-2 block text-sm font-medium text-white/50">
              {t('uploadLabel')}
            </label>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-black/20 px-6 py-8 transition-colors hover:border-[#00FF88]/30 hover:bg-black/30 ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Upload size={28} className="mb-2 text-white/30" />
              <span className="text-sm font-medium text-white/60">
                {uploading ? t('uploadUploading') : t('uploadClickOrDrag')}
              </span>
              <span className="mt-1 text-xs text-white/30">{t('uploadAccepted')}</span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
            {uploadError && <p className="mt-2 text-xs font-medium text-red-400">{uploadError}</p>}
          </div>
        </div>
      </div>

      {/* SFC Read-only Data */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-6 flex items-center gap-2 text-lg font-bold">
          <ShieldCheck size={20} className="text-[#00FF88]" />
          {t('sfcTitle')}
        </h2>

        {/* License tabs */}
        <div className="relative flex items-center border-b border-white/10 pb-4">
          {canScrollLeft && (
            <button
              onClick={() => scrollTabs('left')}
              className="absolute -left-1 z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a]/90 text-white/60 shadow-lg transition-colors hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div
            ref={tabsRef}
            className="no-scrollbar flex items-center gap-x-2 overflow-x-auto whitespace-nowrap px-2 text-sm font-bold"
          >
            {licenseTabs.map((tab, idx) => (
              <span key={tab.id} className="flex items-center gap-x-2">
                <button
                  onClick={() => setActiveLicenseTab(tab.id)}
                  className={`pb-1 transition-colors ${
                    activeLicenseTab === tab.id
                      ? 'border-b-2 border-[#00FF88] text-[#00FF88]'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
                {idx < licenseTabs.length - 1 && <span className="px-1 pb-1 text-white/20">|</span>}
              </span>
            ))}
          </div>
          {canScrollRight && (
            <button
              onClick={() => scrollTabs('right')}
              className="absolute -right-1 z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a]/90 text-white/60 shadow-lg transition-colors hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* Tab content */}
        <div className="animate-in fade-in mt-6 space-y-4 text-sm duration-300">
          {activeLicenseTab === 'details' && (
            <SfcDetailsTab broker={broker} sfcData={sfcData} t={t} />
          )}
          {activeLicenseTab === 'addresses' && (
            <SfcAddressesTab broker={broker} sfcData={sfcData} t={t} />
          )}
          {activeLicenseTab === 'ros' && <SfcPersonnelTab sfcData={sfcData} t={t} tabKey="ros" />}
          {activeLicenseTab === 'reps' && <SfcPersonnelTab sfcData={sfcData} t={t} tabKey="reps" />}
          {activeLicenseTab === 'complaints' && <SfcComplaintsTab sfcData={sfcData} t={t} />}
          {activeLicenseTab === 'conditions' && (
            <SfcGenericTable sfcData={sfcData} t={t} tabKey="conditions" />
          )}
          {activeLicenseTab === 'actions' && (
            <SfcGenericTable sfcData={sfcData} t={t} tabKey="actions" />
          )}
          {activeLicenseTab === 'names' && (
            <SfcGenericTable sfcData={sfcData} t={t} tabKey="names" />
          )}
          {activeLicenseTab === 'records' && (
            <SfcRecordsTab broker={broker} sfcData={sfcData} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components for SFC tabs
// ---------------------------------------------------------------------------

type TabProps = {
  broker?: BrokerDetail;
  sfcData: Record<string, unknown>;
  t: (key: string) => string;
};

function SfcDetailsTab({ broker, sfcData, t }: TabProps) {
  const details = (sfcData['details'] as Record<string, string>) ?? {};
  const rows = [
    { label: t('legalName'), value: broker?.legalName ?? details['legalName'] ?? '—' },
    { label: t('ceNumber'), value: broker?.ceNumber ?? details['ceNumber'] ?? '—' },
    {
      label: t('regulatedActivities'),
      value:
        broker?.licenses?.map((l) => l.licenseType).join(', ') ??
        (details['regulatedActivities'] as string) ??
        '—',
    },
    {
      label: t('effectiveDate'),
      value: broker?.licenses?.[0]?.issuedAt
        ? new Date(broker.licenses[0].issuedAt).toISOString().split('T')[0]
        : ((details['effectiveDate'] as string) ?? '—'),
    },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-white/5 bg-black/20 p-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-3 border-b border-white/5 pb-3 last:border-b-0"
        >
          <span className="text-white/40">{row.label}</span>
          <span className="col-span-2 font-bold">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function SfcAddressesTab({ broker, sfcData, t }: TabProps) {
  const addresses: string[] = [];
  if (broker?.addressEn) addresses.push(broker.addressEn);
  if (broker?.addressZh) addresses.push(broker.addressZh);
  const extra = (sfcData['addresses'] as string[]) ?? [];
  const all = [...addresses, ...extra.filter((a) => !addresses.includes(a))];

  return (
    <div className="space-y-4 overflow-hidden rounded-xl border border-white/5 bg-black/20">
      <div className="bg-white/5 px-4 py-3 font-bold text-white">{t('businessAddresses')}</div>
      <div className="space-y-4 px-4 pb-4">
        {all.length === 0 ? (
          <p className="text-white/40">{t('noData')}</p>
        ) : (
          all.map((addr, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:border-white/10"
            >
              <p className="text-white/80">{addr}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SfcPersonnelTab({
  sfcData,
  t,
  tabKey,
}: {
  sfcData: Record<string, unknown>;
  t: (key: string) => string;
  tabKey: 'ros' | 'reps';
}) {
  const people = (sfcData[tabKey] as { name: string; ceNumber: string; ras: number[] }[]) ?? [];
  const raHeaders = ['RA1', 'RA2', 'RA3', 'RA4', 'RA5', 'RA6', 'RA7', 'RA8', 'RA9'];

  return (
    <div className="space-y-4">
      <div className="mb-2 font-bold">{t('underSfo')}</div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full whitespace-nowrap text-left text-xs">
          <thead className="border-b border-white/10 bg-[#00FF88]/10 text-[#00FF88]">
            <tr>
              <th className="p-3 font-bold">{tabKey === 'ros' ? t('roName') : t('repName')}</th>
              <th className="border-r border-[#00FF88]/10 p-3 font-bold">{t('ceNumber')}</th>
              {raHeaders.map((ra) => (
                <th key={ra} className="p-3 text-center font-normal">
                  {ra}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-black/20">
            {people.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-4 text-center text-white/60">
                  {t('noData')}
                </td>
              </tr>
            ) : (
              people.map((person, i) => (
                <tr key={i} className="transition-colors hover:bg-white/5">
                  <td className="p-3 text-white/80 underline decoration-[#00FF88]/30 underline-offset-4">
                    {person.name}
                  </td>
                  <td className="border-r border-white/5 p-3 font-mono text-white/50">
                    {person.ceNumber}
                  </td>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                    <td key={j} className="p-3 text-center text-white/30">
                      {person.ras.includes(j) ? 'X' : ''}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SfcComplaintsTab({
  sfcData,
  t,
}: {
  sfcData: Record<string, unknown>;
  t: (key: string) => string;
}) {
  const complaints = (sfcData['complaints'] as Record<string, string>) ?? {};

  return (
    <div className="space-y-4">
      <div className="mb-2 font-bold text-white">{t('contactDetails')}</div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-[#00FF88]/10 text-[#00FF88]">
            <tr>
              <th className="border-r border-white/5 p-4 font-bold">{t('phone')}</th>
              <th className="border-r border-white/5 p-4 font-bold">{t('fax')}</th>
              <th className="border-r border-white/5 p-4 font-bold">{t('email')}</th>
              <th className="p-4 font-bold">{t('address')}</th>
            </tr>
          </thead>
          <tbody className="bg-black/20">
            <tr className="transition-colors hover:bg-white/5">
              <td className="border-r border-white/5 p-4 text-white/80">
                {complaints['phone'] ?? '—'}
              </td>
              <td className="border-r border-white/5 p-4 text-white/80">
                {complaints['fax'] ?? '—'}
              </td>
              <td className="border-r border-white/5 p-4 text-[#00FF88]">
                {complaints['email'] ?? '—'}
              </td>
              <td className="p-4 text-white/80">{complaints['address'] ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SfcGenericTable({
  sfcData,
  t,
  tabKey,
}: {
  sfcData: Record<string, unknown>;
  t: (key: string) => string;
  tabKey: 'conditions' | 'actions' | 'names';
}) {
  const data = (sfcData[tabKey] as Record<string, string>[]) ?? [];

  const headerMap: Record<string, { headers: string[]; headerLabels: string[] }> = {
    conditions: {
      headers: ['effectiveDate', 'condition'],
      headerLabels: [t('effectiveDate'), t('licenseCondition')],
    },
    actions: {
      headers: ['actionDate', 'action', 'pressRelease'],
      headerLabels: [t('actionDate'), t('actionTaken'), t('pressRelease')],
    },
    names: {
      headers: ['validUntil', 'englishName', 'chineseName'],
      headerLabels: [t('validUntil'), t('englishName'), t('chineseName')],
    },
  };

  const config = headerMap[tabKey]!;
  const isActions = tabKey === 'actions';

  return (
    <div className="space-y-4">
      {tabKey === 'names' && <div className="mb-2 font-bold">{t('formerNames')}</div>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead
            className={`border-b border-white/10 ${
              isActions ? 'bg-red-500/10 text-red-400' : 'bg-[#00FF88]/10 text-[#00FF88]'
            }`}
          >
            <tr>
              {config.headerLabels.map((h, i) => (
                <th
                  key={i}
                  className={`p-4 font-bold ${i < config.headerLabels.length - 1 ? `border-r ${isActions ? 'border-red-500/10' : 'border-[#00FF88]/10'}` : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-black/20">
            {data.length === 0 ? (
              <tr>
                <td colSpan={config.headers.length} className="p-4 text-center text-white/60">
                  {t('noData')}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="transition-colors hover:bg-white/5">
                  {config.headers.map((key, j) => (
                    <td
                      key={j}
                      className={`p-4 text-white/80 ${j < config.headers.length - 1 ? 'border-r border-white/5' : ''}`}
                    >
                      {row[key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {isActions && <div className="text-xs italic text-white/40">{t('actionsDisclaimer')}</div>}
    </div>
  );
}

function SfcRecordsTab({ broker, sfcData, t }: TabProps) {
  const records =
    (sfcData['records'] as { licenseType: string; activity: string; period: string }[]) ?? [];
  const licenseRecords =
    records.length > 0
      ? records
      : (broker?.licenses ?? []).map((l) => ({
          licenseType: l.licenseType,
          activity: l.licenseType,
          period: l.issuedAt ? `${t('from')} ${new Date(l.issuedAt).toLocaleDateString()}` : '—',
        }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="mb-2 flex items-center gap-2 font-bold text-white">
          <div className="size-2 rounded-full bg-[#00FF88]" />
          {t('underSfo')}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#00FF88]/10 text-[#00FF88]">
              <tr>
                <th className="w-1/4 border-r border-[#00FF88]/10 p-4 font-bold">
                  {t('licenseCategory')}
                </th>
                <th className="w-1/3 border-r border-[#00FF88]/10 p-4 font-bold">
                  {t('regulatedActivities')}
                </th>
                <th className="p-4 font-bold">{t('validPeriod')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-black/20">
              {licenseRecords.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-white/60">
                    {t('noData')}
                  </td>
                </tr>
              ) : (
                licenseRecords.map((rec, i) => (
                  <tr key={i} className="transition-colors hover:bg-white/5">
                    <td className="border-r border-white/5 p-4 text-white/80">{rec.licenseType}</td>
                    <td className="border-r border-white/5 p-4 text-white/80">{rec.activity}</td>
                    <td className="p-4 text-white/60">{rec.period}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
