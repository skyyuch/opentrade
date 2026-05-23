'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import {
  approveVerification,
  fetchAdminVerifications,
  rejectVerification,
} from '../../../../lib/api/client';

import type { VerificationItem } from '../../../../lib/api/client';

type TabStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const TAB_KEYS: Record<TabStatus, string> = {
  PENDING: 'tabPending',
  APPROVED: 'tabApproved',
  REJECTED: 'tabRejected',
};

export function VerificationsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [tab, setTab] = useState<TabStatus>('PENDING');
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      try {
        const res = await fetchAdminVerifications(tab, { accessToken: token });
        setItems(res.verifications);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken, tab]);

  const handleApprove = async (id: string) => {
    const token = await getAccessToken();
    if (!token) return;
    await approveVerification(id, undefined, { accessToken: token });
    setItems((prev) => prev.filter((v) => v.id !== id));
  };

  const handleReject = async (id: string) => {
    const token = await getAccessToken();
    if (!token) return;
    await rejectVerification(id, undefined, { accessToken: token });
    setItems((prev) => prev.filter((v) => v.id !== id));
  };

  const tabs: TabStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <h1 className="text-2xl font-bold">{t('verificationsTitle')}</h1>

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
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-black/40 text-left text-xs uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3">{t('thUser')}</th>
                  <th className="px-4 py-3">{t('thBroker')}</th>
                  <th className="px-4 py-3">{t('thSbtTier')}</th>
                  <th className="px-4 py-3">{t('thCommitment')}</th>
                  <th className="px-4 py-3">{t('thStatus')}</th>
                  {tab === 'PENDING' && <th className="px-4 py-3">{t('thActions')}</th>}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-white/40">
                      {t('noVerifications')}
                    </td>
                  </tr>
                ) : (
                  items.map((v) => (
                    <tr
                      key={`verification-${v.id}`}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-bold">{v.user.displayName ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{v.brokerSlug}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-[#00FF88]/20 px-2.5 py-1 text-xs font-bold text-[#00FF88]">
                          {v.user.sbtTier}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {v.commitment.slice(0, 10)}...
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={v.status} />
                      </td>
                      {tab === 'PENDING' && (
                        <td className="flex gap-2 px-4 py-3">
                          <button
                            onClick={() => void handleApprove(v.id)}
                            className="rounded bg-[#00FF88]/20 px-3 py-1.5 text-xs font-bold text-[#00FF88] transition-colors hover:bg-[#00FF88]/30"
                          >
                            {t('approve')}
                          </button>
                          <button
                            onClick={() => void handleReject(v.id)}
                            className="rounded bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/30"
                          >
                            {t('reject')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactNode {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400',
    APPROVED: 'bg-[#00FF88]/20 text-[#00FF88]',
    REJECTED: 'bg-red-500/20 text-red-400',
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors[status] ?? 'bg-white/10 text-white/50'}`}
    >
      {status}
    </span>
  );
}
