# 金商名冊權威來源 rebrand：CGSE → HKGX — 2026-06-21

> 本文件歸檔 OpenTrade 把金商（bullion dealer）vertical 的權威名冊來源
> 從「金銀業貿易場 (CGSE)」改為其法團化繼任者「香港黃金交易所 (HKGX)」
> 的完整 rebrand 對話與執行精華。

## 對話脈絡

- **日期**：2026-06-21
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.8
- **背景**：金商 vertical（ADR-0045）已於 2026-06-05 全部完成並上線，名冊
  以 CGSE（香港金銀業貿易場）為權威來源。負責人發現 CGSE 已被法團化繼任者
  HKGX（香港黃金交易所，2025-01-01 起接替、合規要求更高）取代，要求更新。

## 主要討論內容

### 1. 事實確認

- Web 搜尋確認 CGSE 於 2025-01-01 起改制/更名為 Hong Kong Gold Exchange
  (HKGX)，HKGX 為其法團化繼任者。
- 既有 schema 以 `Regulator.HK_CGSE` / `LicenseType.HK_CGSE_MEMBER` 表示，
  名冊 seed 以 `cgse-{memberCode}` 為 slug、`source='cgse'`。

### 2. 範圍決策（user 拍板）

- **深度**：full rebrand（非僅顯示層）—— enum、資料、API、前端、i18n、測試、
  文件全部改。
- **Slug**：rename（`cgse-* → hkgx-*`），不保留舊 slug 別名。

### 3. 執行（全棧，CI-green 原子 commit）

- **ADR**：新增 `ADR-0050`（Accepted，amends ADR-0045）；ADR-0045 標題不改、
  僅標 amended by 0050；README 索引更新。
- **DB**：`schema.prisma` enum rename + 無損 migration
  `20260621090000_rename_cgse_to_hkgx`（`ALTER TYPE ... RENAME VALUE`，
  既有 BrokerLicense rows 透明跟進、零回填），已套本機 dev 驗證。
- **資料管線**：`packages/db/src/cgse/ → src/hkgx/`（types/scrape/sync/index），
  scraper 指向 `hkgx.com.hk`、selector 放寬；seed `cgse-members.json →
hkgx-members.json`（slug `hkgx-*`、`source=hkgx`）；`fetch-cgse-members.ts →
fetch-hkgx-members.ts`；`package.json` `fetch:cgse → fetch:hkgx`；
  `seed.ts` `seedCgseMembers → seedHkgxMembers`。
- **API / 前端 / console**：`HK_HKGX` 檢查、registry link `hkgx.com.hk`、
  三語 `cgse* → hkgx*` i18n key + 顯示字串「香港黃金交易所 (HKGX)」。
- **測試**：component / e2e / parity 對齊（`hkgx-009` slug、`HK_HKGX` enum、
  `hkgx*` key）。
- **文件**：glossary 加 HKGX 條目並把 CGSE 標為前身、vision 金商來源改 HKGX、
  Google UI prompt 全 rebrand、status 摘要 75。

### 4. 保留的歷史脈絡（刻意不改）

- immutable 歷史 migration `20260605100849`（原 `ADD VALUE HK_CGSE`）不動。
- ADR-0045 檔名與標題不改（只標 amended）。
- schema / code 註解保留「formerly CGSE」說明 HKGX 的前身。

### 5. 驗證結果

- typecheck 7/7 workspace 綠、lint 0 error（僅無關 pre-existing warning）。
- 測試：web bullion 20 + api brokers 18 + console admin 4 全綠。
- `prisma validate` 綠、`prisma migrate deploy` 套用成功、client regenerate。
- seed JSON slug/source 改完、無殘留 `cgse`。

## 產生的 ADR

- **ADR-0050**：Rebrand bullion registry CGSE → HKGX（Accepted，amends 0045）。

## 待後續處理事項

- 3 個 commit（`e944f66` ADR / `65f7a31` rebrand / `4abfbef` docs）**未 push**，
  正式流程應走 PR（rule 70 不直接 push main）。
- UAT / 正式環境部署時需 `prisma migrate deploy` 套用 rename migration，並重新
  `fetch:hkgx` + seed 灌名冊。
- ADR-0050 Phase 2 follow-up：HKGX live 全量 rescrape + 停業名單處理。

## 給未來 AI agent 的建議

- 任何看到 `cgse` 的程式碼若不是「歷史 migration」或「formerly CGSE 註解」，
  都應視為遺漏並更新為 `hkgx`。
- enum 用 `ALTER TYPE RENAME VALUE` 是無損的（rows 以 oid 參照 label），未來
  類似 rebrand 可沿用此模式而非 add-new + 資料搬移。
