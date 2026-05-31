# 訊號標的目錄 + KOL 分析師筆記 — Session 1-4 — 2026-05-31

> 本文件歸檔「訊號標的選擇器 + 分析師筆記」5-session 執行計畫 Session 1（決策 + schema + shared types）、Session 2（智能合約層）、Session 3（標的目錄後端）與 Session 4（KOL 筆記後端）的決策與踩坑精華。

## 對話脈絡

- **日期**：2026-05-31
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.8
- **背景**：兩個產品優化需求 —
  1. 訊號標的物從純文字輸入升級為「類別 + 可搜尋列表」（港股/美股/指數/虛擬貨幣/商品；例如選港股輸入 `005` 回 `00005 匯豐控股`）。
  2. KOL 除了結構化訊號外，需要分享富文本筆記（含 K 線截圖）。
- **分工約定**：UI 由 Google Studio 處理，AI 只實現功能但需提供 UI 需求描述。
- **品質約定**：拆成多個 session，每個自然邏輯單元結尾做 handoff，避免單一 agent context 過長降質。

## 主要討論內容

### 1. 標的目錄 vs ADR-0036 D5 的張力（→ ADR-0038）

ADR-0036 D5 原本明確**反對**策展標的清單（怕限制 KOL 表達、把喊單推去 Telegram）。本 session 的解法是**擴充而非推翻**：策展目錄當 UX 輔助、free-text 仍是 first-class fallback。關鍵決定：

- **重用 `AssetClass` 當 `Instrument.category`**，不另開 `InstrumentCategory` enum。理由：5 個 user-facing 類別本來就是 `AssetClass` 的子集，重用 → 訊號 `assetClass = instrument.category` 無映射層、無漂移（單一真相來源）。選擇器只 surface `EQUITY_HK / EQUITY_US / INDEX / CRYPTO / COMMODITY`；`FUTURES / SPOT / FOREX` 留為 legacy 不 surface。
- **擴 `AssetClass` 加 `INDEX`/`COMMODITY`**，append 在最後（位置 6、7）以保留 on-chain `uint8` 0-5 順序穩定。合約 `<=5` → `<=7` 的升級留 Session 2。
- **資料來源**：HKEX List of Securities + SEC `company_tickers.json` + CoinGecko `/coins/list`（皆免費無金鑰）+ 策展 index/commodity JSON。**不爬 investing.com**（ToS + 反爬脆弱）、**不在 request time 打外部 API**（延遲 + rate limit + 合規面）。搜尋走本地同步後的目錄。
- **`Instrument` 無 `tenantId`**：全域市場參考表（rule 31 documented exception，像幣別/國家 lookup）。

### 2. KOL 筆記要不要不可變上鏈？（→ ADR-0039）

負責人選擇 **on-chain hash + IPFS 原文**（不可變），對齊平台核心承諾（「贏了高調、輸了刪文」正是要防的行為）。決定：

- 新 `KolNoteRegistry` 合約 mirror `KolSignalRegistry`（append-only、無修改/刪除函數）。
- `bodyJson` 存 ProseMirror/TipTap 可攜 JSON；圖片走 IPFS CID（不 base64 inline）。
- 可獨立或附於 signal（`linkedSignalId` 鏈上是 signal id、鏈下是 DB UUID FK）。
- `KolNote` 無 `deletedAt`（不可變如 signal，tenant-scoped 因為是 UGC）。

### 3. DB drift 踩坑（重要 — 給未來 agent）

`opentrade_dev` 存在 **pre-existing drift**：`20260527131221_add_kol_admin_note` migration 的 checksum 被改過 + `notifications.id` default 漂移。後果是 `prisma migrate dev` 會要求 **reset 整個 dev DB**（清掉既有 e2e 驗證資料）。

**本 session 採取的非破壞路線**（未碰既有資料）：

1. 改 `schema.prisma` → `prisma format` 驗證。
2. 建 throwaway shadow DB `opentrade_migshadow` → `migrate diff --from-migrations` 產 SQL。
3. **手工策展 migration.sql**：排除 diff 連帶冒出的無關 `notifications.id drop-default` drift 行，只留本 feature 的 DDL（保持 atomic）。
4. shadow DB `migrate deploy` replay 全 13 migration 驗證乾淨 → drop shadow。
5. 純 additive DDL 直接 `psql` apply 到 `opentrade_dev` → `prisma migrate resolve --applied` 記錄。

> ⚠️ drift 仍在。建議獨立時機處理（單獨 migration 修 `notifications.id`，或方便時 reset + reseed dev）。

## 產生的 ADR

- **ADR-0038**：Instrument catalog + extend asset class scope（amends ADR-0036 D5）。
- **ADR-0039**：KOL analyst notes — immutable rich-text on-chain + IPFS。

