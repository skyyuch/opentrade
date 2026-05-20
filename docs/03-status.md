# OpenTrade 當前狀態

> ⚠️ **這是項目最動態的文件，每個 session 必讀必寫。**
> 任何 AI agent 開始工作前，必須先讀本檔取得最新進度。
> 任何 AI agent 結束 session 前，必須更新本檔。

---

## 最後更新

- **日期**：2026-05-20
- **更新者**：Commit number-nine pre-flight session（Claude Opus 4.7）— AWS account bootstrap + ADR-0016 + rule 80 + CP6 finalize
- **本次更新摘要**：完成 Commit number-nine 起飛前的 AWS 帳號架構 bootstrap：建新 AWS Organization（ID `o-o5wm740m1h`，與專案負責人 legacy AWS 帳號完全隔離）+ management account `skyyuch627` (`774126906499`) + 第一個 sub-account `opentrade-dev` (`371637912734`，email `skyyuch627+dev@gmail.com` via Gmail `+alias` trick) + 兩 account 都受 root MFA + IAM access key 已清空 + Phase 0 三條 cost guardrail（`phase-0-soft-cap` $50 budget、`phase-0-hard-cap` $200 budget、`opentrade-anomaly-alerts` Cost Anomaly Detection $25 OR 40% daily summaries）+ IAM Identity Center home region permanently `ap-southeast-1`（instance `ssoins-82102c3fe7f6ab49`）+ SSO user `skyyu`（日常 email，非 root）+ permission set `OpenTradeAdmin`（`AdministratorAccess` + 8h session）assigned 兩 account + 本機 `~/.aws/config` 加 `[sso-session opentrade]` + `[profile opentrade-dev]` + `[profile opentrade-management]`（既有 legacy `[default]` 完全保留不動）+ AWS CLI v2 官方 .pkg 從 `https://awscli.amazonaws.com/AWSCLIV2.pkg` 下載至 `~/Downloads/AWSCLIV2.pkg`。

ADR-0016（AWS account architecture）紀錄 9 個關鍵決策：D1 day-1 兩 account 而非 single（避未來分割之痛）、D2 `ap-southeast-1` Singapore（成本+narrative+延遲三贏，per ADR-0002 cost ceiling）、D3 Identity Center 唯一 auth source（無 IAM user / 無 long-lived access key）、D4 single permission set `OpenTradeAdmin` Phase 0、D5 SSO profile naming `opentrade-{env}` 不可改 default、D6 sub-account email 走 Gmail `+alias` pattern、D7 SCP/RCP 全 disabled Phase 0、D8 三條 cost guardrail in management、D9 Identity Center home region permanent `ap-southeast-1`。9 個 alternatives considered（單帳號、合 legacy、`ap-east-1` HK、4 帳號 day1、IAM users + access keys、third-party IdP、新 dedicated Gmail、把 `[default]` 設成 OpenTrade）全部 rejected with reasoning。Implementation notes 列 Phase 4+ follow-up（us-east-1 enable for CloudFront ACM、staging/prod sub-accounts、SCP via Terraform、permission set 拆 role-specific、考慮 corporate IdP 遷移）。

新 cursor rule 80-aws-accounts.mdc（`alwaysApply: true`）codify ADR-0016 為 operational 紀律：兩 account 邊界不可違反、SSO profile naming convention（`opentrade-{env}` 永遠 prefix、不可 hijack `[default]`）、daily 用 `--profile opentrade-dev` 99% 操作、management 用 `--profile opentrade-management` 極少數 admin、token 過期 8h 走 `aws sso login` refresh、region 紀律（`ap-southeast-1` 主、`us-east-1` 只給 CloudFront ACM 用 Phase 4+ 才開）、Terraform 操作規範（reference profile 不寫 access key、state 放 dev account S3、CI 不可 apply）、cost guardrails 紅線（commit 不可造成 dev > $200/月）、Identity Center 紀律（home region 終身、不建 IAM user、不建長期 access key）、sub-account email 紀律（Gmail `+alias` pattern + 不可遷至不支援 provider）、root user 紀律（永遠 MFA + 無 access key + 不日常用）、SCP 啟用規範（Phase 4+ Terraform 一次到位 + 不走 console）。`docs/decisions/README.md` ADR index 加 ADR-0016 + rule 99 編號樹加 `80-aws-accounts.mdc`。

