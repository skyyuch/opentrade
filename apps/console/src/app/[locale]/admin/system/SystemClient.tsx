'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { apiGet, fetchAdminStats } from '../../../../lib/api/client';

type HealthResponse = {
  status: string;
  uptime: number;
  db: { status: string };
};

export function SystemClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [pendingOutbox, setPendingOutbox] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const [h, stats] = await Promise.all([
          apiGet<HealthResponse>('/v1/health', { accessToken: token }),
          fetchAdminStats({ accessToken: token }),
        ]);
        setHealth(h);
        setPendingOutbox(stats.stats.pendingApprovals);
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('system')}</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          label="API Status"
          value={health?.status ?? 'Unknown'}
          ok={health?.status === 'ok'}
        />
        <StatusCard
          label="Database"
          value={health?.db?.status ?? 'Unknown'}
          ok={health?.db?.status === 'ok'}
        />
        <StatusCard label="Uptime" value={health ? formatUptime(health.uptime) : '—'} ok={true} />
        <StatusCard
          label="Pending Outbox"
          value={pendingOutbox !== null ? String(pendingOutbox) : '—'}
          ok={pendingOutbox !== null && pendingOutbox < 10}
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Contract Addresses
        </h2>
        <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
          <ContractRow label="ReviewRegistry" envKey="NEXT_PUBLIC_REVIEW_REGISTRY_ADDRESS" />
          <ContractRow label="SoulboundToken" envKey="NEXT_PUBLIC_SBT_ADDRESS" />
          <ContractRow label="JuryPool" envKey="NEXT_PUBLIC_JURY_POOL_ADDRESS" />
        </div>
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}): React.ReactNode {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      <div
        className={`mt-2 inline-block size-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
      />
    </div>
  );
}

function ContractRow({ label, envKey }: { label: string; envKey: string }): React.ReactNode {
  const value =
    typeof window !== 'undefined'
      ? (process.env[envKey] ?? 'configured via env')
      : 'configured via env';
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
