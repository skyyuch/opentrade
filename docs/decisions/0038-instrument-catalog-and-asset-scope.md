# ADR-0038: Instrument catalog with category-scoped search; extend asset class scope (amends ADR-0036 D5)

## Status

Accepted

## Date

2026-05-31

## Context

Per [ADR-0036](./0036-kol-signal-architecture.md) D5, a KOL signal's target instrument
(`symbol`) is a **free-text string** with no validation beyond length
(`z.string().min(1).max(30)`), and no relationship to any catalog. The signal form
([`apps/web/src/app/[locale]/kol/signals/new/page.tsx`](../../apps/web/src/app/[locale]/kol/signals/new/page.tsx))
is a bare text input that merely uppercases on change.

This creates two problems the project owner wants solved:

1. **Poor UX + symbol fragmentation.** A KOL typing `005` cannot discover that the
   instrument is `00005 匯豐控股 (HSBC Holdings)`. Worse, free typing produces
   divergent spellings (`BTC/USDT` vs `BTCUSDT` vs `BTC-USDT`) that fragment the
   `symbol` index and break oracle settlement (`keccak256(symbol)` hashes to
   different feeds). ADR-0036 itself flagged the `OracleRegistry` (D5) as the
   intended symbol → feed map, but it was never built.
2. **Missing asset categories.** The product needs five user-facing categories —
   港股 (HK equity), 美股 (US equity), 指數 (index), 虛擬貨幣 (crypto),
   商品 (commodity). The current `AssetClass` enum
   (`EQUITY_HK | EQUITY_US | FUTURES | SPOT | FOREX | CRYPTO`) covers HK/US/crypto
   but has **no `INDEX`** and **no dedicated `COMMODITY`** value.

ADR-0036 D5 explicitly **rejected** A3 ("platform-curated asset list of ~100 symbols")
because it would limit KOL expressiveness and push them to call signals on Telegram
instead. That concern is valid and we preserve it: this ADR adds a curated catalog as
a **UX aid**, not a hard restriction — free-text input remains a first-class fallback.
This is therefore an **amendment / extension** of ADR-0036 D5, not a reversal.

## Decision

### D1: Add a platform `Instrument` catalog (global reference table)

Introduce an `Instrument` model in `packages/db/prisma/schema.prisma`:

- Parallel-column multilingual names (`nameEn`, `nameZh`, `nameZhHans`) per
  cursor rule 51 §A — see D4.
- `symbol` (normalized canonical code, uppercase), `displayCode` (what the UI shows),
  `exchange?`, `source` (provenance), `isActive` (soft-disable, never hard-delete
  per rule 31).
- `@@unique([category, symbol])` so the same symbol can exist across categories
  without collision.

`Instrument` is **global reference data, not user-scoped**, so it has **no `tenantId`**.
This is a deliberate, documented exception to rule 31's "all user-scoped tables must
have `tenantId`": a market instrument (HSBC, AAPL, Bitcoin) is identical regardless of
tenant, exactly like a currency or country lookup table. Tenant-specific instrument
universes (if ever needed for TW/SG markets) would be modelled as a join table in a
future ADR, not by duplicating instrument rows per tenant.

### D2: Reuse `AssetClass` as the instrument category (no separate enum)

The five user-facing categories are a **curated subset of the existing `AssetClass`
enum**, not a parallel taxonomy. We therefore **do not introduce a separate
`InstrumentCategory` enum**. Instead:

- `Instrument.category` is typed as `AssetClass`.
- `AssetClass` is extended with `INDEX` and `COMMODITY` (D3).
- The signal picker surfaces exactly five categories:
  `EQUITY_HK | EQUITY_US | INDEX | CRYPTO | COMMODITY`.

Benefits: a signal created from a catalog instrument sets
`signal.assetClass = instrument.category` directly — **no mapping layer, no drift**.
The legacy values `FUTURES | SPOT | FOREX` remain valid in the schema (existing
signals keep working) but are **not surfaced** as new picker categories.

### D3: Extend `AssetClass` with `INDEX` and `COMMODITY` (append-only)

Add the two new values **at the end** of the enum, after `CRYPTO`, to preserve the
existing on-chain `uint8` ordering used by `KolSignalRegistry` and the outbox worker's
`ASSET_CLASS_MAP`:

```
EQUITY_HK=0  EQUITY_US=1  FUTURES=2  SPOT=3  FOREX=4  CRYPTO=5  INDEX=6  COMMODITY=7
```

The on-chain contract upgrade (`assetClass <= 5` → `<= 7`) and the worker map update
land in a **later session** (tracked in the execution plan, Session 2 + 3). Until then,
INDEX/COMMODITY signals stay off-chain — acceptable because signals currently do not
reach the chain anyway (`ipfsCid=''` gap, see Session 3).

### D4: Instrument names follow the parallel-columns pattern (rule 51 §A)

Three nullable name columns plus the always-present `symbol` as the guaranteed
fallback. A canonical `localizedInstrumentName(instrument, locale)` helper lands in
`packages/shared` mirroring `localizedBrokerName`:

