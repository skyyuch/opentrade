# M4 execution session — 2026-05-25

> 本文件歸檔 OpenTrade 項目 2026-05-25 第四場 session 的精華內容。
> 接 [2026-05-25-m3-execution.md](./2026-05-25-m3-execution.md) handoff，執行 14-milestone 計畫的 M4（Rating API DDD layer），4 個 atomic feat commits + 1 個 status doc commit 直接推 main，把 14-milestone 進度從 4/14 推進到 5/14（15/70 atomic commits）。

## 對話脈絡

- **日期**：2026-05-25（晚間，約 19:48-20:01 HKT）
- **參與者**：項目負責人 + Claude Opus 4.7
- **背景**：上一 session 跑完 M3（DB schema + nullable column + backfill + @deprecated annotation），本 session 接 M4 起手點（M3 conversation log 末段已列出 M4.1-M4.4 四 commit 範圍 + 設計依據 ADR-0028 D1+D3+D4+D5+D7）
- **單一目標**：依 plan 跑完 M4 四個 atomic commit，每 commit 嚴守 rule 96（< 200 行 diff、獨立 typecheck、獨立 revert、過 lint-staged）
- **結束點**：M4 完成後判斷 context 累積中等（~10 turns / ~30k tokens）+ 領域即將切換（API DDD → UI design system + Storybook + Tailwind + i18n messages），按 rule 98 條件 2 + 3 主動觸發 handoff

## 主要產出（5 commits 進 main）

| Commit    | Subject                                                                                | Diff                  |
| --------- | -------------------------------------------------------------------------------------- | --------------------- |
| `7d357ef` | `feat(api): add ReviewSentiment value object and wire repository column`               | 45 lines              |
| `a28601a` | `feat(api): upgrade IPFS review payload to v2 with sentiment field`                    | 18 lines (17 +/1 -)   |
| `6b22a44` | `feat(api): require sentiment and derive rating across reviews submit path`            | 112 lines (91 +/21 -) |
| `b4345c2` | `feat(api): expose sentiment aggregate on broker detail and review items`              | 24 lines (22 +/2 -)   |
| (this)    | `docs(status,conversations): record M4 Rating API DDD layer landing + session archive` | TBD                   |

### M4.1 — ReviewSentiment value object + repository column wiring（domain + infrastructure）

`apps/api/src/domains/reviews/domain/ReviewEntity.ts` 加 `ReviewSentiment` string-literal union：

```ts
export type ReviewSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
```

關鍵設計決定：**用 string-literal union 而非 import Prisma `Sentiment` enum runtime value**。理由是 rule 10「domain 層零基礎設施 import」紅線 — 即使 `@opentrade/db` 已 re-export `Sentiment` enum，domain layer 仍應與 Prisma 解耦，型別層 mirror 即可。

JSDoc 寫明完整 lifecycle（per ADR-0028 D4 + D6）：

```text
M4.1: optional on SubmitReviewInput, lets domain commit land cleanly
M4.3: zod body schema collapses to required at API boundary
ReviewRecord.sentiment stays nullable forever (legacy rows = null + caption per D7)
```

`SubmitReviewInput.sentiment` 暫時 optional（避免 M4.1 連鎖破壞 use case + route 的編譯），到 M4.3 才升 required。
`ReviewRecord.sentiment` 永久 nullable — legacy row（M3.2 backfill 失敗或 column 加之前的 row）顯示 rating-derived caption 而非偽造 sentiment，per ADR-0028 D7。

`PrismaReviewRepository.ts` 兩處改：

1. `create()` data 加 `sentiment: data.sentiment ?? null`
2. `toRecord()` row signature 加 `sentiment: string | null` 參數 + cast same pattern as `status` / `sourceLocale`

### M4.2 — IPFS payload v1→v2 atomic（application）

`SubmitReviewUseCase.execute()` 兩處改：

```ts
// 1. version bump
const ipfsPayload = {
  version: 2, // was 1
  brokerId: input.brokerId,
  title: input.title,
  body: input.body,
  ...(input.sentiment ? { sentiment: input.sentiment } : {}), // 條件 spread
  rating: input.rating, // 保留 per D3 給 v1 reader 兼容
  author: input.userId,
  createdAt: new Date().toISOString(),
};
```

