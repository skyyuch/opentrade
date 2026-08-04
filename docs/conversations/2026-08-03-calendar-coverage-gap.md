# 財經日曆數據覆蓋落差（vs Investing.com）— 2026-08-03

> 本文件歸檔 OpenTrade 財經日曆「數據覆蓋量」落差的分析與交棒指引。
> **下一個 session 的主線任務**：把財經日曆的**事件覆蓋量**擴到接近 Investing.com 的密度，
> 但**嚴守 ADR-0058 D1 / ADR-0061 紅線**（只官方一手、facts-only、不抄 forecast/consensus/impact、不納私人 PMI）。

## 對話脈絡

- 日期：2026-08-03
- 參與者：項目負責人（owner）+ AI（Opus 4.8）
- 背景：本 session 已把「日曆多地區 batch 1」與「新聞縮圖 ADR-0060」分別 cohesive commit（`eb8a9fa` / `8b127e3` / `0202484`）。
  owner 隨即比對本平台與 Investing.com，指出**我們缺太多數據**，要求下一個 agent 專門處理覆蓋量。

## 觀察到的落差（owner 提供兩張截圖）

### A) Investing.com（單日亞洲時段，指標非常密集）

一個交易日的亞洲早盤就有 ~20+ 條，跨 NZ / AU / ID / JP / KR / MY / PH / TH / TW / VN / CN 等：

| 時間(當地) | 地區                   | 指標（截圖標題）                                    | 備註                                        |
| ---------- | ---------------------- | --------------------------------------------------- | ------------------------------------------- |
| 06:45      | NZ                     | 建築許可 (月環比)                                   | 官方（Stats NZ）                            |
| 07:00      | AU                     | 製造業採購經理指數 (PMI)                            | **私人**（S&P Global / Judo）→ ❌ 不納      |
| 08:30      | ID                     | 匯豐製造業PMI                                       | **私人**（S&P Global）→ ❌                  |
| 08:30      | JP                     | 製造業PMI (au Jibun)                                | **私人** → ❌                               |
| 08:30      | KR                     | 匯豐製造業PMI                                       | **私人** → ❌                               |
| 08:30      | MY / PH / TH / TW / VN | 製造業PMI（日經/S&P Global 系列）                   | **私人** → ❌                               |
| 09:00      | AU                     | TD-MI 通脹指標                                      | 半官方/私人（Melbourne Institute）→ ⚠️ 審視 |
| 09:45      | CN                     | 匯豐/財新製造業PMI                                  | **私人**（Caixin/S&P Global）→ ❌           |
| 10:00      | AU                     | ANZ 總招聘廣告                                      | **私人**（ANZ）→ ❌                         |
| 10:00      | VN                     | 貿易收支 / FDI / 工業生產 / CPI(同比·月環比) / 零售 | 官方（GSO 越南統計總局）→ ✅ 可納           |
| 12:00      | ID                     | 核心通脹 / 出口增長 / 通脹指數                      | 官方（BPS 印尼統計局）→ ✅ 可納             |

> ⚠️ Investing.com 每列還帶「**預測(forecast)**」中間欄 + 「**重要性星星(impact)**」——
> 這兩者正是 **ADR-0058 D1 明文禁止**的東西。**我們永遠不抄這兩欄。**

### B) 本平台（同一「本週」/全部地區/全部類別）

只顯示 **3 筆**：

- 2026-08-06(四) 19:00 · EU 歐盟零售貿易（Eurostat，未公布，涵蓋期 2026-08）
- 2026-08-07(五) 08:00 · US 美國非農就業人數變動（BLS，涵蓋期 2026-07）
- 2026-08-07(五) 08:00 · US 美國失業率（BLS，涵蓋期 2026-07）

（batch 1 已接 US FRED + EU/EA Eurostat + HK C&SD，但「本週」窗口本來就稀疏；切「本月」會多，
但**跨國覆蓋量**確實遠不如 Investing.com。）

## 核心研判：落差是真的，但**不能照抄**

1. **Investing.com 亞洲清單有一大半是私人 PMI**（S&P Global / au Jibun / Caixin / 日經 / ANZ / Judo）。
   ADR-0058 D1 + ADR-0061 **明文排除私人 PMI**（provenance + ToS + 其核心價值即紅線）。→ **這些一律不做。**
2. **forecast / consensus / impact 星星**：ADR-0058 D1 紅線，永不加。我們的價值主張正是「只講已發生的事實」。
3. **我們能合規擴的是「各國國家統計局的官方一手發布」**：CPI、GDP、失業率、對外貿易、零售、工業生產、
   央行利率決議、國際收支等——這些**每個國家的官方統計機構**都有，且多數**免金鑰、有官方發布時間表/RSS/JSON/ICS**。
4. 因此下一個 agent 的工作是**「官方源廣度」而非「照抄 Investing.com 條目」**：
   每加一個國家/地區，就找它的**國家統計局**，把它的官方指標＋官方發布排程接進來（沿用 batch 1 的 provider port）。

## 具體 Batch 2+ 目標（ADR-0061 已預留 enum：GB/CA/AU/JP，其餘再擴 enum）

沿用既有 `ICalendarProvider` port + `packages/config/src/calendar.ts` 的 `provider` registry。每個 provider 一個小 commit：

| 地區 | 官方機構            | 候選官方源                                     | 金鑰       | 備註                                        |
| ---- | ------------------- | ---------------------------------------------- | ---------- | ------------------------------------------- |
| GB   | ONS                 | ONS release calendar（有官方 API / JSON）      | 免         | enum 已備                                   |
| CA   | Statistics Canada   | StatCan release schedule / WDS API             | 免         | enum 已備                                   |
| AU   | ABS                 | ABS future release calendar                    | 免         | enum 已備；只收 ABS 官方，不收 AiG/Judo PMI |
| JP   | e-Stat / 各省廳     | e-Stat（需免費 appId）/ 總務省 CPI、內閣府 GDP | 部分需 key | enum 已備                                   |
| VN   | GSO（越南統計總局） | 官方發布日程（可能需 config 編碼，仿 HK）      | 免         | 需新 enum value `VN`                        |
| ID   | BPS（印尼統計局）   | BPS 官方發布                                   | 免         | 需新 enum value `ID`                        |
| NZ   | Stats NZ            | release calendar API                           | 免         | 需新 enum value `NZ`                        |
| KR   | KOSTAT / BOK        | 官方                                           | 免         | 需新 enum value `KR`（PMI 不做）            |
| CN   | 國家統計局(NBS)     | 官方發布日程（財新/匯豐 PMI 不做，只 NBS）     | 免         | enum 已有 `CN`，batch 1 未接 provider       |

