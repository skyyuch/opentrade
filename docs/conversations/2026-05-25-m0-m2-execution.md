# M0–M2 execution session — 2026-05-25

> 本文件歸檔 OpenTrade 項目 2026-05-25 第二場 session 的精華內容。
> 接 2026-05-25 team meeting handoff（[2026-05-25-team-meeting-strategy.md](./2026-05-25-team-meeting-strategy.md)），執行 14-milestone 執行計畫（`.cursor/plans/會議整合_+_phase_1→2→2.5_細拆執行計畫_*.plan.md`）的 M0 + M1 + M2 三個 milestone，共 8 個 atomic commits 直接推進 main。

## 對話脈絡

- **日期**：2026-05-25
- **參與者**：項目負責人 + Claude Opus 4.7
- **背景**：上一個會議整合 session 已產出 plan 檔（14 milestones / ~70 atomic commits / 估 8-10 個 agent session），user 拍板 (a) 優先序 Phase 1 polish → KOL → 商戶功能，(b) C1 五星 → 移除改三向情緒
- **單一目標**：依 plan 依序執行 M0 + M1 + M2，每個 milestone 內每個 commit 嚴守 rule 96（< 200 行 diff、獨立 CI、獨立 revert）
- **結束點**：M2 完成後判斷 context 已偏長 + 領域即將切換（doc → code），按 rule 98 主動觸發 handoff

## 主要產出（8 commits 進 main）

### M0 — 會議歸檔 + status snapshot（2 commits）

| Commit    | Subject                                                               |
| --------- | --------------------------------------------------------------------- |
| `11f5c79` | `docs(conversations): archive 2026-05-25 team meeting strategy notes` |
| `289e3e3` | `docs(status): add 2026-05-25 meeting handoff snapshot`               |

- 歸檔檔 275 行，含 C1-C6 衝突表 + 10 條未來 ADR 索引（0028~0037）+ owner-grouped action items + 6 點未來 AI agent 建議
- status doc 新增「14-milestone 執行計畫」段、C1-C6 進入「待決策」段、Session History 新行
- 外部截止日標示：**2026-06-08** Speaker 2 短文 / **2026-06-20** Pitch Deck + 端午後會議 / **2026 Q3** 創科局申請

### M1 — Phase 1 polish 3 條收尾（3 commits）

| Commit    | Subject                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `e8bbdfe` | `fix(console): consolidate semantic CSS variables into console-globals.css` |
| `ea68dd1` | `feat(db): add --dry-run mode and prod runbook for backfill scripts`        |
| `16d7727` | `feat(api,web): add /v1/reviews/:id/ipfs-content charset proxy`             |

#### M1.1 console-globals.css 整合 — 發現 orphan override 檔

原本 status 描述「console Google UI 修復」隱含「需要建 console 專屬 Tailwind preset」，但 deep audit 後發現實際狀況是：

- `apps/console/src/styles/console-globals.css` 已被 import（layout.tsx line 31）並刻意省略 `* { @apply border-border }` + `body { @apply bg-background }` 兩條會破壞 Google admin hardcoded 色的 cross-cutting rule — 這個權衡是對的
- `apps/console/src/styles/console-overrides.css` **存在但從未被 import**（grep 確認），是 dead code
- 但 console 內 merchant-facing 頁面（`ClaimForm.tsx`、`brokers/[slug]/page.tsx`）大量用 `border-border` / `bg-background` / `text-muted-foreground` / `ring-ring` 等 semantic 類別，這些都 resolve 到 `hsl(var(--X))`，而 `--X` 在 console **完全未定義**（admin 頁面不受影響因為它們用 inline `bg-white/5` / `border-white/10` 硬編碼）

**修法**：把 `packages/ui/src/styles/globals.css` 的 `:root` + `.dark` CSS vars blocks 整合進 `console-globals.css`（不引入會衝突的 `*` + `body` rules）+ 刪除 orphan `console-overrides.css`。merchant 頁面恢復正確語意上色、admin Google UI 完全不動。

#### M1.2 backfill scripts dry-run + cursor pagination 修正

原本 `backfill-zh-hans.ts` + `backfill-source-locale.ts` 用「mutable-WHERE + stall guard」模式（per ADR-0026 lesson）—— 但 dry-run 模式 break 這個 invariant：dry-run 不 update DB，所以 `WHERE displayNameZhHans IS NULL` 每次都回同樣的 200 行 → 死迴圈。

**修法**：兩 script 統一改 cursor-style pagination：

```ts
where: {
  displayNameZhHans: null,
  ...(lastSeenId !== null ? { id: { gt: lastSeenId } } : {}),
},
orderBy: { id: 'asc' },
take: BATCH_SIZE,
```

- 對 LIVE mode 跟 mutable-WHERE 行為等效（每行 update 後就不再 match WHERE）但更穩
- 對 DRY_RUN 也正確（cursor 推進，不依賴 update 收縮 result set）
- stall guard 不再需要（cursor 嚴格前進，skipped / failed rows 自然推進）

