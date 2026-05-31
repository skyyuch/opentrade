/**
 * Compact card for a KOL analyst note (ADR-0039). Ported from the Google
 * Studio UI and adapted to the list DTO, which omits the full body to keep
 * list payloads small — the card surfaces the title, author byline,
 * provenance and a linked-signal hint, and links to the detail page for the
 * full content.
 */

import { ExternalLink, Link as LinkIcon } from 'lucide-react';

import { Link } from '../../i18n/navigation';

import type { KolNoteListItemDto } from '../../lib/api/client';
import type { ReactNode } from 'react';

export type NoteCardLabels = {
  associatedSignal: string;
  readMore: string;
};

export type NoteCardProps = {
  note: KolNoteListItemDto;
  href: string;
  labels: NoteCardLabels;
};

export function NoteCard({ note, href, labels }: NoteCardProps): ReactNode {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between rounded-xl border border-white/10 bg-black/40 p-5 transition-colors hover:border-[#00FF88]/50"
    >
      <div>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-lg font-bold text-white transition-colors group-hover:text-[#00FF88]">
            {note.title}
          </h3>
          <div className="flex shrink-0 items-center gap-1 rounded border border-[#00FF88]/20 bg-[#00FF88]/10 px-2 py-0.5 font-mono text-[10px] text-[#00FF88]">
            IPFS <ExternalLink size={10} />
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-4">
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-white/40">{new Date(note.createdAt).toLocaleDateString()}</span>
          {note.kol && <span className="font-bold text-white/70">{note.kol.name}</span>}
        </div>

        <div className="flex items-center gap-3">
          {note.linkedSignalId && (
            <div className="flex items-center gap-1 rounded bg-[#00FF88]/10 px-2 py-1 text-xs text-[#00FF88]/80">
              <LinkIcon size={12} />
              <span>{labels.associatedSignal}</span>
            </div>
          )}
          <span className="text-sm font-bold text-[#00FF88] opacity-0 transition-opacity group-hover:opacity-100">
            {labels.readMore} &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
