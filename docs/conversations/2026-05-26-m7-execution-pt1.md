# M7 Execution Pt.1 — Complaints Separation Backend + Admin (2026-05-26)

> 本文件歸檔 OpenTrade 項目 2026-05-26 M7 milestone execution session（上半段）的精華內容。
> 接續 M6 handoff，完成 14-milestone 計畫第 8 個 milestone（M7 — Complaints separation per ADR-0029）的上半段：DB schema + outbox event vocabulary + API DDD 三層 + console admin moderation page，共 7 個 atomic commit 直推 main。下半段（M7.5-M7.7：消費者前端 ComplaintForm + EvidenceUpload primitive + broker detail 第三 tab + tests + i18n）留給下個 session。

## 對話脈絡

- **日期**：2026-05-26（接 M6 handoff，2026-05-25 結束後同流程繼續）
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.7
- **背景**：14-milestone 計畫第 8 個 milestone — Complaints separation per [ADR-0029](../decisions/0029-complaints-vs-reviews-separation.md)，把投訴（complaint）與評論（review）在資料層用 `kind` 判別欄分流，但同表寫入以 reuse 既有 IPFS + on-chain pipeline 給 Phase 3 jury anchoring 用。
- **前置狀態**：M0-M6 已完成 28/70 atomic commit，sentiment-only review 全平台 ship + 完整 vitest/Playwright 測試基礎設施已建立。

---

## 主要討論內容（按主題分節）

### 1. Pre-flight checklist + 4 個 confirm 問題

User 啟動 session 時要求依序讀 10 份文件並以固定格式回報，並對 M7 主要決策點提出 4 個 confirm 問題：

| #   | 問題                                                                                                      | 決議                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | M7.1 DB schema 改動是否會 break 既有 review 寫入路徑（Review 加 kind 欄位 + default 'REVIEW' 給既有 row） | **不會** — Postgres 11+ fast-default 是 metadata-only ALTER，既有 row 邏輯讀到 'REVIEW'；既有 use case 不傳 kind 走 Prisma `@default(REVIEW)`；M7.1 schema-only migration 嚴守 rule 31              |
| Q2  | M7.2 outbox event vocabulary 是否要走 Phase 1 ack-only handler（per ADR-0029 D5/D7）                      | **是** — Phase 1 投訴不上鏈，handler 純 fall through 到 processedAt 更新；沿用 M1.4 後續為 `verification.broker_added` 加的 ack-only pattern                                                        |
| Q3  | M7.3 verify use case 是否嚴守 rule 00「reject ≠ delete」                                                  | **是** — 三層保護：(a) zod 在路由層守 adminNote 5/500 字 + (b) 應用層 belt-suspenders 再守一次 + (c) 倉儲層 reject branch SQL 只動 adminNote，**絕不**碰 deletedAt / body / title / evidence / hash |
| Q4  | M7.7 tests 預期 cover 度                                                                                  | API domain >90% / use case >85% baseline，complaint 走同 pattern；單獨拆 M7.7 commit 不混進 M7.3 商業邏輯                                                                                           |

User 同意後追問 3 個 additional observations，由 AI agent 主動點出：

- **觀察 1（M7.6 應拆 a/b）**：`sentimentAggregate WHERE kind=REVIEW` 與 `verifiedComplaintCount WHERE kind=COMPLAINT AND verifiedAt IS NOT NULL` 是兩個 API 改動 + 第三 tab 是純 UI 改動，混在一個 commit 違反 rule 96 atomic 紅線
- **觀察 2（要新增 M7.0 doc commit）**：「被投訴方答辯權階段化實現追蹤」橫跨 Phase 1 / 2.5 / 3 三個 phase，沒寫在 status doc 裡未來 agent 接 M10 / Phase 3 時會漏掉脈絡，必須在 M7 開頭就先寫進去
- **觀察 3（被投訴方答辯權的階段化問題）**：被投訴券商在 Phase 1 完全沒有後台、沒有通知、不能公開回應，只能巡視自家公開頁面看到投訴，這跟「公平」紅線的關係要明確

### 2. 觀察 3 深化討論：被投訴方答辯權的時間點

User 不是技術背景，希望 AI agent 仔細解釋觀察 3。AI agent 解釋：

