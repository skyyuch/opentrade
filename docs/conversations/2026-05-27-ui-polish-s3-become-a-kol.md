# Phase 2 UI Polish S3 — /become-a-kol Landing + Kol.adminNote Backend Gap Close — 2026-05-27

> 本文件歸檔 OpenTrade 項目 Phase 2 UI Polish S3 session 的精華內容。
> 由 S3 結束時的 agent 撰寫，承接 S2 handoff，把 ADR-0036 D1.1 spec 100% 落地，同時把藏在 backend 的「console UI 收輸入但實際丟掉」的死循環補完。

---

## 對話脈絡

- **日期**：2026-05-27
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.7
- **承接**：S2 session（commit `da08f94` — Full-page `/auth` route + 9 callsite migration + iAM Smart Coming Soon button）
- **本 session 範圍**：Phase 2 UI Polish 計畫的最後一支 task — Task 5 `/become-a-kol` 行銷 landing page
- **本 session 預期外延伸**：Pre-flight audit 在 ADR-0036 D1.1 rejection state 設計時發現 backend 早就 zod-validate adminNote 但 `void` 丟掉，user 確認後把這個 gap 一併補上

---

## 主要討論內容（按主題分節）

### 主題 1：Pre-flight audit 發現的 backend gap

讀完 ADR-0036 D1.1 spec、`apps/web/src/app/[locale]/kol/onboarding/page.tsx` 既有 onboarding wizard、`apps/api/src/domains/admin/presentation/routes.ts` admin reject endpoint、`packages/db/prisma/schema.prisma` 的 `Kol` model 後，發現一個串聯三層的死循環：

1. `apps/api/src/domains/admin/presentation/routes.ts:864-865` 的 `rejectKolSchema` 早就強制 `adminNote: z.string().min(5).max(500)`，但 endpoint 第 865 行寫的是 `void body.adminNote;`（明顯佔位符），第 867 行的 `kolRepo.updateStatus(id, 'REJECTED')` 完全沒帶 adminNote 進去；
2. `packages/db/prisma/schema.prisma:587-616` 的 `Kol` model 沒有 `adminNote` column，連帶 `IKolRepository.updateStatus` 簽名也是 `(id, status, adminUserId?)` 沒接收這個 field；
3. `apps/console/src/app/[locale]/admin/kols/KolsClient.tsx` 的 `RejectReasonModal` 早就完整實作了輸入 UI（`REJECT_MIN = 5` / `REJECT_MAX = 500` 與 API zod 一致），client 端 fetcher `rejectKol(id, note, ...)` 也把 note 傳出去，但 backend 接住後直接 `void` 掉 — UI 看起來工作但實際上沒有任何使用者能看到拒絕原因。

User 確認：「關於第一點我覺得要加 adminNote 欄，拒絕時可以在 admin 寫原因。其他同意。」

這個決定把 S3 從「~500 行 landing page 單一 commit」擴成「C1 backend gap close + C2 landing page」兩個 atomic commit。

---

### 主題 2：6-State landing page 設計

依 ADR-0036 D1.1 spec 表，six UX states 從 Privy `authenticated` + `User.sbtTier` + `Kol.status` 三個訊號派生：

| #   | State           | 條件                               | CTA / Action                                          |
| --- | --------------- | ---------------------------------- | ----------------------------------------------------- |
| 1   | unauthenticated | `!authenticated`                   | `useLoginRedirect` 導 `/auth?returnUrl=/become-a-kol` |
| 2   | no-sbt          | authenticated + `sbtTier !== 'L2'` | link 到 `/verify`                                     |
| 3   | no-application  | L2 + 沒有 kol profile              | CTA 到 `/kol/onboarding`                              |
| 4   | pending         | L2 + `kol.status === 'PENDING'`    | review-in-progress card + 提交時間                    |
| 5   | approved        | L2 + `kol.status === 'APPROVED'`   | CTA 到 `/kol/dashboard`                               |
| 6   | rejected        | L2 + `kol.status === 'REJECTED'`   | adminNote 紅框 callout + reapply CTA                  |

