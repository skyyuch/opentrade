/**
 * Public surface of the shared/errors module.
 *
 * Always import `AppError` and `ErrorCode` from here, never from the
 * individual files — that way we can move things around without sweeping
 * callers.
 */

export { AppError, type AppErrorDetails } from './AppError.js';
export { ErrorCode } from './ErrorCode.js';
