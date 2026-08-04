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

### JP e-Stat 交付（2026-08-04 續作 session，branch `feature/calendar-jp-estat`）

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

### 下個 session 的 Batch 3 剩餘候選（擇一聚焦，勿一次全上）

1. ~~**AU ABS**~~ ✅ **已交付（2026-08-04，PR #70 squash `3851a77`）** — 解析 future-releases HTML 的 `<time datetime>`＋`event-name`，見上方「AU ABS 交付」。
2. **NZ Stats NZ**（Batch 3 唯一剩餘）：需先擴 enum（`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'NZ'`，仿 `20260803080000`）
   - config `CalendarRegion`/旗 + api `ECONOMIC_REGION_VALUES` + web `ECONOMIC_REGIONS`/`REGION_FLAG` + 三語 `regionNZ` + parity（一個 cross-layer commit），再寫 provider（HTML 爬取其 release-calendar 頁）。
   - ⚠️ Batch 2 實測 Stats NZ 端點皆不友善（`release-calendar.json` 403、`.ics` 無 VEVENT、OData 需金鑰）→ 只能 HTML 爬取，較脆弱、rule 00 風險較高。
3. ~~**JP e-Stat**~~ ✅ **已交付（2026-08-04，branch `feature/calendar-jp-estat`）** — **免金鑰**（推翻「需 appId」假設，見上方「JP e-Stat 交付」）：解析官方 release-calendar HTML 的 `data-toukei_cd` + `data-kensakuKouhyou_date`（JST）+ name include/exclude 精確辨別。
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
