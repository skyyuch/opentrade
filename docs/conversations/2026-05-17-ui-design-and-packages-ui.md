# UI 設計策略 + packages/ui 初始化 — 2026-05-17（第二場）

> 本文件歸檔 OpenTrade Commit #3 工作 session 的精華內容。
> 接續 [`2026-05-17-initial-planning.md`](./2026-05-17-initial-planning.md)。

## 對話脈絡

- **日期**：2026-05-17（同日下午）
- **參與者**：項目負責人（skyyuch）+ Claude Opus 4.7（Cursor agent）
- **背景**：上一場 session 完成 Commit #1（文件骨架）與 Commit #2（Monorepo 骨架）。本場主題是 Commit #3 — 原規劃為 apps/web 初始化，但討論過程中重新調整為 packages/ui 初始化。

---

## 主要討論內容

### 1. 質疑原 commit 順序，調整為 Option C

使用者質疑：「不是先做 api 嗎？留到最後？」

分析後發現原計劃（web → console → api → db → ui → contracts）有兩個問題：

1. **依賴方向錯誤**：apps/web 排在 packages/ui 之前，但 web 依賴 ui 的 design system + 元件（rule 10 + ADR-0009）
2. **缺乏工程紀律**：API contract 沒先定，前端容易返工

提出三個選項：

- A. 維持原順序（視覺先行）
- B. 後端先（db → api → ui → web → console → contracts）
- C. 折衷（**ui → db → api → web → console → contracts**）⭐ 推薦

使用者選 **Option C**。理由：

- packages/ui 必須在 apps/web 之前（ADR-0009 + rule 10 強制）
- 後端 contract 先定符合工程紀律
- Storybook 本身就是視覺 demo

### 2. UI 設計哲學深度討論

使用者強調：「你會怎麼設計 UI，這個很重要」+「要有 web3.0 的科技感，不可以大紅大紫」

#### 最終定調的設計哲學

> **「Civic Trust（公民信任感）」** — 像中環專業金融機構的數位化版本，帶 Web3 的開放透明氣質。

#### 設計選擇

| 維度            | 決定                                                          |
| --------------- | ------------------------------------------------------------- |
| 設計參考        | Stripe + Linear + 微量 Bloomberg Terminal                     |
| 不採取          | Crypto bro 視覺（紫粉卡通）、傳統金融老派、WikiFX 式廣告平台  |
| 主色            | **Sapphire 藍寶石**（primary，深沉不刺眼）                    |
| Accent          | **Gilded 氧化金**（SBT / verified / premium，稀少使用 ≤ 10%） |
| Functional      | Emerald / Vermilion / Amber（莊重不刺眼，**不大紅大綠**）     |
| Neutral         | 冷藍灰調 slate（11 階，0=白 / 950=ink #0B0F1A）               |
| Light/Dark 預設 | web=Light、console=Dark                                       |
| 字型            | Inter + JetBrains Mono 為主；思源宋體/黑體 Phase 0.5 引入     |
| 數字鐵律        | 全 `tabular-nums`（金融場景必須）                             |
| 視覺氣質        | hairline border、克制陰影、慷慨空白、低調動效（150-250ms）    |

### 3. OpenTrade 獨有的視覺武器

這是 OpenTrade 對 WikiFX 真正的降維打擊：

#### `<ImmutableMark>` ⭐ 品牌記憶點

每筆鏈上資料右上角的章戳：

- Hairline border + monospace + #block + 0xtxhash 縮寫
- 點擊跳區塊瀏覽器
- 視覺訊息：「**這資料蓋了章，不可改**」
- **每一條評論都「蓋章」** — 像 Stripe 的綠色 ✓ 是品牌記憶點

#### 其他視覺武器（Phase 1 / 0.6 實作）

- `<SBTBadge>` — L1/L2/L3/L4 鏈上勳章
- 自製 8 個 OpenTrade icons（scale-of-justice, jury, verdict, dispute, evidence, on-chain-stamp, sbt-mint, signal-pulse）
- 「透明度色階」— 鏈上資料 vs API 資料 vs 翻譯 vs 商戶聲明 視覺區分

### 4. Phase 0 妥協方案

- ✅ 完整 design tokens（8 檔）
- ✅ Storybook + Button + ImmutableMark
- 🕐 思源字型自託管延後到 Phase 0.5（檔案太大 ~10 MB CJK）
- 🕐 完整 primitives（Input/Card/Dialog）延後到 apps/web 用到時補
- 🕐 自製 icons 延後到 Phase 0.6
- 🕐 Chromatic 視覺回歸延後到 Phase 0 末

---

## 產生的 ADR

- **ADR-0011**：OpenTrade UI 設計語言（Civic Trust + Web3 科技感）— 雙主色 Sapphire + Gilded，hairline 視覺，OpenTrade 獨有視覺武器（ImmutableMark / SBT / 透明度色階）

---

## 完成的 Commit（git 上 6 個）

```
b43398b docs(rules): sync rule 22 + rule 70 with packages/ui reality
a8522d0 feat(ui): add ImmutableMark compound — OpenTrade's signature visual
6f78515 feat(ui): add Button primitive (5 intents x 3 sizes, loading, asChild)
2964463 feat(ui): set up Storybook 8 with light/dark themes
e6181d3 feat(ui): scaffold design system foundations (tokens, cn, Tailwind preset)
e2e0342 docs(rules): add ADR-0011 UI design language + re-order Phase 0 commits
```

對應 Phase 0 路線圖的 **Commit #3：packages/ui 初始化**。

---

## 技術決策摘要（給未來 AI agent 快速理解）

