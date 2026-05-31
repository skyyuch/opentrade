'use client';

/**
 * Rich-text editor for KOL analyst notes (ADR-0039). Ported from the Google
 * Studio UI.
 *
 * The editor is a controlled TipTap instance whose document JSON is lifted to
 * the parent. Embedded images are uploaded to IPFS first (via `uploadImage`)
 * and referenced by `cid` only ({@link CidImage}); `imageCids` tracks every
 * pinned CID. Notes are immutable once published — the parent owns the
 * editing → preview → submitting → success state machine.
 */

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlertCircle,
  Bold,
  CheckCircle2,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Quote,
  RefreshCw,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { blockExplorerTxUrl, ipfsGatewayUrl } from '../../lib/ipfs';

import { CidImage } from './cidImage';

import type { RichTextDocument, SignalDirection } from '../../lib/api/client';
import type { Content, Editor } from '@tiptap/react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

export type NoteEditorStatus = 'editing' | 'preview' | 'submitting' | 'success';

export type NoteEditorValue = {
  title: string;
  bodyJson: RichTextDocument | null;
  imageCids: string[];
  linkedSignalId: string | null;
};

export type NoteEditorSignalOption = {
  id: string;
  symbol: string;
  direction: SignalDirection;
  createdAt: string;
};

export type NoteEditorResult = {
  ipfsCid: string | null;
  chainTxHash: string | null;
};

export type NoteEditorToolbarLabels = {
  bold: string;
  italic: string;
  h2: string;
  h3: string;
  bulletList: string;
  orderedList: string;
  quote: string;
  image: string;
};

export type NoteEditorLabels = {
  titlePlaceholder: string;
  linkedSignal: string;
  noSignal: string;
  immutableWarningTitle: string;
  immutableWarningDesc: string;
  previewBtn: string;
  backBtn: string;
  submitBtn: string;
  submittingIpfs: string;
  submittingChain: string;
  successTitle: string;
  successDesc: string;
  viewOnChain: string;
  viewOnIpfs: string;
  imageUploadFailed: string;
  toolbar: NoteEditorToolbarLabels;
};

export type NoteEditorProps = {
  value: NoteEditorValue;
  onChange: Dispatch<SetStateAction<NoteEditorValue>>;
  onSubmit: () => void;
  onBack?: () => void;
  uploadImage: (file: File) => Promise<{ cid: string; url: string }>;
  signalOptions: NoteEditorSignalOption[];
  status: NoteEditorStatus;
  result?: NoteEditorResult;
  labels: NoteEditorLabels;
};

type MenuBarProps = {
  editor: Editor | null;
  uploadImage: (file: File) => Promise<{ cid: string; url: string }>;
  onChange: Dispatch<SetStateAction<NoteEditorValue>>;
  labels: NoteEditorLabels;
};

