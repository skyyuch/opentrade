'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { fetchMyProfile, updateMyProfile } from '../../../lib/api/client';

import type { UserProfile } from '../../../lib/api/client';
import type { FormEvent, ReactNode } from 'react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage(): ReactNode {
  const t = useTranslations('settings');
  const { authenticated, login } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [preferredLocale, setPreferredLocale] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      try {
        const res = await fetchMyProfile({ accessToken: token });
        if (!cancelled) {
          setProfile(res.user);
          setDisplayName(res.user.displayName ?? '');
          setPreferredLocale(res.user.preferredLocale ?? 'zh-Hant');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  const handleSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSaveState('saving');
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await updateMyProfile(
          {
            ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
            ...(preferredLocale ? { preferredLocale } : {}),
          },
          { accessToken: token },
        );
        setProfile(res.user);
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } catch {
        setSaveState('error');
      }
    },
    [getAccessToken, displayName, preferredLocale],
  );

  if (!authenticated) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">{t('loginRequired')}</p>
        <button
          type="button"
          onClick={() => void login()}
          className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Log in
        </button>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Settings className="size-6 text-muted-foreground" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('displayName')}</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('displayNamePlaceholder')}
            maxLength={100}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('preferredLocale')}</span>
          <select
            value={preferredLocale}
            onChange={(e) => setPreferredLocale(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="zh-Hant">{t('localeZhHant')}</option>
            <option value="zh-Hans">{t('localeZhHans')}</option>
            <option value="en">{t('localeEn')}</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={saveState === 'saving'}
          className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('save')}
        </button>
      </form>

      {profile ? (
        <div className="mt-10 space-y-3 rounded-lg border border-border bg-muted/30 p-5">
          <InfoRow label={t('email')} value={profile.email ?? '—'} />
          <InfoRow label={t('walletAddress')} value={profile.walletAddress ?? '—'} />
          <InfoRow label={t('sbtTier')} value={profile.sbtTier} />
          <InfoRow label={t('role')} value={profile.role} />
          <InfoRow
            label={t('memberSince')}
            value={new Date(profile.createdAt).toLocaleDateString()}
          />
        </div>
      ) : null}
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  );
}