端到端驗證（手動）：CP1 root account 註冊 + 登入 ✓、CP2 root MFA 啟用 + access keys 確認空 + Account Alias `opentrade-root` ✓、CP3 IAM Billing access activated + 兩條 budget 建好 + Cost Anomaly subscription `opentrade-anomaly-alerts` 走 daily summaries to 日常 email（per AWS UX：individual alerts 強制走 SNS，daily/weekly 才能用 email）✓、CP4 IAM Identity Center home region permanent `ap-southeast-1` + portal URL `https://d-9667ab75a1.awsapps.com/start` + SSO user `skyyu` + permission set `OpenTradeAdmin` 8h ✓、CP5 AWS Organizations 啟用 + sub-account `opentrade-dev` (`371637912734`) 建好 + 兩 account 都 assign `skyyu` + `OpenTradeAdmin` + SSO portal 看到兩 account ✓、CP6（進行中）：AWS CLI v2 .pkg 下載完成、`~/.aws/config` 寫好 OpenTrade SSO sections（既有 `[default]` legacy preserved），剩 `sudo installer` + `aws sso login --profile opentrade-dev` + `aws sts get-caller-identity` 驗證待跑。Phase 0 進度仍 97%（infra/terraform commit number-nine 還沒 ship，但所有前置 cloud account / IAM / docs 就緒）。

---

## 當前 Phase

**Phase 0：地基搭建**

進度：97%

---

## 已完成

### Commit number-nine pre-flight：AWS account bootstrap（本 session 完成，pending CP6 finalize + commit）

- [x] ADR-0016：AWS account architecture（9 個決策完整紀錄 + 9 個 alternatives considered）
- [x] 新 cursor rule `80-aws-accounts.mdc`（`alwaysApply: true`）— operational 紀律 codify ADR-0016
- [x] 既有 legacy AWS 帳號**完全隔離**保留（per ADR-0016 D1 + 紅線）— OpenTrade 全新 Organization
- [x] AWS Organization `o-o5wm740m1h` 建好（management + dev 兩 account）
- [x] Management account `skyyuch627` (`774126906499`)：Account Alias `opentrade-root` + root MFA enabled + zero access keys + IAM Billing access activated
- [x] Sub-account `opentrade-dev` (`371637912734`)：email `skyyuch627+dev@gmail.com` via Gmail `+alias` trick + region `ap-southeast-1`
- [x] Phase 0 cost guardrails（在 management account）：
  - `phase-0-soft-cap` budget $50 USD/month → 80% actual + 100% forecast → 日常 email
  - `phase-0-hard-cap` budget $200 USD/month → 50% + 100% forecast → 日常 email
  - `opentrade-anomaly-alerts` Cost Anomaly Detection subscription on default `AWS services` monitor → $25 OR 40% threshold → daily summaries to 日常 email（per AWS UX：individual alerts 強制 SNS，daily/weekly 才能 email）
- [x] IAM Identity Center 啟用：
  - Home region permanent `ap-southeast-1`（per ADR-0016 D9）
  - Instance ID `ssoins-82102c3fe7f6ab49`
  - Portal URL `https://d-9667ab75a1.awsapps.com/start`（IPv4-only；alias 有試但 propagate 後 Safari 暫時找不到 server，最終直接用原始 URL）
  - SSO user `skyyu` 建好（日常 email，**非** root email）+ MFA enabled
  - Permission set `OpenTradeAdmin`：AWS-managed `AdministratorAccess` + 8h session（per ADR-0016 D4）
  - Assignments：`skyyu` × `OpenTradeAdmin` 對 management + dev 兩 account 都 assigned
- [x] 本機 `~/.aws/config` 寫入 OpenTrade SSO sections（per ADR-0016 D5 + rule 80）：
  - `[default]` legacy 完全保留不動（per D5 + 紅線：不可 hijack default）
  - `[sso-session opentrade]` + `[profile opentrade-dev]` + `[profile opentrade-management]` appended
  - `~/.aws/credentials` 完全不動（legacy access key 留給舊項目）