關鍵設計決定：**條件 spread `sentiment` 而非無條件**。理由是 M4.2 階段 route 還沒 zod-require sentiment，input.sentiment 可能 undefined；條件 spread 讓 `JSON.stringify` 不會多塞 `"sentiment": undefined`（JS 物件 spread 為 undefined 也會塞 key — 條件 spread 才是正確的 omit）。這保證 transition window 的 keccak256 contentHash 與 v1-差一個 version-bump 完全相同，沒有「ghost sentiment field」干擾。

JSDoc 補 ADR-0028 D3 引用 + 解釋 v1↔v2 discriminator 是 `sentiment` 存在性、`version: 2` 是給人類 auditor 看。

### M4.3 — Sentiment required + rating optional + derivation helper（cross-layer）

跨 4 個 file atomic lift：

**(a) `ReviewEntity.ts`**：

```ts
export type SubmitReviewInput = {
  // ...
  /** Optional per ADR-0028 D4. Web form omits `rating` after M5 ... */
  rating?: ReviewRating;
  /** Required per ADR-0028 D4 — the canonical Phase-1.5+ review axis. */
  sentiment: ReviewSentiment;
  // ...
};
```

**(b) `IReviewRepository.ts`** — 關鍵 type trick：

```ts
export type CreateReviewData = Omit<
  SubmitReviewInput,
  'rating' | 'sentiment'
> & {
  rating: ReviewRating;
  sentiment: ReviewSentiment;
  contentHash: string;
  ipfsCid: string;
};
```

用 `Omit<X, 'a' | 'b'> & { a: T, b: U }` intersection narrowing 把 SubmitReviewInput 的 loose 欄位（rating optional / sentiment required）強型別 narrow 成 repo 邊界 strict（兩者 required）。

**TypeScript 確保 use case 一定 synthesize 兩者** — 若 use case 只傳 `...input` 而不顯式 set rating/sentiment，編譯會 fail。這比 runtime assertion 安全。

`Review.rating` DB column 在 ADR-0028 D6 的 Release N 期內仍 NOT NULL（要 Release N+2 才能 drop migration），這個 type trick 完全 match DB 約束 — repo 邊界保證有值。

**(c) `SubmitReviewUseCase.ts`** — 新 helper：

```ts
function deriveRatingFromSentiment(sentiment: ReviewSentiment): ReviewRating {
  if (sentiment === 'POSITIVE') return 5;
  if (sentiment === 'NEUTRAL') return 3;
  return 1; // NEGATIVE
}
```

關鍵設計決定：**derivation 放 use case 而非 route**。理由是 ADR-0028 D2 反向 mapping 是業務邏輯（D6 期內維持 legacy column 兼容的核心策略），不是 presentation-layer DTO transformation。route 只負責 zod parse → spread；use case 負責所有 sentiment ↔ rating 互轉。

`execute()` 邏輯改：

```ts
async execute(input: SubmitReviewInput): Promise<SubmitReviewOutput> {
  // rating range guard 改 only-when-defined
  if (input.rating !== undefined && (input.rating < 1 || input.rating > 5)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, ...);
  }

  // synthesize rating from sentiment when omitted
  const rating = input.rating ?? deriveRatingFromSentiment(input.sentiment);

  // IPFS v2 payload — 兩 fields 一律 present（不再條件 spread，因為 sentiment 現在 required）
  const ipfsPayload = {
    version: 2,
    brokerId: input.brokerId,
    title: input.title,
    body: input.body,
    sentiment: input.sentiment,
    rating, // synthesized 或 passthrough
    author: input.userId,
    createdAt: new Date().toISOString(),
  };

  // ...

  const review = await this.reviewRepo.create({
    ...input,
    rating,                       // override input.rating（可能 undefined）為 synthesized 值
    sentiment: input.sentiment,   // explicit + 滿足 CreateReviewData.sentiment 非 optional
    contentHash,
    ipfsCid: pinResult.cid,
  });
}
```