技術實現：

- **單一 useEffect + 平行 `Promise.all([fetchMyProfile, fetchMyKolProfile])`** — kol-profile 的 404 用 `.catch(err => err.status === 404 ? null : throw)` swallow 為「未申請」自然 state；其他 error fallback unauthenticated card 確保 transient outage 不卡死頁面在 loading state。
- **`UNCLAIMED` 與 `SUSPENDED` 也歸到 no-application** — 讓 `/kol/onboarding` wizard 一處集中處理特殊 state，landing page 不需要為了少數邊角加 case。
- **設計風格沿用 dark `#050608` glassmorphic + `[#00FF88]/5` 與 `blue-500/5` blur decor** — 與 S2 `/auth` route 同色系，與 S1 mobile nav overlay 也一致，保 auth funnel cohesive。
- **Header nav 不加入此 page** — 行銷導流頁從外部連結 / KOL Portal button / 直接 URL 才進，加第三個 KOL 相關 nav item 會 overload（user 在 plan 階段確認）。

---

### 主題 3：Public vs Owner 資料路徑

當 `Kol.adminNote` 開始 ship 進 API response 時，必須區分：

- **`GET /v1/kols/me`**（auth: 'user'）→ ship 全 record 含 adminNote — 申請者讀自己的拒絕原因。
- **`GET /v1/kols`**（public）+ **`GET /v1/kols/:slug`**（public）→ 必須剝 adminNote — 雖然 `GET /v1/kols` 已經 filter `APPROVED + UNCLAIMED` (adminNote 必為 null)，但 `GET /v1/kols/:slug` 可以直接打 REJECTED slug，如果不加 sanitizer 就會把 moderator-internal hint 暴露給任何人。
- **admin endpoints**（`/v1/admin/kols/...`）→ ship 全 record — 內部 audit 路徑。

解法：在 `kols/presentation/routes.ts` 加 `toPublicKol(kol: KolRecord)` helper，用 destructuring `const { adminNote, ...rest } = kol; return rest;` 在 type 層強制剝離。`Omit<KolRecord, 'adminNote'>` return type 把這個 invariant encoded 進 TypeScript。

這個 pattern 雖然簡單但值得 codify — 規則 50 講 PII / log 但沒明確講「moderator-internal hints」應該怎麼處理。S3 沒升級 rule，因為這只是兩個 endpoints 的單一 helper，不值得 rule entry；但 future agent 看到類似 field（e.g. internal review queue notes、jury deliberation comments）時可以照搬此 sanitizer pattern。

---

### 主題 4：`/kol/onboarding` REJECTED state 從靜默 fallthrough 改 early-return card

S3 前 `apps/web/src/app/[locale]/kol/onboarding/page.tsx` 在抓到 `kol.status === 'REJECTED'` 時 `setAppStatus('REJECTED')`，但渲染分支只有 `appStatus === 'PENDING'` 跟 `appStatus === 'APPROVED'` 兩個 early return — REJECTED 就直接 fall through 到預設的 4-step form，沒有任何指示告訴 user 為什麼上次失敗、也沒有提示這是「重新申請」流程。

C2 加 early-return card 與 `/become-a-kol` landing page 的 REJECTED state 同 UX shape（紅 XCircle icon + adminNote 紅框 + reapply button），avoid drift — 不論 user 從 landing page 或 onboarding wizard 進入，看到的拒絕反饋是一致的。Reapply button 寫 `setAppStatus('NOT_STARTED'); setStep(1); setError(null);` 把 wizard reset 到第一步乾淨重開。

`rejectionNote` state 跟 `appStatus` 分開兩個 useState（不合併成 object）是因為 React 對 primitive 比較成本低 + 不需要在 setState 時 spread；遵循專案既有 hook composition 風格。

---

### 主題 5：commitlint hex-literal trap（值得歸檔的踩坑）

C2 commit message body 寫了 `dark #050608 glassmorphic palette` 描述顏色，commitlint 兩次拒絕並報 `footer must have leading blank line`。

