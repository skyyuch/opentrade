'use client';

import { Database, Link2, Server } from 'lucide-react';
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
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <h1 className="text-2xl font-bold">{t('system')}</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* API Status */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Server size={20} className="text-[#00FF88]" />
            <h2 className="text-lg font-bold">API 服務狀態</h2>
          </div>
          <div className="space-y-3">
            <StatusRow
              label="API"
              value={health?.status ?? 'Unknown'}
              ok={health?.status === 'ok'}
            />
            <StatusRow label="Uptime" value={health ? formatUptime(health.uptime) : '—'} ok />
            <StatusRow
              label="Pending Outbox"
              value={pendingOutbox !== null ? String(pendingOutbox) : '—'}
              ok={pendingOutbox !== null && pendingOutbox < 10}
            />
          </div>
        </div>

        {/* Database */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Database size={20} className="text-blue-400" />
            <h2 className="text-lg font-bold">資料庫連接狀態</h2>
          </div>
          <div className="space-y-3">
            <StatusRow
              label="Database"
              value={health?.db?.status ?? 'Unknown'}
              ok={health?.db?.status === 'ok'}
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Provider</span>
              <span className="font-mono text-xs">PostgreSQL (RDS)</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Region</span>
              <span className="font-mono text-xs">ap-southeast-1</span>
            </div>
          </div>
        </div>

        {/* Contract Addresses - full width */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <Link2 size={20} className="text-purple-400" />
            <h2 className="text-lg font-bold">鏈上合約資訊</h2>
          </div>
          <div className="space-y-3 rounded-lg bg-black/30 p-4">
            <ContractRow label="ReviewRegistry" envKey="NEXT_PUBLIC_REVIEW_REGISTRY_ADDRESS" />
            <ContractRow label="SoulboundToken" envKey="NEXT_PUBLIC_SBT_ADDRESS" />
            <ContractRow label="JuryPool" envKey="NEXT_PUBLIC_JURY_POOL_ADDRESS" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${ok ? 'bg-[#00FF88]' : 'bg-yellow-400'}`} />
        <span className="text-white/50">{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ContractRow({ label, envKey }: { label: string; envKey: string }): React.ReactNode {
  const value =
    typeof window !== 'undefined'
      ? (process.env[envKey] ?? 'configured via env')
      : 'configured via env';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="font-mono text-purple-400">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
