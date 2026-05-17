/**
 * Canonical error codes returned by the OpenTrade API.
 *
 * Per cursor rule 30 every error response carries a `code` field that the
 * frontend uses for i18n lookup; the server-side `message` is a default
 * English fallback meant for developer logs, not end-user display.
 *
 * Per rule 20 we DO NOT use TypeScript `enum`. The const object + literal
 * union pattern produces the same ergonomics with zero runtime cost and no
 * surprising reverse-mapping behaviour.
 *
 * Naming: SCREAMING_SNAKE_CASE, prefixed with the domain when relevant
 * (e.g. REVIEW_NOT_FOUND). The values double as i18n message keys, so renames
 * are breaking changes and require coordination with the translation table.
 */

export const ErrorCode = {
  /** Catch-all for unexpected failures; surfaced as 500. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Input failed Zod / domain validation; surfaced as 400. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Resource lookup miss; surfaced as 404. */
  NOT_FOUND: 'NOT_FOUND',
  /** Auth credentials missing or invalid; surfaced as 401. */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Caller authenticated but not allowed; surfaced as 403. */
  FORBIDDEN: 'FORBIDDEN',
  /** Downstream dependency (DB, IPFS, chain RPC) is unhealthy; surfaced as 503. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
