# Prisma 7 開 PR + 抓修 2 個 CI bug + merge — 2026-06-04

> 本文件歸檔 OpenTrade「Prisma 7 升級收尾」session 的精華內容。
> 接續前一 session（branch `chore/prisma-7-upgrade` 已備齊 4 commit、本地全綠，但 PR 未開）。

## 對話脈絡

- **日期**：2026-06-04
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.8
- **背景**：ADR-0041（Prisma 6 → 7，supersedes ADR-0013）的 branch 已就緒、本地驗證綠，唯 PR 未開。本 session 任務 = 開 PR → merge。過程中 CI 暴露兩個本地環境掩蓋的真實 bug。

## 主要討論內容

### 1. 開 PR #20

- `gh pr create`，base `main` ← `chore/prisma-7-upgrade`。
- 描述涵蓋 4 commit（`76c70c1` 核心遷移 / `a7fb0d7` seed / `1c2d9b7` build+Docker / `6b44885` docs）+ 2 個 deferred 註記：`notifications.id` schema drift、bufferutil Docker 原生編譯。

### 2. merge ordering 評估（user 授權由 agent 判斷）

- PR #20（Prisma 7，後端 `packages/db`+`apps/api`）vs PR #19（Next 16，前端 `apps/web`+`apps/console`）。
- 結論：**Prisma 7 先 merge**。理由：衝突面僅 `pnpm-lock.yaml` + `docs/03-status.md`（機械性、與順序無關）；前端不接觸 DB，Prisma 7 對 Next 16 rebase 近乎零影響；讓 blast radius 更大的 Next 16 最後落地；Prisma 7 上 main 也解鎖後續 `notifications.id` chore。

### 3. CI 全紅 → 抓修 2 個 CI-only bug（核心教訓）

首次 CI run：`lint/format/typecheck/test/e2e` 全在 ~30s fail，`forge` pass。模式指向**共同前置步驟（install）失敗**。

- **Bug 1（`66d846c`）`prisma.config.ts` eager env throw**
  - 根因：Prisma 7 用 `env('DATABASE_URL')`（from `prisma/config`）在 config **載入時** eager 求值。CI 無 `.env` → `dotenv` 載不到 → throw `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL` → `packages/db` 的 `postinstall: prisma generate` 掛 → `pnpm install --frozen-lockfile` 失敗 → 全 JS job 連帶 fail。
  - 修法：`process.env['DATABASE_URL'] ?? 'postgresql://placeholder:...'`。schema-only 指令（generate/format/postinstall）不需連 DB 即可運作；真正連線的 migrate/studio 仍透過 `dotenv -e ../../.env --` package script 載真值；若 prod 真的缺 URL 會在 connect 時 loud fail，不會 silent 用 placeholder。
  - 連帶價值：同時修好 Docker builder stage + 任何新 clone（無 `.env`）的 `pnpm install`。
  - 並刷新 `ci.yml` install step 的過時註解（原引用 Prisma 6 的 `src/env.ts` lazy loader 機制）。

- **Bug 2（`e2fac19`）生成 client 未排除於 prettier**
  - 根因：Bug 1 修好後 `prisma generate` 成功，生成 client 落到 `packages/db/src/generated/prisma/**`，被根 `format:check` 的 glob `**/*.{ts,...}` 掃到 → 未格式化的生成碼讓 format job fail。（eslint 早已忽略該目錄，prettier 沒有。）
  - 修法：`.prettierignore` 加 `packages/db/src/generated/`。遷移時加了 `src/generated/.gitignore` 與 `.dockerignore`，唯獨漏了 `.prettierignore`。

- CI 7/7 綠後 **admin-bypass squash-merge**（squash `10b6f69`，`--delete-branch`）；post-merge sanity（main `db:generate` + api typecheck）綠。

## 產生的 ADR

- 無新 ADR（兩個 CI fix 屬 ADR-0041 範圍內的 bug 修復）。
- 規則更新：rule 31 補「`prisma.config.ts` 須容忍缺 `DATABASE_URL`」「生成檔須進 `.prettierignore`」契約 + 2 條防回歸嚴禁（rule 99）。

## 待後續處理事項

- **PR #19 Next 16**：仍 OPEN。下一步 `git rebase origin/main` 解 `pnpm-lock.yaml` + `docs/03-status.md` 衝突 → 重跑 CI → merge。
- **`notifications.id` schema drift 獨立 chore**：連帶 `add_kol_admin_note` checksum drift；Prisma 7 已上 main 可隨時開。
- **bufferutil Docker 原生編譯**：pre-existing，與 Prisma 無關，獨立排期。

## 給未來 AI agent 的建議

- **「本地綠」≠「CI 綠」**：遷移碰到 env / 生成檔 / install hook 時，本地存在的 `.env` 與既存生成目錄會掩蓋破口。交接「全套驗證綠」的 branch，**開 PR 後務必看 CI 實跑結果再 merge**，別只信本地。
- Prisma 7 config 任何改動，先想「沒有 `.env` 的環境（CI / Docker / 新 clone）跑得起來嗎？」
- 新增會生成到 source tree 的 artefact，三件套要同步：`.gitignore` + `.dockerignore` + `.prettierignore`（必要時 eslint ignore）。