Debug 過程：

1. 第一次嘗試以為是 `Verification:` 開頭被當 trailer。
2. 把 `Verification:` 改成 `Validated with...` 後再次失敗。
3. 直接用 `conventional-commits-parser` 跑 `.git/COMMIT_EDITMSG` 看 parse 結果，發現 parser 認定的 `footer` 從 `disclaimer. Dark #050608 glassmorphic palette...` 開始 — 也就是說 `#050608` 被當成 `#<number>` issue reference，從那個 paragraph 起被當 footer 區塊。
4. Rule 70 已警告 `<word> #<number>` 模式（e.g. `Commit #5`, `Phase #2`）— 但**沒明確涵蓋 hex literal**（`#050608`、`#FF0000`）也會觸發同樣的 parser 行為。

解法：commit body 改用「dark glassmorphic palette」描述（不寫 hex），page.tsx code 內 hex 保留不動（git diff 不會被 conventional-commits-parser 掃到）。

是否升級 rule 70？討論後決定**不升級**：

- 這是 commitlint quirk 而非業務規則；
- 在 commit body 寫 hex literal 描述本來就少見（大部分 commit body 用語意描述顏色 e.g. "dark glassmorphic"）；
- 但這個踩坑值得寫進 status update 的「踩坑紀錄」段，future agent commit message 出現類似 issue 時能快速 reference。

---

### 主題 6：i18n 三語 + 兩個 namespace 同步擴

- **Web `becomeAKol` namespace**：32 keys × 3 locales（heroEyebrow / heroTitlePrefix / heroTitleHighlight / heroSubtitle / valueProp1-3Title + Desc / state{Unauth,NoSbt,NoApplication,Pending,Approved,Rejected}{Title,Body,Cta,SubmittedAt / ReviewedAt} / stateRejectedReasonHeading / stateRejectedNoReasonFallback / disclaimer）。
- **Web `kolConsole.onboardingRejected*`**：5 keys × 3 locales（Title / Desc / ReasonHeading / NoReasonFallback / ReapplyCta）給 `/kol/onboarding` REJECTED early-return card。
- **Console `adminKols.detailRejectionReason`**：1 key × 3 locales 給 `KolsClient` detail modal。

Web parity verified: **811/811/811**（前 774 + 37 keys）。Console parity 同步確認。

Parity check script（內聯 node `-e`）會 flatten 所有 key path 比對 set difference — 對 3 個 locale 之間任一不一致會立即報；過去 i18n 維護常見的 typo（zhHant 加了 zhHans 忘加）一次抓到。

---

## 完成項目

### C1：`fbd3c21` `feat(api,db): persist Kol.adminNote for rejected applications`

- 105 insertions / 10 deletions across 12 files
- Schema add nullable `Kol.adminNote @db.Text` + migration `20260527131221_add_kol_admin_note`（純 ADD COLUMN no UPDATE — 守 rule 31 紅線；既有 REJECTED row 讀 NULL → landing page fallback generic copy）
- `KolEntity.KolRecord` + `IKolRepository.updateStatus` 第三參數從 positional `adminUserId` 改 options object `{ adminUserId?, adminNote? }`
- `PrismaKolRepository.updateStatus` 只在 REJECTED transition persist adminNote（APPROVED / SUSPENDED 留 column 不動 — idempotent rewrite 讓前次 rejection note 仍 queryable 給未來 resubmitted 之後再 reject 的 audit trail）
- admin reject route 移除 `void`、forwarded `body.adminNote` 進 options，APPROVED + SUSPENDED 同步 migrate options signature
- `kols/presentation/routes.ts` 新 `toPublicKol()` sanitizer 從 public list + detail endpoints 剝 adminNote（`GET /v1/kols/me` 保留全 record 給 applicant）
- web + console API client `KolListItem` + `AdminKolItem` 同步加 nullable adminNote field
- 3 個 test fixture（ApplyKolUseCase / ListKolsUseCase / EmitSignalUseCase）加 `adminNote: null`

