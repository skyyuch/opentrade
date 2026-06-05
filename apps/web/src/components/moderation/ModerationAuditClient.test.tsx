/**
 * ModerationAuditClient component tests (ADR-0043 transparency page).
 *
 * Scope: this island only renders the already-redacted entries the API hands
 * it and appends further pages via the cursor. The redaction itself is proven
 * server-side (PublicModerationAuditService leak-guard tests); here we cover
 * the React wiring: a populated page renders the action/category/actor/reason
 * fields, the empty state shows when there are no entries, and "load more"
 * appends the next page.
 *
 * NextIntl wrapping: the component pulls labels via `useTranslations`, so tests
 * render under `NextIntlClientProvider` with the real en.json `moderationAudit`
 * slice — assertions match the visible strings and surface i18n key drift.
 *
 * `fetchModerationAudit` is mocked module-level (matching the component's
 * `@/lib/api/client` import specifier) so the load-more path is observable
 * without a network call.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import enMessages from '../../../messages/en.json';

import { ModerationAuditClient } from './ModerationAuditClient';

import type * as ApiClientModule from '@/lib/api/client';
import type { ModerationAuditEntry } from '@/lib/api/client';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('@/lib/api/client');
  return {
    ...actual,
    fetchModerationAudit: vi.fn(),
  };
});

const apiClient = await import('@/lib/api/client');
const fetchModerationAuditMock = apiClient.fetchModerationAudit as unknown as Mock;

const ENTRY: ModerationAuditEntry = {
  id: '11111111-1111-1111-1111-111111111111',
  termId: '22222222-2222-2222-2222-222222222222',
  action: 'CREATE',
  category: 'PROFANITY',
  actor: 'admin',
  reason: 'Reported by community',
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

const renderClient = (
  initialAudits: ModerationAuditEntry[],
  initialNextCursor: string | null = null,
) =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="Asia/Hong_Kong">
      <ModerationAuditClient initialAudits={initialAudits} initialNextCursor={initialNextCursor} />
    </NextIntlClientProvider>,
  );

afterEach(() => {
  vi.resetAllMocks();
});

describe('ModerationAuditClient — populated page', () => {
  it('renders the redacted fields for an entry', () => {
    renderClient([ENTRY]);

    expect(screen.getByText('Added term')).toBeInTheDocument();
    expect(screen.getByText('Profanity')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText(/Reported by community/)).toBeInTheDocument();
    // The opaque term id is shown; the term text is never on the wire.
    expect(screen.getByText(new RegExp(ENTRY.termId))).toBeInTheDocument();
  });

  it('falls back to the uncategorised label when category is null', () => {
    renderClient([{ ...ENTRY, category: null }]);
    expect(screen.getByText('Uncategorised')).toBeInTheDocument();
  });

  it('shows the no-reason placeholder when reason is empty', () => {
    renderClient([{ ...ENTRY, reason: null }]);
    expect(screen.getByText('(no reason provided)')).toBeInTheDocument();
  });

  it('hides the load-more button when there is no next cursor', () => {
    renderClient([ENTRY], null);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});

describe('ModerationAuditClient — empty state', () => {
  it('renders the empty message when there are no entries', () => {
    renderClient([]);
    expect(screen.getByText('No moderation changes have been recorded yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});

describe('ModerationAuditClient — load more', () => {
  it('appends the next page and clears the cursor when exhausted', async () => {
    const second: ModerationAuditEntry = {
      ...ENTRY,
      id: '33333333-3333-3333-3333-333333333333',
      action: 'DELETE',
      reason: 'Duplicate entry',
    };
    fetchModerationAuditMock.mockResolvedValue({ audits: [second], nextCursor: null });

    renderClient([ENTRY], 'cursor-1');

    const button = screen.getByRole('button', { name: 'Load more' });
    await userEvent.click(button);

    expect(fetchModerationAuditMock).toHaveBeenCalledWith({ cursor: 'cursor-1' });
    await waitFor(() => {
      expect(screen.getByText('Duplicate entry')).toBeInTheDocument();
    });
    // Cursor exhausted → button gone.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows an error message when the next page fails to load', async () => {
    fetchModerationAuditMock.mockRejectedValue(new Error('network'));

    renderClient([ENTRY], 'cursor-1');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Could not load the moderation history right now. Please try again later.',
        ),
      ).toBeInTheDocument();
    });
  });
});