## Session 2（2026-05-31）— 智能合約層

Session 2 把 Session 1 拍板的合約規格落地，3 個 atomic commit（C1 signal upgrade / C2 KolNoteRegistry / C3 config+env），全程 forge 100% coverage。

### 1. KolSignalRegistry asset class 升級（C1）

- `emitSignal` 驗證 `assetClass > 5` 放寬為 `> 7`，納入 ADR-0038 D3 append 的 `INDEX`(6) / `COMMODITY`(7)。
- 這是 **storage-layout-safe** 改動（只動 validation logic，struct/mapping 不變）→ 純 UUPS implementation swap，無需 reinitializer、calldata 為空。
- 新 `UpgradeKolSignalRegistry.s.sol`：deploy 新 impl + `proxy.upgradeToAndCall(newImpl, "")`，broadcasting key 必須持 `UPGRADER_ROLE`。
- 測試踩點：原 `test_Emit_InvalidAssetClass_Reverts` 用 `6` 當 invalid，升級後 6 變 valid，必須改成 `8`；fuzz `vm.assume(assetClass <= 5)` 同步改 `<= 7`。加了 upgrade test 證明升級後既有 signal 存活 + 放寬範圍生效，順帶補滿 `_authorizeUpgrade` 的 coverage。

### 2. KolNoteRegistry（C2）

- `src/notes/KolNoteRegistry.sol` 完全鏡像 `KolSignalRegistry`：roles / `__gap` / custom errors / event shape / UUPS / `_disableInitializers`。
- 差異：note struct 無 assetClass/direction/horizon，改為 `linkedSignalId uint256`（`0` = standalone，其他 = on-chain signal id per ADR-0039 D1）。`emitNote` 驗證只有三條（kolId / contentHash / ipfsCid 非空）——`linkedSignalId` 無約束（0 是合法 standalone 值）。
- append-only、無任何修改/刪除函數（rule 00 + rule 41 紅線）。

### 3. config + env（C3）

- `packages/config` 之前**並未**把 KolSignalRegistry / KolSbt 收進 `ContractAddresses`（它們只在 outbox worker 直接讀 `process.env`）。本 session 依 ADR-0039 D1/D4 把 `kolNoteRegistry` 加進 config，設為 **optional**（未部署前 undefined，Session 4 worker graceful skip）。
- **踩坑**：`packages/config` 開了 `exactOptionalPropertyTypes: true`，optional 欄位不能賦 `undefined`，必須條件 spread key（`...(x ? { k: v } : {})`）。

### 重要：合約尚未上鏈

- KolSignalRegistry 的 `<= 7` 升級**只寫了 code + 升級腳本，尚未 broadcast**。既有部署 proxy `0xf444...35be` 仍跑舊 impl `<= 5`。Session 3 把 INDEX/COMMODITY 訊號要上鏈前，需先跑升級腳本。
- KolNoteRegistry **尚未部署**（無 `KOL_NOTE_REGISTRY_ADDRESS`），Session 4 worker handler graceful skip 直到部署。

## Session 3（2026-05-31）— 標的目錄後端

Session 3 把標的目錄的後端落地，6 個 atomic commit（C1 asset-class maps / C2 IPFS pin fix / C3 instrumentId wiring / C4 catalog upsert+curated / C5 external sources / C6 search endpoint），全程 7-workspace typecheck + lint + 101 api unit tests 綠。

### 1. 修補 signal IPFS pinning gap（C2，關鍵）

Session 1 handoff 點名的既知 gap：`EmitSignalUseCase` 原 `ipfsCid=''`，outbox worker `processSignalSubmitted` 看到空 CID 直接 throw `has no ipfsCid`，signal 永遠不上鏈——默默違反不可竄改承諾。修法：注入 `IIpfsService`（reviews 的 Pinata adapter，complaints/identity 早就跨域 import，established pattern，**免 refactor 到 shared**），pin 完整 payload、存真實 CID；hashed object 就是 pinned object，故 contentHash 對齊 IPFS 內容；pin 失敗 propagate 中止建立（mirror SubmitReviewUseCase）。

### 2. catalog sync 架構（C4/C5）

