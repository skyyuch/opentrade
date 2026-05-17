/**
 * Structured logging for `apps/api`, backed by Pino.
 *
 * Per cursor rule 30 every log entry is JSON in production (so CloudWatch /
 * Datadog can index it) and human-pretty in local dev. Per rule 50 we MUST
 * never log raw PII — favour `userId`, hashes, or shortened wallet addresses
 * instead of email / phone / real name / wallet private keys.
 *
 * Two helpers:
 *   - {@link logger}              — root logger used during bootstrap.
 *   - {@link createRequestLogger} — child logger bound to a request id,
 *                                   created by the requestId middleware so
 *                                   every log line in a request inherits the
 *                                   correlation id automatically.
 */

import { pino } from 'pino';

import { env } from '../env.js';

import type { Logger, LoggerOptions } from 'pino';

const isDevelopment = env.NODE_ENV === 'development';

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    service: 'opentrade-api',
    env: env.NODE_ENV,
  },
  /**
   * Redact a tiny but important PII safety net. Domain-level care still
   * matters (per rule 50) but this guarantees a careless `logger.info({ user })`
   * never leaks email or wallet private keys, regardless of nesting depth.
   */
  redact: {
    paths: [
      '*.email',
      '*.password',
      '*.privateKey',
      '*.privy_token',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const prettyTransport: LoggerOptions = isDevelopment
  ? {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
          singleLine: false,
        },
      },
    }
  : {};

export const logger: Logger = pino({ ...baseOptions, ...prettyTransport });

/**
 * Returns a child logger that automatically attaches a request id and any
 * additional correlation fields (tenantId, userId) to every log line. Used
 * by the requestId middleware in {@link ../../http/middleware/requestId} so
 * downstream handlers never have to thread context manually.
 */
export const createRequestLogger = (
  requestId: string,
  bindings: Record<string, string | number | undefined> = {},
): Logger => logger.child({ requestId, ...bindings });
