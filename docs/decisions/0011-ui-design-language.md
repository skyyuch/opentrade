# ADR-0011: OpenTrade UI 設計語言（Civic Trust + Web3 科技感）

## Status

Accepted

## Date

2026-05-17

## Context

OpenTrade 是 Web 3.0 去中心化金融服務評論平台。視覺設計直接決定三件事：

1. **使用者第一眼信任感** — 散戶看到平台不夠專業就不會留下評論
2. **基金 / 投資人簡報** — 數碼港 CCMF、HKSTP、創科局評委看 demo 5 分鐘內判斷「這團隊是否認真」
3. **與競品差異化** — 外匯天眼 (WikiFX) 的 UI 老派、彈窗廣告爆炸、配色俗艷；OpenTrade 若沒明顯勝出，散戶轉換成本太高

ADR-0009 已決定採用 Storybook-first 工作流。本 ADR 補上**設計語言本身**：氣質、色彩、字型、視覺武器。

未在此處決策的後果：每個元件開發者各自詮釋「OpenTrade 該長怎樣」→ 視覺破碎 → 信任感崩潰。

## Decision

### 1. 設計哲學一句話

> **「Civic Trust（公民信任感）」** — 像中環專業金融機構的數位化版本，帶 Web3 的開放透明氣質。

不採取：

- ❌ Crypto bro 視覺（紫粉、卡通、過動效）
- ❌ 傳統金融老派（棕木紋、過多襯線、複雜邊框）
- ❌ WikiFX 式廣告平台（多色亂搭、密集彈窗、紅藍橘碰撞）

採取：

- ✅ **Stripe** 的信任感 + 現代 + 科技
- ✅ **Linear** 的精緻 + 暗色精品
- ✅ 微量 **Bloomberg Terminal** 的權威（給 console 端）

### 2. 色彩系統（雙主色 + 莊重 functional）

#### 主色：Ink + Sapphire

| Role                     | Hex       | 用途                                 |
| ------------------------ | --------- | ------------------------------------ |
| Ink (`neutral-1000`)     | `#0B0F1A` | dark mode 主背景 / light mode 主文字 |
| Sapphire-700 (`primary`) | `#1E40AF` | primary action（沉穩不刺眼）         |
| Sapphire-500             | `#3B5BDB` | hover / link                         |
| Sapphire-300             | `#7C9CF5` | dark mode 高亮                       |

#### Accent：Gilded（氧化金）

| Role       | Hex       | 用途                              |
| ---------- | --------- | --------------------------------- |
| Gilded-500 | `#B68B4A` | SBT badge、verified mark、premium |
| Gilded-200 | `#F5EBD8` | premium bg（極少用）              |

**規則**：Gilded **稀少使用才珍貴**（≤ 10% 畫面），不可氾濫成裝飾色。

#### Functional（莊重不刺眼，不大紅大綠）

| Role               | Light     | Dark      |
| ------------------ | --------- | --------- |
| Success (Emerald)  | `#15803D` | `#22C55E` |
| Danger (Vermilion) | `#B91C1C` | `#EF4444` |
| Warning (Amber)    | `#B45309` | `#F59E0B` |

#### Neutrals

11 階 `neutral-0` (`#FFFFFF`) → `neutral-1000` (`#0B0F1A`)，**偏冷藍灰調**（非暖灰，避免居家感）。

#### Light / Dark 預設

| App            | Default           | Why                                 |
| -------------- | ----------------- | ----------------------------------- |
| `apps/web`     | Light             | SEO + 散戶閱讀慣性                  |
| `apps/console` | Dark              | Dashboard 專業感 + 降低長時操作疲勞 |
| Storybook      | Light + Dark 並排 | 同時驗證                            |

兩端皆支援使用者切換（透過 `next-themes`）。

### 3. 字型策略

| 用途            | Font                            | 備註           |
| --------------- | ------------------------------- | -------------- |
| 中文標題        | 思源宋體 Source Han Serif       | Phase 0.5 引入 |
| 中文內文        | 思源黑體 Source Han Sans        | Phase 0.5 引入 |
| 英數標題        | Inter Display                   | Phase 0 開始用 |
| 英數內文        | Inter                           | Phase 0 開始用 |
| 數字 / 鏈上資料 | JetBrains Mono + `tabular-nums` | 金融場景必須   |

