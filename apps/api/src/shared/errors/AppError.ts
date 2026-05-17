/**
 * Domain-aware error class for `apps/api`.
 *
 * Per cursor rule 30 we ALWAYS throw `AppError` (or a subclass) for any
 * predictable failure; the central error middleware then maps it to a
 * uniform JSON response of shape `{ error: { code, message, details? } }`.
 *
 * Why a subclass of `Error`:
 *   - Preserves `Error.captureStackTrace` for fast debugging.
 *   - `instanceof AppError` checks survive across module boundaries because
 *     the constructor is referentially stable inside a single bundle.
 *   - Pino logs the prototype chain so the error code is searchable in
 *     CloudWatch without parsing the `message`.
 */

import { ErrorCode } from './ErrorCode.js';

import type { ErrorCode as ErrorCodeType } from './ErrorCode.js';

/**
 * Structured payload attached to an {@link AppError}. Always JSON-serialisable
 * — no functions, no `Error` instances, no PII. The error middleware passes
 * this verbatim into the response body's `error.details` field.
 */
export type AppErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly details: AppErrorDetails | undefined;

  /**
   * @param code        Stable, machine-readable error code (see {@link ErrorCode}).
   * @param message     Default English message for developer logs.
   * @param statusCode  HTTP status to return; defaults to 500.
   * @param options     Optional `details` payload and / or upstream `cause`.
   */
  constructor(
    code: ErrorCodeType,
    message: string,
    statusCode = 500,
    options: { details?: AppErrorDetails; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;

    // Maintains a clean stack pointing at the throw site, not this constructor.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convenience for 404 lookups. Domains should prefer narrow subclasses
   * (e.g. `ReviewNotFoundError`) over calling this directly, but for the
   * Phase 0 health endpoint this is sufficient.
   */
  static notFound(message = 'Resource not found', details?: AppErrorDetails): AppError {
    return new AppError(
      ErrorCode.NOT_FOUND,
      message,
      404,
      details !== undefined ? { details } : {},
    );
  }

  /**
   * Convenience for 503 outages, e.g. when the health endpoint cannot reach
   * the database.
   */
  static serviceUnavailable(
    message = 'Service temporarily unavailable',
    details?: AppErrorDetails,
  ): AppError {
    return new AppError(
      ErrorCode.SERVICE_UNAVAILABLE,
      message,
      503,
      details !== undefined ? { details } : {},
    );
  }
}
