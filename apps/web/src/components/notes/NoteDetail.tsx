'use client';

/**
 * Read-only viewer for a published KOL analyst note (ADR-0039). Ported from
 * the Google Studio UI.
 *
 * Renders the immutable-provenance header (IPFS gateway link + on-chain TX
 * link), the author byline (enriched server-side), an optional linked-signal
 * card, and the rich-text body via a read-only TipTap instance. Embedded
 * images resolve from their `cid` through {@link CidImage}.
 */

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ArrowLeft, ExternalLink, Link as LinkIcon, ShieldCheck } from 'lucide-react';

import { useRouter } from '../../i18n/navigation';
import { blockExplorerTxUrl, ipfsGatewayUrl } from '../../lib/ipfs';

import { CidImage } from './cidImage';

import type { KolNoteDto, SignalDirection } from '../../lib/api/client';
import type { Content } from '@tiptap/react';
import type { ReactNode } from 'react';

export type NoteDetailLinkedSignal = {
  id: string;
  symbol: string;
  direction: SignalDirection;
  entryPrice?: string;
  exitPrice?: string;
};

export type NoteDetailLabels = {
  back: string;
  immutableBadgeTitle: string;
  linkedSignalHeader: string;
  entryPrice: string;
  exitPrice: string;
  pendingTxUrl: string;
};

export type NoteDetailProps = {
  note: KolNoteDto;
  linkedSignal?: NoteDetailLinkedSignal;
  labels: NoteDetailLabels;
};

export function NoteDetail({ note, linkedSignal, labels }: NoteDetailProps): ReactNode {
  const router = useRouter();
  const editor = useEditor({
    extensions: [StarterKit, CidImage],
    content: note.body as Content,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-emerald max-w-none focus:outline-none',
      },
    },
  });

  const ipfsHref = note.ipfsCid ? ipfsGatewayUrl(note.ipfsCid) : null;
  const txHref = note.chainTxHash ? blockExplorerTxUrl(note.chainTxHash) : null;

  return (
    <div>
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-white/50 transition-colors hover:text-white"
      >
        <ArrowLeft size={16} /> {labels.back}
      </button>

      <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 text-white">
        {/* Immutable header */}
        <div className="flex flex-col justify-between gap-2 border-b border-[#00FF88]/20 bg-[#00FF88]/5 px-6 py-3 sm:flex-row sm:items-center sm:gap-0">
          <div className="flex items-center gap-2 text-[#00FF88]">
            <ShieldCheck size={18} />
            <span className="text-sm font-bold">{labels.immutableBadgeTitle}</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs">
            {ipfsHref && (
              <a
                href={ipfsHref}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 whitespace-nowrap text-white/50 transition-colors hover:text-[#00FF88]"
              >
                IPFS <ExternalLink size={12} />
              </a>
            )}
            {note.chainTxHash ? (
              <a
                href={txHref ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 whitespace-nowrap rounded border border-[#00FF88]/20 bg-[#00FF88]/10 px-2 py-0.5 text-[#00FF88]/80 transition-colors hover:text-[#00FF88]"
              >
                TX: {note.chainTxHash.slice(0, 10)}... <ExternalLink size={12} />
              </a>
            ) : (
              <span className="flex items-center gap-1 whitespace-nowrap rounded border border-white/10 bg-white/5 px-2 py-0.5 text-white/40">
                {labels.pendingTxUrl}
              </span>
            )}
          </div>
        </div>

        {/* Article header */}
        <div className="border-b border-white/10 px-6 py-8 md:px-10">
          <h1 className="mb-6 text-3xl font-bold">{note.title}</h1>
          <div className="flex items-center gap-4">
            {note.kol ? (
              <div className="flex items-center gap-3">
                {note.kol.avatarUrl ? (
                  <img
                    src={note.kol.avatarUrl}
                    alt={note.kol.name}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00FF88]/20 font-bold text-[#00FF88]">
                    {note.kol.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="font-bold">{note.kol.name}</div>
                  <div className="text-xs text-white/50">
                    {new Date(note.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-white/50">
                {new Date(note.createdAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Linked signal card */}
        {linkedSignal && (
          <div className="px-6 pt-8 md:px-10">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40">
              <LinkIcon size={14} /> {labels.linkedSignalHeader}
            </div>
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-5 md:flex-row md:items-center">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl font-bold ${
                    linkedSignal.direction === 'BUY'
                      ? 'bg-[#00FF88]/20 text-[#00FF88]'
                      : linkedSignal.direction === 'SELL'
                        ? 'bg-red-500/20 text-red-500'
                        : 'bg-white/10 text-white'
                  }`}
                >
                  {linkedSignal.direction}
                </div>
                <div>
                  <div className="font-mono text-xl font-bold">{linkedSignal.symbol}</div>
                  <div className="mt-1 inline-block rounded bg-black/50 px-2 py-0.5 font-mono text-xs text-white/50">
                    ID: {linkedSignal.id.slice(0, 8)}...
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                {linkedSignal.entryPrice && (
                  <div>
                    <div className="mb-1 text-xs text-white/40">{labels.entryPrice}</div>
                    <div className="font-mono font-bold">$ {linkedSignal.entryPrice}</div>
                  </div>
                )}
                {linkedSignal.exitPrice && (
                  <div>
                    <div className="mb-1 text-xs text-white/40">{labels.exitPrice}</div>
                    <div className="font-mono font-bold">$ {linkedSignal.exitPrice}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-10 md:px-10">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