- [x] AWS CLI v2 .pkg 從 `https://awscli.amazonaws.com/AWSCLIV2.pkg` 下載 + `sudo installer` 安裝（"The upgrade was successful." 顯示機器上原有 v1，已升級至 v2）
- [x] `aws sso login --profile opentrade-dev` 跳瀏覽器確認 Allow access 通過（"Successfully logged into Start URL: https://d-9667ab75a1.awsapps.com/start"）
- [x] `aws sts get-caller-identity --profile opentrade-dev` 驗證三訊號 = `Account: 371637912734` + `Arn: arn:aws:sts::371637912734:assumed-role/AWSReservedSSO_OpenTradeAdmin_5334d49ca6f1d3f9/skyyu` + `UserId: AROAVNB2YQSPEOY7D7W7H:skyyu`
- [x] `~/.zshrc` append `export AWS_PROFILE=opentrade-dev`（per rule 80 daily 紀律）；驗證 `aws sts get-caller-identity` 不帶 `--profile` 也自動回 dev account
- [x] `docs/decisions/README.md` ADR index 加 ADR-0016；rule 99 編號樹加 `80-aws-accounts.mdc`

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

### Commit number-eight：packages/contracts 初始化（本 session 完成）

- [x] ADR-0015：packages/contracts toolchain setup（8 個決策完整紀錄）
- [x] Foundry v1.7.1 透過 `foundryup --install stable` 裝在使用者本機，`~/.zshenv` 自動補 `PATH`
- [x] `forge init --empty --use-parent-git --shallow` 在 `packages/contracts/`（不生 Counter、不 nest git repo、`lib/forge-std` 透過 monorepo root `.gitmodules` 註冊）
- [x] OpenZeppelin v5.6.1 兩個 git submodule（per ADR-0015 D2）：`openzeppelin-contracts` (`5fd1781b`) + `openzeppelin-contracts-upgradeable` (`7bf4727a`)。改用 raw `git submodule add` + `git checkout v5.6.1`，因 `forge install ...@v5.5+` 在 Foundry 1.7.1 有 tag 解析 bug
- [x] `foundry.toml`：`solc_version = "0.8.24"` + `evm_version = "paris"`（OP Stack 通用，per ADR-0015 D3）+ `optimizer = true, optimizer_runs = 200` + `bytecode_hash = "none"` + `cbor_metadata = false`（BaseScan deterministic verify）+ `fuzz = { runs = 1024 }` + `invariant = { runs = 256, depth = 32 }` + `auto_detect_remappings = false` + `[fmt]` 完整規則（line 120、`uint256` long、double quote、thousands underscore、sorted imports、params-first multiline）
- [x] `remappings.txt` 三條：`forge-std/`、`@openzeppelin/contracts/`、`@openzeppelin/contracts-upgradeable/`
- [x] `.solhint.json` minimal warning-only 9 條（per ADR-0015 D5：compiler-version、func-visibility ignoreConstructors、private-vars-leading-underscore、no-empty-blocks、no-global-import、no-console、max-line-length 120、ordering、reason-string off）+ `.solhintignore`（lib/、out/、cache/、broadcast/）
- [x] `test/Sanity.t.sol`：兩個 test — `test_ForgeRunnerIsAlive`（純 assertTrue 證 runner 起）+ `test_OpenZeppelinTypeNamesResolve`（讀 `type(Ownable).name` + `type(OwnableUpgradeable).name` 強迫 solc 完整 resolve OZ import graph，drift 即 compile-time fail）
- [x] root `.lintstagedrc.mjs`（新）取代 `package.json` 的 `lint-staged` 欄位，對 `packages/contracts/**/*.sol` 用 `forge fmt --root packages/contracts <files>` —`foundry.toml [fmt]` 是唯一 style source（per ADR-0015 D4）
- [x] root `.prettierignore` 加 `lib/`（OZ 自己 `.prettierrc` 引用 `prettier-plugin-solidity`，會炸 `format:check`）
- [x] `packages/contracts/package.json` scripts 改實 forge / solhint commands（build、test、test:unit、test:ci `--no-match-test testFork`、fmt、fmt:check、lint 限 `test/**/*.sol` per D6、typecheck honest echo、clean delegates `forge clean`）
- [x] `packages/contracts/turbo.json`（新，package-level override）：build inputs 涵蓋 foundry.toml/remappings.txt/全 `.sol`，build outputs `out/** cache/**`，test/lint/typecheck outputs `[]`（消除既有 「no output files found」warning）
- [x] `packages/contracts/README.md` 完整 rewrite：Phase 0 toolchain ready 狀態、工具鏈表格（含 solc/forge/OZ/forge-std/solhint pinned versions）、目錄結構、first-time setup（`git submodule update --init --recursive` + `foundryup --install stable`）、critical contract rules、Phase 1+ 預告
- [x] ADR-0015 完整 8 個決策 + alternatives considered（OZ v4、forge install only、prettier-plugin-solidity、cancun EVM、Phase 0 ship ReviewRegistry、Hardhat）+ consequences 三段 + implementation notes 全部到位；`docs/decisions/README.md` index 更新
- [x] **rule 99 self-review**：rule 41 第 44-47 行 v4 import path 修正為 v5（`security/PausableUpgradeable.sol` → `utils/`；`ReentrancyGuardUpgradeable.sol` 在 v5 已移除，改 inherit 非 upgradeable `ReentrancyGuard` 透過 ERC-7201 namespaced storage），加 inline comment 警示未來 agent 不要「修回去」
- [x] **rule 99 self-review**：`commitlint.config.mjs` scope-enum 加 `decisions`（給 ADR commits，解 t8 提交時 commitlint warning）+ `.cursor/rules/70-commit-pr.mdc` scope 清單同步（加 `decisions` 與既有 `status`）
- [x] 端到端驗證：`pnpm --filter @opentrade/contracts build` → 25 個 .sol 編譯成功；`forge test -vvv` 2 passed；`pnpm exec solhint` 0 warning；`pnpm format:check / lint / typecheck` 全 monorepo 8 個 package 全綠（contracts typecheck 不再警告 missing outputs）；`.lintstagedrc.mjs` 對 `.sol` 在 t5 commit pre-commit 真實觸發過 `forge fmt --root packages/contracts test/Sanity.t.sol`

