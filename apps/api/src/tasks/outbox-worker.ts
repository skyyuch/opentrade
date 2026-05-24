/**
 * Outbox worker — polls unprocessed OutboxEvents and executes on-chain
 * transactions.
 *
 * Bundled by tsup as `dist/tasks/outbox-worker.js`. Run via ECS with CMD
 * override: `["node", "dist/tasks/outbox-worker.js"]`.
 *
 * Currently handles:
 *   - `review.submitted`         → calls ReviewRegistry.submitReview() on-chain
 *   - `sbt.mint_requested`       → calls ReviewerSBT.mint() on-chain (per ADR-0021/0022)
 *   - `verification.broker_added` → ack-only (per ADR-0025 D5; ledger audit trail
 *                                   with no Phase 1 on-chain side effect)
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

const REVIEWER_SBT_ABI = [
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
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
  const sbtAddress = process.env['REVIEWER_SBT_ADDRESS'] ?? '';

  if (!rpcUrl || !relayerKey || !registryAddress) {
    log('fatal', 'Missing required env vars', {
      hasRpcUrl: !!rpcUrl,
      hasRelayerKey: !!relayerKey,
      hasRegistryAddress: !!registryAddress,
    });
    process.exit(1);
  }

  if (!sbtAddress) {
    log('warn', 'REVIEWER_SBT_ADDRESS not set — sbt.mint_requested events will be skipped');
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

  async function processSbtMintRequested(event: {
    id: string;
    aggregateId: string;
    payload: unknown;
  }) {
    if (!sbtAddress) {
      log('warn', 'Skipping sbt.mint_requested — REVIEWER_SBT_ADDRESS not configured');
      return;
    }

    const payload = event.payload as { userId: string; verificationId: string };

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.walletAddress) {
      throw new Error(`User ${payload.userId} has no wallet address for SBT mint`);
    }

    // Idempotency guard: ReviewerSBT is one-mint-per-address (soulbound, per
    // ADR-0021 Block 11). If the wallet already holds an SBT, re-emitting a
    // mint event for any reason (replay, multi-broker verification race per
    // ADR-0025 D3, manual deploy-day test mint, etc.) will revert on-chain
    // with AlreadyMinted(address). Skip + mark processedAt instead of letting
    // the worker burn 5 retries on a deterministic revert.
    const existingBalance = await publicClient.readContract({
      address: sbtAddress as `0x${string}`,
      abi: REVIEWER_SBT_ABI,
      functionName: 'balanceOf',
      args: [user.walletAddress as `0x${string}`],
    });

    if (existingBalance > 0n) {
      log('warn', 'Skipping SBT mint — wallet already holds an SBT (idempotent skip)', {
        verificationId: event.aggregateId,
        userId: payload.userId,
        wallet: user.walletAddress,
        existingBalance: existingBalance.toString(),
      });
      return;
    }

    const tokenUri = `ipfs://verification/${event.aggregateId}`;

    const { request: mintRequest } = await publicClient.simulateContract({
      address: sbtAddress as `0x${string}`,
      abi: REVIEWER_SBT_ABI,
      functionName: 'mint',
      args: [user.walletAddress as `0x${string}`, tokenUri],
      account,
    });

    const txHash = await walletClient.writeContract(mintRequest);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      throw new Error(`SBT mint transaction reverted: ${txHash}`);
    }

    log('info', 'SBT minted on-chain', {
      verificationId: event.aggregateId,
      userId: payload.userId,
      wallet: user.walletAddress,
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
        } else if (event.eventType === 'sbt.mint_requested') {
          await processSbtMintRequested(event);
        } else if (event.eventType === 'verification.broker_added') {
          // ADR-0025 D5: this event is emitted in the same transaction as the
          // `user_verified_brokers` insert during admin approve as a hash-chain
          // ledger audit trail entry. The ledger row IS the source of truth;
          // the worker has nothing to do in Phase 1 (multi-broker verification
          // stays off-chain per ADR-0025 D1, with ReviewerSBT v2 deferred to
          // Phase 2). Ack-only: fall through to `processedAt` update below.
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
