# ADR-0006: API 採用 DDD + Modular Monolith 架構

## Status

Accepted

## Date

2026-05-17

## Context

OpenTrade 是一個會長大的金融類產品，從 MVP 到規模化的成長路徑會是：

| 階段     | 用戶量   | 核心功能           |
| -------- | -------- | ------------------ |
| Phase 1  | 100s     | 評論 + 商戶認領    |
| Phase 2  | 1,000s   | + KOL 訊號         |
| Phase 3  | 10,000s  | + 陪審仲裁         |
| Phase 5+ | 100,000s | + 多地區、多元金融 |

我們需要一個架構：

- 第一天就支援未來規模（不能砍掉重練）
- 但不要 day 1 就 over-engineering 成 microservices
- 各業務領域邊界清楚
- 可漸進拆分

## Decision

採用 **Modular Monolith + Domain-Driven Design (DDD)**：

- 整個 API 是**單一部署單元**（一個 Hono service）
- 但內部按**業務領域**嚴格切分
- 各 domain 之間透過 **events** 溝通（而非直接呼叫）
- 將來任何 domain 都能**獨立拆出去**成 microservice

### 目錄結構

```
apps/api/src/
├── domains/                       ← 各業務領域，彼此邊界清楚
│   ├── reviews/
│   │   ├── domain/                # Entity, Value Object, Aggregate
│   │   ├── application/           # Use Cases (Commands + Queries)
│   │   ├── infrastructure/        # Prisma repo, Chain client (具體實作)
│   │   └── presentation/          # Hono routes (HTTP layer)
│   ├── brokers/
│   ├── kols/
│   ├── disputes/
│   ├── identity/
│   └── signals/
│
├── shared/                        ← 跨 domain 共用
│   ├── events/                    # Event bus + Outbox pattern
│   ├── feature-flags/
│   ├── tenant/                    # Multi-tenant context
│   ├── i18n/                      # error_code → message
│   ├── auth/                      # JWT 中間層 (Privy 驗證)
│   ├── observability/             # Pino logger, metrics
│   ├── chain/                     # 多鏈 config 抽象
│   └── errors/                    # AppError, ErrorCode enum
│
├── http/
│   ├── server.ts                  # Hono 入口
│   ├── middleware/
│   ├── openapi.ts                 # 自動產生 OpenAPI Spec
│   └── routes.ts                  # 註冊所有 domain 的 presentation 層
│
└── main.ts
```

### Domain 內部結構（以 reviews 為例）

```
domains/reviews/
├── domain/
│   ├── Review.ts                  # Aggregate Root
│   ├── ReviewId.ts                # Value Object
│   ├── ReviewSentiment.ts         # Enum / VO
│   ├── ReviewSubmittedEvent.ts    # Domain Event
│   └── IReviewRepository.ts       # Interface (Port)
├── application/
│   ├── SubmitReviewUseCase.ts
│   ├── ListReviewsQuery.ts
│   └── ...
├── infrastructure/
│   ├── PrismaReviewRepository.ts  # Adapter
│   ├── ChainReviewClient.ts       # Adapter (合約呼叫)
│   └── IpfsClient.ts
├── presentation/
│   ├── routes.ts                  # POST /reviews, GET /reviews
│   ├── dto/
│   │   ├── SubmitReviewDto.ts
│   │   └── ReviewResponseDto.ts
│   └── mappers.ts
└── index.ts                       # 對外 export
```

### Domain 邊界規則（強制）

- ❌ Domain A 的 application/infrastructure 不可直接 import Domain B 的內部類別
- ✅ Domain 之間透過 **Domain Events**（透過 Event Bus）溝通
- ✅ 跨 domain 查詢透過 application layer 的 Query Service（**讀模型可跨 domain，但寫模型不可**）

### Event Bus + Outbox Pattern

跨 domain 通訊使用 **Outbox Pattern**：

1. Use case 執行時，**同一個 DB transaction** 內：
   - 寫業務資料
   - 寫一筆 `outbox_events`
