# ADR-0012: 本機開發環境使用 docker-compose 跑 PostgreSQL

## Status

Accepted

## Date

2026-05-17

## Context

Commit #4 開始引入 `packages/db`（Prisma + PostgreSQL）。在這之前，monorepo 沒有任何
runtime 服務依賴 — 所有 commit 都能在純 Node 環境下跑通 `pnpm lint / typecheck / build`。

`packages/db` 改變這個前提：

- Prisma 的標準工作流 `prisma migrate dev` **必須**有一台可寫的 Postgres 才能：
  - 驗證新 schema 沒有語法錯誤
  - 偵測 schema drift（本機 DB 狀態 vs schema.prisma 不一致時警告）
  - 產生回放式 migration SQL
- 之後 Commit #5（`apps/api`）的健康檢查、Commit #6（`apps/web`）透過 API 取資料、
  Phase 1 的 e2e 測試 — 全部需要一台運作中的 Postgres
- 生產環境（per ADR-0002）使用 **AWS RDS PostgreSQL 16 Multi-AZ + Read Replica**，
  本機 dev 也應該對齊大版本，避免「dev pass / prod 壞」的版本陷阱

我們需要一個方式讓開發者：

1. 在 macOS / Linux / Windows WSL 上**一鍵**起 Postgres
2. **版本**鎖死與 prod 同（Postgres 16）
3. **資料**在 `docker compose down` 後保留，重新 `up` 還在
4. **不污染**開發者全域環境（不要叫他們 `brew install postgresql@16`）
5. **預設認證**統一，新人 onboarding 不必到處問密碼

未做這個決定的後果：每個貢獻者各自裝不同版本的 Postgres，schema migration 在某人本機過但
別人本機掛掉，浪費大量除錯時間。

## Decision

採用 **docker-compose（V2 plugin）+ Postgres 16-alpine 官方映像** 作為本機 dev 環境的 Postgres 來源。

### 主要選擇

- **檔案**：`docker-compose.yml` 放 repo 根目錄
- **服務命名**：`postgres`（容器名 `opentrade-postgres`）
- **映像**：`postgres:16-alpine`（與 RDS 大版本一致；alpine 變體節省空間）
- **資料持久化**：named volume `opentrade-db-data`（不用 bind mount，避免 macOS 權限問題）
- **健康檢查**：內建 `pg_isready` 健康檢查（`prisma migrate dev` 在執行前可確認 DB 已就緒）
- **連線**：`postgresql://opentrade:opentrade_dev_password@localhost:5432/opentrade_dev`
- **時區**：容器內 UTC，應用層格式化用 tenant 時區（per `Tenant.timezone` 欄位）

### 暫不加入的服務

下列服務目前不放進 `docker-compose.yml`，未來必要時再加並更新本 ADR：

- LocalStack（SQS / S3 / Secrets Manager 模擬）— Phase 1 後段才需要
- Redis / 訊息佇列 — V1 沒用 Redis
- Anvil（Foundry 本機鏈）— `packages/contracts` 自己有 foundry 工作流
- IPFS 節點 — 我們用 Pinata 託管，不在本機跑

### 環境變數

`DATABASE_URL` 寫進 `.env.example`，開發者複製到 gitignored `.env`。生產環境的
`DATABASE_URL` 走 AWS Secrets Manager，永遠不進 git。

### 不使用的替代做法（避免歧義）

- ❌ 不用 Docker Compose v1（`docker-compose` 已 deprecated；只用 `docker compose` v2 plugin）
- ❌ 不寫 `version: '3.x'` 開頭（Compose v2 規範已不需要）
- ❌ 不在 docker-compose.yml 內 hardcode 密碼以外的 secret

## Alternatives Considered

### Alternative A: 開發者自行 `brew install postgresql@16`

- **Pros**：少一層抽象，連線最快
- **Cons**：
  - 版本管理痛苦（brew 升級可能升到 17）
  - 多個專案共用同一台 Postgres 容易污染
  - Windows 開發者完全不適用
  - 新人 onboarding 多一步
- **結論**：不選

### Alternative B: 用 Supabase / Neon 等雲端 dev DB

