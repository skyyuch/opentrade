# ADR-0027 廢除 UGC 自動翻譯 + outbox SBT mint idempotency + Phase 1 E2E partial verify — 2026-05-24

> 本文件歸檔 OpenTrade 項目 2026-05-24 第三場 session 的精華內容。
> 該 session 同時推進三條軸線：環境健康度修復、outbox + on-chain + IPFS partial E2E verify、ADR-0027 廢除自動翻譯。

## 對話脈絡

- **日期**：2026-05-24
- **參與者**：項目負責人 + Claude Opus 4.7
- **背景**：上一場 session（ADR-0026 zh-Hans broker name implementation）完成後，user 換新 session 繼續 Phase 1 收尾（~93%）。Privy dashboard 已設、Base Sepolia 合約已部署、broker name 三列 i18n 完整 ship。剩 E2E 測試 + console UI 修復 + outbox worker 跑通。
- **三條目標軸線**：
  1. 處理 user 報「上一個 agent 改完有很多 error」的環境健康度問題
  2. 跑通 Phase 1 review submit + on-chain + IPFS 完整 E2E，並補多券商 (i)-(v) 驗證
  3. 把 user 觀察「review 切換語言時不會翻譯（我認為是正確）」轉成 ADR-0027 + 四層 atomic commit 落地

## 主要討論內容

### 1. 環境健康度修復（軸線 1）

User 切到新 session 後第一句：「上一個 agent 改完有很多 error」。Web/console dev server 報 `Module not found: viem/chains` 與 `ENOENT viem chains/index.js`。

**根因**：上一場 session 為實作 ADR-0026 安裝了 `opencc-js@1.3.1`，pnpm 重新 hash `.pnpm/` content store 中所有 package 的儲存路徑（`.pnpm/<sha>` 變了）。但本機原本還活著的 `next dev`（web + console）與 `tsx watch`（api）processes 已經 cache 了舊 webpack module resolution，當它們 hot-reload 時就找不到新的 viem path。

**修復路徑**：

1. `pkill -f "next dev" && pkill -f "tsx watch"` — 殺光所有舊 worker
2. `rm -rf apps/web/.next apps/console/.next` — 清 Next build cache（~1.1 GB）
3. `pnpm install --frozen-lockfile` — 確認 lock 一致、所有 dep link 重建
4. 全部 dev server 重啟

**User 後續確認**：「登入及 review 都沒有問題了。第三點如果要測券商的繁簡英的名字，剛剛測試也沒有問題」。

**教訓**：

- **pnpm + Next.js 的 hot-reload boundary 不對等**：pnpm content store 變動會 silent break 已 cache module path 的 long-running dev server。
- **每次 dependency 變動後**必須清 Next cache + 重啟 dev，這是 pnpm 環境的硬規則。
- 對 ADR-0026 之類影響 dependency tree 的 implementation，下次 PR description 必須加 follow-up checklist「重啟 dev / 清 .next 才能讓本機跑得起來」。

### 2. Outbox + on-chain + IPFS E2E partial verify（軸線 2）

User 主動提出開始驗證 phase 1 E2E（review 提交流程）。

**步驟流**：

1. user 在 zh-Hant locale 提交 review「app不好用 / app不好用，經常死機，不推薦」
2. agent 查 DB 確認 `reviews` 表新增一筆 PENDING 狀態 + outbox_events 表新增 `review.submitted` event
3. agent tail `apps/api` dev log 看 outbox worker 15 秒後 poll 到 event → call `submitReview()` on Base Sepolia ReviewRegistry → 收 `ReviewSubmitted` event with `reviewId=2`
4. DB updateChainStatus → status PENDING → CONFIRMED + chainReviewId/txHash 填上
5. user 用 BaseScan tx URL `https://sepolia.basescan.org/tx/0x481ae26...` 確認上鏈
6. user 開 Pinata gateway URL `https://gateway.pinata.cloud/ipfs/bafkreid2hr...` 看到「亂碼 ä¸å¥½ç"¨」截圖

**Pinata gateway charset 問題**：

- agent 用 `curl -sI` 查 HTTP headers，發現 Pinata gateway 回 `content-type: application/json` 但**沒**加 `; charset=utf-8`
- agent 用 `curl + python3 json.load` 確認 raw bytes decode UTF-8 後是正確中文「app不好用」/「app不好用，經常死機，不推薦」
- **結論**：IPFS storage 正確；on-chain `contentHash` 計算用的是 raw bytes，跟 hash 完全對得上；API fetch 用 application/json 自動 UTF-8 deserialize 永遠正常；**只有「瀏覽器 plain view」會看到 Latin-1 fallback 亂碼**
- 加入「已知風險」表為 cosmetic，未來在 `apps/api` 加 `GET /v1/reviews/:id/ipfs-content` proxy 設正確 charset header 即可

