'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAdminUsers, fetchAdminUserDetail, updateUserRole } from '../../../../lib/api/client';

import type { AdminUserItem, AdminUserDetailResponse } from '../../../../lib/api/client';

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
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('users')}</h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Wallet</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">SBT</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <>
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b border-border hover:bg-muted/50"
                    onClick={() => void handleExpand(u.id)}
                  >
                    <td className="px-3 py-2">{u.displayName ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {u.email ? maskEmail(u.email) : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.walletAddress ? shortenAddress(u.walletAddress) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                        {u.sbtTier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                  {expandedId === u.id && detail && (
                    <tr key={`${u.id}-detail`} className="border-b border-border bg-muted/30">
                      <td colSpan={6} className="px-6 py-4">
                        <UserDetailPanel
                          detail={detail}
                          onRoleChange={(role) => void handleRoleChange(u.id, role)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
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
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">Change role:</span>
        <select
          value={u.role}
          onChange={(e) => onRoleChange(e.target.value)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="text-muted-foreground">Reviews: </span>
        {detail.reviews.length}
      </div>
      <div>
        <span className="text-muted-foreground">Verifications: </span>
        {detail.verifications.length}
      </div>
      <div>
        <span className="text-muted-foreground">Claims: </span>
        {detail.claims.length}
      </div>
      {u.sbtTokenId !== null && (
        <div>
          <span className="text-muted-foreground">SBT Token ID: </span>
          {u.sbtTokenId}
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }): React.ReactNode {
  const colors: Record<string, string> = {
    ADMIN: 'bg-purple-100 text-purple-800',
    JURY: 'bg-blue-100 text-blue-800',
    REVIEWER: 'bg-green-100 text-green-800',
    USER: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] ?? 'bg-muted text-muted-foreground'}`}
    >
      {role}
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