- **OpenTrade 的「公平」 vs WikiFX 的「不公平」差異點**：WikiFX 收費刪負評，OpenTrade 用 rule 00「上鏈不可刪、admin reject 不能 delete」拒絕這條路；但「公平」還有第二層 — 被投訴方知情權 + 答辯權，這層 Phase 1 並沒做
- **三階段時間軸**：
  - **Phase 1（M7，現在）**：被投訴方只能主動巡視 `/brokers/:slug` 第三 tab — 沒通知 / 沒後台 / 不能公開回應 / 不能正式答辯。這個層級「比 WikiFX 公平」（不收費刪文）但「不夠公平」（沒答辯權）
  - **Phase 2.5（M10 商戶功能）**：商戶後台會有「我的被投訴」面板 + 通知 + 公開回應一次（C5 機制）— 這時候 30-50 種子用戶與 100-200 邀請制散戶量小到可以 admin 人工聯繫商戶，不需 Phase 1 強行做
  - **Phase 3（陪審團 V1）**：7 天答辯窗口提交反駁 + 證據（質押）+ 陪審投票結果上鏈
- **為什麼 Phase 1 不做商戶後台**：
  - (a) 商戶 console 整體 self-service 生態屬於 M10 工作（per [STAGING.md](../decisions/STAGING.md) S8），現在加會違反 rule 96 commit 單一目的
  - (b) Phase 1 量小到 admin 人工可顧
  - (c) 投訴本身就上了公開頁，rule 00 已經比 WikiFX 公平
  - (d) ADR-0029 D6 已預留 `respondsToReviewId` 欄位給 M10 公開回應使用（M7.1 純加 column 不 wire bidirectional relation，等 M10 商戶 broker response API 落地時再 wire 起來不會破壞本期 schema）
  - (e) Phase 3 jury 答辯機制的資料形狀也已在 ADR-0029 D4 預留（`verifiedByUserId` 在 Phase 1 是 admin user id，Phase 3 改 nullable 並加 `verifiedByJuryProposalId`）

User 看完同意：refine M7 plan 從 7 commit → 9 commit（拆 M7.6 + 加 M7.0 docs）。

### 3. M7 執行序列（7 個 commit，按時序）

#### M7.0 commit `86a48df` `docs(status): track phased broker defense rights and M7 plan refinement`（40 行 diff）

- 在 §中期 段 refine M7 plan 9 commits 詳述
- 新增 §被投訴方答辯權階段化實現追蹤 段（三階段表格 + ADR-0029 預留欄位形狀對應 + Phase 1 不做商戶後台的 5 條理由）
- 確保未來 agent 接 M10 / Phase 3 時能看到主軸視角

#### M7.1 commit `cedd5a7` `feat(db): add ReviewKind discriminator and complaint columns per ADR-0029`（87 行 diff）

- `enum ReviewKind { REVIEW COMPLAINT }` 加在 `Sentiment` enum 後
- Review 加 6 個 nullable complaint columns：
  - `kind ReviewKind @default(REVIEW)` — 給既有 row 自動補值（Postgres 11+ fast default 元數據 ALTER 不 rewrite table）
  - `evidenceIpfsCid String?` — Pinata pin 結果
  - `verifiedAt DateTime?` — admin 驗證時間戳
  - `verifiedByUserId String? @db.Uuid` — admin user reference（Phase 3 改 nullable + 加 `verifiedByJuryProposalId`）
  - `respondsToReviewId String? @db.Uuid` — **column-only 不 wire bidirectional Prisma relation** 待 M10 商戶 broker response API 落地時再 wire（保持 M7.1 schema commit single-purpose）
  - `adminNote String? @db.Text` — reject 原因（沿用 SbtVerificationRequest.adminNote pattern）
- composite index `[tenantId, brokerId, kind, verifiedAt]` 給 M7.6a 的 `sentimentAggregate WHERE kind=REVIEW` + `verifiedComplaintCount WHERE kind=COMPLAINT AND verifiedAt IS NOT NULL` 兩個 aggregate query
- migration `20260526034736_add_review_kind_discriminator` 嚴守 rule 31（CREATE TYPE + ALTER TABLE ADD COLUMN + CREATE INDEX，**無 UPDATE**）
- `packages/db/src/index.ts` 加 `ReviewKind` re-export 保字母序

#### M7.2 commit `39bf320` `feat(api): add complaint outbox event vocabulary with ack-only handlers`（30 行 diff）

