# ADR-0039: KOL analyst notes — immutable rich-text content anchored on-chain + IPFS

## Status

Accepted

## Date

2026-05-31

## Context

Today a KOL can only emit a structured **signal** (per [ADR-0036](./0036-kol-signal-architecture.md)):
direction + entry/target/stoploss + horizon, with an optional 500-char plain-text
`note` column. KOLs frequently want to share richer analysis — a write-up with
headings, paragraphs, links, and **chart screenshots (K-line images)** — either as a
standalone post or attached to a specific signal.

The platform's core promise is immutability ("贏了高調、輸了刪文" — win loudly, lose
quietly — is the exact behaviour OpenTrade exists to prevent). A note that explains a
trade thesis is subject to the same incentive to silently delete when wrong. The
project owner therefore decided notes must be **tamper-proof like signals**: content
hash on-chain, full content on IPFS.

Decisions confirmed with the owner:

- Notes can be **standalone** OR **attached to a signal** (both).
- Content is **rich text with an editor** (headings, lists, quotes, links, images),
  not plain text and not an embedded third-party chart widget.
- Notes are **anchored on-chain (hash) + stored on IPFS (full content)**.

## Decision

### D1: New `KolNoteRegistry` contract (mirrors `KolSignalRegistry`)

A new UUPS-upgradeable contract `packages/contracts/src/notes/KolNoteRegistry.sol`
storing per-note: `author, kolId, contentHash, ipfsCid, timestamp, linkedSignalId`
(`linkedSignalId = 0` means standalone). `emitNote(...)` is append-only; **no function
may modify or delete a note** (project red line + rule 41). Pattern, roles
(`PAUSER_ROLE`, `UPGRADER_ROLE`), `__gap`, custom errors, and event shape mirror
`KolSignalRegistry`. Built in Session 2; 100% function coverage (rule 60).

`linkedSignalId` is the **on-chain signal id** (`uint256`), not the DB UUID, keeping
the anchor self-contained. Off-chain we also persist the DB linkage (D2).

### D2: `KolNote` DB model (tenant-scoped, append-only)

```
model KolNote {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @db.Uuid          // user-scoped → tenantId required (rule 31)
  kolId          String   @db.Uuid
  title          String   @db.VarChar(200)
  bodyJson       Json                        // ProseMirror/TipTap document JSON
  imageCids      String[]                    // IPFS CIDs of embedded images
  linkedSignalId String?  @db.Uuid           // DB FK to Signal; null = standalone
  contentHash    String
  ipfsCid        String?
  chainNoteId    Int?
  chainTxHash    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  ...
}
```

No `deletedAt`: notes are immutable like signals (which also have no soft-delete),
consistent with the on-chain anchor and the no-deletion red line. `tenantId` **is**
present because a note is user-generated content (unlike the global `Instrument`
table in ADR-0038).

### D3: Rich-text body as portable JSON; images on IPFS by CID

`bodyJson` stores a portable document JSON (TipTap / ProseMirror shape). Embedded
images are **not** base64-inlined; each image is uploaded to IPFS first and referenced
by its `cid` inside the document (and tracked in `imageCids`). This keeps the JSON
small, makes images independently content-addressed (immutable), and lets the gateway
reconstruct URLs. The editor itself is delivered by Google Studio (Session 5); the
backend only validates and stores the JSON.

### D4: Creation pipeline mirrors signals (DDD + outbox + IPFS)

A new `apps/api/src/domains/notes/` domain (DDD four layers, Session 4):

- `POST /v1/notes` (`authMiddleware('user')`, KOL must own the profile and be APPROVED):
  in one Prisma transaction, write `KolNote` + an outbox `note.submitted` event. At
  creation, pin `{title, bodyJson, imageCids, kolId, linkedSignalId, timestamp}` to
  IPFS via the existing `PinataIpfsService`; `contentHash = sha256(payload)`.
- `POST /v1/notes/images`: upload a single image → pin to IPFS → return `{cid, url}`.
  Size/MIME limits + write rate-limit (rule 30/50).
