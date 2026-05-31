# OpenTrade 技術架構

> **這份文件描述「我們怎麼做」。**
> 它與 [`00-vision.md`](./00-vision.md) 共同構成項目的「不可隨意改動」基礎。
> 任何架構級變更必須先寫 ADR，並更新本檔。

---

## 一、設計原則（Architectural Principles）

> 任何技術選型決策必須符合下列原則之一。違反原則的提案需先寫 ADR 說明理由。

### P1. 為「五年後的規模」設計，不是「明天的 demo」設計

- 從第一天就採用可擴展模式（DDD、Modular Monolith、Multi-tenant Ready）
- 寧可前期多花 20% 時間，避免日後重寫

### P2. 公平與不可篡改是不可妥協的功能需求

- 任何「方便」的設計都不能違反鏈上不可變承諾
- Smart contract 不可有「可刪除評論」的邏輯，連 admin 都不行

### P3. Web 2.5 混合：公開不可變上鏈，私密可變存 DB

- **上鏈內容**：評論 hash、KOL 訊號、陪審團投票結果、SBT 身份
- **DB 內容**：商戶介紹、用戶 profile、翻譯快取、UI 設定
- 原則：「**任何使用者可能想刪除的資料**，不上鏈」

### P4. 多鏈 / 多區域 / 多語言「Ready」，但不立即多

- 第一天的程式碼必須假設將來會多鏈、多區域、多語言部署
- 透過 config 抽象，但實際只先部署單一目標

### P5. 前端絕不接觸機敏資料

- 前端不存私鑰、不直連 DB、不持有 server secret
- 所有機敏操作經由 API + AWS Secrets Manager

### P6. 測試先於上線

- 智能合約：100% 函式覆蓋率，含 invariant test
- API 業務邏輯：> 80% 行覆蓋率
- 關鍵流程 e2e 測試：必過

### P7. 觀察性優先於除錯

- 從第一天就上 CloudWatch + Sentry + 結構化日誌
- 任何重要動作必有 metric

---

## 二、整體架構（High-Level）

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              使用者裝置                                   │
│  Web Browser (zh-Hant / zh-Hans / en) · Mobile (Phase 2+)                │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ HTTPS
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│           CloudFront (CDN) + Route 53 (DNS) + ACM (TLS)                  │
└──────────┬─────────────────────────────────────────┬─────────────────────┘
           │                                          │
           ▼                                          ▼
┌────────────────────────┐                ┌────────────────────────┐
│  apps/web              │                │  apps/console          │
│  Next.js 14 App Router │                │  Next.js 14 App Router │
│  Storybook (UI 開發)   │                │  Storybook (UI 開發)   │
│  next-intl (3 語言)    │                │  next-intl (3 語言)    │
│                        │                │                        │
│  目標：散戶投資者       │                │  目標：商戶 / KOL / Admin │
│  Domain: opentrade.io  │                │  Domain: console.*     │
│  部署：OpenNext + S3   │                │  部署：OpenNext + S3   │
│       + Lambda + CDN   │                │       + Lambda + CDN   │
└──────────┬─────────────┘                └──────────┬─────────────┘
           │                                          │
           │         HTTPS / wagmi (Privy AA)         │
           │                                          │
           └──────────────────┬───────────────────────┘
                              │
                  ┌───────────┴────────────┐
                  │                        │
                  ▼                        ▼
┌─────────────────────────────────┐  ┌──────────────────────────────────┐
│  apps/api (Hono on ECS Fargate) │  │  Base L2 (Smart Contracts)       │
│                                 │  │                                  │
│  REST + tRPC API                │  │  - ReviewRegistry                │
│  Multi-tenant DDD architecture  │  │  - JuryVote                      │
│                                 │  │  - SignalLogger                  │
│  Domains:                       │  │  - SBT Identity                  │
│  ├── reviews/                   │  │  - Escrow / Staking              │
│  ├── brokers/                   │  │                                  │
│  ├── kols/                      │  │  Patterns:                       │
│  ├── disputes/                  │  │  - UUPS Proxy (升級可控)         │
│  ├── identity/                  │  │  - OpenZeppelin Contracts        │
│  ├── signals/                   │  │  - Multi-chain config (OP Stack) │
│  └── shared/                    │  │  - Timelock for upgrades         │
│                                 │  └────────────┬─────────────────────┘
│  Cross-cutting:                 │               │
│  - Event Bus (Outbox Pattern)   │               │
│  - Feature Flags                │               ▼
│  - i18n / RBAC / Audit          │  ┌──────────────────────────────────┐
└──────┬──────────────┬───────────┘  │  Pinata IPFS                     │
       │              │               │  公開鏈上證據儲存（必須去中心化）  │
       ▼              ▼               └──────────────────────────────────┘
