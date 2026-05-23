'use client';

import { MoreVertical, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAdminUserDetail, fetchAdminUsers, updateUserRole } from '../../../../lib/api/client';

import type { AdminUserDetailResponse, AdminUserItem } from '../../../../lib/api/client';

const ROLES = ['USER', 'REVIEWER', 'JURY', 'ADMIN'] as const;

export function UsersClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const token = await getAccessToken();
    if (!token) return;
    try {
      const params: { search?: string; role?: string } = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await fetchAdminUsers(params, { accessToken: token });
      setUsers(res.users);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, search, roleFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetchAdminUserDetail(id, { accessToken: token });
      setDetail(res);
    } catch {
      setDetail(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const token = await getAccessToken();
    if (!token) return;
    await updateUserRole(userId, newRole, { accessToken: token });
    void loadUsers();
  };

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">{t('users')}</h1>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm focus:border-[#00FF88]/50 focus:outline-none"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm focus:outline-none"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={`role-${r}`} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
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
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">SBT</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-white/40">
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <>
                      <tr
                        key={`user-${u.id}`}
                        className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                        onClick={() => void handleExpand(u.id)}
                      >
                        <td className="px-4 py-3 font-bold">{u.displayName ?? '—'}</td>
                        <td className="px-4 py-3 text-white/60">
                          {u.email ? maskEmail(u.email) : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-400">
                          {u.walletAddress ? shortenAddress(u.walletAddress) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-4 py-3">
                          <SbtBadge tier={u.sbtTier} />
                        </td>
                        <td className="px-4 py-3 text-white/60">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white">
                            <MoreVertical size={16} />
                          </button>
                        </td>
                      </tr>
                      {expandedId === u.id && detail && (
                        <tr key={`detail-${u.id}`} className="border-b border-white/5">
                          <td colSpan={7} className="px-6 py-4">
                            <UserDetailPanel
                              detail={detail}
                              onRoleChange={(role) => void handleRoleChange(u.id, role)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
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

function UserDetailPanel({
  detail,
  onRoleChange,
}: {
  detail: AdminUserDetailResponse;
  onRoleChange: (role: string) => void;
}): React.ReactNode {
  const u = detail.user;
  return (
    <div className="space-y-3 rounded-xl bg-white/[0.03] p-4 text-sm">
      <div className="flex items-center gap-4">
        <span className="text-white/50">Change role:</span>
        <select
          value={u.role}
          onChange={(e) => onRoleChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs focus:outline-none"
        >
          {ROLES.map((r) => (
            <option key={`select-${r}`} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="text-white/50">Reviews: </span>
        {detail.reviews.length}
      </div>
      <div>
        <span className="text-white/50">Verifications: </span>
        {detail.verifications.length}
      </div>
      <div>
        <span className="text-white/50">Claims: </span>
        {detail.claims.length}
      </div>
      {u.sbtTokenId !== null && (
        <div>
          <span className="text-white/50">SBT Token ID: </span>
          <span className="font-mono text-[#00FF88]">{u.sbtTokenId}</span>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }): React.ReactNode {
  const colors: Record<string, string> = {
    ADMIN: 'bg-purple-500/20 text-purple-400',
    JURY: 'bg-blue-500/20 text-blue-400',
    REVIEWER: 'bg-blue-500/20 text-blue-400',
    USER: 'bg-white/10 text-white/70',
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors[role] ?? 'bg-white/10 text-white/70'}`}
    >
      {role}
    </span>
  );
}

function SbtBadge({ tier }: { tier: string }): React.ReactNode {
  if (!tier || tier === 'NONE') {
    return (
      <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/30">
        NONE
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#00FF88]/20 px-2.5 py-1 text-xs font-bold text-[#00FF88]">
      {tier}
    </span>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