**(d) `routes.ts`**：

```ts
const SENTIMENT_VALUES = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;

const submitReviewBodySchema = z.object({
  brokerId: z.string().uuid('brokerId must be a valid UUID'),
  title: z.string().min(1).max(200),
  body: z.string().min(10).max(5000),
  sentiment: z.enum(SENTIMENT_VALUES, {
    message: 'sentiment must be one of POSITIVE, NEUTRAL, NEGATIVE',
  }),
  rating: z.number().int().min(1).max(5).optional(),
  sourceLocale: z.enum(SOURCE_LOCALE_VALUES).optional(),
});
```

**Zod v4 quirk**：第一次寫成 `{ errorMap: () => ({ message: '...' }) }`，typecheck 報 `'errorMap' does not exist in type` — Zod v4 把 `errorMap` 改成 `{ message }` 簡化 API。修正 1 行後第二輪 typecheck 全綠。

POST 處理改用條件 spread 把 rating 傳給 use case：

```ts
const result = await submitReview.execute({
  // ...
  sentiment: parsed.data.sentiment,
  ...(parsed.data.rating !== undefined
    ? { rating: parsed.data.rating as 1 | 2 | 3 | 4 | 5 }
    : {}),
  sourceLocale,
});
```

POST response + GET /:id response 都加 `sentiment` 欄。

### M4.4 — sentimentAggregate on broker detail + per-item sentiment on review list（presentation）

**`brokers/presentation/routes.ts` GET /:slug**：

```ts
// 1. 擴 include.reviews.select 從 { rating } 到 { rating, sentiment }
include: {
  // ...
  reviews: { select: { rating: true, sentiment: true } },
  _count: { select: { reviews: true } },
}

// 2. cast type 改
const reviews = (broker as unknown as {
  reviews: { rating: number; sentiment: string | null }[]
}).reviews;

// 3. in-memory 計算 — 重用既有 array，無需第二個 query
const sentimentAggregate = {
  positive: reviews.filter((r) => r.sentiment === 'POSITIVE').length,
  neutral: reviews.filter((r) => r.sentiment === 'NEUTRAL').length,
  negative: reviews.filter((r) => r.sentiment === 'NEGATIVE').length,
};

// 4. response payload additive 加 sentimentAggregate
return c.json({
  broker: {
    // ... 既有欄位
    ratingDistribution,        // 保留 — 給 pre-M5 consumer
    sentimentAggregate,        // 新增 — 給 M5 SentimentDistribution
    // ...
  },
});
```

關鍵設計決定：

- **In-memory 計算 vs 第二個 query**：選 in-memory，因為 `reviews: { select: { rating } }` 已經 load 全部 review row 進 array，只是多 select 一個 column（從 1 個 number 變成 1 個 number + 1 個 nullable string）。3 個 filter pass 對 typical broker page 載入的 ≤ 100 reviews 完全 negligible。如果未來某 broker 評論破千要分頁，再 refactor 成 `prisma.review.groupBy({ by: ['sentiment'], ... })`。
- **Null sentiment 排除**：per ADR-0028 D7，legacy 未 backfill row 不污染分布；filter 只計 'POSITIVE' / 'NEUTRAL' / 'NEGATIVE' 三明確值，null 自動被排除。
- **`ratingDistribution` 保留 additive**：M5 UI 會 swap 成 `SentimentDistribution`，但 response 維持兩個都送 — 防 pre-M5 deployed web 突然破版。M5 deployed 後若確認無 consumer 再考慮移除（要寫 ADR）。
- **Composite index `[tenantId, brokerId, sentiment]`** 來自 M3.1 — 完全 match 這個 broker-scoped sentiment scan，未來改 groupBy 也免改 index。

**`reviews/presentation/routes.ts` GET /broker/:slug**：每筆 ReviewItem mapping 加 `sentiment: r.sentiment`（nullable），完全 additive。

## 關鍵 implementation 決定（給未來 AI agent）

### 1. `Omit<X, 'a' | 'b'> & { a, b }` 強型別 trick