> 每新增 enum value = 一支 additive migration（`ALTER TYPE ... ADD VALUE IF NOT EXISTS`），仿
> `20260803080000_expand_economic_region_enum`；前端 `client.ts` `ECONOMIC_REGIONS` + 三語 `regionXX` 鍵 + parity test 同步。

## 實作要點（沿用 batch 1 的 pattern，不要重造）

- **provider 落點**：`apps/api/src/tasks/calendar-fetcher/<region>-provider.ts` + `.test.ts`（fixture 驅動），
  `index.ts` 匯出、`main.ts` 接線（免金鑰者常駐、需 key 者條件掛載）。
- **config 白名單**：`packages/config/src/calendar.ts` 每指標帶 `provider` + region + category；
  有官方標題可 match 的用 `eurostatTitle` 式 match key；無 API 只有 PDF/HTML 排程的仿 HK 用 `releases[]` 編碼（記得寫年度更新待辦）。
- **facts-only**：`previousValue`/`actualValue` 沒有就 `null`（誠實），兩階段 upsert 回填 actual；
  **永不寫 forecast/impact 欄位**（schema 本來就沒有這些欄——別加）。
- **排序**：嚴格 `scheduledAt` 時序；前端 `CalendarList.tsx` 已是日期分組版面，新地區只要有國旗 map 條目即可
  （`CALENDAR_REGION_FLAG` in config + `REGION_FLAG` in `CalendarList.tsx`，新 region 兩處都要加）。
- **驗證**：每個 provider live 端點實測一次（免金鑰源可直接 curl / node fetch）、typecheck 7 包全綠、
  新 provider 單測綠、`prisma migrate status` up-to-date。

## 待後續處理事項（沿用）

- **HK GDP advance** 2026 發布月份定位待回查 C&SD PDF（見 batch 1 註解）。
- HK C&SD `releases[]` 為 2026 年表，每年 9 月官方出次年表 → 需年度更新 config。
- `FRED_API_KEY` 已由 owner 填本地 `.env`；正式環境需在 Secrets Manager 設。

## Batch 2 進度與來源可得性發現（2026-08-03 續作 session）

已交付（各一個 cohesive commit，branch `docs/status-pr58-closeout`）：

- **GB ONS**（`139a934`）：`gb-ons-provider.ts` 打官方 releases API
  `api.beta.ons.gov.uk/v1/search/releases`（免金鑰），抓 `type-upcoming`+`type-published`
  兩頁，用穩定 slug 前綴 `onsUriPrefix` 精確比對（排除 `…timeseries` 重複），schedule-only 值留 null。
  4 指標：CPI / GDP monthly / labour market / retail sales。live 實測 14 筆、10 unit tests。
- **CA StatCan**（`6525db3`）：`ca-statcan-provider.ts` 打官方 key-indicators 日程 JSON
  `schedule-key_indicators-eng.json`（免金鑰、含未來日期），用穩定官方 `title` 精確比對；
  The Daily 固定 08:30 東部時間，以 **DST-aware** offset 換算 UTC（不引入 date lib，D7）。
  5 指標：CPI / GDP by industry / Labour Force Survey / retail trade / merchandise trade。live 實測 30 筆、9 unit tests。

> ⚠️ **關鍵來源可得性發現（省下個 session 重做）**：owner 原列的 4 個「免金鑰快速」源中，
> **只有 GB ONS 與 CA StatCan 真的有乾淨、免金鑰、機器可讀的前瞻發布日程**（JSON）。
> **AU ABS 與 NZ Stats NZ 都只提供 HTML 發布日曆**，實測其常見端點皆無乾淨 feed：
>
> - **ABS**：`/rss/*`、`/*.ics`、Drupal `?_format=json`、`/jsonapi/*` 全 404 或回 HTML；
>   只有 Funnelback 搜尋後端 `search.abs.gov.au/s/search.json`（回 400＝端點存在但需逆向 collection/meta 參數）。
> - **Stats NZ**：`/rss/*` 404、`release-calendar.json` 403、`release-calendar.ics` 回 HTML（無 VEVENT）、
>   OData `api.stats.govt.nz` 需金鑰。
>   → AU/NZ 需 **HTML 爬取**（Drupal View / 發布日曆頁）或**逆向 Funnelback JSON**，屬較大、較脆弱、
>   風險較高（rule 00 資料正確性）的**獨立聚焦單元**，本 session 刻意**延後**，未硬塞脆弱爬蟲。

## Batch 3 進度（2026-08-04 續作 session）

已交付（cohesive commit `a4d523f`，branch `feature/calendar-cn-nbs`；**後於 PR #69 admin squash-merge 進 `main`，commit `2c5ed76`**）：

- **CN NBS**（Mainland China 國家統計局）：`cn-nbs-provider.ts` 仿 `hk-csd-provider.ts` 純讀
  config `releases[]`（零網路 I/O），config 加 `CalendarProvider 'NBS'` + 4 指標
  （**CN_GDP_YOY** 季頻 4／**CN_CPI_YOY** 月頻 12／**CN_PPI_YOY** 月頻 12／
  **CN_MANUFACTURING_PMI** NBS 官方製造業 PMI 月頻 12）。逐筆 UTC 日期**轉錄自官方英文
  「Regular Press Release Calendar of NBS in 2026」**（stats.gov.cn/english/PressRelease/
  ReleaseCalendar/，2025-12-26 發布）：CPI/PPI/PMI 09:30 北京=01:30 UTC、GDP 10:00 北京=02:00 UTC
  （北京 UTC+8 無 DST）；PMI 呈當月且 2 月 PMI 因春節於 3/4 發布（NBS note 5，已編碼）。
  enum `CN`/旗/三語 `regionCN` batch 1 已備 → 無 cross-layer commit。**只收 NBS 官方一手，
  絕不收財新/匯豐（Caixin/S&P Global）私人 PMI**（NBS 自家官方 PMI 屬一手事實可納）。
  typecheck 7/7、api unit **231**（+6）、真實 config smoke **40 draft**（日期/期間/null 值正確）。