- outbox-worker poll loop 加 3 個 explicit `else if` 分支（complaint.submitted / complaint.verified / complaint.rejected）
- 沿用 verification.broker_added 同 ack-only pattern 避免 `Unknown event type` warn noise
- header docstring 注明 rule 00「reject != delete」worker MUST NOT 改 Review row

#### M7.3a commit `968fc0f` `feat(api): bootstrap complaints domain types and Prisma repository`（424 行 diff，atomic-but-large）

借 M5.1 / M6.0 / M6.2a 先例 — 三檔型態互依不能拆：

- `domain/ComplaintEntity.ts`（116 行）：SubmitComplaintInput + ComplaintRecord + 派生 ComplaintVerificationStatus（OPEN / VERIFIED / REJECTED 三態，**從 verifiedAt + adminNote 派生，無 status 欄位** per ADR-0029 D4 — Review.status 留給 Phase 3 jury on-chain pipeline 重用）
- `domain/IComplaintRepository.ts`（82 行）：port 含 create / findById / list / applyVerification，**verify / reject 用 discriminated union mutation**（kind: 'verify' | 'reject'）讓倉儲在同 transaction 內一致地 emit 對應 outbox event；rule 00 紅線（verify 分支絕不碰 body / title / evidenceIpfsCid / contentHash / ipfsCid，reject 分支只動 adminNote）直接編進 type system
- `infrastructure/PrismaComplaintRepository.ts`（229 行）：Prisma adapter — create 寫 Review row with `kind=COMPLAINT` + 同 tx insert outbox `complaint.submitted`；list 把 OPEN | VERIFIED | REJECTED 翻譯成 `verifiedAt + adminNote` 布林條件對；applyVerification 處理 verify（set verifiedAt + verifiedByUserId + clear adminNote 若之前是 REJECTED）與 reject（只 set adminNote，**絕不**動 deletedAt / body / title / evidence / hash）兩分支；強制 complaint 帶 `rating: 1` 滿足 ADR-0028 D6 deprecation window 內仍 NOT NULL 的 legacy column

#### M7.3b commit `1d97dc0` `feat(api): add complaint submit + list use cases and public endpoints`（332 行 diff）

5 檔：

- `application/SubmitComplaintUseCase.ts`（71 行）：IPFS payload v2 with `kind: 'COMPLAINT'` discriminator + `evidenceIpfsCid` field（per ADR-0028 D3 + ADR-0029 D3）+ keccak256 contentHash 與 review 同形（Phase 3 jury anchor 可重用 ADR-0019 on-chain pipeline 不需 migration）+ Pinata pin 後 repo create
- `application/ListComplaintsUseCase.ts`（22 行）：薄 wrapper
- `presentation/routes.ts`（229 行）：
  - `POST /v1/complaints` — `authMiddleware('reviewer')` per ADR-0029 D3 + zod evidence required + brokerSlug + body 10-2000 chars + sentiment per ADR-0028 D4
  - `GET /v1/complaints/broker/:slug` — public read with optional `?status=OPEN|VERIFIED|REJECTED` filter；REJECTED row ship adminNote 給公開頁渲染駁回原因 per ADR-0029 D4
  - `GET /v1/complaints/:id` — public single-fetch
- `index.ts`（8 行）router export
- `apps/api/src/http/server.ts` mount `/v1/complaints` 在 reviews 之後 admin 之前

#### M7.3c commit `f1f33cd` `feat(api): add admin verify/reject endpoints with rule 00 invariant`（269 行 diff）

兩檔：

- `application/VerifyComplaintUseCase.ts`（93 行）：**單一 discriminated input 類別處理 verify + reject 兩分支**避免兩個 60% 重疊類別漂移 — 60% 共用的 read-side（load + kind=COMPLAINT guard）拆兩類別必漂移；reject 分支 belt-suspenders 在應用層再 validate adminNote 5/500 字界（zod 已守一次）；idempotent verify（re-verify 是 verifiedAt/verifiedByUserId 更新），admin 也可 reject 已驗證的（清 verifiedAt + 設 adminNote）
- `apps/api/src/domains/admin/presentation/routes.ts`：
  - `GET /v1/admin/complaints` — brokerSlug + status filter（OPEN/VERIFIED/REJECTED/ALL，ALL drop ?status= 給歷史審計用）+ hydrate broker + author 三語名 per cursor rule 51 + ADR-0026
  - `PATCH /v1/admin/complaints/:id/verify`
  - `PATCH /v1/admin/complaints/:id/reject` — zod adminNote min 5 max 500
