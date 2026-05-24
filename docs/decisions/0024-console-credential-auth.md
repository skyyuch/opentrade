# ADR-0024: Console Username/Password Authentication

- **Status**: Accepted
- **Date**: 2026-05-23
- **Deciders**: Project Founder

---

## Context

The merchant console (`apps/console`) originally required Privy (social/wallet) login — the same flow as the user-facing web app. However, admin users need a simpler, direct login method that does not depend on an external wallet or social account. A username/password login path is needed for:

1. Admin bootstrap — the first admin user needs to log in without any external dependency.
2. Internal operators who may not have a crypto wallet.
3. Faster dev/staging access during testing.

This must coexist with the existing Privy login, not replace it — broker owners will continue to use Privy for wallet-based authentication.

## Decision

Add a local credential (username + password) authentication path to the console, coexisting with Privy login:

1. **Database**: Add optional `username` (unique) and `passwordHash` fields to the `User` model.
2. **API**: New `POST /v1/auth/login` endpoint following DDD architecture — `LoginWithCredentialsUseCase` (application layer), `IPasswordHasher` port + `BcryptPasswordHasher` adapter (infrastructure layer).
3. **Console UI**: Update `AuthGate` to show a username/password form as the primary login method, with Privy login as a secondary option below a divider.
4. **Auth hook**: Extend `useOpenTradeAuth` with `setManualToken` / `clearManualToken` and `isAuthenticated` (combines Privy + manual auth state).
5. **Seed**: Bootstrap an `admin` user via the existing seed script.

The returned JWT is identical in structure to the Privy exchange flow — all downstream middleware and guards work without modification.

## Alternatives Considered

| Alternative                | Why rejected                                                   |
| -------------------------- | -------------------------------------------------------------- |
| Replace Privy entirely     | Broker owners benefit from wallet login for claim verification |
| Separate admin portal      | Over-engineering for Phase 1; adds maintenance burden          |
| Magic link / OTP via email | Adds email service dependency; overkill for internal admin     |
| OAuth2 (Google/GitHub)     | External dependency for what is essentially an internal tool   |

## Consequences

### Positive

- Admin can log in immediately without wallet/social setup.
- No external dependency for admin access.
- JWT-based — existing auth middleware works unchanged.
- DDD ports/adapters pattern makes the hasher swappable (e.g. argon2 in future).

### Negative

- Password management burden (reset flow not yet implemented).
- Must ensure bcrypt cost factor stays adequate (currently 10, review periodically).
- Additional attack surface (brute force) — mitigated by rate limiting.

## Security Considerations

- Passwords hashed with bcrypt (cost 10) via `bcryptjs`.
- Same generic error for "user not found" and "wrong password" — prevents username enumeration.
- Rate limiting on login endpoint (5 req/min/IP per rule 50).
- No PII logged (only `userId` in logs).
- JWT payload identical to Privy path (sub, tenantId, role, sbtTier, walletAddress).

## Implementation Notes

### Files Changed

- `packages/db/prisma/schema.prisma` — `username`, `passwordHash` on User
- `apps/api/src/shared/errors/ErrorCode.ts` — `INVALID_CREDENTIALS`
- `apps/api/src/domains/identity/domain/IUserRepository.ts` — `findByUsername`
- `apps/api/src/domains/identity/infrastructure/PrismaUserRepository.ts` — implement `findByUsername`
- `apps/api/src/domains/identity/infrastructure/IPasswordHasher.ts` — port
- `apps/api/src/domains/identity/infrastructure/BcryptPasswordHasher.ts` — adapter
- `apps/api/src/domains/identity/application/LoginWithCredentialsUseCase.ts` — use case
- `apps/api/src/domains/identity/presentation/routes.ts` — `POST /login`
- `apps/console/src/hooks/useOpenTradeAuth.ts` — `setManualToken`, `clearManualToken`, `isAuthenticated`
- `apps/console/src/hooks/useCurrentUser.ts` — use `isAuthenticated`
- `apps/console/src/components/layout/AuthGate.tsx` — credential form + Privy secondary
- `apps/console/src/lib/api/client.ts` — `loginWithCredentials`
- `apps/console/messages/*.json` — i18n keys
- `packages/db/scripts/seed.ts` — admin user bootstrap

### Future Work

- Password reset flow (Phase 2+).
- Rate limiting middleware on `POST /v1/auth/login` (currently relies on global rate limit).
- Consider argon2 migration when native module support is stable.

## References

- [ADR-0005](./0005-privy-auth-strategy.md) — Original Privy auth strategy
- Rule 50 — Security standards (rate limiting, no PII logging)
- Rule 30 — API/Hono conventions (DDD, Zod, AppError)