**Phase 0 妥協**：思源字型檔 CJK 約 5-10 MB，自託管需要時間。Commit #3 先用 `Inter` + system CJK fallback，Phase 0.5 / 設計師 onboarding 後再引入思源字型。

**Type scale**（modular ratio 1.25）：`12 / 14 / 16 / 20 / 24 / 32 / 40 / 56`，最多 8 階。

**鐵律**：所有數字必須 `font-feature-settings: "tnum"`（tabular figures），表格才會對齊。

### 4. 視覺風格六鐵律

| #   | 原則          | 規範                                                     |
| --- | ------------- | -------------------------------------------------------- |
| 1   | Hairline 細線 | 1px border, `neutral-200` (light) / `neutral-800` (dark) |
| 2   | 適中圓角      | 6-8px (`md`)、`full` (pill)；禁全 0 死板 / 全 16px 卡通  |
| 3   | 陰影克制      | 不用 floating shadow，用 hairline border + bg elevation  |
| 4   | 空白慷慨      | 散戶端 padding 寬鬆；不可塞滿（vs WikiFX）               |
| 5   | 動效低調      | 150-250ms ease-out；禁 bounce / spin / glow 過動         |
| 6   | 資料密度可調  | Console 端 `compact / cozy / comfortable` 三檔           |

### 5. OpenTrade 獨有的視覺武器

這些是**競品沒有的視覺語言**，是降維打擊的視覺載體：

#### 5.1 「不可篡改印記」(`<ImmutableMark>`) ⭐ 品牌記憶點

每條鏈上資料（評論、KOL 訊號、仲裁結果）右上角一枚章戳：

- Hairline border + 微微凹陷感
- 顯示 `#block_height` + `0xtx_hash` 縮寫
- Monospace 字體（JetBrains Mono）
- 點擊跳區塊瀏覽器
- 視覺訊息：「**這資料蓋了章，不可改**」

這是 OpenTrade 對抗 WikiFX「收費刪負評」的視覺武器。每個用戶看到第一眼就會記住。

#### 5.2 「鏈上勳章」(`<SBTBadge>`)

| Tier          | 視覺        | 顏色     |
| ------------- | ----------- | -------- |
| L1 基本       | 簡單環      | Neutral  |
| L2 驗證用戶   | 環 + 對勾   | Sapphire |
| L3 創始陪審   | 環 + 五角星 | Gilded   |
| L4 商戶 / KOL | 環 + 盾牌   | Emerald  |

點擊查看 mint tx，hover 顯示獲得條件。

#### 5.3 「公正天平」icon system

- 基底：Lucide icons（1500+ 個）
- **自製 5-10 個**：scale-of-justice, jury, verdict, dispute, evidence, on-chain-stamp, sbt-mint, signal-pulse
- 統一 stroke-width 1.5px

#### 5.4 「透明度色階」(Source-of-Truth Visual Hierarchy)

| 來源          | 視覺                        | 用戶感知             |
| ------------- | --------------------------- | -------------------- |
| 🔗 鏈上可驗證 | Sapphire 藍 + ImmutableMark | 「可獨立驗證」       |
| 📡 API 資料   | Neutral 不修飾              | 「平台呈現」         |
| ⚠️ 機器翻譯   | Amber underline + label     | 「可看原文」         |
| 📋 商戶聲明   | Italic + 框                 | 「商戶自述，未驗證」 |

### 6. Design Token 結構

```
packages/ui/src/design-tokens/
├── colors.ts        # 11-step palette × 6 roles (primary/accent/success/danger/warning/neutral)
├── typography.ts    # font stacks / scale / weights / leading
├── spacing.ts       # 4-base: 0/1/2/3/4/6/8/12/16/24/32/48/64
├── radii.ts         # 0 / sm(4) / md(6) / lg(8) / xl(12) / full
├── shadows.ts       # 主要不用 shadow，定義 hairline-border + bg-elevation
├── motion.ts        # duration: 150/250/400ms × easing
├── breakpoints.ts   # 360 / 640 / 768 / 1024 / 1280 / 1536
├── z-index.ts       # base/dropdown/sticky/overlay/modal/toast
└── index.ts
```

`apps/web` / `apps/console` 透過 `tailwind.preset.ts` 共享同一 source，禁止在 app 層自定 design token。