- `packages/db/src/catalog/`：`syncInstruments(prisma, data)` source-agnostic 冪等 upsert（key `[category,symbol]`），`nameZhHans` 在 upsert 內 OpenCC 衍生（reuse `src/sfc/opencc.ts`，免 lift），per-source soft-retirement 對賬（partial sync 不誤殺他源）。
- 三外部 source 皆免金鑰：**HKEX** List of Securities（英 + 繁中 bulk XLSX 以股票代號 join，只取 Equity；用 `fflate` 輕量 unzip + regex 解析 inline-string XLSX，避開 SheetJS CVE / exceljs 重量）；**SEC** `company_tickers.json`；**CoinGecko** `/coins/markets` top 500（ADR-0038 D5 寫 `/coins/list` 但該端點 17k 未排序雜訊，改 markets 排序版——同 provider 同免金鑰，文件化 refinement）。
- 各 source 失敗隔離（一個掛只 warn skip，因 reconciliation per-source 缺源不誤殺）。dev DB 端到端：13,632 instruments / ~20s（`00005 → HSBC HOLDINGS / 匯豐控股`，正是 ADR 範例）/ re-run 冪等。

### 3. 搜尋 endpoint + instrumentId wiring（C6/C3）

- 新 instruments DDD domain 四層，`GET /v1/instruments?category=&q=&limit=` 搜本地 synced catalog（永不打 live API per D5），限 `isActive` + 5 surfaced 類別，public read-only。`q=005` 首回 `00005 HSBC HOLDINGS`。
- repo + port 跨域 export 給 signals 用；`EmitSignalUseCase` 解析 instrumentId → canonical symbol + `assetClass=instrument.category`（單一真相覆蓋 client 值），未知 id 拒，無 id free-text 原樣保留（D6）。

### 4. 踩坑紀錄（重要 — 給未來 agent）

1. **`packages/db` 不能 import `@opentrade/shared`**：db tsconfig 是 `composite: true` + `references: [../shared]`，但 shared package.json **無 `build` task**，turbo `typecheck` 的 `^build` 對 shared 是 no-op，故 shared 的 `dist/*.d.ts` 永不存在 → `tsc --noEmit` 報 `TS6305`。解法：catalog types 自定義 `InstrumentCategory` 局部 union（Prisma `AssetClass` 為 runtime 真相，shared 為 canonical 文件來源）。**未來若要在 db 引 shared，得先給 shared 加 build task。**
2. **HKEX 英文 XLSX 無中文名**：英文 List of Securities 只有 English name → 額外 fetch 繁中 companion 檔（`ListOfSecurities_c.xlsx`）以股票代號 join 補 `nameZh`。
3. **XLSX 是 inline-string 格式**（`<is><t>`，非 shared strings）：用 fflate unzip + namespace-agnostic regex 解析 `xl/worksheets/sheet1.xml`，只支援 HKEX 實際用到的 cell 形態子集。
4. **CoinGecko `/coins/list` vs `/coins/markets`**：前者 17k 未排序（含死幣/垃圾名），後者 market-cap 排序、同免金鑰 → 取 top 500 做品質 catalog。
5. **策展 JSON 路徑**：放 `packages/db/seed/data/`（既有 sfc-brokers/hk-kols 慣例）而非 ADR-0038 文字的 `seed-data/`，consolidate 避免兩套 dir。

### 5. 合約仍未上鏈（不變）

`KolSignalRegistry` `<=7` 升級 + `KolNoteRegistry` 仍只寫了 code 未 broadcast。在升級腳本跑之前，INDEX/COMMODITY signal 的 `signal.submitted` 會 on-chain revert（`InvalidAssetClass`），worker retry 5 次 terminal-fail（signal row 仍存 DB + IPFS）。其他類別（EQUITY/CRYPTO 等 0-5）不受影響照常上鏈。

## Session 4（2026-05-31）— KOL 筆記後端

Session 4 把 ADR-0039 的筆記後端落地，5 個 atomic commit（C1 domain+repo / C2 use cases / C3 routes+image upload / C4 outbox handler / C5 docs），全程 7-workspace typecheck + lint + 108 api unit tests 綠。

### 1. notes DDD domain（C1/C2/C3）

- 完全鏡像既有 signals/complaints 四層結構。`NoteEntity` 的 `body` 直接用 shared `RichTextDocument`（api 可 import `@opentrade/shared`，instruments domain 早有先例 — 與 Session 3 「db 不能 import shared」的限制無關，那是 db composite reference 的問題，api 無此限制）。
- `INoteRepository` port **故意不給 update/delete**——筆記 append-only（rule 00 + ADR-0039 D2），把不可變性編進型別系統（如同 complaints 把 rule 00 編進 discriminated union）。
- `CreateKolNoteUseCase` 與 `EmitSignalUseCase` 同骨架：KOL APPROVED + tenant gate → pin 完整 payload 到 IPFS（reuse reviews `IIpfsService`）→ `contentHash = sha256(pinned payload)`（hashed object = pinned object）→ pin 失敗 propagate 中止。額外加 `imageCids ≤ KOL_NOTE_MAX_IMAGES` 防濫用。

### 2. 三個關鍵設計決策

