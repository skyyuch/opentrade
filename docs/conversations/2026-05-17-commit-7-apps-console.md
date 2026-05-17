# Commit number-seven — `apps/console` 初始化（2026-05-17）

> 本文件歸檔 OpenTrade 項目 Commit number-seven 對話的精華內容。
> 給未來 AI agent 接手用：讀完本檔即可掌握 `apps/console` 的設計決策、與 `apps/web` 對比、以及為什麼某些事**沒**做。

---

## 對話脈絡

- **日期**：2026-05-17（與 commit #1～#6 同日；當天總共 7 個 commit）
- **參與者**：項目負責人，Claude Opus 4.7 作為 AI agent
- **背景**：Commit number-six 完成後 Phase 0 進度 93%；本 session 負責 Commit number-seven（apps/console 初始化）
- **session 起點**：使用者複製貼上 AGENTS.md 標準 handoff prompt，要求 agent 讀 8 份文件、回報進度，並提示「本次目標 — apps/console 初始化（Next 14 + dark default + port 3001 + 商戶 dashboard 殼，大量複用 apps/web 模板）」
- **使用者的記憶校正**：使用者在 prompt 結尾誤記「7 個 commit 未 push」，agent 校正為「`origin/main` 已同步、0 個未 push」
- **agent 開場確認後**：使用者拍板「同意」，agent 直接進入拆解與執行

---

## 主要討論內容（按主題分節）

### 1. 拆解粒度：8 個原子 commit

依 cursor rule 96「強制拆解觸發」（涉及 ≥ 5 個檔案、屬於新功能初始化），agent 開工前先 `TodoWrite` 拆成 t1～t8，每個 commit < 200 行 diff、可獨立通過 CI。

| Step | Commit                                                                | Δ vs apps/web               |
| ---- | --------------------------------------------------------------------- | --------------------------- |
| t1   | `chore(console): add next 14, next-intl, react 18 and tailwind deps`  | 同 pin，port 3001           |
| t2   | `chore(console): wire next.config, tailwind preset and postcss`       | 配置完全 mirror             |
| t3   | `feat(console): scaffold next.js app router with [locale] i18n`       | 同 + auth gate Phase-1 TODO |
| t4   | `feat(console): wire tailwind preset, globals.css and dark theme`     | **`defaultTheme="dark"`**   |
| t5   | `feat(console): add merchant dashboard placeholder shell`             | 4-card 商戶後台             |
| t6   | `feat(console): add robots disallow-all and zod-validated client env` | **robots disallow-all**     |
| t7   | `docs(console): document the Phase 0 console shell and how to run it` | README 同步                 |
| t8   | （docs handoff — 本 commit）                                          | status / conversation 歸檔  |

**為什麼這個粒度合理**：

- t1-t2 純配置 / 依賴 — 不該與真實 source 混。
- t3 i18n 三件套 — 是個獨立邏輯單元（routing.ts / request.ts / navigation.ts / middleware.ts 互相耦合，但對 layout / page 是黑盒）。
- t4 layout + ThemeProvider + messages — 一起 commit 因為 layout 必須讀 messages，分開會出現「中間態」commit 無法獨立啟動。
- t5 page — 純展示，無外部依賴；獨立 commit 讓 reviewer 可單看 UI。
- t6 robots + env — 兩個都是「站級小檔」，合在一起避免 commit 太碎。
- t7 README — docs only，不混 code。
- t8 docs handoff — 不算「commit number-seven 本身」，是 session 結束的程序。

---

### 2. apps/web 與 apps/console 的「3 個唯一差異」紀律

這是本 commit 最核心的設計決策：

| 維度         | apps/web   | apps/console              |
| ------------ | ---------- | ------------------------- |
| 預設主題     | light      | **dark**                  |
| dev port     | 3000       | **3001**                  |
| robots / SEO | 預設可索引 | **全 disallow + noindex** |

**其他所有東西都必須相同**。具體表現：

