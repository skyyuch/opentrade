# Phase 1 MVP-A Block 7: SFC Broker Seed + Sync Pipeline — 2026-05-22

> 本文件歸檔 OpenTrade 項目 Phase 1 MVP-A Block 7 實作的精華內容。

## 對話脈絡

- 日期：2026-05-22
- 參與者：項目負責人 + AI Agent（Claude Opus 4.6）
- 背景：Phase 1 MVP-A Block 1-6 已完成，Block 7 是最後一個 block — SFC 持牌證券商資料爬取 + 自動同步 pipeline

## 主要討論內容

### 1. SFC 公開 API 的真實行為

原始計畫假設 `searchByRaJson` endpoint 的 `raDetails` 欄位會包含完整牌照資訊。實測發現：

- **`searchByRaJson`**：`raDetails` 永遠回傳 `null`（只有 list metadata）
- **`searchByNameJson`**：用 CE ref 搜尋時才有 `raDetails`，但用 `searchtext` 字母搜尋只做全文匹配，結果太少
- **最終策略**：對每個 RA type (1-10) × 36 letters 做 `searchByRaJson`（共 360 requests），以 ceref 交叉合併建構完整牌照矩陣。比原計畫多 10 倍請求，但只需 ~2 分鐘

### 2. 資料品質問題

- SFC API 對部分公司的 `nameChi` 回傳 `\x00`（null character），需要清除後 fallback 到英文名
- 864/3482 家公司沒有中文名（fallback to English）
- Slug 零重複（3482 unique slugs）

### 3. SFC Broker Sync 的架構決策

上一個 session 已討論並決定：

- **ECS Scheduled Task**（非 Lambda 或 GitHub Actions cron）
- **每週一 03:00 HKT**（EventBridge cron `0 19 ? * SUN *`）
- **重用 API Docker image** with CMD override to `dist/tasks/sync-sfc.js`
- 決策記錄於 ADR-0020

### 4. tsup 雙 entry point 模式

`apps/api/tsup.config.ts` 從單 entry `['src/main.ts']` 改為 `['src/main.ts', 'src/tasks/sync-sfc.ts']`，產出：

- `dist/main.js` (36.41 KB) — API server
- `dist/tasks/sync-sfc.js` (6.98 KB) — SFC sync task

Dockerfile 不需修改，CMD override 在 ECS task definition 層做。

### 5. packages/db subpath export

為了讓 `apps/api` import `syncBrokers` 和 `SfcBrokerData`，新增 `@opentrade/db/sfc` subpath export（指向 `src/sfc/index.ts`）。這是 monorepo 內第一次用 subpath export 在同一 package 內分割模組。

## 實作結果

| 項目                | 數據                                          |
| ------------------- | --------------------------------------------- |
| SFC API 請求數      | 360 (10 RA types × 36 letters)                |
| 法團數量            | 3,482                                         |
| 牌照數量            | 6,982                                         |
| 有中文名的法團      | 2,618 (75%)                                   |
| Fallback 到英文名   | 864 (25%)                                     |
| Seed 冪等性         | ✅ 驗證（第二次跑 = 0 created, 3482 updated） |
| 新 commits          | 5 (各 < 300 行，不含 JSON seed data)          |
| 新 ADR              | ADR-0020: Scheduled SFC Broker Sync           |
| 新 Terraform module | `sfc-sync-task/`（4 files）                   |

## 產生的 ADR

- ADR-0020: Scheduled SFC Broker Sync（ECS Scheduled Task + EventBridge weekly）

## 待後續處理事項

- Phase 1 MVP-A PR：將 `feature/phase-1-mvp-a`（23 commits）merge 到 main
- Terraform `apply`：目前 `sfc_sync` module 已 wired 但 `enabled=false`，待 API image push 後啟用
- Phase 2+ 考慮：sync 失敗時加 Slack/email notification + diff report（新增/吊銷牌照）

## 給未來 AI agent 的建議

- SFC API 是 **非官方**的，端點可能變動。sync script 有 robust error handling 但沒有 retry/notification
- `packages/db/seed/data/sfc-brokers.json` 是 55K+ 行的大檔案，commit 進 repo 作為 offline seed 使用
- `apps/api/src/tasks/sync-sfc.ts` 和 `packages/db/scripts/sync-sfc-brokers.ts` 有大量重複的 SFC fetch 邏輯，未來可以抽成 shared module（但目前 packages/db scripts 不走 tsup build，所以 import 路徑不一致）
- Terraform module `sfc-sync-task` 的 `enabled` variable 控制 EventBridge rule 開關，不需要 destroy 資源即可暫停