加 `db:backfill:prod` aggregator script（兩 backfill 依序跑）+ `apps/api/README.md` 加 production deploy runbook 段 + `infra/terraform/README.md` 加 deploy checklist。所有文件統一指向 `packages/db/README.md#pre-deploy-backfill-per-adr-0026--adr-0027` 為 canonical source。

#### M1.3 IPFS charset proxy

針對 2026-05-24 E2E 發現的 cosmetic bug：Pinata public gateway 回 UTF-8 bytes 但不送 `charset=utf-8` header，瀏覽器當 Latin-1 解析 → 中文變成 `app ä¸å¥½ç"¨`。

新增 `GetReviewIpfsContentUseCase`（純 application layer，注入 fetch port 讓 M6 unit test 可 mock）+ `GET /v1/reviews/:id/ipfs-content` endpoint，registered **before** `/:id` catch-all so Hono trie picks 更 specific path 優先。`PINATA_GATEWAY_URL` env 加進 zod schema，default `https://gateway.pinata.cloud/ipfs/`。

Web 端 `ReviewCard`（`BrokerDetailTabs.tsx`）加「IPFS 原文」link 並排在 basescan tx link 旁邊，呼叫新 endpoint。3 語 messages 加 `ipfsContentLink` + `ipfsContentLinkTooltip`。

回應 header：

```http
Content-Type: application/json; charset=utf-8
Cache-Control: public, max-age=3600, immutable
```

`immutable` 是 valid hint —— IPFS content 是 content-addressed，不會變。

### M2 — 雙 ADR + STAGING.md（3 commits）

| Commit    | Subject                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `5bdb084` | `docs(decisions): add ADR-0028 deprecate five-star rating for sentiment` |
| `80ae9c8` | `docs(decisions): add ADR-0029 separate complaints from reviews`         |
| `683c14c` | `docs(decisions): add STAGING.md index for deferred ADRs`                |

#### ADR-0028 五星廢除 — 三向情緒（POSITIVE/NEUTRAL/NEGATIVE）

7 個 decisions：(D1) DB 加 `Sentiment` enum + nullable `Review.sentiment` 欄位 + composite index、(D2) 5→3 backfill mapping（5,4→POS / 3→NEU / 2,1→NEG）、(D3) IPFS payload v1 → v2 加 `sentiment` field 並保留 `rating` 兼容、(D4) M3 後 sentiment 成為 SubmitReviewInput required、(D5) 合約不動（per ADR-0019 contract 只存 contentHash + ipfsCid，不含 rating）、(D6) 兩 release 後 drop `rating` 欄位的 schedule（honor rule 31「Drop column 不分階段」紅線）、(D7) UI rebuild scope。

4 個 alternatives：A1 保留五星、A2 五星 + 情緒雙軌、A3 七向、A4 NPS — 各自列拒絕理由。

特別處理：會議自身有內部分歧（02:42:10 反方），ADR 在 A1 explicit 留出「Phase 2 reader 資料若顯示混亂，successor ADR 可重新打開」的退路。

#### ADR-0029 投訴與評論分離

採**同表加 `kind` 判別欄**而非分表：reuse 既有 ContentHash + IPFS pipeline、Phase 3 jury 用單一 query 列舉「可能爭議的內容」、避免 60% 重複 use case。

7 個 decisions：(D1) `enum ReviewKind { REVIEW COMPLAINT }` + `evidenceIpfsCid` / `verifiedAt` / `verifiedByUserId` nullable 欄位 + composite index、(D2) same-table-over-split 理由、(D3) `POST /v1/complaints` 走 `authMiddleware('verified')` L2+ gate、(D4) admin verify / reject flow 嚴守 rule 00（reject ≠ delete，加 adminNote 標籤但保留 entry）、(D5) `verifiedComplaintCount` 加入 broker detail aggregate、(D6) broker response（C5「Porto 聲明窗口」）併入此 ADR 走 `respondsToReviewId` self-reference、(D7) outbox event 新詞彙（`complaint.submitted` / `complaint.verified` / `complaint.rejected`）。

4 個 alternatives：status quo / 分表 / tag system / on-chain `ComplaintRegistry` — 各列拒絕。

#### STAGING.md

8 row 表追蹤延後 ADR：S1 ADR-0030 Token Economy、S2 ADR-0031 iAM Smart、S3 ADR-0032 HKMA Sandbox、S4 ADR-0033 公開回應（可能被 ADR-0037 吸收）、S5 ADR-0034 內容過濾、S6 ADR-0035 vision narrative 升級、S7 ADR-0036 KOL signal、S8 ADR-0037 商戶功能。

每 row 列：trigger condition、與既有 ADR 的衝突關係（supersedes / coexists / amends / folds-into）、priority。附 7-filter rationale + 7-step promotion runbook。

ADR-0028 + 0029 已寫，所以 STAGING 從 0030 起算。`docs/decisions/README.md` 加 staging concept 段。

## 關鍵 implementation 決定（給未來 AI agent）

### 1. cursor pagination > mutable-WHERE for backfill scripts

