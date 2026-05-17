# OpenTrade 當前狀態

> ⚠️ **這是項目最動態的文件，每個 session 必讀必寫。**
> 任何 AI agent 開始工作前，必須先讀本檔取得最新進度。
> 任何 AI agent 結束 session 前，必須更新本檔。

---

## 最後更新

- **日期**：2026-05-17
- **更新者**：UI 設計策略 session（Claude Opus 4.7）— Commit #3 進行中
- **本次更新摘要**：寫 ADR-0011（UI 設計語言）；重新排序 Phase 0 commits 為依賴正確的 Option C（ui → db → api → web → console → contracts）；開始 packages/ui 初始化

---

## 當前 Phase

**Phase 0：地基搭建**

進度：65%

---

## 已完成

### Commit #1：文件骨架 + Cursor Rules

- [x] `AGENTS.md`、`README.md`、`.gitignore`、`.editorconfig`
- [x] `docs/00-vision.md` ~ `04-glossary.md`
- [x] `docs/decisions/` 0001-0010 + README
- [x] `docs/conversations/2026-05-17-initial-planning.md`
- [x] `docs/grant-application/README.md`
- [x] `.cursor/rules/` 全部 17 條規則

### 工具鏈安裝（本次 session 中安裝在使用者本機）

- [x] nvm v0.40.3 → `~/.nvm/`
- [x] Node.js v22.22.3 (LTS Jod)
- [x] pnpm v9.15.4（透過 corepack）
- [x] `~/.zshrc`（首次建立，含 nvm + auto-use `.nvmrc` hook）

### Commit #2：Monorepo 骨架

- [x] root `package.json`（pnpm + Turborepo 設定）
- [x] `pnpm-workspace.yaml`
- [x] `turbo.json`（task pipeline + cache 策略）
- [x] `tsconfig.base.json`（strict TypeScript 全套規則）
- [x] `.nvmrc` / `.node-version`（鎖定 Node 22）
- [x] `.npmrc`（pnpm 行為規範）
- [x] `eslint.config.mjs`（ESLint 9 flat config）
- [x] `prettier.config.mjs` + `.prettierignore`
- [x] `commitlint.config.mjs`
- [x] `.husky/pre-commit` + `.husky/commit-msg`
- [x] 8 個 stub packages（apps/web, apps/console, apps/api, packages/{contracts,db,ui,shared,config}）
- [x] 每個 stub 含 `package.json`、`tsconfig.json`、`README.md`、`src/index.ts`
- [x] `pnpm install` 通過（262 個依賴）
- [x] `pnpm typecheck` 通過（8/8 packages）
- [x] `pnpm lint` 通過（8/8 packages）
- [x] `pnpm format:check` 通過

### GitHub 設定

- [x] git config：`skyyuch <skyyuch@gmail.com>`
- [x] Remote 連 `git@github.com:skyyuch/opentrade.git`（SSH）
- [x] Commit #1 推送到 GitHub
- [ ] Commit #2 推送（即將）

---

## 進行中

### Commit #3：packages/ui 初始化（設計系統地基）

- [x] ADR-0011：UI 設計語言（Civic Trust + Web3 科技感）
- [x] docs/03-status.md：commit 順序調整為 Option C
- [ ] packages/ui scaffolding（deps + tsconfig + tailwind preset）
- [ ] packages/ui design tokens（colors / typography / spacing / radii / shadows / motion / breakpoints / z-index）
- [ ] packages/ui `cn()` utility
- [ ] packages/ui Storybook setup（@storybook/react-vite）
- [ ] packages/ui `<Button>` primitive + stories
- [ ] packages/ui `<ImmutableMark>` compound（OpenTrade 視覺武器）+ stories
- [ ] 驗證 + commit

---

## 下一步（按優先序，**已調整成 Option C：依賴方向正確的順序**）

> **順序調整原因**：原計劃讓 apps/web 先於 packages/ui，違反 rule 10 依賴方向（web → ui）與 ADR-0009 Storybook-first 原則。重新排序：先設計系統 → 後端 contract → 前端組合。詳見 ADR-0011 與 2026-05-17 session conversation。

### 立即（本 session）

1. **Commit #3：packages/ui 初始化** ⭐ 進行中 — design tokens + cn + Button + Storybook + ImmutableMark

### 接下來（依序）

2. **Commit #4：packages/db 初始化** — Prisma init + 第一個 migration（user/tenant/broker 基礎）
3. **Commit #5：apps/api 初始化** — Hono + DDD 骨架（health endpoint，尚不寫業務）
4. **Commit #6：apps/web 初始化** — Next.js 14 App Router + next-intl + Tailwind + 使用 packages/ui 元件
5. **Commit #7：apps/console 初始化** — Next.js 14（dark default + dashboard 風格）
6. **Commit #8：packages/contracts 初始化** — Foundry init + OpenZeppelin
7. **Commit #9：infra/terraform 雛形** — VPC、RDS、ECS Fargate、S3、Secrets Manager
8. **Commit #10：CI/CD GitHub Actions** — lint + typecheck + test 在 PR 上自動跑

