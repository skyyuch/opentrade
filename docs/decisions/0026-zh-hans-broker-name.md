# ADR-0026: zh-Hans Broker Name Strategy (DB column + OpenCC backfill)

## Status

Accepted

## Date

2026-05-24

## Context

OpenTrade 支援三個 locale：`zh-Hant`（繁體中文，HK 主要市場、預設）、`zh-Hans`（簡體中文，跨境 / 大陸 KOL）、`en`（英文，國際投資者）。`Broker` 表的 schema 是繼承自 SFC 公開 register 的「平行欄位」模式 (per cursor rule 51 §模式 A)：

```prisma
model Broker {
  legalName   String  // English (SFC `nameEng`)        — 給 'en'
  displayName String  // Chinese (SFC `nameChi`，繁中)   — 給 'zh-*'
}
```

`packages/shared/src/i18n/brokerName.ts` 的 canonical helper `localizedBrokerName(b, locale)` 在 `zh-Hans` locale 走 `displayName ?? legalName ?? slug` — 由於 `displayName` 是繁中，**zh-Hans 用戶實際上看到的是繁中**（不是 bug，是 schema 沒有第三欄可以給）。

User 反映：「目前所有券商名字在簡體狀態下都沒有值」。實際症狀經確認是「都顯示繁中」，跨平台所有頁面（前台 + 後台）都受影響。

依專案紅線（cursor rule 00）「所有方案必須是徹底長遠方案，不接受 hack」，runtime 每次 request 跑 OpenCC 之類 cheap fix 直接排除。

### 三個候選方向

| 方向                                                      | 概念                                                                                                       | 影響面                                                                                      | 何時做合理                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **A. DB 加 `displayNameZhHans` 欄位**                     | parallel-columns schema 加第三列；OpenCC 一次性繁→簡 backfill；sync-brokers 自動轉；helper 加 zh-Hans 分支 | DB migration 1 條 / sync 1 處 / helper 1 行 / API contract 加 1 列 / rule 51 升級 ship 三列 | broker 是目前唯一需要簡中的 entity 時              |
| **B. 通用 entity translation 表**                         | 建 `BrokerNameTranslation { brokerId, locale, name }` 表，per-locale 一筆；helper 走 join                  | 多 1 table、所有 broker 查詢都要 join、需要 admin UI 維護 per-broker per-locale             | 第二個需要 i18n 的 entity（例 KOL nickname）出現時 |
| **C. Schema 改名 `nameEn` / `nameZhHant` / `nameZhHans`** | 完全改名 + 展開三列；rule 51 模式 A 結尾預留的長期路徑                                                     | schema rename + ts type / Prisma generated / 所有 reference 改一輪                          | 加第四語（日文）時做                               |

### Why 方案 A 而非 B/C

- 方案 B 為一個 entity 建 translation table 是 over-engineering。`ReviewTranslation` 之所以走 table（per ADR-0023）是因為 review body 是 UGC、長文、DeepL 跨語言成本高、需要 isolation。broker 名字是 short-noun + 法人實體 + 跨語對應穩定（「匯豐證券」⇄「汇丰证券」），用 OpenCC 確定性轉換準確率很高，沒必要為 ~5000 broker 建一個 join 表。
- 方案 C 是 future-proof 但**現在做太早**。schema 改名會 touch 30+ ts type / generated client / 所有 reference，沒有實際 payback（沒有第四語需求、沒有 KOL nickname schema 落地）。當實際需要時再走 C，是 cheap migration（DB column rename 而已，semantic 不變）。
- 方案 A 跟 cursor rule 51 模式 A 結尾「未來若擴增第三語...」是同一條路，差別只是「現在做不是未來做」，不衝突任何未來路徑（將來真要走 B/C 時方案 A 的 column 直接 drop 即可）。

### Why OpenCC 而非其他繁→簡轉換

- **OpenCC**（Open Chinese Convert）是業界標準，在 Mozilla / Wikipedia / KCC / RIME 等大型專案使用，覆蓋常見繁簡字 + 香港繁體 / 台灣繁體 / 中國簡體三套配置。
- 對 broker 法人名（「投資有限公司」「證券」「期貨」這類常用詞）的轉換準確率接近 100%。
- Node 生態有 `opencc-js`（pure JS，無 native 依賴）— 不會影響 Lambda / ECS 部署或 cold start。
- 缺點：對少數專有名詞（地方俚語、人名某些字）可能有歧異 — 透過讓 `displayNameZhHans` 為 `String?` (nullable) 並暴露 admin override UI 緩解（admin 可手動填特殊值蓋掉 OpenCC 結果）。