M4.3 把 `CreateReviewData` 從直接 `SubmitReviewInput & { contentHash, ipfsCid }` 改成 `Omit<SubmitReviewInput, 'rating' | 'sentiment'> & { rating: ReviewRating; sentiment: ReviewSentiment; contentHash; ipfsCid }`。

**為什麼這個 pattern 值得記**：

- 應用場景：input 邊界要 loose（讓 API consumer 容易調用），但 repo 邊界要 strict（讓 DB write 不會 fail）。直接 intersection（`A & { b: T }`）會把 A.b 的 optional 合進來，narrowing 失敗。
- 解法：先 `Omit` 掉那欄，再用 intersection 重新加 strict 版本。TypeScript intersection 規則保證後者覆蓋前者。
- 副作用：use case 寫 `repo.create({ ...input, ... })` 時，如果忘了 explicit 補 strict 欄位的 synthesized 值，**compile fail** — 比 runtime assertion 安全。
- M7（投訴/評論分離）做 `kind` enum 時可能需要類似 pattern（`SubmitContentInput.kind` loose 給雙 UI 用、`CreateContentData.kind` strict 給 repo），記得回來看這個 trick。

### 2. derivation 放 use case 而非 route

M4.3 `deriveRatingFromSentiment(s)` helper 放 use case 內。

**選擇理由**：

- ADR-0028 D2 反向 mapping 是業務邏輯（決定如何用 sentiment 滿足 deprecated column），不是 DTO transformation。
- Route 只做 zod parse + spread 進 use case input；business invariants（包括 D6 deprecation window 的兼容策略）一律使用 case 內封裝。
- 未來 M7 投訴/評論分離若有「verified=true → publicVisibility=indexed」這類業務 default，也應放 use case 而非 route。

**反例（不要做）**：

```ts
// ❌ 在 routes.ts 算：
const rating =
  parsed.data.rating ??
  (parsed.data.sentiment === 'POSITIVE' ? 5 : parsed.data.sentiment === 'NEUTRAL' ? 3 : 1);

submitReview.execute({ rating, sentiment: parsed.data.sentiment, ... });
```

Route 變成知道 D2 mapping 規則，業務邏輯洩漏到 presentation layer，rule 30「presentation 層做業務邏輯」紅線觸邊。

### 3. Zod v4 `{ message }` 取代 v3 `errorMap`

Zod 從 v3.x 升 v4.x 後 `z.enum(values, options)` 的 `errorMap` 改名 `message`（簡化 API，去掉 callable 的 indirection）。

第一輪 typecheck 報：

```
error TS2769: No overload matches this call.
  Object literal may only specify known properties, and 'errorMap' does not exist in type
  '{ error?: ...; message?: string | undefined; }'.
```

修正 1 行 `errorMap: () => ({ message: '...' })` → `message: '...'`，typecheck 立即綠。

**給未來 AI**：本 repo zod 已是 v4，所有 `z.enum` / `z.string` / `z.number` options 都用新 API。如未來看到 docs / Stack Overflow 用 `errorMap`，直接翻成 `message`。

### 4. IPFS payload v1→v2 不破 contentHash

M4.2 + M4.3 把 IPFS payload 從 v1 升 v2，但**完全沒有 contentHash backfill**。為什麼？因為 contentHash 是 per-review 計算的（每筆 review 自己的 payload 算 keccak256），新 review 寫 v2、舊 review 留 v1，各自 contentHash 各自對應自己的 payload，**沒有跨 review 的 hash chain 要重算**。

唯一要注意的是 M4.2 condition spread sentiment 的 transition window：當時 route 還沒 zod-require sentiment，input.sentiment 可能 undefined。如果用無條件 spread `{ sentiment: input.sentiment }`，JSON.stringify 會塞 `"sentiment": undefined`（其實會被 stringify 略掉，但行為依 JS engine），keccak256 hash 可能跟 v1 不同。條件 spread `...(input.sentiment ? { sentiment } : {})` 完全避開這個風險。

M4.3 後 sentiment required，這個條件 spread 永遠為 true。但保留 defensive 設計，無害。