### 中期（Phase 1）

完成 Phase 0 所有 commit 後，進入 Phase 1 MVP-A（鏈上評論功能）。

---

## 待決策（懸而未決的問題）

### 環境 / 帳號層級

- ❓ **AWS 帳號**：是否已有？要建 dev/staging/prod 三帳號還是先一個？
- ❓ **網域**：opentrade.io / .hk / .app — 之後再決定，不影響開發
- ❓ **AI 翻譯服務**：DeepL（主）vs OpenAI GPT（備）— 已預設 DeepL 主
- ❓ **GitHub Org 化**：目前是 `skyyuch/opentrade` 個人 repo。是否轉 GitHub Org `opentrade-hk`？
- ❓ **Repo Public/Private**：目前 GitHub 上是 Public（看 web 結果）。建議改 Private（在 SFC 高層董事正式加入前）。

### 業務層級

- ❓ **退休 SFC 高層董事人選**：何時正式加入？影響合規定位 narrative
- ❓ **預算上限**：本季 / 本年度的開發預算（影響 AWS 規模、設計師外包）
- ❓ **第一批種子陪審員邀請名單**：Phase 4 需要 30-50 位

### 技術層級

- ❓ **License 選擇**：Business Source License 1.1 vs AGPL-3.0 — 上線前決定
- ❓ **設計師資源**：是否找 freelance 香港設計師（HK$30-80k 預算）做 Figma 高保真稿
- ❓ **KOL 訊號的 oracle**：Chainlink Price Feeds vs Pyth — Phase 2 開始前決定

---

## 已知風險

| 風險                       | 嚴重度 | 緩解措施                                                      |
| -------------------------- | ------ | ------------------------------------------------------------- |
| 沒有 Web3 開發經驗         | 中     | 用 Foundry + OpenZeppelin + AI 輔助；上主網前必做第三方 audit |
| 冷啟動使用者來源           | 高     | 種子陪審員（業界人脈）+ Glassdoor 式 Give-to-Get 機制         |
| 香港 SFC 第 4 類牌照風險   | 中     | 純技術定位 + disclaimer + 退休 SFC 董事背書                   |
| KOL 不願意上鏈被監督       | 中     | 把不上鏈定位為紅旗，創造「上鏈 KOL」精英身分                  |
| AWS 成本失控               | 低     | dev 環境用最低規格，prod 規模隨用戶增長                       |
| AI 翻譯品質不夠            | 低     | DeepL + 標明「機器翻譯」+ 後續引入人工校對                    |
| 使用者 Mac 是全新 dev 環境 | 已緩解 | 已透過 nvm 安裝 Node + pnpm；流程記錄在本檔                   |

---

## 環境基準（給新 session / 新人快速重建）

```bash
# Node 與 pnpm
node -v   # v22.22.3 (LTS Jod, 透過 nvm 管理)
pnpm -v   # 9.15.4 (透過 corepack 啟用)

# 進入專案後
cd OpenTrade
pnpm install        # 安裝全部 262 個依賴
pnpm typecheck      # 全包 type 檢查
pnpm lint           # 全包 ESLint
pnpm format:check   # 全包 Prettier 檢查
```

`.nvmrc` 已設為 `22`，使用者進到專案資料夾時 zsh hook 會自動切到正確 Node 版本。

---

## 重要連結

- AI Agent 入口：[`AGENTS.md`](../AGENTS.md)
- 願景：[`00-vision.md`](./00-vision.md)
- 架構：[`01-architecture.md`](./01-architecture.md)
- 路線圖：[`02-roadmap.md`](./02-roadmap.md)
- 術語：[`04-glossary.md`](./04-glossary.md)
- 架構決策：[`decisions/`](./decisions/)
- GitHub: [skyyuch/opentrade](https://github.com/skyyuch/opentrade)

---

## Session History

| 日期       | Session 主題                                       | Agent 模型      | 主要產出                                              | Conversation Log                                       |
| ---------- | -------------------------------------------------- | --------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| 2026-05-17 | 初始規劃 + 建立項目記憶系統 + Monorepo 骨架        | Claude Opus 4.7 | Commit #1 文件骨架 + Commit #2 Monorepo + GitHub 連線 | [link](./conversations/2026-05-17-initial-planning.md) |
| 2026-05-17 | UI 設計策略 + commit 順序調整 + packages/ui 初始化 | Claude Opus 4.7 | ADR-0011 UI 設計語言 + Commit #3 packages/ui 進行中   | （session 結束前歸檔）                                 |
