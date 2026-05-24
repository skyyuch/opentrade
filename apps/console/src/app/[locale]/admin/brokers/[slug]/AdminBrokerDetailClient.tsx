'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Save, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOpenTradeAuth } from '../../../../../hooks/useOpenTradeAuth';
import { fetchBroker, updateBrokerLogo, uploadBrokerLogo } from '../../../../../lib/api/client';

import type { BrokerDetail, SfcDetailJson } from '../../../../../lib/api/client';
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveLogo = async () => {
    const token = await getAccessToken();
    if (!token || !broker) return;
    setSaving(true);
    try {
      await updateBrokerLogo(slug, logoUrl, { accessToken: token });
      setBroker({ ...broker, logoUrl: logoUrl || null });
      showToast('success', t('saveSuccess'));
    } catch {
      showToast('error', t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (file: File) => {
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
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const handleCancelUpload = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setUploadError('');
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile) return;
    const token = await getAccessToken();
    if (!token || !broker) return;
    setUploading(true);
    try {
      const res = await uploadBrokerLogo(slug, pendingFile, { accessToken: token });
      setBroker({ ...broker, logoUrl: res.logoUrl });
      setLogoUrl(res.logoUrl);
      handleCancelUpload();
      showToast('success', t('uploadSuccess'));
    } catch {
      setUploadError(t('uploadFailed'));
      showToast('error', t('uploadFailed'));
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

  const sfcData: SfcDetailJson = (broker.sfcDetailJson ?? {}) as SfcDetailJson;
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
      {/* Toast notification */}
      {toast && (
        <div
          className={`animate-in slide-in-from-top-2 fade-in fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg px-5 py-3 text-sm font-medium shadow-xl duration-200 ${
            toast.type === 'success'
              ? 'border border-[#00FF88]/20 bg-[#00FF88]/10 text-[#00FF88]'
              : 'border border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          {toast.message}
        </div>
      )}

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

            {pendingPreview ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                    <img
                      src={pendingPreview}
                      alt="Preview"
                      className="size-full object-contain p-1"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/80">
                      {pendingFile?.name}
                    </p>
                    <p className="text-xs text-white/40">
                      {pendingFile && `${(pendingFile.size / 1024).toFixed(1)} KB`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void handleConfirmUpload()}
                    disabled={uploading}
                    className="flex items-center gap-2 rounded-lg border border-[#00FF88]/20 bg-[#00FF88]/10 px-5 py-2 text-sm font-bold text-[#00FF88] transition-colors hover:bg-[#00FF88]/20 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {uploading ? t('uploadUploading') : t('uploadConfirm')}
                  </button>
                  <button
                    onClick={handleCancelUpload}
                    disabled={uploading}
                    className="rounded-lg border border-white/10 px-5 py-2 text-sm font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-black/20 px-6 py-8 transition-colors hover:border-[#00FF88]/30 hover:bg-black/30">
                <Upload size={28} className="mb-2 text-white/30" />
                <span className="text-sm font-medium text-white/60">{t('uploadClickOrDrag')}</span>
                <span className="mt-1 text-xs text-white/30">{t('uploadAccepted')}</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
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
// Sub-components for SFC tabs — aligned with new SfcDetailJson structure
// ---------------------------------------------------------------------------

type TabProps = {
  broker?: BrokerDetail;
  sfcData: SfcDetailJson;
  t: (key: string) => string;
};

function SfcDetailsTab({ broker, t }: TabProps) {
  const rows = [
    { label: t('legalName'), value: broker?.legalName ?? '—' },
    { label: t('ceNumber'), value: broker?.ceNumber ?? '—' },
    {
      label: t('regulatedActivities'),
      value: broker?.licenses?.map((l) => l.licenseType).join(', ') || '—',
    },
    {
      label: t('effectiveDate'),
      value: broker?.licenses?.[0]?.issuedAt
        ? new Date(broker.licenses[0].issuedAt).toISOString().split('T')[0]
        : '—',
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

function SfcAddressesTab({ sfcData, t }: TabProps) {
  const addresses = sfcData.addresses ?? [];

  return (
    <div className="space-y-4 overflow-hidden rounded-xl border border-white/5 bg-black/20">
      <div className="bg-white/5 px-4 py-3 font-bold text-white">{t('businessAddresses')}</div>
      <div className="space-y-4 px-4 pb-4">
        {addresses.length === 0 ? (
          <p className="text-white/40">{t('noData')}</p>
        ) : (
          addresses.map((addr, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:border-white/10"
            >
              <p className="text-white/80">{addr.addressEn}</p>
              {addr.addressZh && addr.addressZh !== addr.addressEn && (
                <p className="mt-1 text-white/50">{addr.addressZh}</p>
              )}
              {addr.isPrimary && (
                <span className="mt-2 inline-block rounded border border-[#00FF88]/20 bg-[#00FF88]/10 px-2 py-0.5 text-[10px] text-[#00FF88]">
                  {t('primaryAddress')}
                </span>
              )}
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
  sfcData: SfcDetailJson;
  t: (key: string) => string;
  tabKey: 'ros' | 'reps';
}) {
  const people = tabKey === 'ros' ? (sfcData.principals ?? []) : (sfcData.representatives ?? []);
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
                    {person.nameEn}
                    {person.nameZh && <span className="ml-1 text-white/40">{person.nameZh}</span>}
                  </td>
                  <td className="border-r border-white/5 p-3 font-mono text-white/50">
                    {person.ceRef ?? '—'}
                  </td>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((raNum) => (
                    <td key={raNum} className="p-3 text-center text-white/30">
                      {person.raTypes.includes(raNum) ? 'X' : ''}
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

function SfcComplaintsTab({ sfcData, t }: { sfcData: SfcDetailJson; t: (key: string) => string }) {
  const officer = sfcData.complaintsOfficer;

  return (
    <div className="space-y-4">
      {officer && (officer.entityName || officer.entityNameChi) && (
        <div className="space-y-1 text-center">
          <div className="text-white/50">{t('corporation')}</div>
          <div className="font-bold">
            {officer.entityName}
            {officer.entityNameChi && ` ${officer.entityNameChi}`}
            {officer.ceRef && <span className="ml-1 text-white/40">({officer.ceRef})</span>}
          </div>
        </div>
      )}
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
              <td className="border-r border-white/5 p-4 text-white/80">{officer?.tel ?? '—'}</td>
              <td className="border-r border-white/5 p-4 text-white/80">{officer?.fax ?? '—'}</td>
              <td className="border-r border-white/5 p-4">
                {officer?.email ? (
                  <a href={`mailto:${officer.email}`} className="text-[#00FF88] hover:underline">
                    {officer.email}
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td className="p-4 text-white/80">{officer?.address ?? '—'}</td>
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
  sfcData: SfcDetailJson;
  t: (key: string) => string;
  tabKey: 'conditions' | 'actions' | 'names';
}) {
  if (tabKey === 'conditions') {
    const sfo = sfcData.conditionsSfo ?? [];
    const amlo = sfcData.conditionsAmlo ?? [];
    return (
      <div className="space-y-6">
        <ConditionSection title={t('underSfo')} items={sfo} t={t} />
        <ConditionSection
          title={t('underAmlo')}
          items={amlo}
          t={t}
          emptyLabel={t('noLicenseRecord')}
        />
      </div>
    );
  }

  if (tabKey === 'actions') {
    const actions = sfcData.disciplinaryActions ?? [];
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-white/10 bg-red-500/10 text-red-400">
              <tr>
                <th className="border-r border-red-500/10 p-4 font-bold">{t('actionDate')}</th>
                <th className="border-r border-red-500/10 p-4 font-bold">{t('actionTaken')}</th>
                <th className="p-4 font-bold">{t('pressRelease')}</th>
              </tr>
            </thead>
            <tbody className="bg-black/20">
              {actions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-white/60">
                    {t('noData')}
                  </td>
                </tr>
              ) : (
                actions.map((a, i) => (
                  <tr key={i} className="transition-colors hover:bg-white/5">
                    <td className="border-r border-white/5 p-4 text-white/80">{a.date ?? '—'}</td>
                    <td className="whitespace-normal border-r border-white/5 p-4 text-white/80">
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
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs italic text-white/40">{t('actionsDisclaimer')}</div>
      </div>
    );
  }

  const names = sfcData.formerNames ?? [];
  return (
    <div className="space-y-4">
      <div className="mb-2 font-bold">{t('formerNames')}</div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-white/10 bg-[#00FF88]/10 text-[#00FF88]">
            <tr>
              <th className="border-r border-[#00FF88]/10 p-4 font-bold">{t('validUntil')}</th>
              <th className="border-r border-[#00FF88]/10 p-4 font-bold">{t('englishName')}</th>
              <th className="p-4 font-bold">{t('chineseName')}</th>
            </tr>
          </thead>
          <tbody className="bg-black/20">
            {names.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-4 text-center text-white/60">
                  {t('noData')}
                </td>
              </tr>
            ) : (
              names.map((n, i) => (
                <tr key={i} className="transition-colors hover:bg-white/5">
                  <td className="border-r border-white/5 p-4 text-white/80">
                    {n.effectiveUntil ?? '—'}
                  </td>
                  <td className="border-r border-white/5 p-4 text-white/80">{n.nameEn ?? '—'}</td>
                  <td className="p-4 text-white/80">{n.nameZh ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConditionSection({
  title,
  items,
  t,
  emptyLabel,
}: {
  title: string;
  items: Array<{ text: string; textZh?: string; effectiveDate?: string }>;
  t: (key: string) => string;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="font-bold text-white">{title}</div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-white/10 bg-[#00FF88]/10 text-[#00FF88]">
            <tr>
              <th className="w-1/4 border-r border-[#00FF88]/10 p-4 font-bold">
                {t('effectiveDate')}
              </th>
              <th className="p-4 font-bold">{t('licenseCondition')}</th>
            </tr>
          </thead>
          <tbody className="bg-black/20">
            {items.length > 0 ? (
              items.map((c, i) => (
                <tr key={i} className="transition-colors hover:bg-white/5">
                  <td className="border-r border-white/5 p-4 text-white/50">
                    {c.effectiveDate ?? '—'}
                  </td>
                  <td className="whitespace-normal p-4 text-white/80">{c.text}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="border-r border-white/5 p-4 text-white/50">—</td>
                <td className="p-4 text-white/80">{emptyLabel ?? t('noData')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatLicDate(dateStr: string): string {
  if (!dateStr) return '—';
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

function SfcRecordsTab({ sfcData, t }: TabProps) {
  const sfo = sfcData.licenseRecordsSfo ?? [];
  const amlo = sfcData.licenseRecordsAmlo ?? [];
  const lcTypeMap: Record<string, string> = { C: t('licensedCorp'), I: t('licensedIndividual') };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="mb-2 flex items-center gap-2 font-bold text-white">
          <div
            className={`size-2 rounded-full ${sfo.length > 0 ? 'bg-[#00FF88]' : 'bg-white/20'}`}
          />
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
              {sfo.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-white/60">
                    {t('noLicenseRecord')}
                  </td>
                </tr>
              ) : (
                sfo.map((rec, i) => (
                  <tr key={i} className="transition-colors hover:bg-white/5">
                    <td className="border-r border-white/5 p-4 text-white/80">
                      {lcTypeMap[rec.lcType] ?? rec.lcType}
                    </td>
                    <td className="border-r border-white/5 p-4 text-white/80">
                      {rec.actDescZh || rec.actDesc}
                    </td>
                    <td className="p-4 text-white/60">
                      {rec.periods.map((p, j) => (
                        <div key={j}>
                          {p.to
                            ? `${formatLicDate(p.from)} - ${formatLicDate(p.to)}`
                            : `由 ${formatLicDate(p.from)}`}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="mb-2 flex items-center gap-2 font-bold text-white">
          <div
            className={`size-2 rounded-full ${amlo.length > 0 ? 'bg-[#00FF88]' : 'bg-white/20'}`}
          />
          {t('underAmlo')}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#00FF88]/10 text-[#00FF88]">
              <tr>
                <th className="w-1/4 border-r border-[#00FF88]/10 p-4 font-bold">
                  {t('licenseCategory')}
                </th>
                <th className="w-1/3 border-r border-[#00FF88]/10 p-4 font-bold">
                  {t('vaServices')}
                </th>
                <th className="p-4 font-bold">{t('validPeriod')}</th>
              </tr>
            </thead>
            <tbody className="bg-black/20">
              {amlo.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-white/60">
                    {t('noLicenseRecord')}
                  </td>
                </tr>
              ) : (
                amlo.map((rec, i) => (
                  <tr key={i} className="transition-colors hover:bg-white/5">
                    <td className="border-r border-white/5 p-4 text-white/80">
                      {lcTypeMap[rec.lcType] ?? rec.lcType}
                    </td>
                    <td className="border-r border-white/5 p-4 text-white/80">
                      {rec.actDescZh || rec.actDesc}
                    </td>
                    <td className="p-4 text-white/60">
                      {rec.periods.map((p, j) => (
                        <div key={j}>
                          {p.to
                            ? `${formatLicDate(p.from)} - ${formatLicDate(p.to)}`
                            : `由 ${formatLicDate(p.from)}`}
                        </div>
                      ))}
                    </td>
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
