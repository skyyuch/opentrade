'use client';

/**
 * Admin moderation blocklist management (per ADR-0034 D3, Phase B).
 *
 * Lets operators list / filter / create / edit / enable-disable / soft-delete
 * the content-neutral moderation terms, and inspect each term's read-only
 * append-only audit trail. The page header carries the rule 52 content-neutral
 * reminder: the blocklist exists to stop the five prohibited categories, NEVER
 * to suppress negative opinion.
 */

import { Filter, History, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import {
  createModerationTerm,
  deleteModerationTerm,
  fetchModerationTermAudits,
  fetchModerationTerms,
  setModerationTermEnabled,
  updateModerationTerm,
} from '../../../../lib/api/client';

import type {
  AdminModerationTerm,
  AdminModerationTermAudit,
  ModerationCategory,
} from '../../../../lib/api/client';

const CATEGORIES: readonly ModerationCategory[] = [
  'PROFANITY',
  'ATTACK',
  'CONTACT',
  'ILLEGAL',
  'PII',
];

const CATEGORY_BADGE: Record<ModerationCategory, string> = {
  PROFANITY: 'bg-rose-500/15 text-rose-300',
  ATTACK: 'bg-orange-500/15 text-orange-300',
  CONTACT: 'bg-amber-500/15 text-amber-300',
  ILLEGAL: 'bg-red-500/20 text-red-300',
  PII: 'bg-fuchsia-500/15 text-fuchsia-300',
};

type FilterKey = ModerationCategory | 'ALL';

type FormState = {
  category: ModerationCategory;
  term: string;
  isRegex: boolean;
  note: string;
  reason: string;
};

const emptyForm: FormState = {
  category: 'PROFANITY',
  term: '',
  isRegex: false,
  note: '',
  reason: '',
};

export function ModerationClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');

  const [terms, setTerms] = useState<AdminModerationTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('ALL');

  // Create / edit modal: `editing` is null when closed, the term when editing,
  // or the sentinel 'new' when creating.
  const [editing, setEditing] = useState<AdminModerationTerm | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation modal.
  const [pendingDelete, setPendingDelete] = useState<AdminModerationTerm | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Audit history modal.
  const [auditTerm, setAuditTerm] = useState<AdminModerationTerm | null>(null);
  const [audits, setAudits] = useState<AdminModerationTermAudit[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchModerationTerms(filter === 'ALL' ? undefined : filter, {
        accessToken: token,
      });
      setTerms(res.terms);
    } catch {
      setTerms([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close any open modal on Escape.
  useEffect(() => {
    if (!editing && !pendingDelete && !auditTerm) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setEditing(null);
      setPendingDelete(null);
      setAuditTerm(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, pendingDelete, auditTerm]);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError('');
    setEditing('new');
  };

  const openEdit = (term: AdminModerationTerm) => {
    setForm({
      category: term.category,
      term: term.term,
      isRegex: term.isRegex,
      note: term.note ?? '',
      reason: '',
    });
    setFormError('');
    setEditing(term);
  };

  const handleSave = async () => {
    const token = getAccessToken();
    if (!token) return;
    if (form.term.trim().length === 0) {
      setFormError(t('moderation.form.termRequired'));
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const reason = form.reason.trim();
      if (editing === 'new') {
        await createModerationTerm(
          {
            category: form.category,
            term: form.term.trim(),
            isRegex: form.isRegex,
            note: form.note.trim() === '' ? null : form.note.trim(),
            ...(reason !== '' ? { reason } : {}),
          },
          { accessToken: token },
        );
      } else if (editing) {
        await updateModerationTerm(
          editing.id,
          {
            category: form.category,
            term: form.term.trim(),
            isRegex: form.isRegex,
            note: form.note.trim() === '' ? null : form.note.trim(),
            ...(reason !== '' ? { reason } : {}),
          },
          { accessToken: token },
        );
      }
      setEditing(null);
      await load();
    } catch {
      setFormError(t('moderation.form.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (term: AdminModerationTerm) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await setModerationTermEnabled(term.id, !term.enabled, undefined, { accessToken: token });
      await load();
    } catch {
      /* swallow — list stays */
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const token = getAccessToken();
    if (!token) return;
    setDeleting(true);
    try {
      const reason = deleteReason.trim();
      await deleteModerationTerm(pendingDelete.id, reason === '' ? undefined : reason, {
        accessToken: token,
      });
      setPendingDelete(null);
      setDeleteReason('');
      await load();
    } catch {
      /* swallow — modal stays open for retry */
    } finally {
      setDeleting(false);
    }
  };

  const openAudits = async (term: AdminModerationTerm) => {
    const token = getAccessToken();
    if (!token) return;
    setAuditTerm(term);
    setAudits([]);
    setAuditLoading(true);
    try {
      const res = await fetchModerationTermAudits(term.id, { accessToken: token });
      setAudits(res.audits);
    } catch {
      setAudits([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const tabs: FilterKey[] = ['ALL', ...CATEGORIES];

  return (
    <div className="mx-auto max-w-6xl py-6 text-white">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Filter className="size-6 text-[#00FF88]" aria-hidden />
            {t('moderation.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/50">{t('moderation.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-[#00FF88] px-4 py-2 text-sm font-bold text-[#050608] transition-all hover:bg-[#00FF88]/90"
        >
          <Plus size={16} aria-hidden />
          {t('moderation.addTerm')}
        </button>
      </div>

      {/* Content-neutral red-line reminder (rule 52). */}
      <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/80">
        {t('moderation.neutralNotice')}
      </div>

      {/* Category filter tabs. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key
                ? 'bg-[#00FF88]/15 text-[#00FF88]'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
            }`}
          >
            {key === 'ALL' ? t('moderation.filterAll') : t(`moderation.category.${key}`)}
          </button>
        ))}
      </div>

      {/* Terms table. */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-black/30">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/5 text-xs uppercase text-white/40">
            <tr>
              <th className="px-4 py-3">{t('moderation.colCategory')}</th>
              <th className="px-4 py-3">{t('moderation.colTerm')}</th>
              <th className="px-4 py-3">{t('moderation.colType')}</th>
              <th className="px-4 py-3">{t('moderation.colStatus')}</th>
              <th className="px-4 py-3 text-right">{t('moderation.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                  {t('moderation.loading')}
                </td>
              </tr>
            ) : terms.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                  {t('moderation.empty')}
                </td>
              </tr>
            ) : (
              terms.map((term) => (
                <tr key={term.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_BADGE[term.category]}`}
                    >
                      {t(`moderation.category.${term.category}`)}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <div className="truncate font-mono text-white/90" title={term.term}>
                      {term.term}
                    </div>
                    {term.note ? (
                      <div className="truncate text-xs text-white/40" title={term.note}>
                        {term.note}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {term.isRegex ? t('moderation.typeRegex') : t('moderation.typeLiteral')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        term.enabled
                          ? 'bg-[#00FF88]/15 text-[#00FF88]'
                          : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {term.enabled
                        ? t('moderation.statusEnabled')
                        : t('moderation.statusDisabled')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void handleToggle(term)}
                        title={term.enabled ? t('moderation.disable') : t('moderation.enable')}
                        className="rounded p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Power size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(term)}
                        title={t('moderation.edit')}
                        className="rounded p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Pencil size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void openAudits(term)}
                        title={t('moderation.viewAudits')}
                        className="rounded p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <History size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteReason('');
                          setPendingDelete(term);
                        }}
                        title={t('moderation.delete')}
                        className="rounded p-1.5 text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / edit modal. */}
      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0b0d11] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing === 'new'
                  ? t('moderation.form.createTitle')
                  : t('moderation.form.editTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-white/40 hover:text-white"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-white/50">
                  {t('moderation.form.category')}
                </label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as ModerationCategory }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#00FF88]/50"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#0b0d11]">
                      {t(`moderation.category.${cat}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-white/50">
                  {t('moderation.form.term')}
                </label>
                <input
                  type="text"
                  value={form.term}
                  onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
                  placeholder={t('moderation.form.termPlaceholder')}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white placeholder-white/30 outline-none focus:border-[#00FF88]/50"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={form.isRegex}
                  onChange={(e) => setForm((f) => ({ ...f, isRegex: e.target.checked }))}
                  className="size-4 rounded border-white/20 bg-white/5"
                />
                {t('moderation.form.isRegex')}
              </label>

              <div>
                <label className="mb-1 block text-xs text-white/50">
                  {t('moderation.form.note')}
                </label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder={t('moderation.form.notePlaceholder')}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#00FF88]/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-white/50">
                  {t('moderation.form.reason')}
                </label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder={t('moderation.form.reasonPlaceholder')}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#00FF88]/50"
                />
              </div>

              {formError ? <p className="text-xs text-red-400">{formError}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
                >
                  {t('moderation.form.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-lg bg-[#00FF88] px-4 py-2 text-sm font-bold text-[#050608] hover:bg-[#00FF88]/90 disabled:opacity-50"
                >
                  {t('moderation.form.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation modal. */}
      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-red-500/20 bg-[#0b0d11] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-bold text-red-300">{t('moderation.delete.title')}</h2>
            <p className="mb-4 text-sm text-white/60">
              {t('moderation.delete.confirm')}{' '}
              <span className="font-mono text-white/90">{pendingDelete.term}</span>
            </p>
            <label className="mb-1 block text-xs text-white/50">
              {t('moderation.delete.reasonLabel')}
            </label>
            <input
              type="text"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder={t('moderation.form.reasonPlaceholder')}
              className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-red-500/50"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                {t('moderation.delete.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-500/90 disabled:opacity-50"
              >
                {t('moderation.delete.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Audit history modal (read-only, append-only). */}
      {auditTerm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setAuditTerm(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#0b0d11] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <History size={18} aria-hidden />
                  {t('moderation.audit.title')}
                </h2>
                <p className="mt-0.5 font-mono text-xs text-white/40">{auditTerm.term}</p>
              </div>
              <button
                type="button"
                onClick={() => setAuditTerm(null)}
                className="text-white/40 hover:text-white"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="overflow-y-auto">
              {auditLoading ? (
                <p className="py-8 text-center text-sm text-white/40">{t('moderation.loading')}</p>
              ) : audits.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">
                  {t('moderation.audit.empty')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {audits.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#00FF88]">
                          {t(`moderation.audit.action.${a.action}`)}
                        </span>
                        <span className="text-xs text-white/40">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {t('moderation.audit.actor')}: {a.actorUserId ?? '—'}
                      </div>
                      {a.reason ? (
                        <div className="mt-0.5 text-xs text-white/50">
                          {t('moderation.audit.reason')}: {a.reason}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
