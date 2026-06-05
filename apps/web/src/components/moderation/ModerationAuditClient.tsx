'use client';

/**
 * Public moderation transparency list (per ADR-0043).
 *
 * Renders the redacted audit entries the API returns from
 * `GET /v1/moderation/audit` and nothing else. Per rule 50 / rule 52 the
 * front-end MUST NOT attempt to fetch or display the blocklist itself — the
 * only inputs here are the already-redacted fields (id, termId, action,
 * category, actor role, reason, timestamp). There is deliberately no term
 * text on the wire, so this component cannot leak it.
 *
 * The server component seeds the first page; this island only appends further
 * pages via the cursor when the reader clicks "load more".
 */

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { fetchModerationAudit } from '@/lib/api/client';

import type { ModerationAuditEntry } from '@/lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  initialAudits: ModerationAuditEntry[];
  initialNextCursor: string | null;
};

const ACTION_BADGE: Record<ModerationAuditEntry['action'], string> = {
  CREATE: 'bg-[#00FF88]/15 text-[#00FF88]',
  ENABLE: 'bg-[#00FF88]/15 text-[#00FF88]',
  UPDATE: 'bg-white/10 text-white/70',
  DISABLE: 'bg-amber-500/15 text-amber-300',
  DELETE: 'bg-red-500/15 text-red-300',
};

export function ModerationAuditClient({ initialAudits, initialNextCursor }: Props): ReactNode {
  const t = useTranslations('moderationAudit');
  const locale = useLocale();

  const [audits, setAudits] = useState<ModerationAuditEntry[]>(initialAudits);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async (): Promise<void> => {
    if (cursor === null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchModerationAudit({ cursor });
      setAudits((prev) => [...prev, ...page.audits]);
      setCursor(page.nextCursor);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  };

  if (audits.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-6 py-12 text-center text-sm text-white/40">
        {t('empty')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {audits.map((entry) => (
          <li
            key={entry.id}
            className="rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-white/20"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${ACTION_BADGE[entry.action]}`}
              >
                {t(`action.${entry.action}`)}
              </span>
              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">
                {t(`category.${entry.category ?? 'unknown'}`)}
              </span>
              <span className="text-xs text-white/40">{t(`actor.${entry.actor}`)}</span>
              <time
                dateTime={entry.createdAt}
                title={absoluteTime(entry.createdAt, locale)}
                className="ml-auto text-xs text-white/30"
              >
                {relativeTime(entry.createdAt, locale)}
              </time>
            </div>

            {entry.reason ? (
              <p className="mt-3 text-sm text-white/70">
                <span className="text-white/40">{t('reasonLabel')}：</span>
                {entry.reason}
              </p>
            ) : (
              <p className="mt-3 text-sm italic text-white/30">{t('noReason')}</p>
            )}

            <p className="mt-2 font-mono text-[11px] text-white/25">
              {t('termLabel')}: {entry.termId}
            </p>
          </li>
        ))}
      </ul>

      {error !== null && <p className="text-center text-sm text-red-400">{error}</p>}

      {cursor !== null && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="rounded-lg border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white/80 transition-colors hover:border-[#00FF88]/30 hover:text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t('loading') : t('loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Locale-aware relative time (e.g. "3 hours ago") — purely presentational. */
const relativeTime = (iso: string, locale: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
};

const absoluteTime = (iso: string, locale: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