> ⚠️ **維護待辦**：NBS `releases[]` 為 2026 年表（官方註明「preliminary and subject to
> adjustment」，每年 12 月出次年表）→ 需**年度更新** config（同 HK C&SD 慣例）。

### AU ABS 交付（2026-08-04 續作 session，commit `8d81691`，branch `feature/calendar-au-abs`）

- **AU ABS**（Australian Bureau of Statistics）：`au-abs-provider.ts` 屬 **live-fetch 型**（仿 `gb-ons` / `ca-statcan`）。
  **來源探勘結論（rule 00 先確認，省下個 session 重做）**：
  - 逆向 Funnelback `search.abs.gov.au/s/search.json` → 只有 `collection=abs-search` 回 200，但它回的是**已發布**的
    latest-release 頁（`date`＝發布日、title 帶期間），**非前瞻發布日程** → 不適合當日曆來源。
  - `/release-calendar/future-releases` 的 `?_format=json` 仍回 HTML（Drupal 忽略該參數），`?page=N` 無伺服端分頁。
  - **但該頁 HTML 其實很結構化、可靠**：每筆 future-release 是語意化 Drupal row，帶
    **機讀 `<time datetime="2026-08-26T01:30:00Z" class="datetime">`（已是 UTC，帶 Z → 免自算 AEST/AEDT DST！）**
    - `<h3 class="field-content event-name">`（**去期間**的產品名，適合當 match key）+ `<span class="reference-period-value">`（涵蓋期）。
      每頁約 24 筆近期滾動窗口（同 ONS/StatCan 窗口哲學，6h 刷新）。
  - **結論**：AU 走**解析 future-releases HTML 的 `<time datetime>` + `event-name` + `reference-period`**（比逆向 Funnelback 乾淨可靠），
    match 語意 field class（非版面）→ rule 00 風險比預期低很多。
- **交付**：config 加 `CalendarProvider 'ABS'` + `absEventName` match key 欄位 + **6 個 ABS 一手指標**
  （**AU_CPI** INFLATION／**AU_GDP** GROWTH（國民所得帳）／**AU_LABOUR_FORCE** EMPLOYMENT／**AU_WAGE_PRICE_INDEX** EMPLOYMENT／
  **AU_INTL_TRADE_GOODS** TRADE／**AU_HOUSEHOLD_SPENDING** OTHER，全部本次實測**精確驗證** event-name；GDP 名經官方頁確認）。
  enum `AU`/旗/i18n batch 1 已備 → **無 cross-layer commit**。`index.ts` 匯出 + `main.ts` 免金鑰常駐接線。
  provider：injectable `fetchFn`/`now`、per-row try/catch 隔離、window 過濾（LOOKBACK 60d／LOOKAHEAD 120d）、值恆 null、
  period 正規化（"July 2026"→"2026-07"、"June Quarter 2026"→"2026 Q2"，季度以**結束月**對應 Q）。
- **紅線嚴守**：只收 ABS 官方一手；**絕不**收私人製造業 PMI（S&P Global／Judo Bank／AiG）；facts-only、值恆 null（誠實）。
- **驗證全綠**：typecheck 7/7、新檔 + main.ts + config + index lint 0 error、api unit **241**（CN NBS 的 231 + AU ABS 10）、
  **live 端點實測**產出 **5 draft**（當前窗口：INTL_TRADE 2026-08-06／WPI 2026-08-19／LABOUR_FORCE 2026-08-20／CPI 2026-08-26／
  HOUSEHOLD_SPENDING 2026-08-27，日期/期間/null 值全正確；AU_GDP 因下次發布落在窗口外故本次不現，屬正常）。
- **⚠️ 維護待辦**：ABS future-releases 頁只給滾動近期窗口（無年表 config 需更新問題，優於 HK/CN 的年度轉錄），
  但 **`absEventName` 若 ABS 改產品名會失配**（失配＝該指標不產事件，屬「缺覆蓋」非「錯資料」，自癒；仍建議偶爾巡檢頁面 field class 是否變動）。

### JP e-Stat 交付（2026-08-04 續作 session，PR #72 squash-merge 進 main，commit `69a7de4`）

- **JP e-Stat**（政府統計の総合窓口 / Japan Statistics portal）：`jp-estat-provider.ts` 屬 **live-fetch 型**（仿 `au-abs`），但**免金鑰**。
  **⚠️ 重要來源探勘修正（rule 00，推翻本文件先前「JP 需免費 appId」的假設）**：
  - **e-Stat 的 appId REST API（`getStatsList` 等）不提供前瞻發布日曆** —— 它只列**已公開**統計表（`OPEN_DATE`＝過去公開日 + `UPDATED_DATE`），官方文件明講「公表予定（release calendar）是網站另一個功能，非此 API」。
  - **前瞻公表予定**在 `https://www.e-stat.go.jp/release-calendar`，是**免金鑰的 Drupal 伺服端渲染 HTML**（實測 200 text/html，含真實日期 + 府省 + 統計名，非 JS 動態載入），結構非常乾淨可靠。
  - 每列 `<li class="stat-list-row">` 的 `stat-announce-comment` span 帶 **`data-toukei_cd`（政府統計コード，穩定機讀 ID）** + **`data-kensakuKouhyou_date="YYYYMMDDHHMM"`（JST）** + 連結文字（統計名＋涵蓋期）+ `stat-announce-kikan`（府省）。
  - **結論**：JP 走**解析 release-calendar HTML 的 `data-toukei_cd` + `data-kensakuKouhyou_date` + name**（比 appId API 更適合當日曆源，且免金鑰＝部署即見資料、無 owner secret 步驟、比原計畫更簡單）。此屬**實作發現**（同 AU ABS 把「SDMX API」修正為「HTML parse」的先例），非決策變更，不改 Accepted ADR，記於此 + status。