2. 背景 worker 讀 `outbox_events` 表
3. 發送 event 到 SQS
4. 訂閱者接收事件處理

**好處**：

- 業務寫入與事件發送原子化（不會「DB 寫成功但事件丟失」）
- 將來拆 microservice 直接把 worker 改成跨服務發送

## Alternatives Considered

### Alternative A: 純 microservices（每個 domain 一個獨立 service）

- **Pros**：終極可擴展
- **Cons**：
  - Day 1 部署複雜度爆炸
  - 跨 service 的 transaction 變難
  - 小團隊運維 5+ services 很痛
- **結論**：MVP 階段不選；Modular Monolith 內部結構保留拆分能力

### Alternative B: 傳統 MVC（Model-View-Controller）

- **Pros**：開發速度快，AI 教材最多
- **Cons**：
  - 業務邏輯散落在 controller / service
  - 領域邊界模糊
  - 規模化後易變成 spaghetti
  - 不好拆 microservice
- **結論**：不選

### Alternative C: Layered Architecture（不分 domain，按技術層分）

- **Pros**：簡單直覺
- **Cons**：跨 domain 改動會散到每一層；違反 DDD 原則；不易拆服務
- **結論**：不選

### Alternative D: Event-Sourcing + CQRS 完整版

- **Pros**：終極可審計性，金融類項目最佳
- **Cons**：
  - 學習曲線陡峭
  - AI 對 ES 教材稀缺
  - MVP 階段 over-engineering
- **結論**：保留「讀寫分離」精神（CQRS-lite），不做完整 ES

## Consequences

### Positive

- 各 domain 邊界清楚，新功能定位清晰
- 可漸進拆分：將來 disputes 量大可獨立成 service
- 業務邏輯獨立於框架（domain 層不依賴 Hono / Prisma）
- 換 framework / DB 不影響業務邏輯
- 測試容易（domain layer 純函式 / class，不需要 mock）
- AI 開發友善：每次只看一個 domain，context 集中

### Negative / Trade-offs

- 樣板程式碼較多（DTO、Mapper、Repository interface）
- 學習曲線比直接寫 controller 陡
- 對「只是改 1 行」這種小改動，要動到多個檔案
- AI 容易越界（必須有 cursor rules 強制）

### Neutral

- 對 1-2 人團隊有點過度，但 OpenTrade 規劃成長期項目，前期投資值得

## Implementation Notes

### 開發新功能的標準流程

1. **先寫 Domain 層**：定義 Entity + Value Object + Domain Event
2. **寫 Application 層**：Use Case（純函式 / class，依賴 Repository interface）
3. **寫 Infrastructure 層**：實作 Repository / Chain Client / IPFS Client
4. **最後寫 Presentation 層**：DTO + 路由
5. **每層獨立寫測試**

### 哪些東西必須走 Event Bus

- 跨 domain 的副作用（評論被提交 → identity domain 升級 SBT 等級）
- 觸發背景任務（評論上鏈成功 → 觸發 AI 翻譯）
- 通知（仲裁完成 → SES 寄信）

### 哪些東西**不**用 Event Bus

- Domain 內部呼叫（reviews 內部的 Use Case 呼叫 reviews 的 Repository）
- 同一 use case 內的同步操作

### 嚴禁事項

- ❌ Domain 層 import Prisma / Hono / 任何外部框架
- ❌ Application 層 import 具體 Infrastructure（只 import interface）
- ❌ 跨 domain 直接呼叫 Use Case（用 events）
- ❌ Presentation 層的 DTO 洩漏到 Domain 層

## References

- [Eric Evans - Domain-Driven Design](https://www.domainlanguage.com/ddd/)
- [Vaughn Vernon - Implementing DDD](https://vaughnvernon.com/)
- [Modular Monoliths by Simon Brown](https://www.youtube.com/watch?v=5OjqD-ow8GE)
- [docs/01-architecture.md 第 4.3 節](../01-architecture.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
