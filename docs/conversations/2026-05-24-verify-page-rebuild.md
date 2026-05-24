# /verify 頁面重寫 — 2026-05-24

> 本文件歸檔 OpenTrade 項目 2026-05-24（晚場）/verify L2 驗證頁面重寫 session 的精華內容。

## 對話脈絡

- **日期**：2026-05-24（接續 console admin nav bug 修復 session 之後）
- **參與者**：項目負責人（使用者） + AI agent
- **AI 模型**：Claude Opus 4.7
- **背景**：使用者在前一個 session 已修好 admin console 導航問題並 push。檢視 `/verify` 頁面後發現原本的 UI 只能讓使用者「手動貼 IPFS CID」，沒有實際檔案上傳機制，要求按使用者提供的 5 個 Google AI Studio reference file（`SbtVerification.tsx` / `Navigation.tsx` / `PublicLayout.tsx` / `App.tsx` / `types.ts`）整頁重做。

---

## 主要討論內容

### 1. /verify 頁面 — UI 重做 + 後端真實檔案上傳

**問題定位**：

- 原本 `/verify` 頁要求使用者「先把對帳單上傳到 IPFS（外部工具）→ 複製 CID → 貼到表單」。完全不符合散戶 UX 預期。
- Google 設計稿示範了 dark crypto 主題（`#050608` + `#00FF88` accent + 藍色 glow）+ drag-drop 檔案上傳區 + 右側 4 步驟卡。

**架構約束**（ADR-0022）：

- raw 檔案**不可入我們 DB**
- commitment hash 必須在**瀏覽器本地**計算
- 鏈上只存 commitment + IPFS CID

**實作分層**：

| 層                                          | 變更                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                                  | 新增 `POST /v1/auth/verify-broker/upload` route：`authMiddleware('user')` + `c.req.parseBody()` + `File instanceof` 驗證 + MIME 白名單（PDF/JPG/PNG/WebP）+ 10MB size 上限 + 檔名脫敏為 `verify-{userId}-{timestamp}` + 透過 `PinataIpfsService.pinFile()` 上傳到 IPFS + 回傳 `{cid, size, mimeType}`。 |
| `IIpfsService` + `PinataIpfsService`        | 加 `pinFile(file, name)` 方法（delegate 給 `pinata.upload.public.file()`）。                                                                                                                                                                                                                            |
| `apps/web/lib/api/client.ts`                | 加 `uploadVerifyEvidence(file, options)` — multipart/form-data wrapper，沿用 `ApiClientError` envelope。                                                                                                                                                                                                |
| `apps/web/components/verify/VerifyForm.tsx` | 完整重寫：dark theme + drag-drop + 上傳後自動算 commitment + 三狀態（未登入 / 上傳中 / 成功）+ 改用 `AbortController` 取代 `let cancelled` 模式。                                                                                                                                                       |
| `apps/web/app/[locale]/verify/page.tsx`     | 加 atmospheric glow 背景 + sticky 右側 VerifySteps。                                                                                                                                                                                                                                                    |
| i18n 三語                                   | 加 12 個新 key（drag-drop hints / upload status / IPFS CID / commitment ready / removeFile）。                                                                                                                                                                                                          |

### 2. /verify 第二輪優化 — 搜尋式 combobox + locale-aware 名稱

**使用者反饋**：

> 1. 由於券商太多，可以選擇券商時可以讓客戶輸入名字再選擇
> 2. 券商名字沒有按當前語言顯示

**根因 — locale 顯示為什麼錯**：

- DB schema 有 `Broker.legalName`（英文）+ `Broker.displayName`（中文，無中文時 fallback 英文）
- 欄位名稱**沒有語言後綴**（misleading）
- `seed/sfc-brokers.json` 流程：`displayName = legalNameZh`, `legalName = legalNameEn`（見 `packages/db/src/sfc/sync-brokers.ts:69-70`）
- 前端原本只用 `b.displayName` → 永遠顯示中文，英文 UI 也是中文