**多券商 (i)(ii)(iii)(iv) 隱式驗證 + (v) 延後**：

- (i)(ii) DB query 確認：user 已是 L2，新通過第二家 broker 後 tier 仍 L2，outbox events 表沒有新的 `sbt.mint_requested` event
- (iii) `/verify` 頁面 broker list：user 給的截圖 (`Screenshot_2026-05-24_at_10.41.44_PM`) 顯示「Verified Brokers」section 列出 3 個 verified broker
- (iv) ReviewCard 顯示對應徽章：a2 review card 已渲染 broker badges
- (v) zh-Hans broker page 簡體顯示：剩 30 秒 user 開瀏覽器點 `/zh-Hans/brokers/bright-smart-futures-and-commodities-company-limited` 即可

### 3. Outbox worker SBT mint idempotency bug + 修復（軸線 2 副產物）

**診斷過程**：

- user 之前測 verify-broker (前 session) 已通過一家，當試 verify 第二家 broker 時，approve 後 outbox event `sbt.mint_requested` emit 出來
- worker poll 到後 call `ReviewerSBT.mint(walletAddress, tokenURI)`，但合約 revert 回 `AlreadyMinted(address)` 因為該 wallet 已 mint 過 SBT（ADR-0021 D3 設計：one-mint-per-address，soulbound）
- worker 5 次 retry 都會 revert，最後 terminal-fail 把 event 標 FAILED
- 浪費 gas + 污染 log + outbox queue 卡

**ADR-0025 D3 的 conditional emit 已修但 worker 沒守護**：

- ADR-0025 D3 已要求 approve flow「只在 user 是 L1 第一次升 L2 時 emit mint event」，但本 session 才發現 worker 還是會在「歷史 event 重新 retry」或「ADR-0025 D3 實裝前的 legacy event」場景炸
- **修復策略**：在 worker 層加 idempotency guard，而不是只信 emit 端的條件

**Commit `9df2336` 內容**：

```typescript
// apps/api/src/tasks/outbox-worker.ts
const REVIEWER_SBT_ABI = [
  /* ... existing mint function ... */
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

async function processSbtMintRequested(event) {
  // ... existing payload validation + user lookup ...
  const existingBalance = await publicClient.readContract({
    address: sbtAddress,
    abi: REVIEWER_SBT_ABI,
    functionName: 'balanceOf',
    args: [user.walletAddress],
  });

  if (existingBalance > 0n) {
    log(
      'warn',
      'Skipping SBT mint — wallet already holds an SBT (idempotent skip)',
      {
        verificationId: event.aggregateId,
        userId: payload.userId,
        wallet: user.walletAddress,
        existingBalance: existingBalance.toString(),
      },
    );
    return; // 標 processed，不 retry
  }
  // ... actual mint call ...
}
```

**教訓**：

- **emit 端的條件不夠**，worker 層必須加 idempotency guard — 兩層守護才安全
- Idempotency guard 必須**讀鏈上真實 state**（`balanceOf`）而不只信 DB 狀態 — DB 可能 drift（如 ADR-0025 後續 post-rollout fixes 已展示過 ledger drift）

### 4. ADR-0027：廢除 UGC 自動翻譯（軸線 3）

**Trigger**：本 session 跑通 a2 E2E 後，agent 問 user 對 review 切換語言時的翻譯行為的意見（c (v) zh-Hans broker page 同時待測時順帶）。User 答：

