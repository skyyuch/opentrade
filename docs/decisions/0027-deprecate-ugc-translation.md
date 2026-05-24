# ADR-0027: Deprecate automatic UGC translation; ship reviews as author-original

## Status

Accepted (Supersedes ADR-0023)

## Date

2026-05-24

## Context

[ADR-0023](./0023-ugc-translation-deepl.md) decided that every submitted review would be auto-translated synchronously into the two non-source locales via DeepL, with translations stored in `ReviewTranslation` and served by `Accept-Language`. That ADR explicitly dismissed "no translation" as an alternative, calling it a defeat of the multi-language value proposition.

After Phase 1 MVP-A / MVP-B reached UI-polish, a Phase 1 reviewer (the project owner) running the first end-to-end review submission in the browser observed: "用戶 review 目前在切換語言時，不會翻譯，但我認為是正確，因為是用戶語言，不用硬翻譯". This re-opens the design question. Two facts forced a re-evaluation:

1. **The translation path was never actually live.** `DEEPL_API_KEY` was left unset throughout Phase 1; `SubmitReviewUseCase` ctor receives `translationService` as `null`; the in-line `if (this.translationService)` block (lines 62-68) is skipped on every submit. Reviews ship with `Review.sourceLocale = null` and no `ReviewTranslation` row. Users have seen this behaviour as "not translating" since Block 14 landed and the project owner has come to read it as intentional.
2. **The original "no translation defeats multi-language value" framing under-weighted four counter-arguments that have crystallised with HK market context.** Listed below in Decision rationale.

This ADR formally adopts "author-original UGC", marks ADR-0023 superseded, and re-shapes the surrounding code path so the absence of translation becomes a designed feature (with proper `sourceLocale` plumbing and a frontend disclaimer) rather than a half-shipped pipeline.

This ADR does **not** delete `DeepLTranslationService`, `ReviewTranslation`, the `Review.sourceLocale` column, or the `DEEPL_API_KEY` env slot. They remain dormant so a future on-demand-translation ADR (per D7 below) can rewire them without a migration.

### Public-fairness red-line check

OpenTrade's vision (per `docs/00-vision.md` and rules 00, 50) commits to three invariants: "公平 / 透明 / 不可篡改 / 平台不介入內容". Automatic platform-driven rewriting of user content, even if not on-chain and even if labelled "machine translation", lives at the edge of "平台不介入內容" — a `Rewrite-by-platform` action whose result becomes a top-line UI surface. Author-original is the strictly tighter posture.

## Decision

### D1: Stop calling the translation service from `SubmitReviewUseCase`

Remove the `if (this.translationService)` block in `SubmitReviewUseCase.execute`. Drop the optional `translationService` ctor parameter. The use case no longer references `DeepLTranslationService`. New reviews go through the IPFS pin → DB persist → outbox path only.

### D2: `Review.sourceLocale` becomes a first-class submit-time field

Block 14 introduced `sourceLocale` so DeepL could record what it auto-detected. With auto-translation deprecated, `sourceLocale` now records "the locale the author was browsing in at submit time". `SubmitReviewInput` gains a required `sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en'` field. `PrismaReviewRepository.create` writes it to the column. `POST /v1/reviews` reads it from the request body, falling back to parsing `Accept-Language` if absent (with `zh-Hant` as the ultimate default, matching ADR-0003).

### D3: `DeepLTranslationService` is marked `@deprecated` but not deleted

The file gains a class-level `@deprecated` JSDoc that points readers at this ADR. Its imports remain valid so a future on-demand ADR (D7) can rewire it. It is no longer instantiated anywhere in the live request path. The `apps/api` DI wiring in `server.ts` / domain index passes `undefined` to use cases that previously consumed it.

### D4: `DEEPL_API_KEY` env stays optional with a deprecation note

The schema entry in `apps/api/src/shared/env.ts` remains `z.string().optional()` (this is what was already shipped). The JSDoc above it switches from "per ADR-0023" to "per ADR-0027 — deprecated in Phase 1; reserved for future on-demand translation per D7". `.env.example` keeps the variable commented out.

### D5: `ReviewTranslation` table preserved; no new writes

