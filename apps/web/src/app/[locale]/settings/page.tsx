'use client';

import { usePrivy } from '@privy-io/react-auth';
import { CheckCircle2, Bell, EyeOff, KeyRound, Save, ShieldCheck, User } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { localizedBrokerName } from '@opentrade/shared';

import { useLoginRedirect } from '../../../hooks/useLoginRedirect';
import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { Link } from '../../../i18n/navigation';
import { fetchMyProfile, fetchVerificationStatus, updateMyProfile } from '../../../lib/api/client';

import type {
  NotificationPrefs,
  PrivacyPrefs,
  UserProfile,
  VerifiedBrokerEntry,
} from '../../../lib/api/client';
import type { FormEvent, ReactNode } from 'react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  signals: true,
  arbitration: true,
  mentions: true,
  newsletter: false,
};

const DEFAULT_PRIVACY: PrivacyPrefs = {
  publicProfile: true,
  showWallet: true,
  showSbtLevel: true,
};

export default function SettingsPage(): ReactNode {
  const t = useTranslations('settings');
  const { authenticated } = usePrivy();
  const goLogin = useLoginRedirect();
  const { getAccessToken } = useOpenTradeAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [verifiedBrokers, setVerifiedBrokers] = useState<VerifiedBrokerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [preferredLocale, setPreferredLocale] = useState('');
  const [notifications, setNotifications] = useState<NotificationPrefs>(DEFAULT_NOTIFICATIONS);
  const [privacy, setPrivacy] = useState<PrivacyPrefs>(DEFAULT_PRIVACY);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }

    /* eslint-disable @typescript-eslint/no-unnecessary-condition */
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      try {
        const [profileRes, statusRes] = await Promise.all([
          fetchMyProfile({ accessToken: token }).catch(() => null),
          fetchVerificationStatus({ accessToken: token }).catch(() => null),
        ]);
        if (cancelled) return;
        if (profileRes) {
          setProfile(profileRes.user);
          setDisplayName(profileRes.user.displayName ?? '');
          setPreferredLocale(profileRes.user.preferredLocale ?? 'zh-Hant');
          if (profileRes.user.notificationPrefs) {
            setNotifications(profileRes.user.notificationPrefs);
          }
          if (profileRes.user.privacyPrefs) {
            setPrivacy(profileRes.user.privacyPrefs);
          }
        }
        if (statusRes) {
          setVerifiedBrokers(statusRes.verifiedBrokers);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
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
            notificationPrefs: notifications,
            privacyPrefs: privacy,
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
    [getAccessToken, displayName, preferredLocale, notifications, privacy],
  );

  if (!authenticated) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-4 text-white/60">{t('loginRequired')}</p>
        <button
          type="button"
          onClick={goLogin}
          className="rounded-lg bg-[#00FF88] px-6 py-2.5 text-sm font-bold text-black transition-colors hover:bg-[#00d170]"
        >
          {t('loginButton')}
        </button>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl animate-in fade-in px-6 py-12">
      <form onSubmit={(e) => void handleSave(e)}>
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <button
            type="submit"
            disabled={saveState === 'saving'}
            className="flex items-center gap-2 rounded-lg bg-[#00FF88] px-6 py-2.5 font-bold text-black transition-colors hover:bg-[#00d170] disabled:opacity-50"
          >
            {saveState === 'saving' ? (
              <div className="size-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <Save size={18} />
            )}
            {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('save')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column: Identity + Privacy */}
          <div className="space-y-8 lg:col-span-2">
            <IdentitySection
              profile={profile}
              displayName={displayName}
              preferredLocale={preferredLocale}
              onDisplayNameChange={setDisplayName}
              onLocaleChange={setPreferredLocale}
            />
            <PrivacySection privacy={privacy} onChange={setPrivacy} />
          </div>

          {/* Right column: Notifications + API Keys */}
          <div className="space-y-8">
            <NotificationsSection notifications={notifications} onChange={setNotifications} />
            <ApiKeysSection />
          </div>
        </div>
      </form>

      <VerifiedBrokersSection brokers={verifiedBrokers} />
    </main>
  );
}

