# Economic-calendar multi-region official-source research — 2026-08-03

> 歸檔 OpenTrade「財經日曆多地區官方擴充」session 的**研究成果**，避免下個 session 重做。
> 對應 [ADR-0061](../decisions/0061-economic-calendar-multi-region-official-sources.md) 與 plan
> `~/.cursor/plans/calendar_multi-region_official_ce7e53c1.plan.md`。

## 對話脈絡

- 日期：2026-08-03
- 參與者：owner + AI（Opus 4.8）
- 背景：owner 覺得日曆太稀疏（只美國、且預設「本週」只見就業數據），要擴到「美國+歐盟+亞洲及其他」，版面參照 Investing.com（國旗、日期分組）。
- 關鍵決策：走**官方路擴多地區**（非商業聚合），嚴守 ADR-0058 D1 facts-only 紅線（永不加 forecast/consensus/impact）。決策理由完整見 ADR-0061。

## 本 session 已完成（未 commit）

1. **ADR-0061** 寫好並在 `docs/decisions/README.md` 註冊（0058 標記 amended by 0061）。
2. **DB**：`packages/db/prisma/schema.prisma` 的 `EconomicRegion` enum 加 `EU/EA/GB/CA/AU/JP`；migration `20260803080000_expand_economic_region_enum`（純 additive `ALTER TYPE ... ADD VALUE IF NOT EXISTS`）**已套用本地 dev DB** + `prisma generate` 完成。

## ⚠️ 給下個 session 的關鍵發現

### 發現 1：Eurostat 的 ICS URL 已死，改用官方 JSON 端點

- plan 寫的 `https://ec.europa.eu/eurostat/cache/RELEASE_CALENDAR/calendar_EN.ics` **回 404**（已實測）。
- Eurostat 網站自己的 release-calendar 頁用的是這個**官方 JSON 端點**（實測可用、免金鑰）：

  ```
  https://ec.europa.eu/eurostat/o/calendars/eventsJson
    ?theme=0&category=0&keywords=&isEuroindicator=&authorInclude=&authorExclude=
    &start=2026-08-01T00:00:00+02:00
    &end=2026-11-01T00:00:00+02:00
    &timeZone=Europe/Luxembourg
  ```

  - `isEuroindicator=true` 只回歐元區關鍵指標（PEEIs），量少精準，建議用這個過濾。
  - 回傳 JSON array，每筆欄位：`title`（穩定官方標題）、`period`（如 `"July 2026"` / `"Q2/2026"` / `"2026"`）、`start`（ISO **UTC**，如 `"2026-08-19T11:00Z"`）、`datasetCodes`（逗號分隔的 Eurostat dataset 代碼，穩定機器 id）、`euroind`（bool）、`theme`、`types[]`。
  - **無 previous/actual 數值**（純發布日曆）→ 依 ADR-0058 兩階段，Eurostat 事件 `previousValue/actualValue` 留 `null` 即可（合規、誠實）。若日後要值，需另接 Eurostat dissemination API（本批不做）。

- **下個 session 的 `eurostat-provider.ts` 應改用此 JSON 端點**（比解析 ICS 更穩健），並在 ADR-0061 補一句「ICS URL 已失效，改用官方 eventsJson 端點」。unit test 用自造 JSON fixture 即可（與 live URL 解耦）。

### 發現 2：歐元區關鍵指標的官方標題 + dataset code（實測 2026-08~11 窗口）

建議白名單（用 `title` exact-match，case-insensitive；titles 是官方穩定週期性標題）：

| 建議 indicatorCode     | Eurostat title（match 用）                             | region | category   | dataset code（樣本）               | period 樣本           |
| ---------------------- | ------------------------------------------------------ | ------ | ---------- | ---------------------------------- | --------------------- |
| `EA_HICP_FLASH_YOY`    | `Flash estimate inflation euro area`                   | EA     | INFLATION  | `prc_hicp_fp,prc_hicp_manr,...`    | `August 2026`（月頻） |
| `EU_HICP_YOY`          | `Inflation (HICP)`                                     | EU     | INFLATION  | `prc_hicp_manr,prc_hicp_midx,...`  | `July 2026`           |
| `EA_GDP_FLASH_QOQ`     | `Flash estimate GDP and employment - EU and euro area` | EA     | GROWTH     | `namq_10_gdp,namq_10_a10_e`        | `Q2/2026`（季頻）     |
| `EA_UNEMPLOYMENT_RATE` | `Unemployment`                                         | EA     | EMPLOYMENT | `une_rt_m`                         | `July 2026`           |
| `EU_RETAIL_TRADE`      | `Retail trade`                                         | EU     | OTHER      | `sts_trtu_m,sts_trtu_q,sts_trtu_a` | `June 2026`           |

（另可選：`Industrial production` `sts_inpr_*`、`International trade in goods` `ext_st_*`、`Preliminary flash estimate GDP - EU and euro area` `namq_10_gdp`。）

