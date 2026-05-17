# OpenTrade 當前狀態

> ⚠️ **這是項目最動態的文件，每個 session 必讀必寫。**
> 任何 AI agent 開始工作前，必須先讀本檔取得最新進度。
> 任何 AI agent 結束 session 前，必須更新本檔。

---

## 最後更新

- **日期**：2026-05-17
- **更新者**：Commit #4 session（Claude Opus 4.7）— `packages/db` 初始化
- **本次更新摘要**：完成 Commit #4 — root docker-compose Postgres 16、`@opentrade/db` Prisma 6.19.3 骨架（zod env + HMR-safe singleton client）、首個 migration（Tenant / User / Broker / BrokerLicense + 5 個 enum、17 個 index、4 個 FK），實際 apply 到本機 docker DB 驗證；ADR-0012 寫定本機 dev DB 策略、ADR-0013 寫定 Prisma 6.x pin 策略

---

## 當前 Phase

**Phase 0：地基搭建**

進度：82%

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

### Commit #3：packages/ui 初始化（設計系統地基）

- [x] ADR-0011：UI 設計語言（Civic Trust + Web3 科技感 / Sapphire + Gilded 雙主色）
- [x] 重排序 Phase 0 commits 為 Option C（ui → db → api → web → console → contracts）
- [x] Design tokens 完整集合（colors / typography / spacing / radii / shadows / motion / breakpoints / z-index）
- [x] `cn()` utility（clsx + tailwind-merge）
- [x] Tailwind preset（HSL CSS 變數 + light/dark 雙主題）
- [x] `globals.css`（@tailwind + CSS custom properties + tabular-nums for finance）
- [x] Storybook 8（@storybook/react-vite + addon-themes / a11y / interactions）
- [x] Foundations stories：Introduction (MDX) + DesignTokens（palette / semantic roles / typography）
- [x] `<Button>` primitive — 5 intents × 3 sizes，cva variants，asChild slot，loading state
- [x] `<ImmutableMark>` compound — OpenTrade 視覺武器（每筆鏈上資料的不可篡改章戳）
- [x] Button + ImmutableMark stories 涵蓋三語、light/dark、in-context demo（review card / KOL signal）
- [x] Storybook build 通過、root typecheck/lint/format 全 pass

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

### Commit #4：packages/db 初始化（本 session 完成）

- [x] ADR-0012：本機開發環境使用 docker-compose 跑 PostgreSQL
- [x] ADR-0013：Pin Prisma 到 6.x，暫不升 Prisma 7（driver-adapter 模式過於前沿）
- [x] root `docker-compose.yml`（Postgres 16-alpine + named volume + healthcheck + UTC tz）
- [x] root `.env.example`（DATABASE_URL / DATABASE_READ_URL + 預留 JWT / Privy / 鏈 / IPFS slots）
- [x] root `README.md` 加「本機開發環境」段落（前置依賴、第一次設定、日常指令）
- [x] `packages/db/prisma/schema.prisma`：
  - 5 個 enum（`UserRole`、`SbtTier`、`Regulator`、`LicenseType`、`LicenseStatus`）
  - 4 個 model（`Tenant`、`User`、`Broker`、`BrokerLicense`）
  - 全程符合 rule 31 命名（PascalCase model / camelCase 欄位 / snake_case 表名 / UUID PK / `tenantId` / `createdAt-updatedAt-deletedAt` 三件套）
  - `Tenant.timezone` + `Tenant.defaultLocale` + `User.preferredLocale` 預載
  - 牌照正規化為獨立表（吊銷不刪 row，只改 status）
- [x] `packages/db/src/env.ts`：zod 驗證 `DATABASE_URL` / `DATABASE_READ_URL`（per rule 50）
- [x] `packages/db/src/client.ts`：PrismaClient HMR-safe singleton（rw + readonly）
- [x] `packages/db/src/index.ts`：re-export 模型 type + enum 值（前端 `import type` 紀律）
- [x] `package.json` scripts：`db:format / db:generate / db:migrate:dev / db:migrate:deploy / db:migrate:status / db:migrate:reset / db:studio`（全部走 `dotenv-cli -e ../../.env`）
- [x] postinstall hook 自動 `prisma generate`（新人 `pnpm install` 即拿到 typed client）
- [x] 首個 migration `20260517100533_init_tenant_user_broker_license` 真實 apply 到本機 docker DB
- [x] 驗證：4 表 + 5 enum + 17 index + 4 FK 在容器內正確存在
- [x] 全包 `pnpm typecheck / lint / format:check` 全綠

