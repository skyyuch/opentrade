/**
 * Centralised error → JSON response mapping.
 *
 * Per cursor rule 30, every error the API returns has the shape:
 * ```json
 * {
 *   "error": {
 *     "code":    "VALIDATION_ERROR",
 *     "message": "Human-readable default English message",
 *     "details": { "...": "..." }
 *   }
 * }
 * ```
 *
 * The frontend uses `error.code` for i18n lookup; `error.message` is a
 * developer-facing fallback and MUST NOT contain PII or stack traces. Stack
 * traces and upstream causes are logged server-side via Pino, never echoed
 * to the client.
 *
 * Recognised throwables (priority order):
 *   1. {@link AppError}       — our own structured errors; pass through verbatim.
 *   2. {@link HTTPException}  — Hono's framework exception; map status + message.
 *   3. {@link ZodError}       — input validation failure from zValidator hooks
 *                                we still call manually; map to 400.
 *   4. Anything else          — INTERNAL_ERROR + 500 + log stack trace.
 */

import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { logger as rootLogger } from '../../shared/observability/logger.js';

import type { AppHonoEnv } from '../types.js';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Logger } from 'pino';

type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
};

/**
 * Implements `app.onError(...)`. Returns the JSON envelope and matching HTTP
 * status; the caller (server.ts) wires it via `app.onError(errorHandler)`.
 *
 * Defensive note: Hono's `Variables` typing says `logger` and `requestId` are
 * always present, but `onError` can fire BEFORE the requestContext middleware
 * runs (e.g. if a route is hit before `app.use('*', requestId())` resolves on
 * the very first request, or if requestId middleware itself throws). We cast
 * to a widening type to honestly model that runtime gap.
 */
export const errorHandler = (err: Error, c: Context<AppHonoEnv>): Response => {
  const maybeLogger = c.get('logger') as Logger | undefined;
  const maybeRequestId = c.get('requestId') as string | undefined;
  const requestLog = maybeLogger ?? rootLogger;
  const requestId = maybeRequestId;

  if (err instanceof AppError) {
    requestLog.warn(
      {
        event: 'request.error',
        code: err.code,
        statusCode: err.statusCode,
        details: err.details,
        cause: err.cause,
      },
      err.message,
    );
    return c.json<ErrorResponseBody>(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
          ...(requestId !== undefined ? { requestId } : {}),
        },
      },
      err.statusCode as ContentfulStatusCode,
    );
  }

  if (err instanceof HTTPException) {
    const status = err.status;
    requestLog.warn(
      {
        event: 'request.http_exception',
        statusCode: status,
      },
      err.message,
    );
    return c.json<ErrorResponseBody>(
      {
        error: {
          code: mapHttpStatusToCode(status),
          message: err.message,
          ...(requestId !== undefined ? { requestId } : {}),
        },
      },
      status,
    );
  }

  if (err instanceof ZodError) {
    requestLog.warn(
      {
        event: 'request.validation_error',
        issues: err.issues,
      },
      'Validation failed',
    );
    return c.json<ErrorResponseBody>(
      {
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details: { issues: err.issues },
          ...(requestId !== undefined ? { requestId } : {}),
        },
      },
      400,
    );
  }

  requestLog.error({ event: 'request.unhandled_error', err }, 'Unhandled error');
  return c.json<ErrorResponseBody>(
    {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
        ...(requestId !== undefined ? { requestId } : {}),
      },
    },
    500,
  );
};

/**
 * Maps an HTTP status thrown via `HTTPException` to a canonical
 * {@link ErrorCode}. Anything we don't recognise falls back to
 * `INTERNAL_ERROR`, which is also what callers see for unexpected throws.
 */
const mapHttpStatusToCode = (status: ContentfulStatusCode): string => {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
};
