# Commit number-five：`apps/api` 初始化 — 2026-05-17（第四場）

> 本文件歸檔 OpenTrade Commit number-five 工作 session 的精華內容。
> 接續 [`2026-05-17-commit-4-packages-db.md`](./2026-05-17-commit-4-packages-db.md)。

## 對話脈絡

- **日期**：2026-05-17（同日晚間）
- **參與者**：項目負責人（skyyuch）+ Claude Opus 4.7（Cursor agent）
- **背景**：前三場完成 Commits #1 / #2 / #3 / #4（文件骨架、Monorepo、`packages/ui` 設計系統、`packages/db` Prisma + 首個 migration）。本場主題是 Commit number-five — `apps/api` 從零到「Hono server + 完整 DDD 樣板 + `/v1/health` 真實打 DB + 生產 bundle 跑通」。

---

## 主要討論內容

### 1. 開場拆解 + 三個微決策

我提出 8 個原子任務（t1-t8），並向使用者拍板三個微決策：

| 問題                                          | 使用者選擇                                 |
| --------------------------------------------- | ------------------------------------------ |
| API server port？                             | **4000**（避開 web 3000 / console 3001）   |
| `shared/env.ts` 啟動策略：fail-fast vs lazy？ | **fail-fast on import**（API 啟動必連 DB） |
| `OutboxEvent` 是否要 `tenantId`？             | **要** + 三條複合索引                      |

使用者簡單回「同意」即拍板，省下 push-back 時間。

### 2. 任務拆解的核心 8 commit

| t   | Commit                                                      | Notes                                                                   |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| t1  | `chore(api): add hono, pino, zod and dev tooling deps`      | hono 4.12 / @hono/node-server / @hono/zod-validator / pino / tsx / tsup |
| t2  | `feat(api): add zod env, pino logger and AppError`          | env fail-fast、Pino + PII redact、AppError + ErrorCode const-object     |
| t3  | `feat(api): scaffold hono server with request-id, cors...`  | server.ts + main.ts + middleware；空 routes，server 已能跑 + 404 包裹   |
| t4  | `feat(db): add outbox_events table for ddd cross-domain`    | OutboxEvent + 3 indices + FK，apply migration 到本機 DB                 |
| t5  | `feat(db): add idempotent hk tenant seed`                   | scripts/seed.ts + db:seed script，雙跑驗證單 row                        |
| t6  | `feat(api): add v1 health endpoint with ddd four-layer`     | health 四層完整樣板，端到端跑通                                         |
| t7  | `feat(api): wire tsup production build and update run docs` | tsup config + 生產 bundle 15kB + README                                 |
| t8  | `docs: update status and adr after commit number-five`      | docs/03-status + ADR-0014 + 歸檔                                        |

每個 commit 都單獨通過 typecheck / lint / format。

### 3. 過程中的三個技術轉折

#### 轉折 A：`apps/api/tsconfig.json` 的 composite project references 壞了跨包 import

t6 寫完 `domains/health/infrastructure/PrismaHealthRepository.ts`（runtime import `prisma` from `@opentrade/db`）後 typecheck 報：

```
src/domains/health/presentation/routes.ts: error TS6305: Output file
'/Users/skyyu/Desktop/OpenTrade/packages/db/dist/src/index.d.ts'
has not been built from source file '.../packages/db/src/index.ts'.
```

原因：`apps/api/tsconfig.json` 內有 `references: [{ path: '../../packages/db' }]`，而 `packages/db` 是 `composite: true`。Composite project reference 要求被引用方先 build 出 `dist/*.d.ts`，但我們從 day 1 就是 `main: "./src/index.ts"` 直消費 TS source。

**修法**：移除 `apps/api/tsconfig.json` 的 `references`。型別解析改走 pnpm node_modules symlink → `@opentrade/db/package.json` 的 `main` → `./src/index.ts`。Composite references 在「shared compiled libraries」場景才合適，monorepo 直消費 source 場景反而是累贅。

#### 轉折 B：bundling 後 `node dist/main.js` 找不到 `./client.js`

