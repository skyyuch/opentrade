# 財經日曆 Q3-B 數值回填續棒（CA StatCan + SG SingStat + AU ABS）— 2026-08-05

> 本文件歸檔 OpenTrade 財經日曆 Q3-B「非美地區官方機讀資料 API 回填 previous/actual」續棒 session 的精華內容。
> 承接 [2026-08-05 Q3-B 起手（Eurostat + UK ONS）](./2026-08-05-calendar-values-backfill-eurostat-gb.md) 的四步驟實作模式（探勘→對官方新聞稿驗證→config+provider 回填→tests+live smoke）。

## 對話脈絡

- **日期**：2026-08-05
- **參與者**：項目負責人（owner）+ Fable 5（Cursor agent）
- **背景**：PR #84（Eurostat + GB 回填）已 merge。本 session 依交接稿續作 **CA StatCan → SG SingStat → AU ABS** 三國，branch `feature/calendar-ca-values`，共 3 個 code commit（`0de2051` CA / `29fef94` SG / `b3f1e58` AU）。
- **紅線**（ADR-0058 D1 / ADR-0061 D4，全程嚴守）：只官方一手、facts-only、永不加 forecast/consensus/impact、不納私人 PMI、值逐字入庫、全部對官方新聞稿驗證。

## 主要討論內容

### 1. CA — Statistics Canada Web Data Service（commit `0de2051`）

- **端點**：`www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods`（POST，免金鑰）。以 **vector ID** 釘頭條序列；`getSeriesInfoFromVector` / `getCubeMetadata` 用於探勘確認口徑。
- **config 新欄位**：`statcanVectorId?: number` + `statcanTransform?: 'pc1' | 'pch'`。
- **⚠️ 探勘發現（rule 00）**：WDS 對 CPI / 月度 GDP / 零售**只給指數/水準值**，無預算好的頭條 YoY/MoM（僅央行 core measures 有，但非頭條）→ **owner 拍板**：由 provider 以標準公式在地計算 pc1（YoY%）/ pch（MoM%），**四捨五入 half-away-from-zero 至一位小數**＝The Daily 頭條自身精度，逐字重現官方公報數字（FRED `units=pc1/chg` 已有同型先例）。失業率與貿易差額則 verbatim 入庫。
- **5 指標全數對 The Daily 逐字驗證**（含修訂值）；`CA_MERCHANDISE_TRADE` unit `''` → **`'M CAD'`** 修正。
- **測試**：hermetic unit tests（mock WDS）+ live smoke 全對。兩個過程 bug：`Number(null)` 會變 0（改為顯式 `typeof !== 'number'` skip）；浮點 0.05 邊界測資改用安全數字。

### 2. SG — SingStat Table Builder API（commit `29fef94`）

- **端點**：`tablebuilder.singstat.gov.sg/api/table/tabledata/<resourceId>`（免金鑰 JSON）。
- **config 新欄位**：`singstatResourceId?: string` + `singstatRowText?: string`（series 1 頭條列的精確 rowText 守衛，失配即整批誠實 null、絕不錯配）+ `singstatTransform?: 'pc1'`。
- **⚠️ 探勘發現（rule 00）**：
  - `sortBy=key desc&limit=1` 對時間序列**不會**回最新一筆 → 改用 `seriesNoORrowNo=1` + rowText 守衛 + 足量 limit。
  - **GDP 語意落差（owner 拍板）**：`M014811` 只在**完整 Economic Survey** 時更新，不含發布日的 advance estimate → 「Advance GDP Estimates」事件將**後補完整版估值**（current-vintage 慣例，與各國修訂值處理一致；例：1Q26 advance 4.6 → full 6.0，入庫 6.0）。
  - 失業率 API 回 `2`（非 `2.0`）、無小數 metadata → verbatim 入庫（權威原樣讀數）。
  - CPI / IIP 表為**官方預算 YoY**（verbatim）；GDP / 商品貿易 / 零售為水準表 → pc1（月頻 -12、季頻 -4）同 CA 捨入規則。`SG_MERCHANDISE_TRADE` unit → **`'%_YOY'`** 修正。
- **6 指標全數對 MAS/MTI、MOM、EnterpriseSG、DOS、EDB 官方 release 逐字驗證**。
- **live smoke 插曲**：smoke 當下 ARC 排程頁（`www.singstat.gov.sg`）被 CloudFront WAF 暫時 403（疑探勘期間請求過多觸發限流；**Table Builder host 不受影響**）→ 排程解析先前 session 已 live 驗證且本次未改，改以已知期別 drafts 直打 `backfillValues` 完成 live smoke，全數命中官方值。**若部署後 SG 排程持續 403 需回頭檢視**（目前判定為暫時性）。

### 3. AU — ABS Data API（SDMX）（commit `b3f1e58`）