### 5. `pnpm -r typecheck` 全 workspace 跨層驗證

M4.3 改 `apps/api` 的 DTO（POST/GET response 加 sentiment 欄），可能影響 web/console 的 API client type。本 session 每個 commit 都跑 `pnpm -r typecheck` 確認 8 個 workspace 全綠（最快 3.5s 完成 — turbo cache 命中），不只 `pnpm --filter @opentrade/api typecheck`。

實際上 M4 沒有破壞任何 client type — 因為 web/console 的 `lib/api/client.ts` ReviewItem type 還沒加 sentiment field，但 TS 允許 「server 多 ship 欄位、client type 少欄」（structural typing 容忍）。M5 改 ReviewCard 時才需要把 client.ts type 補 sentiment。

**給未來 AI**：API 加欄位 commit 跑 `pnpm -r typecheck`（即使預期不破 client），可以提前發現某些 client hand-rolled type 過嚴會炸。

## 給下一個 session 的明確起手點

M5 第一個 commit（M5.1）是 `packages/ui` 的 `SentimentPicker` Storybook primitive：

```bash
# 1. 看現有的 ToggleGroup / Button-Group 類似元件
ls packages/ui/src/components/ | rg -i "toggle|group|picker|select"
# 看 packages/ui/src/components/<existing similar>.stories.tsx 的範本

# 2. 新檔
# packages/ui/src/components/SentimentPicker.tsx
# packages/ui/src/components/SentimentPicker.stories.tsx

# 3. props 設計：
#   value: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null
#   onChange: (v: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE') => void
#   labels: { positive: string; neutral: string; negative: string }
#   size?: 'sm' | 'md' | 'lg'
#   disabled?: boolean
# 注意：i18n 在 web/console 用呼叫端解析（packages/ui 不直接 import next-intl），
#       這跟既有 Button / SbtBadge 一致。

# 4. 三色 token：
#   POSITIVE — 綠（與 verifiedBroker pill 一致 #00FF88 系）
#   NEUTRAL — 灰（white/10 background, white/60 text）
#   NEGATIVE — 紅（與 RejectReasonModal 紅框一致）

# 5. a11y：
#   role="radiogroup", 每 button role="radio" aria-checked
#   keyboard nav：Left/Right 切換，Space/Enter select

git add packages/ui/src/components/SentimentPicker.tsx packages/ui/src/components/SentimentPicker.stories.tsx
git commit -m "feat(ui): add SentimentPicker primitive with three-color toggle group"
```

M5.2 是 web `ReviewForm` swap：

```bash
# apps/web/src/app/[locale]/brokers/[slug]/components/ReviewForm.tsx
#   - 移除 5-star widget（保留 form layout / title / body / submit button）
#   - import SentimentPicker from '@opentrade/ui'
#   - state 從 rating: 1-5 改 sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null
#   - submit body 從 { rating } 改 { sentiment }
#   - validation：sentiment === null → disable submit button
#
# apps/web/src/app/[locale]/brokers/[slug]/components/BrokerDetailTabs.tsx 的 SubmitReviewCta 同步改
#
# apps/web/messages/{zh-Hant,zh-Hans,en}/brokerDetail.json 加 5 個 key：
#   reviewForm.sentimentLabel ("您的評價" / "您的评价" / "Your verdict")
#   reviewForm.sentimentPositive ("讚" / "赞" / "Positive")
#   reviewForm.sentimentNeutral ("普通" / "普通" / "Neutral")
#   reviewForm.sentimentNegative ("不讚" / "不赞" / "Negative")
#   reviewForm.sentimentRequired ("請選擇您的評價" / "请选择您的评价" / "Please select a verdict")
#
# apps/web/src/lib/api/client.ts SubmitReviewInput 加 required sentiment + rating 從 required 改 optional
```

M5.3 是 ReviewCard sentiment badge + sourceLocale pill 並排：

