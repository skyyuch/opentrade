/**
 * Port for JWT signing and verification.
 *
 * Per rule 50 OpenTrade uses ES256 (ECDSA P-256). Infrastructure adapters
 * implement this with the `jose` library. Tests can inject a stub that
 * returns predictable tokens.
 */

export type JwtPayload = {
  sub: string;
  tenantId: string;
  role: string;
  sbtTier: string;
  walletAddress: string | null;
};

export type VerifiedJwt = JwtPayload & {
  iat: number;
  exp: number;
};

export type IJwtService = {
  sign(payload: JwtPayload): Promise<string>;
  verify(token: string): Promise<VerifiedJwt>;
};
