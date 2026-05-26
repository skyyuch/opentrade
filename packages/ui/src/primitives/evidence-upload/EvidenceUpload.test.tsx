/**
 * EvidenceUpload component tests (M7.5b).
 *
 * Three responsibilities split across describe blocks:
 *   1. State-rendering — the primitive renders the correct visual
 *      affordance for each of the three states (`idle` / `uploading` /
 *      `uploaded`), including the image-vs-PDF branch in `uploaded`.
 *   2. Interaction — file pick + drag-drop + remove all reach the
 *      caller via the expected callbacks, and interactions are guarded
 *      during `uploading` / `uploaded` / `disabled`.
 *   3. A11y — every theme × state combination passes axe-core with
 *      colour-contrast disabled (rule 60 §UI primitives a11y gate).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import {
  EvidenceUpload,
  type EvidenceUploadFile,
  type EvidenceUploadLabels,
} from './EvidenceUpload';

const LABELS: EvidenceUploadLabels = {
  dropTitle: 'Click to select a file, or drag here',
  dropDesc: 'Ensure your statement contains your name and the broker name.',
  sizeHint: 'PDF / JPG / PNG / WebP, max 10MB',
  uploading: 'Uploading…',
  removeFile: 'Remove file',
  ipfsCidLabel: 'IPFS CID',
};

const SAMPLE_IMAGE: EvidenceUploadFile = {
  fileName: 'statement-2026-04.png',
  fileSize: 1.4 * 1024 * 1024,
  cid: 'bafybeih7jvqz4uhmkb6kgbcsnyclrtmoxlsfak7s2y7q4mpxr6t7zlhqvm',
  previewUrl: 'blob:http://localhost/abc',
};

const SAMPLE_PDF: EvidenceUploadFile = {
  fileName: 'monthly-statement-q1.pdf',
  fileSize: 0.8 * 1024 * 1024,
  cid: 'bafkreigh7xs2vw4n6vc7w5y3kpmlbqyhd2uemfg5p3z6anzy2xzv4lsoua',
  previewUrl: null,
};

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

/**
 * Runs axe-core against the document and asserts zero violations.
 * Mirrors the SentimentBadge axe gate from M6.2b — colour-contrast
 * stays disabled because jsdom does not paint.
 */
const expectNoAxeViolations = async (container: HTMLElement): Promise<void> => {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });
  expect(results.violations).toEqual([]);
};