**修法**：

- 新增 helper：`localizedBrokerName(b, locale) = locale === 'en' ? b.legalName : b.displayName`
- 同時顯示對立語言副標題（避免英文使用者選錯券商）

**Combobox 設計選擇**：

- 後端：將 `/v1/brokers` 的 `limit` cap 從 50 提到 100（給 autocomplete UX 用）
- 前端：自製 `BrokerCombobox` 子元件，不引入新依賴
  - SSR 預載 100 筆，本地即時過濾（typing 零延遲感）
  - 250 ms debounce 對 `/v1/brokers?search=` 發 request（server 結果回來覆蓋本地過濾）
  - Click-outside 關閉、AbortController 取消、選中項目高亮 + check icon

### 3. Combobox bug — 搜尋後點選空白

**Bug 描述**：使用者輸入「Citi」搜尋 → 點選結果 → input 變空白；直接從下拉點（不打字）→ 正常。

**根因分析**（4 步全踩中才會發生）：

1. 打字 → API 搜出**不在初始 100 筆 SSR pool** 的券商
2. 點它 → `handleSelect` 跑 `setSearch('')`
3. `search = ''` 觸發 debounce effect → `setRemoteBrokers(null)` 把遠端結果清掉
4. `selectedBroker` 重算：先找 `remoteBrokers`（null）→ 再找 `initialBrokers`（找不到）→ `null` → input 空白

**修法**：

- 把選中的 broker **完整資料**用獨立 state `selectedBroker` 快取
- `handleSelect` 改吃 `Broker` 物件而不是 slug → 立刻寫入 cache
- 即使後續 `remoteBrokers` 被清掉，label 也能維持

---

### 4. Cursor Rules self-review

**rule 51 (i18n) DB 多語欄位章節更新**：

原本只列 JSON 欄位 + translation table 兩種模式。但 OpenTrade Broker 表實際在用的是「平行 String 欄位」（`legalName`/`displayName`），且 column 名稱誤導性高。

新增「模式 A：平行欄位」章節：

- 明確標示這是 OpenTrade Broker 表當前在用
- 強制要求 locale-aware getter，不可 `<span>{broker.displayName}</span>`
- 嚴禁清單加：「DB 平行欄位（如 `legalName` / `displayName`）在 UI 直接顯示不轉 locale」
- 預告：未來若加第三語應 schema 改名為 `nameEn` / `nameZhHant` / `nameZhHans` 並寫 ADR

---

### 5. Branch protection 議題（純解釋，無 action）

使用者問 push main 時看到 `Bypassed rule violations` 是什麼。解釋：

- GitHub repo 有 ruleset 強制 PR-only + 7 個 CI 必過
- 使用者目前在 bypass actor 名單，可直接 push main 而不觸發
- ADR-0018 D10 允許單人開發階段保留 bypass
- 第二位 contributor 加入前要把自己拿出 bypass 名單，否則工作流不對稱

---

## 產生的 ADR

無。所有變更都在既有 ADR 範疇內：

- ADR-0021 ReviewerSBT（one-mint-per-address）
- ADR-0022 commitment-hash 驗證流程

---

## Commit 列表（6 commits, 全部 push 到 origin/main）

| Hash      | Scope                | 內容                                                                      |
| --------- | -------------------- | ------------------------------------------------------------------------- |
| `17cc217` | `feat(api)`          | verify-broker upload endpoint + brokers limit 100 + IPFS `pinFile`        |
| `d28d83f` | `feat(web)`          | API client `uploadVerifyEvidence` + `fetchBrokers` limit 參數             |
| `bb98db9` | `feat(web)`          | i18n 三語 upload 狀態 + broker search 字串                                |
| `013d6eb` | `feat(web)`          | `/verify` UI 完整重寫（dark theme + drag-drop + combobox + locale-aware） |
| `2131fef` | `docs(rules,status)` | rule 51 加 DB 多語欄位 模式 A + status 記錄                               |
| `478f47f` | `fix(web)`           | combobox 搜尋後點選空白 bug 修復                                          |