- admin 域擁有 `/v1/admin/...` URL space 既有 pattern（per /admin/users + /admin/reviews + /admin/verifications）— 透過 import VerifyComplaintUseCase 從 complaints 域，rule 00 紅線單點 encoded 在 use case + applyVerification 兩處 testable place

#### M7.4 commit `1112e9e` `feat(console): add admin complaint moderation page per ADR-0029`（650 行 diff，atomic-but-large）

借 VerificationsClient 787 行先例 — 單頁 + 4 內部子組件不能拆：

- `apps/console/src/lib/api/client.ts` 加 fetchAdminComplaints + verifyComplaint + rejectComplaint thin wrappers + AdminComplaintItem + AdminComplaintStatus 型別（60 行 insert）
- `apps/console/src/app/[locale]/admin/complaints/page.tsx`（9 行）+ `ComplaintsClient.tsx`（541 行）：
  - **StatusBadge** 差異化色彩：OPEN（amber）/ VERIFIED（**紅** — VERIFIED-as-substantiated 在平台語境下是 severity escalation 不是 green-all-good signal）/ REJECTED（muted slate）
  - 4-state filter（OPEN / VERIFIED / REJECTED / ALL，ALL drop ?status=）+ search 過 broker slug / displayName / body excerpt
  - **ComplaintRow** 含 broker name（cursor rule 51 + ADR-0026 三語 helper）+ author wallet 短址 + sentiment badge + body excerpt clamp-2 + age + status badge + View CTA
  - **ComplaintDetailModal** 顯示完整 body + title + evidence IPFS link `target=_blank rel=noopener` + broker meta panel + author meta panel + 條件 CTA：
    - OPEN：紅色「Verify (substantiate)」+ 灰「Reject」
    - VERIFIED：顯示 verifier admin id + verifiedAt + 「Reject (overturn)」CTA
    - REJECTED：顯示 adminNote readonly callout（rule 00 — 公開駁回原因不藏）+ 「Re-verify (overturn rejection)」CTA
  - **RejectReasonModal** nested z-70 modal + client-side 5-500 char validation 對應 API zod
- `apps/console/src/components/layout/AuthGate.tsx` 加 `/admin/complaints` nav 在 reviews 與 brokers 之間 + AlertTriangle icon
- `apps/console/messages/{zh-Hant,zh-Hans,en}.json` 各加 17 鍵（nav.complaints + admin.complaintsTitle + searchPlaceholder + 4 tabs + 2 th + noComplaints + 3 status labels + verifyButton + 4 modal 段標題）；reuse 既有 `rejectReasonTitle` 等 common label 避免重複

### 4. 收尾 + handoff 決定

- 7/9 commits 完成 + lint-staged + prettier hooks 全綠 + 對應 workspace typecheck 全綠（console pre-existing 1 warning 在 PrivyLoginButton 與本 session 無關）
- 6 個新 endpoint 已 ship 進 server.ts（POST /v1/complaints + 兩個 public GET + 兩個 admin PATCH + 一個 admin GET）
- console /admin/complaints 已可瀏覽（待 M7.5 ComplaintForm 後可全鏈路煙測 OPEN→VERIFIED + OPEN→REJECTED 兩路徑）
- AI agent 主動建議 handoff（per rule 98 條件 1 + 2）：context 累積偏高（初始 conversation summary 已重 + 跨 db / api / console 三 workspace 7 commit cycle）+ 領域即將切換（後台 + admin → 消費者 web UX + tests）
- User 同意，跑 Step 1-6（status update + conversation archive + 新 session opener + handoff commit package）

---

## 產生的 ADR

無新 ADR — M7 完全跟著 [ADR-0029](../decisions/0029-complaints-vs-reviews-separation.md) 的 D1-D8 落地。

---

## 待後續處理事項

### 下個 session 接手 M7.5

1. `packages/ui` 抽 `<EvidenceUpload>` primitive：PNG / JPEG / PDF + 5MB cap + Pinata pipeline reuse per ADR-0029 D3
   - 從現有 `apps/web/src/components/verify/VerifyForm.tsx` 上傳邏輯抽出共用 part
   - **僅用在投訴頁** — `/verify` 既有 hand-rolled 上傳留待下次重構 commit