function IdentitySection({
  profile,
  displayName,
  preferredLocale,
  onDisplayNameChange,
  onLocaleChange,
}: {
  profile: UserProfile | null;
  displayName: string;
  preferredLocale: string;
  onDisplayNameChange: (v: string) => void;
  onLocaleChange: (v: string) => void;
}): ReactNode {
  const t = useTranslations('settings');

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 p-8 backdrop-blur-xl">
      <h2 className="mb-6 flex items-center gap-2 text-xl font-bold">
        <User size={20} className="text-[#00FF88]" />
        {t('identityTitle')}
      </h2>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Wallet card */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="mb-1 text-sm text-white/50">{t('walletAddress')}</div>
          <div className="mb-3 font-mono text-lg">{profile?.walletAddress ?? '—'}</div>
          <div className="flex gap-2">
            <span className="rounded border border-[#00FF88]/20 bg-[#00FF88]/10 px-2.5 py-1 text-[10px] font-bold uppercase text-[#00FF88]">
              {t('walletConnected')}
            </span>
            <span className="rounded bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase text-white/70">
              {profile?.role ?? 'USER'}
            </span>
          </div>
        </div>

        {/* SBT tier card */}
        <div className="relative rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-6">
          <div className="mb-1 text-sm text-blue-400">{t('sbtTier')}</div>
          <div className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
            {profile?.sbtTier === 'L2' ? t('sbtTierL2') : t('sbtTierL1')}
            {profile?.sbtTier === 'L2' && <CheckCircle2 size={18} className="text-[#00FF88]" />}
          </div>
          <div className="text-xs leading-relaxed text-white/50">{t('sbtTierDesc')}</div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-white/50">{t('displayName')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder={t('displayNamePlaceholder')}
              maxLength={100}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white focus:border-[#00FF88] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-white/50">
              {t('preferredLocale')}
            </label>
            <select
              value={preferredLocale}
              onChange={(e) => onLocaleChange(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white focus:border-[#00FF88] focus:outline-none"
            >
              <option value="zh-Hant">{t('localeZhHant')}</option>
              <option value="zh-Hans">{t('localeZhHans')}</option>
              <option value="en">{t('localeEn')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-white/50">{t('emailLabel')}</label>
          <div className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-white/40">
            {profile?.email ?? '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacySection({
  privacy,
  onChange,
}: {
  privacy: PrivacyPrefs;
  onChange: (p: PrivacyPrefs) => void;
}): ReactNode {
  const t = useTranslations('settings');

  const options = [
    {
      id: 'publicProfile' as const,
      label: t('privacyPublicProfile'),
      desc: t('privacyPublicProfileDesc'),
    },
    { id: 'showWallet' as const, label: t('privacyShowWallet'), desc: t('privacyShowWalletDesc') },
    { id: 'showSbtLevel' as const, label: t('privacyShowSbt'), desc: t('privacyShowSbtDesc') },
  ];

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 p-8 backdrop-blur-xl">
      <h2 className="mb-6 flex items-center gap-2 text-xl font-bold">
        <EyeOff size={20} className="text-[#00FF88]" />
        {t('privacyTitle')}
      </h2>
      <div className="space-y-4">
        {options.map((opt) => (
          <div
            key={opt.id}
            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4"
          >
            <div>
              <div className="mb-1 font-bold text-white">{opt.label}</div>
              <div className="text-xs text-white/40">{opt.desc}</div>
            </div>
            <ToggleSwitch
              checked={privacy[opt.id]}
              onChange={() => onChange({ ...privacy, [opt.id]: !privacy[opt.id] })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsSection({
  notifications,
  onChange,
}: {
  notifications: NotificationPrefs;
  onChange: (n: NotificationPrefs) => void;
}): ReactNode {
  const t = useTranslations('settings');

  const options = [
    { id: 'signals' as const, label: t('notifSignals') },
    { id: 'arbitration' as const, label: t('notifArbitration') },
    { id: 'mentions' as const, label: t('notifMentions') },
    { id: 'newsletter' as const, label: t('notifNewsletter') },
  ];

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 p-8 backdrop-blur-xl">
      <h2 className="mb-6 flex items-center gap-2 text-xl font-bold">
        <Bell size={20} className="text-[#00FF88]" />
        {t('notifTitle')}
      </h2>
      <div className="space-y-4">
        {options.map((opt) => (
          <div key={opt.id} className="flex items-center justify-between text-sm">
            <span className="font-medium text-white/80">{opt.label}</span>
            <ToggleSwitch
              checked={notifications[opt.id]}
              onChange={() => onChange({ ...notifications, [opt.id]: !notifications[opt.id] })}
              size="sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiKeysSection(): ReactNode {
  const t = useTranslations('settings');

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 p-8 backdrop-blur-xl">
      <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
        <KeyRound size={20} className="text-[#00FF88]" />
        {t('apiKeysTitle')}
      </h2>
      <p className="mb-6 text-xs text-white/40">{t('apiKeysDesc')}</p>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
        <KeyRound size={28} className="mb-3 text-white/20" />
        <p className="text-sm font-medium text-white/40">{t('apiKeysComingSoon')}</p>
        <p className="mt-1 text-xs text-white/25">{t('apiKeysComingSoonDesc')}</p>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  size = 'md',
}: {
  checked: boolean;
  onChange: () => void;
  size?: 'sm' | 'md';
}): ReactNode {
  const dims = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const dot =
    size === 'sm'
      ? 'after:h-4 after:w-4 after:top-[2px] after:left-[2px]'
      : 'after:h-5 after:w-5 after:top-[2px] after:left-[2px]';

  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <div
        className={`${dims} rounded-full bg-white/20 peer-checked:bg-[#00FF88] peer-focus:outline-none ${dot} after:absolute after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white`}
      />
    </label>
  );
}

function VerifiedBrokersSection({ brokers }: { brokers: VerifiedBrokerEntry[] }): ReactNode {
  const t = useTranslations('settings');
  const formatter = useFormatter();
  const locale = useLocale();

  return (
    <section className="mt-10 rounded-2xl border border-white/5 bg-black/40 p-8 backdrop-blur-xl">
      <header className="mb-4 flex items-center gap-3">
        <ShieldCheck className="size-5 text-[#00FF88]" aria-hidden />
        <div>
          <h2 className="text-base font-semibold tracking-tight">{t('verifiedBrokersTitle')}</h2>
          {brokers.length > 0 && (
            <p className="text-xs text-white/50">
              {t('verifiedBrokersSubtitle', { count: brokers.length })}
            </p>
          )}
        </div>
      </header>

      {brokers.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-white/50">{t('verifiedBrokersEmpty')}</p>
          <Link
            href="/verify"
            className="inline-flex items-center gap-2 rounded-lg bg-[#00FF88] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-[#00d170]"
          >
            {t('verifyStartCta')}
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {brokers.map((b) => (
              <li
                key={b.brokerSlug}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[#00FF88]" aria-hidden />
                  <span className="truncate text-sm">
                    {localizedBrokerName(
                      {
                        slug: b.brokerSlug,
                        displayName: b.displayName,
                        displayNameZhHans: b.displayNameZhHans,
                        legalName: b.legalName,
                      },
                      locale,
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-white/40">
                  {t('verifiedAtLabel')} ·{' '}
                  {formatter.dateTime(new Date(b.approvedAt), {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/verify"
            className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[#00FF88] hover:underline"
          >
            {t('verifyAddBroker')} →
          </Link>
        </>
      )}
    </section>
  );
}
