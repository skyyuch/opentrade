# 訊號標的目錄 + KOL 分析師筆記 — Session 1-2 — 2026-05-31

> 本文件歸檔「訊號標的選擇器 + 分析師筆記」5-session 執行計畫 Session 1（決策 + schema + shared types）與 Session 2（智能合約層）的決策與踩坑精華。

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

## 待後續處理事項

| Owner      | 事項                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 下個 agent | Session 3 標的目錄後端（catalog sync 腳本 HKEX/SEC/CoinGecko + 策展 JSON + `GET /v1/instruments` + 訊號接 instrumentId + 修 signal IPFS pinning gap + outbox `ASSET_CLASS_MAP` +INDEX/COMMODITY）           |
| 後續       | Session 4 筆記後端（notes DDD domain + 圖片上傳 + outbox `note.submitted` 接 KolNoteRegistry）                                                                                                              |
| 後續       | Session 5 前端整合（Google Studio 交付 UI 後接標的選擇器 + 筆記編輯/顯示）                                                                                                                                  |
| 維運/合約  | broadcast `KolSignalRegistry` `<=7` 升級到 Base Sepolia（跑 `UpgradeKolSignalRegistry.s.sol`，需 `UPGRADER_ROLE`）+ 部署 `KolNoteRegistry`（`DeployKolNoteRegistry.s.sol`）並填 `KOL_NOTE_REGISTRY_ADDRESS` |
| 維運       | 處理 `opentrade_dev` pre-existing drift（`notifications.id` + checksum）                                                                                                                                    |

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
- [docs/03-status.md](../03-status.md) — (37) 條目