- **端點**：`data.api.abs.gov.au/rest/data/<dataflowId>/<seriesKey>?format=jsondata`（免金鑰 SDMX-JSON）；`/rest/dataflow/ABS/<id>?references=all` 探勘 codelists。
- **config 新欄位**：`absDataflowId?: string` + `absSeriesKey?: string`（**全維度釘死**的頭條序列 key，無萬用字元）+ `absTransform?: 'round1'`。
- **⚠️ 探勘發現（rule 00）**：
  - **澳洲 CPI 已轉完整月度指標**：dataflow `CPI` 現為月頻（REGION `50` = "Australia"），headline = `3.10001.10.50.M`（YoY、All groups、Original）；`CPI_Q` 只剩**季調分析序列**（trimmed mean 等，TSEST=20），非 headline。日曆行 "Consumer Price Index, Australia" 參考期已是月（"July 2026"）。
  - **日曆季度標籤兩制並存**：WPI 行標 **"June 2026"**（季末月），Lending Indicators 行標 "June Quarter 2026" → drafts 的季度 periodLabel 可能是 `2026-06` 或 `2026 Q2` 兩形。provider 的 join 以資料序列自身頻率判定：月形標籤配季度序列時映射至所屬季（`2026-06` → `2026 Q2`），previous 再按季位移。
  - **Labour Force 序列未捨入**（`4.42834371`）而 release headline 為 "4.4%" → `round1`（half-away-from-zero 一位小數）重現官方精度。
  - SDMX-JSON 觀測維度**新→舊排序**（index 0 = 最新），解析時勿假設舊→新。
  - `AU_INTL_TRADE_GOODS` unit `''` → **`'M AUD'`** 修正（balance on goods 水準、SA）。
- **6 指標 headline key 與驗證**：CPI `CPI/3.10001.10.50.M`（2026-06=3.8 前 4.0）；GDP `ANA_AGG/M2.GPM.20.AUS.Q`（2026-Q1=0.3）；失業率 `LF/M13.3.1599.20.AUS.M`（round1 → 4.4）；WPI `WPI/3.THRPEB.7.TOT.20.AUS.Q`（2026-Q1=3.3）；商品貿易 `ITGS/M1.170.20.AUS.M`（2026-05=-3018、前 1383；官方 "decreased $4,401m" = -3018−1383 ✓）；家庭消費 `HSI_M/8.TOT.CUR.20.AUS.M`（2026-06=0.8）。**全數對 ABS latest-release 頁逐字驗證**。
- **live smoke**：5 筆未來事件 actual 全誠實 null、previous 全命中（含 WPI 季末月標籤 join、LF round1）。

### 4. 共通設計（三國一致）

- join 一律以 **draft 自身 periodLabel** 對 series map，保證值落在排程建立的同一列（`(indicatorCode, periodLabel)` upsert 永不重複）。
- 未發布期 actual 誠實 null；previous 期已發布即可先行帶入（同 FRED/Eurostat/GB 先例）。
- per-indicator / per-series 失敗隔離：單一序列壞掉只跳過自己，其餘照填；排程 drafts 不受影響。
- 捨入慣例：pc1 / pch / round1 一律 half-away-from-zero 一位小數＝各權威 headline 自身精度。

## 產生的 ADR

- 無新 ADR。值回填為 ADR-0058 D3（兩階段 population）既定機制的逐國延伸、ADR-0061 官方源紀律不變；pc1/pch/round1/GDP late-fill 均為 owner 當場拍板的實作口徑（記於 config 註解 + 本歸檔），不觸及 Accepted ADR 內容。

## 待後續處理事項

- [ ] owner 決定：push `feature/calendar-ca-values` + 開 PR（solo 階段 ADR-0054 admin squash-merge）。
- [ ] **JP / KR 值回填**：需免費金鑰（e-Stat appId / KOSIS 或 ECOS key）仿 FRED 條件掛載（未設 key 則 schedule-only），owner 決定是否申請。
- [ ] **CN / ID / HK / VN**：無乾淨官方機讀資料 API（NBS 無穩定公開 API、BPS 在 CF challenge 後、C&SD/GSO 無值端點）→ 誠實維持 null，除非日後探勘有新發現。
- [ ] SG ARC 排程頁 WAF 403 為暫時性判定；若部署後 SG 排程持續無新事件需回頭檢視（Table Builder 值回填不受影響）。
- [ ] 狀態徽章仍以 `actualValue !== null` 判斷（PR #83 session 記錄的獨立小修）；三國回填上線後多數列會有值，問題自然大幅緩解。

## 給未來 AI agent 的建議

- 先讀 [Eurostat + GB 歸檔](./2026-08-05-calendar-values-backfill-eurostat-gb.md) 的四步驟模式；本檔補三國的 API 細節與坑。
- StatCan WDS 用 vector 釘序列、注意 `scalarFactorCode`；SingStat 一定要配 `singstatRowText` 守衛；ABS 一定要全維度釘死 key、注意觀測新→舊排序與季末月標籤。
- 任何「API 沒給頭條數字」的情況：先確認官方 release 頭條的準確口徑（SA/Original、YoY/MoM/QoQ、捨入位數），再決定 verbatim 或標準轉換，並逐字對官方公報驗證後才寫進 config。
- 探勘時對同一官方 host 控制請求頻率，避免觸發 WAF 限流（本 session SingStat ARC 頁 403 的教訓）。