### 公平紅線檢查

- ❌ 任何「平台可改評論」設計 — 本 ADR 不涉及評論
- ❌ 任何「商戶付費影響顯示順序」設計 — 本 ADR 不涉及排序
- ❌ 任何「投資建議」 — 本 ADR 不涉及內容

通過。

## Decision

採方案 A：DB 加 `displayNameZhHans String?` 欄位 + OpenCC 一次性 backfill + sync-brokers 自動轉。

### D1: Schema 加 `displayNameZhHans String?` 欄位

```prisma
model Broker {
  legalName            String   // English
  displayName          String   // Traditional Chinese
  displayNameZhHans    String?  // Simplified Chinese, nullable for admin override
  // ...
}
```

`String?` (nullable) 的理由：

1. 允許 admin 對 OpenCC 結果不滿意的個別 broker 人工填寫覆蓋
2. backfill migration 完成後絕大多數 row 應該有值，但少數轉換失敗的 row 不會 block migration
3. helper fallback 鏈處理 null：`displayNameZhHans ?? displayName ?? legalName ?? slug`

### D2: OpenCC 設定固定為 `t2s.json` (Traditional → Simplified)

不用 `tw2sp` (台灣 → 大陸) 因為 SFC 資料是港繁不是台繁。`t2s` 對港繁適用度最高。

設定一次寫進 `packages/db/src/sfc/sync-brokers.ts` 的 OpenCC instance，避免散落多處 config。

### D3: backfill 路徑用 migration + dedicated script

- 寫一個 standalone migration script `packages/db/scripts/backfill-zh-hans.ts` (per ADR-0017 的 separation of structural migration vs data migration 慣例)
- migration SQL 只加列 + index，不在 SQL 裡跑 JavaScript transformation
- backfill script 用 OpenCC 讀所有 broker 的 displayName → 寫 displayNameZhHans → log 統計
- 冪等：腳本可以重跑（`upsert by id`）
- 跑兩次：一次 dev 驗證、一次 prod 部署後

### D4: sync-brokers.ts 進新 broker 時自動轉

`packages/db/src/sfc/sync-brokers.ts` 在 upsert broker 時順手跑 OpenCC，把 `displayNameZhHans` 填上。這樣未來 SFC 同步進來的新 broker 自動有簡中。

### D5: helper 加 zh-Hans 分支 + 升 input shape

```ts
// packages/shared/src/i18n/brokerName.ts
export interface LocalizedNameInput {
  readonly slug: string;
  readonly displayName: string;
  readonly displayNameZhHans?: string | null; // NEW
  readonly legalName?: string | null;
}

export const localizedBrokerName = (entity, locale) => {
  if (locale === 'en')
    return entity.legalName ?? entity.displayName ?? entity.slug;
  if (locale === 'zh-Hans') {
    return (
      entity.displayNameZhHans ??
      entity.displayName ??
      entity.legalName ??
      entity.slug
    );
  }
  return entity.displayName ?? entity.legalName ?? entity.slug;
};
```

### D6: API contract 升級 ship 三列

每一個 endpoint 在 payload 引用 broker 時必須 ship `displayName + legalName + displayNameZhHans`（per cursor rule 51 §模式 A · A2 升級）。`apps/api/src/shared/brokerHydration.ts` 的 `BrokerNameMeta` interface + `hydrateBrokerNames` 對應升級。

涵蓋的 endpoints（與 ADR-0025 broker-name i18n hardening 一致的 9 個）：

- `GET /v1/auth/me`（claimedBroker）
- `GET /v1/auth/verification-status`
- `GET /v1/auth/admin/verifications`
- `GET /v1/admin/users` (list + detail)
- `GET /v1/admin/reviews`
- `GET /v1/reviews/broker/:slug`
- `GET /v1/brokers` (list)
- `GET /v1/brokers/:slug` (detail + similarBrokers)
- `GET /v1/brokers/admin/claims`

### D7: rule 51 §模式 A 升級為 ship 三列強制