### C2：`ac8b865` `feat(web): add /become-a-kol landing page with 6 UX states`

- 658 insertions / 4 deletions across 9 files
- ~500 行 page 本體 + onboarding + console + i18n（atomic-but-large 借 S2 /auth 493、M5.1 SentimentPicker 380、M7.5b EvidenceUpload 423 先例 — 單一 feature 不應拆）
- 新 `apps/web/src/app/[locale]/become-a-kol/page.tsx`（494 行 client component）
- `/kol/onboarding` REJECTED early-return card with adminNote callout + reapply 按鈕
- console `KolsClient` detail modal 對 REJECTED row 顯示 persisted adminNote
- i18n 三語 parity 811/811/811（+37 keys）

### C3：`3402784` `docs(status): track Phase 2 UI Polish S3 completion`

- 更新「最後更新」+ 加 S3 章節 + 標 S2 為「前 session 完成」+ 改進度行 + Session History 新行
- 包含踩坑紀錄（commitlint hex literal trap）

---

## 產生的 ADR

無。本 session 純 implementation，所有設計依 ADR-0036 D1.1 既有 spec 落地。

---

## 待後續處理事項

### 給下個 session 接 M12 grant application 骨架的人

1. **6/8 deadline** — 創科局 grant application 短文初稿，根據 user 的最新規劃 priority 最高。需要 Cantonese first draft + en translation candidate。
2. **參考材料**：`docs/conversations/2026-05-25-team-meeting-strategy.md` 有完整的會議轉錄（含 narrative 升級到「擁抱監管」+ HKMA Sandbox via HKSTP 路徑 + Token Economy 引入意向）。
3. **可能的 ADR-0035 candidate**：「擁抱監管」narrative 升級若要 lock down 需要新 ADR — 但 grant 短文寫完前不急著 commit。
4. **舊 vision/roadmap 升級**：`docs/00-vision.md` 跟 `docs/02-roadmap.md` 都 5/17 寫的，跟 5/25 會議 narrative 有 drift。但 grant 急於 vision 升級，建議 grant 短文 → 用 grant content 反推 vision 升級。

### `/kol/onboarding` REJECTED → reapply 流程的後續潛在改進

C2 寫的 reapply button 只 reset `appStatus` 跟 `step`，但 form fields（`displayName` / `bio` / `twitter` / `youtube` / `licenseType` / `agreed`）都還是空的。User 重新填一遍可以但稍微浪費 — 未來可以從 `kol.displayName` / `kol.bio` 等 prefill 第一次的內容讓 user 修改而非從零填。但這是 polish 不是 bug，不急。

### Production migration 注意事項

`20260527131221_add_kol_admin_note` 是純 ADD COLUMN，production deploy 時 zero downtime + 不需要 backfill；既有 REJECTED row 讀 NULL 就由前端 fallback copy 兜住。Deploy checklist：

1. apply migration（Prisma migrate deploy 自動）
2. deploy new API code
3. deploy new web + console code
4. 不需要任何 backfill script（既有 row NULL OK）

### `becomeAKol.disclaimer` 三語措辭的 legal review

繁中版「OpenTrade 為純技術基礎設施，不發表任何投資建議；所有 KOL 訊號僅作個人交易意見參考，使用者應自行評估風險。鏈上資料一經上鏈即不可刪除、不可篡改。」這段是基於 rule 00 + SFC 第 4 類牌照 disclaimer pattern 寫的，但 grant 申請可能會被法務看到 — 建議 grant 階段順便讓 SFC consultant 看一眼三語 disclaimer 措辭。

---

## 給未來 AI agent 的建議