┌────────────┐  ┌────────────┐
│ RDS Postgres│  │ S3         │
│ Multi-AZ    │  │ Private    │
│ Read Replica│  │ Files      │
│ Prisma ORM  │  └────────────┘
└─────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│           AWS Secrets Manager · CloudWatch · X-Ray · Sentry              │
│           SES · SNS · SQS (背景任務) · Lambda (鏈上事件監聽)             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 三、Monorepo 結構

```
OpenTrade/
├── apps/
│   ├── web/                  # 散戶用戶端 (Next.js 14)
│   ├── console/              # 商戶後台 (Next.js 14)
│   └── api/                  # 後端 API (Hono)
│
├── packages/
│   ├── contracts/            # Foundry 智能合約
│   ├── db/                   # Prisma schema + migrations
│   ├── ui/                   # 設計系統 + Storybook
│   ├── shared/               # 共用 types / utils / constants
│   └── config/               # 共用設定（鏈、tenant、feature flags）
│
├── infra/
│   └── terraform/            # AWS IaC
│       ├── modules/
│       ├── environments/
│       │   ├── dev/
│       │   ├── staging/
│       │   └── prod/
│       └── ...
│
├── docs/                     # 所有文件
├── .cursor/rules/            # Cursor Rules
├── .github/workflows/        # CI/CD
│
├── package.json              # Root (monorepo 入口)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

### Package 依賴規則（強制）

```
              packages/shared (純 TS, no runtime deps)
                  ▲     ▲     ▲
                  │     │     │
         ┌────────┘     │     └────────┐
         │              │              │
   packages/db    packages/ui   packages/contracts
         ▲              ▲              ▲
         │              │              │
         │       ┌──────┴──────┐       │
         │       │             │       │
       apps/api  apps/web  apps/console│
                            ▲          │
                            └──────────┘