## Alternatives Considered

### Alternative A: 採用 WikiFX 式視覺策略（多色亂搭、廣告風）

- Pros: 訊息量大、感覺「資料豐富」
- Cons: 視覺髒亂、不專業、無法做品牌 demo
- **結論**：不選

### Alternative B: 採用 Uniswap / Aave 等 DeFi 風格（紫粉、Geometric、卡通）

- Pros: Web3 識別度高、年輕
- Cons: 過度 crypto-bro，與「散戶用 Web2 體驗」策略衝突；HK 散戶（30-60 歲）反感
- **結論**：不選

### Alternative C: 採用 Bloomberg / Morningstar 傳統金融風格

- Pros: 權威、嚴肅
- Cons: 老派、難 demo「現代 Web3 創新」
- **結論**：Console 端部分借鑑（資料密度），整體不採用

### Alternative D: 不定設計語言，讓每個元件開發者自由詮釋

- Pros: 開發快
- Cons: 視覺破碎、品牌崩潰，違反 ADR-0009 Storybook-first 精神
- **結論**：不選

### Alternative E（採用）: Stripe + Linear + 微量 Bloomberg 的綜合，雙主色（Sapphire + Gilded），ImmutableMark 作品牌記憶點

## Consequences

### Positive

- 視覺與品牌記憶點明確（ImmutableMark、SBT Badge）
- 與所有競品形成明顯區隔
- 對基金評委、投資人、退休 SFC 董事都呈現專業可信任的氣質
- 雙主色克制（Sapphire + Gilded），不會視覺疲勞
- 字型 + 顏色 + 圓角全部從 design token 來，未來換 brand 容易
- Storybook 可獨立 demo 給設計師 / 投資人看「設計系統」

### Negative / Trade-offs

- Phase 0 不引入思源字型（中文字型暫用 system fallback），設計純粹度暫時打折
- 自製 icon set 需要設計師資源（Phase 0.6 才做）
- Gilded 金的「稀少使用」原則需要設計紀律維持（容易濫用）
- ImmutableMark 視覺需要在 Phase 1 真實連到鏈上後才能完整 demo

### Neutral

- 未來如果有設計師 audit，配色可能微調（hex 值層級調整不影響架構）
- Dark mode 是必選不是 nice-to-have（會增加每個元件的 stories 與 QA 成本）

## Implementation Notes

### Phase 0 Commit #3 最小可行集合

- [x] 完整 design tokens 8 個檔
- [x] `cn()` utility
- [x] `Button` primitive（cva 5 variants × 3 sizes）
- [x] Storybook setup（@storybook/react-vite + addon-themes/a11y/viewport）
- [x] 第一個 OpenTrade compound：`<ImmutableMark>`（純展示，mock data）

### 延後到後續 Commit

- 思源字型自託管（Phase 0.5 / 設計師 onboarding 後）
- 完整 primitives（Input / Card / Dialog / Toast 等）→ Commit #6 web 用到才補
- 完整 compounds（ReviewCard / SBTBadge / KOLSignalChart 等）→ Phase 1
- 自製 8 個 OpenTrade icons → Phase 0.6
- 視覺回歸測試（Chromatic）→ Phase 0 末

### 嚴禁事項

- ❌ 在 `apps/web` / `apps/console` 內 inline 寫元件並指望「之後重構」
- ❌ 在元件層 hardcode 顏色 / 字級 / 間距（必須 token）
- ❌ 用第三 / 第四強色（維持 Sapphire + Gilded 雙主色紀律）
- ❌ Gilded 金濫用作裝飾色（必須與「premium / 鏈上驗證」狀態綁定）
- ❌ ImmutableMark 在非鏈上資料上顯示（會誤導用戶）

## References

- ADR-0009: UI 採 Storybook 獨立工作流先行
- ADR-0010: 用戶端與商戶後台拆兩個獨立 Next.js app
- ADR-0003: i18n 三語架構
- `.cursor/rules/22-tailwind-shadcn.mdc`
- `.cursor/rules/21-react-nextjs.mdc`
- [Stripe](https://stripe.com)、[Linear](https://linear.app)、[Vercel](https://vercel.com) — 視覺參考
- 對話歸檔：`docs/conversations/2026-05-17-initial-planning.md`
