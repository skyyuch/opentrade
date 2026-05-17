# ADR-0010: 用戶端與商戶後台拆兩個獨立 Next.js app

## Status
Accepted

## Date
2026-05-17

## Context

OpenTrade 服務兩種截然不同的使用者：
1. **散戶投資者**（C 端）：閱讀評論、評分券商、找 KOL
2. **商戶 / KOL / Admin**（B 端）：管理專頁、發訊號、處理投訴

兩者的 UX 需求差異極大：
| 維度 | 散戶 | 商戶 / KOL |
|---|---|---|
| 主要裝置 | 手機優先 | 桌面優先 |
| 互動頻率 | 偶爾查詢 | 高頻管理 |
| UI 密度 | 低（清晰、寬鬆） | 高（dashboard、表格） |
| 情緒調性 | 親切、有溫度 | 專業、效率 |
| Auth 流程 | Privy 社交登入 | Privy + KYC |
| 權限模型 | 簡單（讀為主） | 複雜（RBAC） |

如果擠在同一個 Next.js app：
- Tailwind 主題打架
- Routing 邏輯複雜（要根據用戶角色 redirect）
- bundle size 膨脹（C 端使用者下載 B 端永遠用不到的 code）
- 部署綁定（C 端要更新 = B 端跟著重啟）

## Decision

拆成**兩個獨立的 Next.js app**：

### apps/web（散戶用戶端）

- **Domain**：`opentrade.io`（或最終決定的網域）
- **目標使用者**：散戶投資者
- **特色**：
  - Mobile-first
  - 快速載入（LCP < 2.5s）
  - SEO 友善（許多評論頁需要被搜尋引擎索引）
  - 簡單的 Privy 社交登入
- **獨立部署**：自己的 OpenNext + S3 + CloudFront

### apps/console（商戶 / KOL / Admin 後台）

- **Domain**：`console.opentrade.io`
- **目標使用者**：認領商戶、KOL、平台 admin
- **特色**：
  - Desktop-first
  - 資料密集（dashboard、表格、圖表）
  - 嚴格 KYC 後才能進入
  - RBAC 權限（商戶員工 / KOL / Admin / SuperAdmin）
- **獨立部署**：自己的 OpenNext + S3 + CloudFront
- **不對外 SEO**：robots.txt 全 disallow

### 共用的部分

- ✅ `packages/ui` — 設計系統共用（但兩 app 可有不同主題變體）
- ✅ `packages/shared` — types / utils / constants 共用
- ✅ `packages/config` — 多鏈、多語言 config 共用
- ✅ 同一個 `apps/api` — 後端 API 共用
- ❌ **不直接共享頁面 / 路由**

## Alternatives Considered

### Alternative A: 單一 Next.js app + Route Group 區分
- **Pros**：簡單，一份部署
- **Cons**：
  - bundle size 浪費
  - 主題切換複雜
  - 部署綁定
  - 高權限的 console 路由與 public 路由共存有安全顧慮
- **結論**：不選

### Alternative B: 單一 Next.js app + middleware 動態切換主題
- **Pros**：技術上能做
- **Cons**：複雜度爆炸、難維護
- **結論**：不選

### Alternative C: 商戶後台用 React Admin / Refine.dev 等成熟後台框架
- **Pros**：admin UI 開發極快
- **Cons**：
  - 與 packages/ui 設計系統衝突
  - 風格不一致（一邊 OpenTrade 品牌，一邊框架預設樣式）
  - 對非 admin 商戶（KOL）UX 不友善
- **結論**：不選

### Alternative D: 完全分離兩個 repo
- **Pros**：終極隔離
- **Cons**：
  - packages/ui / shared / config 難共享
  - 跨 repo 改動麻煩
  - 違反 ADR-0004 monorepo 決策
- **結論**：不選

### Alternative E: 用 Turborepo 的 Internal Package + 兩個 Next.js apps
- **這就是我們選的**

## Consequences

### Positive
- 兩端獨立演進，互不干擾
- bundle size 各自最佳化
- 部署互不影響（C 端緊急修復不需要動到 console）
- 安全性隔離：console 出問題不影響公共網域
- 主題各自表達（同一個設計系統，不同 brand expression）
- AI 開發時 context 集中（改 web 的 AI 不需要看 console code）

### Negative / Trade-offs
- 兩個 Next.js app 維護成本（但共用 packages/ui 已大幅降低）
- 部署設定要做兩份
- 跨 app 的功能（例如「Email 通知裡的連結點到對應 app」）需要明確處理
- Next.js 升級時要兩個 app 都升

### Neutral
- 將來可能需要第三個 app（例如 marketing landing page），這個架構支援

## Implementation Notes

### Domain 規劃

| App | Production | Staging | Dev |
|---|---|---|---|
| apps/web | opentrade.io | staging.opentrade.io | dev.opentrade.io |
| apps/console | console.opentrade.io | console.staging.opentrade.io | console.dev.opentrade.io |
| apps/api | api.opentrade.io | api.staging.opentrade.io | api.dev.opentrade.io |

### Auth 流程差異

#### apps/web 流程
1. 訪客可瀏覽部分內容（讀評論等）
2. 寫評論前要求 Privy 登入
3. 高權重評論需要 SBT
4. 登入後可在 web 內完整使用

#### apps/console 流程
1. **不允許訪客瀏覽**（直接 redirect 到登入頁）
2. Privy 登入後檢查角色
3. 商戶 / KOL 第一次需要 KYC
4. Admin 必須在預設名單內 + 多因子驗證

### Route 隔離

- `apps/web` 的 middleware：允許未登入訪問大部分路由
- `apps/console` 的 middleware：未登入一律 redirect 到 `/login`

### CORS / API 共用

`apps/api` 的 CORS 設定允許：
- `opentrade.io` (apps/web)
- `console.opentrade.io` (apps/console)
- `localhost:3000` (apps/web dev)
- `localhost:3001` (apps/console dev)

### 開發埠位

- `apps/web`: 3000
- `apps/console`: 3001
- `apps/api`: 4000
- `packages/ui` Storybook: 6006

### 嚴禁事項

- ❌ apps/web import apps/console 的東西（反之亦然）
- ❌ 兩 app 各自實作相同的元件（必須在 packages/ui）
- ❌ console 不做 SEO 優化（robots.txt 全 disallow）
- ❌ 把 admin 功能藏在 apps/web 的隱藏路由

## References

- [docs/00-vision.md](../00-vision.md)
- [docs/01-architecture.md 第 4.1 節](../01-architecture.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
