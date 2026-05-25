'use client';

import { CheckCircle2, Shield, User } from 'lucide-react';
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
      const token = getAccessToken();
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
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-white/50">{t('notLoggedIn')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

      {/* Section 1: Basic Info */}
      <div className="bg-black/40 border border-white/5 rounded-2xl p-8 backdrop-blur-xl">
        <h2 className="text-xl font-bold mb-6">{t('accountInfo')}</h2>
        <div className="space-y-5 max-w-lg">
          <div>
            <label className="block text-sm text-white/50 mb-2">{t('displayName')}</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-[#00FF88]"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2">{t('email')}</label>
            <div className="w-full bg-black/50 border border-white/5 text-white/50 rounded-lg p-3 cursor-not-allowed">
              {user.email ?? '—'}
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2">{t('preferredLocale')}</label>
            <select
              className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-[#00FF88]"
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
            className="px-6 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      {/* Section 2: Decentralized Identity */}
      <div className="bg-black/40 border border-white/5 rounded-2xl p-8 backdrop-blur-xl">
        <h2 className="text-xl font-bold mb-6">{t('decentralizedIdentity')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Wallet card */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="bg-blue-500/20 text-blue-400 rounded p-2 w-fit mb-4">
              <User size={20} />
            </div>
            <div className="text-sm font-mono text-white/80 mb-3 break-all">
              {user.walletAddress ?? '—'}
            </div>
            <span className="px-3 py-1 bg-white/10 rounded text-xs font-bold">{user.role}</span>
          </div>

          {/* SBT card */}
          <div className="bg-gradient-to-br from-[#00FF88]/5 to-transparent border border-[#00FF88]/20 rounded-xl p-6">
            <div className="bg-[#00FF88]/20 text-[#00FF88] rounded p-2 w-fit mb-4">
              <Shield size={20} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} className="text-[#00FF88]" />
              <span className="font-bold">{user.sbtTier}</span>
            </div>
            <p className="text-xs text-white/50 mt-4 leading-relaxed">{t('sbtDescription')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