```

- ✅ 上層可以 import 下層
- ❌ 下層不可 import 上層
- ❌ 兄弟之間不可互相 import（apps 之間絕不互相 import）
- ❌ `apps/web` 與 `apps/console` 不可 import `packages/db`（前端絕不接觸 DB）

---

## 四、各層詳細說明

### 4.1 前端層 (apps/web, apps/console)

**為什麼要分兩個 app**：

| 因素       | apps/web               | apps/console           |
| ---------- | ---------------------- | ---------------------- |
| 目標使用者 | 散戶投資者             | 商戶員工 / KOL / Admin |
| UI 風格    | 親切、有溫度、行動優先 | 專業、密度高、桌面優先 |
| 部署       | opentrade.io           | console.opentrade.io   |
| Auth 流程  | Privy (社交登入)       | Privy + 額外 KYC       |

兩者**共用 `packages/ui` 設計系統**，但各自表達品牌調性。

**關鍵技術**：

- Next.js 14 App Router（Server Components）
- next-intl（URL 含 locale，例如 `/zh-Hant/brokers`）
- wagmi v2 + viem（Web3 互動）
- Privy（Account Abstraction、社交登入、Gasless）
- TanStack Query（API 資料）
- shadcn/ui + Tailwind（UI 元件）

### 4.2 設計系統層 (packages/ui)

**獨立工作流**：UI 開發必須先在 Storybook 完成，再接 API。

```
packages/ui/
├── design-tokens/
│   ├── colors.ts        # OpenTrade 品牌色
│   ├── typography.ts    # 思源宋體 / 思源黑體
│   └── spacing.ts
├── primitives/          # shadcn 為基底
│   ├── Button/
│   ├── Input/
│   ├── Dialog/
│   └── ...
├── compounds/           # 業務組合元件
│   ├── ReviewCard/
│   ├── BrokerProfileHeader/
│   ├── KOLSignalChart/
│   ├── JuryVotePanel/
│   └── ...
├── stories/             # Storybook
└── package.json
```

### 4.3 API 層 (apps/api)

採 **Hexagonal / DDD 架構**，按領域切目錄：

```
apps/api/src/
├── domains/
│   ├── reviews/
│   │   ├── domain/              # Entity、Value Object、Domain Events
│   │   ├── application/         # Use cases (CQRS lite)
│   │   ├── infrastructure/      # Prisma repo、Chain client
│   │   └── presentation/        # Hono routes、DTO
│   ├── brokers/
│   ├── kols/
│   ├── disputes/
│   ├── identity/                # SBT、KYC、zk-proof 驗證
│   └── signals/
│
├── shared/
│   ├── events/                  # Event bus + Outbox pattern
│   ├── feature-flags/
│   ├── tenant/                  # Multi-tenant context
│   ├── i18n/                    # error_code → message
│   ├── auth/                    # JWT 中間層
│   ├── observability/           # logging、metrics
│   └── chain/                   # 多鏈 config 抽象
│
├── http/
│   ├── server.ts
│   ├── middleware/
│   └── openapi.ts               # 自動產生 OpenAPI Spec
│
└── main.ts
```

**API 版本策略**：所有 endpoint 從第一天就 `/v1/...`。

### 4.4 資料層 (packages/db)

```
packages/db/
├── prisma/
│   ├── schema.prisma            # 唯一 DB schema source of truth
│   └── migrations/              # 自動產生
├── seed/
│   └── seed.ts                  # 預載 SFC 持牌券商清單
├── src/
│   ├── client.ts                # PrismaClient 唯一入口
│   └── index.ts                 # 對外 export type
└── package.json
```

**規則**：

- 只有 `apps/api` 可以 import `packages/db` 的 PrismaClient
- 前端可以 import type，**不可** import client
- 所有 schema 必有 `tenantId`（即使 V1 只有 HK 一個 tenant）
- 所有 schema 必有 `createdAt` / `updatedAt`
- Soft delete 一律用 `deletedAt`，不真的 DELETE

### 4.5 智能合約層 (packages/contracts)

```
packages/contracts/
├── src/
│   ├── identity/
│   │   ├── BrokerSBT.sol
│   │   └── ReviewerSBT.sol
│   ├── reviews/
│   │   └── ReviewRegistry.sol
│   ├── signals/
│   │   └── KolSignalRegistry.sol
│   ├── notes/
│   │   └── KolNoteRegistry.sol   # ADR-0039 (planned, Session 2)
│   ├── disputes/
│   │   ├── JuryPool.sol
│   │   └── DisputeArbitration.sol
│   ├── proxy/
│   │   └── (UUPS upgradeable patterns)
│   └── interfaces/
├── test/                        # Foundry tests (Solidity)
├── script/                      # Deploy scripts
├── foundry.toml
└── lib/                         # OpenZeppelin (git submodule)
```

**設計原則**：

- 所有合約用 **UUPS Proxy** 模式（OpenZeppelin），可升級但需 timelock
- 沒有任何「刪除評論」的函式
- Owner 權限最小化（只能 pause + upgrade，不能改資料）
- 多鏈部署：deploy script 透過 chainId 切換目標

### 4.6 區塊鏈層

| 環境      | 鏈              | 目的       |
| --------- | --------------- | ---------- |
| Local dev | Anvil (Foundry) | 開發       |
| dev       | Base Sepolia    | 內部測試   |
| staging   | Base Sepolia    | 發行前驗收 |
| prod      | Base Mainnet    | 正式環境   |

**多鏈準備**：

- 合約地址、RPC、chainId 全部在 `packages/config` 用 env 切換
- 不寫死 `import "Base"` 之類的東西
- 將來要部署到 Optimism / Arbitrum 只改 config

### 4.7 雲端基礎設施

**全 AWS，三環境分離**：dev / staging / prod

| 服務            | 用途                                      | 環境差異                                                   |
| --------------- | ----------------------------------------- | ---------------------------------------------------------- |
| ECS Fargate     | apps/api 容器                             | dev: 1 task / prod: 3+ task auto-scale                     |
| RDS Postgres 16 | 資料庫                                    | dev: t4g.small / prod: m6g.large + Multi-AZ + Read Replica |
| S3              | 私密檔案、frontend 靜態資源               | 三環境分桶                                                 |
| CloudFront      | CDN                                       | 三環境分發                                                 |
| Route 53        | DNS                                       | dev.opentrade.io / staging.opentrade.io / opentrade.io     |
| ACM             | TLS 憑證                                  | 自動續約                                                   |
| Secrets Manager | 密碼、私鑰、API key                       | 嚴格 IAM                                                   |
| CloudWatch      | 日誌、指標、警報                          |                                                            |
| X-Ray           | 分散式追蹤                                |                                                            |
| SQS + Lambda    | 背景任務（鏈事件監聽、IPFS pin、AI 翻譯） |                                                            |
| SES             | Email 通知                                |                                                            |
| WAF             | API 防護                                  | prod 必啟                                                  |

**IaC**：所有資源**透過 Terraform 建立**，禁止 console 手動操作。

### 4.8 觀察性與監控

- **日誌**：Pino → CloudWatch Logs（結構化 JSON）
- **指標**：CloudWatch Metrics（自定 metric for 業務指標）
- **追蹤**：AWS X-Ray
- **錯誤追蹤**：Sentry（前端 + 後端）
- **業務指標**：每天 / 每週 dashboard
  - 評論提交數、爭議數、陪審投票數
  - KOL 訊號量、上鏈成功率
  - API p50/p95/p99 latency

---

## 五、資料流範例

### 範例 1：使用者提交評論

```
1. User 在 apps/web 寫評論
2. 點「提交」→ 前端先呼叫 API: POST /v1/reviews/draft
3. API 驗證身份（JWT from Privy）→ 驗證 SBT 持有 → 寫 draft 進 DB
4. 前端用 Privy 觸發合約呼叫 ReviewRegistry.submit(reviewHash)
   - 內容 hash 上鏈
   - 完整內容存 IPFS
   - DB 紀錄 reviewId + ipfsCid + chainTxHash