### GitHub 設定

- [x] git config：`skyyuch <skyyuch@gmail.com>`
- [x] Remote 連 `git@github.com:skyyuch/opentrade.git`（SSH）
- [x] Commit #1 推送到 GitHub
- [ ] Commit #2 / #3 / #4 push 到 GitHub（本 session 結束時統一 push）

---

## 進行中

無（本 session 完成 Commit #4 後即停止 / 換手）。

---

## 下一步（按優先序，**已調整成 Option C：依賴方向正確的順序**）

> **順序調整原因**：原計劃讓 apps/web 先於 packages/ui，違反 rule 10 依賴方向（web → ui）與 ADR-0009 Storybook-first 原則。重新排序：先設計系統 → 後端 contract → 前端組合。詳見 ADR-0011 與 2026-05-17 session conversation。

### 立即（下個 session）

1. **Commit #5：apps/api 初始化** — Hono + DDD 骨架（health endpoint 連 `@opentrade/db`，尚不寫業務 domain）；env 模組擴大；OutboxEvent 表進 schema
2. **Commit #6：apps/web 初始化** — Next.js 14 App Router + next-intl + Tailwind + 使用 packages/ui 元件
3. **Commit #7：apps/console 初始化** — Next.js 14（dark default + dashboard 風格）
4. **Commit #8：packages/contracts 初始化** — Foundry init + OpenZeppelin
5. **Commit #9：infra/terraform 雛形** — VPC、RDS、ECS Fargate、S3、Secrets Manager
6. **Commit #10：CI/CD GitHub Actions** — lint + typecheck + test + migrate 在 PR 上自動跑（並設 Renovate / dependabot 排除 Prisma 7.x，per ADR-0013）

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
- ❓ **Prisma 7 升級時機**：目前 pin 6.x（ADR-0013）；Prisma 7 driver-adapter 模式成熟後（>= 7.5+ 或 12 個月後）寫 successor ADR
- ❓ **User.email 加密策略**：Phase 0 `String?` 占位；Commit #5 起需決定 envelope encryption（KMS）vs application-level encryption（AES-256-GCM）

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
docker --version  # 29.4.2 (Commit #4 起本機 dev DB 必備, per ADR-0012)

# 進入專案後
cd OpenTrade
cp .env.example .env                            # 首次：建立 gitignored .env
pnpm install                                    # 安裝全部依賴 (postinstall 跑 prisma generate)
docker compose up -d postgres                   # 起本機 Postgres 16
pnpm --filter @opentrade/db db:migrate:dev      # apply 任何 pending migration
pnpm typecheck                                  # 全包 type 檢查
pnpm lint                                       # 全包 ESLint
pnpm format:check                               # 全包 Prettier 檢查
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

| 日期       | Session 主題                                       | Agent 模型      | 主要產出                                                                                                                                                      | Conversation Log                                                |
| ---------- | -------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 2026-05-17 | 初始規劃 + 建立項目記憶系統 + Monorepo 骨架        | Claude Opus 4.7 | Commit #1 文件骨架 + Commit #2 Monorepo + GitHub 連線                                                                                                         | [link](./conversations/2026-05-17-initial-planning.md)          |
| 2026-05-17 | UI 設計策略 + commit 順序調整 + packages/ui 初始化 | Claude Opus 4.7 | ADR-0011 UI 設計語言 + Commit #3 packages/ui 完成（design tokens、Storybook、Button、ImmutableMark）                                                          | [link](./conversations/2026-05-17-ui-design-and-packages-ui.md) |
| 2026-05-17 | packages/db 初始化（Commit #4）                    | Claude Opus 4.7 | ADR-0012 本機 docker Postgres + ADR-0013 Pin Prisma 6.x + Commit #4 完成（Tenant/User/Broker/BrokerLicense + 5 enum + 17 index，首個 migration apply 到本機） | [link](./conversations/2026-05-17-commit-4-packages-db.md)      |