> 「c (用戶 review 目前在切換語言時，不會翻譯，但我認為是正確，因為是用戶語言，不用硬翻譯，你認為如何）」

**Agent 的核心判斷**：這個觀察形式上正確，但目前是「accidentally correct」— `SubmitReviewUseCase` ctor 收 optional `translationService`，因為 `DEEPL_API_KEY` env 從沒設過，所以 wiring 把 service 設 null，submit path 永遠 skip translation try-catch block；Review.sourceLocale 永遠是 null。

**ADR-0023 vs 現實對比**：
| ADR-0023 D | 實際狀態 |
|---|---|
| D1: DeepL API | 從沒 wire（API key 沒設） |
| D2: ReviewTranslation 表 | Migration ship 了但 0 row |
| D3: 同步 on-submit 翻譯 | Skip 了 |
| D4: 自動 detect source | 從沒跑 |
| D5: Accept-Language serve | 從沒中過 |

**形式化決策的四個論點**：

1. **HK 金融用語誤譯**：DeepL 對「孖展」「補倉」「窩輪」「結算」等 HK 金融術語易誤譯，反失可信度 — 這正是 OpenTrade 平台依賴的核心 vocabulary
2. **「平台不介入內容」紅線**：rule 00 + 願景 §九 把「公平/透明/不可篡改/平台不介入內容」列為核心承諾。平台自動 rewrite UGC（即便標明「機器翻譯」）位於這條紅線的邊緣
3. **業界 UGC 平台不譯**：GitHub / Reddit / Twitter / Glassdoor / IndieHackers — 主流 UGC 平台都沒有 auto-translate posts 的 UX，最多 opt-in（reader 點按鈕觸發），ADR-0023 「不譯就 defeat multi-language value」這論點低估了 user 對「原文」的偏好
4. **同源 CJK 跨地讀者基本可被動讀繁中**：zh-Hant ↔ zh-Hans 互讀成本低（同源 CJK 基本可讀），ADR-0023 高估了 cross-locale legibility gap

**Decision 結構**：

- D1: Stop calling translationService from SubmitReviewUseCase
- D2: Review.sourceLocale 變 first-class submit-time 欄位
- D3: DeepLTranslationService 加 `@deprecated`（保留不刪）
- D4: DEEPL_API_KEY env 留 optional + deprecated note
- D5: ReviewTranslation 表保留但不寫不讀
- D6: Frontend ReviewCard 加 sourceLocale badge + disclaimer
- D7: 未來 on-demand 翻譯允許但需 successor ADR
- D8: 既有 null sourceLocale row 用 Han ratio + OpenCC 反推 backfill

**Alternatives 評估**：

- B: 繼續 ADR-0023（只設 DEEPL_API_KEY）— 不解 HK 金融誤譯、不解紅線、產生 cost — Rejected
- C: Lazy on-demand DeepL（reader 點按鈕）— 大量工程 / 預期 demand 接近 0 — Deferred 到 D7
- D: 完全刪 service + 表 + column — 不可逆 / 關上 D7 — Rejected
- E: Async outbox-driven translation — 不解 fundamental objections — Rejected

### 5. ADR-0027 implementation 4-commit 詳解

**Commit 1 (`86ecc95`) `docs(decisions,rules)`**：ADR-0027 + ADR-0023 status → Superseded + decisions/README.md + rule 51 §UGC 翻譯段重寫。Rule 51 嚴禁清單加 4 條紅線：

- ❌ 不可在 review submit path 自動呼叫翻譯服務
- ❌ 不可從 `review_translations` 讀資料 serve API
- ❌ 不可移除 `Review.sourceLocale` / `ReviewTranslation` / `DeepLTranslationService`
- ❌ 不可加新 translation provider env（需先寫 ADR）

**Commit 2 (`8603252`) `feat(api)`**：

- 6 file: ReviewEntity / IReviewRepository / PrismaReviewRepository / SubmitReviewUseCase / routes.ts / DeepLTranslationService / env.ts
- Drop translationService 參數、加 ReviewSourceLocale type、加 sourceLocale 進 create payload、wire `resolveSourceLocale()` helper（body explicit → exact Accept-Language match → zh-Hant default）
- GET /broker/:slug 永遠回原文，刪 `isTranslated/originalTitle/originalBody`（grep 確認無前端 consumer）
- 加 `@deprecated` JSDoc

**Commit 3 (`003aa67`) `feat(web)`**：

- 6 file: client.ts / BrokerDetailTabs / ReviewForm / 3 個 messages JSON
- ReviewItem.sourceLocale 加 nullable + SubmitReviewInput.sourceLocale 加 required
- SubmitReviewCta + ReviewForm 用 useLocale() 送 sourceLocale
- ReviewCard 加 neutral pill (null suppress)
- ReviewsTab 上方加 Info icon + disclaimer
- 三語 5 個 keys：繁中「繁體中文 / 簡體中文 / 英文」、簡中「繁体中文 / 简体中文 / 英文」、en「Traditional Chinese / Simplified Chinese / English」

**Commit 4 (`aec13d8`) `feat(db)`**：

- `packages/db/scripts/backfill-source-locale.ts` + `db:backfill:source-locale` script wire
- Han-ratio (`[\u3400-\u4DBF\u4E00-\u9FFF]`) + OpenCC `t→cn` round-trip 三路分類
- `< 30% Han → en` / `>= 30% Han + 不變 → zh-Hans` / `>= 30% Han + 變了 → zh-Hant`
- Reuse mutable-WHERE + stall guard 模式（ADR-0026 lesson）
- Dev DB 跑：a2 review (繁中) → zh-Hant ✓、5/22 seed (英文) → en ✓

## 產生的 ADR

- **ADR-0027**: Deprecate UGC translation; ship reviews as author-original — 8 D + 4 alternatives + 詳細 Consequences + D7 future on-demand escape hatch + D8 backfill plan + 4-commit implementation plan
- **ADR-0023**: Status flipped to `Superseded by ADR-0027`

## 給未來 AI agent 的建議

### 紀律

1. **pnpm 改 dependency 後必清 Next cache 重啟 dev** — 失敗模式是 `Module not found` 對特定 package，根因永遠是 pnpm content store re-hash + dev server 還 cache 舊 path
2. **Outbox worker 對 idempotent operation 必須加鏈上 state guard** — 不要只信 emit 端的條件，DB 可能 drift；對 ERC721/SBT 之類 one-mint-per-address 合約，mint 前查 `balanceOf > 0` 是廉價守護
3. **「半 shipped 的 pipeline」是技術債務最嚴重的形式之一** — ADR-0023 寫 D1-D5 但只實作 30%（service class 寫好 + table migration ship 但 wiring 故意留 null），讀 code 的 contributor 會花時間 debug「為什麼這段沒跑」。要不就完整 ship、要不就直接形式化 deprecate
4. **形式化「accidentally correct」行為** — user 觀察到 review 不翻譯是「intentional design」，但實際上是 env 沒設的 fallback。本 session 把這個觀察轉成 ADR-0027，讓「不翻譯」變成 designed 的正確行為而非 accident
5. **Authority 拆解到 atomic commit** — translation deprecation 涉及 4 個 layer (docs + api + frontend + db backfill)，每個 commit 都獨立可 typecheck + lint pass，rule 70 200-行原則一個都沒破

### 文件交叉引用

- ADR-0027 的 D7「Future on-demand translation」是真實的 escape hatch，不是 boilerplate — 未來如需 reader-clicks-translate 功能，先寫 successor ADR 引用 ADR-0027 D7
- 與 ADR-0026 同樣 vintage（兩個 i18n 相關 ADR 在同一天 ship），rule 51 同時涵蓋 §模式 A (broker 三列) 與 §UGC 翻譯 (author-original) 兩個獨立 i18n strategy
- 與 ADR-0025 D3 的 conditional mint emit 互補：ADR-0025 D3 在 emit 端控制，outbox worker `9df2336` 在 consumer 端守護

### 下一個 session 的優先項

1. **`c (v)` zh-Hans broker browser tap**（30 秒）— `http://localhost:3000/zh-Hans/brokers/<slug>` 確認簡中顯示
2. **`b` L2 verify-broker 全新-wallet E2E**（30 分鐘）— 用新 wallet 跑完整流程驗 SBT 真 mint 上鏈
3. **Console Google UI 修復** — `globals.css` 主題系統 vs Google 硬編碼色衝突（前 session 殘留 bug）
4. **Production DB backfill 雙腳本** — Phase 1 production deploy 前在 prod RDS 跑兩個 backfill（ADR-0026 + ADR-0027 D8 一起，同個 deploy window）

## 待後續處理事項

- [ ] **(待 user)** c (v) zh-Hans broker page browser 驗證（30 秒）
- [ ] **(待 user)** b L2 verify-broker 全新-wallet E2E
- [ ] **(Phase 1 polish)** IPFS gateway charset proxy — `GET /v1/reviews/:id/ipfs-content` 設正確 `Content-Type: application/json; charset=utf-8` header（per 已知風險表）
- [ ] **(Production deploy 前)** 跑 `db:backfill:zh-hans` + `db:backfill:source-locale`（兩腳本同個 window，皆 idempotent）
- [ ] **(Phase 2 前)** 評估 D7 on-demand translation 是否需要做（trigger：≥ 5 reader 抱怨 cross-locale legibility / 非中文-speaking jury onboarding / 非 HK media 覆蓋）
- [ ] **(承襲)** 「Phase 2 前轉 PR-only flow」still pending（per 待決策/流程層級段）
