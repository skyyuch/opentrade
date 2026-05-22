/**
 * Privy server-side token verifier using `@privy-io/node` v0.18+.
 *
 * Per ADR-0005 this uses the standalone `verifyAccessToken` function and the
 * `PrivyClient` for user data enrichment. The verification key is fetched
 * from the Privy dashboard (JWKS endpoint or SPKI PEM string).
 */

import { PrivyClient, verifyAccessToken } from '@privy-io/node';

import { AppError, ErrorCode } from '../../../shared/errors/index.js';

import type { IPrivyVerifier, PrivyClaims } from './IPrivyVerifier.js';

export class PrivyVerifier implements IPrivyVerifier {
  private readonly client: PrivyClient;
  private readonly appId: string;
  private readonly verificationKey: string;

  constructor(appId: string, appSecret: string, verificationKey: string) {
    this.appId = appId;
    this.verificationKey = verificationKey;
    this.client = new PrivyClient({ appId, appSecret });
  }

  async verifyToken(accessToken: string): Promise<PrivyClaims> {
    try {
      const claims = await verifyAccessToken({
        access_token: accessToken,
        app_id: this.appId,
        verification_key: this.verificationKey,
      });

      let walletAddress: string | null = null;
      let email: string | null = null;

      try {
        const user = await this.client.users()._get(claims.user_id);
        const walletAccount = user.linked_accounts.find(
          (a: { type: string }) => a.type === 'smart_wallet' || a.type === 'wallet',
        );
        const emailAccount = user.linked_accounts.find((a: { type: string }) => a.type === 'email');

        if (walletAccount && 'address' in walletAccount) {
          walletAddress = walletAccount.address;
        }
        if (emailAccount && 'address' in emailAccount) {
          email = emailAccount.address;
        }
      } catch {
        // User data enrichment is best-effort
      }

      return {
        userId: claims.user_id,
        walletAddress,
        email,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid or expired Privy access token', 401, {
        cause: error,
      });
    }
  }
}
