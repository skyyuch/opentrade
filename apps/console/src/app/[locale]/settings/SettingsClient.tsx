'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { apiPatch } from '../../../lib/api/client';

export function SettingsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const { user, isLoading: userLoading, refresh } = useCurrentUser();
  const t = useTranslations('settings');

  const [displayName, setDisplayName] = useState('');
  const [preferredLocale, setPreferredLocale] = useState('zh-Hant');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? '');
    setPreferredLocale(user.preferredLocale ?? 'zh-Hant');
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await apiPatch('/v1/auth/me', { displayName, preferredLocale }, { accessToken: token });
      await refresh();
    } catch {
      // TODO: show error toast
    } finally {
      setSaving(false);
    }
  };

  if (userLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">{t('notLoggedIn')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      {/* Readonly info */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('accountInfo')}
        </h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
          <div>
            <span className="font-medium text-muted-foreground">{t('email')}:</span>{' '}
            {user.email ?? '—'}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">{t('wallet')}:</span>{' '}
            {user.walletAddress ?? '—'}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">{t('role')}:</span>
            <RoleBadge role={user.role} />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">{t('sbtTier')}:</span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">{user.sbtTier}</span>
          </div>
        </div>
      </section>

      {/* Editable fields */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('preferences')}
        </h2>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('displayName')}</label>
          <input
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('preferredLocale')}</label>
          <select
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            value={preferredLocale}
            onChange={(e) => setPreferredLocale(e.target.value)}
          >
            <option value="zh-Hant">繁體中文</option>
            <option value="zh-Hans">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </section>
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
      className={`rounded px-2 py-0.5 text-xs font-medium ${colors[role] ?? 'bg-muted text-muted-foreground'}`}
    >
      {role}
    </span>
  );
}
