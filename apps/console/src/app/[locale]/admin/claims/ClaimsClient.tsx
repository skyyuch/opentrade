'use client';

import { ExternalLink } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { localizedBrokerName } from '@opentrade/shared';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { approveClaim, fetchAdminClaims, rejectClaim } from '../../../../lib/api/client';

import type { ClaimItem } from '../../../../lib/api/client';

type TabStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const TAB_KEYS: Record<TabStatus, string> = {
  PENDING: 'tabPending',
  APPROVED: 'tabApproved',
  REJECTED: 'tabRejected',
};

export function ClaimsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const locale = useLocale();
  const [tab, setTab] = useState<TabStatus>('PENDING');
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const token = getAccessToken();
      if (!token) return;
      try {
        const res = await fetchAdminClaims(tab, { accessToken: token });
        setClaims(res.claims);
      } catch {
        setClaims([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken, tab]);

  const handleApprove = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    await approveClaim(id, undefined, { accessToken: token });
    setClaims((prev) => prev.filter((c) => c.id !== id));
  };

  const handleReject = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    await rejectClaim(id, undefined, { accessToken: token });
    setClaims((prev) => prev.filter((c) => c.id !== id));
  };

  const tabs: TabStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <h1 className="text-2xl font-bold">{t('claimsTitle')}</h1>

      <div className="flex items-center gap-4 border-b border-white/10 pb-4">
        {tabs.map((s) => (
          <button
            key={`tab-${s}`}
            onClick={() => setTab(s)}
            className={`-mb-[17px] pb-4 font-bold ${
              tab === s
                ? 'border-b-2 border-[#00FF88] text-[#00FF88]'
                : 'text-white/50 hover:text-white'
            }`}
          >
            {t(TAB_KEYS[s])}
          </button>
        ))}
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
                  <th className="px-4 py-3">{t('thBrokerName')}</th>
                  <th className="px-4 py-3">{t('thCeNumber')}</th>
                  <th className="px-4 py-3">{t('thLetterLink')}</th>
                  <th className="px-4 py-3">{t('thSubmittedDate')}</th>
                  {tab === 'PENDING' && <th className="px-4 py-3">{t('thActions')}</th>}
                </tr>
              </thead>
              <tbody>
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-white/40">
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  claims.map((claim) => (
                    <tr
                      key={`claim-${claim.id}`}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-bold">
                        {/* Per cursor rule 51: render the localised
                            broker name, not the Chinese-only
                            `displayName` shortcut. */}
                        {localizedBrokerName(claim.broker, locale)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{claim.ceRefNumber}</td>
                      <td className="px-4 py-3">
                        {claim.companyLetterIpfsCid ? (
                          <a
                            href={`https://ipfs.io/ipfs/${claim.companyLetterIpfsCid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                          >
                            {t('viewIpfs')}
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {new Date(claim.createdAt).toLocaleDateString()}
                      </td>
                      {tab === 'PENDING' && (
                        <td className="flex gap-2 px-4 py-3">
                          <button
                            onClick={() => void handleApprove(claim.id)}
                            className="rounded bg-[#00FF88]/20 px-3 py-1.5 text-xs font-bold text-[#00FF88] transition-colors hover:bg-[#00FF88]/30"
                          >
                            {t('approve')}
                          </button>
                          <button
                            onClick={() => void handleReject(claim.id)}
                            className="rounded bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/30"
                          >
                            {t('reject')}
                          </button>
                        </td>
                      )}
                    </tr>
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
