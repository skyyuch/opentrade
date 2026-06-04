# 依賴升級收尾 — notifications.id drift + Dependabot 第二批安全升級 — 2026-06-04

> 本文件歸檔 OpenTrade「依賴升級收尾」session 的精華內容。
> 接續 Next 16（ADR-0040）+ Prisma 7（ADR-0041）兩大遷移皆 merge 到 main 之後的遺留清理。

## 對話脈絡

- **日期**：2026-06-04
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.8
- **背景**：Next 16 + Prisma 7 已同在 main。本 session 清理升級遺留的兩件事：(1) `notifications.id` schema drift 獨立 chore；(2) 把仍 OPEN 的 Dependabot PR 中的安全小升級批次收掉。

## 主要內容

### 1. `notifications.id` schema drift 對齊（摘要 51）

交接假設是「drift 可能遍及全 repo 的 `@default(uuid())` model」，但**唯讀調查推翻了這個假設**：

- **調查方法**（全程唯讀，先確認範圍再動手）：
  1. `grep` schema 全部 `@default(uuid())` model（17 張表）。
  2. `grep` 所有 migration 的 `CREATE TABLE` id 欄位 + `ALTER COLUMN ... DROP DEFAULT`。
  3. 寫臨時 `pg` 腳本直查 `information_schema.columns` 拿**實際 DB** 的 id default。
- **關鍵發現**：
  - 4 張表建表時帶 server-side `DEFAULT gen_random_uuid()`（`sbt_verification_requests` / `broker_claim_requests` / `review_translations` 皆 05-22 建 + `notifications` 05-27 建）。
  - **但前 3 張早在 `20260523022745_add_broker_sfc_detail_fields` 就被 `ALTER COLUMN "id" DROP DEFAULT` 對齊了**（既有先例！）。
  - `notifications` 晚 4 天建、漏掉那次清理，成為**唯一**還 drift 的表。DB 實查確認只有它是 `gen_random_uuid()`，其餘 16 張全 `(none)`。
- **拍板方向 (b)**（user 確認）：寫對齊 migration `DROP DEFAULT`，對齊 schema 的 client-side `@default(uuid())`。理由：符合 05-23 既有先例 + 全 repo 慣例；notifications 全程經 Prisma 生 UUID 無 raw insert，方向 (a) `dbgenerated` 的好處用不到。
- **執行**：新增 `20260604120000_drop_notifications_id_db_default/migration.sql`（純 DDL，無資料遷移 per rule 31）→ `prisma migrate deploy`（只 apply pending、不 reset/generate/seed，保留 e2e 資料）。
- **驗證**：DB default 清除、`prisma migrate diff --from-config-datasource ... --to-schema ... --exit-code` 回 0（空 diff）、`migrate status` 22 migrations up to date。
- **連帶 `add_kol_admin_note` checksum drift → 經查已不存在**：寫臨時腳本對全 21 migration 算 sha256 vs `_prisma_migrations.checksum`，**全部吻合**（先前 session 已對齊，或當初補註解後才 apply）。Prisma checksum 演算法 = migration.sql 檔案的 sha256 hex（已實測驗證）。

### 2. Dependabot 第二批 5 個安全小升級（摘要 52）

- 10 個 OPEN PR 分兩堆：5 個 🟢 安全 minor/patch + 5 個 🟡🔴 大遷移。
- **🟢 本機批次升**（避免連環 lockfile 衝突，同摘要 47 手法），commit `452f2ac`：
  - `next-intl 4.12→4.13`（web+console）、`wagmi 3.6.15→3.6.16`（web+console）、`permissionless 0.3.5→0.3.6`（web）、`react-hook-form 7.76.1→7.77.0`（console）、`@aws-sdk/client-s3 3.1052→3.1061`（api+db）。
  - `pnpm install` 重生 lockfile（peer warnings 皆 pre-existing，例如 permissionless 0.3.x vs Privy peer `^0.2.47` 在 0.3.5 時就存在）→ typecheck 8/8 + lint 0 error + unit（api 108 / web 28）全綠 → push main → `gh pr close` #21/#22/#25/#26/#27。
- **🟡🔴 deferred（留專屬 session）**：`#8` @vitejs/plugin-react 6（需 Vite 6）、`#23` @vitest/coverage-v8 4（需 Vitest 4）、`#24`+`#28` Storybook 8→10、`#15` tailwindcss 4（CSS-first 重寫）。

## 產生的 ADR

- 無新 ADR（drift 對齊是 direction b 執行；deps 是例行 bump）。

## 待後續處理事項

- **Vite/Vitest/Storybook 叢集升級**：建議一個專屬 session 依序 Vite 6 → Vitest 4 → Storybook 10 + plugin-react 6（#8/#23/#24/#28 互相牽連）。
- **tailwindcss 4（#15）**：獨立大遷移（CSS-first 重寫）。
- **bufferutil Docker 原生編譯**：pre-existing，獨立排期。
- **業務 backlog**：最緊急 **M12 grant 骨架（6/8 截止）**；其次 M13 vision/roadmap 升級（6/20 端午會議前）、M14 rule 52 content moderation、M8-M10 KOL/商戶功能。

## 給未來 AI agent 的建議

- **查 schema drift 範圍別只看 migration 檔，要直查 `information_schema.columns`**：migration 史可能有後續 `ALTER ... DROP DEFAULT` 把早期的 default 清掉了（本 session 正是如此 — 3 張 sibling 表看起來 drift，實際早被對齊）。DB 才是真相。
- **改 schema/DB drift 前先用 `migrate diff --from-config-datasource --to-schema --exit-code` 確認對齊**（exit 0 = 空 diff），比眼睛看 migration 可靠。
- **Prisma checksum drift 別急著修**：先算檔案 sha256 比對 `_prisma_migrations.checksum`，可能根本已吻合（本 session 的 `add_kol_admin_note` 就是假警報）。
- **依賴批次升的紀律**：安全 minor/patch 本機一次升 + 重生 lockfile 避免 N 個 PR 連環衝突；major / 跨生態（Vite/Vitest/Storybook）的留專屬 session 各自評估。
- 全程嚴守 rule 31：**不可 `migrate reset`**（會清 e2e 資料）；用 `migrate deploy` apply pending migration。