- **關鍵設計（rule 00：寧缺勿錯）**：單一 `toukei_cd` 家族含多種發布變體（全國 vs 東京都區部 CPI、1 次 vs 2 次速報 GDP、速報 vs 確報 IP），故用 **`estatToukeiCode` + `estatNameIncludes`/`estatNameExcludes`（AND/NONE 子字串）精確辨別**，只取單一 headline 發布，杜絕 `(indicatorCode, periodLabel)` upsert 碰撞（實測 3 個月窗口 0 碰撞）。
- **交付**：config 加 `CalendarProvider 'ESTAT'` + `estatToukeiCode`/`estatNameIncludes`/`estatNameExcludes` 三欄位 + **5 個 e-Stat 一手指標**（**JP_CPI** INFLATION `00200573` 全國／**JP_GDP** GROWTH `00100409` 四半期別 1 次速報／**JP_LABOUR_FORCE** EMPLOYMENT `00200531` 基本集計／**JP_INDUSTRIAL_PRODUCTION** OTHER `00550300` 速報／**JP_TRADE_BALANCE** TRADE `00350300` 輸出確報），全部本次實測**精確驗證** toukei_cd + name 過濾。enum `JP`/旗/三語 `regionJP` batch 1 已備 → **無 cross-layer commit**。`index.ts` 匯出 + `main.ts` 免金鑰常駐接線。
- **provider**：injectable `fetchFn`/`now`、per-row try/catch 隔離、window 過濾（LOOKBACK 30d／LOOKAHEAD 120d）、值恆 null、**JST→UTC**（減 9h 常數位移，`Date.UTC` 處理跨日；JST 無 DST，不引入 date lib，D7）、**日文期間正規化**（全形數字→半形、**令和 era→西曆**（令和8=2026）、季度 `YYYY年M-M月期`→`YYYY Qn`、月 `YYYY年M月`→`YYYY-MM`、**最早出現者勝**以免月報內嵌季度平均被誤標）。
- **紅線嚴守（ADR-0058 D1 / ADR-0061 D4）**：只收政府一手（総務省統計局／内閣府／経済産業省／財務省）；私人 PMI（au Jibun Bank／日經／S&P Global）**非政府統計、不會出現在此官方日曆、且設計上排除**；facts-only、值恆 null（誠實）。
- **驗證全綠**：typecheck **7/7**、新檔 + main.ts + config + index lint **0 error**、api unit **257**（AU ABS 的 241 + JP e-Stat 16）、**live 端點實測**產出 **22 draft**（5 指標橫跨 2026-07～2026-11，日期/期間/JST→UTC/null 值全正確，0 碰撞）。
- **⚠️ 維護待辦**：release-calendar 只給滾動近期窗口（**無年表 config 需年度更新問題，優於 HK/CN 的年度轉錄**）；但 `estatToukeiCode`/name 過濾若 e-Stat 改統計名或代碼會失配（失配＝缺覆蓋非錯資料，自癒；建議偶爾巡檢頁面 field class 與 toukei_cd）。

### NZ Stats NZ 交付（2026-08-04 續作 session，2 個 commit，branch `feature/calendar-nz-statsnz`）

**Batch 3 收官 — 最後一國。** ⚠️ **重大來源探勘修正（rule 00，推翻本文件 Batch 2「Stats NZ 端點皆不友善」的結論）**：Batch 2 測的是**錯路徑**（`/assets/RSS/release-calendar.json` → 403 Incapsula WAF）。本 session 重新探勘，用**瀏覽器式 headers**（UA + Referer + Accept + X-Requested-With）拿到**兩個乾淨的官方機讀端點**：

- **`/api/v1/releaseCalendarMonth/<YYYY-MM>`** → **200 application/json**：結構化，`items.published[]`（已發布，欄位在 `DateTaxonomyTerm` 下）+ `items.upcoming[]`（前瞻，扁平），每筆有 `DisplayName`（`"統計名: 涵蓋期"`）+ `PublicationDate`（`"2026-08-05 10:45:00"` NZ 當地）+ `ID`。
- **`/release-calendar/calendar-export`** → **200 text/calendar**：真 VEVENT + VTIMEZONE（Pacific/Auckland NZDT/NZST）。
- **選用 month JSON API**（比 ICS 更適合 match、仿 StatCan JSON 型 provider）。這屬**實作發現**（同 AU/JP 修正端點假設的先例），非決策變更，不改 Accepted ADR，記於此 + status。

**交付**：

- **Commit 1（`b9a56bb`，cross-layer enum `NZ`，全 additive）**：`packages/db` schema `EconomicRegion` 加 `NZ` + migration `20260804090000_add_nz_economic_region`（`ALTER TYPE … ADD VALUE IF NOT EXISTS`）+ `prisma generate`；`packages/config` `CalendarRegion` `'NZ'` + `CALENDAR_REGION_FLAG.NZ='🇳🇿'`；api `EconomicRegionValue`/`ECONOMIC_REGION_VALUES`；web `client.ts` + `CalendarList.tsx` `REGION_FLAG`；三語 `regionNZ`（紐西蘭/新西兰/New Zealand）+ parity test pin。typecheck 7/7、parity 4 綠、migration 已套本地 dev DB。
- **Commit 2（`752e0df`，provider）**：`nz-statsnz-provider.ts`（**live-fetch 型**，`source='STATSNZ'`）：injectable `fetchFn`/`now`、`monthsInWindow` 迴圈抓窗口各月（LOOKBACK 60d/LOOKAHEAD 120d）、合併 published+upcoming、**`DisplayName` 首冒號拆前綴精確 case-insensitive match**（天然區分 `Labour market statistics` vs `Labour market statistics (income)`）、per-row + per-month try/catch 隔離、值恆 null、**NZ 當地→UTC DST-aware**（NZDT UTC+13：9 月最後週日～4 月第一週日；NZST UTC+12；仿 StatCan DST helper、不引入 date lib，D7）、期間正規化（`"June 2026 quarter"→"2026 Q2"` 以結束月對應、`"July 2026"→"2026-07"`）。config 加 `CalendarProvider 'STATSNZ'` + `statsNzTitlePrefix` match key 欄位 + **5 個 Stats NZ 一手指標**（**NZ_CPI** INFLATION 季／**NZ_GDP** GROWTH 季／**NZ_LABOUR_MARKET** EMPLOYMENT 季／**NZ_TRADE_BALANCE** TRADE 月／**NZ_BUILDING_CONSENTS** OTHER 月，全部本次跨 4 個月實測精確驗證前綴）。`index.ts` 匯出 + `main.ts` 免金鑰常駐接線。
- **紅線嚴守（ADR-0058 D1 / ADR-0061 D4）**：只收 Stats NZ 官方一手；**不納紐西蘭私人 PMI/PSI（BusinessNZ）**；facts-only、值恆 null、永不加 forecast/consensus/impact。
- **驗證全綠**：typecheck **7/7**、新檔 + main.ts + config + index lint **0 error**、api unit **273**（JP e-Stat 的 257 + NZ 16）、**live 端點實測**產出 **18 draft**（5 指標橫跨 2026-06～2026-12，季頻 Q 對應/月頻/DST 轉換（9/17 22:45 NZST→9/30 21:45 NZDT）/null 值全正確，0 碰撞）。
- **⚠️ 維護待辦**：month API 只給滾動窗口（**無年表 config 需年度更新問題，優於 HK/CN 的年度轉錄**）；唯一 rule 00 風險＝Incapsula WAF 需正確 headers，若日後升級 JS challenge 會失效（失配＝整 provider 回 `[]`＝缺覆蓋非錯資料、自癒隔離，同 ABS/JP 等級）；`statsNzTitlePrefix` 若 Stats NZ 改統計名會失配（同上自癒；建議偶爾巡檢）。