```bash
# apps/web/src/app/[locale]/brokers/[slug]/components/BrokerDetailTabs.tsx 的 ReviewCard
#   - 移除星列渲染
#   - 加 sentiment chip（綠/灰/紅 + 中文/英文 label）
#   - 處理 sentiment === null + rating 有值的 legacy 情況：
#     顯示 caption "依五星評分回推為 X 星"（per ADR-0028 D7），不渲染星
#
# apps/web/src/lib/api/client.ts ReviewItem type 加 sentiment: ReviewSentiment | null
#
# messages 加：
#   brokerDetail.reviewCard.sentimentPositive / Neutral / Negative
#   brokerDetail.reviewCard.legacyRatingCaption "依五星評分回推為 {rating} 星"
```

M5.4 是 RatingSummary swap：

```bash
# apps/web/src/app/[locale]/brokers/[slug]/components/BrokerDetailTabs.tsx 的 RatingSummary
#   - 從 5-bar ratingDistribution 改 3-bar sentimentDistribution
#   - 用 broker.sentimentAggregate.{positive,neutral,negative}
#   - 三條 horizontal bar，bar 寬度 = count / max(counts) * 100%
#   - 三色 token 與 SentimentPicker / ReviewCard 一致
#
# apps/web/src/lib/api/client.ts BrokerDetail type 加 sentimentAggregate
#
# 改名考慮：是否從 RatingSummary 改名 SentimentDistribution？
#   建議是 — 與 ADR-0028 D7 「RatingSummary becomes SentimentDistribution」一致
#   但這會改檔名 + 多處 import — 評估 M5.4 diff 是否超 200 行，必要時拆 M5.4a 改名 + M5.4b 改邏輯
```

M5.5 是 console admin reviews 表 column + filter：

```bash
# apps/console/src/app/[locale]/admin/reviews/ReviewsClient.tsx
#   - 表格 column 從 "Rating" 改 "Sentiment"
#   - filter dropdown 從 5-star 改 4-option (All / POSITIVE / NEUTRAL / NEGATIVE)
#   - apps/api/src/domains/admin/presentation/routes.ts 的 GET /v1/admin/reviews
#     query schema 加 sentiment filter（optional z.enum）+ where clause 對應加
```

M5.6 是 legacy caption 覆蓋兩 app：

```bash
# 確保 ReviewCard (web) + admin reviews 表 (console) 對 sentiment === null + rating 有值的 row
# 統一顯示「依五星評分回推為 X 星」caption + 不渲染星 + 不顯示 sentiment chip
# per ADR-0028 D7
```

## 待後續處理事項

無 — M4 完整完成、沒有半成品；M5 起手點明確、沒有遺留 dependency。一個非阻塞 follow-up：M5.4 改 `RatingSummary` 改名 `SentimentDistribution` 時要評估是否拆 commit（改名 vs 改邏輯），若一次改超 200 行 diff 就拆。

非 M5 範圍的 reminder：production DB 跑過 `db:backfill:prod` 後（含 sentiment backfill），M5 deployed 才不會看到大量 legacy caption。順序：M3-M4 code → production deploy → 跑 backfill → M5 code → production deploy。

## 給未來 AI 的建議

1. **`Omit<X, 'a' | 'b'> & { a, b }` 強型別 trick 是好用 pattern** — 當 input boundary 要 loose、storage boundary 要 strict 時，這個 intersection narrowing 比 runtime assertion 安全 30%。M7 投訴/評論分離（`kind` enum）+ M10 商戶功能（owner-edit DTO）很可能會用到。

2. **Zod v4 `{ message }` 不是 `errorMap`** — 本 repo zod 已是 v4，所有 `z.enum` / `z.string` options 用 v4 API。如未來看到 docs / Stack Overflow 用 `errorMap`，直接翻成 `message`。

3. **API 改 DTO 跑 `pnpm -r typecheck` 而非 `pnpm --filter @opentrade/api typecheck`** — turbo cache 命中後 < 5s，但能提前發現 client 端 hand-rolled type 過嚴的 break。

4. **derivation logic 放 use case，不放 route** — 業務 invariant（包括 deprecation window 兼容策略）一律 use case 封裝；route 只做 zod parse + spread 進 use case input。Rule 30「presentation 層做業務邏輯」紅線觸邊就要 refactor。

