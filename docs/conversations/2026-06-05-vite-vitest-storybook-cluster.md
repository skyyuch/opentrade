# Vite 7 / Vitest 4 / Storybook 10 叢集升級 — 2026-06-05

> 本文件歸檔 OpenTrade「依賴大遷移叢集」session 的精華內容。
> 接續 2026-06-04 依賴升級收尾（摘要 52）留下的 deferred 大遷移叢集。

## 對話脈絡

- **日期**：2026-06-05
- **參與者**：項目負責人（非技術背景）+ AI agent
- **AI 模型**：Claude Opus 4.8
- **背景**：Next 16（ADR-0040）+ Prisma 7（ADR-0041）+ 第二批安全 deps 皆已上 main。本 session 處理 (52) 留下的 deferred 大遷移叢集（Dependabot #8/#23/#24/#28）。

## 主要內容

### 1. 方向選擇 + 非技術 user 的決策引導

- user 一開始在 A（grant 骨架）/ B（依賴叢集）/ C（M13 narrative）三選一中選 **B**，並指示 **M12–M14 先暫緩**。
- 因 user 表明「完全不了解這部份」，agent 用白話解釋「開發工具保養、與產品/使用者無關」，並誠實說明「不換 vs 換」的利弊（不換＝零產品影響但債會滾大；換＝清雜訊、跟上維護、加分 due diligence，成本主要是 agent 工時）。
- user 追問「不換有什麼影響、換有什麼好處」後，拍板 **現在做、路徑 2、先寫 ADR**。

### 2. 關鍵技術發現（推翻上 session 的「Vite 6」估計）

- **Vite 已到 8.0.16**（latest）；上 session 估的「Vite 6」過時。
- **`@vitejs/plugin-react@6.x` peer 只吃 `vite ^8`，且硬拉 `@rolldown/plugin-babel` + `babel-plugin-react-compiler ^1`** — 即 plugin-react 6 = Rolldown + **React Compiler** 時代 plugin。採用它＝架構級的 React Compiler 決策，**不該混進例行 bump**。
- 路徑 2 不取 plugin-react 6 → **不需要 Vite 8**。
- 再者 **Vite 8 = Rolldown 預設**，實測會打掛 **Storybook 10 的 `builder-vite` plugins**（`inject-export-order-plugin` / `external-globals-plugin` 解析 story 檔噴「Parse error」，`build-storybook` 中止）。Vitest 用 Vite 8 沒事（不經 builder plugin），但 `build-storybook` 是設計系統硬 done-condition。
- → 最終鎖定 **Vite 7.3.5**（最後 esbuild/Rollup-based major；Vitest 4 / Storybook 10 / plugin-react 5 全支援），全 repo 統一 Vite 7。Vite 8 待 Storybook 支援 Rolldown 後再評估。

### 3. 執行（3 個 atomic commit，branch → PR #29）

- **`a4d3e9c` docs(decisions)**：ADR-0042（路徑 2 + 為何 Vite 7 不 8 + 暫緩 plugin-react 6/React Compiler）+ README 索引。
- **`92f56d9` build(ui)**：`packages/ui` 全棧 — vite 5→7.3.5、vitest+coverage-v8 3→4.1.8、plugin-react 4→5.2.0、storybook 8.6→10.4.2。Storybook 10 遷移：移除空殼 `addon-essentials`/`addon-interactions`/`blocks`/`test`、新增 `@storybook/addon-docs`、story type imports 改 `@storybook/react-vite`、`@storybook/test`→`storybook/test`、mdx blocks→`@storybook/addon-docs/blocks`、移除已廢的 `docs.autodocs`（autodocs 改由 preview 的 `tags` 控制）。
- **`9fed5d7` build(api,web,shared)**：vitest+coverage-v8 3→4.1.8 + 明確 pin `vite ^7.3.5`（避免 peer 解析意外拉到 Vite 8）。

### 4. Vitest 4 jest-dom 兩個踩坑（ui + web）

- **Runtime「Invalid Chai property」**：Vitest 4 Module Runner 不與外部化的 `@testing-library/jest-dom/vitest` auto-extend entry 共用 `expect` 實例。修法：setup 改 `import * as matchers from '@testing-library/jest-dom/matchers'` + `expect.extend(matchers)`（在 inlined setup 檔用 vitest 的 `expect`，同實例）。
- **型別 `toBeInTheDocument` does not exist**：vitest 4.1.6+ 停止合併外部對 `Assertion` 介面的型別擴充（jest-dom 6.9.1 仍 augment `Assertion`）。修法：`declare module 'vitest' { interface Matchers<T = any> extends TestingLibraryMatchers<any, T> {} }`（改擴充 `Matchers`）。

### 5. 驗證

typecheck 8/8 + lint 0 error/11 既有 warning + test:unit（ui 60 / web 28 / api 108 / shared 24）+ build 4/4（web/console Next 16 未受影響）+ `build-storybook` 全綠。關閉 Dependabot #23/#24/#28。

## 產生的 ADR

- **ADR-0042**：Upgrade Vite 7 / Vitest 4 / Storybook 10 cluster; defer plugin-react 6 + React Compiler。

## 待後續處理事項

- **`#8` @vitejs/plugin-react 6 + React Compiler**：須獨立 ADR 評估（會改變元件撰寫/優化方式）；同時等 Storybook 支援 Rolldown 後再評估 Vite 8。
- **`#15` tailwindcss 4**：CSS-first 重寫，獨立大遷移。
- **業務 backlog（user 暫緩中）**：M12 grant 骨架（6/8）、M13 vision/roadmap 升級（6/20）、M14 rule 52 content moderation。
- **`vite-tsconfig-paths` 可改用 Vite 7 原生 `resolve.tsconfigPaths`**（Vite 啟動時有提示）：非必要，未來可順手清。

## 給未來 AI agent 的建議

- **依賴升級前先查 registry 實況**：Dependabot 給的目標版本可能比交接假設新好幾個 major（本例 Vite「6」實際已 8）；major plugin 的 peer 可能硬綁特定 bundler/compiler。
- **「最新」未必是對的目標**：Vite 8（Rolldown）打掛 Storybook 10 builder，Vite 7 才是務實終點。實作中發現的版本約束要回寫 ADR（本 session amend ADR-0042 Vite 8→7）。
- **Vitest 4 jest-dom**：別再用 `import '@testing-library/jest-dom/vitest'` 自動 extend；用 `expect.extend` 手動註冊 + 擴充 `Matchers`（見 rule 60 新增段）。
- **把架構級依賴（React Compiler）從例行 bump 切開**：plugin-react 6 該走獨立 ADR，不混進工具叢集升級。