## Batch 4 進度（2026-08-04 續作 session）

已交付（2 個 cohesive commit，branch `feature/calendar-kr-kostat`，自 `main` 開出，**已 commit、尚未 push / 未開 PR**）。官方源覆蓋自此為 **US/EU·EA/HK/GB/CA/CN/AU/JP/NZ/KR（10 地區）**。

- **KR KOSTAT**（South Korea，Statistics Korea）：**config 編碼型**（仿 HK C&SD / CN NBS，零網路 I/O）。**⚠️ 重要來源發現（rule 00）**：KOSTAT（통계청）2026 年已改組為 **國家數據處 / Ministry of Data and Statistics（MODS，mods.go.kr）**，`kostat.go.kr` 現 301 → `mods.go.kr`。KOSTAT 無機讀發布 API，前瞻源為官方**英文年度發布日程**（`mods.go.kr/menu.es?mid=a20301000000`，200 乾淨 HTML 表）。逐筆 UTC 日期**轉錄自該英文年表**，**發布時間對官方韓文月計畫**（`mods.go.kr/newsPln.es` 的 보도시간）核對＝物價/고용/산업활동 皆 **08:00 KST**；KST=UTC+9 無 DST → **前一日 23:00 UTC**（已直接編碼）。
  - **Commit 1（`706c423`，cross-layer enum `KR`，全 additive）**：`packages/db` schema + migration `20260804100000_add_kr_economic_region` + `prisma generate`；config `CalendarRegion 'KR'` + 🇰🇷；api `EconomicRegionValue`；web `client.ts` + `CalendarList.tsx`；三語 `regionKR`（南韓/韩国/South Korea）+ parity pin。
  - **Commit 2（`f703bc6`，provider）**：`kr-kostat-provider.ts`（`source='KOSTAT'`）+ config `CalendarProvider 'KOSTAT'` + **3 指標**（**KR_CPI** INFLATION 月頻 12／**KR_EMPLOYMENT**（經濟活動人口調查）EMPLOYMENT 月頻 12／**KR_INDUSTRIAL_ACTIVITY**（산업활동동향）OTHER 月頻 12）+ `index.ts` + `main.ts` 免金鑰常駐 + 6 unit tests。
  - **紅線嚴守**：只收 KOSTAT 官方一手；**不納韓國私人製造業 PMI（S&P Global）**；facts-only、值恆 null。
  - **BOK（GDP + 基準利率）刻意延後**：其唯一前瞻源為 BOK **HWP/PDF 附件**（非乾淨機讀），能找到的「有日期清單」全來自 **Investing.com / Trading Economics 聚合器**——ADR-0058 D1 禁以聚合器為來源，硬編碼將違反 rule 00 / D1；待日後驗到 primary-source BOK 日程再補（同 HK GDP advance 的延後紀律）。
  - **驗證全綠**：typecheck 7/7、parity 4、lint 0 error、api unit **279**（NZ 的 273 + KR 6）、真實 config smoke **36 draft**（12/12/12，值全 null、日期/期間正確）、migration 已套本地 dev DB。
  - **⚠️ 維護待辦**：KOSTAT 年表為 2026 年度（每年出次年表）→ 需**年度更新** config（同 HK/CN）。

### ID BPS 交付（2026-08-04 續作 session，2 個 cohesive commit，branch `feature/calendar-id-bps`，自 `main`（`d526078`）開出）

**Batch 4 第二國。** owner 於 [VN GSO / ID BPS 擇一] 選 **ID BPS**。**⚠️ 重要來源探勘發現（rule 00，推翻交接稿「ID 有官方 ARC＝仿 config 編碼即可直接抓」的樂觀假設）**：

- **BPS 全站（`www.bps.go.id`）在 Cloudflare JS/managed challenge 後** —— server 端 `curl`（含瀏覽器式 UA）與 WebFetch 一律回 **HTTP 403「Just a moment…」**（`cf-mitigated: challenge`）。這比 NZ 的 Incapsula 更嚴（需執行 JS 解 challenge，非單純 headers 可過）→ **live-fetch runtime 不可行**。
- 但 BPS **PPID 官方文件明載**：Advance Release Calendar（ARC / Rencana Terbit）於每年年初公布**全年一年期**發布日程 → 正是 HK/CN/KR 的「年度預告日程」情境 → **決定走 config 編碼型（仿 KR/HK/CN），runtime 零網路 I/O，完全避開 CF challenge**。
- **轉錄方法**：用真實瀏覽器（過 CF challenge）開官方 ARC（`bps.go.id/en/arc`，Next.js App Router SPA、FullCalendar + Mantine 表），切「List」視圖得**整年 2026 表格**（No. | Title | Release Schedule | Status），用「Find title」逐指標過濾 + 分頁擷取全 12/4 筆。
- **發布時刻 rule 00 驗證**：ARC 頁「Press Conference Schedule」widget 明載 **Time: 11:00:00 UTC+7**（BRS 記者會）。WIB=UTC+7 無 DST → **11:00 WIB = 04:00 UTC 同日**（直接編碼）。CPI detail 頁標題（「…inflation in December 2025…」在 1/5 發布）交叉確認**期間映射＝發布月報前一月**。

