# Commit number-six — `apps/web` 初始化（2026-05-17）

> 本文件歸檔 OpenTrade 項目 Commit number-six 對話的精華內容。
> 給未來 AI agent 接手用：讀完本檔即可掌握 `apps/web` 的設計決策、踩過的雷、與下一步建議。

---

## 對話脈絡

- **日期**：2026-05-17（與 commit #1～#5 同日；當天總共完成 6 個 commit）
- **參與者**：項目負責人（HK 退休 SFC 高層董事 + 兒子 PM/開發），Claude Opus 4.7 作為 AI agent
- **背景**：Commit number-five 完成後 Phase 0 進度 90%；本 session 負責 Commit number-six（apps/web 初始化）
- **session 起點**：使用者複製貼上 AGENTS.md 標準 handoff prompt，要求 agent 讀 12 份文件、回報進度、提出本次目標、建議是否先處理上次 deferred 的 5 項 Cursor Rules sync
- **agent 開場確認後**：使用者拍板「先做 Rules sync（單 commit）→ 再做 number-six（不在 status 頁面用 ImmutableMark）→ 結尾 docs handoff」

---

## 主要討論內容（按主題分節）

### 1. Cursor Rules 同步（commit number-five 後 5 項 deferred）

過去 session 結束時 rule 99 self-review 發現 5 處 rule ↔ 實作 drift。本 session 第一個動作就把它們同步：

| 項目                      | rule 寫的            | 實作（commit number-five）           | 本次同步動作                                                 |
| ------------------------- | -------------------- | ------------------------------------ | ------------------------------------------------------------ |
| AppError 構造器           | 第四個位置參數 cause | options bag `{ details?, cause? }`   | 改 rule 30 範例 + 加「options bag」與「details JSON-safe」段 |
| API error envelope        | 沒 requestId         | 有 requestId（hono/request-id 注入） | 加進 rule 30 JSON 範例 + 加說明「frontend 用 code 翻 i18n」  |
| AppError 預設 statusCode  | 400                  | 500（unknown == 不安全）             | 改範例 + 加「default 500、known 4xx 明確傳」                 |
| Seed 資料                 | 強制讀外部 JSON      | hk Tenant 是 hardcode                | 改 rule 31 為「bootstrap data vs domain data 二分」+ 範例    |
| commitlint scope `status` | 不存在               | `docs(status):` 觸發 warning         | scope-enum 加 `status` + 在 docblock 寫保留給 rule 97 用     |

**commit**：`a736ea0 docs(rules): sync rule 30/31 + commitlint with apps/api impl`

#### 為何不再多寫 ADR

5 項都是 rule 文件對齊實作，實作層的 ADR-0014 已經寫過理由（options bag、requestId、500 default）。再寫一個 ADR 只會重複；本 session 在 rule docs 跟 commit message 把 rationale 補完即可。

---

### 2. `<ImmutableMark>` 在 `/status` 頁面要不要用

agent 一開始想推「commit number-six 是 ImmutableMark 第一次脫離 Storybook 真實使用」，後來自我檢視發現違反 ADR-0011 §5.1：

> **ImmutableMark 只能用在「真正的鏈上資料」上，不可用於 mock data，否則品牌承諾被稀釋。**

`/status` 頁面是 API 健康檢查，沒有任何鏈上資料，所以不該出現 ImmutableMark。最終決議（使用者拍板）：**Option C — 純 Button + Card demo，ImmutableMark 延後到 Phase 1 真實鏈上評論時才首次脫離 Storybook**。這對品牌紀律是正確的。

→ 實際結果：`/status` 用了 `<Button intent="outline" loading={isPending} leadingIcon={<RefreshCw/>}>` 作為 Storybook 之外第一次使用。ImmutableMark 仍只在 Storybook 中。

---

### 3. Next.js 14 vs 15/16 的版本決策

session 中發現上游 Next.js latest 是 16.2.6，next-intl latest 是 4.12（為 Next 15 設計）。但 AGENTS.md / project overview rule 明確寫「Next.js 14 (App Router)」。

**決策**：嚴守 AGENTS.md，pin `~14.2.35`。理由：

1. AGENTS.md 是項目最高優先級文件，上面寫的技術選型不該在 implementation 階段「順手升級」
2. Next 15/16 升級需要動 `params: Promise<{...}>` 簽章、`middleware` 改名 `proxy`、Server Component caching 行為等多處 — 是專門 ADR 級工作
3. 把「升級評估」寫進 `docs/03-status.md` 的「待決策」段，等 Phase 0 全部完成後集中處理

next-intl 4.x 雖然 docs 範例假設 Next 15+（用 async params），但實作上對 Next 14 的 sync params 仍然完全相容，本 session 用同步 destructure 寫法驗證通過。

---

### 4. apps/web vs apps/api 的 specifier 慣例差異

寫到 middleware 第一時間 dev server 報 `Module not found: Can't resolve './i18n/routing.js'`。

