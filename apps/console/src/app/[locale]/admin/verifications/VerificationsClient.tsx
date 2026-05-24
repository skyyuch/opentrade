'use client';

import {
  CheckCircle,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { localizedBrokerName } from '@opentrade/shared';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import {
  approveVerification,
  fetchAdminVerifications,
  rejectVerification,
} from '../../../../lib/api/client';

import type { VerificationItem } from '../../../../lib/api/client';
import type { MouseEvent as ReactMouseEvent } from 'react';

const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

type TabStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const TAB_KEYS: Record<TabStatus, string> = {
  PENDING: 'tabPending',
  APPROVED: 'tabApproved',
  REJECTED: 'tabRejected',
};

const isImageMime = (m: string | null): boolean =>
  m === 'image/jpeg' || m === 'image/png' || m === 'image/webp' || m === 'image/jpg';

const isPdfMime = (m: string | null): boolean => m === 'application/pdf';

const shortenWallet = (addr: string | null): string => {
  if (!addr) return '—';
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

/**
 * Module-level cache mapping IPFS CID → detected MIME type (or null on failure).
 * Survives re-renders within a session so we don't HEAD-probe the same CID twice.
 */
const mimeProbeCache = new Map<string, string | null>();

/**
 * Returns the effective MIME type for a verification evidence file.
 *
 * Priority:
 *   1. `knownMime` from DB (new submissions after the schema change)
 *   2. Cached probe result from a previous call
 *   3. Live HEAD request to the Pinata gateway (legacy submissions)
 *
 * Returns `loading: true` only while a fresh HEAD probe is in flight.
 */
function useEvidenceMime(
  cid: string,
  knownMime: string | null,
): { mime: string | null; loading: boolean } {
  const [detectedMime, setDetectedMime] = useState<string | null>(() =>
    knownMime ? null : (mimeProbeCache.get(cid) ?? null),
  );
  const [loading, setLoading] = useState<boolean>(() => !knownMime && !mimeProbeCache.has(cid));

  useEffect(() => {
    if (knownMime) return undefined;
    if (mimeProbeCache.has(cid)) {
      setDetectedMime(mimeProbeCache.get(cid) ?? null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`${PINATA_GATEWAY}${cid}`, {
          method: 'HEAD',
          signal: controller.signal,
        });
        const ct = res.headers.get('content-type');
        const cleanCt = ct ? (ct.split(';')[0]?.trim() ?? null) : null;
        mimeProbeCache.set(cid, cleanCt);
        if (!controller.signal.aborted) {
          setDetectedMime(cleanCt);
          setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setDetectedMime(null);
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [cid, knownMime]);

  return { mime: knownMime ?? detectedMime, loading };
}

export function VerificationsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [tab, setTab] = useState<TabStatus>('PENDING');
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState<VerificationItem | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [pendingReject, setPendingReject] = useState<VerificationItem | null>(null);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      const token = getAccessToken();
      if (!token) return;
      try {
        const res = await fetchAdminVerifications(tab, { accessToken: token });
        if (!controller.signal.aborted) setItems(res.verifications);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [getAccessToken, tab]);

  // Close modal on Escape (reject reason → image zoom → case modal)
  useEffect(() => {
    if (!selectedCase && !pendingReject) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pendingReject) setPendingReject(null);
      else if (isZoomed) setIsZoomed(false);
      else closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCase, isZoomed, pendingReject]);

  const closeModal = () => {
    setSelectedCase(null);
    setIsZoomed(false);
  };

  const handleApprove = async (id: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    try {
      await approveVerification(id, undefined, { accessToken: token });
      setItems((prev) => prev.filter((v) => v.id !== id));
      if (selectedCase?.id === id) closeModal();
    } catch {
      /* swallow — UI stays */
    }
  };

  const openRejectModal = (item: VerificationItem, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setPendingReject(item);
  };

  const handleConfirmReject = async (reason: string) => {
    if (!pendingReject) return;
    const token = getAccessToken();
    if (!token) return;
    setRejecting(true);
    try {
      await rejectVerification(pendingReject.id, reason, { accessToken: token });
      const rejectedId = pendingReject.id;
      setItems((prev) => prev.filter((v) => v.id !== rejectedId));
      setPendingReject(null);
      if (selectedCase?.id === rejectedId) closeModal();
    } catch {
      /* swallow — modal stays open so admin can retry */
    } finally {
      setRejecting(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((v) => {
      const wallet = (v.user.walletAddress ?? '').toLowerCase();
      const display = (v.user.displayName ?? '').toLowerCase();
      return v.id.toLowerCase().includes(q) || wallet.includes(q) || display.includes(q);
    });
  }, [items, search]);

  const tabs: TabStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('verificationsTitle')}</h1>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm">
          <Search size={16} className="shrink-0 text-white/40" />
          <input
            type="text"
            placeholder={t('searchUserPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 border-none bg-transparent text-white placeholder:text-white/30 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-white/10 pb-4">
        {tabs.map((s) => (
          <button
            key={`tab-${s}`}
            onClick={() => setTab(s)}
            className={`-mb-[17px] pb-4 font-bold ${
              tab === s
                ? 'border-b-2 border-[#00FF88] text-[#00FF88]'
                : 'text-white/50 hover:text-white'
            }`}
          >
            {t(TAB_KEYS[s])}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-white/10 bg-black/40">
                <tr>
                  <th className="p-4 font-medium text-white/50">{t('thCaseId')}</th>
                  <th className="p-4 font-medium text-white/50">{t('thUserAddress')}</th>
                  <th className="p-4 font-medium text-white/50">{t('thBrokerClaimed')}</th>
                  <th className="p-4 font-medium text-white/50">{t('thEvidencePreview')}</th>
                  <th className="p-4 font-medium text-white/50">{t('thSubmittedDate')}</th>
                  <th className="p-4 text-right font-medium text-white/50">{t('thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-white/40">
                      {t('noVerifications')}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <VerificationRow
                      key={`verification-${item.id}`}
                      item={item}
                      tab={tab}
                      onSelect={() => setSelectedCase(item)}
                      onApprove={(e) => void handleApprove(item.id, e)}
                      onReject={(e) => openRejectModal(item, e)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCase && (
        <CaseDetailModal
          caseItem={selectedCase}
          isZoomed={isZoomed}
          onZoomToggle={() => setIsZoomed((z) => !z)}
          onClose={closeModal}
          onApprove={(e) => void handleApprove(selectedCase.id, e)}
          onReject={(e) => openRejectModal(selectedCase, e)}
          showActions={tab === 'PENDING'}
        />
      )}

      {pendingReject && (
        <RejectReasonModal
          submitting={rejecting}
          onCancel={() => setPendingReject(null)}
          onConfirm={(reason) => void handleConfirmReject(reason)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type RowProps = {
  item: VerificationItem;
  tab: TabStatus;
  onSelect: () => void;
  onApprove: (e: ReactMouseEvent) => void;
  onReject: (e: ReactMouseEvent) => void;
};

function VerificationRow({ item, tab, onSelect, onApprove, onReject }: RowProps): React.ReactNode {
  const t = useTranslations('admin');
  const locale = useLocale();
  const ipfsUrl = `${PINATA_GATEWAY}${item.evidenceIpfsCid}`;
  const { mime } = useEvidenceMime(item.evidenceIpfsCid, item.evidenceMimeType);
  const [imgFailed, setImgFailed] = useState(false);
  const showImageThumb = isImageMime(mime) && !imgFailed;

  // Per cursor rule 51: render the localised broker name from the API-
  // shipped columns, never the raw slug. The column header is "聲明券商";
  // showing `hsbc-broking-securities-hong-kong-limited` was the
  // user-reported regression on this surface.
  const brokerName = localizedBrokerName(
    {
      slug: item.brokerSlug,
      displayName: item.brokerDisplayName,
      legalName: item.brokerLegalName,
    },
    locale,
  );

  return (
    <tr className="group cursor-pointer transition-colors hover:bg-white/10" onClick={onSelect}>
      <td className="p-4 font-mono text-white/70 transition-colors group-hover:text-white">
        {item.id.slice(0, 8)}
      </td>
      <td className="p-4 font-mono text-blue-400 transition-colors group-hover:text-blue-300">
        {shortenWallet(item.user.walletAddress)}
      </td>
      <td className="p-4 font-medium">{brokerName}</td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center overflow-hidden rounded border border-white/20 bg-white/10">
            {showImageThumb ? (
              <img
                src={ipfsUrl}
                alt="evidence"
                className="size-full object-cover"
                loading="lazy"
                onError={() => setImgFailed(true)}
              />
            ) : isPdfMime(mime) ? (
              <FileText size={14} className="text-red-400" />
            ) : (
              <FileText size={14} className="text-white/40" />
            )}
          </div>
          <span className="text-xs text-white/50 transition-colors group-hover:text-white/80">
            {t('clickToView')}
          </span>
        </div>
      </td>
      <td className="p-4 text-white/60">{new Date(item.createdAt).toLocaleDateString()}</td>
      <td className="p-4 text-right">
        {tab === 'PENDING' ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onApprove}
              className="flex items-center gap-1 rounded border border-[#00FF88]/20 bg-[#00FF88]/10 px-3 py-1.5 text-xs font-bold text-[#00FF88] transition-colors hover:border-[#00FF88]/40 hover:bg-[#00FF88]/20"
            >
              <CheckCircle size={14} /> {t('approve')}
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 transition-colors hover:border-red-500/40 hover:bg-red-500/20"
            >
              <XCircle size={14} /> {t('reject')}
            </button>
          </div>
        ) : (
          <span className="text-white/40">—</span>
        )}
      </td>
    </tr>
  );
}

type ModalProps = {
  caseItem: VerificationItem;
  isZoomed: boolean;
  onZoomToggle: () => void;
  onClose: () => void;
  onApprove: (e: ReactMouseEvent) => void;
  onReject: (e: ReactMouseEvent) => void;
  showActions: boolean;
};

function CaseDetailModal({
  caseItem,
  isZoomed,
  onZoomToggle,
  onClose,
  onApprove,
  onReject,
  showActions,
}: ModalProps): React.ReactNode {
  const t = useTranslations('admin');
  const locale = useLocale();
  const ipfsUrl = `${PINATA_GATEWAY}${caseItem.evidenceIpfsCid}`;
  const { mime, loading: mimeLoading } = useEvidenceMime(
    caseItem.evidenceIpfsCid,
    caseItem.evidenceMimeType,
  );
  const isImage = isImageMime(mime);
  const isPdf = isPdfMime(mime);

  // Per cursor rule 51: render the localised broker name in the case
  // modal "Target broker" panel using the API-shipped name columns.
  const caseBrokerName = localizedBrokerName(
    {
      slug: caseItem.brokerSlug,
      displayName: caseItem.brokerDisplayName,
      legalName: caseItem.brokerLegalName,
    },
    locale,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="animate-in zoom-in-95 relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121418] shadow-2xl duration-200">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
          <h2 className="flex items-center gap-3 text-lg font-bold">
            {t('caseModalTitle')}
            <span className="rounded border border-white/5 bg-black/30 px-2 py-0.5 font-mono text-sm text-white/50">
              {caseItem.id.slice(0, 8)}
            </span>
          </h2>
          <button
            onClick={onClose}
            aria-label={t('closeModal')}
            className="flex size-8 items-center justify-center rounded-full bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex h-full flex-1 flex-col overflow-y-auto md:flex-row">
          <div className="group relative flex flex-1 flex-col border-r border-white/10 bg-black/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-white/80">
                <ImageIcon size={16} /> {t('evidencePreview')}
              </h3>
              <a
                href={ipfsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <ExternalLink size={14} /> {isImage ? t('originalSize') : t('openInNewTab')}
              </a>
            </div>

            {mimeLoading ? (
              <div className="flex min-h-[300px] flex-1 items-center justify-center rounded-xl border border-white/10 bg-zinc-900">
                <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
              </div>
            ) : isImage ? (
              <button
                type="button"
                onClick={onZoomToggle}
                className={`relative min-h-[300px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 transition-all ${
                  isZoomed ? 'fixed inset-4 z-[60] cursor-zoom-out shadow-2xl' : 'cursor-zoom-in'
                }`}
              >
                <img
                  src={ipfsUrl}
                  alt="Proof"
                  className={`size-full ${isZoomed ? 'object-contain' : 'object-cover'}`}
                />
                {!isZoomed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/20">
                    <div className="rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm font-bold text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                      {t('clickToZoom')}
                    </div>
                  </div>
                )}
              </button>
            ) : isPdf ? (
              <iframe
                src={ipfsUrl}
                title={t('pdfDocument')}
                className="min-h-[400px] flex-1 rounded-xl border border-white/10 bg-zinc-900"
              />
            ) : (
              <div className="flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-zinc-900 text-center text-white/40">
                <FileText size={32} />
                <span className="text-sm">{t('noPreview')}</span>
                <a
                  href={ipfsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink size={14} /> {t('viewDocument')}
                </a>
              </div>
            )}

            {isZoomed && (
              <div
                className="fixed inset-0 z-[55] bg-black/90 backdrop-blur-sm"
                onClick={onZoomToggle}
                aria-hidden
              />
            )}
          </div>

          <div className="flex w-full flex-col gap-6 bg-white/5 p-6 md:w-[400px]">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-blue-400">
                {t('targetBroker')}
              </h3>
              <p className="text-xl font-bold">{caseBrokerName}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-white/40">
                {caseItem.brokerSlug}
              </p>
            </div>

            <UserVerifiedBrokersPanel caseItem={caseItem} />

            <div className="space-y-4">
              <DataField label={t('userAddress')}>
                <div className="break-all rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-sm text-white/80">
                  {caseItem.user.walletAddress ?? '—'}
                </div>
              </DataField>

              <DataField label={t('commitmentHash')}>
                <div className="break-all rounded-lg border border-[#00FF88]/20 bg-black/40 p-2.5 font-mono text-sm text-[#00FF88]/80">
                  {caseItem.commitment}
                </div>
              </DataField>

              <DataField label={t('verificationIpfsCid')}>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-sm">
                  <span className="truncate text-white/60">{caseItem.evidenceIpfsCid}</span>
                  <a
                    href={ipfsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('openInNewTab')}
                    className="p-1 text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </DataField>

              {caseItem.adminNote && (
                <DataField label={t('adminNoteLabel')}>
                  <div className="whitespace-pre-wrap break-words rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-sm text-red-200/80">
                    {caseItem.adminNote}
                  </div>
                </DataField>
              )}
            </div>

            {showActions && (
              <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-6">
                <button
                  onClick={onApprove}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00FF88] py-3.5 font-extrabold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
                >
                  <CheckCircle size={18} /> {t('approveAndMint')}
                </button>
                <button
                  onClick={onReject}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-transparent py-3.5 font-bold text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <XCircle size={18} /> {t('rejectApplication')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-white/40">{label}</label>
      {children}
    </div>
  );
}

/**
 * Compact list of every broker the user has been verified for, scoped to
 * the case modal's data panel. Per ADR-0025 admins use this to spot
 * duplicates and unusual coverage before approving a new request — the
 * approve handler itself rejects (userId, brokerSlug) double-approves at
 * the DB level, but seeing the existing list keeps the human reviewer
 * grounded.
 */
function UserVerifiedBrokersPanel({ caseItem }: { caseItem: VerificationItem }): React.ReactNode {
  const t = useTranslations('admin');
  const locale = useLocale();
  const brokers = caseItem.user.verifiedBrokers;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
          {t('userVerifiedBrokersTitle')}
        </h3>
        {brokers.length > 0 && (
          <span className="rounded-full bg-[#00FF88]/15 px-2 py-0.5 text-[11px] font-bold text-[#00FF88]">
            {t('userVerifiedBrokersCount', { count: brokers.length })}
          </span>
        )}
      </div>
      {brokers.length === 0 ? (
        <p className="text-xs text-white/40">{t('userVerifiedBrokersEmpty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {brokers.map((b) => {
            const isCurrent = b.brokerSlug === caseItem.brokerSlug;
            return (
              <li
                key={b.brokerSlug}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                  isCurrent
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                    : 'border-white/10 bg-white/5 text-white/70'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <CheckCircle size={12} className="shrink-0 text-[#00FF88]" aria-hidden />
                  {/* Per cursor rule 51: render the localised broker
                      name instead of the raw slug. */}
                  <span className="truncate text-xs">
                    {localizedBrokerName(
                      {
                        slug: b.brokerSlug,
                        displayName: b.displayName,
                        legalName: b.legalName,
                      },
                      locale,
                    )}
                  </span>
                </span>
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-100">
                    {t('currentTarget')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const REJECT_MIN = 5;
const REJECT_MAX = 500;

type RejectReasonModalProps = {
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

function RejectReasonModal({
  submitting,
  onCancel,
  onConfirm,
}: RejectReasonModalProps): React.ReactNode {
  const t = useTranslations('admin');
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const tooShort = trimmed.length < REJECT_MIN;
  const charCount = reason.length;

  const submit = () => {
    if (tooShort || submitting) return;
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={submitting ? undefined : onCancel}
        aria-hidden
      />
      <div className="animate-in zoom-in-95 relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#121418] shadow-2xl duration-150">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-base font-bold">
            <XCircle size={18} className="text-red-400" /> {t('rejectReasonTitle')}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label={t('closeModal')}
            className="flex size-8 items-center justify-center rounded-full bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-5">
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REJECT_MAX))}
            placeholder={t('rejectReasonPlaceholder')}
            rows={5}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
          />
          <div className="flex items-center justify-between text-xs">
            <span className={tooShort && trimmed.length > 0 ? 'text-red-400' : 'text-white/40'}>
              {tooShort && trimmed.length > 0 ? t('rejectReasonTooShort') : t('rejectReasonHint')}
            </span>
            <span className="font-mono text-white/40">
              {charCount}/{REJECT_MAX}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-white/5 px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {t('cancelReject')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={tooShort || submitting}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-500/40"
          >
            {submitting ? (
              <>
                <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                {t('submitRejecting')}
              </>
            ) : (
              <>
                <XCircle size={14} /> {t('confirmRejectButton')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