**交付**：

- **Commit 1（`10a703e`，cross-layer enum `ID`，全 additive）**：`packages/db` schema `EconomicRegion` 加 `ID` + migration `20260804110000_add_id_economic_region`（`ALTER TYPE … ADD VALUE IF NOT EXISTS 'ID'`）+ `prisma generate`；`packages/config` `CalendarRegion 'ID'` + `CALENDAR_REGION_FLAG.ID='🇮🇩'`；api `EconomicRegionValue`/`ECONOMIC_REGION_VALUES`；web `client.ts` + `CalendarList.tsx` `REGION_FLAG`；三語 `regionID`（印尼/印度尼西亚/Indonesia）+ parity pin。
- **Commit 2（`bc1b333`，provider）**：`id-bps-provider.ts`（`source='BPS'`，仿 `kr-kostat`／`cn-nbs`／`hk-csd` 純讀 config `releases[]`、零網路 I/O、per-release try 隔離、malformed date skip、值恆 null）+ config 加 `CalendarProvider 'BPS'` + **3 個 BPS 一手指標**（**ID_CPI** INFLATION 月頻 12／**ID_TRADE_BALANCE**（Exports and Imports）TRADE 月頻 12／**ID_GDP**（Economic Growth）GROWTH 季頻 4）+ `index.ts` 匯出 + `main.ts` 免金鑰常駐接線 + 6 unit tests。
- **紅線嚴守（ADR-0058 D1 / ADR-0061 D4）**：只收 BPS 官方一手；**不納印尼私人製造業 PMI（S&P Global）**；**Bank Indonesia BI-Rate 屬央行非 BPS 統計，本 provider 不納**（同 KR 把 BOK 分離的紀律）；facts-only、值恆 null。
- **驗證全綠**：typecheck **7/7**、parity 4、lint 0 error、api unit **285**（KR 的 279 + BPS 6）、真實 config smoke **28 draft**（CPI 12 + Trade 12 + GDP 4，值全 null、日期 11:00 WIB→04:00 UTC、期間正確）、migration 已套本地 dev DB。
- **⚠️ 維護待辦**：BPS ARC 為 2026 年度（每年初出次年表）→ 需**年度更新** config（同 HK/CN/KR 慣例）。另 rule 00 風險＝CF challenge 使**日後轉錄次年表仍需真實瀏覽器**（server 端無法自動抓，屬人工年度巡檢，非 runtime 依賴——runtime 純讀 config 不觸網）。

### VN GSO 交付（2026-08-04 續作 session，2 個 cohesive commit，branch `feature/calendar-vn-gso`，自 `main`（`e2e21c3`）開出）

**Batch 4 第三國。** owner 指定 **VN GSO**（Vietnam General Statistics Office）。**⚠️ 重要來源探勘發現（rule 00，推翻交接稿「VN 仿 HK/CN/KR/ID 走 config 編碼」的預設）**：

- **域名已更名**：`gso.gov.vn` 的 TLS 憑證 CN 已是 `nso.gov.vn`（O=GENERAL STATISTICS OFFICE），`gso.gov.vn` 現 301/重導至 **`www.nso.gov.vn`**——GSO 已更名 **National Statistics Office of Vietnam** 並改隸**財政部**（同一機構）。這是**現行官方域名**（rule 00 資料正確性）。
- **無 Cloudflare/WAF**：站點是 **WordPress on Apache**，server 端 `curl`/fetch 直接回 200 + 完整 HTML（不像 ID BPS 的 CF challenge）→ **live-fetch 於 server 端可行**。
- **官方 ARC 是機讀的**：`https://www.nso.gov.vn/en/release-calendar-3/`（自訂外掛 `gso-release-calendar`）頁面內嵌 **`var events=[{title,status,date,format}]` JSON 陣列**，含**全 2026 前瞻日期**（481 筆），滾動多年（2021→2026）→ **決定走 live-fetch 型（仿 GB/CA/AU/JP/NZ，非 config 編碼），免年度轉錄**。
- **資料含雜訊（rule 00）**：ARC 陣列含非 ISO 的 `date`（如 "The 6th next month…"，官方 widget 自身用 luxon `fromISO` 天然丟棄）→ provider **只收嚴格 `YYYY-MM-DD`、期間無法解析者 skip**（缺覆蓋非錯資料）。
- **發布時刻 rule 00 驗證**：ARC 每筆給**確切日期**（自 2024-08 Decree 62/2024/NĐ-CP 起改為次月發布；ARC 前瞻筆數實際為每月 6 或 3 日，逐筆讀 ARC＝權威）；官方多處明載發布**於「上午」**（"sáng ngày…"；如 July 2026 報告「on the morning of August 3rd」＝ARC 的 2026-08-03 吻合），未公布精確分鐘 → 時刻錨定 **09:00 Hanoi（ICT=UTC+7 無 DST → 02:00 UTC）**，**日期為權威事實**。

**交付**：