Existing rows (mostly empty in Phase 1) are kept for forward-compat with D7. `SubmitReviewUseCase` writes nothing here. `GET /v1/reviews/broker/:slug` no longer joins / serves from `review_translations` — it always returns the original `Review.title` + `Review.body`. The Prisma model stays; the migration is not reverted.

### D6: Frontend ReviewCard surfaces `sourceLocale` as a badge + ships a disclaimer

`apps/web` `ReviewCard` (and `apps/console` if a separate `ReviewCard` exists there) renders a small badge next to the review header showing the source language:

- `zh-Hant` review → 「繁體中文」 badge
- `zh-Hans` review → 「简体中文」 badge
- `en` review → "English" badge

The badge style follows the existing verified-broker pill grammar (muted background, small caps). A single `reviews.disclaimer` i18n key ("評論以作者原文呈現，不提供自動翻譯") sits beneath the review-list header for context — three-language i18n bundles include it.

### D7: Future on-demand translation is allowed but requires a successor ADR

The deprecation is **not** an absolute ban. A future "reader-clicks → translate-once → cache to `ReviewTranslation`" pattern remains an open path because:

- It is reader-initiated, not platform-initiated
- It is opt-in per request, not blanket-default
- It reuses the dormant infrastructure (DeepL service, env, table)
- Costs scale with user demand instead of submission volume

Anyone implementing it must write a new ADR (`ADR-NNNN: On-demand UGC translation`) referencing this one, define UI affordance, cache TTL, abuse rate-limit, and source-language detection (since author-self-declared `sourceLocale` is just a hint, not ground truth).

### D8: Backfill existing `Review.sourceLocale = null` rows best-effort

A one-shot Prisma data migration script in `packages/db/scripts/backfill-source-locale.ts` walks all rows where `sourceLocale IS NULL`. For each, it computes the Han-character ratio in `title + body`:

- Han ratio < 0.3 → `'en'`
- Han ratio >= 0.3 AND OpenCC `t2s` round-trip identical → `'zh-Hans'` (already simplified)
- Han ratio >= 0.3 AND OpenCC `t2s` round-trip differs → `'zh-Hant'` (was traditional)

Idempotent (re-run filters by `IS NULL`). Same "mutable WHERE + stall guard" pattern as `backfill-zh-hans.ts` (per [ADR-0026 implementation notes step 6](./0026-zh-hans-broker-name.md) and the lesson logged in [`docs/conversations/2026-05-24-adr-0026-zh-hans-implementation.md` §2](../conversations/2026-05-24-adr-0026-zh-hans-implementation.md)). Phase 1 dev DB has at most 2 reviews (verified during E2E on 2026-05-24); production prediction is also tiny so a single run is acceptable.

## Alternatives Considered

### B. Keep ADR-0023 as-is (just set `DEEPL_API_KEY`)

Configure the missing env var, let the existing pipeline run, ship Phase 1 with auto-translation as originally designed.

- **Pros**: Zero new code; honours the prior decision; preserves "multi-language reach" framing.
- **Cons**:
  - DeepL has documented mis-translation of HK-specific finance terms (孖展, 補倉, 窩輪, 期權結算, 散戶 vs 散户) — exactly the vocabulary an HK review platform depends on for credibility.
  - Synchronous translation adds ~500ms to every submit (ADR-0023 acknowledged this; not great when L2 mint flow already feels heavy).
  - Cost scales with submit volume; Phase 2+ at 10k reviews / month = ~$5-20 / month on DeepL Free, jumping further on Pro.
  - Platform-rewriting UGC is a fairness-red-line edge case (see Context).
  - GitHub / Reddit / Twitter / Glassdoor / IndieHackers — no major UGC platform auto-translates posts; their UX precedent is opt-in or none.

**Rejected.** The HK-finance-term mis-translation alone disqualifies it; cost + latency + fairness invariant are reinforcing.

### C. Lazy on-demand DeepL (reader clicks → translate-once → cache)

The "compromise" option offered to the project owner at Decision time.

- **Pros**: Author original preserved; opt-in per reader; cost scales with curiosity not submit volume; reuses ADR-0023 infrastructure.
- **Cons**:
  - Requires more engineering than D1-D8 combined: frontend toggle UI, request hash-of-content lookup against `ReviewTranslation`, cache-miss UX (loading spinner), rate-limit per IP to prevent DeepL bill griefing, abuse signature for headless scrapers.
  - Phase 1 user base is the project owner + planned seed jurors; lazy demand is essentially zero.
  - Premature optimisation that would force a Phase 1 commit budget hit for a Phase 2+ feature.

