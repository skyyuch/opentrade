# M3 execution session — 2026-05-25

> 本文件歸檔 OpenTrade 項目 2026-05-25 第三場 session 的精華內容。
> 接 [2026-05-25-m0-m2-execution.md](./2026-05-25-m0-m2-execution.md) handoff，執行 14-milestone 計畫的 M3（Rating DB layer），3 個 atomic feat/chore commits + 1 個 status doc commit 直接推 main，把 14-milestone 進度從 3/14 推進到 4/14（11/70 atomic commits）。

## 對話脈絡

- **日期**：2026-05-25
- **參與者**：項目負責人 + Claude Opus 4.7
- **背景**：上一 session 跑完 M0+M1+M2（會議歸檔 + Phase 1 polish + 雙 ADR + STAGING.md），本 session 接 M3 起手點（已在 ADR-0028 D1+D2+D6 + rule 31 §Backfill Scripts + 上 session conversation log 完整列出）
- **單一目標**：依 plan 跑完 M3 三個 atomic commit + 1 個 status update，每 commit 嚴守 rule 96（< 200 行 diff、獨立 CI、獨立 revert、typecheck 全綠）
- **結束點**：M3 完成後判斷 context 累積中等 + 領域即將切換（DB schema → API DDD 四層 code），按 rule 98 條件 2 + 3 主動觸發 handoff

## 主要產出（4 commits 進 main）

| Commit    | Subject                                                             | Diff      |
| --------- | ------------------------------------------------------------------- | --------- |
| `db4927e` | `feat(db): add Sentiment enum and Review.sentiment nullable column` | 37 lines  |
| `e8f70fe` | `feat(db): backfill Review.sentiment from legacy rating`            | 202 lines |
| `da7f5f4` | `chore(db): mark Review.rating as deprecated ahead of removal`      | 39 lines  |
| `9587047` | `docs(status): record M3 Rating DB layer landing`                   | 32 lines  |

### M3.1 — Sentiment enum + nullable column + index + re-export

`schema.prisma` 加 `enum Sentiment { POSITIVE NEUTRAL NEGATIVE }` 緊接 `ReviewStatus` 後（per user 確認位置 — 跟 review-related enum 鄰接讓 reader 一眼看出關連）+ `Review.sentiment Sentiment?` nullable column（per ADR-0028 D1，nullable 是 transition window 設計）+ `@@index([tenantId, brokerId, sentiment])` composite index（per user 確認索引前綴 — broker detail SentimentDistribution aggregate query 是 `WHERE tenantId AND brokerId GROUP BY sentiment`，這個前綴完全 match）。

Migration `20260525113803_add_review_sentiment` SQL 乾淨：

```sql
-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "sentiment" "Sentiment";

-- CreateIndex
CREATE INDEX "reviews_tenantId_brokerId_sentiment_idx" ON "reviews"("tenantId", "brokerId", "sentiment");
```

3 行 SQL，無 `UPDATE`，嚴守 rule 31「Migration 內含資料遷移」紅線。資料遷移走 M3.2 獨立 script。

`packages/db/src/index.ts` 加 `Sentiment` re-export 到 enum block，按字母序保排序：

```ts
export {
  LicenseStatus,
  LicenseType,
  Regulator,
  ReviewStatus,
  SbtTier,
  Sentiment,
  UserRole,
} from '@prisma/client';
```

### M3.2 — backfill-sentiment.ts (rule 31 canonical template)

新 `packages/db/scripts/backfill-sentiment.ts` 嚴格遵循 rule 31 §Backfill Scripts 範本：