- **Pros**：零本機安裝
- **Cons**：
  - 需要網路才能 dev
  - 多開發者共用會互踩 schema
  - 偏離「ADR-0002 AWS 唯一雲」原則
  - 對 PII 風險未明（dev DB 也可能有測試資料外洩）
- **結論**：不選

### Alternative C: 用 Prisma `migrate diff` 純產生 SQL，不跑 DB

- **Pros**：完全不需 runtime 服務
- **Cons**：
  - 失去 `prisma migrate dev` 的互動式 prompt
  - 失去 drift detection（本機改了 DB 沒同步 schema 不會被發現）
  - 後續 `apps/api` 健康檢查、e2e 測試還是要起 DB → 早晚要做
- **結論**：不選

### Alternative D（採用）: docker-compose + Postgres 16-alpine

- 完美對齊 ADR-0002 的 RDS 版本
- 跨 OS 一致
- 一行指令 `docker compose up -d postgres` 完成
- 後續可加 LocalStack / Anvil 等到同一份 `docker-compose.yml`

## Consequences

### Positive

- 任何貢獻者 `git clone` + `docker compose up -d postgres` + `pnpm db:migrate:dev` 就能起 dev DB
- 與生產環境 Postgres 大版本對齊，減少版本相關 bug
- `.env.example` 統一連線參數，省下「我這邊密碼是什麼？」的問答
- 未來加更多本機 dev 服務（LocalStack / Anvil）有固定的擴充點
- CI 跑整合測試時可同樣用此 `docker-compose.yml` 起 Postgres（或 GitHub Actions service container）

### Negative / Trade-offs

- **依賴 Docker Desktop**：開發者必須先裝 Docker Desktop（macOS / Windows）或 Docker Engine（Linux）
- **資源消耗**：Docker Desktop 本身佔 2-4 GB 記憶體
- **macOS file IO**：alpine 映像 + named volume 已優化，但仍比原生慢一點點
- 新人 onboarding 多一條「安裝 Docker」前置條件 — 需在 README 與 `docs/03-status.md` 環境基準明列

### Neutral

- 本機 Postgres 與 prod RDS 設定仍有差異（RDS 的 Multi-AZ、Read Replica、WAL 設定等本機無法完全模擬）— 這是必然，不影響開發
- 未來若監管要求「dev 環境必須在 AWS」可以加 staging 帳號做替代，但本機 dev 仍保留此方案

## Implementation Notes

### 啟動順序

```bash
# 一次性
cp .env.example .env

# 每次 dev
docker compose up -d postgres
docker compose ps                # 等到 postgres healthy
pnpm db:migrate:dev              # Apply 任何未跑的 migrations
pnpm dev                         # 起前端 / API（後續 commit 才有）
```

### 關閉與清理

```bash
docker compose down              # 停服務，資料保留
docker compose down -v           # 停服務，並 wipe 整個 volume（重置 DB）
docker volume ls | grep opentrade-db-data
```

### 給 CI 的提示（Commit #10 GitHub Actions）

GitHub Actions 用 service container 起 Postgres，**不直接複用** `docker-compose.yml`
（CI 環境的網路 / 健康檢查機制不同），但兩者要保持版本一致。

### 嚴禁事項

- ❌ `docker-compose.yml` 內任何「prod 預設值」（密碼僅 dev 用）
- ❌ Commit 進 `.env`（gitignore 已封死，但要警覺）
- ❌ 把 `docker-compose.yml` 拿去當 prod 部署（prod 走 Terraform → RDS）
- ❌ 升級 Postgres 大版本不寫 ADR（小版本 docker tag 可自動跟）

## References

- ADR-0002: AWS Stack（RDS Postgres 16）
- ADR-0006: DDD + Modular Monolith（`apps/api` 為唯一 DB 消費者）
- `.cursor/rules/31-database-prisma.mdc`
- `docker-compose.yml`
- `.env.example`
- [PostgreSQL Docker official image](https://hub.docker.com/_/postgres)
- [Prisma migrate dev docs](https://www.prisma.io/docs/orm/prisma-migrate)
