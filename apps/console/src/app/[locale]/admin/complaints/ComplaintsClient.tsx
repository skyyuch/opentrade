'use client';

import { AlertTriangle, CheckCircle, ExternalLink, Search, X, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { localizedBrokerName } from '@opentrade/shared';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAdminComplaints, rejectComplaint, verifyComplaint } from '../../../../lib/api/client';

import type { AdminComplaintItem, AdminComplaintStatus } from '../../../../lib/api/client';
import type { MouseEvent as ReactMouseEvent } from 'react';

const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

type TabKey = 'OPEN' | 'VERIFIED' | 'REJECTED' | 'ALL';

const TAB_LABEL_KEYS: Record<TabKey, string> = {
  OPEN: 'tabOpen',
  VERIFIED: 'tabVerified',
  REJECTED: 'tabRejected',
  ALL: 'tabAll',
};

const REJECT_MIN = 5;
const REJECT_MAX = 500;

export function ComplaintsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [tab, setTab] = useState<TabKey>('OPEN');
  const [items, setItems] = useState<AdminComplaintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState<AdminComplaintItem | null>(null);
  const [pendingReject, setPendingReject] = useState<AdminComplaintItem | null>(null);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      const token = getAccessToken();
      if (!token) return;
      try {
        const apiStatus: AdminComplaintStatus | undefined = tab === 'ALL' ? undefined : tab;
        const res = await fetchAdminComplaints(apiStatus, { accessToken: token });
        if (!controller.signal.aborted) setItems(res.complaints);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [getAccessToken, tab]);

  useEffect(() => {
    if (!selectedCase && !pendingReject) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pendingReject) setPendingReject(null);
      else setSelectedCase(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCase, pendingReject]);

  const handleVerify = async (id: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    try {
      await verifyComplaint(id, { accessToken: token });
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (selectedCase?.id === id) setSelectedCase(null);
    } catch {
      /* swallow — UI stays */
    }
  };

  const openRejectModal = (item: AdminComplaintItem, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setPendingReject(item);
  };

  const handleConfirmReject = async (reason: string) => {
    if (!pendingReject) return;
    const token = getAccessToken();
    if (!token) return;
    setRejecting(true);
    try {
      await rejectComplaint(pendingReject.id, reason, { accessToken: token });
      const id = pendingReject.id;
      setItems((prev) => prev.filter((it) => it.id !== id));
      setPendingReject(null);
      if (selectedCase?.id === id) setSelectedCase(null);
    } catch {
      /* swallow — modal stays open so admin can retry */
    } finally {
      setRejecting(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const title = it.title.toLowerCase();
      const author = (it.author?.displayName ?? '').toLowerCase();
      const broker = (it.broker?.displayName ?? '').toLowerCase();
      return (
        it.id.toLowerCase().includes(q) ||
        title.includes(q) ||
        author.includes(q) ||
        broker.includes(q)
      );
    });
  }, [items, search]);

  const tabs: TabKey[] = ['OPEN', 'VERIFIED', 'REJECTED', 'ALL'];

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('complaintsTitle')}</h1>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm">
          <Search size={16} className="shrink-0 text-white/40" />
          <input
            type="text"
            placeholder={t('searchComplaintPlaceholder')}
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
            {t(TAB_LABEL_KEYS[s])}
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
                  <th className="p-4 font-medium text-white/50">{t('thBrokerClaimed')}</th>
                  <th className="p-4 font-medium text-white/50">{t('thComplaintTitle')}</th>
                  <th className="p-4 font-medium text-white/50">{t('thComplaintStatus')}</th>
                  <th className="p-4 font-medium text-white/50">{t('thSubmittedDate')}</th>
                  <th className="p-4 text-right font-medium text-white/50">{t('thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-white/40">
                      {t('noComplaints')}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <ComplaintRow
                      key={`complaint-${item.id}`}
                      item={item}
                      onSelect={() => setSelectedCase(item)}
                      onVerify={(e) => void handleVerify(item.id, e)}
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
        <ComplaintDetailModal
          item={selectedCase}
          onClose={() => setSelectedCase(null)}
          onVerify={(e) => void handleVerify(selectedCase.id, e)}
          onReject={(e) => openRejectModal(selectedCase, e)}
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

function StatusBadge({ status }: { status: AdminComplaintStatus }): React.ReactNode {
  const t = useTranslations('admin');
  const styles: Record<AdminComplaintStatus, string> = {
    OPEN: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    VERIFIED: 'border-red-500/40 bg-red-500/15 text-red-300',
    REJECTED: 'border-white/10 bg-white/5 text-white/50',
  };
  const label =
    status === 'OPEN'
      ? t('complaintStatusOpen')
      : status === 'VERIFIED'
        ? t('complaintStatusVerified')
        : t('complaintStatusRejected');
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${styles[status]}`}>
      {label}
    </span>
  );
}

type RowProps = {
  item: AdminComplaintItem;
  onSelect: () => void;
  onVerify: (e: ReactMouseEvent) => void;
  onReject: (e: ReactMouseEvent) => void;
};

function ComplaintRow({ item, onSelect, onVerify, onReject }: RowProps): React.ReactNode {
  const t = useTranslations('admin');
  const locale = useLocale();
  const brokerName = item.broker
    ? localizedBrokerName(
        {
          slug: item.broker.slug,
          displayName: item.broker.displayName,
          displayNameZhHans: item.broker.displayNameZhHans,
          legalName: item.broker.legalName,
        },
        locale,
      )
    : '—';

  return (
    <tr className="group cursor-pointer transition-colors hover:bg-white/10" onClick={onSelect}>
      <td className="p-4 font-mono text-white/70 transition-colors group-hover:text-white">
        {item.id.slice(0, 8)}
      </td>
      <td className="p-4 font-medium">{brokerName}</td>
      <td className="max-w-md truncate p-4 text-white/80">{item.title}</td>
      <td className="p-4">
        <StatusBadge status={item.status} />
      </td>
      <td className="p-4 text-white/60">{new Date(item.createdAt).toLocaleDateString()}</td>
      <td className="p-4 text-right">
        {item.status === 'OPEN' ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onVerify}
              className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300 transition-colors hover:border-red-500/60 hover:bg-red-500/25"
            >
              <AlertTriangle size={14} /> {t('complaintVerifyButton')}
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1 rounded border border-white/10 bg-transparent px-3 py-1.5 text-xs font-bold text-white/60 transition-colors hover:border-white/30 hover:bg-white/10"
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

type DetailProps = {
  item: AdminComplaintItem;
  onClose: () => void;
  onVerify: (e: ReactMouseEvent) => void;
  onReject: (e: ReactMouseEvent) => void;
};

function ComplaintDetailModal({ item, onClose, onVerify, onReject }: DetailProps): React.ReactNode {
  const t = useTranslations('admin');
  const locale = useLocale();
  const brokerName = item.broker
    ? localizedBrokerName(
        {
          slug: item.broker.slug,
          displayName: item.broker.displayName,
          displayNameZhHans: item.broker.displayNameZhHans,
          legalName: item.broker.legalName,
        },
        locale,
      )
    : '—';
  const evidenceUrl = `${PINATA_GATEWAY}${item.evidenceIpfsCid}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="animate-in zoom-in-95 relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121418] shadow-2xl duration-200">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
          <h2 className="flex items-center gap-3 text-lg font-bold">
            {t('complaintModalTitle')}
            <span className="rounded border border-white/5 bg-black/30 px-2 py-0.5 font-mono text-sm text-white/50">
              {item.id.slice(0, 8)}
            </span>
            <StatusBadge status={item.status} />
          </h2>
          <button
            onClick={onClose}
            aria-label={t('closeModal')}
            className="flex size-8 items-center justify-center rounded-full bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-blue-400">
              {t('targetBroker')}
            </h3>
            <p className="text-xl font-bold">{brokerName}</p>
            {item.broker?.slug && (
              <p className="mt-0.5 truncate font-mono text-[10px] text-white/40">
                {item.broker.slug}
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">
              {t('complaintTitle')}
            </h3>
            <p className="rounded-lg border border-white/10 bg-black/40 p-3 text-base font-bold text-white/90">
              {item.title}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">
              {t('complaintBody')}
            </h3>
            <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-sm leading-relaxed text-white/80">
              {item.body}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">
              {t('complaintEvidence')}
            </h3>
            <a
              href={evidenceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-blue-400 transition-colors hover:border-white/20 hover:text-blue-300"
            >
              <span className="truncate font-mono text-xs">{item.evidenceIpfsCid}</span>
              <span className="flex shrink-0 items-center gap-1">
                <ExternalLink size={14} /> {t('openInNewTab')}
              </span>
            </a>
          </div>

          {item.adminNote && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-red-400">
                {t('adminNoteLabel')}
              </h3>
              <p className="whitespace-pre-wrap rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200/80">
                {item.adminNote}
              </p>
            </div>
          )}
        </div>

        {item.status === 'OPEN' && (
          <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-white/5 px-6 py-4">
            <button
              onClick={onReject}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-bold text-white/60 transition-colors hover:border-white/30 hover:bg-white/10"
            >
              <XCircle size={16} /> {t('reject')}
            </button>
            <button
              onClick={onVerify}
              className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-red-600"
            >
              <CheckCircle size={16} /> {t('complaintVerifyButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