5. **下一個 session（M5）context 預期較重** — 改 6 個 file (packages/ui 2 新 + apps/web 3 改 + apps/console 1 改) + 3 個 messages 三語 (3 × 3 = 9 update points) + 2 個 lib/api/client.ts type 改。建議啟動時先 batch read：`packages/ui/src/components/`（找最近的 toggle-group story） + `apps/web/src/app/[locale]/brokers/[slug]/components/{BrokerDetailTabs,ReviewForm}.tsx` + `apps/web/messages/zh-Hant/brokerDetail.json` + `apps/console/src/app/[locale]/admin/reviews/ReviewsClient.tsx` + ADR-0028 D7 + 本 session conversation log。

6. **rule 99 self-review 結果：M4 沒引入新 pattern** — 所有改動皆用既有（DDD 4-layer / type-only import / hand-rolled toRecord / conditional spread DTO / hand-roll prop types），無需更新任何 cursor rule。zod v4 `{ message }` API quirk 不到 rule entry 等級。M5 進 UI design system，可能會碰到 packages/ui 三色 token 加 sentiment 系列、Storybook story template 拓展 toggle-group 模式 — 那時是潛在的 rule 22（Tailwind / shadcn）or rule 21（React/Next）update 觸發點，要在 M5 收尾時 self-review。

## 新 Session 開場 Prompt（複製這段給 M5 agent）

```text
我是 OpenTrade 項目負責人，繼續 14-milestone 執行計畫的 M5 起跑（Rating UX rebuild — Web + Console UI）。

請先讀以下文件（依序）：
1. AGENTS.md
2. docs/00-vision.md
3. docs/03-status.md（重要 — 看 §最後更新 + §下一步 + §已完成 §M4 段）
4. docs/conversations/2026-05-25-m4-execution.md（M5 起手點 + 6 commit 拆解在末段）
5. docs/decisions/0028-deprecate-five-star-rating.md（M5 spec，特別看 D7 UI rebuild scope + legacy null caption）
6. packages/ui/src/components/（找最近的 toggle-group 類似元件作為 SentimentPicker 範本）
7. apps/web/src/app/[locale]/brokers/[slug]/components/{BrokerDetailTabs,ReviewForm}.tsx（M5.2-M5.4 改動目標）
8. apps/web/messages/zh-Hant/brokerDetail.json（M5.2-M5.4 三語 message 範本）
9. apps/console/src/app/[locale]/admin/reviews/ReviewsClient.tsx（M5.5 admin reviews 表）
10. .cursor/rules/22-tailwind-shadcn.mdc + .cursor/rules/21-react-nextjs.mdc（UI 紅線）

然後告訴我：
- 你掌握的當前進度摘要（M0-M4 已完成的核心結論）
- M5 六個 atomic commit 起手點是否清楚（5.1 SentimentPicker primitive / 5.2 ReviewForm swap / 5.3 ReviewCard sentiment badge / 5.4 RatingSummary → SentimentDistribution / 5.5 console admin reviews / 5.6 legacy caption）
- 你建議 M5.1 packages/ui commit 第一步從哪開始

確認後我們開始 M5：
- M5.1 `feat(ui)`：packages/ui 新 `SentimentPicker` primitive + Storybook story（toggle-group pattern + 三色 token + a11y radio）
- M5.2 `feat(web)`：ReviewForm 五星 → sentiment picker swap + 三語 messages + lib/api/client.ts SubmitReviewInput 加 required sentiment + 改 rating optional
- M5.3 `feat(web)`：ReviewCard 星列 → sentiment badge + 三語 + sourceLocale pill 並排 + legacy null+rating caption per D7
- M5.4 `feat(web)`：RatingSummary widget 改名 SentimentDistribution + 用 broker.sentimentAggregate + 三條 bar + 三色 token
- M5.5 `feat(console)`：admin reviews 表 column 改 Sentiment + filter dropdown + admin API query 加 sentiment param
- M5.6 `feat(web,console)`：legacy null-sentiment caption per D7 覆蓋兩 app

預計 M5 全部 6 commit 內完成，typecheck 全綠 + 過 lint-staged。
```
