import { cva, type VariantProps } from 'class-variance-authority';
import { FileText, Upload, X } from 'lucide-react';
import { useId, useState, type DragEvent, type ReactNode } from 'react';

import { cn } from '../../utils/cn';

/**
 * EvidenceUpload — drop-zone primitive for evidence file pickers.
 *
 * Visual three-state machine (`idle` / `uploading` / `uploaded`) lifted
 * from the original hand-rolled drop-zone in
 * `apps/web/src/components/verify/VerifyForm.tsx` (lines 431-510 of the
 * pre-M7.5 file). The primitive owns:
 *
 *   - Drag-drop ergonomics (`onDragOver` / `onDragLeave` / `onDrop`).
 *   - A visually-hidden but focusable `<input type="file">` wrapped in
 *     a `<label>` so click + keyboard activation are browser-native
 *     (no fake `role="button"`, no `aria-button-name` nor
 *     `nested-interactive` axe violations).
 *   - The three visual states (idle prompt / uploading spinner /
 *     uploaded chip with thumbnail + CID).
 *   - Disabled / interaction guards (no drop while uploading, no
 *     re-pick while a file is already attached — caller must call
 *     `onRemove` first).
 *
 * The primitive owns NO I/O:
 *
 *   - It never calls Pinata.
 *   - It never validates MIME or size — the host receives the raw
 *     `File` via `onFileSelected` and decides whether to upload or
 *     surface a localised validation error. (The `acceptAttribute`
 *     prop is a UX hint on the OS file picker only; drag-drop bypasses
 *     it entirely so the host MUST validate.)
 *   - It never holds the IPFS CID — the host is the source of truth
 *     for `uploaded` and pipes the verified result back via props.
 *
 * Why this split: complaint and verify flows reuse the same Pinata
 * endpoint (`POST /v1/auth/verify-broker/upload`) but each form needs
 * its own error mapping (`/verify` shows reject reason for
 * `pending_exists`, complaint form does not). Keeping I/O in the host
 * lets each form share the same drop-zone visual while owning its own
 * error vocabulary — same pattern as `SentimentPicker` keeping labels
 * caller-supplied to avoid `next-intl` coupling per rule 10.
 *
 * Themes:
 *   - `neon` matches the dark `apps/web` palette (hardcoded `#00FF88`,
 *     `red-300`, `white/X` — the literals already shipping in
 *     `VerifyForm`). Required for the M7.5 ComplaintForm in `apps/web`.
 *   - `semantic` flips to Tailwind tokens (`success` / `danger` /
 *     `muted`) for future console / merchant surfaces. Same precedent
 *     as `SentimentBadge.theme = 'semantic'`. New surfaces should
 *     prefer `semantic`.
 *
 * Accessibility:
 *   - In `idle` state the wrapper is a `<label htmlFor>` paired with a
 *     visually-hidden but focusable file input. Screen readers
 *     announce "file upload, [dropTitle]"; keyboard users Tab to the
 *     input and press Enter/Space (browser-native). Drag-drop works
 *     on the label.
 *   - In `uploading` state the zone receives `aria-busy="true"`.
 *   - In `uploaded` state the CID chip is `aria-live="polite"` so
 *     screen readers announce the IPFS CID once an upload settles.
 */

const zoneVariants = cva(
  [
    'group relative block w-full overflow-hidden rounded-xl border-2 border-dashed p-8 transition-all',
    'focus-within:outline-none focus-within:ring-2',
  ],
  {
    variants: {
      theme: {
        neon: '',
        semantic: '',
      },
      state: {
        idle: '',
        uploading: '',
        uploaded: '',
      },
      isDragging: {
        true: '',
        false: '',
      },
      disabled: {
        true: 'pointer-events-none opacity-60',
        false: '',
      },
    },
    compoundVariants: [
      // ── neon theme ────────────────────────────────────────────────────
      {
        theme: 'neon',
        state: 'idle',
        isDragging: false,
        class:
          'cursor-pointer border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10 focus-within:ring-[#00FF88]',
      },
      {
        theme: 'neon',
        state: 'idle',
        isDragging: true,
        class: 'cursor-pointer border-[#00FF88] bg-[#00FF88]/5',
      },
      {
        theme: 'neon',
        state: 'uploading',
        class: 'border-[#00FF88]/40 bg-[#00FF88]/5',
      },
      {
        theme: 'neon',
        state: 'uploaded',
        class: 'border-blue-500/50 bg-blue-500/5 hover:border-blue-500/60',
      },
      // ── semantic theme ────────────────────────────────────────────────
      {
        theme: 'semantic',
        state: 'idle',
        isDragging: false,
        class:
          'cursor-pointer border-border bg-muted/40 hover:border-foreground/40 hover:bg-muted/60 focus-within:ring-ring',
      },
      {
        theme: 'semantic',
        state: 'idle',
        isDragging: true,
        class: 'cursor-pointer border-success bg-success/5',
      },
      {
        theme: 'semantic',
        state: 'uploading',
        class: 'border-success/40 bg-success/5',
      },
      {
        theme: 'semantic',
        state: 'uploaded',
        class: 'border-info bg-info/5 hover:border-info/80',
      },
    ],
    defaultVariants: {
      theme: 'neon',
      state: 'idle',
      isDragging: false,
      disabled: false,
    },
  },
);