- period 正規化建議（對齊 FRED 慣例）：`"July 2026"→"2026-07"`、`"Q2/2026"→"2026 Q2"`、`"2026"→"2026"`。
- 架構接法：config 每個 Eurostat 指標加欄位（如 `provider:'EUROSTAT'` + `eurostatTitle:'...'`）；provider 讀 enabled 的 EUROSTAT 指標建 `title→indicatorCode` map，抓 JSON，match title 後產 draft（`scheduledAt`=`start`、`periodLabel`=正規化 period、previous/actual=null）。fetcher 既有的「draft.indicatorCode join config registry」機制不變。

### 發現 3：香港 C&SD 2026 精確發布日期（官方 PDF 已解析）

來源：`https://www.censtatd.gov.hk/FileManager/EN/Common/Schedule_of_Regular_Press_Releases_on_Statistical_Data_in_2026.pdf`
（政府統計處 2026 定期發布時間表）。**發布時間固定 16:30 HKT = 08:30 UTC**。無 JSON API，故 config 直接編碼。

**綜合消費物價指數 CPI（月頻，region HK, INFLATION, unit `%_YOY`）**——(參考月 → 2026 發布日)：
2025-12→01-22, 2026-01→02-25, 02→03-20, 03→04-23, 04→05-21, 05→06-23, 06→07-21, 07→08-20, 08→09-23, 09→10-22, 10→11-20, 11→12-21。

**失業及就業不足統計 Unemployment（滾動三月，region HK, EMPLOYMENT, unit `%`）**——(參考期 → 2026 發布日)：
10-12/2025→01-20, 11/25-01/26→02-20, 12/25-02/26→03-18, 01-03→04-23, 02-04→05-19, 03-05→06-16, 04-06→07-17, 05-07→08-20, 06-08→09-17, 07-09→10-22, 08-10→11-17, 09-11→12-17。
（periodLabel 建議取滾動窗末月，如 `2026-07`，或 `2026-05..07`；下個 session 定。）

**對外商品貿易統計 External merchandise trade（月頻，region HK, TRADE, unit 視情況；值留 null）**——(參考月 → 2026 發布日)：
2025-12→01-27, 2026-01→02-27, 02→03-26, 03→04-28, 04→05-28, 05→06-25, 06→07-27, 07→08-25, 08→09-24, 09→10-28, 10→11-26, 11→12-28。

**本地生產總值預先估計 GDP advance estimate（季頻，region HK, GROWTH, unit `%`）**——PDF 顯示發布日 `30 / 5 / 31 / 3` 對應參考季 `Q4/2025 / Q1/2026 / Q2/2026 / Q3/2026`，**但發布「月份」在 PDF 線性化後不明確，下個 session 需回查原表格欄位定位**（HK GDP advance 慣例約：Q4→2 月底、Q1→5 月初、Q2→8 月中、Q3→11 月中；務必以 PDF 為準再落地，勿臆測）。

- HK 值（previous/actual）：C&SD 無機器可讀 API，本批 **值留 null，只上排程/期間**（合規、誠實），或下個 session 評估是否值得手動編碼少量值。
- **維護提醒**：此為 2026 年表，C&SD 每年 9 月公布次年表 → 需**每年更新** config（記入 status 待辦）。
- HK 排程 provider 建議：config 每個 HK 指標加 `provider:'HK_CSD'` + 一組 `releases[]{ dateUtc, periodLabel }`（16:30 HKT 已換算 UTC 08:30）；provider 純讀 config 產 draft，無外部 API 依賴。

## 產生的 ADR

- [ADR-0061](../decisions/0061-economic-calendar-multi-region-official-sources.md)：多地區官方來源擴充（amends ADR-0058 D1/D2）。

## ⚠️ 未 commit 的 working tree 狀態（交接重點）

本 session 開始時，working tree 已有**上一個 session（新聞縮圖 ADR-0060）整批未 commit 的改動**（news-fetcher/NewsList/domain/`schema.prisma` 的 `NewsItem.imageUrl`/migration `20260803060000`/ADR-0060 檔/README 0060 row/`CalendarList.tsx` 國旗/`layout.tsx` 移除 ThemeProvider/`client.ts` imageUrl…）。本 session 又疊上 calendar 的 ADR-0061 + enum migration + schema enum + README 0061 row。

→ **兩個 feature 在共用檔（`schema.prisma`、`README.md`、`client.ts`）交纏**，無法用 file-level staging 乾淨拆分（per-hunk staging 屬互動式，rule 禁）。故本 session **暫不 commit**，避免把兩 feature 混進一個 commit 或造成半套/不一致 git 狀態。下個 session 應在**各 feature 完成後**分別 cohesive commit（新聞縮圖一組、日曆多地區一組）。

## 給未來 AI agent 的建議（下一步）

依 plan 剩餘 6 個 todo：`config`（泛化 calendar.ts + 加 EU/EA + HK 指標 + region→國旗）→ `eurostat`（JSON provider + fixture test）→ `hk`（config 編碼排程 provider + test）→ `wire`（main.ts 接線，免金鑰常駐）→ `web-types`（client.ts ECONOMIC_REGIONS + 三語 region 鍵）→ `web-ui`（CalendarList 國旗 map + 日期分組版面）→ `verify`（migration/重啟/測試全綠）→ `docs`（status + rule 99）。
先讀本檔 + ADR-0061 + ADR-0058，即可無縫接手。