- `en` → `nameEn ?? nameZh ?? symbol`
- `zh-Hans` → `nameZhHans ?? nameZh ?? nameEn ?? symbol`
- `zh-Hant` / other → `nameZh ?? nameEn ?? symbol`

US equities and crypto typically have no Chinese name (`nameZh` null → falls back to
`nameEn`); HK equities have Traditional Chinese (`nameZh`) and English; `nameZhHans`
is OpenCC-derived during sync (Session 3), nullable and best-effort like brokers.

### D5: Search served from the platform DB, not live external APIs

A public `GET /v1/instruments?category=&q=&limit=` endpoint searches the local catalog
(by `symbol`, `displayCode`, `nameEn`, `nameZh`). The catalog is populated by a
periodic sync script (Session 3) pulling from free/official sources:

| Category          | Source                                   | Auth              |
| ----------------- | ---------------------------------------- | ----------------- |
| EQUITY_HK         | HKEX "List of Securities"                | none              |
| EQUITY_US         | SEC `company_tickers.json`               | none (User-Agent) |
| CRYPTO            | CoinGecko `/coins/list`                  | none (keyless)    |
| INDEX / COMMODITY | curated JSON in `packages/db/seed-data/` | n/a               |

We do **not** call external market-data APIs at request time, and we do **not** scrape
investing.com (ToS + anti-bot fragility). Official bulk files are stable and free.

### D6: Free-text fallback is retained (preserves ADR-0036 D5 intent)

`Signal` gains a **nullable** `instrumentId` FK. When a KOL selects a catalog
instrument, both `instrumentId` and the normalized `symbol` are stored. When the
instrument is not in the catalog, the KOL may still type a custom symbol;
`instrumentId` is null and `symbol` holds the free text. The catalog is an aid, never
a gate — directly honouring ADR-0036 D5's anti-restriction rationale.

## Alternatives Considered

- **A1: Keep free-text only (status quo, ADR-0036 D5).**
  - Pros: zero work; maximal KOL freedom.
  - Cons: bad UX (no discovery of `00005 匯豐控股`), symbol fragmentation breaks
    oracle settlement, no category structure for index/commodity.
  - Rejected: the owner explicitly wants categorized search; we keep free-text as
    fallback so we lose nothing.
- **A2: Separate `InstrumentCategory` enum + mapping to `AssetClass`.**
  - Pros: instrument taxonomy decoupled from on-chain enum.
  - Cons: two enums to keep in sync; a mapping layer that will drift; the five
    categories are literally a subset of `AssetClass` anyway.
  - Rejected: reuse (D2) is strictly simpler with a single source of truth.
- **A3: Live external API search at request time.**
  - Pros: always fresh, no catalog to maintain.
  - Cons: per-keystroke latency + rate limits + API-key/compliance surface; couples
    a hot path to a third party.
  - Rejected: a synced local catalog is faster and avoids the compliance/key surface
    (rule 50). Periodic sync keeps it fresh enough for a reference list.
- **A4: Hard-restrict signals to catalog symbols only (catalog-only).**
  - Pros: every signal has a known symbol → cleaner oracle coverage.
  - Cons: reverses ADR-0036 D5; pushes long-tail calls off-platform.
  - Rejected: the owner chose to keep free-text fallback.

## Consequences

### Positive

- KOLs get autocomplete discovery (`005` → `00005 匯豐控股`); fewer fragmented symbols.
- Single `AssetClass` source of truth; signal `assetClass` derives directly from the
  chosen instrument with no mapping.
- Index and commodity calls finally have first-class categories.
- Foundation for the long-deferred symbol → oracle feed mapping (ADR-0036 D5's
  `OracleRegistry` can later key off `Instrument`).

### Negative / Trade-offs

- A catalog to maintain (sync script + curated index/commodity JSON).
- On-chain `AssetClass` range widened, requiring a `KolSignalRegistry` UUPS upgrade
  (Session 2) before INDEX/COMMODITY signals can be anchored.
- Free-text fallback means symbol fragmentation is reduced, not eliminated.

### Neutral

- `Instrument` has no `tenantId` (documented reference-table exception to rule 31).
- `FUTURES | SPOT | FOREX` stay in the enum as legacy values, unsurfaced by the new
  picker.

## Implementation Notes

- Session 1 (this ADR): schema (`Instrument`, `AssetClass +INDEX/COMMODITY`,
  `Signal.instrumentId`) + `localizedInstrumentName` helper + shared types.
- Session 2: `KolSignalRegistry` validation `<= 7` + UUPS upgrade + tests.
- Session 3: sync script + `GET /v1/instruments` + wire `instrumentId` into signal
  creation + fix signal IPFS pinning + outbox `ASSET_CLASS_MAP` +INDEX/COMMODITY.
- Session 5: front-end instrument picker (UI from Google Studio).

## References

- [ADR-0036](./0036-kol-signal-architecture.md) D5 (amended by this ADR), D7 (oracle)
- Cursor rule 31 (DB / reference tables / no hard delete), rule 51 §A (parallel columns)
- `packages/shared/src/i18n/brokerName.ts` (helper pattern mirrored by
  `localizedInstrumentName`)
- HKEX List of Securities; SEC `company_tickers.json`; CoinGecko `/coins/list`