1. **Pre-flight audit 永遠先跑** — S3 原本是「~500 行 landing page」單一 commit，audit 中發現 backend gap 才擴成 C1 + C2 兩個 commit。如果直接寫 page，REJECTED state 就會顯示空白 adminNote（fallback copy），UX 很奇怪。Audit 多花 10 分鐘但避免後續補丁。
2. **`#<hex>` literal 在 commit body 是地雷** — conventional-commits-parser 把它認成 `#<number>` issue reference，連帶把 body 切到 footer 起始，`footer-leading-blank` 報錯。Workaround 是 commit body 不寫 hex literal（code diff 內 hex 不影響）。Rule 70 已警告 `<word> #<number>` 模式，但 hex literals 是同類延伸，commit body 規劃時避開。
3. **6-state UX 派生用單一 useEffect + 平行 fetch + 404 swallow** — 不要寫 5 個 useEffect 鏈式調用，會 race。直接 `Promise.all([fetchMyProfile, fetchMyKolProfile.catch(404→null)])` 拿全資訊一次性 setState 整個 state object，最乾淨。
4. **public vs owner 資料路徑分離用 sanitizer helper** — `Omit<KolRecord, 'adminNote'>` 在 type 層 encoded 「public endpoint 不可洩」這個 invariant，比每個 endpoint 手動挑 field 更不易出錯。Future agent 看到任何 moderator-internal field（jury notes、internal flags、review queue hints）都應該照搬此 pattern。
5. **i18n parity script 內聯 node `-e`** — 不需要單獨寫腳本，inline 一行 node 就能 flatten 比對三語 set difference；每次新增 namespace 必跑一次避免 missing-key crash。
6. **atomic-but-large commit 已有 5 個先例**（M3.2 backfill 202 / M5.1 SentimentPicker 380 / M7.5b EvidenceUpload 423 / S2 /auth 493 / S3 C2 658），「單一 coherent feature 不應拆」這個原則在 OpenTrade 已穩固。但 commit message 必須清楚說明為什麼這個 feature 不能拆 + 引用先前 precedent，否則 reviewer 會疑問。
7. **status update 的「踩坑紀錄」段值得寫** — commitlint hex trap 雖然不升級 rule 但寫進 status 讓 future agent 遇到時能快速搜尋 reference，省一輪 debug。

---

## Phase 2 UI Polish 整體收尾

S1 + S2 + S3 三個 session 全部完成 — Phase 2 UI Polish 計畫 100% 收尾：

| Session | Date               | Task                                                                   | Commit                            |
| ------- | ------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| S1      | 2026-05-27 (early) | Mobile nav full-screen overlay (Header refactor)                       | `2062ef6`                         |
| S2      | 2026-05-27 (mid)   | Full-page `/auth` route + 9 callsite migration + iAM Smart Coming Soon | `da08f94`                         |
| S3      | 2026-05-27 (late)  | `/become-a-kol` landing page + Kol.adminNote backend gap close         | `fbd3c21` + `ac8b865` + `3402784` |

**設計 reference**：Google OpenTrade-UI（`Auth.tsx` + `BecomeKol.tsx` + `MobileNav.tsx`）三份設計參考。

**下一個 UI work**：等 Google 提供新設計參考再決定（M10 商戶功能 surface 還沒被設計 polish 過）。但這不是 S4，是獨立的「UI sprint」階段。

Phase 2 接下來的主軸是非 UI work：M12 Grant application（6/8 deadline，最高優先）→ M13 vision/roadmap 升級 → M14 rule 52 content moderation per ADR-0034。

---

## 引用

- ADR-0036 D1.1 Hybrid KOL registration flow（spec source）
- ADR-0036 D1 open onboarding（no minimum follower count）
- ADR-0036 D9 KOL value proposition（3 個 value-prop cards 內容依據）
- Rule 00 「reject != delete」（REJECTED 必須 visible + adminNote 必須給 applicant 看）
- Rule 31 「Migration 內含資料遷移」紅線（純 ADD COLUMN no UPDATE）
- Rule 50 least-privilege exposure（`toPublicKol()` sanitizer 依據）
- Rule 70 `<word> #<number>` 模式陷阱（commitlint hex trap 同類延伸）
- Rule 96 atomic-but-large 先例（S2 /auth + M5.1 / M7.5b 三個先例）
- Rule 99 self-review（本 session 確認無 rule 升級需要）
