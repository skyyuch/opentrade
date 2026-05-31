'use client';

import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { NoteCard } from '../../../../components/notes/NoteCard';
import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { Link } from '../../../../i18n/navigation';
import { fetchMyKolProfile, fetchNotes } from '../../../../lib/api/client';

import type { KolNoteListItemDto } from '../../../../lib/api/client';
import type { ReactNode } from 'react';

export default function KolNotesPage(): ReactNode {
  const t = useTranslations('noteList');
  const tCard = useTranslations('noteCard');
  const { getAccessToken } = useOpenTradeAuth();

  const [notes, setNotes] = useState<KolNoteListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const profile = await fetchMyKolProfile({ accessToken: token });
        const res = await fetchNotes({ kolId: profile.kol.id, limit: 100 });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (cancelled) return;
        setNotes(res.notes);
      } catch {
        // Empty state covers the failure case.
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  const filteredNotes = useMemo(
    () => notes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase())),
    [notes, search],
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-white/50">{t('subtitle')}</p>
        </div>
        <Link
          href="/kol/notes/new"
          className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-[#00FF88] px-5 py-2.5 font-bold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
        >
          <Plus size={18} />
          {t('newNote')}
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-4 text-white transition-colors focus:border-[#00FF88]/50 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/40" />
          </div>
        ) : filteredNotes.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredNotes.map((note) => (
              <div key={note.id} className="min-h-[160px]">
                <NoteCard
                  note={note}
                  href={`/notes/${note.id}`}
                  labels={{
                    associatedSignal: tCard('associatedSignal'),
                    readMore: tCard('readMore'),
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-12 text-center text-white/40">
            <FileText size={48} className="mb-4 opacity-50" />
            <p>{notes.length === 0 ? t('emptyHint') : t('empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
