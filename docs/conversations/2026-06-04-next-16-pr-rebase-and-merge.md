# Next.js 16 PR #19 rebase onto main + merge + handoff — 2026-06-04

> 本文件歸檔 OpenTrade「Next 16 PR 收尾」session 的精華內容。
> 接續 Prisma 7 merge session（PR #20 已上 main，Next 16 PR #19 仍 OPEN 待 rebase）。

## 對話脈絡

- **日期**：2026-06-04
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.8
- **背景**：依賴升級收尾的最後一步。Prisma 7（ADR-0041）已 squash-merge 到 main（`10b6f69`）；Next 16（ADR-0040，PR #19 `chore/nextjs-16-upgrade`）仍 OPEN，需 rebase onto main → 重跑 CI → merge。

## 主要內容

### 1. PR #19 rebase onto origin/main

- `git rebase origin/main`，8 個 commit（`a524f5c`…`33dfe34`）replay 到 Prisma 7 之後。
- **3 處衝突，全屬機械性**：
  - `pnpm-lock.yaml` ×2（commit `a524f5c` bump next/react、`2236dfc` ui react19）→ 每次以 `pnpm install --lockfile-only` 依當前 `package.json` 重生，`git add` 後 `rebase --continue`。
  - `docs/03-status.md` ×1（最後 docs commit）→ 手動三區段合併：
    1. 最後更新 header：保留 Prisma 的 (49)(48) 摘要，Next 16 重編號為 **(50)** 置頂。
    2. 短期/下一步：保留 Prisma 已完成行，Next 16 整併為一條。
    3. Session History：保留 HEAD 完整表格，把 incoming 的 Next 16 列提到資料列頂部，移除重複 header/列（病態超長行用一支小 python 腳本精準重組，避免 StrReplace 重現巨行的風險）。
- **踩坑（小）**：`next-env.d.ts`（兩 app）在 checkout/build 之間反覆被重生（Next 14 ↔ 16 引號/import 風格），每次 `git restore` 丟棄即可；committed 的 Next 16 單引號版在 CI format job 綠（無需進 `.prettierignore`）。

### 2. 驗證 → merge

- 本地 `pnpm install`（Prisma 7 generate 綠）→ typecheck 8/8 → lint 0 error / 11 既有 warning → build 4/4（web Next 16 Turbopack + Proxy middleware）。
- force-with-lease push → **CI 7/7 綠**（lint/typecheck/test/format/e2e/forge/solhint）→ admin-bypass squash-merge（`94a8da2`，`--delete-branch`）→ post-merge sanity（main install + generate + typecheck 8/8）綠。
- status 收尾 commit `982050c` 直推 main。
- **Next 16 + Prisma 7 兩大遷移現已同在 main。**

### 3. `notifications.id` schema drift 調查（給下一個 chore 的精準脈絡）

下一個 session 的任務。本 session 已查清實況：

- **Schema**（`packages/db/prisma/schema.prisma` L859）：`id String @id @default(uuid()) @db.Uuid` — Prisma `@default(uuid())` 是 **client-side** UUID 生成，不發 DB default。
- **Migration**（`20260527104000_add_notification_model/migration.sql` L6）：`"id" UUID NOT NULL DEFAULT gen_random_uuid()` — DB 帶 **server-side** default（與 schema 意圖不符）。
- **後果**：Prisma 7 `migrate dev` diff schema（無 DB default）vs DB（有 `gen_random_uuid()`）→ 想生成 `ALTER COLUMN id DROP DEFAULT` migration。前幾個 session 都手動還原這個誤生成的 migration（不混入升級 PR）。
- **待決方向**（新 session 拍板）：
  - (a) schema 改 `@default(dbgenerated("gen_random_uuid()"))` 對齊 DB（保留 server-side 生成，raw insert 也安全）；或
  - (b) 寫對齊 migration `ALTER COLUMN "id" DROP DEFAULT` 對齊 schema 的 client-side 意圖。
  - **先查**：drift 是否只在 notifications，還是其他 `@default(uuid())` model 也有 DB-side `gen_random_uuid()`（決定要不要一次性對齊全 repo）。
- **連帶**：`add_kol_admin_note`（`20260527131221`）**checksum drift** — migration.sql 在 apply 後被補上註解（L2-6），檔案 content 變了但 `_prisma_migrations` 存的是舊 checksum → Prisma 7 migrate 會 flag mismatch。對齊方式：`prisma migrate resolve` 或重算 checksum（rule 31 紀律：不可 reset 掉 dev e2e 資料）。

## 產生的 ADR

- 無新 ADR（純執行 rebase + merge，已決策升級）。

## 待後續處理事項

- **`notifications.id` schema drift 獨立 chore**（連帶 `add_kol_admin_note` checksum drift）— 見上方第 3 節。**下一個 session 第一任務**。
- **bufferutil Docker 原生編譯** — pre-existing，與本次無關，獨立排期。
- 一批 Dependabot PR 仍 OPEN（#8/#13/#15 已知 deferred + #21–#27 新小升級）— 不在當前範圍。

## 給未來 AI agent 的建議

- **lockfile 衝突 during rebase**：別手動編輯 `pnpm-lock.yaml`，直接 `pnpm install --lockfile-only` 依 `package.json` 重生再 `git add` 續 rebase，乾淨可靠。
- **病態超長行的衝突檔**（如本 status doc）：StrReplace 重現巨行極易出錯，改用一支只操作衝突區行索引的小腳本重組，安全得多。
- **嚴守「本地綠 ≠ CI 綠」**（上 session 教訓）：本 session 即使本地全綠仍等 CI 7/7 實跑綠才 merge。
- `notifications.id` chore 開工前務必確認 dev DB 連得上（`.env` 的 `DATABASE_URL`），且全程不可 `migrate reset`（會清掉 e2e 資料）。
