'use client';

import { AlertTriangle, ExternalLink, FileText, Hash, MessageSquare, Shield } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useCurrentUser } from '../../../../hooks/useCurrentUser';
import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchOwnerComplaints, submitBrokerResponse } from '../../../../lib/api/client';

import type { OwnerComplaintItem } from '../../../../lib/api/client';

type RespondedFilter = 'ALL' | 'PENDING' | 'RESPONDED';

function deriveComplaintStatus(complaint: OwnerComplaintItem): 'OPEN' | 'VERIFIED' | 'REJECTED' {
  if (complaint.verifiedAt) return 'VERIFIED';
  if (complaint.adminNote) return 'REJECTED';
  return 'OPEN';
}

export function ComplaintsInboxClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const { claimedBroker, isLoading: userLoading } = useCurrentUser();
  const t = useTranslations('brokerComplaints');

  const [complaints, setComplaints] = useState<OwnerComplaintItem[]>([]);
  const [filter, setFilter] = useState<RespondedFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (userLoading || !claimedBroker) return;

    const load = async () => {
      setLoading(true);
      const token = getAccessToken();
      if (!token) return;
      try {
        const params: { responded?: 'true' | 'false'; cursor?: string } = {};
        if (filter === 'RESPONDED') params.responded = 'true';
        else if (filter === 'PENDING') params.responded = 'false';
        const res = await fetchOwnerComplaints(claimedBroker.slug, params, {
          accessToken: token,
        });
        setComplaints(res.complaints);
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken, claimedBroker, userLoading, filter, refreshKey]);

  if (userLoading || (loading && complaints.length === 0)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
      </div>
    );
  }

  if (!claimedBroker) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-white/50">{t('noBrokerClaimed')}</p>
      </div>
    );
  }

  const filters: { key: RespondedFilter; label: string }[] = [
    { key: 'ALL', label: t('filterAll') },
    { key: 'PENDING', label: t('filterPending') },
    { key: 'RESPONDED', label: t('filterResponded') },
  ];

  const selected = selectedId ? (complaints.find((c) => c.id === selectedId) ?? null) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Complaint list */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
        {complaints.map((complaint) => (
          <ComplaintRow
            key={complaint.id}
            complaint={complaint}
            t={t}
            isSelected={selectedId === complaint.id}
            onSelect={() => setSelectedId(selectedId === complaint.id ? null : complaint.id)}
          />
        ))}
        {complaints.length === 0 ? (
          <div className="p-6 text-center">
            <AlertTriangle size={24} className="mx-auto mb-2 text-white/20" />
            <p className="text-sm text-white/40">{t('noComplaints')}</p>
          </div>
        ) : null}
      </div>

      {/* Detail panel */}
      {selected ? (
        <ComplaintDetail
          complaint={selected}
          t={t}
          getAccessToken={getAccessToken}
          onResponseSubmitted={reload}
        />
      ) : null}

      <div className="text-xs text-white/30 flex items-center justify-end gap-1">
        <Shield size={14} />
        {t('disclaimer')}
      </div>
    </div>
  );
}

function ComplaintRow({
  complaint,
  t,
  isSelected,
  onSelect,
}: {
  complaint: OwnerComplaintItem;
  t: ReturnType<typeof useTranslations>;
  isSelected: boolean;
  onSelect: () => void;
}): React.ReactNode {
  const status = deriveComplaintStatus(complaint);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full p-6 text-left transition-colors ${
        isSelected ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <ComplaintStatusBadge status={status} t={t} />
          {complaint.brokerResponse ? (
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-400">
              {t('responded')}
            </span>
          ) : (
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-400">
              {t('awaitingResponse')}
            </span>
          )}
        </div>
        <span className="text-xs text-white/40">
          {new Date(complaint.createdAt).toLocaleDateString()}
        </span>
      </div>
      {complaint.title ? <div className="text-sm font-bold mb-1">{complaint.title}</div> : null}
      <div className="text-sm text-white/60 line-clamp-2">{complaint.body}</div>
    </button>
  );
}