當寫一次性 backfill script 時，cursor pagination（`id > lastSeenId`）對「LIVE mode update 收縮 WHERE 集合」+「DRY_RUN mode 不 update」兩種模式都是 universally correct。`backfill-zh-hans.ts` 原本的 mutable-WHERE 紀錄（per ADR-0026 implementation notes）僅在 LIVE 路徑正確；任何未來 backfill script 都應該預設用 cursor pagination 避免類似陷阱。

### 2. console-globals.css 整合策略

`apps/console` 跟 `apps/web` 的視覺基線分離（per ADR-0011 admin 走 Google reference dark theme）並不是「不要 semantic CSS vars」而是「不要會破壞 Google admin hardcoded 色的 cross-cutting body / universal rules」。所以 vars 該定義（給 merchant-facing 頁面用），body / `*` 不該設。M1.1 是這個區分的最終確認版。**不要再加新的 console-overrides.css**；所有 console-only 視覺都應該在 `console-globals.css` 內 + admin Google UI 繼續用 inline hardcoded。

### 3. ADR-0028 → ADR-0029 → STAGING.md 寫作順序

ADR-0028 在 References 段引用 ADR-0029（投訴分離），ADR-0029 在 References 段引用 ADR-0028（sentiment + verified-complaint 是 two-signal trust pair），所以兩個 ADR 必須**先後寫但內容互相 cross-reference**。寫法：先寫 0028 完整版（含對 0029 的前向引用「authored alongside this ADR」），再寫 0029 完整版（含對 0028 的後向引用），最後 STAGING.md 從 0030 起算保留編號。

### 4. IPFS proxy endpoint 不要動 contentHash

修 Pinata gateway charset bug 的正確姿勢是**read-side proxy 重發 header**，**絕對不可** re-pin JSON（會讓鏈上 contentHash 與新 CID 不一致）。新 use case 設計時把這個 invariant 寫在 JSDoc 頂部，給 M6 unit test 一個可斷言的 contract。

### 5. STAGING.md ADR 編號保留制

延後 ADR 的編號**已保留**，不可被新 ADR 重用。未來任何新 ADR 找下一個未使用編號時，要同時檢查 `decisions/README.md` 索引 + `decisions/STAGING.md` 表。寫進 README 變更段以提醒。

## 給下一個 session 的明確起手點

M3 第一個 commit（M3.1）是 schema + migration：

```bash
# packages/db/prisma/schema.prisma：
#   - 加 enum Sentiment { POSITIVE NEUTRAL NEGATIVE }
#   - Review model 加 sentiment Sentiment?
#   - 加 @@index([tenantId, brokerId, sentiment])

pnpm --filter @opentrade/db db:migrate:dev --name add_review_sentiment
# 確認 prisma/migrations/<timestamp>_add_review_sentiment/migration.sql 內容
# 確認 pnpm --filter @opentrade/db typecheck 全綠

# packages/db/src/index.ts：
#   - export { Sentiment } from '@prisma/client'

git add packages/db/prisma/ packages/db/src/index.ts
git commit -m "feat(db): add Sentiment enum + Review.sentiment nullable column"
```

接著 M3.2 是 backfill script（reuse M1.2 的 cursor pagination 模式），M3.3 是 `Review.rating` 上加 `/// @deprecated` doc comment + README 加 deprecation 段。然後直接進 M4 API DDD 四層。

## 待後續處理事項

無 — M0 + M1 + M2 都完整完成、沒有半成品；M3 起手點明確、沒有遺留 dependency。

## 給未來 AI agent 的建議

1. **rule 96 拆細在 M2 也適用** — ADR 是 doc 但不便宜，本 session 三個 ADR commits 平均 200 行（0028 218 行 / 0029 170 行 / STAGING 76 行）。不要把多個 ADR 塞同一 commit，每個獨立 commit 讓後續 review / revert 都乾淨。

2. **commit message body 避免 `Phase #N` 模式** — Conventional Commits parser 會把 `#N` 當 issue reference 並切到 footer，觸發 `footer-leading-blank` 規則報錯。本 session 的 M1.2 commit message 用「Phase 1」（無 #）符合 rule 70 紅線。

3. **M3 不需新 ADR** — schema + migration + backfill + doc comment 都是 ADR-0028 的 implementation，按 M3.1/3.2/3.3 跑就好。

4. **M3.2 backfill script 統一用 cursor pagination** — 本 session M1.2 把這個模式做進 `backfill-zh-hans.ts` + `backfill-source-locale.ts`，M3.2 應 reuse 同樣骨架（dry-run flag + cursor + 統一 console.log 格式）。

5. **下一個 session context 預期會吃比較重的 React/Hono code** — M3 mechanical，但 M4 開始進 API DDD 四層密集 code work，建議 M4 + M5 之間另一次 handoff。

6. **packages/db 的 `Sentiment` enum re-export 易漏** — 本 session 一開始為了寫 ADR 沒讀 `packages/db/src/index.ts` 完整 enum 列表；M3.1 必須記得把 `Sentiment` 加入 re-export 並驗 `pnpm --filter @opentrade/db typecheck` + `pnpm --filter @opentrade/api typecheck` 雙綠。