2. `apps/web` `ComplaintForm` 新 client component：
   - 必填 evidenceIpfsCid（透過 EvidenceUpload + Pinata pin）
   - 必選 sentiment 沿用 ADR-0028 三向 + M5 SentimentPicker primitive
   - body 10-2000 chars zod
3. 三語 messages（zh-Hant / zh-Hans / en）

預估 ~400 行 diff。

### 後續 milestone（M7.6 + M7.7）

- **M7.6a**（API broker detail aggregate split）：sentimentAggregate query 加 `WHERE kind=REVIEW` + 加新欄位 verifiedComplaintCount
- **M7.6b**（web broker detail 第三 tab）：BrokerDetailTabs 加「投訴」tab + verifiedComplaintCount 紅色 pill + ComplaintCard
- **M7.7**（tests + i18n）：vitest unit + RTL component + Playwright e2e（reuse `NEXT_DIST_DIR=.next-e2e` 隔離 per rule 60）

### 全 14-milestone 進度

- 7/14 milestones 完成（M0-M6 完整 + M7 上半 7/9 commits done）
- 31/70 atomic commits

---

## 給未來 AI agent 的建議

1. **schema 加新 column 但暫不 wire relation 是合法的「保留欄位」pattern** — 如 M7.1 的 `respondsToReviewId String? @db.Uuid` 純加 column 不 wire bidirectional relation，等 M10 broker response API 才 wire；這保持 M7.1 schema commit single-purpose + 避免拖入無關 relation
2. **discriminated union mutation 是 verify/reject 這類雙分支動作的乾淨 pattern** — 一個 use case 兩分支比兩個 use case 各自 60% 重疊更不易漂移，rule 00 紅線編進 type system 比寫進 docstring 更可信
3. **derived status from columns（如 OPEN/VERIFIED/REJECTED 從 verifiedAt + adminNote 派生）vs 真正的 status enum**：當另一個既有 status 欄位（這裡是 Review.status PENDING/CONFIRMED/FAILED 的 on-chain pipeline status）需要保留給未來功能（這裡是 Phase 3 jury anchor）時，新增「derived 公開狀態」是正確選擇 — 不破壞既有 column 含義 + 留給未來功能空間
4. **「reject ≠ delete」三層保護是 rule 00 在實作層的具體表現**：路由層 zod + 應用層 belt-suspenders + 倉儲層 SQL 三層守同一個紅線；reject branch 絕不碰 deletedAt / body / title / evidence / hash 是 ADR-0029 D4 的核心 invariant，未來任何 admin tool 加新動作都應該檢查這條線
5. **admin URL space 是跨域的**：M7 的 admin verify/reject endpoint 邏輯上屬於 complaints 域，但 URL 路徑必須留在 `/v1/admin/...` 與 `/v1/admin/users` + `/v1/admin/reviews` + `/v1/admin/verifications` 一致；做法是 admin/presentation/routes.ts import VerifyComplaintUseCase from complaints/application — 域的職責定義 vs URL 對 admin user 的 mental model 是兩件事
6. **被投訴方答辯權需要 phase-aware 設計**：Phase 1（M7）只給 passive visibility（被投訴方主動巡視自家頁面看到投訴）；Phase 2.5（M10）給商戶後台 + 通知 + 公開回應一次（C5 機制）；Phase 3（jury）給 7 天答辯窗口 + 證據質押 — 「公平」紅線在不同 phase 有不同實踐方式，但每個 phase 的實踐都應比上一個 phase 進一步，不可倒退
7. **9-commit M7 plan 的拆分美學**：M7.0（doc tracking）+ M7.1（schema）+ M7.2（outbox）+ M7.3 拆 a/b/c（域 bootstrap + public + admin）+ M7.4（console admin）+ M7.5（web complaint form + EvidenceUpload）+ M7.6 拆 a/b（API aggregate + web tab）+ M7.7（tests + i18n）— 每個 commit 對應一個 deployable 邊界 + 跨 workspace 改動分到不同 commit + 大型動作（如域 bootstrap）允許 atomic-but-large 但要在 commit message 註明先例

---

**最後更新**：2026-05-26
**歸檔者**：M7 execution session pt.1（Claude Opus 4.7）
