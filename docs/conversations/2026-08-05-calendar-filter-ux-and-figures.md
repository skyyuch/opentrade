# 財經日曆 篩選 UX + 美國數值修正 + Q3「非美地區數值回填」交棒 — 2026-08-05

> 本文件歸檔 OpenTrade 財經日曆本 session（2026-08-05）的交付與**下個 agent 主線任務（Q3-B 資料回填）的 roadmap**。
> 承接 [`2026-08-03-calendar-coverage-gap.md`](2026-08-03-calendar-coverage-gap.md)（覆蓋量批次追蹤主文件）。

## 對話脈絡

- **日期**：2026-08-05
- **參與者**：項目負責人（owner）＋ AI agent（Cursor / Opus 4.8）
- **背景**：owner 於本地測試財經日曆頁時提出一連串問題，先做完 UX/資料修正，再把「非美地區無數值」的**徹底解決**交棒下個 agent。

## 主要討論內容

### 1. 篩選 UX 大改（已交付，commit `2cd66a0`）

owner：「篩選不要所有地區都放出來，放一些熱門，另有『更多選擇』點開可選其他地區；國家名字要有國旗，格式＝『國旗icon 名字』；而且要能**多選**。」另外「為什麼過去的事件不顯示」→ 加**上一期/下一期翻頁**與「回到今天」。

- 熱門地區（US/HK/CN/EU/JP）inline chips ＋「更多選擇」下拉 picker（長尾地區）。
- 地區改**多選 OR 集合**；「全部地區」清空；選中的長尾地區以 active chip 顯示。
- 期間翻頁：`calendarWindowAt(timeframe, offset, now)`（HK 牆鐘錨定）＋期間標籤＋offset≠0 顯示「回到今天」。
- 國旗 `aria-hidden`（無障礙名維持純地區名）。

### 2. 美國數值 bug（已徹底修，commit `07f9421`，rule 00 資料正確性）

owner 截圖：US CPI 顯示 `333.979 / 332.568 %_YOY`。

- **根因**：`US_CPI_YOY` 接 FRED `CPIAUCSL`（CPI **指數水平** ~333）卻標 `%_YOY`；非農接 `PAYEMS`（**總就業水平** ~159,000k）卻應為月變動。
- **修法**：`packages/config` 加選填 `fredUnits?: 'pc1' | 'chg'`，`fred-provider.ts` 對 **observations** 帶 `&units=`（不影響 release schedule）。CPI → `CPIAUCNS` + `pc1`（非季調指數 12 個月 %＝BLS 頭條年增率）；非農 → `PAYEMS` + `chg`（月變動千人）。FRED 自算標準轉換仍屬官方一手（ADR-0058 D1）。
- **無需 migration**：fetcher 以 `(indicatorCode, periodLabel)` upsert，下次輪詢覆蓋舊錯值。

### 3. 多地區 API 篩選（已交付，commit `769784c`）

`GET /v1/calendar` 支援重複 `?region=US&region=HK`（OR 集合）；`regions?: readonly EconomicRegionValue[]`；repo `region: { in }`；空集合＝全部；單一 `region=` 向後相容。

### Q1 附帶澄清：EU vs EA（歐盟 vs 歐元區）

- **EU**＝歐盟 27 國（含丹麥/瑞典/波蘭等非歐元國）。
- **EA（Euro Area）**＝採用歐元的 20 國，是 EU 的子集。
- 日曆分列兩者，因 **Eurostat 官方本就發布兩套不同數列**（HICP EA flash / EU full 等），且 **EA 才是 ECB 貨幣政策作用範圍**（對市場更關鍵）。config 已如實對應。

## 產生的變更（PR #83，branch `feat/calendar-filter-ux`）

- `07f9421` fix(api): correct US CPI & nonfarm payrolls FRED figures
- `769784c` feat(api): support multi-region calendar filter (regions[])
- `2cd66a0` feat(web): calendar region multi-select, more-picker & period paging
- （＋本次 docs handoff commit）
- **無新 ADR**（皆屬既有 ADR-0058/0061 範圍內的 bugfix / 向後相容契約擴充 / 前端 UX）。

---

## ⚠️ 下個 agent 主線任務：Q3-B「非美地區官方機讀資料 API 回填 previous/actual」

### 問題本質（非觀感、是資料）

owner 明確：**「我不是要觀感重構，而是想徹底解決。」**
現況 13 地區中**只有美國（FRED）帶 previous/actual 數值**；其餘 12 區接的是官方「**預告發布日曆**」（Advance Release Calendar / release-calendar），這類源**只給發布日期與涵蓋期、不給數字** → 頁面 previous/actual 恆 null → 觀感像「沒資料」。
**徹底解法＝逐國再接一條官方機讀『資料 API』，把已發布期的實際值/前值回填**，嚴守：只官方一手、facts-only、**永不加 forecast/consensus/impact**、不納私人 PMI（ADR-0058 D1 / ADR-0061）。

### 架構已就緒（好消息）

