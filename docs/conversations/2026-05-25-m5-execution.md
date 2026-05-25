# M5 execution — Rating UX rebuild (Web + Console UI) — 2026-05-25

> 本文件歸檔 OpenTrade 項目 14-milestone 執行計畫 **M5（Rating UX rebuild — Web + Console UI）** 一個 session 內把 6 個 atomic commit 跑完的對話精華內容。M5 是 ADR-0028「廢除五星評分制改用三向 sentiment」決策從 API 層延伸到 UI 層的完整改寫，覆蓋 web 散戶端 + console 商戶與管理員端。

---

## 對話脈絡

- **日期**：2026-05-25（M4 handoff 後接續同日）
- **AI 模型**：Claude Opus 4.7
- **背景**：M4 session 跑完 4 個 atomic commit 把 sentiment 從 DB 層（M3）一路推到 API 寫入 + 讀取 path（ReviewSentiment value object + IPFS payload v1→v2 + `POST /v1/reviews` zod required + `sentimentAggregate` on broker detail + per-row `sentiment` on reviews list），handoff 至 M5 起手點明確：packages/ui SentimentPicker primitive → web ReviewForm/ReviewCard/RatingSummary swap → console admin reviews 表 column + filter → legacy null-sentiment caption per D7，共 6 commits。
- **參與者**：項目負責人 + AI agent（Claude Opus 4.7）
- **核心交付**：把所有「五星評分」UI 從 web + console 兩個 app 撤底拔除，改為 POSITIVE / NEUTRAL / NEGATIVE 三向 sentiment chip，並對 M3.2 backfill 無法分類的 legacy row 一律 fall back 到 legacy rating caption（per ADR-0028 D7 嚴守「不偽造 sentiment」紅線）。

---

## 主要討論內容（按主題分節）

### 1. M5.1 — `packages/ui` SentimentPicker primitive + Storybook

**設計關鍵**：

- 採 string-literal union `Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'` 而非 enum（rule 10 監督 packages/ui 不可 import 任何 apps/）— 雖然 Prisma + domain 層都已有同名 enum/union，packages/ui 此處重定義一份保持型別隔離 + 零循環依賴。
- Labels caller-supplied（不 import next-intl）— 由 apps/web / apps/console 注入翻譯字串，packages/ui 保持對 i18n 框架完全零耦合（per rule 10 monorepo boundary）。
- Semantic tokens `success` / `muted` / `danger` per rule 22（不 hardcode 顏色 hex），但 Storybook DarkSurface story 用 inline style 模擬 web dark theme 的 `#00FF88` 給審美對齊查看。
- A11y：`role="radiogroup"` wrapper + 每顆 button `role="radio"` + `aria-checked` + `aria-label` from caller-supplied labels；keyboard navigation 由瀏覽器 native radio group 行為提供（不另寫 keydown handler 避免重造輪子）。

**Storybook 9 stories** 對應 rule 22 strict requirement（每個 primitive 必有 Storybook coverage）：

1. `Empty` — 三顆按鈕全 unselected，最常見的 initial state。
2. `Positive` / `Neutral` / `Negative` — 三個各自 selected state。
3. `AllSizes` — `sm` / `md` / `lg` 三 size 並列驗證 cva variants。
4. `Disabled` — 全 disabled state。
5. `Localised` — 3 個 sub-story：zh-Hant「讚 / 普通 / 不讚」/ zh-Hans「赞 / 普通 / 不赞」/ en「Positive / Neutral / Negative」。
6. `DarkSurface` — 嵌進 dark card 模擬 web theme。
7. `InContext` — 嵌在 form 中與 textarea 並列驗證實際使用情境。

**爭議點**：380 行 diff（180 行 component + 162 行 stories + 5 行 export）超出 rule 96 < 200 行建議。決議是接受 atomic-but-large precedent — 借鑑 M3.2 backfill script（202 行）先例，component + stories 拆兩 commit 反而破壞 rule 22「primitive 必伴 Storybook」紅線、也讓 commit 失去原子性（component 沒 stories 等於沒驗收條件）。

### 2. M5.2 — `feat(web)`：把 ReviewForm + SubmitReviewCta 五星換 SentimentPicker

**API 對齊**：

