/**
 * Process entrypoint for `@opentrade/api`.
 *
 * Responsibilities (and only these):
 *   1. Construct the Hono app via {@link createServer}.
 *   2. Bind it to the configured host/port through @hono/node-server.
 *   3. Start background workers (PriceRecorder + SettleWorker) in the same
 *      process for simplicity. Can be extracted to separate ECS tasks later.
 *   4. Wire process signal handlers so SIGTERM / SIGINT drain cleanly when
 *      ECS or `pnpm dev` (tsx watch) restarts us.
 */

import { serve } from '@hono/node-server';

import { prisma } from '@opentrade/db';

import { PrismaSignalRepository } from './domains/signals/infrastructure/PrismaSignalRepository.js';
import { createServer } from './http/server.js';
import { env } from './shared/env.js';
import { logger } from './shared/observability/logger.js';
import { PriceRecorder, YahooFinanceProvider } from './tasks/price-recorder/index.js';
import { SettleWorker } from './tasks/settle-worker.js';

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

// ---------------------------------------------------------------------------
// Background workers: PriceRecorder (hourly OHLC) + SettleWorker (5-min settle)
// Per ADR-0036 D7: off-chain Price Recorder polls price sources; Settle Worker
// resolves expired signals. Both run in the API process for simplicity.
// ---------------------------------------------------------------------------

const signalRepo = new PrismaSignalRepository(prisma);

const priceRecorder = new PriceRecorder(prisma, {
  intervalMs: 60 * 60 * 1000, // 1 hour
  providers: [new YahooFinanceProvider()],
});

const settleWorker = new SettleWorker(prisma, signalRepo, {
  intervalMs: 5 * 60 * 1000, // 5 minutes
});

priceRecorder.start();
settleWorker.start();

logger.info(
  { event: 'workers.started', priceRecorderInterval: '1h', settleWorkerInterval: '5m' },
  'Background workers started (PriceRecorder + SettleWorker)',
);

/**
 * Graceful shutdown. Node's default behaviour on SIGTERM is to hang on open
 * sockets indefinitely; we close the server explicitly so ECS can complete a
 * blue/green deploy within its `stopTimeout`.
 */
const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ event: 'server.shutdown', signal }, 'Received shutdown signal');

  priceRecorder.stop();
  settleWorker.stop();

  server.close((err) => {
    void prisma.$disconnect().then(() => {
      if (err) {
        logger.error({ err }, 'Error during server shutdown');
        process.exit(1);
      }
      logger.info({ event: 'server.stopped' }, 'Server stopped cleanly');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