- fetcher 用**兩階段 upsert by `(indicatorCode, periodLabel)`**：schedule provider 先以 null 種下列，資料 provider 之後只在**帶值時**覆寫 previous/actual（不會清掉已回填值）。→ Q3-B **不需改 fetcher 骨架**，只要讓（既有或新增的）provider 對已發布期回傳帶值 draft，`periodLabel` 對齊即可。
- **關鍵對齊眉角**（rule 00）：資料 API 的「期間」必須正規化成與 schedule provider **完全相同的 `periodLabel`**（月 `YYYY-MM`、季 `YYYY Qn`），否則會產生重複列而非回填。
- **口徑/單位對齊**（同美國 `fredUnits` 教訓）：資料 API 常回原始水平（index / 總量），需選對轉換（年增率 % / 月變動）使數字符合該指標的 headline 定義與 `unit` 標籤，否則又是 333 那種 bug。**每接一國、每個指標都要對官方頭條新聞稿實際數字做交叉驗證**再上。

### 各國官方「資料 API」候選（rule 00：**先探勘驗證再寫 code**，勿預設可用）

> 依「乾淨、免金鑰、易對齊」優先排序；標註為候選、須實測確認能取到對應數列與期間。

**第一梯隊（免金鑰、機讀，最該先做）**

- **EU / EA — Eurostat dissemination API**：`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<dataset>?format=JSON&...`（JSON-stat，含觀測值）。dataset 代碼在 batch-1 研究已知（HICP flash/full、GDP flash、失業率、零售）。既有 `eurostat-provider.ts` 已抓 schedule，擴同 provider 補資料呼叫最順。**建議第一國**。
- **SG — SingStat Table Builder API**：`https://tablebuilder.singstat.gov.sg/api/table/tabledata/<resourceId>`（免金鑰 JSON，含實際數值）。既有 SingStat provider 走 ARC schedule，可加 resourceId 對 6 指標補值。
- **GB — ONS timeseries API**：ONS 除 releases API（schedule）外有 timeseries 觀測端點（免金鑰）。既有 `gb-ons-provider.ts` 已有 slug/前綴，接 timeseries id 補值。
- **CA — StatCan WDS**：`getDataFromVectorsAndLatestNPeriods`（免金鑰 JSON，vector→觀測）。既有 `ca-statcan-provider.ts` 已有官方 title，補 vector id。
- **AU — ABS Data API (SDMX)**：`https://data.api.abs.gov.au/rest/data/<dataflow>/...?format=jsondata`（免金鑰）。既有 `au-abs-provider.ts` 有 event-name，補 dataflow/key。

**第二梯隊（需免費金鑰，仿 FRED 條件掛載 → Secrets Manager，未設則該資料 provider inert）**

- **JP — e-Stat `getStatsData`**（需免費 appId）：schedule 已走 release-calendar HTML；資料走 appId API 補值（appId 進 Secrets Manager，`main.ts` 有 key 才 wire，仿 `FRED_API_KEY`）。
- **KR — KOSIS OpenAPI**（需金鑰）：MODS/KOSTAT 資料。

**第三梯隊（WAF/無乾淨 API，最難，可能維持 schedule-only）**

- **CN NBS**（`data.stats.gov.cn/easyquery.htm` 常有防爬）、**ID BPS**（全站 Cloudflare challenge）、**HK C&SD**（無官方即時 API，可能走 data.gov.hk 逐 dataset）、**VN GSO/NSO**（ARC 內嵌 JSON 僅 schedule）。這些可**誠實維持 null**（值不可機讀屬設計上誠實），優先做前兩梯隊即可大幅改善觀感。

### 建議執行方式（rule 96）

- **一國一小 commit**（先 Eurostat，最高槓桿：一次點亮 EU+EA 多指標）。
- 每國：探勘 → 寫/擴 provider 取資料 → 期間正規化對齊既有 `periodLabel` → 口徑/單位對官方新聞稿交叉驗證 → unit test + live smoke → commit。
- **不改 fetcher 骨架、不改 UI**（兩階段 upsert 已支援；UI 已能顯示 previous/actual）。
- 紅線：只回填 previous/actual 官方事實，**永不引入 forecast/consensus/impact**；私人 PMI 永不納入。

### 附帶備查（本 session 未做，交下個 agent 或 owner 定）

- **狀態徽章 bug**：「已過發布時間卻顯示未公布」係徽章用 `actualValue !== null` 判斷而非日期。若 Q3-B 回填完成，多數列有值、徽章自然大幅緩解；若要獨立修，改為「以 `scheduledAt` 是否已過 + 是否有值」雙態判斷（小前端修，非本次範圍）。

## 給未來 AI agent 的建議

1. **先讀** `AGENTS.md` / `docs/00-vision.md` / `docs/03-status.md`（最上方＝本 session）/ 本檔 / ADR-0058 / ADR-0061。
2. **從 Eurostat 開始**（免金鑰、一次點亮 EU+EA、既有 provider 可擴），驗證通了再複製到 SG/GB/CA/AU。
3. **每個數字都要對官方頭條新聞稿交叉驗證**（記取美國 `CPIAUCSL` 333 的教訓：選錯 series/units 會顯示錯資料，違反 rule 00 比缺資料更糟）。
4. `periodLabel` 必須與既有 schedule provider **逐字對齊**，否則是新增重複列而非回填。
5. PR #83（本 session）若尚未 merge，Q3-B 從 `main` 開新 branch 即可（檔案幾乎不重疊）。