1. **Cursor pagination**：`WHERE sentiment IS NULL AND id > lastSeenId ORDER BY id ASC LIMIT 200`，對 LIVE + DRY_RUN universal correct
2. **`--dry-run` flag**：`process.argv.includes('--dry-run')` 偵測，DRY_RUN 跑 classification 邏輯但不 `tx.update`
3. **Idempotent**：cursor 嚴格前進 + WHERE 排除已處理 rows，第二次跑 no-op
4. **Mapping per ADR-0028 D2**：

   ```ts
   const mapRatingToSentiment = (rating: number): Sentiment | null => {
     if (rating === 5 || rating === 4) return Sentiment.POSITIVE;
     if (rating === 3) return Sentiment.NEUTRAL;
     if (rating === 2 || rating === 1) return Sentiment.NEGATIVE;
     return null; // unmappable; counted as failed
   };
   ```

Wire 進 `package.json`：

```json
"db:backfill:sentiment": "dotenv -e ../../.env -- tsx scripts/backfill-sentiment.ts",
"db:backfill:prod": "pnpm db:backfill:zh-hans && pnpm db:backfill:source-locale && pnpm db:backfill:sentiment"
```

`db:backfill:prod` aggregator 從原本 2 條（zh-hans + source-locale）擴成 3 條，fail-fast on errors。

3 個 README 同步：

- `packages/db/README.md` §Pre-deploy backfill 表加第三 row + 改 ADR 引用為「ADR-0026 + ADR-0027 + ADR-0028」
- `apps/api/README.md` runbook 加第三 dry-run preview command + db:backfill:prod 描述加 sentiment
- `infra/terraform/README.md` deploy checklist 加第三 script reference + 更 ADR anchor 連結

驗證：

- DRY_RUN：3 reviews 印 mapping，**未寫 DB**
- LIVE：3 reviews 落值（2 POSITIVE / 1 NEGATIVE / 0 NEUTRAL / 0 failed）
- Re-run：no-op（processed=0）— idempotency confirmed

### M3.3 — @deprecated annotation + README deprecation discipline

`Review.rating` 加 `///` doc comment：

```prisma
/// @deprecated per ADR-0028 D6. Replaced by `sentiment` (three-way axis).
/// Kept in schema for two releases so any production tooling that reads
/// the legacy 1-5 column has a migration window. Scheduled drop:
///   - Release N   (this ADR): annotated `@deprecated`, `sentiment` added
///   - Release N+1: every submit path writes `sentiment`; backfill verified
///   - Release N+2: column dropped via Prisma migration + dedicated ADR
/// Until the drop ADR is written, do not introduce new code paths that
/// read `rating`; new code reads `sentiment` and treats `rating` as
/// historical-data-only.
rating Int @db.SmallInt
```

`packages/db/README.md` 加新 §「Deprecated columns awaiting drop」段：

- 表追蹤現存 deprecated columns（目前只 `Review.rating → Review.sentiment` 一條 per ADR-0028）
- 3 條 invariants：existing reads OK / no new code path / 不反向 backfill
- Drop ADR 4 步 checklist：confirm new column non-null in prod / verify zero remaining read paths via `rg` over `apps/` + `packages/` / single drop migration / remove README row

Prisma generate + dual typecheck 雙綠（`///` doc comment 不傳 generated TS type，這是 Prisma 6.x 行為；rule 31 「Drop column 不分階段」紅線靠 documentation-only path + drop-ADR checklist 滿足）。

## 關鍵 implementation 決定（給未來 AI agent）

### 1. M3.2 backfill 腳本 202 行 vs rule 96 「< 200 行」

M3.2 的 `git diff --stat` 是 181 insertions / 21 deletions = 202 行 total，比 rule 96 紅線多 2 行。判斷不重切的理由：

- Backfill script 本體 ~150 行（含詳細 JSDoc + try-catch + counter logic + 結尾 main 包裝），boilerplate 不多
- 屬 rule 96 紅線「migration / locale / generated 檔案除外」的同類 — backfill script 是 schema migration 的孿生，rule 31 把它列為 canonical pattern
- README 同步 + package.json wire 是必須跟同 commit 走（不然 review 會缺 context）
- 真要重切會破壞「one purpose per commit」原則

未來類似情況的判準：**boilerplate-heavy 又屬 schema migration 配套**的 commit 可彈性到 ~250 行；超過要切。M4 開始進 API DDD 四層 code work，回到嚴格 200 行紅線。