- `next.config.mjs`：transpilePackages、reactStrictMode、poweredByHeader、experimental.typedRoutes 完全一致
- `tailwind.config.ts`：完全一致（都 extends preset，content 路徑一樣）
- `postcss.config.mjs`：完全一致
- `i18n/{routing,request,navigation}.ts`：三 locale + as-needed prefix 完全一致
- `middleware.ts`：matcher 一致
- `layout.tsx`：除 `robots: { index: false, follow: false }` + dark ThemeProvider 外完全一致
- `env.ts`：完全一致（兩份檔，但每個字元都同步）

**為什麼 env.ts 要重複而不抽到 packages/web-config？**

agent 在 t6 docblock 寫了答案：「兩個 app 共用同一 NEXT_PUBLIC_API_URL，但抽出去新建 `@opentrade/web-config` 在 Phase 0 是過度抽象」。重複 + 同步紀律 + docblock 互相提醒，比新建 package 便宜。等到 console-specific env 出現（例如 console 自己的 Privy app id）再決定要不要抽。

**ImmutableMark 紀律**：

per ADR-0011 §5.1，ImmutableMark 只能用在真正的鏈上資料上。Phase 0 console 殼的 4 張 card 是 placeholder（claim / reviews / signals / disputes），都是 mock copy，**絕對不可以**裝飾 ImmutableMark。agent 在 t5 page.tsx 的 docblock + commit message + console README 三處都寫了這條紀律，避免未來 agent 「順手加上去看起來更專業」。

---

### 3. robots.txt 放在 `app/` 根而非 `[locale]/` 下

Next 14 metadata route：`robots.ts` 是站級（site-level）資源。

**為什麼不能放在 `[locale]/`**：robots.txt 不該因 locale 變動，也不該需要 locale prefix 才能取到。瀏覽器 / 爬蟲都期待 `/robots.txt`（root），不是 `/zh-Hant/robots.txt`。

**為什麼放在 `app/` 根不會與 next-intl middleware 衝突**：next-intl middleware 的 matcher 是 `'/((?!api|trpc|_next|_vercel|.*\\..*).*)'`，已排除任何路徑含 dot 的請求 — `/robots.txt` 因為含 `.txt` 自動繞過 middleware，直接打到 metadata route。

→ 這是個對未來 agent 重要的小知識，agent 在 robots.ts 的 docblock + commit message 雙處都寫了原因。

---

### 4. **雙保險**：layout `meta robots` + `app/robots.ts`

Console 在兩個層級都標 noindex：

1. **layout.tsx 的 `generateMetadata`** 設 `robots: { index: false, follow: false }` → 渲染進每個 HTML 的 `<meta name="robots" content="noindex, nofollow">`
2. **app/robots.ts** 回 `User-Agent: *  Disallow: /` → 給尊重 robots.txt 的爬蟲

**為什麼要雙保險**：

- 主流爬蟲（Google / Bing）兩個都尊重，但 robots.txt 是「請求別爬」，meta robots 是「即使爬到也別索引」
- 一些惡意爬蟲忽略 robots.txt，meta robots 還是會被「乖一點的爬蟲」尊重
- ADR-0010 implementation notes 提到 production 還會在 edge 加 `X-Robots-Tag: noindex, nofollow` header — 那是第三層保險，等 Commit number-nine（infra）落地時設置

→ 三層保險（robots.txt + meta robots + edge header）對私有後台來說是正確的紀律。

---

### 5. middleware **不接 auth**：Phase 1 的 TODO 寫在 docblock

per ADR-0010，console **未登入應該 redirect 到 `/login`**。但本 commit 殼**不接 auth**（已和使用者開場確認）。

**為什麼這樣設計**：

- 殼級 commit 的目的是讓「設計系統 + i18n pipeline + dark default」可被獨立 review，不需要 KYC infra 才能跑起來
- 把 auth 推到 Phase 1 配合真正的 Privy + KYC 流程，避免 Phase 0 寫一份「先擋一下」的臨時 auth 然後 Phase 1 重寫

**怎麼確保未來 agent 不忘記接**：