### Commit number-seven：apps/console 初始化

- [x] `apps/console/package.json`：與 `apps/web` 同 pin（Next 14.2.35 + React 18.3.1 + next-intl 4.12 + next-themes 0.4.6 + lucide 0.469 + zod 4.4.3 + Tailwind 3.4.17 + dotenv-cli），dev/build/start 走 `dotenv -e ../../.env -- next ... --port 3001`
- [x] `apps/console/next.config.mjs` + `tailwind.config.ts` + `postcss.config.mjs`：mirror `apps/web`，docblock 標明唯一三項差異（dark default、port 3001、robots disallow）
- [x] `apps/console/tsconfig.json`：升到 Next 14 形狀（allowJs + next plugin + `@/*` alias + 涵蓋 4 個 config 檔 + src + 生成的 `.next/types`）
- [x] `apps/console/src/i18n/{routing,request,navigation}.ts` + `middleware.ts`：複用 web 模板；middleware docblock 寫 Phase 1 加 auth gate 的 TODO（per ADR-0010 §"Auth flow"），確保未來 agent 接得起來
- [x] `apps/console/src/components/providers/ThemeProvider.tsx`：唯一行為差異 `defaultTheme="dark"`，docblock 強調這是 console 與 web 的**唯一**設計分歧
- [x] `apps/console/src/app/[locale]/layout.tsx`：root layout + `hasLocale` 守門 + `getMessages` + `<NextIntlClientProvider>` + Inter via `next/font/google`（build-time self-host）+ `<ThemeProvider>` + `generateMetadata` 從 `dashboard` namespace 翻譯 + `robots: { index: false, follow: false }`（雙保險） + `generateStaticParams` 三 locale SSG
- [x] `apps/console/messages/{zh-Hant,zh-Hans,en}.json`：`dashboard` namespace 完整三語（eyebrow / title / subtitle / phaseNotice / shellTitle / shellDescription / sectionsTitle / 4 個 sections × {title, description} / phaseHint / disclaimer）
- [x] `apps/console/src/app/[locale]/page.tsx`：商戶 dashboard 殼（Server Component、純 Tailwind、**不**用 ImmutableMark per ADR-0011 §5.1）— 4 張 card grid（claim ShieldCheck / reviews Star / signals TrendingUp / disputes Gavel）+ Megaphone phase hint aside + footer disclaimer
- [x] `apps/console/src/app/robots.ts`：站級 metadata route 回 `Disallow: /`（放在 `app/` 根而非 `[locale]` 下，因為 robots.txt 是 site-level resource；next-intl matcher `.*\\..*` 已自動排除）
- [x] `apps/console/src/env.ts`：zod 驗證 `NEXT_PUBLIC_API_URL`（與 web 同模式：literal-bracket access for TS strict + Next DefinePlugin 兼容）
- [x] root `README.md` + `apps/console/README.md`：apps 結構欄位升級到 Phase 0+；first-time setup steps 8/9 加 web/console dev 啟動驗證；console README 完整 rewrite（不再是 stub）
- [x] Prod `next build`：7 個 static page（3 locale × `/[locale]` + `/_not-found` + `/robots.txt`）全綠，First Load JS 88.5 kB，Middleware 38 kB
- [x] Prod `next start` 端到端驗證：
  - `/robots.txt` → `User-Agent: *  Disallow: /` ✓
  - `/` → HTTP 200 + `set-cookie: NEXT_LOCALE=zh-Hant` + `x-middleware-rewrite: /zh-Hant` ✓
  - zh-Hant title `OpenTrade 商戶後台` / zh-Hans `OpenTrade 商户后台` / en `OpenTrade merchant back office` ✓
  - `<meta name="robots" content="noindex, nofollow">` 注入 ✓
  - next-themes inline script `("class","theme","dark",null,...)` 確認 dark default ✓
  - `/en/anything-bad` → HTTP 404 ✓
