# OpenTrade 當前狀態

> ⚠️ **這是項目最動態的文件，每個 session 必讀必寫。**
> 任何 AI agent 開始工作前，必須先讀本檔取得最新進度。
> 任何 AI agent 結束 session 前，必須更新本檔。

---

## 最後更新

- **日期**：2026-05-17
- **更新者**：Commit number-six session（Claude Opus 4.7）— `apps/web` 初始化
- **本次更新摘要**：完成 Commit number-six — `apps/web` Next.js 14 + next-intl 4 三語（zh-Hant 預設 / zh-Hans / en，`as-needed` prefix）+ Tailwind 接 `@opentrade/ui/tailwind-preset` + `next-themes` ThemeProvider（light default per ADR-0011）+ Inter via `next/font/google`（build-time self-hosted，GDPR-safe）+ zod-validated `NEXT_PUBLIC_API_URL` env + 端到端 typed API client（`apiGet<T>` + `ApiClientError` lift rule 30 envelope）+ `HealthReportDto` 移到 `packages/shared`（避免跨 apps 邊界，per rule 10）+ `/status` 頁面 Server Component 對接 `apps/api/v1/health`（首次在 Storybook 之外真實使用 `<Button>`）+ `RefreshButton` Client Component（useTransition + locale-aware `useRouter`）；prod `next build` 9 個 SSG static page 全綠、prod `next start` + apps/api 端到端三 locale 真實 DB 延遲驗證；同時 ship Cursor Rules 5 項 deferred sync（rule 30 AppError 簽章、預設 statusCode、error envelope `requestId` + rule 31 seed bootstrap-data 例外 + commitlint scope `status`）

---

## 當前 Phase

**Phase 0：地基搭建**

進度：93%

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

### Commit number-six：apps/web 初始化（本 session 完成）

- [x] `apps/web/package.json`：Next 14.2.35（pin 14，待寫 ADR 評估升 15/16）+ React 18.3.1 + next-intl 4.12 + next-themes 0.4.6 + lucide-react + zod 4.4.3 + dotenv-cli + Tailwind 3.4.17 + PostCSS / autoprefixer 全裝齊
- [x] root `.env.example` + `.env`：補 `NEXT_PUBLIC_API_URL=http://localhost:4000` 段落（含 rule 50 「絕不放 secret 在 NEXT*PUBLIC*\*」提醒）
- [x] `apps/web/next.config.mjs`：`createNextIntlPlugin` + `transpilePackages: ['@opentrade/ui', '@opentrade/shared', '@opentrade/config']`（workspace TS source 直消費）+ `reactStrictMode` + `poweredByHeader: false` + 在 docblock 紀錄 apps/web vs apps/api specifier 慣例差異（bare vs `.js`）
- [x] `apps/web/tailwind.config.ts`：extends `@opentrade/ui/tailwind-preset`（不重定義 token，per rule 22）+ content scan 自身與 `packages/ui/src`
- [x] `apps/web/postcss.config.mjs`：tailwindcss + autoprefixer
- [x] `apps/web/src/i18n/`：`routing.ts`（`defineRouting` 三 locale + `defaultLocale: 'zh-Hant'` + `localePrefix: 'as-needed'`）+ `request.ts`（`getRequestConfig` + 動態載 messages JSON）+ `navigation.ts`（locale-aware `Link` / `redirect` / `useRouter` 等 wrappers）
- [x] `apps/web/src/middleware.ts`：`createMiddleware(routing)` + matcher 排除 `api` / `_next` / dotted paths
- [x] `apps/web/src/app/[locale]/layout.tsx`：root layout（`<html>` + `<body>`）+ `hasLocale` 守門（不合法 locale → 404）+ `getMessages` + `<NextIntlClientProvider>` 包裝 + `Inter` from `next/font/google`（build-time self-host）+ `<ThemeProvider>` 包外層（light default，per ADR-0011）+ `generateMetadata` 本地化（title/description 從 messages 翻譯）+ `generateStaticParams` 三 locale 都 SSG
- [x] `apps/web/src/components/providers/ThemeProvider.tsx`：`'use client'` wrapper for `next-themes`（attribute=class、defaultTheme=light、enableSystem、disableTransitionOnChange）
- [x] `apps/web/messages/{zh-Hant,zh-Hans,en}.json`：`home` + `status` 兩 namespace 全 ship（含 plural-aware uptime keys + 三狀態 label + error 顯示鍵）
- [x] `apps/web/src/env.ts`：zod 驗證 `NEXT_PUBLIC_API_URL` + 用 `process.env['NEXT_PUBLIC_API_URL']` literal-bracket（兼顧 TS strict `noPropertyAccessFromIndexSignature` 與 Next DefinePlugin inlining）
- [x] `apps/web/src/lib/api/client.ts`：`apiGet<T>` typed fetch wrapper + `ApiClientError` 把 rule 30 envelope 抬成 throwable（保留 code / requestId / details）+ `fetchHealth()` typed alias
- [x] `packages/shared/src/health/HealthReportDto.ts`：移 DTO 從 `apps/api` 來，避開 apps→apps 邊界（per rule 10）；`apps/api` 那份改成一行 re-export
- [x] `apps/web/src/app/[locale]/page.tsx`：placeholder home（讀 `home.*` 翻譯 + 純 Tailwind utility）
- [x] `apps/web/src/app/[locale]/status/page.tsx`：Server Component 端到端，每請求 `next: { revalidate: 0 }` 打 `/v1/health`、try/catch 抓 `ApiClientError` 渲染 graceful 錯誤卡（不 throw）+ `Intl.DateTimeFormat` 用 locale 格式化檢查時間 + 三狀態 icon（lucide）+ uptime plural-aware 字串
- [x] `apps/web/src/components/status/RefreshButton.tsx`：`'use client'` 用 `useTransition` + locale-aware `useRouter().refresh()`（首次在 Storybook 之外真實使用 `<Button intent="outline" loading={isPending} leadingIcon={<RefreshCw/>}>`）
- [x] `apps/web/scripts`：dev/build/start 全包 `dotenv -e ../../.env --` 與 `apps/api` 一致從 root `.env` 讀
- [x] root `eslint.config.mjs`：加 Next.js 框架慣例 default-export 例外 overlay（page/layout/middleware/i18n-request/next.config 等檔名）
- [x] dev 端到端三 locale 驗證 + prod `next build` 9 個 SSG static page + `next start` 真實 DB 延遲驗證全綠
- [x] 本 session **同時 ship** Cursor Rules 5 項 deferred sync（rule 30 AppError options bag + 預設 500 + envelope `requestId`、rule 31 seed bootstrap-data 例外、commitlint scope `status`）

