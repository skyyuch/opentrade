# M6 Execution — Rating Tests + E2E (2026-05-25)

> 本文件歸檔 OpenTrade 項目 2026-05-25 M6 milestone execution session 的精華內容。
> 接續 M5 handoff，完成 14-milestone 計畫的第 7 個 milestone，並修復一個 critical 的 Playwright × dev cache poisoning incident。

## 對話脈絡

- **日期**：2026-05-25（接 M5 handoff session 同日完成）
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.7
- **背景**：14-milestone 計畫第 7 個 milestone — Rating tests + E2E，覆蓋 ADR-0028 五星 → 三向 sentiment 在 API + UI + component + e2e 各層的測試
- **前置狀態**：M0-M5 已完成 21/70 atomic commit，所有 reader-facing surface 已從五星 widget 換成 sentiment badge / picker / distribution，但**完全沒有自動化測試**

---

## 主要討論內容（按主題分節）

### 1. M6 起跑與三個 pre-work 問題

User 啟動 session 時要求依序讀 10 份文件並以固定格式回報項目狀態，並提出三個 pre-work 問題：

- **A. 測試基礎設施完全不存在**：Vitest、Playwright、`@testing-library/react`、`jsdom` 都還沒裝；要決定怎麼引入而不破壞 rule 96 < 200 行 diff 慣例
- **B. M6.3 E2E 真實度**：要不要 auto-launch 本地 dev services？要不要碰 Privy 真實登入？要不要打真實 testnet 鏈？
- **C. 既有 Foundry forge 測試**：要不要也涵蓋進 M6？

決定：

| 問題 | 決議                                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | 接受一個 atomic-but-large M6.0 bootstrap commit（~260 行 diff，3 個 workspace install + config + 各一條 canary smoke test），借鑑 M3.2 backfill script 先例 |
| B    | **不動真實 Privy、不動真實鏈** — Privy mock 太昂貴、testnet 收費且 flaky；走「Playwright + 全 stub」                                                        |
| C    | **排除在 M6 之外** — Foundry 已有自己的 unit test stack（`packages/contracts/test/*.t.sol`）跑得獨立，M6 專注 TS 層                                         |

### 2. SentimentBadge primitive 抽出爭議

User 觀察到 ADR-0028 sweep 後 web + console 共 5 個 hand-rolled sentiment chip 實作，呼籲改成 B2（在 packages/ui 抽 primitive）以避免 future change leak。

決定：派 `explore` subagent audit 5 個 callsite：