- [x] 全包 `pnpm typecheck / lint / format:check` 全綠

### Commit number-six：apps/web 初始化

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
- [x] Commit #1 ~ number-eight 全部 push 到 GitHub（HEAD = `f5be3c1`）

---

## 進行中

無（Commit number-nine pre-flight 全部完成；下個 session 開 Commit number-nine 真正 ship Terraform）。

---

## 下一步（按優先序，**已調整成 Option C：依賴方向正確的順序**）

> **順序調整原因**：原計劃讓 apps/web 先於 packages/ui，違反 rule 10 依賴方向（web → ui）與 ADR-0009 Storybook-first 原則。重新排序：先設計系統 → 後端 contract → 前端組合。詳見 ADR-0011 與 2026-05-17 session conversation。

### 立即（下個 session）

1. **Commit number-nine：infra/terraform 雛形** — VPC、RDS、ECS Fargate、S3、Secrets Manager；同時補 `apps/api/Dockerfile`（per ADR-0014 implementation notes：copy `.prisma/client` engines + `dist/main.js`）；Console 部署也要在這裡規劃（CloudFront + S3 + 自家 OpenNext）— per ADR-0010 兩 app 各自獨立部署
2. **Commit number-ten：CI/CD GitHub Actions** — lint + typecheck + test + migrate 在 PR 上自動跑；Renovate / dependabot 排除 Prisma 7.x（per ADR-0013）；加 ESLint 規則阻止前端 runtime import `@opentrade/db`（per Commit #4 conversation 提到的紀律強化）；console 的 `X-Robots-Tag: noindex, nofollow` edge header 也要在 deploy 時設好（per ADR-0010 + Commit number-seven `app/robots.ts` docblock）；**`foundry-toolchain` action 在 contracts job 設好**（per ADR-0015 implementation notes，pin forge 1.7.x + `git submodule update --init --recursive`）；solhint 在 PR 跑時仍 warning-only（per ADR-0015 D5）但 `forge build / forge test / forge fmt --check` 為 hard gate

### 中期（Phase 1）

完成 Phase 0 所有 commit 後，進入 Phase 1 MVP-A（鏈上評論功能）。

---

## 待決策（懸而未決的問題）

### 環境 / 帳號層級

