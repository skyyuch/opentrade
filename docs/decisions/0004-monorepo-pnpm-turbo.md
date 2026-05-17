# ADR-0004: Monorepo 使用 pnpm + Turborepo

## Status
Accepted

## Date
2026-05-17

## Context

OpenTrade 包含多個應用與套件：
- 散戶用戶端（Next.js）
- 商戶後台（Next.js）
- 後端 API（Hono）
- 智能合約（Foundry）
- 設計系統（含 Storybook）
- 共用 types / utils
- DB schema
- 多鏈 / 多租戶 config

這些單元之間有大量共用 type 與工具，但部署時又需要獨立。如何組織程式碼是一個影響長期維護成本的關鍵決策。

## Decision

採用 **Monorepo 架構**，工具組合：
- **包管理器**：pnpm（workspace）
- **任務執行器 / 快取**：Turborepo
- **工作區根目錄**：`/`（即 OpenTrade repo 根）

結構：

```
OpenTrade/                         # repo root
├── apps/                          # 部署單元
│   ├── web/
│   ├── console/
│   └── api/
├── packages/                      # 共用單元
│   ├── contracts/
│   ├── db/
│   ├── ui/
│   ├── shared/
│   └── config/
├── infra/
│   └── terraform/
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json (root)
```

### Package 依賴規則（強制）

- ✅ `apps/*` 可以 import `packages/*`
- ✅ `packages/*` 之間有向上依賴關係（見 `01-architecture.md`）
- ❌ `apps/*` 不可互相 import
- ❌ 下層 package 不可 import 上層 package
- ❌ `apps/web` 與 `apps/console` 不可 import `packages/db`（前端絕不接觸 DB）

### 預期 Turborepo 任務

```json
{
  "tasks": {
    "build":       { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "lint":        { "outputs": [] },
    "typecheck":   { "dependsOn": ["^build"], "outputs": [] },
    "test":        { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:watch":  { "cache": false, "persistent": true },
    "dev":         { "cache": false, "persistent": true }
  }
}
```

## Alternatives Considered

### Alternative A: 多 repo（每個 app / package 一個 repo）
- **Pros**：每個 repo 獨立 versioning，部分元件可開源（合約）部分不開
- **Cons**：
  - 跨 repo 改 type 同步噩夢
  - 跨 repo 原子提交不可能
  - AI 開發時無法一次看到全 context
  - 單人 / 小團隊狀態下純粹增加 overhead
- **結論**：不選；未來真的需要可從 monorepo 拆出去

### Alternative B: Monorepo + Yarn Workspaces
- **Pros**：成熟
- **Cons**：磁碟使用率高（每個 workspace 都複製 node_modules）；Yarn 2+ 跟生態整合有時有坑
- **結論**：不選

### Alternative C: Monorepo + npm Workspaces
- **Pros**：原生
- **Cons**：效能差於 pnpm，特別是大 monorepo 安裝 5 倍慢
- **結論**：不選

### Alternative D: pnpm + Nx
- **Pros**：Nx 比 Turborepo 功能更多（generator、graph、task plan）
- **Cons**：學習曲線陡、配置複雜、AI 對 Nx 教材不如 Turborepo 多
- **結論**：對 OpenTrade 規模而言 Turborepo 已足夠

### Alternative E: Bun workspace
- **Pros**：理論上最快
- **Cons**：尚不夠成熟，部分套件相容性問題；AI 工具支援度也不及 pnpm
- **結論**：未來可考慮，現在不選

## Consequences

### Positive
- 跨 package type-safe 共享（改 schema → 全 repo type error 立刻浮現）
- 跨 package 原子提交（一個 PR 改 schema + API + 前端）
- AI 寫 code 時能一次看到全專案 context，跨層改動更精準
- pnpm 的 hard link / symlink 機制讓磁碟省 60-80%
- Turborepo 的 incremental cache 讓 CI 速度提升 5-10 倍
- 業界主流：Vercel、Linear、Coinbase、Stripe、Shopify 都用 monorepo
- 未來想拆 repo 也容易（按 package 邊界拆）

### Negative / Trade-offs
- pnpm 對少數套件有相容性 issue（特別是某些有 phantom dependency 的舊 package）
- Turborepo 設定學習曲線
- IDE 跨 package 跳轉 / refactor 對某些工具不友善（VSCode 還算 OK）
- Code review 時 PR 可能跨多個 package，review 量大

### Neutral
- 如果未來開源部分元件（例如智能合約），需要從 monorepo 抽出（不困難，但要做）

## Implementation Notes

### 必須在 Phase 0 完成的設定

1. `pnpm-workspace.yaml`：列出所有 workspace
2. `turbo.json`：定義 task pipeline
3. `package.json` (root)：scripts + devDependencies
4. `tsconfig.base.json`：所有 package 繼承
5. ESLint + Prettier 在 root 統一管理
6. Husky + lint-staged：pre-commit hook

### Cursor Rules 配套

- 規則 `.cursor/rules/10-architecture.mdc` 必須描述 package 邊界
- 規則 `.cursor/rules/30-api-hono.mdc` 必須禁止 import `packages/db` 之外的 layer 越界

### 嚴禁事項

- ❌ 在 root `package.json` 隨便加業務邏輯依賴（root 只放 devTools）
- ❌ 跨 app import（apps/web 不可 import apps/console 的東西）
- ❌ 在 package 之間繞圈依賴

## References

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Turborepo](https://turbo.build/repo/docs)
- [docs/01-architecture.md 第 3 節](../01-architecture.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