/**
 * The host's view of an uploaded file. The host constructs this once
 * the Pinata upload settles; the primitive reads it for display only.
 *
 * `previewUrl` is a local `URL.createObjectURL(file)` blob URL when
 * the file is an image (the primitive renders it as a thumbnail) and
 * `null` for non-image MIME types (the primitive falls back to a
 * generic `FileText` icon). The host owns the URL lifecycle — calling
 * `URL.revokeObjectURL` in a cleanup effect when the upload is
 * replaced or removed (see `apps/web/src/components/verify/VerifyForm`
 * for the canonical cleanup pattern).
 */
export type EvidenceUploadFile = {
  fileName: string;
  fileSize: number;
  cid: string;
  previewUrl: string | null;
};

export type EvidenceUploadLabels = {
  /** Empty-state CTA title, e.g. "Click to select or drag here". */
  dropTitle: string;
  /** Empty-state subtitle, free-form per call site. */
  dropDesc: string;
  /** Helper line below the zone, e.g. "PDF / JPG / PNG / WebP, max 10MB". */
  sizeHint: string;
  /** Spinner caption while uploading. */
  uploading: string;
  /** Button text on the uploaded chip. */
  removeFile: string;
  /** Label preceding the CID chip, e.g. "IPFS CID:". */
  ipfsCidLabel: string;
};

export type EvidenceUploadProps = Omit<
  VariantProps<typeof zoneVariants>,
  'state' | 'isDragging'
> & {
  /**
   * The visual state of the drop-zone. The host owns the underlying
   * state machine (idle → uploading → uploaded; error states render
   * outside the primitive).
   */
  status: 'idle' | 'uploading' | 'uploaded';
  /**
   * The uploaded file metadata. Required when `status === 'uploaded'`;
   * ignored otherwise. Passing `null` while `status === 'uploaded'`
   * is a host bug — the primitive falls back to the empty state to
   * avoid crashing.
   */
  uploaded: EvidenceUploadFile | null;
  /**
   * The HTML `accept` attribute passed to the hidden `<input>`. UX
   * hint only — the OS file picker uses it to filter, but drag-drop
   * bypasses it, so the host MUST validate file.type and file.size
   * independently inside `onFileSelected`.
   */
  acceptAttribute: string;
  /** Called when the user picks or drops a file. Raw `File`, unvalidated. */
  onFileSelected: (file: File) => void;
  /** Called when the user clicks the remove button on the uploaded chip. */
  onRemove: () => void;
  /** Localised copy resolved by the caller (next-intl, etc.). */
  labels: EvidenceUploadLabels;
  className?: string;
};

// Visually-hide the input while keeping it focusable + screen-reader
// readable (the classic sr-only pattern). Using `display: none` would
// take the input out of the focus order and the OS file picker dialog
// could not be reached via keyboard.
const SR_ONLY =
  'absolute h-px w-px overflow-hidden border-0 p-0 [clip:rect(0,0,0,0)] whitespace-nowrap';

