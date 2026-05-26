'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import {
  approveKol,
  fetchAdminKolDetail,
  fetchAdminKols,
  rejectKol,
  suspendKol,
} from '../../../../lib/api/client';

import type {
  AdminKolDetailResponse,
  AdminKolItem,
  FetchOptions,
  KolStatus,
} from '../../../../lib/api/client';
import type { MouseEvent as ReactMouseEvent } from 'react';

type TabKey = KolStatus | 'ALL';

const TABS: TabKey[] = ['PENDING', 'APPROVED', 'UNCLAIMED', 'SUSPENDED', 'REJECTED', 'ALL'];

const REJECT_MIN = 5;
const REJECT_MAX = 500;

export function KolsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('adminKols');
  const [tab, setTab] = useState<TabKey>('PENDING');
  const [items, setItems] = useState<AdminKolItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedKol, setSelectedKol] = useState<
    (AdminKolDetailResponse & { item: AdminKolItem }) | null
  >(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingReject, setPendingReject] = useState<AdminKolItem | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadKols = useCallback(
    async (status: TabKey, signal?: AbortSignal) => {
      setLoading(true);
      const token = getAccessToken();
      if (!token) return;
      try {
        const apiStatus: KolStatus | undefined = status === 'ALL' ? undefined : status;
        const params: { status?: KolStatus; limit?: number; offset?: number } = {};
        if (apiStatus !== undefined) params.status = apiStatus;
        const opts: FetchOptions = { accessToken: token };
        if (signal) opts.signal = signal;
        const res = await fetchAdminKols(params, opts);
        setItems(res.kols);
        setTotal(res.total);
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadKols(tab, controller.signal);
    return () => controller.abort();
  }, [loadKols, tab]);

  useEffect(() => {
    if (!selectedKol && !pendingReject) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pendingReject) setPendingReject(null);
      else setSelectedKol(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedKol, pendingReject]);

  const handleSelectKol = async (item: AdminKolItem) => {
    const token = getAccessToken();
    if (!token) return;
    setDetailLoading(true);
    try {
      const detail = await fetchAdminKolDetail(item.id, { accessToken: token });
      setSelectedKol({ ...detail, item });
    } catch {
      /* stay on list */
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (id: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    setActionLoading(true);
    try {
      await approveKol(id, { accessToken: token });
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (selectedKol?.item.id === id) setSelectedKol(null);
    } catch {
      /* swallow */
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!pendingReject) return;
    const note = rejectNote.trim();
    if (note.length < REJECT_MIN || note.length > REJECT_MAX) return;
    const token = getAccessToken();
    if (!token) return;
    setActionLoading(true);
    try {
      await rejectKol(pendingReject.id, note, { accessToken: token });
      setItems((prev) => prev.filter((it) => it.id !== pendingReject.id));
      if (selectedKol?.item.id === pendingReject.id) setSelectedKol(null);
      setPendingReject(null);
      setRejectNote('');
    } catch {
      /* swallow */
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (id: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    const token = getAccessToken();
    if (!token) return;
    setActionLoading(true);
    try {
      await suspendKol(id, { accessToken: token });
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (selectedKol?.item.id === id) setSelectedKol(null);
    } catch {
      /* swallow */
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (item: AdminKolItem, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setPendingReject(item);
    setRejectNote('');
  };

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-t px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-b-2 border-[#00FF88] text-[#00FF88]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            {t(`tab${key.charAt(0) + key.slice(1).toLowerCase()}`)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-white/40">{t('noKols')}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-white/40">{t('totalCount', { count: total })}</p>
          {items.map((kol) => (
            <div
              key={kol.id}
              role="button"
              tabIndex={0}
              onClick={() => void handleSelectKol(kol)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSelectKol(kol);
              }}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{kol.displayName}</span>
                <span className="text-xs text-white/40">@{kol.slug}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${statusColor(kol.status)}`}
                >
                  {kol.status}
                </span>
                {kol.status === 'PENDING' && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => void handleApprove(kol.id, e)}
                      disabled={actionLoading}
                      className="rounded bg-[#00FF88]/20 px-3 py-1 text-xs font-bold text-[#00FF88] hover:bg-[#00FF88]/30 disabled:opacity-50"
                    >
                      {t('approve')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => openRejectModal(kol, e)}
                      disabled={actionLoading}
                      className="rounded bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                    >
                      {t('reject')}
                    </button>
                  </>
                )}
                {kol.status === 'APPROVED' && (
                  <button
                    type="button"
                    onClick={(e) => void handleSuspend(kol.id, e)}
                    disabled={actionLoading}
                    className="rounded bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-400 hover:bg-orange-500/30 disabled:opacity-50"
                  >
                    {t('suspend')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedKol && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedKol(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl border border-white/10 bg-[#0a0c10] p-6"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            {detailLoading ? (
              <div className="flex justify-center py-8">
                <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">{selectedKol.kol.displayName}</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedKol(null)}
                    className="text-white/40 hover:text-white"
                  >
                    &times;
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-white/40">{t('detailStatus')}:</span>{' '}
                    <span className={statusColor(selectedKol.kol.status)}>
                      {selectedKol.kol.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/40">{t('detailSignals')}:</span>{' '}
                    {selectedKol.signalCount}
                  </div>
                  <div>
                    <span className="text-white/40">{t('detailFollowers')}:</span>{' '}
                    {selectedKol.followerCount}
                  </div>
                  <div>
                    <span className="text-white/40">{t('detailIamSmart')}:</span>{' '}
                    {selectedKol.kol.iamSmartVerified ? '✓' : '—'}
                  </div>
                </div>
                {selectedKol.kol.bio && (
                  <p className="text-sm text-white/60">{selectedKol.kol.bio}</p>
                )}
                {selectedKol.kol.socialLinks && (
                  <div className="flex gap-3 text-xs text-white/40">
                    {selectedKol.kol.socialLinks.youtube && <span>YouTube</span>}
                    {selectedKol.kol.socialLinks.twitter && <span>Twitter</span>}
                    {selectedKol.kol.socialLinks.instagram && <span>Instagram</span>}
                  </div>
                )}
                {selectedKol.kol.credentials && selectedKol.kol.credentials.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedKol.kol.credentials.map((c, i) => (
                      <span
                        key={i}
                        className={`rounded px-2 py-0.5 text-xs ${c.verified ? 'bg-[#00FF88]/20 text-[#00FF88]' : 'bg-white/10 text-white/60'}`}
                      >
                        {c.type}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  {selectedKol.kol.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => void handleApprove(selectedKol.kol.id, e)}
                        disabled={actionLoading}
                        className="rounded bg-[#00FF88] px-4 py-2 text-sm font-bold text-[#050608] hover:bg-[#00FF88]/90 disabled:opacity-50"
                      >
                        {t('approve')}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openRejectModal(selectedKol.item, e)}
                        disabled={actionLoading}
                        className="rounded border border-red-500/30 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {t('reject')}
                      </button>
                    </>
                  )}
                  {selectedKol.kol.status === 'APPROVED' && (
                    <button
                      type="button"
                      onClick={(e) => void handleSuspend(selectedKol.kol.id, e)}
                      disabled={actionLoading}
                      className="rounded border border-orange-500/30 px-4 py-2 text-sm font-bold text-orange-400 hover:bg-orange-500/10 disabled:opacity-50"
                    >
                      {t('suspend')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {pendingReject && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingReject(null)}
        >
          <div
            className="relative w-full max-w-md rounded-xl border border-white/10 bg-[#0a0c10] p-6"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <h3 className="mb-4 text-lg font-bold">
              {t('rejectTitle', { name: pendingReject.displayName })}
            </h3>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={t('rejectPlaceholder')}
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#00FF88]/50"
            />
            <p className="mt-1 text-xs text-white/30">
              {rejectNote.trim().length}/{REJECT_MAX}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingReject(null)}
                className="rounded border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={
                  actionLoading ||
                  rejectNote.trim().length < REJECT_MIN ||
                  rejectNote.trim().length > REJECT_MAX
                }
                className="rounded bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {t('confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function statusColor(status: KolStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-[#00FF88]/20 text-[#00FF88]';
    case 'PENDING':
      return 'bg-amber-500/20 text-amber-400';
    case 'UNCLAIMED':
      return 'bg-blue-500/20 text-blue-400';
    case 'SUSPENDED':
      return 'bg-orange-500/20 text-orange-400';
    case 'REJECTED':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-white/10 text-white/60';
  }
}
