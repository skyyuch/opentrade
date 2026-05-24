# Broker Name i18n Hardening + zh-Hans Strategy — 2026-05-24

> 本文件歸檔 OpenTrade 項目 2026-05-24 下半場 session 的精華內容。
> 上一份 session 歸檔見 `2026-05-24-verify-page-rebuild.md`（涵蓋 ADR-0025 多券商驗證策略 + Phase 1 實作 + verified-broker visibility 全平台覆蓋 + post-rollout fixes）。
> 本份 session 緊接其後，主題收斂為「broker 名字的 i18n contract」。

## 對話脈絡

- **日期**：2026-05-24（晚上 8:30 - 9:30 HKT）
- **參與者**：項目負責人 + Claude Opus 4.7
- **背景**：上一個 session 結束時 user 發現 `/verify` 「已驗證的券商」card 顯示 raw slug `hsbc-broking-securities-hong-kong-limited`、`/admin/verifications` 「聲明券商」column 也顯示 slug，於是反映「前後台顯示券商的名字也要根據多語言顯示，這個已經很多次，要加到 cursor rules」。

## 主要討論內容（按主題分節）

### 1. Broker 名字顯示 i18n hardening（本 session 主軸）

#### 1a. 問題範圍 audit

派出 explore subagent 對整個 monorepo 做 read-only audit，發現兩類 bug：

**(A) Slug-rendered（component 只拿到 slug）**

- `apps/web/src/components/verify/VerifyForm.tsx:361,370,966` — `VerifyPendingCard` / `VerifyRejectedCard` / `VerifyApprovedCard` 用 `brokerNameForSlug(brokers, slug, locale)` 但 `brokers` 是 SSR-shipped 的 100-broker pool，超過 #100 的 broker fallback 成 raw slug
- `apps/web/src/app/[locale]/settings/page.tsx:212` — `VerifiedBrokersSection` 直接 render `<span className="font-mono">{b.brokerSlug}</span>`
- `apps/web/src/components/brokers/BrokerDetailTabs.tsx:454-459` — review card "verified at other broker" 標籤 render 的 `✓ {slug}`
- `apps/console/src/app/[locale]/admin/verifications/VerificationsClient.tsx:330,506,627` — 「聲明券商」表格 column、case modal Target broker panel、UserVerifiedBrokersPanel
- `apps/console/src/app/[locale]/admin/users/UsersClient.tsx:443,403` — BrokerPills 表格欄、UserDetailPanel

**(B) Locale-blind（component 拿到一列就 render）**

- `apps/web/src/components/brokers/BrokerDetailTabs.tsx:128` — SubmitReviewCta 用 `broker.displayName` (中文 only)
- `apps/web/src/components/brokers/BrokerDetailTabs.tsx:1166-1175` — Sidebar similarBrokers 用 `sb.displayName`，且 API similarBrokers 沒 ship `legalName`
- `apps/console/src/app/[locale]/admin/claims/ClaimsClient.tsx:110` — broker column `claim.broker.displayName`
- `apps/console/src/app/[locale]/admin/reviews/ReviewsClient.tsx:118` — broker column `r.broker.displayName`
- `apps/console/src/components/layout/AuthGate.tsx:322` — sidebar identity card `claimedBroker.displayName`
- `apps/console/src/app/[locale]/brokers/page.tsx + brokers/[slug]/page.tsx` — merchant directory 把 displayName hard-code 為 primary、avatar fallback initials 也吃 `displayName.charAt(0)`

#### 1b. 6-commit 解法

- **`feat(shared) b5d47bd`**：把 inline `localizedBrokerName` lift 到 `packages/shared/src/i18n/brokerName.ts` 作為 canonical helper（pure、framework-free、`en → legalName ?? displayName ?? slug`、其他 → `displayName ?? legalName ?? slug`）。理由：原本 web + console 各有 inline 版本在 component 裡 + 有 divergence 風險、cursor rule 10 要求 cross-app 程式碼放 `packages/shared`。
- **`feat(api) 20e00ee`**：9 個 endpoints 全部 ship `displayName + legalName`。新增 `apps/api/src/shared/brokerHydration.ts` 的 `hydrateBrokerNames(slugs, tenantId)` 共用 batched 查表 helper（`UserVerifiedBroker` keys by slug 沒 FK relation，無法用 Prisma `include`，必須走 hydration）。涵蓋：
  - `/v1/auth/me` claimedBroker 加 legalName
  - `/v1/auth/verification-status` verifications + verifiedBrokers 加 displayName + legalName
  - `/v1/auth/admin/verifications` 加 brokerDisplayName + brokerLegalName + user.verifiedBrokers
  - `/v1/admin/users` (list + detail) 加 verifiedBrokers + verifications + reviews.broker + claims.broker 對應 columns
  - `/v1/admin/reviews` broker.legalName
  - `/v1/reviews/broker/:slug` 改 author.verifiedBrokers from `string[]` 到 `{brokerSlug, displayName, legalName}[]`、broker top-level 加 legalName
  - `/v1/brokers/:slug` similarBrokers 加 legalName
  - `/v1/brokers/admin/claims` broker.legalName
