/**
 * Outbox worker — polls unprocessed OutboxEvents and executes on-chain
 * transactions.
 *
 * Bundled by tsup as `dist/tasks/outbox-worker.js`. Run via ECS with CMD
 * override: `["node", "dist/tasks/outbox-worker.js"]`.
 *
 * Currently handles:
 *   - `review.submitted` → calls ReviewRegistry.submitReview() on-chain
 *
 * Per ADR-0006 outbox pattern: the API writes events to the DB in the same
 * transaction as the business entity. This worker reads them and submits the
 * on-chain transactions asynchronously, updating review status to CONFIRMED
 * or FAILED.
 */

import { PrismaClient } from '@prisma/client';
import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

const POLL_INTERVAL_MS = 15_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

const REVIEW_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'submitReview',
    inputs: [
      { name: 'brokerId', type: 'bytes32' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'ipfsCid', type: 'string' },
    ],
    outputs: [{ name: 'reviewId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

function log(level: string, msg: string, data?: Record<string, unknown>) {
  const entry = { level, msg, time: new Date().toISOString(), ...data };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

async function main() {
  log('info', 'Outbox worker starting');

  const rpcUrl = process.env['CHAIN_RPC_URL'] ?? '';
  const relayerKey = process.env['CHAIN_RELAYER_PRIVATE_KEY'] ?? '';
  const registryAddress = process.env['REVIEW_REGISTRY_ADDRESS'] ?? '';

  if (!rpcUrl || !relayerKey || !registryAddress) {
    log('fatal', 'Missing required env vars', {
      hasRpcUrl: !!rpcUrl,
      hasRelayerKey: !!relayerKey,
      hasRegistryAddress: !!registryAddress,
    });
    process.exit(1);
  }

  const chainId = Number(process.env['CHAIN_ID'] ?? '84532');
  const chain = chainId === 8453 ? base : baseSepolia;

  const account = privateKeyToAccount(relayerKey as `0x${string}`);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl),
    account,
  });

  log('info', 'Chain connection established', {
    chain: chain.name,
    chainId: chain.id,
    relayer: account.address,
    registry: registryAddress,
  });

  const prisma = new PrismaClient();

  async function processReviewSubmitted(event: {
    id: string;
    aggregateId: string;
    payload: unknown;
  }) {
    const payload = event.payload as {
      brokerId: string;
      contentHash: string;
      ipfsCid: string;
    };

    const brokerIdHash = keccak256(toHex(payload.brokerId));

    const { request } = await publicClient.simulateContract({
      address: registryAddress as `0x${string}`,
      abi: REVIEW_REGISTRY_ABI,
      functionName: 'submitReview',
      args: [brokerIdHash, payload.contentHash as `0x${string}`, payload.ipfsCid],
      account,
    });

    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted: ${txHash}`);
    }

    const reviewIdLog = receipt.logs.find(
      (l) => l.address.toLowerCase() === registryAddress.toLowerCase(),
    );
    const chainReviewId = reviewIdLog?.topics[1] ? Number(BigInt(reviewIdLog.topics[1])) : 0;

    await prisma.review.update({
      where: { id: event.aggregateId },
      data: {
        chainReviewId,
        txHash,
        status: 'CONFIRMED',
      },
    });

    log('info', 'Review confirmed on-chain', {
      reviewId: event.aggregateId,
      chainReviewId,
      txHash,
    });
  }

  async function pollOnce() {
    const events = await prisma.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (events.length === 0) return;

    log('info', `Processing ${events.length} outbox events`);

    for (const event of events) {
      try {
        if (event.eventType === 'review.submitted') {
          await processReviewSubmitted(event);
        } else {
          log('warn', `Unknown event type: ${event.eventType}`, {
            eventId: event.id,
          });
        }

        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const newAttempts = event.attempts + 1;

        log('error', 'Failed to process outbox event', {
          eventId: event.id,
          eventType: event.eventType,
          attempt: newAttempts,
          error: errMsg,
        });

        if (newAttempts >= MAX_ATTEMPTS) {
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts: newAttempts,
              lastError: errMsg,
              processedAt: new Date(),
            },
          });

          if (event.eventType === 'review.submitted') {
            await prisma.review.update({
              where: { id: event.aggregateId },
              data: { status: 'FAILED' },
            });
            log('warn', 'Review marked as FAILED after max retries', {
              reviewId: event.aggregateId,
            });
          }
        } else {
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: { attempts: newAttempts, lastError: errMsg },
          });
        }
      }
    }
  }

  let running = true;
  const shutdown = () => {
    log('info', 'Shutdown signal received');
    running = false;
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (running) {
    try {
      await pollOnce();
    } catch (err) {
      log('error', 'Poll cycle failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await prisma.$disconnect();
  log('info', 'Outbox worker stopped');
}

main().catch((err) => {
  log('fatal', 'Outbox worker crashed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