**根因**：

- `apps/api` 用 tsx + tsup，兩者都會把 `./foo.js` rewrite 成 `./foo.ts`（per ADR-0014）
- `apps/web` 用 Next 14 webpack，**不會** rewrite — 它對 in-app source 期待 bare specifier `./foo`
- workspace package（`@opentrade/*`）兩邊都靠 pnpm symlink + `transpilePackages` 自動處理，無感

**解法**：apps/web 內部 source 全部改 bare specifier。在 `next.config.mjs` 的 docblock 寫了一段「vs apps/api」對照表，避免未來 agent 又踩。

這個差異**不**值得寫獨立 ADR — `next.config.mjs` 的 docblock + ADR-0014 已涵蓋全。但要記得：未來新增的 app（apps/console）按它自己工具的慣例走，不要硬統一。

---

### 5. ESLint flat config 的 Next.js 慣例例外

`apps/web/src/app/[locale]/page.tsx` / `layout.tsx` / `middleware.ts` / `i18n/request.ts` / `next.config.mjs` 都被 Next.js / next-intl 強制要求 `default export`，但 root flat config 的 `import-x/no-default-export` 是 error。

**解法**：root `eslint.config.mjs` 加一個檔名 pattern overlay（同 Storybook stories 的處理方式）：

```js
{
  files: [
    'apps/{web,console}/src/app/**/{page,layout,template,default,error,not-found,loading,route,manifest,sitemap,robots,icon,apple-icon,opengraph-image,twitter-image}.{ts,tsx}',
    'apps/{web,console}/src/middleware.{ts,tsx}',
    'apps/{web,console}/src/i18n/request.{ts,tsx}',
    'apps/{web,console}/next.config.{mjs,js,ts}',
  ],
  rules: { 'import-x/no-default-export': 'off' },
},
```

**為何 framework 慣例 不該把 rule 改鬆**：rule 是專案紀律。Next.js / next-intl 是框架契約 — 我們不能違反契約。例外列表用「精確檔名 + glob」表達「這些是契約檔案、不是隨手寫 default」，紀律仍然在。

---

### 6. `next-intl` 4 的核心三件套

per next-intl 4.x docs，App Router 整合需要：

1. **`src/i18n/routing.ts`** — `defineRouting({ locales, defaultLocale, localePrefix })` — 路由唯一 source of truth
2. **`src/i18n/request.ts`** — `getRequestConfig` 動態 import locale 對應 messages JSON
3. **`src/i18n/navigation.ts`** — `createNavigation(routing)` 包出 locale-aware `Link` / `redirect` / `useRouter` / `usePathname`

加一個 **`src/middleware.ts`** 用 `createMiddleware(routing)` + matcher 排除 `api` / `_next` / dotted。

OpenTrade 用 `localePrefix: 'as-needed'`：zh-Hant URL 沒 prefix（SEO 乾淨）、`/zh-Hans/...` 與 `/en/...` 顯式 prefix。

---

### 7. 字型策略：next/font/google 也算「self-hosted」

rule 22 寫「字型 self-host（GDPR）」，本 session 用 `next/font/google` 載 Inter — 看起來矛盾，實際上 Next.js 會在 build 時把 Google Fonts 下載到自己的 build output，runtime 不會打 Google CDN。GDPR 安全。

Source Han（CJK）自託管延後到 Phase 0.5（per ADR-0011 §3）— 那時會切到 `next/font/local`。

#### Tailwind font-sans 為何沒接 Inter？

`packages/ui` 的 `fontFamily.sans` 列了 `'Inter'` 字面字串，但 next/font/google 載入的 Inter 用 hashed name（不叫 'Inter'）。要把 Tailwind `font-sans` 真正使用 next-loaded Inter，需要：

- 改 packages/ui token 加 `var(--font-inter)`，或
- 直接在 body 用 `inter.className`（next/font 推薦）

本 session 選後者：簡單 + 不動 packages/ui 跨界。trade-off：`font-sans` utility class 還是用舊 fallback stack。Phase 1 視需要決定要不要動 token。

---

### 8. 端到端跨包通訊驗證

`/status` 頁面是本 commit 的「icing」：用一個真實場景把整條鏈打通：

```
client (browser /status)
  ─→ Next.js Server Component
       ─→ apiGet<HealthReportDto>('/v1/health')   [from @opentrade/web]
            ─→ HealthReportDto type               [from @opentrade/shared]
                 ─→ Hono /v1/health endpoint      [from @opentrade/api]
                      ─→ PostgreSQL via Prisma    [from @opentrade/db]
```

**驗證結果**（dev + prod 兩種 mode）：

- HTTP 200 三 locale（`/`, `/en/status`, `/zh-Hans/status`）
- 真實 DB 延遲（從 1ms 到 11ms，dev 機器）
- Intl.DateTimeFormat 用 locale 自動格式化檢查時間（「2026年5月17日 晚上7:14:33」/「May 17, 2026, 7:14:33 PM」）
- prod build 9 個 SSG static page，First Load JS 共 87.3 kB（很瘦）