- `apps/web/src/lib/api/client.ts` `SubmitReviewInput.sentiment` 升 required + `rating` 改 optional，對齊 M4.3 API contract（zod schema 已強制 sentiment）。
- `SubmitReviewResponse.review` 加 sentiment field 對齊 M4.3 POST response。

**Form state migration**：

- 兩個 form（`ReviewForm.tsx` 散戶獨立頁 + `BrokerDetailTabs.tsx` SubmitReviewCta inline）state 從 `rating: number` → `sentiment: Sentiment | null`。
- 送出 validation 從 `rating > 0` → `sentiment !== null`。
- Submit button disabled logic 對應改 `sentiment === null`。

**i18n**：3 locale 加 5 keys（reviewForm.sentimentLabel / sentimentPositive / sentimentNeutral / sentimentNegative / sentimentRequired），共 15 字串。

### 3. M5.3 — `feat(web)`：ReviewCard 五星 row 換 sentiment badge + legacy caption fallback

**ReviewItem 型別擴**：

- `ReviewItem.sentiment` 加 `'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null`（nullable 對應 M4.4 API 不偽造 legacy row）。

**render path 改寫**：

- 舊 `[1,2,3,4,5].map(<Star />)` row 整段拆掉。
- 新 `sentimentMeta` derive — 從 `review.sentiment` lookup tone (positive/neutral/negative) + icon (ThumbsUp/Minus/ThumbsDown) + 翻譯 label。
- 新 `sentimentChipClass` derive — 從 tone lookup Tailwind classes（POSITIVE → `bg-[#00FF88]/15 text-[#00FF88]` / NEUTRAL → `bg-white/10 text-white/70` / NEGATIVE → `bg-red-500/15 text-red-300`）。
- 嚴守 ADR-0028 D7「不偽造 sentiment」紅線：null sentiment 不嘗試從 rating 反算 — 反而顯示 `legacyRatingCaption` chip（"舊評分：X 星"）+ tooltip 解釋此 review 在五星制廢除前提交，僅顯示舊評分作為參考。

**i18n**：3 locale 加 6 keys（brokerDetail.sentimentPositive / sentimentNeutral / sentimentNegative / sentimentBadgeAria / legacyRatingCaption / legacyRatingCaptionTooltip），共 18 字串。

### 4. M5.4 — `feat(web)`：RatingSummary → SentimentDistribution 三條 bar widget

**BrokerDetail 型別擴**：

- `BrokerDetail.sentimentAggregate: { positive, neutral, negative }` 加進對應 M4.4 ship 的 field。
- `BrokerDetail.ratingDistribution` 保留 type 但加 `@deprecated per ADR-0028 D6` doc comment（API 仍 ship 給 pre-M5 consumer 不破壞 contract，rule 31 schema-drop 階段化原則）。

**Widget rebuild**：

- 局部 `RatingSummary` function 改名 `SentimentDistribution`（單一 callsite 就在同檔，無 import 重寫，rule 96 atomic 通過）。
- **左欄**：保留 `positiveRate` headline（API 已在 M4.4 over sentiment-only rows 計算口徑乾淨）；但移除原本的五星 icon row（per D7 UI 必須完全停止宣傳廢除尺度，連裝飾也不行）。
- **右欄**：從五條 by-stars bar 換成三條 by-sentiment bar：
  - 三色 token：`#00FF88` POSITIVE / `white/40` NEUTRAL / `red-400` NEGATIVE。
  - Bar width 用 `Math.max(positive, neutral, negative, 1)` 正規化避免少數 verdict 全消失。
  - 每列 trailing 顯示「count · share%」，share% 用 totalKnown 為分母。
- **Empty state**：`totalKnown === 0` 渲染 `sentimentDistributionEmpty`（"尚無已分類的評價"）給 fresh broker 或全 legacy-null sentiment broker。

**i18n**：3 locale 加 2 keys（brokerDetail.sentimentDistribution / sentimentDistributionEmpty），共 6 字串。

### 5. M5.5 — `feat(console,api)`：admin reviews 表 column + filter dropdown + API sentiment param

**API 層**（`apps/api/src/domains/admin/presentation/routes.ts`）：