5. SQS 觸發 Lambda：
   - AI 翻譯成另兩種語言
   - 通知商戶（如有訂閱）
6. 用戶看到評論已上鏈，連結到 BaseScan
```

### 範例 2：KOL 發出買賣訊號

```
1. KOL 在 apps/console 設定訊號類型（買 / 賣 / 持有）+ 標的 + 目標價
2. 點「發送」→ 前端呼叫合約 SignalLogger.emit(...)
   - 訊號內容上鏈
   - timestamp 由區塊提供，無法竄改
3. SignalLogger 觸發 event → SQS 接收 → Lambda 寫進 DB（為了快速查詢）
4. 訂閱者收到推播
5. 後續用 Chainlink 之類取真實價格 → 計算 KOL 勝率（公開可驗證）
```

### 範例 3：使用者投訴券商

```
1. User 在 apps/web 提交投訴 + 證據
2. 證據上傳到 S3（私密）→ hash 存進投訴紀錄
3. User 質押少量代幣（V2+，V1 只用 SBT 驗證）
4. 通知被投訴方，雙方各有 7 天提交反駁證據
5. 期限後合約 JuryPool.startCase 隨機抽取 5 位 L3 陪審員
6. 陪審員看雙方證據 → 投票 → 多數決
7. 結果上鏈，雙方任一方可上訴（V2+）
```

---

## 六、安全模型

### 身份分層

| 等級 | 對象         | 取得方式                            | 權限                   |
| ---- | ------------ | ----------------------------------- | ---------------------- |
| L0   | 訪客         | 無需登入                            | 只讀已上鏈評論         |
| L1   | 已登入用戶   | Privy 社交登入                      | 讀全部、寫評論草稿     |
| L2   | 已驗證投資者 | 持有特定券商 SBT（zk-proof 月結單） | 提交可信評論           |
| L3   | 創始陪審員   | 邀請制 SBT                          | 參與陪審投票           |
| L4   | 機構         | KYC + SFC 牌照驗證                  | 認領商戶專頁           |
| L5   | Admin        | 多簽錢包                            | 合約 upgrade、緊急暫停 |

### 機敏資料保護

- **私鑰**：永不存進伺服器，全在 Privy / 用戶錢包
- **DB 密碼**：AWS Secrets Manager + IAM Role 取得
- **PII**：傳入 API 時即做 hash / 脫敏
- **月結單原檔**：前端做 zk-proof，原檔絕不到伺服器
- **TLS**：所有對外連線強制 HTTPS

### 合約安全

- 用 OpenZeppelin 套件（不重造輪子）
- 部署前透過 Slither + Mythril 自動掃描
- 主網部署前必須通過第三方 audit（基金到位後做）
- Bug Bounty：上線後在 Immunefi 開賞金

---

## 七、效能與擴展性目標

### Phase 1 目標

| 指標                      | 目標                |
| ------------------------- | ------------------- |
| API p95 latency           | < 300ms             |
| 頁面載入 LCP              | < 2.5s              |
| 評論提交端到端            | < 10s（含上鏈確認） |
| 同時在線用戶              | 1,000               |
| 每日新評論                | 1,000               |
| 鏈上 gas 成本（平台代付） | 月 < $500 USD       |

### Phase 2 目標

| 指標         | 目標                      |
| ------------ | ------------------------- |
| 同時在線用戶 | 10,000                    |
| 每日新評論   | 10,000                    |
| API 服務     | 拆出獨立 disputes service |

---

## 八、什麼不做（避免 over-engineering）

- ❌ 自建 sequencer / 自建 L3（5 年後再考慮）
- ❌ 自有代幣（Phase 1 用 Points，避開 VATP 監管）
- ❌ 跨鏈橋（V1 只 Base，V2+ 才考慮）
- ❌ NFT 玩法（不是核心需求）
- ❌ 自家手機 App（Phase 2+ 才考慮，先 PWA）

---

## 九、關連文件

- 願景：[`00-vision.md`](./00-vision.md)
- 路線圖：[`02-roadmap.md`](./02-roadmap.md)
- 當前狀態：[`03-status.md`](./03-status.md)
- 架構決策：[`decisions/`](./decisions/)