- **`feat(web) 186f8e3`**：4 個檔案——`client.ts` types 升級 + `VerifyForm` 三張 cards + `BrokerDetailTabs` ReviewCard verified-broker pills + Sidebar similarBrokers (含 avatar initials) + SubmitReviewCta + `settings/page.tsx` VerifiedBrokersSection。`VerifyForm` 的 inline localizedBrokerName 刪掉改 import shared，並刪掉 dead code `brokerNameForSlug`（pool-lookup fallback）。submit 後 synthesise 的 PENDING row 補帶 brokerDisplayName/Legal。
- **`feat(console) 05b594f`**：8 個檔案——`client.ts` types 升級 + `VerificationsClient` 表格 + case modal Target broker panel + UserVerifiedBrokersPanel + `UsersClient` BrokerPills + UserDetailPanel + `ClaimsClient` broker column + `ReviewsClient` broker column + `AuthGate` sidebar + `brokers/page.tsx` BrokerCard primary + secondary + avatar initials + `brokers/[slug]/page.tsx` BrokerHeader 同上。
- **`docs(rules) 3b33aa3`**：rule 51 §模式 A 加 5 子節（A1 canonical helper / A2 API contract 強制 ship 兩列 + 提到 hydrateBrokerNames pattern / A3 UI 強制 pipe 進 helper / A4 兩列同顯特例 / A5 slug 容身之處）+ 嚴禁清單加 5 條紅線（API 只回 slug / 只回 displayName / inline ternary / slug 當文案 / avatar initials 直接吃 displayName.charAt(0)）。
- **`docs(status) 6084bcf`**：紀錄。

完整討論：當前 session transcript。

### 2. Push 流程紀律

