'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAdminClaims, approveClaim, rejectClaim } from '../../../../lib/api/client';

import type { ClaimItem } from '../../../../lib/api/client';

type TabStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export function ClaimsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [tab, setTab] = useState<TabStatus>('PENDING');
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      try {
        const res = await fetchAdminClaims(tab, { accessToken: token });
        setClaims(res.claims);
      } catch {
        setClaims([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken, tab]);

  const handleApprove = async (id: string) => {
    const token = await getAccessToken();
    if (!token) return;
    await approveClaim(id, undefined, { accessToken: token });
    setClaims((prev) => prev.filter((c) => c.id !== id));
  };

  const handleReject = async (id: string) => {
    const token = await getAccessToken();
    if (!token) return;
    await rejectClaim(id, undefined, { accessToken: token });
    setClaims((prev) => prev.filter((c) => c.id !== id));
  };

  const tabs: TabStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('claims')}</h1>

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
      ) : claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">No claims found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Broker</th>
                <th className="px-3 py-2">CE Ref</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Date</th>
                {tab === 'PENDING' && <th className="px-3 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-b border-border">
                  <td className="px-3 py-2">{claim.broker.displayName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{claim.ceRefNumber}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={claim.status} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(claim.createdAt).toLocaleDateString()}
                  </td>
                  {tab === 'PENDING' && (
                    <td className="flex gap-2 px-3 py-2">
                      <button
                        onClick={() => void handleApprove(claim.id)}
                        className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void handleReject(claim.id)}
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