**Deferred**, not rejected. D7 above keeps this path open under a future ADR when reader complaints actually materialise.

### D. Delete `DeepLTranslationService` + drop `ReviewTranslation` table + drop `Review.sourceLocale`

Most aggressive cleanup: remove all translation-related code and schema.

- **Pros**: Smallest mental model going forward; no "deprecated but kept" half-state.
- **Cons**:
  - Schema rollback requires a destructive migration (drop column + drop table) for ~2 rows of dev data; uneven cost.
  - Closes the D7 door — re-adding it would require a new schema migration on top of code restoration.
  - `sourceLocale` is still useful for D6 (badge); dropping it forces a new column add for D6, then a future re-add for D7.

**Rejected.** Keeping the dormant infrastructure is cheap and preserves option value.

### E. Move to async outbox-driven translation (per ADR-0023's own Phase 2 note)

ADR-0023 D3 mentioned "Phase 2 moves to async (SQS queue) for better latency". This alternative pursues it now.

- **Pros**: Removes the 500ms submit-time latency objection from B.
- **Cons**:
  - Doesn't address the more fundamental objections (HK finance-term mis-translation, fairness-red-line edge case, platform-rewriting-UGC framing).
  - More plumbing (SQS / outbox handler / Lambda) for a feature being deprecated on principle.

**Rejected.** Solves the wrong sub-problem.

## Consequences

### Positive

- Reviews ship with author-original wording, preserving HK-specific finance vocabulary and the author's tone.
- Tighter alignment with the "平台不介入內容" red line (rule 00 + vision §九).
- Saves the future DeepL bill (Phase 2+ at scale this could grow to non-trivial).
- ~500ms latency removed from every review submit (was 500ms even when translation succeeded; was wasted handshake time even now when the call is skipped, since the empty `if` branch still costs nothing — but the round-trip on the once-imagined "happy path" is permanently gone).
- Frontend ReviewCard gets a `sourceLocale` badge — small UX win in the multi-lingual review list ("I'm reading three brokers' reviews and want to know which were originally written in zh-Hant vs zh-Hans" is a real reader question).
- Removes the "half-shipped pipeline" cognitive overhead: contributors won't need to reason about why translation looks scaffolded but never runs.

### Negative / Trade-offs

- A zh-Hans-locale reader looking at a zh-Hant review sees Traditional Chinese; ditto en-locale reader looking at any Chinese review. Mitigations: same-source CJK readability (most mainland readers can passively read Traditional); the disclaimer sets expectation; D7 keeps on-demand translation reachable if reader complaints materialise.
- ADR-0023 is now formally superseded after only 2 days of "Accepted" lifetime. Document trail (this ADR + ADR-0023 status flip + README index) keeps the history intact, but it's a teaching moment that ADRs should sometimes wait for one E2E pass before being marked Accepted.
- `ReviewTranslation` table sits dormant with no consumers — small DB schema overhead, easy to forget, easy to under-test in future schema audits.

### Neutral

- `DeepLTranslationService` class still type-checks and unit-tests still pass; it just isn't wired. Maintenance cost is near-zero until D7 or further deprecation.
- `DEEPL_API_KEY` env slot remains in `apps/api/src/shared/env.ts` — operators see it in `.env.example` with a deprecation note; not a footgun.

## Implementation Notes

### 4-commit plan (recommended order)

1. **`docs(decisions,rules)` ADR-0027 + ADR-0023 Superseded + README index + rule 51 §UGC translation rewrite**
   - Create this file
   - Flip ADR-0023 `Status` from `Accepted` to `Superseded by ADR-0027`
   - Add row in `docs/decisions/README.md` (index table) + flip ADR-0023 row's Status column
   - Rewrite the "用戶生成內容（評論）翻譯" section of `.cursor/rules/51-i18n.mdc` from the 7-step auto-translation flow to "author-original; on-demand only via future ADR"; the "翻譯服務優先序" subsection should be marked deprecated with cross-ref to ADR-0027
   - Add red-line item to rule 51 嚴禁清單: "不可在 review submit path 自動翻譯 UGC（per ADR-0027）— 未來如要做 on-demand 翻譯必須新 ADR"