t7 跑 `pnpm --filter @opentrade/api build` 成功產出 15 kB 的 `dist/main.js`，但 `node dist/main.js` 立刻噴：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/Users/skyyu/Desktop/OpenTrade/packages/db/src/client.js'
imported from .../packages/db/src/index.ts
```

原因：tsup externalize 了 `@opentrade/db`，runtime 直接從 `packages/db/src/index.ts` 讀，而該檔用 ESM-correct 的 `.js` import specifier（`import './client.js'`）。tsx / esbuild 認得這種 specifier、自動找 `.ts`；plain Node 不認。

**修法**：tsup config 改為 `noExternal: [/^@opentrade\//]`，把 workspace 包整個 inline 進 bundle。連帶 `@prisma/client` 必須 external（其 native engine binary path 不能被 bundler 移）。

#### 轉折 C：bundle 後找不到 `@prisma/client`

修完 B 之後重跑 `node dist/main.js`：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@prisma/client'
imported from .../apps/api/dist/main.js
```

原因：pnpm strict node_modules 不 hoist `@prisma/client` 到 `apps/api/node_modules`（只在 `packages/db/node_modules` 內）。bundle 後 `dist/main.js` 含 literal `import '@prisma/client'`，從 apps/api 的位置解析失敗。

**修法**：把 `@prisma/client` 加進 `apps/api/package.json` 的 `dependencies`。**這不違反 rule 31** —— rule 的精神是「source 層只能透過 `@opentrade/db` facade」，而我們所有 `apps/api/src/**` 檔案還是 `import { prisma } from '@opentrade/db'`，純粹是 runtime resolution 需要這個 sibling 安裝。

這三個轉折合起來寫進 **ADR-0014**。

### 4. 完成度自驗

```bash
# Dev 模式
pnpm --filter @opentrade/api dev
curl http://localhost:4000/v1/health
# → 200 OK
# → {"status":"OK","uptimeSeconds":2,"checkedAt":"...","dependencies":[{"name":"database","status":"OK","latencyMs":18}]}
# → 有 X-Request-Id 標頭

curl http://localhost:4000/v1/nope
# → 404
# → {"error":{"code":"NOT_FOUND","message":"Route GET /v1/nope not found","requestId":"..."}}

# CORS preflight from allowed origin
curl -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" http://localhost:4000/v1/health
# → 204 + 完整 Access-Control-* headers

# Production-style boot
pnpm --filter @opentrade/api build
NODE_ENV=production node apps/api/dist/main.js
# → 純 JSON pino log（無顏色 / 無 pretty）
# → /v1/health 200 OK
# → SIGTERM 後 graceful shutdown
```

全包 `pnpm typecheck / lint / format:check` 全綠。

---

## 產生的 ADR

- **ADR-0014**：apps/api 運行架構（env fail-fast、tsup bundling 規則、`@prisma/client` 在 apps/api 為何要直接依賴）

---

## 完成的 Commit（git 上 9 個）

```
[尚待 push] docs: update status and adr after commit number-five
9fe8f10 feat(api): wire tsup production build and update run docs
2698ad0 feat(api): add v1 health endpoint with ddd four-layer skeleton
8aec2b2 feat(db): add idempotent hk tenant seed
2a5443c feat(db): add outbox_events table for ddd cross-domain events
842664d feat(api): scaffold hono server with request-id, cors and error envelope
15a90a9 feat(api): add zod env, pino logger and AppError primitives
fa06191 chore(api): add hono, pino, zod and dev tooling deps
```

對應 Phase 0 路線圖的 **Commit number-five：`apps/api` 初始化**。

---

## 技術決策摘要（給未來 AI agent 快速理解）

### apps/api 目錄四層 DDD 樣板（health 為 reference）

```
apps/api/src/
├── main.ts                         # 入口：建立 server、bind、SIGTERM 處理
├── http/                           # 跨 domain HTTP plumbing
│   ├── server.ts                   # createServer() factory，middleware 鏈
│   ├── types.ts                    # AppHonoEnv (Variables: requestId, logger)
│   └── middleware/
│       ├── requestContext.ts       # hono/request-id + Pino child logger
│       └── errorHandler.ts         # AppError / HTTPException / ZodError / unknown 四路統一封包
├── shared/                         # 跨 domain infrastructure（per ADR-0006）
│   ├── env.ts                      # fail-fast on import（per ADR-0014）
│   ├── errors/                     # AppError class + ErrorCode const-object union
│   └── observability/
│       └── logger.ts               # Pino root + createRequestLogger child factory
└── domains/                        # 每個業務 domain 一個資料夾
    └── health/                     # 樣板：reviews/brokers/kols/disputes/identity/signals 比照
        ├── domain/                 # VO + Repository interface（零框架 import）
        ├── application/            # Use case（依賴 interface 不依賴 Prisma）
        ├── infrastructure/         # PrismaHealthRepository（唯一碰 @opentrade/db 的層）
        ├── presentation/           # routes + DTO + mapper
        │   ├── routes.ts           # composition root：實例化 repo + use case + 寫 GET
        │   ├── dto/
        │   │   └── HealthReportDto.ts
        │   └── mappers.ts          # Domain → DTO
        └── index.ts                # 唯一對外 export 是 healthRouter
```

### Error envelope（rule 30 強制）

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /v1/nope not found",
    "details": { "...": "..." },
    "requestId": "f1c8..."
  }
}
```

前端用 `error.code` 做 i18n lookup；`error.message` 純後端 log 用。

### env 載入：fail-fast vs lazy memoize

| Package       | 策略                          | 為何                                                                                     |
| ------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/db` | Lazy memoise via `getDbEnv()` | `prisma generate / format` 不需 DATABASE_URL，importing module 就 throw 會壞 CLI tooling |
| `apps/api`    | Fail-fast on import           | 沒有 CLI tooling import path；env 壞了就應該 crash 在 bind port 之前                     |

未來其他 service 預設**比照 apps/api fail-fast 模式**，除非有 Prisma 那種 tooling-import 情境。

### tsup bundle 策略

```ts
external: ['@prisma/client', '.prisma/client', 'pino-pretty'],
noExternal: [/^@opentrade\//],
```

- workspace 包 **inline**（避免 `.js` specifier 在 Node 解析失敗）
- `@prisma/client` external（native engine binary 不能被 bundler 移）
- `pino-pretty` external（dev-only，不上 prod）

Commit number-nine 的 Dockerfile 必須 copy `node_modules/.pnpm/@prisma+client@*` + `.prisma/client` 到 dist 旁邊。

### OutboxEvent 表 schema

```prisma
model OutboxEvent {
  id            String    @id @default(uuid()) @db.Uuid
  tenantId      String    @db.Uuid                // per rule 31，多租戶 ready
  aggregateType String                             // "review", "kol_signal", ...
  aggregateId   String    @db.Uuid                 // 不設 FK（aggregate-agnostic）
  eventType     String                             // "review.submitted", ...
  payload       Json                               // 不含 PII！（per rule 50）
  attempts      Int       @default(0)
  lastError     String?   @db.Text
  createdAt     DateTime  @default(now())
  processedAt   DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([processedAt, createdAt])               // worker dequeue（oldest pending first）
  @@index([tenantId, processedAt])                // tenant-scoped pending
  @@index([tenantId, aggregateType, aggregateId]) // 法庭式回溯：「aggregate X 發過什麼 event？」
  @@map("outbox_events")
}
```

Phase 1 寫 worker 時：

- Use case 透過 `prisma.$transaction([业務写入, outbox.create])` 原子寫入
- 背景 worker 走 `SELECT ... WHERE processedAt IS NULL ORDER BY createdAt LIMIT N FOR UPDATE SKIP LOCKED`
- 處理成功 → set `processedAt = now()`
- 處理失敗 → `attempts += 1`, set `lastError`, 重新進佇列（exponential backoff）
- 7 天後 cron job 真的 DELETE 已處理的（per rule 31「outbox 是 soft-delete 規則的例外」）

---

## 過程中踩到 + 已修復的坑

| #   | 問題                                                                                 | 解法                                                                                   |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | `apps/api/tsconfig.json` 的 composite `references` 要求 packages/db 先 build 出 dist | 移除 references；型別解析改走 node_modules symlink + main field 直消費 TS source       |
| 2   | tsup externalize `@opentrade/db` 後 dist 在 Node 跑爆 (`.js` specifier 找不到)       | `noExternal: [/^@opentrade\//]` inline workspace 包；ADR-0014 寫入                     |
| 3   | bundle 後 `@prisma/client` resolve 失敗（pnpm 只 hoist 到 packages/db/node_modules） | apps/api/package.json 加 `@prisma/client` direct dep；不違反 rule 31 source-level 紀律 |
| 4   | ESLint type-aware 找不到 `scripts/seed.ts` / `tsup.config.ts`                        | tsconfig 把 `rootDir` 從 `./src` 改成 `.` + `include` 加路徑（與 packages/ui 一致）    |
| 5   | errorHandler.ts no-unnecessary-condition warning（`c.get('logger') ?? rootLogger`）  | onError 可能在 middleware run 之前觸發；用 widening cast `as Logger \| undefined` 明示 |
| 6   | main.ts import order 錯了                                                            | 排成 external → internal → relative；alphabetical within group                         |

---

## 待後續處理事項

### 立即（下個 session）— Commit number-six：`apps/web` 初始化

關鍵任務（預估 6-8 個 t-tasks）：

1. **Next.js 14 App Router + TypeScript**（root layout、（locale）routing）
2. **next-intl 三語**（zh-Hant 預設、zh-Hans、en），含 `app/[locale]/...` 結構
3. **Tailwind + 接 `packages/ui` 的 design tokens**（透過 preset extend）
4. **`<ImmutableMark>` + `<Button>` 在 Storybook 之外的第一次真實使用**
5. **status page**（`/status`）對接 `apps/api` 的 `/v1/health`，驗證跨包通訊
6. **環境變數**：`NEXT_PUBLIC_API_URL=http://localhost:4000`（per rule 50 `NEXT_PUBLIC_` 前綴）
7. **dev script**：`pnpm --filter @opentrade/web dev` 起 http://localhost:3000
8. **跑通 + Storybook 還在綠 + 全包 typecheck/lint 全綠**

### 短期（後續 Phase 0 commits，按依賴順序）

1. **Commit number-seven**：`apps/console` Next.js 14（dark default + dashboard 風格）
2. **Commit number-eight**：`packages/contracts` Foundry init + OpenZeppelin（**僅骨架**，業務合約 Phase 1+）
3. **Commit number-nine**：`infra/terraform` VPC + RDS + ECS Fargate + S3 + Secrets Manager；**同時** 補 `apps/api/Dockerfile`（per ADR-0014 implementation notes）
4. **Commit number-ten**：GitHub Actions CI（lint + typecheck + test + migrate + 排除 Prisma 7 自動升級 + ESLint 規則阻止前端 runtime import `@opentrade/db`）

---

## 給未來 AI agent 的建議

### 一定要記得的事

1. **新增 domain 時嚴格比照 `domains/health/` 的四層結構** — 這是 reference template，不可省略任何一層
2. **Use case 構造器只能接 interfaces**（不接 Prisma 具體類）— 不然測試會難寫
3. **所有跨 domain 通訊用 OutboxEvent**（per ADR-0006）— 不可直接呼叫他人 use case
4. **error 用 `AppError`，不用 `throw new Error()`** — 不然 errorHandler 只能回 500 INTERNAL_ERROR
5. **新 API endpoint 永遠 `/v1/...` 起頭**（per rule 30）
6. **Output 永遠走 mapper → DTO**，不可直接回 domain entity
7. **新增 env key 必走 `src/shared/env.ts` 的 zod schema**，不可散落 `process.env.X`
8. **新增 domain 路由要在 `http/server.ts` 的 `app.route('/v1/...')` 明確 mount**

### 修改 apps/api 時要避開的坑

- **不要把 `apps/api/tsconfig.json` 的 references 加回去**（per ADR-0014 + 上面坑 #1）
- **不要 import `@prisma/client` 在 `apps/api/src/**`的任何檔案**（破壞 rule 31 source-level facade）— 必須`import { prisma } from '@opentrade/db'`
- **不要把 workspace 包改成 `external: true` 在 tsup config**（per ADR-0014 + 上面坑 #2）
- **不要把 `JWT_SECRET` 降到 < 32 chars**（會 fail-fast crash）

### 啟動順序（local dev）

```bash
docker compose up -d postgres                                    # 起 DB
pnpm install                                                     # 安裝 + prisma generate
pnpm --filter @opentrade/db db:migrate:dev                       # apply migrations
pnpm --filter @opentrade/db db:seed                              # hk Tenant
pnpm --filter @opentrade/api dev                                 # http://localhost:4000
curl http://localhost:4000/v1/health                             # 預期 200 OK
```

### 生產 build smoke test（任何 dist/ 改動後跑）

```bash
pnpm --filter @opentrade/api build                               # tsup → dist/main.js
NODE_ENV=production JWT_SECRET=$(openssl rand -base64 24) \
  DATABASE_URL='postgresql://...' \
  node apps/api/dist/main.js                                    # 純 JSON log + 真實 endpoint
```

---

## 連結

- ADR-0014: [`docs/decisions/0014-api-runtime-architecture.md`](../decisions/0014-api-runtime-architecture.md)
- apps/api README: [`apps/api/README.md`](../../apps/api/README.md)
- 上一場 session: [`2026-05-17-commit-4-packages-db.md`](./2026-05-17-commit-4-packages-db.md)
- 當前狀態: [`docs/03-status.md`](../03-status.md)