cursor rule 51 §A2 的範例與 ❌ 清單從「ship 兩列」改為「ship 三列（含 displayNameZhHans 即使 null）」。

### D8: admin override UI 暫不在這次 commit 做

`displayNameZhHans` 是 nullable + admin-overridable 的設計目的是讓未來能手動覆蓋 OpenCC 結果，但 admin UI 不在本次 6-commit 範圍內 — 等遇到實際需要 override 的 case 時再做（避免 over-build）。手動覆蓋暫時走 DB 直接 update，加進 `docs/03-status.md` 的「下一步」追蹤。

## Alternatives Considered

### B. 通用 entity translation 表

```prisma
model BrokerNameTranslation {
  id        String @id
  brokerId  String
  locale    String  // 'zh-Hant' | 'zh-Hans' | 'en'
  name      String

  @@unique([brokerId, locale])
  @@index([brokerId])
}
```

優點：

- 對稱於 ReviewTranslation 模式，認知負擔低
- 一條表搞定所有未來 entity 的 i18n（KOL、license series、dispute case）

缺點（決定性）：

- 為一個 entity 建 join table 是 over-engineering — Phase 1 沒有第二個需要 i18n 的 entity
- 所有 broker 查詢都要 join (列表頁、detail 頁、admin 表格、search...) — DB load 顯著上升
- Admin 必須維護 per-broker × per-locale 一個 row，operational overhead 高
- 跟 SFC sync 整合複雜：每次同步進新 broker 要插 3 row 而不是 1 row + OpenCC

**結論：當第二個需要 i18n 的 entity（例 KOL nickname）出現時再評估走 B**。

### C. Schema rename to `nameEn` / `nameZhHant` / `nameZhHans`

優點：

- 欄位名直接揭露語言、零歧義
- 未來加第四語（日文）只是再加一列、一個 helper 分支

缺點（決定性）：

- 影響面太大：30+ ts type 檔需要同步改、Prisma generated client 要重 regenerate、所有 `b.displayName` reference 要 grep 改一輪、`legalName` reference 同上
- 沒有實際 payback：當前只有三語、broker 是唯一 entity；改名後使用方式跟方案 A 完全一樣
- 是「未來真有第四語時」的 cheap migration，**現在做太早**（沒有觸發點）

**結論：當實際出現第四語需求時再走 C，到時候 schema rename 是 trivial migration**。

### D. Runtime OpenCC convert (排除)

每次 API response 動態跑 OpenCC 把 displayName 轉簡中。

排除原因：

- **違反 cursor rule 00 紅線「不接受 hack / 臨時解」** — 每次 request 跑轉換是 runtime overhead，不是徹底長遠方案
- 浪費 CPU（同一個 broker 每被 request 一次就轉一次）
- 無法 admin override（如果 OpenCC 對某個專有名詞轉錯，沒地方手動修）
- 對 caching / CDN 不友善（同一 endpoint 不同 locale 必須變成不同 cache key）

### E. 從 SFC 取簡中名 (排除)

SFC register 沒有官方簡中名 — 香港 SFC 只發英文 + 繁中。任何「從 SFC 拉簡中」方案不存在。

## Consequences

### Positive

- zh-Hans 用戶看到真正的簡中 broker 名稱（不再是繁中 fallback）
- 對 cross-border 用戶（中港跨境 + 大陸 KOL，per `docs/00-vision.md`）的市場立即提升體驗
- 跟 cursor rule 51 §模式 A 結尾預留的「未來若擴增第三語」路徑一致，沒有破壞 contract
- nullable 設計讓 admin 未來可手動 override OpenCC 個別誤判
- OpenCC 是純函式 + offline-friendly，不引入新 runtime 依賴（Pinata / DeepL / Privy 等都不變）

### Negative

- DB schema 加 1 列、API payload 多 1 列 — 些微 storage / bandwidth 成本，可忽略（一個 broker 名 < 64 bytes）
- 對少數專有名詞 OpenCC 可能誤判 — 用 admin override 緩解，但 admin override UI 不在本 ADR 範圍
- 建立了「broker 是 i18n 第一公民」的先例 — 未來 KOL nickname / license series 加 i18n 時必須評估到底走 A 模式（再加列）還是升級 B 模式（共用 translation 表），需要新 ADR

### Neutral