- `GET /v1/notes?kolId=&linkedSignalId=&limit=&offset=` and `GET /v1/notes/:id`: public.
- The outbox worker gains a `note.submitted` handler (idempotent guard per rule 30)
  that calls `KolNoteRegistry.emitNote` and writes back `chainNoteId/chainTxHash`,
  with graceful skip when `KOL_NOTE_REGISTRY_ADDRESS` is unset.

### D5: DTOs never expose the entity; names localized

Per rule 30, responses are mapped DTOs. The embedded KOL reference ships all parallel
name columns (rule 51 §A). Per rule 50, the web app never talks to Pinata directly —
image upload goes through the API.

## Alternatives Considered

- **A1: Extend the existing 500-char `Signal.note` column.**
  - Pros: trivial; no new tables/contracts.
  - Cons: cannot hold rich text / images; cannot be standalone; not separately
    anchored. Fails every confirmed requirement.
  - Rejected.
- **A2: Off-chain DB-only notes (editable/deletable).**
  - Pros: simplest; cheapest.
  - Cons: violates the immutability promise that justifies the platform; a KOL could
    delete a wrong thesis — the exact behaviour OpenTrade opposes.
  - Rejected by the owner.
- **A3: Hash-only on-chain, no IPFS original.**
  - Pros: cheaper; proves timestamp + non-tampering.
  - Cons: the original cannot be independently retrieved/verified from the anchor.
  - Rejected: signals already pair hash + IPFS CID; notes follow the same shape.
- **A4: Embedded interactive chart widget (e.g. TradingView) instead of rich text.**
  - Pros: live, auto-updating charts.
  - Cons: not immutable (the widget re-renders current data, defeating the point);
    third-party coupling; the owner asked for an editor with text + images.
  - Rejected.
- **A5: Reuse `KolSignalRegistry` for notes.**
  - Pros: one fewer contract.
  - Cons: different entity, different fields (`linkedSignalId`, no direction/horizon);
    overloading the signal struct harms clarity and storage layout.
  - Rejected: a dedicated `KolNoteRegistry` is cleaner.

## Consequences

### Positive

- KOL theses become tamper-proof, extending the platform's core promise from signals
  to analysis.
- Rich text + IPFS images support real K-line write-ups.
- Standalone + attached covers both usage modes.
- Reuses established patterns (DDD, outbox, `PinataIpfsService`, UUPS) — low novelty.

### Negative / Trade-offs

- A new contract to deploy, test (100%), and eventually audit before mainnet.
- IPFS pinning cost for images; image moderation is out of scope here (future ADR /
  rule 52 content moderation).
- Notes are immutable — a KOL cannot fix a typo. This is intentional (matches signals)
  and must be surfaced clearly in the UI ("unchangeable once published").

### Neutral

- `linkedSignalId` exists in two forms: on-chain (signal id `uint256`) and off-chain
  (DB UUID FK). Both are populated; neither is authoritative over the other.
- Image moderation, note editing windows, and paid/gated notes are explicitly deferred.

## Implementation Notes

- Session 1 (this ADR): `KolNote` DB model + shared note types.
- Session 2: `KolNoteRegistry.sol` + Forge tests + deploy script + `packages/config`
  address + `KOL_NOTE_REGISTRY_ADDRESS` env documentation.
- Session 4: `notes` API domain + image upload + outbox `note.submitted` handler.
- Session 5: rich-text editor + note display (UI from Google Studio).

## References

- [ADR-0036](./0036-kol-signal-architecture.md) (signal architecture mirrored here)
- [ADR-0019](./0019-review-registry-contract-design.md) / ADR-0028 (IPFS payload pattern)
- [ADR-0006](./0006-ddd-modular-monolith.md) (outbox), cursor rules 30 / 41 / 50 / 60
- `apps/api/src/domains/reviews/infrastructure/PinataIpfsService.ts` (reused IPFS pin)
- `packages/contracts/src/signals/KolSignalRegistry.sol` (contract pattern mirrored)