User 在所有 commit 完成後問「是不是所有修改都推到 git 了」。我回報：commit 已到 local but `main` 領先 `origin/main` **26 個 commit**。User 拍板「git 上一定要是最新的代碼」要求 push。執行 `git push origin main` 成功，但 GitHub 回 warning：

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Changes must be made through a pull request.
remote: - 7 of 7 required status checks are expected.
```

Repo 設了 branch protection（PR + 7 required CI checks）但 owner 帳號有 admin bypass 權限，Phase 1 的 direct push 全部跳過。

我提醒這違反了 cursor rule 70「不可 force push 到 main / 不可跳過 CI 直接 merge」紅線，建議：

1. 短期（這次）：放著，不糾結
2. **Phase 2 前必做**：
   - 列清楚 7 條 required status checks 的具體名稱（typecheck / lint / unit / build / forge / e2e / migration safety 之類）
   - 在 `.github/workflows/` 補齊並讓 main 上每個 commit 跑過至少一次
   - 寫 ADR 紀錄解除 admin bypass 的時機（最早觸發點：第二位人類 contributor 加入、Phase 1→2 boundary、SFC 高層董事正式加入並接觸 repo 三者最早）
   - 之後新功能一律走 `feature/xxx → PR → CI → squash merge`

這筆 follow-up 紀錄到 `docs/03-status.md` 待決策清單「流程層級」段（commit `9d74d19`）。

### 3. zh-Hans broker 名字「沒有值」問題

Push 完之後 user 提到「目前所有券商名字在簡體狀態下都沒有值」。透過 AskQuestion 確認實際症狀是「所有頁面在 zh-Hans locale 都顯示繁中（不是空白、不是 slug）」。

#### 3a. 成因

`Broker` schema 是 `displayName` (繁中，來自 SFC `nameChi`) + `legalName` (英文)。沒有第三欄存簡中。`localizedBrokerName` helper 在 `zh-Hans` 走 `displayName ?? legalName ?? slug`，所以永遠回繁中。**不是 bug，是 schema 沒有簡中可以給**。

#### 3b. 三個方向比較

| 方向                                                           | 摘要                                                                 | 何時做                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **A. DB 加 `displayNameZhHans` 欄位 + OpenCC 一次性 backfill** | parallel-columns 加第三列、轉換確定性高、admin 可手動 override       | broker 是目前唯一需要簡中的 entity 時                                             |
| **B. 通用 entity translation 表**                              | `BrokerNameTranslation { brokerId, locale, name }`，所有 entity 共用 | 第二個需要 i18n 的 entity 出現時（KOL nickname / license series / dispute title） |
| **C. Schema rename `nameEn / nameZhHant / nameZhHans`**        | 完全展開三列，rule 51 模式 A 結尾預留                                | 加第四語（日文）時                                                                |

#### 3c. Decision: 採方案 A

理由（後完整寫進 ADR-0026）：

1. **方案 B over-engineer**：broker 是目前唯一需要簡中的 entity，建 join table 浪費。`ReviewTranslation` 走 table 是因為 review body 是 long-form UGC + 跨語言 DeepL 成本高，broker 名字短 + 法人實體 + 跨語對應穩定（OpenCC 確定性極高）。
2. **方案 C 太早**：schema rename 影響 30+ ts type / Prisma generated / 所有 reference，沒有 payback（沒有第四語需求、沒有第二個需要 i18n 的 entity）。當實際需要時再走 C 是 cheap migration，不是 destructive。
3. **方案 A 跟 cursor rule 51 模式 A 結尾「未來若擴增第三語...」是同一條路**，只是「現在做不是未來做」。
4. **OpenCC 對 broker 法人名（「投資有限公司」「證券」「期貨」這類常用詞）準確率接近 100%**，少數歧義可透過 nullable `displayNameZhHans` + admin override 緩解。
5. **`opencc-js` 是 pure JS（無 native 依賴），不影響 Lambda / ECS 部署或 cold start**。

#### 3d. 6-commit 實作計畫（轉新 session 完成）

1. `feat(db)` add `displayNameZhHans String?` column + migration
2. `feat(shared)` extend `localizedBrokerName` helper for `zh-Hans` 分支 + extend `LocalizedNameInput` shape
3. `feat(db)` OpenCC backfill script + `sync-brokers.ts` integration（自動轉新 broker）
4. `feat(api)` ship displayNameZhHans on every endpoint（9 個）
5. `feat(web,console)` types + verify all consumers（components 不用改，因為都已 pipe 進 helper）
6. `docs(rules,status)` rule 51 升級 ship 三列 + status update + ADR-0026 cross-link

完整方案詳見 [ADR-0026](../decisions/0026-zh-hans-broker-name.md)。

## 產生的 ADR

- [**ADR-0026**: zh-Hans broker name strategy (DB column + OpenCC backfill)](../decisions/0026-zh-hans-broker-name.md) — 拍板採方案 A。

## 待後續處理事項

- **新 session 主任務**：依 ADR-0026 實作 6-commit 計畫
- **流程紀律 follow-up**（Phase 2 前必做）：列清楚 GitHub 設的 7 條 required status checks 具體名稱、補齊 `.github/workflows/`、寫新 ADR 紀錄解除 admin bypass 時機
- **broker name admin override UI**：暫不在 ADR-0026 範圍，等真有需要 override 的個別 broker 出現時再做（目前先靠 nullable + DB direct update）
- **prod 環境 backfill 排程**：dev DB 跑完 backfill script 驗證後，安排 prod 跑（建議跟下次週期 SFC sync 一起跑）
- **Activity feed locale-blind**：`GET /v1/admin/activity` 的 description 是 server pre-rendered string（含 broker 名稱），目前 Chinese-only — 需另一個 commit 把 description 拆成 structured event fields 由 console 自己 i18n 拼字串，但是 secondary surface，未列入 ADR-0026 範圍
- **`ProfileClient.tsx` 兩個 readonly row 都是 `t('legalName')` label + `broker.legalName` value**（疑似 copy/paste 重複）— 不是 locale bug 但 audit 過程順手 flag，留給未來 cleanup

## 給未來 AI agent 的建議

### 接 ADR-0026 實作時

1. 先讀 ADR-0026 完整版（特別是 D1-D8 與 6-commit plan）
2. 開工前 sanity-check 三件事：
   - `opencc-js` 在 npm 上的最新版本與是否有 breaking change
   - 跑一個 toy `t2s` 轉換驗證效果（例：「匯豐控股有限公司」→ `汇丰控股有限公司`）
   - dev DB 的 broker count（影響 backfill 時間預估，目前約 5000 筆）
3. **不要改 `displayName` 內容** — 它是繁中 source of truth，永遠保留。`displayNameZhHans` 是衍生欄位。
4. **OpenCC config 用 `t2s.json`**（不是 `tw2sp` 或 `s2t`），因為 SFC 來源是港繁不是台繁，`t2s` 對港繁適用度最高。

### 改 broker 相關 UI 時

- **永遠走 `localizedBrokerName(b, locale)` from `@opentrade/shared`**，不要在 component 寫 inline ternary
- **永遠不要 render slug 當 user-facing 文案**（slug 是 routing key）
- 看 cursor rule 51 §模式 A 五子節 — 那是 contract 不是建議

### 改 Broker schema 時

- 加列 → 對應升級：(1) Prisma schema (2) migration (3) seed/sync 邏輯 (4) shared helper input shape (5) hydrateBrokerNames return shape (6) 9 個 API endpoints payload (7) web + console client.ts types (8) cursor rule 51 §A2 範例 (9) 任何使用該列的 component
- 不要少做任何一步，否則就會像本 session 開頭那樣留下 raw slug regression
