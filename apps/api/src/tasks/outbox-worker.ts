/**
 * Outbox worker — polls unprocessed OutboxEvents and executes on-chain
 * transactions.
 *
 * Bundled by tsup as `dist/tasks/outbox-worker.js`. Run via ECS with CMD
 * override: `["node", "dist/tasks/outbox-worker.js"]`.
 *
 * Currently handles:
 *   - `review.submitted`          → calls ReviewRegistry.submitReview() on-chain
 *   - `sbt.mint_requested`        → calls ReviewerSBT.mint() on-chain (per ADR-0021/0022)
 *   - `verification.broker_added` → ack-only (per ADR-0025 D5; ledger audit trail
 *                                    with no Phase 1 on-chain side effect)
 *   - `complaint.submitted`       → ack-only (per ADR-0029 D7; complaint stays
 *                                    off-chain in Phase 1, on-chain anchor lands
 *                                    in Phase 3 with the jury entry-point)
 *   - `complaint.verified`        → ack-only (per ADR-0029 D7)
 *   - `complaint.rejected`        → ack-only (per ADR-0029 D7; rule 00 «reject !=
 *                                    delete» — DB row stays visible, the event
 *                                    is the audit trail entry not a destructive
 *                                    side effect)
 *   - `kol.applied`               → ack-only (per ADR-0036; Phase 2 audit trail)
 *   - `kol.approved`              → ack-only (per ADR-0036 D1; future KolSbt mint
 *                                    trigger lands with kol_sbt.mint_requested)
 *   - `kol.rejected`              → ack-only (per ADR-0036 D1; rule 00 applies)
 *   - `kol.claimed`               → ack-only (per ADR-0036 D9; pre-seeded KOL
 *                                    claimed by real person)
 *   - `signal.submitted`          → calls KolSignalRegistry.emitSignal() on-chain
 *                                    (per ADR-0036 D4; graceful skip if
 *                                    KOL_SIGNAL_REGISTRY_ADDRESS not set)
 *   - `kol_sbt.mint_requested`    → calls KolSbt.mint() on-chain (per ADR-0036
 *                                    D3; graceful skip if KOL_SBT_ADDRESS not
 *                                    set or wallet already holds a KOL SBT)
 *   - `note.submitted`            → calls KolNoteRegistry.emitNote() on-chain
 *                                    (per ADR-0039 D4; graceful skip if
 *                                    KOL_NOTE_REGISTRY_ADDRESS not set)
 *   - `broker_response.submitted` → ack-only (per ADR-0037 D3; broker response
 *                                    stays off-chain in Phase 2.5, Phase 3+ may
 *                                    add on-chain anchoring or SQS fan-out)
 *
 * Per ADR-0006 outbox pattern: the API writes events to the DB in the same
 * transaction as the business entity. This worker reads them and submits the
 * on-chain transactions asynchronously, updating review status to CONFIRMED
 * or FAILED.
 */

import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

import { prisma } from '@opentrade/db';

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

