'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { NoteEditor } from '../../../../../components/notes/NoteEditor';
import { useOpenTradeAuth } from '../../../../../hooks/useOpenTradeAuth';
import { Link } from '../../../../../i18n/navigation';
import {
  createNote,
  fetchMyKolProfile,
  fetchSignals,
  uploadNoteImage,
  ApiClientError,
} from '../../../../../lib/api/client';

import type {
  NoteEditorResult,
  NoteEditorSignalOption,
  NoteEditorStatus,
  NoteEditorValue,
} from '../../../../../components/notes/NoteEditor';
import type { RichTextDocument } from '../../../../../lib/api/client';
import type { ReactNode } from 'react';

const EMPTY_DOC: RichTextDocument = { type: 'doc', content: [] };

export default function KolNoteNewPage(): ReactNode {
  const t = useTranslations('noteEditor');
  const { getAccessToken } = useOpenTradeAuth();

  const [signalOptions, setSignalOptions] = useState<NoteEditorSignalOption[]>([]);
  const [editorValue, setEditorValue] = useState<NoteEditorValue>({
    title: '',
    bodyJson: null,
    imageCids: [],
    linkedSignalId: null,
  });
  const [status, setStatus] = useState<NoteEditorStatus>('editing');
  const [result, setResult] = useState<NoteEditorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the KOL's own signals so the editor can offer them as link targets.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const profile = await fetchMyKolProfile({ accessToken: token });
        const res = await fetchSignals({ kolId: profile.kol.id, limit: 50 });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (cancelled) return;
        setSignalOptions(
          res.signals.map((s) => ({
            id: s.id,
            symbol: s.symbol,
            direction: s.direction,
            createdAt: s.createdAt,
          })),
        );
      } catch {
        // The link-signal selector simply stays empty if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  const uploadImage = useCallback(
    async (file: File): Promise<{ cid: string; url: string }> => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const res = await uploadNoteImage(file, { accessToken: token });
      return { cid: res.cid, url: res.url };
    },
    [getAccessToken],
  );

  const handleSubmit = useCallback(async () => {
    if (status === 'editing') {
      setStatus('preview');
      return;
    }
    if (status !== 'preview') return;

    setStatus('submitting');
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setStatus('preview');
        return;
      }

      const note = await createNote(
        {
          title: editorValue.title.trim(),
          body: editorValue.bodyJson ?? EMPTY_DOC,
          imageCids: editorValue.imageCids,
          linkedSignalId: editorValue.linkedSignalId,
        },
        { accessToken: token },
      );

      setResult({ ipfsCid: note.note.ipfsCid, chainTxHash: note.note.chainTxHash });
      setStatus('success');
    } catch (err) {
      setStatus('preview');
      setError(err instanceof ApiClientError ? err.message : t('submitError'));
    }
  }, [status, getAccessToken, editorValue, t]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/kol/notes"
          className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={t('backToList')}
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <NoteEditor
          value={editorValue}
          onChange={setEditorValue}
          onSubmit={() => void handleSubmit()}
          onBack={() => setStatus('editing')}
          uploadImage={uploadImage}
          signalOptions={signalOptions}
          status={status}
          {...(result ? { result } : {})}
          labels={{
            titlePlaceholder: t('titlePlaceholder'),
            linkedSignal: t('linkedSignal'),
            noSignal: t('noSignal'),
            immutableWarningTitle: t('immutableWarningTitle'),
            immutableWarningDesc: t('immutableWarningDesc'),
            previewBtn: t('previewBtn'),
            backBtn: t('backBtn'),
            submitBtn: t('submitBtn'),
            submittingIpfs: t('submittingIpfs'),
            submittingChain: t('submittingChain'),
            successTitle: t('successTitle'),
            successDesc: t('successDesc'),
            viewOnChain: t('viewOnChain'),
            viewOnIpfs: t('viewOnIpfs'),
            imageUploadFailed: t('imageUploadFailed'),
            toolbar: {
              bold: t('toolbarBold'),
              italic: t('toolbarItalic'),
              h2: t('toolbarH2'),
              h3: t('toolbarH3'),
              bulletList: t('toolbarBulletList'),
              orderedList: t('toolbarOrderedList'),
              quote: t('toolbarQuote'),
              image: t('toolbarImage'),
            },
          }}
        />
      </div>
    </div>
  );
}
