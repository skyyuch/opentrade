/**
 * `/transparency/moderation` — public, no-auth moderation transparency page
 * (per ADR-0043).
 *
 * Renders the redacted moderation-change history from the public endpoint
 * `GET /v1/moderation/audit`. This is the externally-verifiable proof that
 * OpenTrade's one admin-editable lever (the pre-publication blocklist) is
 * content-category-bounded, attributable, and immutable — without publishing
 * the blocklist itself (rule 50 / rule 52). The page only ever renders the
 * fields the API already redacted; it never fetches or shows term text.
 *
 * Server Component: seeds the first page on the server (SEO + no-JS readable),
 * then hands paging off to the <ModerationAuditClient> island.
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ModerationAuditClient } from '@/components/moderation/ModerationAuditClient';
import { fetchModerationAudit } from '@/lib/api/client';

import type { ModerationAuditEntry } from '@/lib/api/client';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ locale: string }>;
};

export const generateMetadata = async (props: Props): Promise<Metadata> => {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'moderationAudit' });
  return {
    title: `${t('title')} | OpenTrade`,
    description: t('subtitle'),
  };
};

const ModerationTransparencyPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
  setRequestLocale(params.locale);

  const t = await getTranslations('moderationAudit');

  let audits: ModerationAuditEntry[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    const page = await fetchModerationAudit({ limit: 20 }, { next: { revalidate: 60 } });
    audits = page.audits;
    nextCursor = page.nextCursor;
  } catch {
    error = t('error');
  }

  return (
    <div className="-mt-16 relative pt-16">
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[900px] px-6 py-8 lg:px-10 lg:py-12">
        <header className="mb-8 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">
            {t('eyebrow')}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{t('title')}</h1>
          <p className="text-sm text-white/60">{t('subtitle')}</p>
        </header>

        <p className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-white/50">
          {t('intro')}
        </p>

        {error !== null ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-400">
            {error}
          </div>
        ) : (
          <ModerationAuditClient initialAudits={audits} initialNextCursor={nextCursor} />
        )}

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default ModerationTransparencyPage;
