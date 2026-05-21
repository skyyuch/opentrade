/**
 * Application layer: exchange a Privy access token for an OpenTrade JWT.
 *
 * Flow (per ADR-0005):
 *   1. Frontend obtains a Privy access token via social login.
 *   2. Frontend calls POST /v1/auth/exchange with that token.
 *   3. This use case verifies the Privy token, upserts the user in DB,
 *      and signs an OpenTrade ES256 JWT containing minimal claims.
 *
 * Pure orchestration — no HTTP, no Prisma, no `process.*` direct access.
 */

import type { IUserRepository } from '../domain/IUserRepository.js';
import type { IJwtService } from '../infrastructure/IJwtService.js';
import type { IPrivyVerifier } from '../infrastructure/IPrivyVerifier.js';

export type ExchangeTokenInput = {
  privyAccessToken: string;
  tenantId: string;
};

export type ExchangeTokenOutput = {
  accessToken: string;
  expiresIn: number;
  userId: string;
};

export class ExchangeTokenUseCase {
  constructor(
    private readonly privyVerifier: IPrivyVerifier,
    private readonly userRepo: IUserRepository,
    private readonly jwtService: IJwtService,
  ) {}

  async execute(input: ExchangeTokenInput): Promise<ExchangeTokenOutput> {
    const privyClaims = await this.privyVerifier.verifyToken(input.privyAccessToken);

    const user = await this.userRepo.upsertByPrivyId({
      tenantId: input.tenantId,
      privyId: privyClaims.userId,
      walletAddress: privyClaims.walletAddress,
      email: privyClaims.email,
    });

    const expiresIn = 3600;
    const accessToken = await this.jwtService.sign({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      sbtTier: user.sbtTier,
      walletAddress: user.walletAddress,
    });

    return { accessToken, expiresIn, userId: user.id };
  }
}
