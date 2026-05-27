# ADR-0036: KOL Signal Architecture (Phase 2)

## Status

Accepted (Amended 2026-05-27 — add D1.1 hybrid KOL registration flow)

## Date

2026-05-26

## Context

Phase 2 MVP-B introduces financial KOL (Key Opinion Leader) signal tracking — the second major on-chain subsystem for OpenTrade. The platform's core promise per `docs/00-vision.md` §二 is to end the "win loudly, lose quietly" pattern among Hong Kong financial KOLs (財演): KOLs publicly broadcast winning calls while silently deleting losing ones.

The 2026-05-25 team meeting (archived in [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「KOL 功能」) confirmed KOL signal tracking as the Phase 2 critical-path feature. STAGING.md S7 reserved ADR-0036 for this decision.

Nine design questions were resolved through structured planning discussion on 2026-05-26:

1. Who can become a KOL? (onboarding gate vs open access)
2. How to prevent Sybil attacks (one person, many wallets, cherry-pick winners)?
3. Should signals use commit-reveal to prevent post-hoc manipulation?
4. What assets can KOLs call? (scope restriction vs open)
5. How to calculate win rates (hit definition + stoploss handling)?
6. Which oracle to use for price settlement?
7. When to introduce subscription/notification?
8. How to handle KOLs who refuse to onboard (red label policy)?
9. What value does the platform offer KOLs in return for transparency?

### Public-fairness red-line check

All nine decisions below preserve rule 00 red lines: no signal can be deleted or modified once on-chain; no admin function can alter historical signal records; KOL rankings are not influenced by payment.

## Decision

### D1: Open KOL onboarding with credential display

Any L1+ user (Privy-authenticated) can apply to become a KOL. There is no minimum follower count, no mandatory professional certification gate, and no social media age requirement.

KOLs may optionally upload professional credentials (CFA, CFP, CFTe, SFC Type 4/9 license). Uploaded credentials enter an admin moderation queue (reusing the pattern from `/admin/verifications` per [ADR-0022](./0022-l2-commitment-hash-verification.md)). Approved credentials display as specific badges on the KOL profile — e.g. "CFA Charterholder", "SFC Type 4 Licensed" — rather than abstract tiers (no gold/silver badge system).

Rationale: The platform provides tools and transparency, not gatekeeping. Readers judge KOL trustworthiness via on-chain signal history, win rates, and credential badges. This aligns with the "platform does not act as gatekeeper" principle established during planning.

#### D1.1: Hybrid KOL registration flow (added 2026-05-27)

KOL onboarding uses a **hybrid approach**: the underlying account system is unified (one Privy user + one wallet + multiple SBTs), but a dedicated `/become-a-kol` landing page provides a tailored entry point for KOL outreach.

**Why hybrid**: Pure "apply from within" buries the KOL entry point. Pure "separate registration" creates duplicate accounts. The hybrid gives marketing a clean URL while keeping the architecture simple.

**Flow diagram**:

```
/become-a-kol (landing page)
    │
    ├── Not logged in → Login modal (Google/Apple/Email/Wallet/iAM Smart)
    │                        │
    │                        └── After login, redirect back
    │
    └── Logged in → Check identity verification status
                        │
                        ├── Already verified (iAM Smart login or previously verified)
                        │       → Skip to KOL application form
                        │
                        └── Not verified
                                → iAM Smart verification step (or phone+social fallback)
                                → Then KOL application form

KOL application form:
    - Display name / Bio
    - Social accounts (Twitter/X, YouTube, Instagram)
    - Asset class focus areas (EQUITY_HK, EQUITY_US, CRYPTO, FOREX, etc.)
    - Optional credential uploads (CFA, SFC license, CFP, CFTe)
    - Terms acceptance + Submit

    → Creates Kol row with status=PENDING
    → Admin review queue

Admin decision:
    ├── Approved → mint KolSbt + in-app notification + grant /kol console access
    └── Rejected → in-app notification with reason + allow reapply
```

**UX states on `/become-a-kol`**:

| State                                   | Display                                                |
| --------------------------------------- | ------------------------------------------------------ |
| Unauthenticated                         | Landing page hero + "Get Started" CTA → triggers login |
| Authenticated, unverified               | Identity verification step (iAM Smart or fallback)     |
| Authenticated, verified, no application | KOL application form                                   |
| Application pending                     | "Under review" status card with submission timestamp   |
| Application rejected                    | Rejection reason + "Reapply" CTA                       |
| Application approved                    | Redirect to `/kol/dashboard`                           |

**Marketing utility**: The URL `/become-a-kol` can be shared directly in KOL outreach campaigns, YouTube descriptions, Instagram bios, etc. The page handles all states gracefully regardless of the user's current status.

**Relationship with existing `/kol/onboarding`**: The existing 4-step wizard at `/kol/onboarding` becomes the implementation target for the application form portion. `/become-a-kol` wraps it with a marketing-oriented landing page that handles auth and verification gates before entering the wizard.

### D2: Sybil prevention via iAM Smart with transition-period fallback

The primary Sybil prevention mechanism is Hong Kong's iAM Smart (智方便) digital identity system, which provides one-person-one-identity guarantees tied to HKID.

**Architecture**: An `IIdentityProvider` interface in `packages/shared` abstracts the identity verification layer. Phase 2 ships a Hong Kong iAM Smart adapter. Future adapters for Taiwan FidO, Singapore SingPass, and US ID.me are structurally reserved but not implemented.

**Transition period**: iAM Smart API integration requires OGCIO government approval (estimated 3-6 months). Until approved, KOL identity uses a soft-verification fallback:

- Phone number hash (SHA-256, stored hash only, never plaintext — per rule 50 PII protection)
- Social account OAuth unique binding (one social account cannot be bound to multiple KolSbt holders)
- CAPTCHA on application submission

Once iAM Smart is live, all soft-verified KOLs must upgrade within 90 days or lose KOL status. The upgrade flow is transparent to users: KOL profiles display "soft-verified (transition)" vs "iAM Smart verified" badges.

**PII handling**: iAM Smart returns HKID number + real name. Per rule 50 and PDPO, the platform stores only a salted hash of the HKID. Raw identity data is never persisted, logged, or transmitted beyond the verification handshake.

**Cross-ADR interaction**: This decision promotes STAGING.md S2 (ADR-0031) from Phase 3 to Phase 2. ADR-0031 covers the `IIdentityProvider` interface design in detail. [ADR-0005](./0005-privy-aa-wallet.md) (Privy) coexists — Privy handles wallet/auth, iAM Smart handles civil identity. They are complementary layers.

### D3: KolSbt — independent soulbound token parallel to ReviewerSbt

A new `KolSbt` contract (ERC-721 soulbound, pattern per [ADR-0021](./0021-reviewer-sbt-contract-design.md)) is deployed for KOL identity. It is structurally independent from `ReviewerSbt` because the two represent orthogonal roles:

- A user can hold both ReviewerSbt (L2 verified investor) and KolSbt (verified KOL)
- A user with KolSbt is excluded from jury cases involving themselves or brokers they have endorsed (case-level block, not hard block — they retain JurySbt if held)
- `KolSbt` minting is triggered by admin approval of the KOL application (same outbox-worker-mint pattern as ReviewerSbt)

The jury case-level filter logic is deferred to Phase 3 jury implementation (per [ADR-0008](./0008-jury-phased-implementation.md)). ADR-0036 only declares the policy; the `JuryPool` contract enforces it when built.

### D4: Pure Live signal emission (no commit-reveal)

Signals are emitted immediately and publicly on-chain. No commit-reveal mechanism is used in Phase 2.

**Rationale**: The core problem OpenTrade solves — "KOLs delete losing calls" — is fully addressed by chain immutability. Once a signal is on-chain with a block timestamp, the KOL cannot delete it, modify it, or claim it was never made. The dashboard displays all historical signals transparently.

Commit-reveal was evaluated and rejected for Phase 2 because:

- It does not prevent the actual attack surface (selective on-chain publishing of off-chain calls)
- It creates a new attack surface: KOLs can hide signals during the reveal window and only promote winners after the fact
- It removes KOL commercial incentive (immediate influence) which is critical for onboarding
- It doubles contract complexity and gas cost

Vault mode (optional commit-reveal for alpha protection) is reserved for Phase 5+ as an advanced KOL feature, if demand emerges.

### D5: Unrestricted asset scope with selective oracle settlement

KOLs can emit signals for any asset class. The platform does not restrict callable symbols.

**Asset class enum**: `EQUITY_HK | EQUITY_US | FUTURES | SPOT | FOREX | CRYPTO`

**Symbol**: Free-text input (e.g. "0700.HK", "AAPL", "BTC/USD", "EUR/JPY"). The platform maintains an `OracleRegistry` mapping supported symbols to price feed sources. Signals for symbols with oracle coverage are auto-settled; signals without coverage reach `UNRESOLVED` status at horizon expiry.

**Horizon**: KOL selects from 8 preset durations: 1d / 3d / 7d / 14d / 30d / 90d / 180d / 365d. This balances flexibility (day traders to long-term investors) with dashboard aggregation (finite set of buckets for comparison).

### D6: Dual win-rate display with stoploss-triggers-loss

Two win-rate metrics are computed and displayed side by side:

| Metric                 | Logic                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Direction win rate** | At horizon close: did the price move in the called direction? BUY signal + close > entry = direction hit |
| **Target win rate**    | During horizon: did the price ever touch the target price? More stringent, rewards precision             |

**Stoploss handling**: If the price touches the stoploss at any point during the horizon, the signal is immediately judged `STOPPED` (loss), regardless of subsequent price recovery. This mirrors real trading discipline where a stop-loss exit is final.

**Signal terminal states**:

| State           | Condition                                                                 |
| --------------- | ------------------------------------------------------------------------- |
| `HIT_TARGET`    | Price touched target during horizon (before any stoploss touch)           |
| `HIT_DIRECTION` | Price at horizon close is in correct direction but did not reach target   |
| `STOPPED`       | Price touched stoploss during horizon                                     |
| `EXPIRED`       | Horizon elapsed, neither target nor stoploss touched, direction incorrect |
| `UNRESOLVED`    | No oracle coverage for this symbol; cannot auto-settle                    |

### D7: Hybrid oracle architecture (Chainlink + traditional finance API)

Neither Chainlink nor Pyth provides period high/low data needed for D6 (target hit detection + stoploss triggering). Both only serve latest-price feeds.

**Architecture**: An off-chain Price Recorder service polls price sources hourly, stores OHLC (Open/High/Low/Close) data in a `PriceRecord` DB table, and a Settle Worker queries accumulated OHLC at horizon expiry to determine signal outcomes.

| Asset class    | Price source                                            | Coverage                     |
| -------------- | ------------------------------------------------------- | ---------------------------- |
| CRYPTO         | Chainlink Price Feeds on Base L2 (via off-chain poller) | Major pairs (BTC, ETH, etc.) |
| EQUITY_US      | Yahoo Finance API                                       | All NYSE/NASDAQ listed       |
| EQUITY_HK      | Yahoo Finance API / TradingView                         | HSI index + major stocks     |
| FOREX          | Yahoo Finance API                                       | Major pairs                  |
| FUTURES / SPOT | Yahoo Finance API / TradingView                         | Coverage varies              |

The on-chain `IPriceOracle` interface receives settlement reports from the Settle Worker. Phase 2 does not perform fully on-chain settlement (the off-chain worker is the oracle reporter). Phase 5+ may add Chainlink Automation or Gelato for trustless on-chain settlement.

### D8: Free follow + free push notification in Phase 2

Users can follow KOLs (bookmark) and receive push notifications when followed KOLs emit new signals. Both features are free in Phase 2.

Paid subscription tiers are deferred to Phase 5+ per [ADR-0007](./0007-no-token-in-v1.md) (no token or paid mechanism in V1). The `KolFollow` DB model is the foundation for future paid subscription logic.

### D9: Admin pre-seed ~30 HK KOLs with red-label policy

Admin pre-builds ~30 KOL profiles from publicly available data (YouTube/Instagram/Twitter top Hong Kong stock KOLs). Pre-seeded profiles display a red "Not verified on OpenTrade" label until the real KOL claims and verifies their identity.

This mirrors the broker SFC pre-seed pattern (commit #4 `packages/db/seed/data/sfc-brokers.json`). Benefits:

- Cold-start: platform is not empty on Phase 2 launch
- Pressure: fans searching for their KOL see the red label, creating organic pressure for KOLs to onboard
- SEO: 30 KOL profile pages are indexable from day one

Phase 5+ opens community nomination (any user can nominate a KOL for pre-seeding).

**KOL value proposition** (why KOLs would onboard):

- Credential badges (CFA, SFC license) visible on profile
- Win-rate dashboard as verifiable track record
- Platform promotes verified KOLs on broker detail pages ("Related KOLs" section)
- Embeddable win-rate card for KOL's own YouTube/IG bio
- Phase 5+: KOL analytics dashboard (follower data, signal impact analysis, SaaS tools)

## Alternatives Considered

### A1: Gated KOL access (CFA/SFC license required)

- Pros: Maximum compliance safety; only regulated individuals
- Cons: Excludes the core target audience (unlicensed YouTube KOLs who are the main "financial pundit" problem in HK); reduces platform to a regulated-only directory with minimal differentiation from SFC's own registry
- Why rejected: Contradicts vision §二 target market definition

### A2: Commit-reveal 14-day mechanism

- Pros: Prevents theoretical front-running of KOL's own trades (alpha protection)
- Cons: Does not solve the actual problem (selective publishing); creates new surface G (post-hoc winner claiming during reveal window); eliminates KOL commercial incentive; doubles contract complexity
- Why rejected: Live mode + chain immutability already solves the vision's core pain point

### A3: Platform-curated asset list (only ~100 symbols)

- Pros: Every signal has oracle coverage; dashboard is always complete
- Cons: Severely limits KOL expressiveness; misses the long tail of HK/US individual stocks that KOLs actually call; creates artificial restriction that KOLs will route around (calling on Telegram instead)
- Why rejected: UNRESOLVED status is a better design than artificial restriction — the record exists on-chain even without auto-settlement

### A4: Single win-rate metric (direction only)

- Pros: Simpler dashboard, less cognitive load
- Cons: Direction-only win rate approaches 50% for random guessing, providing no differentiation; target hit rate rewards precision and separates skilled KOLs from coin-flippers
- Why rejected: Dual display respects both casual readers (direction) and sophisticated readers (target)

### A5: Social OAuth only for Sybil prevention (no iAM Smart)

- Pros: Faster to implement; no government API dependency
- Cons: Social accounts can be bought/created in bulk; does not provide civil-identity-level uniqueness; HK government digital identity is a strategic alignment with the "embrace regulation" narrative
- Why rejected: iAM Smart is the strongest Sybil prevention available in HK and aligns with the platform's regulatory positioning

## Consequences

### Positive

- Chain immutability directly solves "win loudly, lose quietly" without complex commit-reveal
- Open onboarding maximizes KOL pool; credential badges provide differentiation without gatekeeping
- iAM Smart integration provides government-grade Sybil prevention while aligning with "embrace regulation" narrative
- `IIdentityProvider` interface future-proofs cross-region expansion (TW, SG, US)
- Dual win-rate display gives readers nuanced signal quality assessment
- Pre-seeded KOL profiles solve cold-start and create organic onboarding pressure
- UNRESOLVED status preserves signal records even without oracle, enabling future retroactive settlement

### Negative / Trade-offs

- iAM Smart integration requires 3-6 month government approval; transition period uses weaker soft-verification
- Off-chain Price Recorder is a centralization point (Phase 5+ should move toward trustless on-chain settlement)
- ~30 pre-seeded KOL profiles require manual curation (one-time operational cost)
- KOL profiles for unclaimed public figures may face defamation claims (mitigated: profiles only contain publicly available information and clearly label "Not verified on OpenTrade")
- Free notifications in Phase 2 means no revenue from KOL feature until Phase 5+

### Neutral

- `KolSignalRegistry` contract is structurally independent from `ReviewRegistry` — no contract upgrade needed for existing Phase 1 contracts
- KolSbt is a new contract deployment, not an upgrade to ReviewerSbt
- IPFS payload format follows the same v2 pattern established in ADR-0028

## Implementation Notes

Implementation spans M8-M9 of the 14-milestone execution plan (17 commits across 4 sessions):

**M8 (planning + contract + DB + API foundation)**:

- M8.0 — This ADR
- M8.1 — ADR-0031 iAM Smart identity provider interface
- M8.2 — DB schema: Kol + Signal + KolApplication + KolFollow + enums + indexes + migration
- M8.3 — Seed ~30 HK KOL pre-built profiles
- M8.4 — Outbox event vocabulary: 6 KOL events (ack-only)
- M8.5 — `KolSignalRegistry.sol` contract + tests + deploy script
- M8.6 — `IPriceOracle.sol` interface + `MockPriceOracle.sol`
- M8.7 — API KOL domain bootstrap (DDD four layers)
- M8.8 — API KOL application + admin approve/reject endpoints
- M8.9 — API Signal emit + list + public read endpoints

**M9 (worker + UI + tests)**:

- M9.1 — Off-chain Price Recorder (PriceRecord table + cron poller)
- M9.2 — Settle Worker (horizon expiry + oracle query + settle logic)
- M9.3 — Console: KOL onboarding + signal submit UI
- M9.4 — Web: KOL directory + profile + dashboard
- M9.5 — Web: broker page "Related KOLs" + signal detail page
- M9.6 — i18n: ~150 KOL keys across 3 locales
- M9.7 — Tests: unit + integration + e2e

Each commit is independently deployable per rule 96.

## References

- Vision: [`docs/00-vision.md`](../00-vision.md) §二 (KOL problem statement)
- Roadmap: [`docs/02-roadmap.md`](../02-roadmap.md) Phase 2 (KOL signal)
- Meeting archive: [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「KOL 功能」
- Related ADR: [ADR-0005](./0005-privy-aa-wallet.md) — Privy coexists with iAM Smart
- Related ADR: [ADR-0007](./0007-no-token-in-v1.md) — no paid subscription in V1
- Related ADR: [ADR-0008](./0008-jury-phased-implementation.md) — jury case-level KOL filter
- Related ADR: [ADR-0019](./0019-review-registry-contract-design.md) — ReviewRegistry contract pattern to mirror
- Related ADR: [ADR-0021](./0021-reviewer-sbt-contract-design.md) — ReviewerSbt parallel for KolSbt
- Related ADR: [ADR-0028](./0028-deprecate-five-star-rating.md) — IPFS payload v2 pattern
- Related ADR: [ADR-0029](./0029-complaints-vs-reviews-separation.md) — same-table discriminator pattern
- Related ADR: [ADR-0031](./0031-iam-smart-identity-provider.md) — iAM Smart identity provider interface
- Cursor rule 00 — project red lines (no deletion, no paid ranking)
- Cursor rule 30 — API DDD four layers
- Cursor rule 41 — Solidity standards
- Cursor rule 50 — PII protection (iAM Smart HKID hash-only storage)