2. **`feat(api)` deprecate translation; ship `sourceLocale` on submit**
   - `SubmitReviewUseCase`: drop `translationService` ctor param + delete `if (this.translationService)` block + add `sourceLocale` to the `reviewRepo.create` payload
   - `ReviewEntity.SubmitReviewInput` type: add `sourceLocale: 'zh-Hant' | 'zh-Hans' | 'en'`
   - `PrismaReviewRepository.create`: pass `sourceLocale` through to Prisma
   - `POST /v1/reviews` (`apps/api/src/domains/reviews/presentation/routes.ts`): extend zod body schema with `sourceLocale` (default to a helper that parses `Accept-Language`); pass through to use case
   - `DeepLTranslationService`: add class-level `@deprecated` JSDoc pointing at ADR-0027; do not delete
   - `env.ts`: update the `DEEPL_API_KEY` JSDoc reference from "ADR-0023" to "ADR-0027 — deprecated"
   - DI wiring (`server.ts` or domain index in `apps/api/src/domains/reviews/index.ts`): stop instantiating `DeepLTranslationService` and stop passing it to `SubmitReviewUseCase`
   - typecheck + lint

3. **`feat(web,console)` ReviewCard `sourceLocale` badge + disclaimer + three-language i18n**
   - Locate ReviewCard component in `apps/web` (and `apps/console` if present)
   - Add `sourceLocale` field to the local props type and to `apps/web/src/lib/api/client.ts` Review type if not already there
   - Render the badge using existing pill grammar
   - Add `reviews.sourceLocaleBadge.{zh-Hant,zh-Hans,en}` + `reviews.disclaimer` i18n keys to all three message bundles (web + console as appropriate)
   - Surface the disclaimer above the review list per broker detail page (in `apps/web/src/app/[locale]/brokers/[slug]/...`)
   - typecheck + lint

4. **`feat(db)` backfill existing `Review.sourceLocale = null` rows (D8)**
   - Add `packages/db/scripts/backfill-source-locale.ts` (Han-ratio + OpenCC round-trip detection, idempotent, stall-guard per ADR-0026 lessons)
   - Add `db:backfill:source-locale` script to `packages/db/package.json`
   - Run against dev DB; verify the 1-2 existing rows get values
   - Add to status doc as "production follow-up" alongside ADR-0026's zh-Hans backfill (single deploy window)

### Operational notes

- **Phase 2 trigger to re-evaluate D7 (on-demand translation):** when any of (a) ≥ 5 reader complaints about cross-locale legibility in `docs/feedback/`, (b) first non-Chinese-speaking jury onboarding, (c) media coverage outside HK reading audience.
- **`DEEPL_API_KEY` setting in production secrets:** can be left blank; if someone accidentally sets it, no code path consumes it. Add to ops checklist that setting it has no effect (until D7).
- **Existing ADR-0023 implementation tests** (if any unit / E2E tests assert translation behaviour): mark `it.skip` with comment pointing at ADR-0027; do not delete (re-use for D7 if it lands).

## References

- [ADR-0003](./0003-i18n-strategy.md): i18n three-language architecture (still in force)
- [ADR-0023](./0023-ugc-translation-deepl.md): UGC translation via DeepL — **Superseded by this ADR**
- [ADR-0026](./0026-zh-hans-broker-name.md): zh-Hans broker name strategy (parallel-columns pattern, same vintage)
- `.cursor/rules/51-i18n.mdc`: i18n cursor rule (UGC section rewritten per D1+D5+D6)
- `apps/api/src/domains/reviews/application/SubmitReviewUseCase.ts`: where the wiring change lands
- `apps/api/src/domains/reviews/infrastructure/DeepLTranslationService.ts`: marked `@deprecated`, not deleted
- `docs/00-vision.md` §九 (品牌精神 — 公平/透明/不可竄改/賦權使用者)
- Conversation context: this ADR was written immediately after the Phase 1 first-E2E session on 2026-05-24, captured in `docs/conversations/2026-05-24-translation-deprecation-and-e2e.md` (forthcoming).
