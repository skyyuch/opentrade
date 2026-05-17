# Commit #4：`packages/db` 初始化 — 2026-05-17（第三場）

> 本文件歸檔 OpenTrade Commit #4 工作 session 的精華內容。
> 接續 [`2026-05-17-ui-design-and-packages-ui.md`](./2026-05-17-ui-design-and-packages-ui.md)。

## 對話脈絡

- **日期**：2026-05-17（同日傍晚）
- **參與者**：項目負責人（skyyuch）+ Claude Opus 4.7（Cursor agent）
- **背景**：前兩場完成 Commit #1（文件骨架 + Cursor Rules）、Commit #2（Monorepo 骨架）、Commit #3（`packages/ui` 設計系統）。本場主題是 Commit #4 — `packages/db` 初始化（Prisma + 首個 migration，含 Tenant / User / Broker / BrokerLicense 基礎模型）。

---

## 主要討論內容

### 1. 提案 + 微決策定案

我提出 5 task 拆解（t1-t5）並向使用者要 4 個微決策：

| 問題                                                      | 使用者選擇                                 |
| --------------------------------------------------------- | ------------------------------------------ |
| 本機 Postgres 用什麼跑？                                  | **A. docker-compose + Postgres 16-alpine** |
| Migration 是否真的 apply 到本機 DB？                      | **同意**（一開始問「不太懂」，解釋後同意） |
| `User.email` Phase 0 用 `String?` 占位                    | 同意（加密延後到 Commit #5）               |
| `sfcLicenseNumbers` 用 `String[]` 還是正規化              | **正規化** — 獨立 `BrokerLicense` 表       |
| 額外：`Tenant.timezone` + `User.preferredLocale` 是否先放 | 同意（一次到位）                           |

#### 為什麼選 docker-compose 而非本機 brew install

- 與生產 RDS 大版本一致（PG 16）
- 跨 OS 一致（macOS / Linux / Windows WSL）
- 一行 `docker compose up -d postgres` 完成
- 不污染使用者 Mac 全域環境
- 未來可加 LocalStack / Anvil 到同一份 compose 檔

→ 寫成 **ADR-0012**。

#### 為什麼 BrokerLicense 正規化

不只是因為「未來會需要」— 而是**核心信任 signal**：

- 香港有 10 類 SFC 受規管活動，每張牌照都該獨立記
- 牌照吊銷（如駿溢、業界爆雷案）必須**保留歷史 row，只改 status = REVOKED**，散戶才看得到「誰被吊銷過」
- 未來擴監管機構（SG MAS、TW FSC、JP FSA）時，加 enum 值是 non-breaking migration
- 命名空間策略：`Regulator` enum 用 ISO 國碼前綴（`HK_SFC`），`LicenseType` 用 `<REGULATOR>_<TYPE>` 前綴（`HK_SFC_TYPE_1`）

### 2. 過程中的兩個技術轉折

#### 轉折 A：Prisma 7 引入 breaking change → 降回 6.x

執行 t2 時 `pnpm install` 的 postinstall 跑 `prisma generate` 失敗：

```
Error code: P1012
error: The datasource property `url` is no longer supported in schema files.
Move connection URLs for Migrate to `prisma.config.ts` and pass either
`adapter` for a direct database connection or `accelerateUrl` for Accelerate
to the `PrismaClient` constructor.
```

Prisma 7（剛發布）的新 driver-adapter 模式對 Phase 0 過於前沿：

- AI 訓練資料覆蓋 7.x API 不足 → AI 開發效率打折
- 需要額外 `prisma.config.ts` + `@prisma/adapter-pg`
- 文件 / migration 工具 / Prisma Studio 在 7.0-7.8 有已知問題
- Phase 0 沒從中得到任何實質好處

→ 降到 **^6.19.3**，寫 **ADR-0013** 鎖定理由 + 升級觸發條件（Prisma 7.5+ 或 12 個月後重評）。

#### 轉折 B：commitlint 的 `#N` 解析陷阱

t5 commit 時 commitlint 報 `footer-leading-blank` 錯誤。Debug 後發現 conventional-commits-parser 把 body 中的 `Commit #4` 解析成 issue reference 後，會在那行附近插入隱形換行，導致 footer 偵測錯位。

實際上 **rule 70 已警告這點**：

> ❌ 不要在 body 段用 `Commit #N`、`Phase #N` 等 `<word> #<number>` 模式 — Conventional Commits parser 會把它認成 issue reference 並切到 footer，導致 `footer-leading-blank` 規則報錯。

我這次是執行紀律問題（沒先讀規則就寫 commit message），不是規則缺失。**改寫成「Commit number-four」後通過**。

教訓：每次寫 commit message body 前先重溫 rule 70「Commit body 注意事項」段落。

### 3. 完成度自驗

本機 docker container 內 `psql` 確認：

- **4 張表**：`tenants`、`users`、`brokers`、`broker_licenses`
- **5 個 enum**：`UserRole`、`SbtTier`、`Regulator`、`LicenseType`、`LicenseStatus`
- **17 個 index**：PK + unique constraint + tenant-scoped 複合索引
- **4 個 FK**：全部 `ON DELETE RESTRICT ON UPDATE CASCADE`

