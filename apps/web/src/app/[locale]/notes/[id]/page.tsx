import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { NoteDetail } from '@/components/notes/NoteDetail';
import { ApiClientError, fetchNote, fetchSignal } from '@/lib/api/client';

import type { NoteDetailLinkedSignal } from '@/components/notes/NoteDetail';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string; id: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  try {
    const data = await fetchNote(params.id, { next: { revalidate: 60 } });
    return {
      title: `${data.note.title} | OpenTrade`,
      description: data.note.kol ? `${data.note.kol.name} — OpenTrade` : 'OpenTrade analyst note',
    };
  } catch {
    return { title: 'Note | OpenTrade' };
  }
};

const NoteDetailPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const t = await getTranslations('noteDetail');

  let data: Awaited<ReturnType<typeof fetchNote>>;
  try {
    data = await fetchNote(params.id, { next: { revalidate: 0 } });
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const note = data.note;

  // Resolve the linked signal (if any) so the detail card can show its
  // symbol/direction/prices. The note's `linkedSignalId` is the DB UUID.
  let linkedSignal: NoteDetailLinkedSignal | undefined;
  if (note.linkedSignalId) {
    try {
      const sig = await fetchSignal(note.linkedSignalId, { next: { revalidate: 60 } });
      linkedSignal = {
        id: sig.signal.id,
        symbol: sig.signal.symbol,
        direction: sig.signal.direction,
        ...(sig.signal.entryPrice ? { entryPrice: sig.signal.entryPrice } : {}),
        ...(sig.signal.settlePrice ? { exitPrice: sig.signal.settlePrice } : {}),
      };
    } catch {
      // The linked-signal card is optional; render the note regardless.
    }
  }

  return (
    <div className="-mt-16 relative pt-16">
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-12">
        <NoteDetail
          note={note}
          {...(linkedSignal ? { linkedSignal } : {})}
          labels={{
            back: t('back'),
            immutableBadgeTitle: t('immutableBadgeTitle'),
            linkedSignalHeader: t('linkedSignalHeader'),
            entryPrice: t('entryPrice'),
            exitPrice: t('exitPrice'),
            pendingTxUrl: t('pendingTxUrl'),
          }}
        />

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default NoteDetailPage;