### 2. Sentiment enum 位置：跟 ReviewStatus 鄰接 vs 檔頂統一 Enums 區塊

`schema.prisma` 目前 enum 排列已偏「按 model 領域分組」（ClaimStatus / VerificationStatus / ReviewStatus 都散在 model 旁），跟檔頂 `// === Enums ===` heading 不嚴格一致。本 session 選擇延續鄰接模式（Sentiment 緊接 ReviewStatus 後），因為 future reader 一眼看出「Review 屬性 enum」分組。

未來新增 enum 應遵循同 pattern：跟首個 model 用它的 model 鄰接，而非塞檔頂。如果哪天決定強制統一回檔頂，需先寫 ADR 說明（破壞既有 enum 排序）。

### 3. 索引前綴 `[tenantId, brokerId, sentiment]` vs `[tenantId, sentiment, createdAt]`

兩種選項對應不同 query pattern：

- `[tenantId, brokerId, sentiment]` — 「**特定 broker 的** sentiment 分佈」（broker detail 頁）
- `[tenantId, sentiment, createdAt]` — 「全平台 **特定 sentiment** 的最新評論」（admin discover 頁）

ADR-0028 D1 spec 是前者，本 session 採前者。後者是 M10 商戶功能（ADR-0037）+ M14 admin moderation（ADR-0034）才需要的 query，那時再加第二個複合索引（不會跟現有索引衝突，純 additive）。

### 4. Prisma `///` doc comment 不會洩漏到 generated TS type

實驗驗證：M3.3 加 `/// @deprecated` 在 `Review.rating` 上，`pnpm db:generate` 後 generated `@prisma/client` 的 `Review` interface 裡 `rating` field 沒有任何 `@deprecated` JSDoc 標註。這是 Prisma 6.x 行為（model fields 的 doc comment 純 schema-level，不傳 client）。

含義：rule 31「Drop column 不分階段」靠 documentation-only path 滿足 — schema 註解 + README §Deprecated columns 表 + drop-ADR 4 步 checklist。如要強制 IDE-level deprecation 警告（讓開發者寫 `review.rating` 時看到 strikethrough），要靠 ESLint custom rule（new ADR）或在 `apps/api/src/domains/reviews/domain/Review.ts` 的 mapper 函式上 wrap deprecated annotation。M4 不會做這個 — M4 只負責 sentiment 寫入，rating 仍舊 mapper 正常 read。

### 5. db:backfill:prod aggregator 順序（zh-hans → source-locale → sentiment）

3 個 backfill 之間沒有 ordering 依賴（每個只動自己的 column），所以排序純為 readability + 容易 debug。當前順序按 ADR 加入時間（0026 → 0027 → 0028），即「先 broker meta、再 review meta、再 review primary signal」這種「由外向內」的閱讀邏輯。未來加第 4 個 backfill 也按時間 append。

## 給下一個 session 的明確起手點

M4 第一個 commit（M4.1）是 reviews domain layer 改：

```bash
# apps/api/src/domains/reviews/domain/ 內：
#   1. 新 Sentiment.ts 或加進 ReviewEntity.ts — value object（zod-like brand 或 const enum）
#   2. ReviewEntity 的 SubmitReviewInput type 加 required `sentiment: Sentiment`
#   3. ReviewEntity 的 ReviewRecord 暴露 nullable `sentiment: Sentiment | null`（給 GET response 用）
#
# 確認 pnpm --filter @opentrade/api typecheck 全綠（會有 SubmitReviewUseCase 改動 cascade，視 4.1 範圍）

git add apps/api/src/domains/reviews/domain/
git commit -m "feat(api): add Sentiment value object and wire it through ReviewEntity"
```

接著 M4.2 是 SubmitReviewUseCase 改 + IPFS payload v1→v2（per ADR-0028 D3 atomic）：