- `listReviewsSchema` 加 `sentiment: z.enum(['POSITIVE','NEUTRAL','NEGATIVE']).optional()` query param。
- WHERE 條件 spread `...(query.data.sentiment ? { sentiment: query.data.sentiment } : {})`。
- per-row map 加 `sentiment: (r as unknown as { sentiment: string | null }).sentiment` cast（include 的 TypeScript surface 沒明確含新 column，這比改 prisma schema-level select type 更安全）。
- JSDoc 解釋：M3.1 composite index `[tenantId, brokerId, sentiment]` 對全域 admin query 無直接幫助（無 brokerId narrowing），但三值的 sentiment column 本身 selectivity 高，Postgres partial range scan 足夠快。

**Console 層**（`apps/console/src/app/[locale]/admin/reviews/ReviewsClient.tsx`）：

- `AdminReviewItem.sentiment` 加 nullable enum。
- `fetchAdminReviews` 參數加 `sentiment?`。
- UI 加 4-option sentiment filter dropdown 並排 status filter。
- 表格 column header 換 `thRating → thSentiment`。
- 每行 cell 換新 `<SentimentCell>` helper（POSITIVE/NEUTRAL/NEGATIVE chip + null-sentiment `legacyRatingCaption` fallback，star widget 完全從 admin reviews surface 移除）。

**i18n**：3 admin locale 加 7 keys（thSentiment / allSentiments / sentimentPositive / sentimentNeutral / sentimentNegative / legacyRatingCaption / legacyRatingCaptionTooltip），共 21 字串。

### 6. M5.6 — `feat(console)`：merchant surface 三處 star widget sweep + legacy caption coverage

**Audit 發現** 三個剩餘 console surface 還在 render 五星 widget：

1. `apps/console/src/app/[locale]/brokers/[slug]/page.tsx`（merchant 看自己 broker detail 的 server component）— `ReviewRow` 內 `Array.from({ length: 5 }).map(<Star />)`。
2. `apps/console/src/app/[locale]/broker/reviews/BrokerReviewsClient.tsx`（merchant 看 reviews list 的 client component）— 右欄 `[1,2,3,4,5].map(<Star />)`。
3. `apps/console/src/app/[locale]/broker/BrokerDashboardClient.tsx`（merchant dashboard recent reviews mini card）— 藍色 `<Star /> + {review.rating}` 小 chip。

**改寫策略**：每個 surface 新 surface-specific `SentimentChip` / `DashboardSentimentChip` helper，因為：

- **Console light theme**（semantic tokens `success` / `danger` / `muted`）vs **web dark theme**（hardcoded `#00FF88` / `red-300` / `white/70`）色系完全不同。
- Lift 共用 component 反而需要兩套 variant，hand-roll 更輕。
- 共有 4 個 surface-specific helper（admin SentimentCell + merchant SentimentChip ×2 + dashboard DashboardSentimentChip），各自針對自身 theme 與 layout。

**Legacy fallback 一致**：4 個 helper 都對 null sentiment 顯示 `legacyRatingCaption`，dashboard 變體保留 blue Star + numeric 微 chip 維持視覺節奏（per UI 設計考量）。

**i18n**：3 個 locale 在 `broker` + `brokerManage` 雙 namespace 各加 5 keys（sentimentPositive / sentimentNeutral / sentimentNegative / legacyRatingCaption / legacyRatingCaptionTooltip），共 30 字串。

**驗證**：完成 M5.6 後跑 `pnpm -r typecheck` 全 8 workspace 綠，並 grep 確認所有 reader-facing surface 跨 web + console 已無 live review 用五星 widget；剩 `ReviewsClient.tsx` / `AuthGate.tsx` / 控制台 home page 的 `Star` import 全是 nav 裝飾 glyph（不是 review widget），per ADR-0028 D6 保留給未來 generic re-skin。

### 7. Mid-session handoff 評估

User 在 M5.3 完成後問「需要將餘下的 M5 hand off 給新 agent 嗎」。AI agent 分析後建議**繼續本 session**，理由：

1. M5 是一個邏輯單元（一個 milestone 的 6 個 atomic commit），mid-session handoff 會打斷原子性。
2. 剩 M5.4-M5.6 都是已建立 pattern 的 mechanical extension（M5.3 已寫過 sentiment chip / legacy caption 全 pattern）。
3. Token 使用率還在 ~60%，沒到 rule 98 「對話累積過長」觸發點。
4. M5 全部跑完才是自然的 handoff point。

User 同意，後續 M5.4-M5.6 順利跑完。

---

## 產生的 commit

