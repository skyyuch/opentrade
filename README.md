# OpenTrade

> 香港金融服務的去中心化評論平台 · A Web3 Review Platform for Hong Kong Financial Services

[![Phase](https://img.shields.io/badge/phase-0_foundation-blue)]()
[![Status](https://img.shields.io/badge/status-pre--MVP-orange)]()
[![License](https://img.shields.io/badge/license-TBD-lightgrey)]()

---

## 這是什麼

OpenTrade 是一個基於 Web 3.0 區塊鏈技術的金融服務評論平台，初期聚焦香港市場：

- **持牌證券商**的真實使用體驗評論
- **財經 KOL（財演）** 的策略訊號鏈上認證
- **技術指標賣家**的歷史業績不可篡改紀錄
- 用戶投訴的**去中心化陪審團仲裁**機制

我們解決什麼問題：傳統評論平台（如外匯天眼）依賴中心化評分機制，可能存在「收費刪負評」、「廣告位影響排名」等問題。OpenTrade 把評論寫在區塊鏈上 —— **平台無法刪除、無法竄改、無法收錢洗白**。

---

## 對 AI / 開發者

> ⚠️ **如果你是 AI agent**：請先閱讀 [`AGENTS.md`](./AGENTS.md)，這是進入本專案的必讀文件。

> ⚠️ **如果你是新加入的開發者**：請依序閱讀
>
> 1. [`AGENTS.md`](./AGENTS.md) — 工作流程與紅線
> 2. [`docs/00-vision.md`](./docs/00-vision.md) — 產品願景
> 3. [`docs/01-architecture.md`](./docs/01-architecture.md) — 技術架構
> 4. [`docs/03-status.md`](./docs/03-status.md) — 當前狀態

---

## 技術棧概覽

```
Frontend:     Next.js 14 + TypeScript + Tailwind + shadcn/ui + next-intl (zh-Hant / zh-Hans / en)
Web3:         wagmi v2 + viem + Privy (Account Abstraction)
Backend:      Hono on Node.js (Hexagonal / DDD architecture)
Database:     PostgreSQL (AWS RDS) + Prisma ORM
Storage:      AWS S3 (private) + Pinata IPFS (public on-chain evidence)
Contracts:    Solidity + Foundry + OpenZeppelin (UUPS Proxy)
Chain:        Base L2 (OP Stack 通用，可遷移)
Cloud:        AWS (ECS Fargate, RDS, S3, Secrets Manager, CloudWatch)
IaC:          Terraform
CI/CD:        GitHub Actions
Monorepo:     pnpm + Turborepo
```

詳見 [`docs/01-architecture.md`](./docs/01-architecture.md)。

---

## 專案結構（規劃中）

```
OpenTrade/
├── AGENTS.md                  # AI agent 進入專案先讀
├── README.md                  # 本檔
├── docs/                      # 所有文件
│   ├── 00-vision.md
│   ├── 01-architecture.md
│   ├── 02-roadmap.md
│   ├── 03-status.md
│   ├── 04-glossary.md
│   ├── decisions/             # ADR 架構決策記錄
│   ├── conversations/         # 重要對話歸檔
│   └── grant-application/     # 政府基金申請材料
├── .cursor/rules/             # Cursor Rules（AI 行為準則）
├── apps/
│   ├── web/                   # 用戶端 Next.js (Phase 1+)
│   ├── console/               # 商戶後台 Next.js (Phase 1+)
│   └── api/                   # Hono API (Phase 0+ — /v1/health 已上線)
├── packages/
│   ├── contracts/             # Solidity 智能合約 (Phase 1+)
│   ├── db/                    # Prisma schema (Phase 0+)
│   ├── ui/                    # 設計系統 + Storybook (Phase 0+)
│   └── shared/                # 共用 types / utils (Phase 0+)
└── infra/
    └── terraform/             # AWS IaC (Phase 0+)
```

---

## 本機開發環境

> 詳細依據見 [ADR-0012](./docs/decisions/0012-local-dev-docker-postgres.md)。

### 前置依賴

- **Node 22**（透過 `nvm`；專案根目錄有 `.nvmrc`）
- **pnpm 9.15+**（透過 `corepack enable`）
- **Docker Desktop**（macOS / Windows）或 **Docker Engine**（Linux）— 用於本機 PostgreSQL

### 第一次設定

```bash
# 1. 複製環境變數樣板
cp .env.example .env

# 2. 安裝依賴（postinstall 會自動跑 prisma generate）
pnpm install

# 3. 起本機 PostgreSQL（背景執行，資料保留在 named volume）
docker compose up -d postgres
docker compose ps                                # 等到 STATUS 顯示 healthy

# 4. 套用 Prisma migrations
pnpm --filter @opentrade/db db:migrate:dev

# 5. Seed 基礎資料（冪等：hk Tenant）
pnpm --filter @opentrade/db db:seed

# 6. 全包檢查
pnpm typecheck && pnpm lint

# 7. 起 API server 並驗證健康檢查
pnpm --filter @opentrade/api dev                 # 監聽 http://localhost:4000
# 另開一個 terminal:
curl http://localhost:4000/v1/health             # → 200 OK + 真實 DB 延遲
```

### 日常指令

```bash
docker compose up -d postgres                    # 起 DB
docker compose down                              # 停 DB（資料保留）
docker compose down -v                           # 停 DB 並 wipe（重置）
pnpm --filter @opentrade/db db:studio            # Prisma Studio GUI
pnpm --filter @opentrade/db db:migrate:status    # 看 migration 狀態
pnpm --filter @opentrade/api dev                 # 起 API（tsx watch）
pnpm --filter @opentrade/api build               # 產生 dist/main.js 生產 bundle
```

---

## 開發狀態

目前處於 **Phase 0：地基搭建**。

完整路線圖：[`docs/02-roadmap.md`](./docs/02-roadmap.md)
最新進度：[`docs/03-status.md`](./docs/03-status.md)

---

## 授權

License TBD（將於正式啟動前決定，可能採 Business Source License 1.1 或 AGPL-3.0）。

---

## 聯絡

項目發起：HK CFD 業界從業者團隊
合規顧問：（規劃中）退休 SFC 高層作為董事