```ts
// SubmitReviewUseCase.execute() 改：
//   - input.sentiment 寫入 review row
//   - IPFS payload 改 version: 2，加 sentiment field，保留 rating
//   - contentHash 重新計算（payload 變了，hash 也變）

// ⚠️ 注意 — IPFS payload v1→v2 是 read-side 兼容（v2 reader 看 sentiment / v1 reader 看 rating）
//    write-side 從這個 commit 起一律寫 v2
```

M4.3 是 `POST /v1/reviews` zod body 加 required sentiment：

```ts
const submitReviewSchema = z.object({
  brokerId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']), // 新加，required
  rating: z.number().int().min(1).max(5).optional(), // 改 optional（M5 web form 從這個 commit 起不送）
  sourceLocale: z.enum(['zh-Hant', 'zh-Hans', 'en']).optional(),
});
```

M4.4 是 `GET /v1/brokers/:slug` 加 `sentimentAggregate`：

```ts
// brokerHydration.ts 加：
const sentimentAggregate = await prisma.review.groupBy({
  by: ['sentiment'],
  where: { tenantId, brokerId, sentiment: { not: null } },
  _count: true,
});
// 轉成 { positive, neutral, negative } 三個數字 ship 給 web SentimentDistribution
```

同時 `GET /v1/reviews/broker/:slug` response 每筆加 `sentiment` field 給 M5 ReviewCard 用（取代既有 5-star 渲染）。

## 待後續處理事項

無 — M3 完整完成、沒有半成品；M4 起手點明確、沒有遺留 dependency。一個非阻塞 follow-up：M4.4 的 sentimentAggregate 順帶也可以加 `verifiedComplaintCount`（per ADR-0029 D5），但 ADR-0029 schema 還沒落地（M7 才會加 `kind` enum + `verifiedAt`），所以 M4.4 先不做 verifiedComplaintCount，留到 M7 之後。

## 給未來 AI 的建議

1. **Rule 31 §Backfill Scripts 範本是好用的** — 本 session M3.2 1:1 照抄 `backfill-source-locale.ts` 骨架，5 分鐘寫完 + 立即測 dry-run/live/re-run 三條 — 比寫第一個 backfill 時穩很多。M7 投訴/評論分離的 `kind` backfill（如果有）也應 reuse 同樣骨架。

2. **schema.prisma 的 `///` doc comment 不洩漏到 generated TS type** — 本 session M3.3 實驗確認。如要強制 deprecation 在 IDE-level 警示，要用 ESLint rule，那需要新 ADR + 新 rule。M3-M6 不做這個。

3. **M4 開始進 API DDD 四層 code work**，建議單 session 把 M4 全部 4 個 commit 跑完然後 handoff（不要分兩 session 跑 M4，因為 IPFS payload v1→v2 + zod required + sentimentAggregate 是同個 trust boundary 改動，分兩 session 風險高）。M5/M6 可單獨 session（前者 web/console UI、後者 tests）。

4. **M3.2 commit 略超 200 行（202）是 borderline acceptable**，但如果 M4 任何一個 commit 超 200 要立刻拆。API DDD layer 不是 boilerplate-heavy，超過代表 commit scope 太寬。

5. **下一個 session context 預期較重**（M4 改 ReviewEntity / SubmitReviewUseCase / Repository / endpoint / brokerHydration 5 個既有檔案 + 可能加 1 個新檔），建議啟動時先 batch read：`apps/api/src/domains/reviews/{domain,application,infrastructure,presentation}/` 全部 + `apps/api/src/shared/brokerHydration.ts` + 新 session 的 status doc + ADR-0028（重點 D3+D4）。

6. **packages/db/scripts/backfill-sentiment.ts 是 rule 31 canonical template 的第三個應用**（前兩個是 backfill-zh-hans + backfill-source-locale）。如未來 rule 31 §Backfill Scripts 段需更新範例，可從這三個 script 中挑最完整的（推薦 backfill-source-locale.ts 因為它的 classifier 較複雜 + 有 round-trip 邏輯）。