1. **筆記的 KOL 從 JWT 派生，不收 request body 的 kolId**（rule 50 不信 client）。signals route 收 body.kolId 再比對，notes 直接從 `findByUserId` 拿——更乾淨，少一個信任邊界。
2. **linked signal 完整性檢查放 Prisma repo 交易內**（查 signal 同 tenant+KOL，否則 throw）。替代方案是跨域 export signal repo 給 use case 注入，但 signals `index.ts` 只 export router 不 export repo，為了一個 FK 檢查去開跨域 export 不划算；referential integrity 放在 persistence 層的交易內反而最原子。
3. **image upload 限 5MB / image-only**（JPEG/PNG/WebP/GIF），比 identity `verify-broker/upload` 的 10MB+PDF 嚴格——K 線截圖綽綽有餘且降 IPFS pin 成本。回傳 `{cid, url}`（`url = PINATA_GATEWAY_URL + cid`）滿足 ADR-0039 D5。

### 3. outbox `note.submitted` handler（C4）

- mirror `processSignalSubmitted` + graceful skip（`KOL_NOTE_REGISTRY_ADDRESS` 未設則 ack-only）。
- **on-chain `linkedSignalId`(uint256) 的解析**是唯一新邏輯：DB 存的是 signal 的 UUID，但合約要 on-chain signal id。handler 查 linked signal 的 `chainSignalId`——若 signal 尚未上鏈（`chainSignalId` null）則 **throw 重試**，讓筆記在 signal 上鏈後才 anchor（保住鏈上 linkage 正確）；standalone = 0。若 signal 永遠 terminal-fail，筆記也會 terminal-fail（rows 仍存 DB+IPFS）——可接受且已文件化。

### 4. 無 rate-limit middleware（沿用先例）

專案目前**沒有** app 層 rate-limit middleware（grep `rateLimit` 0 命中），identity 的 upload 也沒套。寫入濫用防線靠 MIME/size guard，throttling 在 infra/WAF 層（per rule 30/50 的分層）。沒有為了 notes 而發明一個 middleware。

### 5. 合約仍未上鏈（不變）

`KolSignalRegistry` `<=7` 升級 + `KolNoteRegistry` 仍只寫了 code 未 broadcast。notes worker handler 因 `KOL_NOTE_REGISTRY_ADDRESS` 未設而 graceful skip——筆記照常寫 DB + pin IPFS，只是 `chainNoteId/chainTxHash` 留 null 直到合約部署。

## 待後續處理事項

| Owner      | 事項                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 下個 agent | Session 5 前端整合（Google Studio 交付 UI 後接標的選擇器 `GET /v1/instruments` + 筆記富文本編輯接 `POST /v1/notes` + `POST /v1/notes/images` + 顯示接 `GET /v1/notes` / `GET /v1/notes/:id`）               |
| 維運/合約  | broadcast `KolSignalRegistry` `<=7` 升級到 Base Sepolia（跑 `UpgradeKolSignalRegistry.s.sol`，需 `UPGRADER_ROLE`）+ 部署 `KolNoteRegistry`（`DeployKolNoteRegistry.s.sol`）並填 `KOL_NOTE_REGISTRY_ADDRESS` |
| 維運       | 生產環境跑 `pnpm --filter @opentrade/db sync:instruments` 填 catalog + 建議排程定期 sync（reconciliation 已支援增量/退場）                                                                                  |
| 維運       | 處理 `opentrade_dev` pre-existing drift（`notifications.id` + checksum）                                                                                                                                    |
| 技術債     | 若要在 `packages/db` import `@opentrade/shared`，須先給 shared 加 build task（否則 composite reference 的 `dist` 不存在）                                                                                   |

## 給未來 AI agent 的建議

1. **Session 邊界要守**：每個 session 是自然邏輯單元（決策→合約→後端→後端→前端），handoff 乾淨。
2. **UI 等 Google Studio**：Session 1-4 不寫 UI，但要在 handoff 時整理「UI 需求描述」給設計端。
3. **合約 enum 順序是 load-bearing**：`AssetClass` 的位置對應 on-chain `uint8`，永遠 append 不插中間。
4. **signal IPFS pinning 有既知 gap**：`EmitSignalUseCase` 目前 `ipfsCid=''` 導致 outbox worker 不上鏈，Session 3 一併修。
5. **dev DB migration 走 shadow + resolve 路線**直到 drift 被正式清掉。

## 相關連結

- [ADR-0036](../decisions/0036-kol-signal-architecture.md)
- [ADR-0038](../decisions/0038-instrument-catalog-and-asset-scope.md)
- [ADR-0039](../decisions/0039-kol-note-architecture.md)
- [docs/03-status.md](../03-status.md) — (37)-(40) 條目