function MenuBar({ editor, uploadImage, onChange, labels }: MenuBarProps): ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  if (!editor) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadFailed(false);
    try {
      const { cid } = await uploadImage(file);
      onChange((prev) => ({ ...prev, imageCids: [...prev.imageCids, cid] }));
      editor
        .chain()
        .focus()
        .insertContent({ type: 'image', attrs: { cid, alt: file.name } })
        .run();
    } catch {
      setUploadFailed(true);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const btnClass =
    'p-2 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50';
  const activeClass = 'bg-[#00FF88]/20 text-[#00FF88]';

  return (
    <div className="flex flex-col gap-1 rounded-t-xl border-b border-white/10 bg-black/20">
      <div className="flex flex-wrap items-center gap-1 p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${btnClass} ${editor.isActive('bold') ? activeClass : ''}`}
          title={labels.toolbar.bold}
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${btnClass} ${editor.isActive('italic') ? activeClass : ''}`}
          title={labels.toolbar.italic}
        >
          <Italic size={18} />
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`${btnClass} ${editor.isActive('heading', { level: 2 }) ? activeClass : ''}`}
          title={labels.toolbar.h2}
        >
          <Heading2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`${btnClass} ${editor.isActive('heading', { level: 3 }) ? activeClass : ''}`}
          title={labels.toolbar.h3}
        >
          <Heading3 size={18} />
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${btnClass} ${editor.isActive('bulletList') ? activeClass : ''}`}
          title={labels.toolbar.bulletList}
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${btnClass} ${editor.isActive('orderedList') ? activeClass : ''}`}
          title={labels.toolbar.orderedList}
        >
          <ListOrdered size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`${btnClass} ${editor.isActive('blockquote') ? activeClass : ''}`}
          title={labels.toolbar.quote}
        >
          <Quote size={18} />
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={(e) => void handleImageUpload(e)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className={btnClass}
          title={labels.toolbar.image}
        >
          {isUploading ? (
            <Loader2 size={18} className="animate-spin text-[#00FF88]" />
          ) : (
            <ImageIcon size={18} />
          )}
        </button>
      </div>
      {uploadFailed && (
        <div className="px-3 pb-2 text-xs text-red-400">{labels.imageUploadFailed}</div>
      )}
    </div>
  );
}

export function NoteEditor({
  value,
  onChange,
  onSubmit,
  onBack,
  uploadImage,
  signalOptions,
  status,
  result,
  labels,
}: NoteEditorProps): ReactNode {
  const editor = useEditor({
    extensions: [StarterKit, CidImage],
    // RichTextDocument is structurally a ProseMirror doc but declared readonly;
    // TipTap's Content type is mutable, so cast at this boundary.
    content: (value.bodyJson ?? '') as Content,
    immediatelyRender: false,
    editable: status === 'editing',
    onUpdate: ({ editor: instance }) => {
      onChange((prev) => ({ ...prev, bodyJson: instance.getJSON() as RichTextDocument }));
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-emerald min-h-[300px] max-w-none p-4 focus:outline-none',
      },
    },
  });

  if (status === 'submitting') {
    return (
      <div className="flex flex-col items-center rounded-xl border border-white/10 bg-black/40 p-12 text-center">
        <div className="relative mb-6">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-[#00FF88]/20 border-t-[#00FF88]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw size={24} className="animate-pulse text-[#00FF88]" />
          </div>
        </div>
        <h3 className="mb-2 text-xl font-bold text-white">{labels.submittingIpfs}</h3>
        <p className="text-white/50">{labels.submittingChain}</p>
      </div>
    );
  }

  if (status === 'success' && result) {
    const ipfsHref = result.ipfsCid ? ipfsGatewayUrl(result.ipfsCid) : null;
    const txHref = result.chainTxHash ? blockExplorerTxUrl(result.chainTxHash) : null;
    return (
      <div className="flex flex-col items-center rounded-xl border border-[#00FF88]/30 bg-black/40 p-12 text-center shadow-[0_0_30px_rgba(0,255,136,0.1)]">
        <CheckCircle2 size={64} className="mb-6 text-[#00FF88]" />
        <h3 className="mb-2 text-2xl font-bold text-white">{labels.successTitle}</h3>
        <p className="mb-8 max-w-md text-white/50">{labels.successDesc}</p>

        <div className="flex gap-4">
          {ipfsHref && (
            <a
              href={ipfsHref}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-6 py-3 font-medium text-white transition-colors hover:bg-white/10"
            >
              {labels.viewOnIpfs}
            </a>
          )}
          {txHref ? (
            <a
              href={txHref}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-6 py-3 font-medium text-[#00FF88] transition-colors hover:bg-[#00FF88]/20"
            >
              {labels.viewOnChain}
            </a>
          ) : (
            <span className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-6 py-3 font-medium text-white/50">
              <Loader2 size={16} className="animate-spin" /> {labels.submittingChain}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <input
          type="text"
          value={value.title}
          onChange={(e) => onChange((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={labels.titlePlaceholder}
          disabled={status === 'preview'}
          className="w-full border-0 border-b border-white/10 bg-transparent py-4 text-2xl font-bold text-white transition-colors placeholder:text-white/20 focus:border-[#00FF88] focus:ring-0 disabled:border-transparent disabled:opacity-70"
        />
      </div>

      <div className="flex items-start gap-4 rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 p-4">
        <AlertCircle className="mt-0.5 shrink-0 text-[#00FF88]" size={20} />
        <div>
          <h4 className="mb-1 text-sm font-bold text-[#00FF88]">{labels.immutableWarningTitle}</h4>
          <p className="text-xs text-[#00FF88]/70">{labels.immutableWarningDesc}</p>
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-xl border bg-black/40 shadow-sm ${
          status === 'preview' ? 'border-transparent' : 'border-white/10'
        }`}
      >
        {status === 'editing' && (
          <MenuBar editor={editor} uploadImage={uploadImage} onChange={onChange} labels={labels} />
        )}
        <div className={status === 'preview' ? 'pointer-events-none opacity-90' : ''}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center">
        <div className="text-sm">
          <span className="mb-1 block text-white/50">{labels.linkedSignal}</span>
          {status === 'preview' ? (
            <span className="font-mono text-white">
              {value.linkedSignalId
                ? (signalOptions.find((o) => o.id === value.linkedSignalId)?.symbol ??
                  labels.noSignal)
                : labels.noSignal}
            </span>
          ) : (
            <select
              value={value.linkedSignalId ?? ''}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, linkedSignalId: e.target.value || null }))
              }
              className="min-w-[200px] rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-[#00FF88]/50 focus:outline-none"
            >
              <option value="">{labels.noSignal}</option>
              {signalOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.symbol} ({opt.direction}) - {new Date(opt.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-4 border-t border-white/10 pt-4">
        {status === 'editing' ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.title.trim() || !editor?.getText().trim()}
            className="rounded-lg bg-[#00FF88] px-8 py-3 font-bold text-black shadow-[0_0_20px_rgba(0,255,136,0.3)] transition-colors hover:bg-[#00FF88]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels.previewBtn}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-white transition-colors hover:bg-white/10"
            >
              {labels.backBtn}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="rounded-lg bg-[#00FF88] px-8 py-3 font-bold text-black shadow-[0_0_20px_rgba(0,255,136,0.3)] transition-colors hover:bg-[#00FF88]/90"
            >
              {labels.submitBtn}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
