/**
 * Sanity test for `AppError` that doubles as the canary for the api workspace's
 * Vitest stack (M6.0). If this file fails to compile or run, the workspace's
 * test infrastructure is broken before any domain logic is exercised.
 *
 * Coverage scope is intentionally narrow: every public surface of the class
 * (constructor, static `notFound`, static `serviceUnavailable`, default
 * `statusCode`, `details` handling, `cause` propagation) is asserted exactly
 * once. Replicating these in domain-specific tests would be noise; the
 * intent here is to lock the public contract.
 */

import { describe, expect, it } from 'vitest';

import { AppError } from './AppError.js';
import { ErrorCode } from './ErrorCode.js';

describe('AppError', () => {
  it('captures code, message, statusCode and details when constructed', () => {
    const err = new AppError(ErrorCode.VALIDATION_ERROR, 'invalid input', 400, {
      details: { field: 'email' },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(err.message).toBe('invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('defaults statusCode to 500 when not provided', () => {
    const err = new AppError(ErrorCode.INTERNAL_ERROR, 'boom');
    expect(err.statusCode).toBe(500);
    expect(err.details).toBeUndefined();
  });

  it('preserves the upstream cause when provided', () => {
    const upstream = new Error('upstream');
    const err = new AppError(ErrorCode.INTERNAL_ERROR, 'wrapped', 500, { cause: upstream });
    expect(err.cause).toBe(upstream);
  });

  it('produces a 404 via static notFound() helper', () => {
    const err = AppError.notFound('review not found', { id: 'r-1' });
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toBe('review not found');
    expect(err.details).toEqual({ id: 'r-1' });
  });

  it('produces a 503 via static serviceUnavailable() helper', () => {
    const err = AppError.serviceUnavailable();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(err.message).toBe('Service temporarily unavailable');
  });
});