---

### 9. `HealthReportDto` 為何要搬到 `packages/shared`

apps/web 不能直接 `import type` 從 apps/api（rule 10 明文禁 apps→apps）。最自然的 shared types 容身處：`packages/shared`。

**作法**：

- 新檔 `packages/shared/src/health/HealthReportDto.ts`（含 `HealthStatus` union + `DependencyHealthDto` + `HealthReportDto`）
- `packages/shared/src/index.ts` re-export 這三個 type
- `apps/api/.../dto/HealthReportDto.ts` 改成一行 re-export from `@opentrade/shared`（保留 in-domain 找得到的閱讀路徑）

未來 OpenAPI codegen 上線後可能改成 generated；現在 1 個 DTO 不值得搞 codegen。

---

## 產生的 ADR

- 無新 ADR（5 項 rule sync 都對齊既有 ADR-0014 / ADR-0011 / rule 51）

## 關連既有 ADR

- ADR-0009：Storybook-first（解釋為何 ImmutableMark 不在 /status 用）
- ADR-0010：apps/web vs apps/console 拆分（本 session 是 web 殼第一次 ship）
- ADR-0011：UI 設計語言（light default、Inter、ImmutableMark 紀律、Civic Trust）
- ADR-0014：apps/api 運行架構（被本 session 引用解釋 specifier 差異）
- rule 10 / rule 21 / rule 22 / rule 30 / rule 31 / rule 51

## 待後續處理事項

- [ ] **commit number-six 系列 push 到 GitHub**：本 session 6 commits + 1 docs commit 還在本機 main branch（落後 origin/main 6 個）。等使用者明確指示再 push
- [ ] **Next 15 / 16 升級評估**：Phase 0 全部 commit 完成後集中處理，寫 successor ADR（params async、proxy 改名、cache 行為改變）
- [ ] **`common` namespace messages**：本 session 的 messages 只 ship 了 `home` + `status`。將來新頁面有共用字串時再開
- [ ] **`<ImmutableMark>` Phase 1 首次真實使用**：等鏈上評論落地後第一個 review card 用
- [ ] **packages/ui font token 接 next/font 變數**：若 Phase 1 想讓 Tailwind `font-sans` 真用 next-loaded Inter，要改 packages/ui token

---

## 給未來 AI agent 的建議

### Commit number-seven（apps/console）會很快

`apps/web` 的所有「殼級」決策都可以複用：

- next-intl 4 三 locale + `as-needed` prefix
- `dotenv -e ../../.env`（從 root .env 讀）
- next/font/google Inter
- ThemeProvider（但 console **default dark** per ADR-0011，這是唯一差異）
- Tailwind preset 接法
- 同一 ESLint Next.js 框架例外 overlay 已涵蓋 `apps/console`（不用再改 root config）

不一樣的：

- `defaultTheme="dark"` 而不是 `light`
- 預設 port 3001 而不是 3000
- CORS_ORIGIN 已經包含 `http://localhost:3001`（commit number-five 寫好）
- 前端有商戶登入流程（auth flow 在 Phase 1 才真正接，console 殼可以先不接 auth）

### 本 session 學到的要點

1. **絕不把 ImmutableMark 用在 mock 資料上** — 即使是 Phase 0 的 demo 也不行（ADR-0011 §5.1）
2. **不同 package 對 `.js` specifier 的態度不同** — apps/api 用 tsx/tsup 要 `.js`，apps/web 用 webpack 要 bare specifier。每個 package 跟自己工具走，這是 ADR-0014 的延伸實踐
3. **Next.js framework convention 的 default export** 是契約 — 不是品味，rule 要讓步
4. **TS strict + Next DefinePlugin 衝突** — 用 `process.env['LITERAL']` 兩邊都過
5. **`HealthReportDto` 搬到 `packages/shared`** 是 rule 10 邊界紀律的延續 — 任何 apps→apps 共用都要走 shared

### 結束本 session 時的 git 狀態

- branch: `main`，落後 origin/main 6 個 commit（待 push）
- HEAD：`3f68bdf feat(web): add /status page consuming /v1/health end to end`
- 本 session commits（時間順）：
  1. `a736ea0` docs(rules): sync rule 30/31 + commitlint with apps/api impl
  2. `ecff4c1` chore(web): add next 14, next-intl, react 18 and tailwind deps
  3. `217448f` feat(web): scaffold next.js app router with [locale] i18n routing
  4. `ad2c20d` feat(web): wire tailwind preset, globals.css and theme provider
  5. `15a0809` feat(web): add zod-validated env, typed api client and shared health dto
  6. `3f68bdf` feat(web): add /status page consuming /v1/health end to end
  7. （本 docs commit — 接下來要 ship）