`pnpm typecheck / lint / format:check` 全綠。

---

## 產生的 ADR

- **ADR-0012**：本機開發環境使用 docker-compose 跑 PostgreSQL（不用 brew / Supabase / migrate diff）
- **ADR-0013**：Pin Prisma 至 ^6.19.3，暫不升 Prisma 7（driver-adapter 模式對 Phase 0 過於前沿）

---

## 完成的 Commit（git 上 4 個）

```
847a540 docs: update status, README, and glossary for Commit #4
23b16b4 feat(db): add init migration for tenant/user/broker/license
44d7899 feat(db): scaffold Prisma with tenant/user/broker schema
f86036a chore(infra): add docker-compose Postgres 16 for local dev
```

對應 Phase 0 路線圖的 **Commit #4：`packages/db` 初始化**。已 push 到 `origin/main`。

---

## 技術決策摘要（給未來 AI agent 快速理解）

### Schema 結構

```
Tenant ──┬── User
         ├── Broker ── BrokerLicense
         └── BrokerLicense (denormalized tenantId)
```

每張 user-scoped 表都有 `tenantId`，**即使能透過 relation 推導**也要保留 — 為了未來 Prisma extension 自動注入 tenant filter（per rule 31）。

### Enum 命名空間策略

```prisma
enum Regulator {
  HK_SFC                  // 未來加 SG_MAS / TW_FSC / JP_FSA 是 non-breaking
}

enum LicenseType {
  HK_SFC_TYPE_1           // 前綴自帶監管機構 + 類型，未來加 SG_MAS_CMS_*
  ...
  HK_SFC_TYPE_10
}
```

避開「沒前綴」陷阱（未來會撞名）。

### env 驗證模組

`packages/db/src/env.ts` 用 zod 驗證 + memoize：

- `prisma generate` / `prisma format` 不需要 DATABASE_URL → memoize 避免這些工具報錯
- 第一次 `getDbEnv()` 才 parse → 生產仍 fail-fast
- 同一個 pattern 之後在 `apps/api` 重用

### PrismaClient 單例

`packages/db/src/client.ts`：

- HMR-safe global 快取（防止 dev reload 耗光連線池）
- `prisma`（rw）+ `prismaReadOnly`（fallback DATABASE_URL）兩個 client
- 全 monorepo **唯一**可以 `new PrismaClient()` 的地方（per rule 31）

### 為何 frontend `import type` 紀律重要

`src/index.ts` 同時 re-export 模型 type **和** enum 值。Enum 值是 runtime（會引入 `@prisma/client` 完整 bundle）。

`tsconfig.base.json` 的 `verbatimModuleSyntax: true` 強制：

- `import { UserRole } from '@opentrade/db'` → 拉 runtime（**只有 apps/api 該這樣寫**）
- `import type { UserRole } from '@opentrade/db'` → 純 type（**前端必須這樣**）

未來 Commit #10 CI 可加 ESLint 規則自動阻止前端 runtime import（目前靠紀律 + tsconfig 警告）。

### Migration 流程

```bash
# 第一次設定
cp .env.example .env
docker compose up -d postgres
pnpm install                          # postinstall 跑 prisma generate

# 開發中改 schema
# 1. 編輯 packages/db/prisma/schema.prisma
# 2. 跑：
pnpm --filter @opentrade/db db:migrate:dev --name verb_noun_detail
# 3. Review 產生的 migration.sql
# 4. Commit schema.prisma + migrations/

# 生產
pnpm --filter @opentrade/db db:migrate:deploy
```

`db:*` 全部走 `dotenv-cli -e ../../.env` 載 root `.env`，因為 Prisma 預設只在 `packages/db/` 內找 `.env`。

---

## 過程中踩到 + 已修復的坑

| #   | 問題                                                                                      | 解法                                                       |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Prisma 7 移除 `datasource.url`                                                            | 降到 6.19.3 + 寫 ADR-0013                                  |
| 2   | ESLint 抱怨 `import type { Prisma } from '@prisma/client'` + 後續 runtime import 群組順序 | type imports 放最後（與 import-x 配置一致）                |
| 3   | client.ts 用 conditional type 試圖正確型別化 log array 結果很醜                           | 改用 `Prisma.LogLevel[]`（Prisma 內建型別）                |
| 4   | commitlint `footer-leading-blank` 報錯 — body 含 `Commit #4`                              | 改寫成 `Commit number-four`（rule 70 已警告）              |
| 5   | Prettier 抓到 docker-compose.yml + 三個 md 檔需要格式化                                   | `pnpm prettier --write` 修，husky lint-staged 後續自動處理 |

---

## 待後續處理事項

### 立即（下個 session）— Commit #5：`apps/api` 初始化

關鍵任務：

