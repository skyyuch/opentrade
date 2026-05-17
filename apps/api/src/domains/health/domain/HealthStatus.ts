/**
 * Domain value object: overall and per-dependency health status.
 *
 * Per cursor rule 20 we model finite sets as const-object + literal-union,
 * never as TypeScript `enum`. Status values are SCREAMING_SNAKE_CASE strings
 * so they survive JSON round-trips and double as i18n keys downstream.
 *
 * Semantics:
 *   - `OK`        — fully operational.
 *   - `DEGRADED`  — partially functional; reads succeed, writes might lag,
 *                   or a non-critical dependency is failing.
 *   - `DOWN`      — at least one critical dependency is unreachable; the
 *                   service cannot serve its core responsibility.
 */

export const HealthStatus = {
  OK: 'OK',
  DEGRADED: 'DEGRADED',
  DOWN: 'DOWN',
} as const;

export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];