### Commit number-five：apps/api 初始化

- [x] ADR-0014：apps/api 運行架構（env fail-fast、tsup bundling 規則、`@prisma/client` 為何在 apps/api 直接依賴）
- [x] `apps/api/package.json`：Hono 4.12 / @hono/node-server / @hono/zod-validator / pino 10 / pino-pretty / zod 4 / tsx / tsup 全裝齊
- [x] root `.env.example` + `.env`：補 `SERVER_HOST` / `SERVER_PORT` / `CORS_ORIGIN` / `LOG_LEVEL` / `JWT_SECRET` placeholder
- [x] `apps/api/src/shared/env.ts`：zod 驗證、fail-fast on import（per ADR-0014）
- [x] `apps/api/src/shared/observability/logger.ts`：Pino 結構化 JSON + dev pino-pretty + PII redact 兜底
- [x] `apps/api/src/shared/errors/`：`AppError` class + `ErrorCode` const-object union（per rule 20「禁 TS enum」）
- [x] `apps/api/src/http/`：`server.ts` factory + `main.ts` 入口 + `middleware/requestContext.ts`（hono/request-id + Pino child）+ `middleware/errorHandler.ts`（AppError / HTTPException / ZodError / unknown 四路統一封包）+ CORS 白名單
- [x] `apps/api/src/domains/health/`：完整四層 DDD 樣板（domain VO + IRepository / pure use case / Prisma adapter 附 2 秒超時 / Hono router + DTO + mapper）
- [x] `/v1/health` 真實打本機 docker Postgres，200 OK 附真實延遲 + X-Request-Id 標頭；DB DOWN 自動回 503
- [x] `packages/db/prisma/schema.prisma` 加 `OutboxEvent` model（per ADR-0006 outbox pattern；tenantId + 三條索引 + FK 到 Tenant）+ 新 migration `20260517102829_add_outbox_events` apply 到本機 DB 驗證
- [x] `packages/db/scripts/seed.ts` + `db:seed` script：冪等 upsert `hk` Tenant（雙跑驗證單 row 不重複）
- [x] `apps/api/tsup.config.ts`：生產 bundle 配置（workspace 內聯、@prisma/client + pino-pretty external、dist/main.js 15 kB）
- [x] `node dist/main.js` 跑通：production NODE_ENV → 純 JSON Pino + DB ping 200
- [x] `apps/api/README.md` + root `README.md`：四層 DDD 結構、env keys、wire envelope、dev + prod 啟動指令完整文件化
- [x] 全包 `pnpm typecheck / lint / format:check` 全綠

### Commit #4：packages/db 初始化

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
- [x] Commit #1 ~ number-five 全部 push 到 GitHub
- [ ] Commit number-six（本 session 6 個 commit + 1 個 docs commit）尚未 push（等使用者確認後再 push）

---

## 進行中

無（本 session 完成 Commit number-six 後即停止 / 換手）。

---

## 下一步（按優先序，**已調整成 Option C：依賴方向正確的順序**）

> **順序調整原因**：原計劃讓 apps/web 先於 packages/ui，違反 rule 10 依賴方向（web → ui）與 ADR-0009 Storybook-first 原則。重新排序：先設計系統 → 後端 contract → 前端組合。詳見 ADR-0011 與 2026-05-17 session conversation。

### 立即（下個 session）