- OpenCC 的 zh-Hans output 預設用 t2s.json — 大陸標準。如果未來要支援「香港簡體」（少見的混合體），需要新 ADR + helper 分支
- backfill 對 prod 是 ~5000 row 的 update — 在 RDS 上是秒級操作，不影響 service availability

## Implementation Notes

### 6-commit plan (推薦順序)

1. **`feat(db)` add `displayNameZhHans` column + migration**
   - schema patch + Prisma migration `add_broker_display_name_zh_hans`
   - column nullable，無 default，無 index（broker 不會用 zh-Hans name 做 search）

2. **`feat(shared)` extend localizedBrokerName helper for zh-Hans**
   - `LocalizedNameInput` 加 `displayNameZhHans?: string | null`
   - helper 加 `if (locale === 'zh-Hans')` 分支，fallback 鏈正確
   - 註解更新：寫明 zh-Hans 路徑 + null 時行為

3. **`feat(db)` OpenCC backfill script + sync-brokers integration**
   - `pnpm add opencc-js -w packages/db`
   - `packages/db/scripts/backfill-zh-hans.ts` 一次性腳本：讀所有 broker → OpenCC `t2s` → upsert displayNameZhHans → log 統計（轉了 N 筆 / 失敗 M 筆）
   - `packages/db/src/sfc/sync-brokers.ts` 在 upsert broker 時跑 OpenCC 自動填 displayNameZhHans
   - 跑 backfill on dev DB 驗證

4. **`feat(api)` ship displayNameZhHans on every endpoint**
   - 9 個 endpoints 的 payload 都加 displayNameZhHans
   - `apps/api/src/shared/brokerHydration.ts` `BrokerNameMeta` 加列
   - `localizedBrokerName` helper signature 已升級，consumers 自動繼承

5. **`feat(web,console)` types + verify all consumers**
   - `apps/web/src/lib/api/client.ts` + `apps/console/src/lib/api/client.ts` 所有 broker 引用 type 加 `displayNameZhHans: string | null`
   - components 不需動（都已 pipe 進 helper，helper 內部已升級）— 但要在 UI 上實際切到 zh-Hans 跑一遍 sanity check

6. **`docs(rules)` rule 51 升級 ship 三列 + status doc + ADR cross-link**
   - cursor rule 51 §模式 A § A2 改成 ship 三列
   - rule 51 嚴禁清單對應升級
   - `docs/03-status.md` 把 zh-Hans 從待決策移到已完成
   - ADR-0026 status 從 Proposed → Accepted（如果寫的時候是 Proposed）

### 操作風險

- **OpenCC dependency size**：`opencc-js` 約 1.5 MB（含字典），對 `packages/db` build 沒影響因為只在 backfill / sync 腳本用，不進 production runtime bundle
- **Backfill failure 處理**：腳本必須 idempotent — 如果中途失敗（DB connection drop、OOM），重跑只 update 還沒填的 row。寫法：先 `findMany where displayNameZhHans IS NULL`
- **prod backfill 排程**：dev 跑完驗證 → 寫 ADR / status update → 安排 prod 跑（建議跟下次 SFC sync 一起跑，無 downtime）

### 後續 follow-up（不在 6-commit 內）

- 何時做 admin override UI（讓營運手動修 OpenCC 誤判）— 等真有 case 時再做
- ECS Scheduled Task / EventBridge 上的週期性 SFC sync（per ADR-0020）已在 dev 啟用 — 確認新 broker 進來時 displayNameZhHans 會自動填
- 跟 next-intl 的 `zh-Hans` locale 設定保持一致 (per ADR-0003)

## References

- [ADR-0003: i18n strategy（zh-Hant default + zh-Hans + en）](./0003-i18n-strategy.md)
- [ADR-0023: UGC translation via DeepL](./0023-ugc-translation-deepl.md) — 對照 Translation Table 模式
- [cursor rule 51 §模式 A](../../.cursor/rules/51-i18n.mdc) — broker name display contract
- [packages/shared/src/i18n/brokerName.ts](../../packages/shared/src/i18n/brokerName.ts) — canonical helper
- [`docs/03-status.md`](../03-status.md) — 進度
- OpenCC: <https://github.com/BYVoid/OpenCC>
- opencc-js: <https://www.npmjs.com/package/opencc-js>
