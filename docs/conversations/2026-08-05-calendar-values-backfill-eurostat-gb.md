# 財經日曆 Q3-B 數值回填起手（Eurostat + UK ONS）— 2026-08-05

> 本文件歸檔 OpenTrade「非美地區官方機讀資料 API 回填 previous/actual」第一棒（EU/EA + GB）
> 的探勘發現與實作模式。後續國家（CA/SG/AU…）沿用同一模式，本文是必讀交接稿。

## 對話脈絡

- **日期**：2026-08-05
- **參與者**：項目負責人（owner）+ AI agent（Fable 5）
- **背景**：owner 指出「現時很多已經過期的日曆都沒有值，觀感很差，要徹底解決」。
  根因＝13 地區中只有美國（FRED）帶 previous/actual，其餘 12 區接的是官方「發布日曆」
  （只有日期無數字）。主線任務見
  [`2026-08-05-calendar-filter-ux-and-figures.md`](2026-08-05-calendar-filter-ux-and-figures.md)。
- **紅線（ADR-0058 D1 / ADR-0061）**：只官方一手、facts-only、永不加
  forecast/consensus/impact、不納私人 PMI。

## 已確立的實作模式（後續國家照抄）

每國一個小 commit（rule 96），四步驟：

1. **探勘**：找該國統計局的官方機讀「資料」端點（非發布日曆），確認頭條序列的
   dataset/序列 ID、單位口徑（YoY%／MoM%／水平值——必須與指標 `unit` 標籤一致，
   謹記美國 `CPIAUCSL` 333 教訓）、期間標籤格式。
2. **驗證**：API 取回的每個數字**必須**與該局官方新聞稿/bulletin 逐字核對（rule 00），
   含修訂值。
3. **實作**：config 加查詢欄位 → provider 加 `backfillValues`（schedule drafts 建好後，
   按 indicator 抓單一頭條序列，**以 draft 自己的 periodLabel join**——保證值落在
   schedule 建的同一列、永不產生 `(indicatorCode, periodLabel)` 重複）→ actual =
   本期觀測、previous = 前一期觀測；未發布期誠實 null（fetcher 兩階段 upsert 之後輪詢
   自動補）；per-indicator 失敗隔離。
4. **測試**：hermetic unit tests（fixture 仿真實 API 形狀）+ live smoke（真端點 + 真
   config，數字再對一次新聞稿）+ typecheck/lint 全綠 → commit。

fetcher 骨架（ADR-0058 D3 兩階段 upsert）**完全不用改**——它本來就只在 draft 帶值時
覆寫、schedule-only 輪詢不會把已回填的值洗掉。

## 本 session 交付

### Commit 1（`28385df`）— Eurostat（EU/EA，5 指標）

- **端點**：`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<dataset>`
  （免金鑰，JSON-stat 格式；`?format=JSON&lang=EN&lastTimePeriod=8&<filters>`）。
- **config 欄位**：`eurostatDataset` + `eurostatFilters`（filters 必須把非時間維度全部
  釘成單一類別；provider 驗證「只剩一條序列」，多於一條直接整批拒收而非亂猜）。
- **⚠️ 探勘發現**：
  - **HICP 2026 改基期（2025=100）**：發布日曆 hint 仍寫 `prc_hicp_manr`，但該 dataset
    凍結在 2025-12；現行是 **`prc_hicp_minr`**（ECOICOP ver.2，維度叫 `coicop18` 非
    `coicop`）。**不可盲抄日曆的 `datasetCodes`，必須 live 驗證**。
  - **歐元區 geo 代碼跨 dataset 不一致**：HICP/GDP 有移動聚合 `EA`（2026 起=EA21），
    `une_rt_m` 只有定組成 `EA21` —— geo 是 per-dataset 驗出來的，不能假設。
  - 快報（flash）數字在發布當下就進 dataset（HICP flash 於 7/31 11:00 發布即更新）。
  - EU 聚合的 HICP 只隨完整版（月中）發布，快報期 EU 值仍 null 屬誠實正常。
- **五指標參數**：EA_HICP_FLASH_YOY＝`prc_hicp_minr` {RCH_A, coicop18=TOTAL, geo=EA}；
  EU_HICP_YOY＝同 dataset geo=EU27_2020；EA_GDP_FLASH_QOQ＝`namq_10_gdp`
  {CLV_PCH_PRE, SCA, B1GQ, EA}；EA_UNEMPLOYMENT_RATE＝`une_rt_m`
  {SA, TOTAL, T, PC_ACT, EA21}；EU_RETAIL_TRADE＝`sts_trtu_m`
  {VOL_SLS, G47, SCA, PCH_PRE, EU27_2020}。
