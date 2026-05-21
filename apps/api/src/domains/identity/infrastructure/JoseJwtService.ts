/**
 * ES256 JWT service implemented with the `jose` library (v6+).
 *
 * Per rule 50 OpenTrade MUST use ES256 (asymmetric). HS256 was a Phase 0
 * placeholder — this replaces it.
 *
 * Key management:
 *   - Dev:  PEM strings in .env (JWT_PRIVATE_KEY_PEM, JWT_PUBLIC_KEY_PEM).
 *   - Prod: PEM pulled from AWS Secrets Manager at startup, passed here.
 */

import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';

import type { IJwtService, JwtPayload, VerifiedJwt } from './IJwtService.js';

const ALG = 'ES256';
const ISSUER = 'opentrade-api';
const AUDIENCE = 'opentrade';
const EXPIRATION = '1h';

export class JoseJwtService implements IJwtService {
  private readonly privateKey: ReturnType<typeof importPKCS8>;
  private readonly publicKey: ReturnType<typeof importSPKI>;

  constructor(privateKeyPem: string, publicKeyPem: string) {
    this.privateKey = importPKCS8(privateKeyPem, ALG);
    this.publicKey = importSPKI(publicKeyPem, ALG);
  }

  async sign(payload: JwtPayload): Promise<string> {
    const key = await this.privateKey;
    return new SignJWT({
      tenantId: payload.tenantId,
      role: payload.role,
      sbtTier: payload.sbtTier,
      walletAddress: payload.walletAddress,
    })
      .setProtectedHeader({ alg: ALG })
      .setSubject(payload.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(EXPIRATION)
      .sign(key);
  }

  async verify(token: string): Promise<VerifiedJwt> {
    const key = await this.publicKey;
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALG],
    });

    return {
      sub: String(payload.sub),
      tenantId: payload['tenantId'] as string,
      role: payload['role'] as string,
      sbtTier: payload['sbtTier'] as string,
      walletAddress: (payload['walletAddress'] as string | null) ?? null,
      iat: Number(payload.iat),
      exp: Number(payload.exp),
    };
  }
}
