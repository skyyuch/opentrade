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

### 下個 session 的 Batch 3 候選（擇一聚焦，勿一次全上）

1. **AU ABS**：優先嘗試逆向 `search.abs.gov.au/s/search.json`（Funnelback，需找對 collection + 依 release-date meta 排序），
   成功即等同 clean JSON；否則退而解析 `/release-calendar/future-releases` 的 Drupal View HTML（表格結構尚穩定，但需 fixture 化測試 + 年度巡檢）。enum `AU` 已備、國旗/i18n 已備 → 純 provider+config。
2. **NZ Stats NZ**：需先擴 enum（`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'NZ'`，仿 `20260803080000`）
   - config `CalendarRegion`/旗 + api `ECONOMIC_REGION_VALUES` + web `ECONOMIC_REGIONS`/`REGION_FLAG` + 三語 `regionNZ` + parity（一個 cross-layer commit），再寫 provider（HTML 爬取其 release-calendar 頁）。
3. **JP e-Stat**：需免費 appId（走 Secrets Manager + 條件掛載，仿 FRED）；e-Stat 有官方發布日曆 API。
4. **CN NBS**：enum 已有 `CN`，但官方發布日程無 JSON → 仿 HK config 編碼（且只收 NBS，**絕不**收財新/匯豐 PMI）。

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