- ✅ ~~**AWS 帳號**：是否已有？要建 dev/staging/prod 三帳號還是先一個？~~ → 已決定 per ADR-0016：兩 account（management `774126906499` + dev `371637912734`），day 1 用 Organizations，與 legacy AWS 帳號完全隔離
- ❓ **網域**：opentrade.io / .hk / .app — 之後再決定，不影響開發
- ❓ **AI 翻譯服務**：DeepL（主）vs OpenAI GPT（備）— 已預設 DeepL 主
- ❓ **GitHub Org 化**：目前是 `skyyuch/opentrade` 個人 repo。是否轉 GitHub Org `opentrade-hk`？
- ❓ **Repo Public/Private**：目前 GitHub 上是 Public（看 web 結果）。建議改 Private（在 SFC 高層董事正式加入前）。
- ❓ **Phase 4+ AWS region 增加 `us-east-1` opt-in**：CloudFront ACM SSL 證書 + Route 53 必須在 us-east-1（AWS 強制）。目前 management 與 dev account 都只 enable `ap-southeast-1`，待 Phase 4 上 prod 加 CloudFront 時再 opt-in（per ADR-0016 implementation notes）
- ❓ **Phase 4+ SCP 啟用**：region allow-list (`ap-southeast-1` + `us-east-1`)、`DenyRootUserActions`、`DenyMFADisable` 三條最低 SCP，Phase 4 prod 前必上線。需透過 `infra/terraform/modules/scp/`（per ADR-0016 D7 + rule 80 SCP 規範）
- ❓ **Phase 4+ `OpenTradeAdmin` permission set 拆分**：目前 single permission set，Phase 4+ 至少拆 `OpenTradeAdmin` / `OpenTradeReadOnly` / `OpenTradeBillingOnly`，當第二個人類加入或外部 auditor 接觸時觸發
- ❓ **Phase 4+ Identity Center 遷移到 corporate IdP**：目前用 Identity Center directory（內建）；當有公司 domain 與 Workspace / Okta 訂閱後考慮遷移（non-destructive，per ADR-0016 alternative G）
- ❓ **Phase 4+ 加 `opentrade-staging` + `opentrade-prod` sub-account**：當前只有 `opentrade-dev`；prod 上線前 staging / prod 各自獨立 account（per ADR-0002 + ADR-0016 D1）

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
- ❓ **OZ v5 `ReentrancyGuard` 在 Upgradeable 合約的 storage 安全性**：v5 用 ERC-7201 namespaced storage，理論上 non-upgradeable `ReentrancyGuard` 可被 `UUPSUpgradeable` 合約直接 inherit。Phase 1 寫第一個業務合約（ReviewRegistry）時必須實測 storage layout（用 `forge inspect ReviewRegistry storage-layout`）並寫進 audit notes。若不安全則改用 `ReentrancyGuardTransient`（Cancun EVM 才能用，需先 ADR 切 `evm_version`）
- ❓ **Foundry version pin 策略**：本機 `foundryup --install stable` 抓到 `forge 1.7.1`。CI 透過 `foundry-toolchain` action 應 pin 同版本；何時 bump 寫 ADR：(a) 上游 1.8+ 帶來新 cheatcode 是 audit 必需；或 (b) v5 tag 解析 bug 修了之後（ADR-0015 D2 提到）
- ❓ **solhint 嚴格化時機**：ADR-0015 D5 約定 Phase 1 第一個業務合約 PR 時把 ruleset 從 warning-only 切 error-level，並 extend `solhint:recommended`。需在 Phase 1 同個 PR 內完成，避免「先 ship contract 再 tighten lint」的 backwards 流程

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
forge --version   # forge 1.7.1 (Commit number-eight 起本機合約開發必備, per ADR-0015)
aws --version     # aws-cli/2.x.x (Commit number-nine 起 AWS CLI 必備, per ADR-0016)

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

# Commit number-seven 起：起 console 並驗證 dark default + robots disallow
pnpm --filter @opentrade/console dev            # next dev http://localhost:3001
open http://localhost:3001/                     # zh-Hant 商戶後台（dark default + 4 張 card grid）
open http://localhost:3001/en                   # 英文 dashboard 殼
open http://localhost:3001/zh-Hans              # 簡中
curl http://localhost:3001/robots.txt           # → User-Agent: *  Disallow: /

