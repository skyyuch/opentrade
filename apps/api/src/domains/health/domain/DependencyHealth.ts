/**
 * Domain value object: health snapshot for a single downstream dependency.
 *
 * Pure data type — no methods, no framework imports. Lives in the domain
 * layer because the health report aggregate composes a list of these.
 *
 * Fields:
 *   - `name`     — stable identifier (`"database"`, `"ipfs"`, ...). Used
 *                  both for log filtering and as an i18n key on the client.
 *   - `status`   — see {@link HealthStatus}.
 *   - `latencyMs`— wall-clock latency of the probe, present iff the probe
 *                  completed (success or failure with a measurable round
 *                  trip). Omitted when the probe timed out or threw
 *                  before any I/O.
 *   - `error`    — short developer-facing message, present only when
 *                  `status !== OK`. MUST NOT contain PII (rule 50) or
 *                  raw stack traces.
 */

import type { HealthStatus } from './HealthStatus.js';

export type DependencyHealth = {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
};