1. middleware.ts 的 docblock 明確寫「Phase-1 expansion (per ADR-0010 §"Auth flow")」
2. ADR-0010 已經有 detailed auth flow 描述
3. status.md「待決策」段已有「API 認證流程」項目
4. console README 「KYC-gated entry — Phase 0 shell is intentionally browseable; the auth gate composes onto the i18n middleware in Phase 1」

四處交叉提醒，下個 agent 看到任何一處都會接得起來。

---

### 6. 商戶 dashboard 殼的 UI 結構決策

t5 寫 4 張 card 的 grid，icon 用 lucide：

| Section  | Icon        | 對應業務功能             |
| -------- | ----------- | ------------------------ |
| claim    | ShieldCheck | KYC 後綁定身份、認領專頁 |
| reviews  | Star        | 鏈上評論列表             |
| signals  | TrendingUp  | KOL 買賣訊號發送         |
| disputes | Gavel       | 爭議仲裁、陪審程序       |

**為什麼這 4 個**：對應 OpenTrade 核心功能，不是隨意挑的。

- `claim`：所有商戶 / KOL 進來的第一步
- `reviews`：散戶端產出，商戶端消費（讀，不能刪）
- `signals`：KOL 專屬功能（per Phase 2 roadmap）
- `disputes`：爭議仲裁（per Phase 3 roadmap）

→ 這 4 張 card 是 OpenTrade Phase 1-3 整個 console 的 UI 大綱預告。messages JSON 的文案直接用上業務語言（「平台無權刪除任何已上鏈評論」、「鏈上時序與 SBT 等級加權」、「oracle 客觀計算勝率」），不是空泛的 lorem ipsum。

**hairline border + bg-card + dashed phase hint**：完全照 ADR-0011 §4 「視覺風格六鐵律」執行（hairline 細線、適中圓角、陰影克制、空白慷慨、動效低調）。

---

### 7. 端到端驗證：HTTP 直接抓字串

t8 的 prod start 驗證**不是用截圖**，是用 `curl -s` + `grep` 直接從 HTML 抓出三個關鍵字：

```bash
# 1. robots.txt 真的 disallow 了嗎？
curl -s http://localhost:3001/robots.txt
# → User-Agent: *
#   Disallow: /

# 2. dark default 真的注入了嗎？
curl -s http://localhost:3001/en | grep '"theme","dark"'
# → next-themes inline script 的 third-arg = "dark"

# 3. meta robots 真的雙保險了嗎？
curl -s http://localhost:3001/zh-Hant | grep '<meta name="robots"'
# → <meta name="robots" content="noindex, nofollow"/>

# 4. 三 locale title 都翻譯了嗎？
curl -s http://localhost:3001/        # zh-Hant: OpenTrade 商戶後台
curl -s http://localhost:3001/zh-Hans # zh-Hans: OpenTrade 商户后台
curl -s http://localhost:3001/en      # en:      OpenTrade merchant back office
```

**為什麼用 HTTP 字串驗證而不是 Playwright**：

- 這 4 個檢查都是「靜態渲染輸出」，不需要瀏覽器執行 JS
- Playwright 等 E2E 工具是 Phase 0.6 / Phase 1 才會引入（per testing rule）
- 直接 grep 比裝 Puppeteer 快 100 倍

→ 這個模式之後 (Phase 1+) E2E test 可以接上去，但 Phase 0 殼級驗證用 grep 就夠了。

---

## 產生的 ADR

- 無新 ADR — 所有設計決策都對齊既有 ADR-0010（web/console 拆分） + ADR-0011（UI 設計語言） + ADR-0014（apps/api specifier 慣例 — 同樣套用到 apps/console）

## 關連既有 ADR

- ADR-0009：Storybook-first（解釋為何 ImmutableMark 不在 dashboard 殼用）
- ADR-0010：apps/web vs apps/console 拆分（dev port、CORS、robots、auth flow 都引用）
- ADR-0011：UI 設計語言（dark default for console、Inter、ImmutableMark §5.1 紀律、四張 card 的 hairline + bg-card 樣式）
- ADR-0014：apps/api 運行架構（apps/console 用 webpack bare specifier，與 apps/web 同 — 對比 apps/api 用 .js specifier）
- rule 10 / rule 21 / rule 22 / rule 30 / rule 50 / rule 51 / rule 96