1. **Hono + DDD 三層骨架**：`src/domains/`（reviews / brokers / kols / disputes / identity / signals）+ `src/shared/`（events / auth / observability / chain）+ `src/http/`（server / middleware / routes）
2. **連 `@opentrade/db`**：透過 `import { prisma } from '@opentrade/db'`（apps/api 是唯一可以 runtime import 的）
3. **`/v1/health` endpoint**：真實連 DB 確認可用（`prisma.$queryRaw\`SELECT 1\``)
4. **`OutboxEvent` 表**：補進 schema + 跑新 migration（為 ADR-0006 outbox pattern 鋪路）
5. **`Tenant` seed**：V1 唯一 `code = "hk"` row，冪等 seed script
6. **env 模組擴大**：`apps/api/src/shared/env.ts` 加 `JWT_SECRET`、`CORS_ORIGIN`、`SERVER_PORT` 等
7. **觀察性骨架**：Pino logger + request-id middleware

預估 6-8 個 t-tasks，與本 session 規模相當。

### 短期（後續 Phase 0 commits，按依賴順序）

3. **Commit #6**：`apps/web` Next.js 14 + next-intl + 用 `packages/ui` 元件
4. **Commit #7**：`apps/console` Next.js 14（dark default）
5. **Commit #8**：`packages/contracts` Foundry init + OpenZeppelin（**僅骨架**，業務合約 Phase 1+）
6. **Commit #9**：`infra/terraform` VPC + RDS + ECS Fargate + S3 + Secrets Manager
7. **Commit #10**：GitHub Actions CI（lint + typecheck + test + migrate + 排除 Prisma 7 自動升級）

### 跨 commit 持續累積

- Prisma extension 自動注入 `tenantId` filter（Commit #5 後段）
- Prisma extension 自動過濾 `deletedAt: null`（同上）
- ESLint 規則阻止前端 runtime import `@opentrade/db`（Commit #10）
- `_prisma_migrations` 表的 production 部署紀律（Commit #9-10）

---

## 給未來 AI agent 的建議

### 一定要記得的事

1. **Prisma 至少維持在 ^6.19.3**，不可隨意升 7.x（ADR-0013；下次升級要寫新 ADR）
2. **schema 變更 = 跑新 migration**，**永遠不要手改** `prisma/migrations/*.sql`（per rule 31）
3. **每張新 user-scoped 表都要有 `tenantId`** + 三件套（`createdAt` / `updatedAt` / `deletedAt`）
4. **每張表都要有 `@@map("snake_case")`** 對應 PostgreSQL 慣例
5. **新 enum 值用 `<REGULATOR>_<TYPE>` 前綴**（如 `SG_MAS_CMS`），避免跨監管命名衝突
6. **`apps/api` 是唯一可以 runtime import `@opentrade/db` 的**；前端只能 `import type`
7. **每次寫 migration 後要實際 apply** 到本機 docker DB 驗證（不要只 generate SQL 就 commit）

### 寫 commit message 注意

- **body 內出現 `#N`（如 `Commit #4`、`PR #12`）會觸發 commitlint parser 陷阱** — 已寫進 rule 70；改用 `Commit number-four` / `the next commit` / `commit #5` 改寫法（行首才會被當 comment）
- **避免 `Token: value` 格式**在 body（會被當 footer trailer）
- 範例：
  - ❌ `Refs ADR-0006` 寫在 commit body 段裡（會被 strip）
  - ✅ `References ADR-0006 and ADR-0012`（自然語句）
  - ✅ 真的要 trailer 就放最末段並前面空一行

### 本機 dev 起手

```bash
docker compose up -d postgres     # 起 Postgres 16
pnpm install                       # 自動 prisma generate
pnpm --filter @opentrade/db db:migrate:status     # 看 migration 狀態
pnpm typecheck && pnpm lint        # 確認綠
```

### 智能合約何時做

- **Phase 0 Commit #8**：`packages/contracts` 僅初始化（Foundry + OpenZeppelin + Hello World 合約 + Forge test）
- **Phase 1+**：真正的業務合約 — `ReviewRegistry` / `BrokerSBT` / `ReviewerSBT` / `SignalLogger` / `JuryPool` / `DisputeArbitration` 等
- **Mainnet 前必須第三方 audit**（per ADR-0001 + rule 41）

排在後面**不是優先級低**，是因為：

1. Foundry 是獨立 toolchain，不阻塞前端 / API
2. 合約 audit 成本高（HK$50-200k）— 等 CCMF 基金到位再做
3. apps/web Phase 0 用 mock 鏈互動即可開發 UI

---

## 連結

- ADR-0012: [`docs/decisions/0012-local-dev-docker-postgres.md`](../decisions/0012-local-dev-docker-postgres.md)
- ADR-0013: [`docs/decisions/0013-pin-prisma-6-not-7.md`](../decisions/0013-pin-prisma-6-not-7.md)
- packages/db README: [`packages/db/README.md`](../../packages/db/README.md)
- 上一場 session: [`2026-05-17-ui-design-and-packages-ui.md`](./2026-05-17-ui-design-and-packages-ui.md)
- 當前狀態: [`docs/03-status.md`](../03-status.md)
- GitHub: [skyyuch/opentrade@847a540](https://github.com/skyyuch/opentrade/commit/847a540)