- **Commit 1（`aef9ba6`，cross-layer enum `VN`，全 additive）**：`packages/db` schema `EconomicRegion` 加 `VN` + migration `20260804120000_add_vn_economic_region`（`ALTER TYPE … ADD VALUE IF NOT EXISTS 'VN'`）+ `prisma generate`；`packages/config` `CalendarRegion 'VN'` + `CALENDAR_REGION_FLAG.VN='🇻🇳'`；api `EconomicRegionValue`/`ECONOMIC_REGION_VALUES`；web `client.ts` + `CalendarList.tsx` `REGION_FLAG`；三語 `regionVN`（越南/越南/Vietnam）+ parity pin。
- **Commit 2（`516b626`，provider）**：`vn-gso-provider.ts`（**live-fetch 型**，`source='GSO'`：injectable `fetchFn`/`now`、string-aware 抽取內嵌 `var events=[…]`（標題內含 `]` 不會截斷）、`gsoNameIncludes`/`gsoNameExcludes` 子字串 match、**只收嚴格 ISO 日期**、window 過濾 LOOKBACK 60d/LOOKAHEAD 120d、期間正規化（標題開頭 period phrase → `YYYY-MM`／`YYYY Qn`，**最早 token 勝**；越南把季末月併入季報故 6 月報＝`2026 Q2`，誠實且不與月標籤碰撞）、ICT→UTC 09:00→02:00、per-row try 隔離、值恆 null）+ config 加 `CalendarProvider 'GSO'` + `gsoNameIncludes`/`gsoNameExcludes` match key + **6 個 GSO 一手指標**（**VN_CPI** INFLATION／**VN_GDP** GROWTH 季／**VN_INDUSTRIAL_PRODUCTION** OTHER／**VN_RETAIL_SALES** OTHER／**VN_TRADE_BALANCE** TRADE／**VN_UNEMPLOYMENT_RATE** EMPLOYMENT 季）+ `index.ts` 匯出 + `main.ts` 免金鑰常駐接線 + 15 unit tests。
- **紅線嚴守（ADR-0058 D1 / ADR-0061 D4）**：只收 GSO 官方一手；**不納越南私人製造業 PMI（S&P Global）**；facts-only、永不加 forecast/consensus/impact；值恆 null（ARC 無機讀數值，誠實）。
- **驗證全綠**：typecheck **7/7**、parity 4、lint 0 error、calendar-fetcher 全目錄 **122 test（13 檔）**（含 VN 15）、**真實 ARC live smoke** 產出 **24 draft**（6 指標橫跨 2026-07～2026-11，值全 null、日期 09:00 ICT→02:00 UTC、期間月/季正確、窗口外 2026-12-03 正確剔除、0 碰撞）、migration 已套本地 dev DB。
- **✅ 維護優勢**：ARC 為**內嵌全年滾動 JSON**（live 抓）→ **無 config 年度轉錄負擔**（優於 HK/CN/KR/ID 的年度手工更新）；唯一 rule 00 風險＝GSO 若改頁面結構（移除 `var events=` 或改標題措辭）會失配＝缺覆蓋非錯資料、自癒隔離（同 AU/JP/NZ 等級）。

### SG SingStat 交付（2026-08-04 續作 session，2 個 cohesive commit，branch `feature/calendar-sg-singstat`，自 `main` 開出）

**Batch 4 第四國。** owner 於東南亞/亞洲官方統計局中選 **SG SingStat**（Department of Statistics Singapore）。**⚠️ 重要來源探勘發現（rule 00，server 端重驗推翻交接稿一度誤判「ARC 經 Directus BFF `/api/data-sources` 404 → live 不可行、走 config 編碼」）**：

- **無 WAF、正確 ARC 頁 server 端 200**：ARC 正確頁為 `https://www.singstat.gov.sg/data-tools-services/advance-release-calendar`（舊 `whats-new/advance-release-calendar` 404 是先前誤判來源），server 端 `curl` 直接回 **HTTP 200 + 310KB HTML**（CloudFront 前端、**無 Cloudflare/Incapsula challenge**，不像 ID BPS）→ **live-fetch 於 server 端可行**。
- **官方 ARC 是機讀的（Next.js RSC payload）**：全年 ARC 日程以機讀 JSON 內嵌於頁面的 Next.js RSC 串流 chunk：`self.__next_f.push([1,"…{\"arcData\":{\"themeFilter\":[…],\"data\":[{id,title,state,description,frequency,release_date,themes,tags,subject,…}]}}…"])`（實測 **243 筆前瞻筆數**橫跨 2026-08～2027-07，全 `state:"Upcoming"`）→ **決定走 live-fetch 型（仿 GB/CA/AU/JP/NZ/VN，非 config 編碼），免年度轉錄**。
- **標題結構 + 比對法**：每筆 `title`＝「`<指標名>, <期間>`」，provider 以**含逗號結尾的 `singstatTitlePrefix` 前綴 startsWith 比對**（逗號結尾使前綴互斥、不 bleed 到 sibling：`CPI For General Households,` 永不誤配半年頻 `CPI By Household Income Group,`；advance GDP `Advance Gross Domestic Product (GDP) Estimates,` 永不誤配完整 `GDP,`／`Expenditure-Based GDP,`）；期間自標題尾解析（月 `Mon YYYY`→`YYYY-MM`、季 `nQ YYYY`（新加坡數字在前，如 `2Q 2026`）→`YYYY Qn`；半年 `2H` 不用故回 null 略過）。
- **發布時刻 rule 00 驗證**：ARC 逐筆給**單一權威 `release_date`（嚴格 `YYYY-MM-DD`）**；`description` 的「Not Later Than」或日期區間（如 Unemployment「To be released on 29 - 30 Oct」）**刻意忽略**，`release_date` 為定案日。SingStat 標準發布時刻＝**13:00 新加坡（SGT=UTC+8 無 DST → 05:00 UTC）**，錨定此時刻，日期為權威事實。

**交付**：