---

## 待後續處理事項

### 1. 多券商驗證 SBT 策略（HIGH PRIORITY — 必須在 #2 前釐清）

當前架構：

- `SbtVerificationRequest` schema 允許一個 user 對多個 `brokerSlug` 各提一筆（每筆獨立 commitment hash）
- Admin approve 流程把 user `sbtTier` 升 L2 + 觸發 outbox 鑄 **ONE** SBT（per ADR-0021 D3 one-mint-per-address）

問題：第二次 verify（不同 broker）通過後 SBT 怎麼處理？

三個候選方案：

| 方案  | 描述                                              | Pros               | Cons                                                                                                         |
| ----- | ------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **A** | 不再鑄 SBT，只在 user 紀錄加 verified broker list | 簡單               | SBT 失去「綁定 broker」語意，鏈上看不到驗證了哪些券商                                                        |
| **B** | SBT tokenURI 升級為 list of brokers               | 鏈上可見、語意清楚 | ReviewerSBT 需加 `updateTokenURI(tokenId, newURI)`，要寫 ADR 修正 ADR-0021；admin 每次 approve 要重 pin IPFS |
| **C** | SBT per broker（ERC1155 或多 ERC721）             | 最 verbose、最清楚 | 重做 ReviewerSBT 架構；user 錢包可能有 N 個 SBT                                                              |

需寫 ADR 拍板。影響面：

- DB schema（是否加 `userId × brokerSlug` unique 防重複 approve？）
- Admin approve 流程
- `/verify` UI 是否阻擋已驗證 broker
- Review submission gate 邏輯（一張 SBT 給所有 broker 寫評論 vs 該 broker 的 SBT 才能寫該 broker 評論）

### 2. `/admin/users` 加用戶上傳檔案瀏覽 UI

當前 admin 看 verify 申請時無法檢視使用者上傳的 IPFS 證明（只有 CID hash）。需要：

- **使用者要再提供 Google UI reference**（前次只給了 `SbtVerification.tsx` 等 5 個用於 `/verify` 頁，需要 admin 相關的 reference）
- admin verifications 頁加 IPFS preview（PDF iframe / image preview，透過 Pinata gateway URL `https://gateway.pinata.cloud/ipfs/{cid}`）
- 順便：`/admin/users` 詳細頁列出該用戶的所有 `SbtVerificationRequest`（成功 / 失敗 / pending）

依賴 #1 決策才能準確設計 UI（如果 SBT 是 list-of-brokers 模式，admin 介面要能管理 list；如果是單張 SBT 模式，要決定如何顯示「user 已驗證了 N 個 broker」狀態）。

---

## 給未來 AI agent 的建議

1. **先讀 `/verify` 頁的 flow**：使用者體驗已不是「貼 CID」而是 drag-drop file。所有相關 admin / UI 思考都要對齊新模式。
2. **多券商驗證問題不要直接動手**，先與使用者確認方案 A/B/C 哪個方向，再寫 ADR、再開工。
3. **`Broker.displayName` 不是「顯示名」是「中文名」**。看到任何「永遠顯示中文」bug，第一個檢查就是有沒有走 locale-aware getter（rule 51 模式 A）。
4. **Combobox 是自製、非 Headless UI / Radix**。若要改它的行為，先讀 `apps/web/src/components/verify/VerifyForm.tsx` 的 `BrokerCombobox` 整個 component（含 4 個 useEffect + selectedBroker cache 設計），別貿然「重構成標準 component」。
5. **AbortController + signal pattern**：本 session 把 `useEffect` 內的 async fetch 全部改用此 pattern（取代 `let cancelled = false`），下個 agent 應沿用。
