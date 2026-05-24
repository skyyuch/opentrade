/**
 * Application layer: authenticate a user via username + password and return
 * an OpenTrade JWT.
 *
 * This use case complements ExchangeTokenUseCase (Privy-based auth) by
 * providing a local credential login path for admin / merchant console users
 * (per ADR-0023). The returned JWT has the exact same shape so downstream
 * middleware and guards work identically.
 *
 * Security notes:
 *   - Timing-safe comparison via bcrypt prevents timing attacks.
 *   - The same generic error is returned for "user not found" and "wrong
 *     password" to avoid username enumeration (per rule 50).
 */

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IUserRepository } from '../domain/IUserRepository.js';
import type { IJwtService } from '../infrastructure/IJwtService.js';
import type { IPasswordHasher } from '../infrastructure/IPasswordHasher.js';

export type LoginInput = {
  username: string;
  password: string;
};

export type LoginOutput = {
  accessToken: string;
  expiresIn: number;
  userId: string;
};

export class LoginWithCredentialsUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly jwtService: IJwtService,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.userRepo.findByUsername(input.username);

    if (!user?.passwordHash) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid username or password', 401);
    }

    const valid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid username or password', 401);
    }

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
