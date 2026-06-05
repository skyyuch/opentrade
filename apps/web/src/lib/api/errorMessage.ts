/**
 * Centralised translator for API errors.
 *
 * Per ADR-0021 / rule 30 the OpenTrade API returns a stable
 * `{ error: { code, message, details? } }` envelope. The server-side
 * `message` is a default English fallback meant for developer logs and
 * MUST NOT be displayed to end users — that would bypass i18n and leak
 * internal phrasing into the UI.
 *
 * This helper is the single canonical place where {@link ApiClientError}
 * is mapped to a user-facing translated string. The mapping is two-tier:
 *
 *   1. `details.reason` — fine-grained sub-classification of the same
 *      `code`. For example `CONFLICT` covers both
 *      `pending_exists` and `broker_already_verified`, which want
 *      different copy. Reasons live under the `errors.reason.*`
 *      namespace.
 *
 *   2. `code` — falls back to the canonical `ErrorCode` enum
 *      (`VALIDATION_ERROR`, `CONFLICT`, …) under `errors.code.*`.
 *
 * Allow-lists are deliberately maintained as `Set`s of well-known keys.
 * `next-intl` throws on missing keys, so attempting to translate an
 * unknown reason / code would crash the page; the lookup gates ensure
 * we always fall back to the generic `INTERNAL_ERROR` copy when a new
 * server-side reason ships before the i18n bundle is updated.
 */

import { ApiClientError } from './client';

/** Reasons mirror the `details.reason` strings emitted by `apps/api`. */
const REASON_KEYS = new Set([
  // verify-broker / upload
  'pending_exists',
  'broker_already_verified',
  'no_file',
  'invalid_file_type',
  'file_too_large',
  // content moderation (ADR-0034)
  'content_rejected',
] as const);

/** Codes mirror `apps/api/src/shared/errors/ErrorCode.ts`. */
const CODE_KEYS = new Set([
  'VALIDATION_ERROR',
  'CONFLICT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMIT_EXCEEDED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  'INVALID_CREDENTIALS',
  'CONTENT_REJECTED',
] as const);

type Translator = (key: string) => string;

/**
 * Convert a thrown error into a localised string for UI display.
 *
 * @param err            The caught error. Anything that is not an
 *                       `ApiClientError` (e.g. `TypeError` from a network
 *                       glitch) falls through to the fallback string.
 * @param tErrors        Translator scoped to `errors.*` — i.e.
 *                       `useTranslations('errors')`.
 * @param fallbackText   Already-translated fallback string. Required
 *                       because callers often want a domain-specific
 *                       generic (e.g. `t('uploadFailed')` from a
 *                       different translation namespace) that the
 *                       `errors` namespace cannot reach. Defaults to the
 *                       generic `errors.code.INTERNAL_ERROR` copy.
 */
export const translateApiError = (
  err: unknown,
  tErrors: Translator,
  fallbackText?: string,
): string => {
  if (err instanceof ApiClientError) {
    const reason = (err.details as { reason?: unknown } | undefined)?.reason;
    if (typeof reason === 'string' && (REASON_KEYS as Set<string>).has(reason)) {
      return tErrors(`reason.${reason}`);
    }
    if ((CODE_KEYS as Set<string>).has(err.code)) {
      return tErrors(`code.${err.code}`);
    }
  }
  return fallbackText ?? tErrors('code.INTERNAL_ERROR');
};