# Commit number-eight 起：起 forge 工具鏈並驗證合約端到端
git submodule update --init --recursive         # 首次：拉 OZ + forge-std submodules
curl -L https://foundry.paradigm.xyz | bash     # 首次：安裝 foundryup
~/.foundry/bin/foundryup --install stable       # 首次：拉 forge 1.7.x binaries
forge --version                                  # → forge Version: 1.7.x
pnpm --filter @opentrade/contracts build        # forge build → 25 個 .sol 編譯成功
pnpm --filter @opentrade/contracts test         # forge test → 2 passed (Sanity)
pnpm --filter @opentrade/contracts lint         # solhint --noPrompt 'test/**/*.sol' → 0 warning
pnpm --filter @opentrade/contracts fmt:check    # forge fmt --check → exit 0
```

`.nvmrc` 已設為 `22`，使用者進到專案資料夾時 zsh hook 會自動切到正確 Node 版本。`~/.zshenv` 已被 `foundryup` 安裝器自動加 `export PATH="$PATH:$HOME/.foundry/bin"`，新開 terminal 直接可用 `forge`。

### AWS（Commit number-nine pre-flight 起，per ADR-0016 + rule 80）

```bash
# AWS Organization & Accounts
# Organization ID:        o-o5wm740m1h
# Management account:     skyyuch627      (774126906499)  ← 只放 Org / IDC / Billing
# Member account:         opentrade-dev   (371637912734)  ← Phase 0–3 全部開發資源

# IAM Identity Center
# Home region:            ap-southeast-1  (永久，不可改)
# Instance ID:            ssoins-82102c3fe7f6ab49
# Portal URL:             https://d-9667ab75a1.awsapps.com/start
# SSO user:               skyyu  (日常 email; root email 不日常用)
# Permission set:         OpenTradeAdmin  (AdministratorAccess + 8h session)

# Cost guardrails (in management account)
# - Budget phase-0-soft-cap   $50/month   80% actual + 100% forecast
# - Budget phase-0-hard-cap   $200/month  50% + 100% forecast
# - Cost Anomaly opentrade-anomaly-alerts  $25 OR 40%  daily summaries

# 本機首次設定
sudo installer -pkg ~/Downloads/AWSCLIV2.pkg -target /  # 裝 AWS CLI v2 官方 .pkg
aws --version                                            # 預期 aws-cli/2.x.x
aws sso login --profile opentrade-dev                    # 會跳瀏覽器點 Allow access
aws sts get-caller-identity --profile opentrade-dev      # 驗 Account=371637912734 + role=OpenTradeAdmin

# 日常使用
export AWS_PROFILE=opentrade-dev                         # 設進 ~/.zshrc 之後不用每次打 --profile
aws s3 ls                                                # 99% 操作走這個
aws ec2 describe-vpcs                                    # 都打到 dev sub-account

# 帳號 / Org 管理（極少數）
aws ... --profile opentrade-management