### Design token 結構（雙層）

```ts
// 1. raw palette — HSL 三元組
palette = { sapphire, gilded, emerald, vermilion, amber, neutral }

// 2. semantic mapping — light + dark 套
semantic = {
  light: { background, foreground, primary, accent, success, ... },
  dark:  { background, foreground, primary, accent, success, ... },
}
```

CSS 變數寫在 `globals.css` 的 `:root` + `.dark`，Tailwind preset 透過 `hsl(var(--primary) / <alpha-value>)` 引用。

### Tailwind preset 共用

`packages/ui/tailwind.preset.ts` 是單一 source；`apps/web`、`apps/console`、Storybook 都 `presets: [preset]`。

### 為何 react 在 peerDependencies

`packages/ui` 是 library package — 將 react 從 dependencies 移到 peerDependencies 避免 consumer apps 出現 React duplicate。

### 為何 Button 用 cva + asChild

- cva = class-variance-authority，shadcn 標準 variant 模式
- asChild + Radix Slot = 讓 `<Button asChild><Link>...</Link></Button>` 可運作

### 為何 ImmutableMark 用 `<a>` 而非 `<button>`

跳區塊瀏覽器是 navigation 不是 action；`<a target="_blank">` 是正確語義。

---

## 過程中踩到 + 已修復的坑

| #   | 問題                                                                        | 解法                                                                                        |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `as const` 讓 fontSize tuple readonly，Tailwind config 不接受               | 改用顯式 `Record<string, [string, { lineHeight: string }]>`                                 |
| 2   | exactOptionalPropertyTypes 不允許 `prop: undefined` 顯式傳入                | 在 story 用 `render` 函式省略 prop                                                          |
| 3   | ESLint 預設 `consistent-type-definitions` prefer interface，與 rule 20 衝突 | 在 root eslint config override 為 `['error', 'type']`                                       |
| 4   | commitlint 把 body 內的 "Commit #6" 當成 issue ref 觸發 footer parser       | rule 70 加註提醒；改用 "the next commit" 等替代措辭                                         |
| 5   | `composite: true` + `noEmit` 看似衝突但實際可運作（既有 monorepo 模式）     | 沿用既有設定                                                                                |
| 6   | `packages/ui` 沒有 build 步驟卻有 `build` script 導致 turbo 警告            | 移除 `build` script；加 `build-storybook` 到 turbo pipeline 並設 storybook-static 為 output |

---

## 待後續處理事項

### 立即（下個 session）

1. **Commit #4：packages/db 初始化** — Prisma init + 第一個 migration（user / tenant / broker 基礎）

### 短期（後續 Phase 0 commits）

2. Commit #5：apps/api 初始化（Hono + DDD 骨架）
3. Commit #6：apps/web 初始化（**將消費 packages/ui 元件**，會用到 cn / Button / ImmutableMark）
4. Commit #7：apps/console（dark default）
5. Commit #8：packages/contracts（Foundry + OpenZeppelin）
6. Commit #9：Terraform IaC
7. Commit #10：GitHub Actions CI

### 跨 commit 持續累積

- 更多 primitives（Input / Card / Dialog / Toast）— 當 apps/web 真正用到時才補
- 更多 compounds（SBTBadge / ReviewCard / KOLSignalChart / JuryVotePanel / DisputeTimeline）— Phase 1
- 思源字型自託管 — Phase 0.5 / 設計師 onboarding 後
- 自製 OpenTrade icons — Phase 0.6
- Chromatic 視覺回歸測試 — Phase 0 末

---

## 給未來 AI agent 的建議

### 一定要記得的事

1. **Sapphire + Gilded 雙主色**是品牌核心，**不可隨意加第三強色** — 違反 ADR-0011
2. **Gilded 金 ≤ 10% 畫面**，只用於 SBT / verified / premium 狀態
3. **`<ImmutableMark>` 只能用於真正上鏈的資料** — 用在非鏈上資料會誤導用戶、毀掉品牌承諾
4. **所有數字必須 `tabular-nums`** — 金融場景必須，否則表格會跳
5. **元件先在 packages/ui 寫好 + stories** 才能被 apps 用（rule 22 + ADR-0009）
6. **Apps 不自寫 Tailwind theme**，必須 `presets: [preset]` extends `@opentrade/ui/tailwind-preset`

### 寫 commit message 注意

- 避免 body 用 `Commit #N` / `Phase #N` 模式（會觸發 commitlint footer parser）
- 避免 body 用「Token: value」（同樣會被當 footer trailer）

### Storybook 怎麼跑

```bash
pnpm --filter @opentrade/ui storybook         # dev :6006
pnpm --filter @opentrade/ui build-storybook   # static build
```

### apps/web / apps/console 整合 packages/ui 範本

```ts
// apps/web/tailwind.config.ts
import preset from '@opentrade/ui/tailwind-preset';
export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};
```

```ts
// apps/web/src/app/[locale]/layout.tsx
import '@opentrade/ui/styles/globals.css';
```

```tsx
// 元件使用
import { Button, ImmutableMark } from '@opentrade/ui';
```

---

## 連結

- ADR-0011: [`docs/decisions/0011-ui-design-language.md`](../decisions/0011-ui-design-language.md)
- packages/ui README: [`packages/ui/README.md`](../../packages/ui/README.md)
- 上一場 session: [`2026-05-17-initial-planning.md`](./2026-05-17-initial-planning.md)
- 當前狀態: [`docs/03-status.md`](../03-status.md)
- GitHub 提交記錄: [skyyuch/opentrade@b43398b](https://github.com/skyyuch/opentrade/commit/b43398b)