| Commit    | Scope               | 描述                                                          |
| --------- | ------------------- | ------------------------------------------------------------- |
| `e680d64` | `feat(ui)`          | M5.1 SentimentPicker primitive + 9 Storybook stories          |
| `b2b27df` | `feat(web)`         | M5.2 ReviewForm + SubmitReviewCta swap 五星 → SentimentPicker |
| `acb1a33` | `feat(web)`         | M5.3 ReviewCard 五星 row → sentiment badge + legacy caption   |
| `811f61e` | `feat(web)`         | M5.4 RatingSummary → SentimentDistribution 三條 bar           |
| `292cc15` | `feat(console,api)` | M5.5 admin reviews 表 column + filter + API sentiment param   |
| `ec0c07f` | `feat(console)`     | M5.6 merchant surface 三處 sweep + legacy fallback            |
| `c16d3ab` | `fix(db)`           | 順手清 db scripts lint backlog（lint-staged 觸發）            |
| `679cd8a` | `fix(api)`          | 順手清 reviews + brokers domain lint backlog                  |
| `13673ba` | `fix(console)`      | 順手清 admin + broker client lint backlog                     |
| `759597c` | `fix(web)`          | 順手清 cleanup-race flag false-positive lint                  |

---

## 待後續處理事項

### Phase 1 收尾期

- M6 是下一步：playwright E2E tests 改 sentiment selectors + 加 5 個 sentiment-only path tests per ADR-0028 D7。預估 5-6 個 atomic commit。
- 等 M5 + M6 都跑完後，14-milestone 計畫進度 6/14 → 7/14（Rating UX rebuild 完整跑完）。

### Phase 2+ 才處理

- **ADR-0028 D6 階段** — `Review.rating` column drop migration：當所有 production review 都有 sentiment 後（M3.2 backfill 跑過 prod + M4 路徑寫的 review 至少 2 個 release 後），開新 ADR drop column。屆時所有「null sentiment 顯示 legacy caption」邏輯也要清掉。
- **Star 裝飾 glyph re-skin**：ReviewsClient / AuthGate / 控制台 home page 的 `Star` icon import 等 D6 階段或 Phase 2 generic UI refresh 一起處理。
- **packages/ui SentimentBadge primitive**：M5 各 surface hand-roll chip 是必要的（dark/light theme + chip variant 散在 4 處），但長遠看可以提煉一個 `SentimentBadge` primitive 進 `packages/ui` 統一三色 + icon mapping，apps 注入翻譯字串。等 M6/M7 完才考慮（避免 premature abstraction）。

---

## 給未來 AI agent 的建議

1. **M5 結束後所有 reader-facing 五星 widget 已撤底拔除**。grep `<Star ` 在 `apps/web` + `apps/console` 應該只剩 nav glyph（home page sidebar icons），不應有 review widget。如果發現新 widget 出現，先確認是否屬於 ADR-0028 D7 漏網之魚。

2. **legacy null-sentiment fallback 是核心紅線**。任何渲染 review 的新 component 都必須：
   - 接受 `sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null`。
   - 對 null 顯示 `legacyRatingCaption`，**不可** 從 rating 反算 sentiment 顯示（per D7）。
   - tooltip 解釋 deprecation 給讀者。

3. **caller-supplied i18n labels pattern**。`packages/ui` 任何新 component 都不可 import `next-intl`。如果需要翻譯字串，定義 `LabelsProps` 由 apps 注入。Storybook stories 用 hardcoded English 即可（或加 `Localised` story 範例）。

4. **surface-specific chip helper 是正當設計**。Console light theme + web dark theme 色系不同，硬要 lift 共用 component 反而需要兩套 variant。等 M6 + M7 都跑完，若發現有 3+ 個 surface 用同色系再考慮提煉 `packages/ui/SentimentBadge`。

5. **lint-staged auto-fix 會碰路徑外的檔案**。M5.x 期間 lint-staged 順手清了 4 個 cousin file 的 lint backlog（fix commits）— 不要試圖阻止，這是預期行為。**但** 仍要每次 commit 前 `git diff --cached` 檢查 staged files 是否符合預期，避免不相關 working-tree dirty 隨 M5 commit 進。

6. **ADR-0028 D6 drop 還沒到**。`Review.rating` column 仍存在於 schema + API response。任何「以 rating 為主軸的計算」（例如 RatingDistribution）都該標 `@deprecated` 但**不要**移除 type，因為 API 還 ship。
