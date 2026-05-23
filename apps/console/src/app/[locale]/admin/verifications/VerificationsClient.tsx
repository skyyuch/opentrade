'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import {
  fetchAdminVerifications,
  approveVerification,
  rejectVerification,
} from '../../../../lib/api/client';

import type { VerificationItem } from '../../../../lib/api/client';

type TabStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('verifications')}</h1>

      <div className="flex gap-2">
        {tabs.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No verifications found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Broker</th>
                <th className="px-3 py-2">SBT Tier</th>
                <th className="px-3 py-2">Commitment</th>
                <th className="px-3 py-2">Status</th>
                {tab === 'PENDING' && <th className="px-3 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id} className="border-b border-border">
                  <td className="px-3 py-2">{v.user.displayName ?? 'Anonymous'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{v.brokerSlug}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                      {v.user.sbtTier}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{v.commitment.slice(0, 10)}...</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={v.status} />
                  </td>
                  {tab === 'PENDING' && (
                    <td className="flex gap-2 px-3 py-2">
                      <button
                        onClick={() => void handleApprove(v.id)}
                        className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void handleReject(v.id)}
                        className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactNode {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-muted text-muted-foreground'}`}
    >
      {status}
    </span>
  );
}