describe('EvidenceUpload — state rendering', () => {
  it('renders the idle prompt with dropTitle + dropDesc + sizeHint', () => {
    render(
      <EvidenceUpload
        status="idle"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(screen.getByText(LABELS.dropTitle)).toBeInTheDocument();
    expect(screen.getByText(LABELS.dropDesc)).toBeInTheDocument();
    expect(screen.getByText(LABELS.sizeHint)).toBeInTheDocument();
  });

  it('exposes a focusable file input wrapped in a label when idle', () => {
    const { container } = render(
      <EvidenceUpload
        status="idle"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).toBeInTheDocument();
    // The native <label htmlFor=…> association is the click + screen-
    // reader binding; we assert both the label and the for/id pair.
    const label = container.querySelector(`label[for="${input.id}"]`);
    expect(label).not.toBeNull();
    expect(label).toHaveAttribute('data-state', 'idle');
  });

  it('does not render a file input when status="uploading"', () => {
    const { container } = render(
      <EvidenceUpload
        status="uploading"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('does not render a file input when status="uploaded" (must remove first)', () => {
    const { container } = render(
      <EvidenceUpload
        status="uploaded"
        uploaded={SAMPLE_IMAGE}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('renders the uploading spinner caption when status="uploading"', () => {
    render(
      <EvidenceUpload
        status="uploading"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(screen.getByText(LABELS.uploading)).toBeInTheDocument();
    expect(screen.queryByText(LABELS.dropTitle)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('marks the zone aria-busy while uploading', () => {
    const { container } = render(
      <EvidenceUpload
        status="uploading"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const zone = container.querySelector('[data-state="uploading"]');
    expect(zone).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the image thumbnail when an image uploaded record is supplied', () => {
    render(
      <EvidenceUpload
        status="uploaded"
        uploaded={SAMPLE_IMAGE}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(screen.getByText(SAMPLE_IMAGE.fileName)).toBeInTheDocument();
    const thumb = screen.getByAltText(SAMPLE_IMAGE.fileName);
    expect(thumb).toHaveAttribute('src', SAMPLE_IMAGE.previewUrl);
  });

  it('renders the generic file icon (no <img>) for non-image uploads', () => {
    render(
      <EvidenceUpload
        status="uploaded"
        uploaded={SAMPLE_PDF}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(screen.getByText(SAMPLE_PDF.fileName)).toBeInTheDocument();
    expect(screen.queryByAltText(SAMPLE_PDF.fileName)).toBeNull();
  });

  it('shows the truncated CID chip + label for an uploaded file', () => {
    render(
      <EvidenceUpload
        status="uploaded"
        uploaded={SAMPLE_PDF}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(screen.getByText(LABELS.ipfsCidLabel)).toBeInTheDocument();
    expect(
      screen.getByText(`${SAMPLE_PDF.cid.slice(0, 10)}...${SAMPLE_PDF.cid.slice(-6)}`),
    ).toBeInTheDocument();
  });

  it('falls back to the idle empty state when status="uploaded" but uploaded is null', () => {
    render(
      <EvidenceUpload
        status="uploaded"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    expect(screen.getByText(LABELS.dropTitle)).toBeInTheDocument();
    expect(screen.queryByText(LABELS.removeFile)).toBeNull();
  });
});

describe('EvidenceUpload — interaction', () => {
  it('calls onFileSelected when the user picks a file via the hidden input', async () => {
    const onFileSelected = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <EvidenceUpload
        status="idle"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={onFileSelected}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['hello'], 'note.pdf', { type: 'application/pdf' });
    await user.upload(input, file);
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('calls onFileSelected on drop with the dropped file', () => {
    const onFileSelected = vi.fn();
    const { container } = render(
      <EvidenceUpload
        status="idle"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={onFileSelected}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const zone = container.querySelector<HTMLElement>('[data-state="idle"]')!;
    const file = new File(['hello'], 'dropped.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('does NOT call onFileSelected on drop while uploading', () => {
    const onFileSelected = vi.fn();
    const { container } = render(
      <EvidenceUpload
        status="uploading"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={onFileSelected}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const zone = container.querySelector<HTMLElement>('[data-state="uploading"]')!;
    const file = new File(['hello'], 'dropped.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('does NOT call onFileSelected on drop when disabled', () => {
    const onFileSelected = vi.fn();
    const { container } = render(
      <EvidenceUpload
        status="idle"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={onFileSelected}
        onRemove={vi.fn()}
        labels={LABELS}
        disabled
      />,
    );
    const zone = container.querySelector<HTMLElement>('[data-state="idle"]')!;
    const file = new File(['hello'], 'dropped.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('does NOT call onFileSelected on drop when already uploaded (must remove first)', () => {
    const onFileSelected = vi.fn();
    const { container } = render(
      <EvidenceUpload
        status="uploaded"
        uploaded={SAMPLE_IMAGE}
        acceptAttribute={ACCEPT}
        onFileSelected={onFileSelected}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const zone = container.querySelector<HTMLElement>('[data-state="uploaded"]')!;
    const file = new File(['hello'], 'replacement.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('calls onRemove when the user clicks the remove button on the uploaded chip', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <EvidenceUpload
        status="uploaded"
        uploaded={SAMPLE_PDF}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={onRemove}
        labels={LABELS}
      />,
    );
    await user.click(screen.getByText(LABELS.removeFile));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps the file input keyboard-accessible (sr-only but focusable)', () => {
    // The label-wraps-input pattern lets the browser handle Enter/Space
    // natively once the input is focused. We don't simulate file-picker
    // dialogs in jsdom; instead we assert the input is reachable by
    // checking it is not display:none nor tabindex=-1 — both would
    // remove it from the focus order.
    const { container } = render(
      <EvidenceUpload
        status="idle"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).not.toBeNull();
    expect(input.tabIndex).not.toBe(-1);
    // Tailwind's standalone `hidden` class sets `display: none` which
    // takes the element out of the focus order entirely. The sr-only
    // pattern uses `absolute`/clip-rect (visually hidden, focusable).
    expect(input.classList.contains('hidden')).toBe(false);
    expect(input).toHaveAccessibleName(LABELS.dropTitle);
  });

  it('passes the accept attribute through to the hidden file input', () => {
    const { container } = render(
      <EvidenceUpload
        status="idle"
        uploaded={null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).toHaveAttribute('accept', ACCEPT);
  });
});

describe('EvidenceUpload — a11y gate', () => {
  it.each([
    ['neon', 'idle'],
    ['neon', 'uploading'],
    ['neon', 'uploaded'],
    ['semantic', 'idle'],
    ['semantic', 'uploading'],
    ['semantic', 'uploaded'],
  ] as const)('passes axe for theme=%s state=%s', async (theme, state) => {
    const { container } = render(
      <EvidenceUpload
        status={state}
        uploaded={state === 'uploaded' ? SAMPLE_PDF : null}
        acceptAttribute={ACCEPT}
        onFileSelected={vi.fn()}
        onRemove={vi.fn()}
        labels={LABELS}
        theme={theme}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
