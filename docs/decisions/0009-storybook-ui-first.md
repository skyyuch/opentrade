# ADR-0009: UI 採 Storybook 獨立工作流先行

## Status

Accepted

## Date

2026-05-17

## Context

OpenTrade 的成敗在很大程度上取決於 UI 視覺與體驗：

- 申請數碼港 / ITC 基金時，評委 demo 5 分鐘看 UI 留下的印象
- 投資人簡報時，UI 直接影響「專業感」判斷
- 競品（外匯天眼）UI 偏老派，OpenTrade 視覺要明顯勝出

如果 UI 是「順便做」的副產品，最終會：

- 元件風格不一致
- 一個元件改了影響其他頁面但無法察覺
- 設計與 dev 反覆對焦浪費時間
- 沒有設計系統，新元件全靠重寫

## Decision

採用「**設計系統 + Storybook 獨立工作流**」：

### 核心原則

UI 元件必須在 **Storybook** 中先完成、再被頁面使用。

開發順序：

1. 設計 tokens（顏色、字型、間距）
2. Primitive 元件（Button、Input 等）→ 寫 stories
3. Compound 元件（ReviewCard、KOLSignalChart 等）→ 寫 stories
4. **頁面只能用 packages/ui 的元件組合**，不可在頁面層發明新元件

### 結構

```
packages/ui/
├── design-tokens/
│   ├── colors.ts             # OpenTrade 品牌色
│   ├── typography.ts         # 思源宋體 / 思源黑體 + Inter
│   ├── spacing.ts
│   ├── shadows.ts
│   └── motion.ts             # 動畫時間 / easing
├── primitives/               # shadcn/ui 為基底
│   ├── Button/
│   ├── Input/
│   ├── Card/
│   ├── Dialog/
│   ├── Toast/
│   └── ...
├── compounds/                # OpenTrade 業務組合元件
│   ├── ReviewCard/
│   ├── BrokerProfileHeader/
│   ├── KOLSignalChart/
│   ├── JuryVotePanel/
│   ├── DisputeTimeline/
│   ├── SBTBadge/
│   └── ...
├── stories/                  # Storybook 配置與 meta stories
│   ├── Introduction.mdx
│   ├── DesignTokens.stories.tsx
│   └── ...
├── .storybook/
│   ├── main.ts
│   ├── preview.tsx
│   └── ...
└── package.json
```

### 工作流

#### 開發新元件

```
1. 設計師（或 AI 提供高保真稿）→ Figma 設計
2. dev 在 packages/ui/compounds/ 建新資料夾
3. 寫 .tsx 元件
4. 寫 .stories.tsx：mock 各種狀態（loading / empty / error / 多語）
5. 跑 pnpm storybook 視覺驗收
6. 視覺回歸測試（Chromatic 或 Playwright screenshot）
7. 才在 apps/web / apps/console 使用
```

#### 修改既有元件

```
1. 改 packages/ui/.../Component.tsx
2. 跑 storybook 看所有 stories
3. 跑視覺回歸測試
4. 修正受影響的 stories
5. apps/* 自動跟著更新
```

## Alternatives Considered

### Alternative A: 不用 Storybook，直接在頁面寫 UI

- **Pros**：開發快
- **Cons**：
  - 元件風格易不一致
  - 設計變動牽動多處
  - 測試 UI 必須跑整個 app
  - 無法 demo 元件給設計師 / 投資人看
- **結論**：不選

### Alternative B: 用 Storybook 但不強制獨立工作流

- **Pros**：彈性
- **Cons**：實際情況會變成「順便寫 stories」，很快崩壞
- **結論**：不選；必須強制

### Alternative C: 用其他元件文檔工具（Ladle / Histoire / docusaurus）

- **Pros**：較輕量
- **Cons**：
  - Storybook 是業界標準，AI 教材最多
  - 視覺回歸 / addon 生態最豐富
  - Chromatic 等服務只支援 Storybook
- **結論**：選 Storybook

### Alternative D: 找 freelance 設計師全包做 Figma + Dev

- **Pros**：質量最高
- **Cons**：成本（HK$200k+），MVP 預算可能不夠
- **結論**：MVP 階段建議 freelance 設計師做 Figma 高保真稿（HK$30-80k），dev 自己用 AI 寫元件

## Consequences

### Positive

- UI 元件複用度高，新頁面開發極快
- 設計變動有單一 source of truth
- 設計師 / 投資人 / 顧問可在不啟動 app 的情況下檢視 UI
- 視覺回歸測試自動發現 UI 退化
- Storybook 本身就是 demo 材料（可發 link 給投資人看「設計系統」）
- 對申請基金的「技術成熟度」加分

### Negative / Trade-offs

- 額外的 Storybook 配置工作（Phase 0 約 1 天）
- 每個元件多寫一個 stories 檔
- 大型 component 的 stories 寫起來繁瑣
- Storybook build size 大，CI 慢一些

### Neutral

- 視覺回歸測試需付費（Chromatic）或自建（Playwright + 比對工具）

## Implementation Notes

### 字型選擇（建議）

- **繁中 / 簡中標題**：思源宋體 (Source Han Serif) — 帶有正式感
- **繁中 / 簡中內文**：思源黑體 (Source Han Sans) — 易讀
- **英文 / 數字**：Inter — Web 標準
- **等寬**：JetBrains Mono — 程式碼 / 鏈上資料展示

### 色彩系統（待設計師微調）

預設為「冷靜深藍 + 金融金 + 警示紅」：

- Primary: 深藍（信任感）
- Accent: 金（價值 / 高貴）
- Success: 綠
- Danger: 紅
- Neutral: 灰階多階

實際色票由 ADR-0009 後續更新。

### Storybook 必裝 addons

- `@storybook/addon-essentials`
- `@storybook/addon-a11y`（無障礙檢查）
- `@storybook/addon-themes`（明暗模式）
- `@storybook/addon-i18n`（語言切換預覽）
- `@storybook/addon-viewport`（裝置預覽）

### 嚴禁事項

- ❌ 在 `apps/web` / `apps/console` 內 inline 寫元件並指望「之後重構」
- ❌ 重複實作已存在於 `packages/ui` 的元件
- ❌ 讓元件接受 `className` 隨便覆寫（會破壞設計系統一致性，必須有節制）
- ❌ 把業務邏輯 / API 呼叫寫進 `packages/ui` 元件（元件必須純展示，靠 props 注入）

### 投資（建議）

- Figma Professional 帳號：每月 USD 12
- Chromatic（視覺回歸）：免費 tier 夠 MVP，付費 USD 149/月
- 思源字型：免費（SIL Open Font License）
- shadcn/ui：免費

## References

- [Storybook 官方](https://storybook.js.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Chromatic](https://www.chromatic.com/)
- [docs/01-architecture.md 第 4.2 節](../01-architecture.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