function ComplaintDetail({
  complaint,
  t,
  getAccessToken,
  onResponseSubmitted,
}: {
  complaint: OwnerComplaintItem;
  t: ReturnType<typeof useTranslations>;
  getAccessToken: () => string | null;
  onResponseSubmitted: () => void;
}): React.ReactNode {
  const status = deriveComplaintStatus(complaint);
  const locale = useLocale();

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ComplaintStatusBadge status={status} t={t} />
        <span className="text-xs text-white/40">
          {new Date(complaint.createdAt).toLocaleDateString()}
        </span>
        {complaint.sourceLocale ? (
          <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-white/40">
            {complaint.sourceLocale}
          </span>
        ) : null}
      </div>

      {complaint.title ? <h3 className="text-lg font-bold">{complaint.title}</h3> : null}

      <div className="text-sm text-white/80 leading-relaxed bg-black/20 p-4 rounded-xl border border-white/5">
        {complaint.body}
      </div>

      {/* Evidence link */}
      {complaint.evidenceIpfsCid ? (
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-white/40" />
          <a
            href={`https://gateway.pinata.cloud/ipfs/${complaint.evidenceIpfsCid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline flex items-center gap-1"
          >
            {t('viewEvidence')}
            <ExternalLink size={10} />
          </a>
        </div>
      ) : null}

      {/* Admin rejection note */}
      {status === 'REJECTED' && complaint.adminNote ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-xs font-bold text-red-400 mb-1">{t('rejectionNote')}</p>
          <p className="text-sm text-white/70">{complaint.adminNote}</p>
        </div>
      ) : null}

      {/* Broker response section — readonly if already responded, form if not */}
      {complaint.brokerResponse ? (
        <BrokerResponseReadonly response={complaint.brokerResponse} t={t} />
      ) : (
        <BrokerResponseForm
          complaintId={complaint.id}
          locale={locale}
          t={t}
          getAccessToken={getAccessToken}
          onSubmitted={onResponseSubmitted}
        />
      )}
    </div>
  );
}

function BrokerResponseReadonly({
  response,
  t,
}: {
  response: OwnerComplaintItem['brokerResponse'] & {};
  t: ReturnType<typeof useTranslations>;
}): React.ReactNode {
  return (
    <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
      <p className="text-xs font-bold text-green-400">{t('yourResponse')}</p>
      <p className="text-sm text-white/80 leading-relaxed">{response.body}</p>
      <div className="flex items-center gap-3 text-[10px] text-white/30">
        <span>{new Date(response.createdAt).toLocaleDateString()}</span>
        <span className="flex items-center gap-1">
          <Hash size={10} />
          {response.contentHash.slice(0, 10)}…
        </span>
      </div>
    </div>
  );
}

function BrokerResponseForm({
  complaintId,
  locale,
  t,
  getAccessToken,
  onSubmitted,
}: {
  complaintId: string;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  getAccessToken: () => string | null;
  onSubmitted: () => void;
}): React.ReactNode {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canSubmit = trimmed.length >= 10 && trimmed.length <= 2000 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const token = getAccessToken();
    if (!token) return;

    setSubmitting(true);
    setError(null);

    try {
      await submitBrokerResponse(
        complaintId,
        { body: trimmed, sourceLocale: locale },
        {
          accessToken: token,
        },
      );
      onSubmitted();
    } catch {
      setError(t('submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-blue-400" />
        <p className="text-xs font-bold text-blue-400">{t('respondTitle')}</p>
      </div>
      <p className="text-xs text-white/40">{t('respondHint')}</p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('respondPlaceholder')}
        rows={4}
        maxLength={2000}
        className="w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30">
          {trimmed.length}/2000 {trimmed.length < 10 ? `(${t('minChars')})` : ''}
        </span>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </span>
          ) : (
            t('submitResponse')
          )}
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

function ComplaintStatusBadge({
  status,
  t,
}: {
  status: 'OPEN' | 'VERIFIED' | 'REJECTED';
  t: ReturnType<typeof useTranslations>;
}): React.ReactNode {
  const styles: Record<string, string> = {
    OPEN: 'bg-orange-500/20 text-orange-400',
    VERIFIED: 'bg-red-500/20 text-red-400',
    REJECTED: 'bg-white/10 text-white/50',
  };
  const labels: Record<string, string> = {
    OPEN: t('statusOpen'),
    VERIFIED: t('statusVerified'),
    REJECTED: t('statusRejected'),
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