## 待後續處理事項

- [ ] **Commit number-seven 系列 8 個 commits 推到 GitHub**：本 session 結束時尚未 push（落後 origin/main 8 個）。等使用者明確指示再 push
- [ ] **Phase 1 auth gate 寫進 console middleware**：per ADR-0010 §"Auth flow"，未登入 redirect 到 `/login`；當前 docblock TODO 已寫
- [ ] **`X-Robots-Tag: noindex, nofollow` edge header**：per ADR-0010 production 第三層保險，Commit number-nine（infra/terraform）落地時要在 CloudFront origin response 設好
- [ ] **`<ImmutableMark>` Phase 1 首次真實使用**：等鏈上評論落地後第一個 review card 用（已是延續 commit number-six 的待辦，本 commit 沒動）
- [ ] **console 的 `/login` 頁面**：Phase 1 KYC + Privy 流程上線時加
- [ ] **console 部署規劃**：Commit number-nine（infra）需設立獨立 OpenNext + S3 + CloudFront 給 console 自家用，不和 apps/web 共部署

---

## 給未來 AI agent 的建議

### Commit number-eight（packages/contracts）會切換語境

從 Next.js + i18n 的 web 殼語境跳到 Solidity + Foundry + OpenZeppelin 的合約語境。建議下個 agent：

1. 重讀 ADR-0006（DDD + Modular Monolith 與合約 facade 的關係）
2. 重讀 rule 41（solidity-contracts.mdc）
3. 完整讀 ADR-0007（為何 V1 不發 token — 影響合約設計範圍）

不需要繼續關注 console 的事，Phase 1 auth gate 才是 console 的下一個 milestone。

### 本 session 學到的要點

1. **「3 個唯一差異」紀律比「自由發揮」更尊重 ADR** — apps/web 與 apps/console 的差異被嚴格限制在 3 處（dark default、port、robots），其他全 mirror。任何想要新增第 4 個差異都該寫 ADR。
2. **雙保險 / 三保險的私有後台模式** — robots.txt + meta robots + edge header 三層，私有後台缺一不可。
3. **Phase 0 殼**的目的是「能 demo + 能驗證 pipeline」，不是「功能完整」 — auth、API call、ImmutableMark 全部刻意延後到對應 Phase。
4. **HTML 字串驗證**對殼級 commit 是足夠的，Playwright 留給有 user interaction 的 Phase 1 流程。
5. **每個原子 commit 必須能獨立通過 CI** — t1 動 package.json 但保留 stub `src/index.ts`（讓 tsc 至少有一個 input），t3 才把 stub 刪掉，這個順序避免任何中間 commit 出現「typecheck 沒輸入」的紅 CI。

### 結束本 session 時的 git 狀態

- branch: `main`，與 `origin/main` 同步（push 完成）
- HEAD（本 session 開始前）：`71ad956 docs(status): mark commit number-six as pushed`
- HEAD（本 session 結束）：`3c44684 docs(status): handoff after commit number-seven (apps/console shipped)`，後續再加一個小 status commit 標 push 完成
- 本 session commits（時間順）：
  1. `4cdfade` chore(console): add next 14, next-intl, react 18 and tailwind deps
  2. `d5c9f44` chore(console): wire next.config, tailwind preset and postcss pipeline
  3. `c496281` feat(console): scaffold next.js app router with [locale] i18n routing
  4. `f6a18e1` feat(console): wire tailwind preset, globals.css and dark theme provider
  5. `81517fe` feat(console): add merchant dashboard placeholder shell
  6. `c7b0ad9` feat(console): add robots disallow-all and zod-validated client env
  7. `6237948` docs(console): document the Phase 0 console shell and how to run it
  8. `3c44684` docs(status): handoff after commit number-seven (apps/console shipped)
  9. （`docs(status): mark commit number-seven as pushed` — 本 push 後追加）