1. **Commit number-seven：apps/console 初始化** — Next.js 14（dark default per ADR-0011 + dashboard 風格 + 商戶 dashboard 殼）；可大量複用 `apps/web` 的 i18n / Tailwind / theme 模板
2. **Commit number-eight：packages/contracts 初始化** — Foundry init + OpenZeppelin
3. **Commit number-nine：infra/terraform 雛形** — VPC、RDS、ECS Fargate、S3、Secrets Manager；同時補 `apps/api/Dockerfile`（per ADR-0014 implementation notes：copy `.prisma/client` engines + `dist/main.js`）
4. **Commit number-ten：CI/CD GitHub Actions** — lint + typecheck + test + migrate 在 PR 上自動跑；Renovate / dependabot 排除 Prisma 7.x（per ADR-0013）；加 ESLint 規則阻止前端 runtime import `@opentrade/db`（per Commit #4 conversation 提到的紀律強化）

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
- ❓ **User.email 加密策略**：Phase 0 `String?` 占位；Phase 1 auth flow 上線前需決定 envelope encryption（KMS）vs application-level encryption（AES-256-GCM）
- ❓ **API 認證流程**：`JWT_SECRET` 目前是 placeholder（min 32 chars 驗證通過即可）；Phase 1 換 ES256 + AWS Secrets Manager（per rule 50）+ Privy token exchange endpoint（per ADR-0005）
- ❓ **`packages/db` 是否需要真實 build 步驟**：目前 `main: "./src/index.ts"`，dev 直消費 TS；ADR-0014 記錄為「延後」；何時觸發改建 = 多個 consumer 或 cold-start 變慢時
- ❓ **Next.js 14 → 15 / 16 升級評估**：commit number-six pin `~14.2.35`（per AGENTS.md tech table 寫定 Next 14）。但截至 2026-05 上游 latest 是 16.2.6，Next 15 也已 stable。升級會 touch：`params: Promise<{...}>` 改 sync 簽章、`middleware` 改名 `proxy`、Server Component caching 行為。寫 successor ADR 時機：完成 Phase 0 全部 commit 後集中處理

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
pnpm --filter @opentrade/db db:seed             # 冪等 seed hk Tenant
pnpm typecheck                                  # 全包 type 檢查
pnpm lint                                       # 全包 ESLint
pnpm format:check                               # 全包 Prettier 檢查

# Commit number-five 起：起 API 並驗證
pnpm --filter @opentrade/api dev                # tsx watch http://localhost:4000
curl http://localhost:4000/v1/health            # 預期 200 OK + 真實 DB 延遲

# Commit number-six 起：起 web 並驗證跨包通訊
pnpm --filter @opentrade/web dev                # next dev http://localhost:3000
open http://localhost:3000/                     # zh-Hant 首頁（無 prefix per as-needed）
open http://localhost:3000/en/status            # 英文 /status 對接 /v1/health
open http://localhost:3000/zh-Hans/status       # 簡中
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

| 日期       | Session 主題                                       | Agent 模型      | 主要產出                                                                                                                                                                                                                                                                  | Conversation Log                                                |
| ---------- | -------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 2026-05-17 | 初始規劃 + 建立項目記憶系統 + Monorepo 骨架        | Claude Opus 4.7 | Commit #1 文件骨架 + Commit #2 Monorepo + GitHub 連線                                                                                                                                                                                                                     | [link](./conversations/2026-05-17-initial-planning.md)          |
| 2026-05-17 | UI 設計策略 + commit 順序調整 + packages/ui 初始化 | Claude Opus 4.7 | ADR-0011 UI 設計語言 + Commit #3 packages/ui 完成（design tokens、Storybook、Button、ImmutableMark）                                                                                                                                                                      | [link](./conversations/2026-05-17-ui-design-and-packages-ui.md) |
| 2026-05-17 | packages/db 初始化（Commit #4）                    | Claude Opus 4.7 | ADR-0012 本機 docker Postgres + ADR-0013 Pin Prisma 6.x + Commit #4 完成（Tenant/User/Broker/BrokerLicense + 5 enum + 17 index，首個 migration apply 到本機）                                                                                                             | [link](./conversations/2026-05-17-commit-4-packages-db.md)      |
| 2026-05-17 | apps/api 初始化（Commit number-five）              | Claude Opus 4.7 | ADR-0014 apps/api 運行架構 + Hono + DDD 四層 health 樣板 + Pino + AppError + OutboxEvent 表 + hk Tenant seed + tsup prod bundle 端到端驗證                                                                                                                                | [link](./conversations/2026-05-17-commit-5-apps-api.md)         |
| 2026-05-17 | apps/web 初始化（Commit number-six）               | Claude Opus 4.7 | Cursor Rules 5 項 deferred sync + Next 14 + next-intl 4 三 locale + Tailwind 接 packages/ui + Inter font + zod env + typed API client + HealthReportDto 移到 packages/shared + /status Server Component 端到端 + 首次在 Storybook 之外用 `<Button>` + prod build SSG 9 頁 | [link](./conversations/2026-05-17-commit-6-apps-web.md)         |
