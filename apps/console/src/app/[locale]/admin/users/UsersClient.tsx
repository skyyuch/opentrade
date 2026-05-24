'use client';

import { MoreVertical, Plus, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import {
  createAdminUser,
  fetchAdminUserDetail,
  fetchAdminUsers,
  updateUserRole,
} from '../../../../lib/api/client';

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
  const [showCreate, setShowCreate] = useState(false);

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

  const handleCreated = () => {
    setShowCreate(false);
    void loadUsers();
  };

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">{t('usersTitle')}</h1>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-[#00FF88]/20 px-4 py-2 text-sm font-bold text-[#00FF88] transition-colors hover:bg-[#00FF88]/30"
          >
            <Plus size={16} />
            {t('addUser')}
          </button>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
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
            <option value="">{t('allRoles')}</option>
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
                  <th className="px-4 py-3">{t('thDisplayName')}</th>
                  <th className="px-4 py-3">{t('thEmail')}</th>
                  <th className="px-4 py-3">{t('thWallet')}</th>
                  <th className="px-4 py-3">{t('thRole')}</th>
                  <th className="px-4 py-3">{t('thSbt')}</th>
                  <th className="px-4 py-3">{t('thBrokers')}</th>
                  <th className="px-4 py-3">{t('thDate')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-white/40">
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <Fragment key={u.id}>
                      <tr
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
                        <td className="px-4 py-3">
                          <BrokerPills
                            brokers={u.verifiedBrokers}
                            emptyLabel={t('userBrokersNone')}
                          />
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
                        <tr className="border-b border-white/5">
                          <td colSpan={8} className="px-6 py-4">
                            <UserDetailPanel
                              detail={detail}
                              onRoleChange={(role) => void handleRoleChange(u.id, role)}
                              changeRoleLabel={t('changeRole')}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create User Modal
// ---------------------------------------------------------------------------

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [role, setRole] = useState<string>('USER');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setSaving(true);
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) return;
      await createAdminUser(
        {
          displayName: displayName.trim(),
          email: email.trim() || undefined,
          walletAddress: walletAddress.trim() || undefined,
          role,
        },
        { accessToken: token },
      );
      onCreated();
    } catch {
      setError(t('createError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0c10] p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>

        <h2 className="mb-2 text-xl font-bold">{t('addUserTitle')}</h2>
        <p className="mb-6 text-sm text-white/50">{t('addUserDesc')}</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-white/60">{t('fieldDisplayName')}</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-[#00FF88]/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-white/60">{t('fieldEmail')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:border-[#00FF88]/50 focus:outline-none"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-white/60">{t('fieldWallet')}</label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm focus:border-[#00FF88]/50 focus:outline-none"
              placeholder="0x..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-white/60">{t('fieldRole')}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={`create-role-${r}`} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !displayName.trim()}
              className="rounded-lg bg-[#00FF88]/20 px-6 py-2 text-sm font-bold text-[#00FF88] transition-colors hover:bg-[#00FF88]/30 disabled:opacity-50"
            >
              {saving ? t('creating') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UserDetailPanel({
  detail,
  onRoleChange,
  changeRoleLabel,
}: {
  detail: AdminUserDetailResponse;
  onRoleChange: (role: string) => void;
  changeRoleLabel: string;
}): React.ReactNode {
  const t = useTranslations('admin');
  const u = detail.user;
  return (
    <div className="space-y-3 rounded-xl bg-white/[0.03] p-4 text-sm">
      <div className="flex items-center gap-4">
        <span className="text-white/50">{changeRoleLabel}:</span>
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

      <div className="border-t border-white/5 pt-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">
          {t('userBrokersDetailTitle')}
        </div>
        {detail.verifiedBrokers.length === 0 ? (
          <p className="text-xs text-white/40">{t('userBrokersDetailEmpty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.verifiedBrokers.map((b) => (
              <li
                key={b.brokerSlug}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"
              >
                <span className="font-mono text-xs text-white/80">{b.brokerSlug}</span>
                <span className="text-[10px] text-white/40">
                  {new Date(b.approvedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Compact pill list for the table row. Shows up to two slugs and a +N
 * overflow tag so the row stays readable for power reviewers without
 * truncating the text. Empty state renders the configured `emptyLabel`
 * (typically the same em-dash used for missing email/wallet).
 */
function BrokerPills({
  brokers,
  emptyLabel,
}: {
  brokers: { brokerSlug: string; approvedAt: string }[];
  emptyLabel: string;
}): React.ReactNode {
  if (brokers.length === 0) {
    return <span className="text-white/30">{emptyLabel}</span>;
  }
  const VISIBLE = 2;
  const visible = brokers.slice(0, VISIBLE);
  const hidden = brokers.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((b) => (
        <span
          key={b.brokerSlug}
          className="rounded-full bg-[#00FF88]/15 px-2 py-0.5 font-mono text-[10px] text-[#00FF88]"
          title={b.brokerSlug}
        >
          {b.brokerSlug}
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/50">
          +{hidden}
        </span>
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
