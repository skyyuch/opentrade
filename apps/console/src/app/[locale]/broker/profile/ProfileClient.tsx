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
  const [websiteUrl, setWebsiteUrl] = useState('');

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
        setWebsiteUrl(res.broker.websiteUrl ?? '');
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
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!claimedBroker || !broker) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">{t('noBrokerClaimed')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('profileTitle')}</h1>

      {/* Readonly fields */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('brokerInfo')}
        </h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
          <div>
            <span className="font-medium text-muted-foreground">{t('legalName')}:</span>{' '}
            {broker.legalName}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">{t('licenses')}:</span>
            <ul className="ml-4 mt-1 list-disc text-xs">
              {broker.licenses.map((l, i) => (
                <li key={i}>
                  {l.regulator} — {l.licenseType} ({l.licenseNumber})
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Editable fields */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('editProfile')}
        </h2>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('description')}</label>
          <textarea
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('logoUrl')}</label>
          <input
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('websiteUrl')}</label>
          <input
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('websiteUrlNotEditable')}</p>
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
