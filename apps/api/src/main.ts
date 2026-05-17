/**
 * Process entrypoint for `@opentrade/api`.
 *
 * Responsibilities (and only these):
 *   1. Construct the Hono app via {@link createServer}.
 *   2. Bind it to the configured host/port through @hono/node-server.
 *   3. Wire process signal handlers so SIGTERM / SIGINT drain cleanly when
 *      ECS or `pnpm dev` (tsx watch) restarts us.
 *
 * Anything beyond that — env parsing, logger setup, routes — lives in its
 * own module so the bootstrap stays trivially auditable.
 */

import { serve } from '@hono/node-server';

import { createServer } from './http/server.js';
import { env } from './shared/env.js';
import { logger } from './shared/observability/logger.js';

const app = createServer();

const server = serve(
  {
    fetch: app.fetch,
    hostname: env.SERVER_HOST,
    port: env.SERVER_PORT,
  },
  (addressInfo) => {
    logger.info(
      {
        event: 'server.started',
        address: addressInfo.address,
        port: addressInfo.port,
        nodeEnv: env.NODE_ENV,
        corsOrigins: env.CORS_ORIGIN,
      },
      `OpenTrade API listening on http://${addressInfo.address}:${String(addressInfo.port)}`,
    );
  },
);

/**
 * Graceful shutdown. Node's default behaviour on SIGTERM is to hang on open
 * sockets indefinitely; we close the server explicitly so ECS can complete a
 * blue/green deploy within its `stopTimeout`.
 */
const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ event: 'server.shutdown', signal }, 'Received shutdown signal');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during server shutdown');
      process.exit(1);
    }
    logger.info({ event: 'server.stopped' }, 'Server stopped cleanly');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