const KOL_SBT_ABI = [
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

const KOL_SIGNAL_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'emitSignal',
    inputs: [
      { name: 'kolId', type: 'bytes32' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'ipfsCid', type: 'string' },
      { name: 'assetClass', type: 'uint8' },
      { name: 'direction', type: 'uint8' },
      { name: 'horizon', type: 'uint8' },
    ],
    outputs: [{ name: 'signalId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

const KOL_NOTE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'emitNote',
    inputs: [
      { name: 'kolId', type: 'bytes32' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'ipfsCid', type: 'string' },
      { name: 'linkedSignalId', type: 'uint256' },
    ],
    outputs: [{ name: 'noteId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

// Must match the on-chain KolSignalRegistry AssetClass ordinals. INDEX=6 /
// COMMODITY=7 were appended per ADR-0038 D3; the contract validation was
// widened to `<= 7` in the Session 2 UUPS upgrade (broadcast before any
// INDEX/COMMODITY signal can be anchored — see status «合約層注意»).
const ASSET_CLASS_MAP: Record<string, number> = {
  EQUITY_HK: 0,
  EQUITY_US: 1,
  FUTURES: 2,
  SPOT: 3,
  FOREX: 4,
  CRYPTO: 5,
  INDEX: 6,
  COMMODITY: 7,
};

const DIRECTION_MAP: Record<string, number> = {
  BUY: 0,
  SELL: 1,
  HOLD: 2,
};

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
  const kolSbtAddress = process.env['KOL_SBT_ADDRESS'] ?? '';
  const signalRegistryAddress = process.env['KOL_SIGNAL_REGISTRY_ADDRESS'] ?? '';
  const noteRegistryAddress = process.env['KOL_NOTE_REGISTRY_ADDRESS'] ?? '';

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

  if (!kolSbtAddress) {
    log('warn', 'KOL_SBT_ADDRESS not set — kol_sbt.mint_requested events will be skipped');
  }

  if (!signalRegistryAddress) {
    log('warn', 'KOL_SIGNAL_REGISTRY_ADDRESS not set — signal.submitted events will be ack-only');
  }

  if (!noteRegistryAddress) {
    log('warn', 'KOL_NOTE_REGISTRY_ADDRESS not set — note.submitted events will be ack-only');
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
    kolSbt: kolSbtAddress || '(not set)',
    signalRegistry: signalRegistryAddress || '(not set)',
    noteRegistry: noteRegistryAddress || '(not set)',
  });

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

  async function processSignalSubmitted(event: {
    id: string;
    aggregateId: string;
    payload: unknown;
  }) {
    if (!signalRegistryAddress) {
      log('warn', 'Skipping signal.submitted — KOL_SIGNAL_REGISTRY_ADDRESS not configured');
      return;
    }

    const signal = await prisma.signal.findUnique({
      where: { id: event.aggregateId },
    });

    if (!signal) {
      throw new Error(`Signal ${event.aggregateId} not found`);
    }

    if (!signal.ipfsCid) {
      throw new Error(`Signal ${event.aggregateId} has no ipfsCid`);
    }

    const kolIdHash = keccak256(toHex(signal.kolId));
    const assetClassUint8 = ASSET_CLASS_MAP[signal.assetClass];
    const directionUint8 = DIRECTION_MAP[signal.direction];

    if (assetClassUint8 === undefined) {
      throw new Error(`Unknown assetClass: ${signal.assetClass}`);
    }
    if (directionUint8 === undefined) {
      throw new Error(`Unknown direction: ${signal.direction}`);
    }

    const { request } = await publicClient.simulateContract({
      address: signalRegistryAddress as `0x${string}`,
      abi: KOL_SIGNAL_REGISTRY_ABI,
      functionName: 'emitSignal',
      args: [
        kolIdHash,
        signal.contentHash as `0x${string}`,
        signal.ipfsCid,
        assetClassUint8,
        directionUint8,
        signal.horizon,
      ],
      account,
    });

    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      throw new Error(`Signal transaction reverted: ${txHash}`);
    }

    const signalLog = receipt.logs.find(
      (l) => l.address.toLowerCase() === signalRegistryAddress.toLowerCase(),
    );
    const chainSignalId = signalLog?.topics[1] ? Number(BigInt(signalLog.topics[1])) : null;

    await prisma.signal.update({
      where: { id: event.aggregateId },
      data: {
        chainTxHash: txHash,
        chainSignalId,
      },
    });

    log('info', 'Signal confirmed on-chain', {
      signalId: event.aggregateId,
      chainSignalId,
      txHash,
    });
  }

  async function processNoteSubmitted(event: {
    id: string;
    aggregateId: string;
    payload: unknown;
  }) {
    if (!noteRegistryAddress) {
      log('warn', 'Skipping note.submitted — KOL_NOTE_REGISTRY_ADDRESS not configured');
      return;
    }

    const note = await prisma.kolNote.findUnique({
      where: { id: event.aggregateId },
    });

    if (!note) {
      throw new Error(`Note ${event.aggregateId} not found`);
    }

    if (!note.ipfsCid) {
      throw new Error(`Note ${event.aggregateId} has no ipfsCid`);
    }

    // The on-chain `linkedSignalId` is the Signal's on-chain id (uint256), not
    // the DB UUID (ADR-0039 D1). 0 = standalone. When the note is attached to a
    // signal that hasn't been anchored yet, throw to retry: the note will link
    // once the signal's own `signal.submitted` event lands its chainSignalId.
    let linkedSignalId = 0n;
    if (note.linkedSignalId) {
      const signal = await prisma.signal.findUnique({
        where: { id: note.linkedSignalId },
        select: { chainSignalId: true },
      });
      if (signal?.chainSignalId == null) {
        throw new Error(
          `Linked signal ${note.linkedSignalId} not yet anchored on-chain; retrying note`,
        );
      }
      linkedSignalId = BigInt(signal.chainSignalId);
    }

    const kolIdHash = keccak256(toHex(note.kolId));

    const { request } = await publicClient.simulateContract({
      address: noteRegistryAddress as `0x${string}`,
      abi: KOL_NOTE_REGISTRY_ABI,
      functionName: 'emitNote',
      args: [kolIdHash, note.contentHash as `0x${string}`, note.ipfsCid, linkedSignalId],
      account,
    });

    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      throw new Error(`Note transaction reverted: ${txHash}`);
    }

    const noteLog = receipt.logs.find(
      (l) => l.address.toLowerCase() === noteRegistryAddress.toLowerCase(),
    );
    const chainNoteId = noteLog?.topics[1] ? Number(BigInt(noteLog.topics[1])) : null;

    await prisma.kolNote.update({
      where: { id: event.aggregateId },
      data: {
        chainTxHash: txHash,
        chainNoteId,
      },
    });

    log('info', 'Note confirmed on-chain', {
      noteId: event.aggregateId,
      chainNoteId,
      txHash,
    });
  }

  async function processKolSbtMintRequested(event: {
    id: string;
    aggregateId: string;
    payload: unknown;
  }) {
    if (!kolSbtAddress) {
      log('warn', 'Skipping kol_sbt.mint_requested — KOL_SBT_ADDRESS not configured');
      return;
    }

    const payload = event.payload as { kolId: string; userId: string };

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.walletAddress) {
      throw new Error(`User ${payload.userId} has no wallet address for KOL SBT mint`);
    }

    const existingBalance = await publicClient.readContract({
      address: kolSbtAddress as `0x${string}`,
      abi: KOL_SBT_ABI,
      functionName: 'balanceOf',
      args: [user.walletAddress as `0x${string}`],
    });

    if (existingBalance > 0n) {
      log('warn', 'Skipping KOL SBT mint — wallet already holds a KOL SBT (idempotent skip)', {
        kolId: payload.kolId,
        userId: payload.userId,
        wallet: user.walletAddress,
        existingBalance: existingBalance.toString(),
      });
      return;
    }

    const tokenUri = `ipfs://kol/${event.aggregateId}`;

    const { request: mintRequest } = await publicClient.simulateContract({
      address: kolSbtAddress as `0x${string}`,
      abi: KOL_SBT_ABI,
      functionName: 'mint',
      args: [user.walletAddress as `0x${string}`, tokenUri],
      account,
    });

    const txHash = await walletClient.writeContract(mintRequest);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      throw new Error(`KOL SBT mint transaction reverted: ${txHash}`);
    }

    log('info', 'KOL SBT minted on-chain', {
      kolId: payload.kolId,
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
        } else if (
          event.eventType === 'complaint.submitted' ||
          event.eventType === 'complaint.verified' ||
          event.eventType === 'complaint.rejected'
        ) {
          // ADR-0029 D7: complaint vocabulary stays off-chain in Phase 1.
          // The Review row (kind = COMPLAINT) IS the source of truth; the
          // events are emitted in the same transaction as the row insert /
          // verifiedAt update / adminNote update so a future indexer or the
          // Phase 3 jury entry-point can replay the audit trail.
          //
          // For `complaint.rejected` specifically: rule 00 «reject != delete»
          // — the worker MUST NOT touch the Review row, MUST NOT set deletedAt,
          // MUST NOT mutate the body. Acknowledging the event is the entirety
          // of Phase 1 behaviour. Phase 3 jury vote handlers and Phase 2 SQS
          // fan-out land in successor ADRs.
        } else if (
          event.eventType === 'kol.applied' ||
          event.eventType === 'kol.approved' ||
          event.eventType === 'kol.rejected' ||
          event.eventType === 'kol.claimed'
        ) {
          // ADR-0036 D1/D9: KOL lifecycle events emitted in the same
          // transaction as the Kol row status change. Phase 2 ack-only;
          // future handlers may trigger KolSbt mint or SQS fan-out.
        } else if (event.eventType === 'signal.submitted') {
          await processSignalSubmitted(event);
        } else if (event.eventType === 'note.submitted') {
          await processNoteSubmitted(event);
        } else if (event.eventType === 'kol_sbt.mint_requested') {
          await processKolSbtMintRequested(event);
        } else if (event.eventType === 'broker_response.submitted') {
          // ADR-0037 D3: broker response to a complaint stays off-chain in
          // Phase 2.5. The Review row with respondsToReviewId set IS the
          // source of truth; this event is the audit trail entry. Phase 3+
          // may add on-chain anchoring or SQS fan-out.
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