export const EvidenceUpload = ({
  status,
  uploaded,
  acceptAttribute,
  onFileSelected,
  onRemove,
  labels,
  theme,
  disabled,
  className,
}: EvidenceUploadProps): ReactNode => {
  const [isDragging, setIsDragging] = useState(false);
  const inputId = useId();
  const cidId = useId();

  const resolvedTheme = theme ?? 'neon';
  const isDisabled = disabled ?? false;
  const isUploading = status === 'uploading';
  const hasUploaded = status === 'uploaded' && uploaded !== null;
  // Render the empty state if the host says `uploaded` but forgot to
  // supply the file metadata — protective rather than crash-y.
  const effectiveState: 'idle' | 'uploading' | 'uploaded' = isUploading
    ? 'uploading'
    : hasUploaded
      ? 'uploaded'
      : 'idle';

  const handleDragOver = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    if (isDisabled || isUploading || hasUploaded) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    if (isDisabled || isUploading || hasUploaded) return;
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  const zoneClasses = cn(
    zoneVariants({
      theme: resolvedTheme,
      state: effectiveState,
      isDragging,
      disabled: isDisabled,
    }),
  );

  const renderInnerContent = (): ReactNode => {
    if (effectiveState === 'uploading') {
      return (
        <div className="flex flex-col items-center justify-center gap-3">
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-full',
              resolvedTheme === 'neon' ? 'bg-[#00FF88]/15' : 'bg-success/15',
            )}
          >
            <div
              className={cn(
                'size-5 animate-spin rounded-full border-2',
                resolvedTheme === 'neon'
                  ? 'border-[#00FF88]/30 border-t-[#00FF88]'
                  : 'border-success/30 border-t-success',
              )}
            />
          </div>
          <span
            className={cn(
              'text-sm font-bold',
              resolvedTheme === 'neon' ? 'text-white' : 'text-foreground',
            )}
          >
            {labels.uploading}
          </span>
        </div>
      );
    }

    if (effectiveState === 'uploaded' && uploaded) {
      return (
        <div className="z-10 flex flex-col items-center justify-center">
          {uploaded.previewUrl ? (
            <div
              className={cn(
                'mb-3 flex size-32 items-center justify-center overflow-hidden rounded-xl border',
                resolvedTheme === 'neon' ? 'border-white/10 bg-black/40' : 'border-border bg-muted',
              )}
            >
              <img
                src={uploaded.previewUrl}
                alt={uploaded.fileName}
                className="size-full object-cover"
              />
            </div>
          ) : (
            <div
              className={cn(
                'mb-3 flex size-12 items-center justify-center rounded-full',
                resolvedTheme === 'neon' ? 'bg-blue-500/20 text-blue-400' : 'bg-info/15 text-info',
              )}
            >
              <FileText size={24} aria-hidden />
            </div>
          )}
          <span
            className={cn(
              'mb-1 max-w-xs truncate font-bold',
              resolvedTheme === 'neon' ? 'text-white' : 'text-foreground',
            )}
          >
            {uploaded.fileName}
          </span>
          <span
            className={cn(
              'mb-4 text-sm',
              resolvedTheme === 'neon' ? 'text-white/50' : 'text-muted-foreground',
            )}
          >
            {(uploaded.fileSize / 1024 / 1024).toFixed(2)} MB
          </span>
          <div
            id={cidId}
            aria-live="polite"
            className={cn(
              'mb-3 flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs',
              resolvedTheme === 'neon'
                ? 'bg-[#00FF88]/10 text-[#00FF88]'
                : 'bg-success/10 text-success',
            )}
          >
            <span
              className={cn(resolvedTheme === 'neon' ? 'text-white/40' : 'text-muted-foreground')}
            >
              {labels.ipfsCidLabel}
            </span>
            <span className="truncate" title={uploaded.cid}>
              {uploaded.cid.slice(0, 10)}...{uploaded.cid.slice(-6)}
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors',
              resolvedTheme === 'neon'
                ? 'bg-red-500/10 text-red-400 hover:text-red-300'
                : 'bg-danger/10 text-danger hover:bg-danger/20',
            )}
          >
            <X size={14} aria-hidden /> {labels.removeFile}
          </button>
        </div>
      );
    }

    return (
      <div className="pointer-events-none flex flex-col items-center justify-center">
        <div
          className={cn(
            'mb-4 flex size-12 items-center justify-center rounded-full transition-transform group-hover:scale-110',
            resolvedTheme === 'neon'
              ? 'bg-white/5 text-white/50'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <Upload size={24} aria-hidden />
        </div>
        <span
          className={cn(
            'mb-2 font-bold',
            resolvedTheme === 'neon' ? 'text-white' : 'text-foreground',
          )}
        >
          {labels.dropTitle}
        </span>
        <span
          className={cn(
            'max-w-xs text-center text-sm',
            resolvedTheme === 'neon' ? 'text-white/40' : 'text-muted-foreground',
          )}
        >
          {labels.dropDesc}
        </span>
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {effectiveState === 'idle' ? (
        // <label> is the native, axe-clean way to bind a fake-button
        // visual surface to a file input: click on the label triggers
        // the picker, Enter/Space on the (focusable) input also
        // triggers it, drag-drop fires on the label. No role="button",
        // no nested-interactive violation, no JS click handler needed.
        <label
          htmlFor={inputId}
          className={zoneClasses}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-state="idle"
          data-theme={resolvedTheme}
        >
          <input
            id={inputId}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
            }}
            className={SR_ONLY}
            accept={acceptAttribute}
            disabled={isDisabled}
            aria-label={labels.dropTitle}
          />
          {renderInnerContent()}
        </label>
      ) : (
        // Uploading + uploaded states: no input is rendered (the next
        // pick re-mounts a fresh one in the idle branch). The wrapper
        // is a plain div with drag-drop handlers that block re-pick.
        <div
          className={zoneClasses}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-busy={isUploading || undefined}
          aria-describedby={hasUploaded ? cidId : undefined}
          data-state={effectiveState}
          data-theme={resolvedTheme}
        >
          {renderInnerContent()}
        </div>
      )}
      <p
        className={cn(
          'pt-1 text-xs',
          resolvedTheme === 'neon' ? 'text-white/40' : 'text-muted-foreground',
        )}
      >
        {labels.sizeHint}
      </p>
    </div>
  );
};
