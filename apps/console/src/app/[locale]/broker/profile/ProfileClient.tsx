'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useCurrentUser } from '../../../../hooks/useCurrentUser';
import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchBroker, updateBrokerProfile } from '../../../../lib/api/client';

import type { BrokerDetail } from '../../../../lib/api/client';

export function ProfileClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const { claimedBroker, isLoading: userLoading } = useCurrentUser();
  const t = useTranslations('broker');

  const [broker, setBroker] = useState<BrokerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    if (userLoading || !claimedBroker) return;

    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const res = await fetchBroker(claimedBroker.slug, { accessToken: token });
        setBroker(res.broker);
        setDescription(res.broker.description ?? '');
        setLogoUrl(res.broker.logoUrl ?? '');
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken, claimedBroker, userLoading]);

  const handleSave = async () => {
    if (!claimedBroker) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await updateBrokerProfile(
        claimedBroker.slug,
        { description, logoUrl },
        { accessToken: token },
      );
      setBroker(res.broker);
    } catch {
      // TODO: show error toast
    } finally {
      setSaving(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
      </div>
    );
  }

  if (!claimedBroker || !broker) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-white/50">{t('noBrokerClaimed')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300">
      <h1 className="text-2xl font-bold">{t('profileTitle')}</h1>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden p-6 space-y-6">
        {/* Readonly fields from SFC */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/50 mb-2">{t('legalName')}</label>
            <div className="w-full bg-black/40 border border-white/5 text-white/70 rounded-lg p-3 cursor-not-allowed">
              {broker.legalName}
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2">{t('licenses')}</label>
            <div className="w-full bg-black/40 border border-white/5 text-white/70 rounded-lg p-3 cursor-not-allowed font-mono">
              {broker.licenses.map((l) => `${l.licenseNumber}`).join(', ')}
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/50 mb-2">{t('legalName')}</label>
            <div className="w-full bg-black/40 border border-white/5 text-white/70 rounded-lg p-3 cursor-not-allowed">
              {broker.legalName}
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-white/10 pt-6">
          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-white mb-2">{t('description')}</label>
              <textarea
                className="w-full h-32 bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500/50 resize-y"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-white mb-2">{t('logoUrl')}</label>
              <input
                className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500/50"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-white/5 flex justify-end mt-6">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-6 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