- **Commit 1（`e3e314e`，cross-layer enum `SG`，全 additive）**：`packages/db` schema `EconomicRegion` 加 `SG` + migration `20260804130000_add_sg_economic_region`（`ALTER TYPE … ADD VALUE IF NOT EXISTS 'SG'`）+ `prisma generate`；`packages/config` `CalendarRegion 'SG'` + `CALENDAR_REGION_FLAG.SG='🇸🇬'`；api `EconomicRegionValue`/`ECONOMIC_REGION_VALUES`；web `client.ts` + `CalendarList.tsx` `REGION_FLAG`；三語 `regionSG`（新加坡/新加坡/Singapore）+ parity pin。
- **Commit 2（`6b8f15f`，provider）**：`sg-singstat-provider.ts`（**live-fetch 型**，`source='SINGSTAT'`：injectable `fetchFn`/`now`、**RSC payload 抽取**（掃 `self.__next_f.push([1,"…"])` marker → `JSON.parse` 字串字面解碼 → string-aware 大括號掃描 `{"arcData":…}` → 取 `.arcData.data`，標題內含 `{}` 不截斷）、逗號結尾前綴 startsWith match、**只收嚴格 ISO `release_date`**、window 過濾 LOOKBACK 60d/LOOKAHEAD 120d、期間正規化（季優先、`nQ YYYY`→`YYYY Qn`、`Mon YYYY`→`YYYY-MM`）、SGT→UTC 13:00→05:00、per-row try 隔離、值恆 null）+ config 加 `CalendarProvider 'SINGSTAT'` + `singstatTitlePrefix` match key + **6 個 SingStat 一手指標**（**SG_CPI** INFLATION 月／**SG_GDP**（Advance GDP Estimates）GROWTH 季／**SG_UNEMPLOYMENT_RATE** EMPLOYMENT 季／**SG_MERCHANDISE_TRADE** TRADE 月／**SG_RETAIL_SALES** OTHER 月／**SG_INDUSTRIAL_PRODUCTION** OTHER 月，各 `sourceUrl` 為官方 `find-data/explore-data-themes/…/latest-news-data` 實測 200）+ `index.ts` 匯出 + `main.ts` 免金鑰常駐接線 + 16 unit tests。
- **紅線嚴守（ADR-0058 D1 / ADR-0061 D4）**：只收 SingStat 官方一手；**不納新加坡私人製造業 PMI（S&P Global / SIPMM）**；**MAS 貨幣政策聲明屬央行非 SingStat 統計、不納**（同 KR 把 BOK、ID 把 BI 分離的紀律）；facts-only、永不加 forecast/consensus/impact；值恆 null（ARC 無機讀數值，誠實）。
- **驗證全綠**：typecheck **config/api/web 3/3**、parity 4、lint 0 error（僅既有無關 KOL 頁 warning）、calendar-fetcher 全目錄 **138 test（14 檔）**（含 SG 16）、**真實 ARC live smoke**（抽取器對 production HTML 跑）產出 **243 筆全解析、6 指標比對數正確**（CPI/Merchandise/Retail/IIP 各 12 月頻、GDP/Unemployment 各 4 季頻）、`prisma validate` 綠、migration 已 `prisma generate`。
- **✅ 維護優勢**：ARC 為**內嵌全年 JSON**（live 抓）→ **無 config 年度轉錄負擔**（優於 HK/CN/KR/ID 的年度手工更新）；唯一 rule 00 風險＝SingStat 若改 RSC 結構（移除 `arcData` 或改標題措辭）會失配＝缺覆蓋非錯資料、自癒隔離（同 AU/JP/NZ/VN 等級）。

### 下個 session 的 Batch 4 剩餘候選

**KR、ID、VN、SG 已交付。** 官方源覆蓋自此為 **US/EU·EA/HK/GB/CA/CN/AU/JP/NZ/KR/ID/VN/SG（13 地區）**。下一國由 owner 定（其他東南亞/亞洲官方統計局如 TH/MY/PH/IN 等，先探勘域名與源型態再定 config 編碼 vs live）。PMI 一律仍只收官方自家、不納私人；KR 的 BOK GDP/利率仍待 primary-source 日程。

### （Batch 3 已收官）下個 session 的 Batch 3 剩餘候選（擇一聚焦，勿一次全上）

**Batch 3 已全數收官（CN/AU/JP/NZ 皆已交付）。** 官方源覆蓋：US/EU·EA/HK/GB/CA/CN/AU/JP/NZ。下一步方向由 owner 決定（可能 Batch 4：VN GSO / ID BPS / KR KOSTAT 等需 config 編碼排程的亞洲官方源，仿 HK/CN 慣例；PMI 一律仍只收官方自家、不納私人）。

1. ~~**AU ABS**~~ ✅ **已交付（2026-08-04，PR #70 squash `3851a77`）** — 解析 future-releases HTML 的 `<time datetime>`＋`event-name`，見上方「AU ABS 交付」。
2. ~~**NZ Stats NZ**~~ ✅ **已交付（2026-08-04，branch `feature/calendar-nz-statsnz`，commits `b9a56bb`+`752e0df`）** — **推翻 Batch 2「端點不友善」結論**：實際有乾淨的 `/api/v1/releaseCalendarMonth/<YYYY-MM>` JSON（瀏覽器式 headers 過 Incapsula），見上方「NZ Stats NZ 交付」。
3. ~~**JP e-Stat**~~ ✅ **已交付（2026-08-04，PR #72 squash `69a7de4`）** — **免金鑰**（推翻「需 appId」假設，見上方「JP e-Stat 交付」）：解析官方 release-calendar HTML 的 `data-toukei_cd` + `data-kensakuKouhyou_date`（JST）+ name include/exclude 精確辨別。
4. ~~**CN NBS**~~ ✅ **已交付（2026-08-04，PR #69 squash `2c5ed76`）** — 仿 HK config 編碼、只收 NBS、見上方「Batch 3 進度」。

Provider pattern 已定型（見 `gb-ons-provider.ts` / `ca-statcan-provider.ts`）：injectable `fetchFn`/`now`、
per-entry try/catch 隔離、window 過濾、title/slug 精確比對、schedule-only 值留 null、fixture 驅動 unit test、
`index.ts` 匯出 + `main.ts` 免金鑰常駐接線、live 端點實測一次。

## 給未來 AI agent 的建議

1. **先讀** `ADR-0058`（合規/架構母 ADR）+ `ADR-0061`（多地區擴充）+ `docs/conversations/2026-08-03-calendar-multi-region-research.md`（Eurostat/HK 研究）。
2. **心法**：owner 說「缺數據」＝要**官方源廣度**，不是要我們變成第二個 Investing.com。
   凡是 forecast/impact/私人 PMI 一律不碰——這是項目的**根本差異化**，不是可放寬的細節。
3. **一國一小 commit**，每支 provider 獨立可驗證、獨立過 CI（rule 96）。
4. 先挑**免金鑰、有官方 API/JSON/ICS** 的（GB ONS、CA StatCan、AU ABS、NZ Stats NZ）快速拉高覆蓋，
   再處理需編碼排程（VN GSO、ID BPS）或需 key（JP e-Stat）的。