# Token 過期（每 8h）
aws sso login --profile opentrade-dev
```

`~/.aws/config` 含 `[default]`（legacy AWS 帳號保留）+ `[sso-session opentrade]` + `[profile opentrade-dev]` + `[profile opentrade-management]`。`~/.aws/credentials` 完全不動（legacy access key 留給舊項目）。SSO 與 access key 兩套 auth 互不打架；OpenTrade 永遠走 `--profile opentrade-dev`，legacy 走 `[default]`。

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

| 日期       | Session 主題                                         | Agent 模型      | 主要產出                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Conversation Log                                                  |
| ---------- | ---------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 2026-05-17 | 初始規劃 + 建立項目記憶系統 + Monorepo 骨架          | Claude Opus 4.7 | Commit #1 文件骨架 + Commit #2 Monorepo + GitHub 連線                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [link](./conversations/2026-05-17-initial-planning.md)            |
| 2026-05-17 | UI 設計策略 + commit 順序調整 + packages/ui 初始化   | Claude Opus 4.7 | ADR-0011 UI 設計語言 + Commit #3 packages/ui 完成（design tokens、Storybook、Button、ImmutableMark）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [link](./conversations/2026-05-17-ui-design-and-packages-ui.md)   |
| 2026-05-17 | packages/db 初始化（Commit #4）                      | Claude Opus 4.7 | ADR-0012 本機 docker Postgres + ADR-0013 Pin Prisma 6.x + Commit #4 完成（Tenant/User/Broker/BrokerLicense + 5 enum + 17 index，首個 migration apply 到本機）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [link](./conversations/2026-05-17-commit-4-packages-db.md)        |
| 2026-05-17 | apps/api 初始化（Commit number-five）                | Claude Opus 4.7 | ADR-0014 apps/api 運行架構 + Hono + DDD 四層 health 樣板 + Pino + AppError + OutboxEvent 表 + hk Tenant seed + tsup prod bundle 端到端驗證                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [link](./conversations/2026-05-17-commit-5-apps-api.md)           |
| 2026-05-17 | apps/web 初始化（Commit number-six）                 | Claude Opus 4.7 | Cursor Rules 5 項 deferred sync + Next 14 + next-intl 4 三 locale + Tailwind 接 packages/ui + Inter font + zod env + typed API client + HealthReportDto 移到 packages/shared + /status Server Component 端到端 + 首次在 Storybook 之外用 `<Button>` + prod build SSG 9 頁                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [link](./conversations/2026-05-17-commit-6-apps-web.md)           |
| 2026-05-17 | apps/console 初始化（Commit number-seven）           | Claude Opus 4.7 | Next 14 console 殼 mirror web 模板 + dark default ThemeProvider + port 3001 + dashboard 4-card grid（claim/reviews/signals/disputes，無 ImmutableMark per ADR-0011 §5.1）+ site-level robots.ts disallow-all + meta robots noindex 雙保險 + zod env + 三語 dashboard messages + prod build SSG 7 頁 + prod start dark + robots end-to-end 驗證                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | [link](./conversations/2026-05-17-commit-7-apps-console.md)       |
| 2026-05-17 | packages/contracts 初始化（Commit number-eight）     | Claude Opus 4.7 | ADR-0015 contracts toolchain setup（8 個決策）+ Foundry v1.7.1 + `forge init --empty --use-parent-git --shallow` + OpenZeppelin v5.6.1 雙 submodule（raw `git submodule add` because of forge install tag bug）+ `foundry.toml`（solc 0.8.24 + paris EVM + deterministic bytecode + [fmt] full rules）+ remappings.txt 三條 + `.solhint.json` warning-only 9 條 + `test/Sanity.t.sol`（forge runner + OZ type-name resolve smoke）+ `.lintstagedrc.mjs` 抽出（`.sol` 走 forge fmt）+ `.prettierignore` skip lib/ + packages/contracts package.json scripts 接實 forge/solhint + package-level turbo.json + README rewrite + rule 41 v4 → v5 import path self-review + commitlint scope-enum 加 `decisions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [link](./conversations/2026-05-17-commit-8-packages-contracts.md) |
| 2026-05-20 | Commit number-nine pre-flight：AWS account bootstrap | Claude Opus 4.7 | ADR-0016 AWS account architecture（9 個決策 + 9 個 alternatives）+ 新 cursor rule `80-aws-accounts.mdc`（`alwaysApply: true`，operational 紀律 codify ADR-0016）+ 新 AWS Organization `o-o5wm740m1h`（與 legacy AWS 帳號完全隔離）+ management account `774126906499` (root MFA + zero access keys + Account Alias `opentrade-root` + IAM Billing access activated) + sub-account `opentrade-dev` `371637912734` (email `skyyuch627+dev@gmail.com` Gmail `+alias`) + Phase 0 三條 cost guardrail（`phase-0-soft-cap` $50 budget、`phase-0-hard-cap` $200 budget、`opentrade-anomaly-alerts` Cost Anomaly $25 OR 40% daily）+ IAM Identity Center 啟用 home region permanent `ap-southeast-1` (instance `ssoins-82102c3fe7f6ab49`，portal `https://d-9667ab75a1.awsapps.com/start`) + SSO user `skyyu` + permission set `OpenTradeAdmin`(`AdministratorAccess` + 8h) assigned 兩 account + 本機 `~/.aws/config` append `[sso-session opentrade]` + `[profile opentrade-dev]` + `[profile opentrade-management]`（legacy `[default]` 完全保留）+ AWS CLI v2 .pkg 下載 ~/Downloads；CP6 finalize（`sudo installer` + `aws sso login` + `aws sts get-caller-identity`）由使用者執行 | （本 session conversation 待歸檔）                                |