- **驗證數字**（全部與官方 euro-indicators 新聞稿逐字吻合）：EA flash HICP 2026-07＝2.9
  （前 2.8）；EU HICP 2026-06＝2.9（前 3.3）；EA GDP 2026-Q2＝+0.4（前 0.0）；EA 失業率
  2026-06＝6.3；EU 零售 2026-05＝+0.5（前 -0.6，含 4 月修訂）。
- **期間正規化**：JSON-stat 月度 `2026-07` 原生對齊；季度 `2026-Q2` → `2026 Q2`。

### Commit 2（`dccdb44`）— UK ONS（GB，4 指標）

- **端點**：`https://www.ons.gov.uk/<主題路徑>/timeseries/<cdid>/<dataset>/data`
  （免金鑰、開放 CORS；`months[]` 每筆 `{date:"2026 JUN", value:"2.6"}`，值是
  **verbatim 字串**——保留尾零精度，直接原樣入庫）。
- **⚠️ 探勘發現**：
  - **舊 `api.ons.gov.uk` v0 timeseries API 已於 2024-11-25 退役**（回退役公告）；
    現行官方端點是上述網站 JSON，**主題路徑段必須帶**。
  - 找 CDID 的可靠方法：`api.beta.ons.gov.uk/v1/search?q=…&content_type=timeseries`
    （與 releases API 同 host，仍在服務）。
  - **勞動市場 bulletin 以「發布月」命名**（slug `uklabourmarketjuly2026`），而失業率
    序列 MGSX 以**滾動三個月的中間月**標示觀測（`date:"2026 APR"`、
    `label:"2026 MAR-MAY"`）→ 需 **-3 個月位移**。CPI/GDP/零售 slug 都是資料月，位移 0。
- **config 欄位**：`onsTimeseriesPath` + `onsPeriodShiftMonths`。
- **四指標頭條 CDID**：GB_CPI_YOY＝`d7g7/mm23`（CPI 年增率）；GB_GDP_MONTHLY＝
  `ecyx/mgdp`（月度 GVA 環比＝頭條 monthly GDP growth）；GB_LABOUR_MARKET＝
  `mgsx/lms`（失業率，shift -3）；GB_RETAIL_SALES＝`j5ec/drsi`（零售量含燃料 SA 月變）。
- **驗證數字**（全部與官方 bulletin 逐字吻合，含修訂）：CPI 2026-06＝2.6（前 2.8）；
  月度 GDP 2026-05＝+0.1（前 -0.1）；失業率 Mar–May＝4.9（前值取現行 vintage 4.9，
  Feb–Apr 已由 5.0 修訂）；零售 2026-06＝+1.0（前 1.2；4 月修訂為 -0.7 亦吻合）。

## 給後續國家的候選路徑（沿主線 roadmap）

- **CA StatCan**：Web Data Service（免金鑰 REST，`getDataFromVectorsAndLatestNPeriods`
  等端點，vector ID 對頭條序列）。截圖中的加拿大 CPI 在此梯隊。
- **SG SingStat**：Table Builder API（免金鑰 REST）。
- **AU ABS**：SDMX Data API（免金鑰）。
- **NZ Stats NZ**：無乾淨免金鑰資料 API（Odata 要金鑰）——待探勘再定。
- **JP e-Stat / KR KOSIS**：需免費金鑰（仿 FRED 條件掛載）。
- **CN/ID/HK/VN**：無乾淨官方機讀資料 API，誠實維持 null（第三梯隊，除非日後探勘
  推翻——AU/JP/NZ/VN/SG 的先例證明「交接稿說不行」值得重驗）。

## 待後續處理事項

- CA → SG → AU 逐國回填（每國走上述四步驟）。
- 全部第一二梯隊回填完後，重看前端狀態徽章：目前徽章按 `actualValue !== null` 判斷
  「未公布」，過期但無值的第三梯隊事件仍顯示「未公布」——屆時可改為日期判斷的獨立小修
  （前 session 已記錄，owner 指示先做資料回填非觀感重構）。
- 未來事件的「前值」預帶已自然發生（join 前一期觀測），無需另做。

## 給未來 AI agent 的建議

- 先讀本文件的「已確立的實作模式」四步驟，照抄 Eurostat/ONS 兩個 provider 的
  `backfillValues` 寫法（join draft 自己的 periodLabel、per-indicator 隔離、
  單一序列驗證、verbatim 字串值）。
- **每個數字都要對官方新聞稿**，含前值與修訂值；口徑（YoY/MoM/水平）與 `unit` 標籤
  必須一致。
- 發布日曆給的 dataset hint 可能過期（HICP 改基期教訓）；舊 API 可能已退役（ONS 教訓）
  ——一律 live 驗證。
- 值一律存 authority 原樣（字串直存；JSON 數字則 `String()`，注意會失去尾零，ONS 型
  字串源優先原樣）。