- `apps/web/src/components/brokers/BrokerDetailTabs.tsx` — neon green/red (hardcoded `#00FF88` / red-400)
- `apps/console/src/app/[locale]/broker/BrokerDashboardClient.tsx` — neon (preserved from dashboard's blue rhythm)
- `apps/console/src/app/[locale]/broker/reviews/BrokerReviewsClient.tsx` — neon
- `apps/console/src/app/[locale]/admin/reviews/ReviewsClient.tsx` — neon
- `apps/console/src/app/[locale]/brokers/[slug]/page.tsx` — **semantic** (success/muted/danger tokens, console token-driven theme on merchant detail)

**設計關鍵**：兩種色系不能合併成一套 token，因為 web dark theme 與 console light token theme 是兩個獨立 design system；所以 `SentimentBadge` 走 `cva` 的 `theme="semantic" | "neon"` × `size="xs" | "sm" | "md" | "lg"` 矩陣，single primitive 撐起兩種視覺語言。Labels 全部 caller-supplied（per rule 10，packages/ui 不引 next-intl）。

### 3. M6.3 從「Playwright + 全 stub」改成「兩條腿」策略

`explore` subagent 並行研究 Privy 在 Next.js 14 App Router + wagmi v2 + next-intl 環境的 E2E 整合：

- Privy 的 token-refresh + smart-wallet provisioning 都在 React Context 內部 state，且 Provider 一旦 instantiate 就會嘗試打 Privy auth.privy.io API
- 要 stub 必須深度 mock Provider 的 internal state + intercept 至少 4 個 endpoint + manage refresh token rotation
- 維護成本長期遠超測試價值

**決議重構**為兩條腿：

| 路徑       | 工具                         | Cover                                                                     |
| ---------- | ---------------------------- | ------------------------------------------------------------------------- |
| Write path | Vitest + RTL                 | ReviewForm 提交、submit gating、ApiClientError 三類錯誤、null accessToken |
| Read path  | Playwright + API stub server | Broker detail page sentiment badges、legacy caption fallback、未登入 CTA  |

優勢：

1. **Privy 完全 bypass** — 寫入路徑透過 `vi.mock('@privy-io/react-auth', ...)` factory 模擬 hooks；讀取路徑根本不登入
2. **Stub 簡單** — `apps/web/e2e/fixtures/api-stub.ts` 是零依賴 Node `http.createServer`，~70 行
3. **CI 友好** — Playwright 只要 `chromium`，stub 啟動 <50ms
4. **測試金字塔正確** — write path 是 component test (12 個)，read path 是 e2e (3 個)，比例符合 70/10

### 4. End-of-session Critical Bug：Playwright cache poisoning user's dev

User 在 M6 主體完成、準備 handoff 時報告：他的 `pnpm dev`（port 3000，真 API 4000）瀏覽器頁面 throw `fetch failed`，error 在 `client.ts:84 apiGet`。

**Diagnosis**：

```text
TypeError: fetch failed
  port: 4010,                  ← 注意！不是 4000
  errno: -61,
  code: 'ECONNREFUSED'
```

`4010` 是我 Playwright config 裡的 API stub port，不是 user `.env` 裡的 `localhost:4000`。

**Root cause**：

- 兩個 `next dev` process（user 的 port 3000 / Playwright 的 port 3030）共用 `apps/web/.next/cache/webpack/`
- Webpack persistent cache 的 module key **不包含**環境變數 hash
- Playwright `next dev` 把 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4010` inline 進 `client.ts` 的編譯結果並寫入共用快取
- User 的 dev server 下次 recompile 命中那份快取 → 從此向 4010 fetch（但 stub server 早就被 Playwright 收掉）→ ECONNREFUSED

**Fix 路徑**（兩步走，分別 commit）：

1. **急救** — `rm -rf apps/web/.next`，user 的 dev server 重新 compile 即恢復（5-10 秒）
2. **永久修補 commit `2c87b26`**：
   - `apps/web/next.config.mjs` 加 `distDir: process.env['NEXT_DIST_DIR'] ?? '.next'`
   - `apps/web/playwright.config.ts` webServer env 加 `NEXT_DIST_DIR: '.next-e2e'`
   - `.gitignore` + 根 `eslint.config.mjs` + `apps/web/tsconfig.json` 處理新目錄（keep `.next-e2e/types/**` 給 typed routes、exclude `.next-e2e/{cache,server,static}` 不讓 tsc 吃 build output）

驗證：重跑 `pnpm test:e2e` 3/3 仍綠、`.next/` 與 `.next-e2e/` 物理隔離。

**Lesson**：codify 進 rule 60 §E2E webServer 隔離 — 任何 e2e harness spawn 自己的 dev server 必須用獨立 build dir，否則會與 user 的 dev process 共用 cache 並 race。

---

## 產生的 commits（按時間順序）

| Commit    | Type     | 行數 | 內容                                                             |
| --------- | -------- | ---- | ---------------------------------------------------------------- |
| `9ff63f6` | chore    | ~260 | M6.0 vitest stack bootstrap (api + web + shared)                 |
| `ce19b80` | test     | ~480 | M6.1 SubmitReviewUseCase + sentiment aggregate + IPFS payload v2 |
| `1291489` | refactor | ~480 | M6.2a SentimentBadge primitive extraction + 5-callsite sweep     |
| `5ca6ef0` | test     | ~330 | M6.2b SentimentBadge + SentimentPicker tests + play functions    |
| `82425db` | test     | ~520 | M6.3a ReviewForm submit + gate + error UI (vitest+RTL)           |
| `7b309b7` | test     | ~370 | M6.3b broker detail read-path e2e (Playwright + stub)            |
| `2c87b26` | fix      | 46   | M6.3 fix: isolate playwright next dev cache                      |

7 個 commit 全 push 到 main（admin bypass 仍生效中，per 「待決策/流程層級」）。`pnpm --filter @opentrade/web typecheck` + lint-staged + prettier hooks 全綠。

---

## 產生的 ADR

無新 ADR。M6 整段工作純執行既有 ADR-0028（五星 → sentiment）的測試補完，不引入新架構決策。

---

## 產生的 cursor rule 改動

預計 M6 handoff commit 帶上 rule 60 micro-update：加 §「E2E webServer 隔離」短段，紀錄 `NEXT_DIST_DIR` 隔離原則供未來 milestone 看。

---

## 待後續處理事項

### M7 起手點（next session）

依 ADR-0029 把 complaint 與 review 分離。預估 7 commits：

1. M7.1 DB schema — `Review.kind` discriminator + complaint-only fields + `respondsToReviewId`
2. M7.2 outbox event vocabulary — `complaint.submitted/verified/rejected`
3. M7.3 API DDD — Submit/List/Verify use cases + zod schema
4. M7.4 console admin verify/reject UI
5. M7.5 web complaint form
6. M7.6 web broker detail tabs — 第三 tab「投訴」
7. M7.7 i18n + tests

詳見 status doc §「中期（M7 — 14-milestone 計畫下一步）」。

### 收尾觀察

- **Outbox worker `verification.broker_added` noop handler**：M1 已加（status doc 14），M6 期間穩定運行無 warn noise
- **Production DB 跑 backfill `db:backfill:prod`**：runbook 已就緒，等 Phase 1 production deploy 觸發
- **CI `e2e-web` job**：M6.3b 已加，下次 CI run 會驗證 Playwright 在 GitHub Actions 環境跑得通（包含 browser cache + report upload）

---

## 給未來 AI agent 的建議

1. **Test infrastructure bootstrap 是 atomic 例外** — M6.0 跨 3 workspace 安裝 vitest stack ~260 行 diff 違反 rule 96 < 200 行慣例，但拆 3 commit 反而留下半套工具鏈不能跑。Rule 96 §accepted exceptions 包含「test infrastructure bootstrap」，遇到類似情況請接受並在 commit message 註明先例

2. **Primitive extraction + callsite sweep 也是 atomic 例外** — M6.2a 跨 5 callsite + new primitive + new stories ~480 行 diff，借 M5.1 先例。拆開做（先 primitive、後 sweep）會留下 dead code 或反過來留下 inconsistent UI。同 rule 96 §accepted exceptions

3. **Privy mock 永遠避免** — 任何需要登入流程的 E2E 都應該透過 component test (mock hooks) 或 read-path-only e2e 解決。Privy provider state 不可預期 mock

4. **`NEXT_DIST_DIR` 永遠記得設** — 任何新 e2e harness 都必須 spawn 進獨立 build dir，不能省。Rule 60 已 codify

5. **vitest 3.x 是當前正解** — vitest 4 要等 vite 6+ 升級，會牽動 Storybook 9 + tsup，三件一起做才有意義

6. **Playwright `data-*` attribute 是穩定 selector** — 用 `data-sentiment="POSITIVE"` 比用 `text=/讚/` 穩，translation 改字不會壞測試

---

## 連結

- 上一 session 歸檔：[2026-05-25 M5 execution](./2026-05-25-m5-execution.md)
- 相關 ADR：[ADR-0028](../decisions/0028-deprecate-five-star-rating.md)（五星廢除）
- 14-milestone plan 進度：7/14（M0+M1+M2+M3+M4+M5+M6）/ 28/70 atomic commits
