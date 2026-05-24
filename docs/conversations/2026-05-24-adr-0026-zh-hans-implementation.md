# ADR-0026 zh-Hans Broker Name Strategy 6-Commit Implementation — 2026-05-24

> 本文件歸檔 OpenTrade 項目「ADR-0026 zh-Hans broker name strategy」六個 atomic commit 落地的 session 過程，
> 重點不是「做了什麼」（status doc / ADR / commit messages 已詳述），而是「為什麼這樣做」與「踩到的雷 / 學到的教訓」。

## 對話脈絡

- **日期**：2026-05-24（同日上下半場）
- **參與者**：項目負責人 + Claude Opus 4.7
- **背景**：上 session（[`2026-05-24-broker-name-i18n-and-zh-hans.md`](./2026-05-24-broker-name-i18n-and-zh-hans.md)）拍板 ADR-0026 方案 A 並列出 6-commit 計畫；本 session 唯一任務是按 ADR Implementation Notes 執行落地

## 已 ship 的 6 個 commit（簡表）

| Commit | Hash      | Scope                                                          |
| ------ | --------- | -------------------------------------------------------------- |
| c1     | `b9f82a6` | `feat(db)` — `Broker.displayNameZhHans String?` + migration    |
| c2     | `09bfd72` | `feat(shared)` — `localizedBrokerName` 加 zh-Hans 分支         |
| c3     | `0909f74` | `feat(db)` — opencc-js + sync-brokers 自動轉 + backfill script |
| c4     | `31f3bd4` | `feat(api)` — 10 endpoint payload 加 displayNameZhHans         |
| c5     | `54eb4e4` | `feat(web,console)` — 兩 app types + 10 component props        |
| c6     | `37aa9c9` | `docs(rules,status,decisions)` — rule 51 升三列 + 收尾         |

詳見 `docs/03-status.md` 的「Phase 1: ADR-0026 zh-Hans broker name strategy 實作」段。

## 主要學到的教訓（給未來 AI agent）

### 1. OpenCC：對法人名要明確選 `t → cn`，不是 `hk → cn`

`opencc-js@1.3.1` 支援多種繁中變體（`t`、`hk`、`tw`、`twp`）。本 session 一度考慮用 `hk → cn` 因為 SFC 來源是港繁，但實測對「匯豐證券」「中銀國際」這類法人名兩者結果一致 —— 港繁與通用繁體在金融法人名稱上沒有差異。

ADR-0026 D2 已固化 `t → cn`：

- 對法人名準確率近 100%
- 跨來源穩定（將來若 broker 來自非 SFC 來源，繁中可能不是港式）
- OpenCC dictionary 文件本身把 `t2s.json` 標為「通用繁→簡」，最 baseline 的選擇

**未來 agent 不要為了「更精確」改成 `hk → cn`**：對 OpenTrade 的場景沒有 payback，但會在跨來源 broker 引入轉換不一致。

### 2. Backfill script：cursor-based pagination 在 mutable WHERE clause 下會跳行

最初寫法（壞）：

```ts
// ❌ 這個寫法在 WHERE displayNameZhHans IS NULL 上會漏行
let cursor: string | undefined = undefined;
while (true) {
  const page = await prisma.broker.findMany({
    where: { displayNameZhHans: null },
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
  });
  if (page.length === 0) break;
  // ... update each ...
  cursor = page[page.length - 1]?.id;
}
```

**為什麼漏行**：當你 update 一行的 `displayNameZhHans` 後，它就**不再滿足 WHERE 條件**，下次查詢的 result set 整個往前縮 —— 但你的 cursor 還停在「上一頁最後一筆 id」，於是 `skip: 1` 就跳過了「應該是新一頁第一筆」的那一筆。本 session 在 dev 上實測漏了 17 筆。

修法（好）：

```ts
// ✅ 永遠抓「目前還是 null 的前 N 筆」，搭配 stall guard 防止 OpenCC 失敗造成的死循環
while (true) {
  const page = await prisma.broker.findMany({
    where: { displayNameZhHans: null },
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
  });
  if (page.length === 0) break;

  const populatedBefore = result.converted;
  for (const broker of page) {
    /* ... update or skip ... */
  }
  if (result.converted === populatedBefore) break; // stall guard
}
```

**規則**：任何 backfill script 只要 update 後會改變 WHERE 條件結果（mutable WHERE），就**不能**用 cursor pagination；要用「重複抓前 N 筆未處理」。代價是若整批都 skip（OpenCC 全失敗）會永遠跑，所以加 stall guard（記錄這輪 converted 是否有增長）。

### 3. commitlint footer trailer 偵測陷阱：body 中的 `<word> #<number>` 會被當 issue ref 切走

c3 commit message 一度寫 `... Commit 4 will ship ...`，commitlint 把 `Commit 4` 當成 issue 引用切到 footer，然後 `footer-leading-blank` 紅燈。

同理：

- `Token: foo` 也會被當 footer trailer（`Key: value` 格式）
- 列表用 `1.`、`2.` 是安全的；`- foo`、`* foo` 也安全
- 改用「the next commit」、「Phase 1」、「commit number 5」避開 `<word> #<number>` 模式

**規則 70 應該補一條**？暫不加 —— `.cursor/rules/70-commit-pr.mdc` 已有「Commit body 注意事項」段提到 `<word> #<number>` 與 `Key: value` 兩個地雷。但若再出現第三次違反，就應該升級為紅線。

### 4. hand-rolled props type 必須列三列：TS 接受但執行時 silent fallback

最危險的雷：很多 component 不直接消費 `BrokerListItem`（API client 完整型別），而是 hand-roll 一個窄型別當 props：

```tsx
// VerifyForm.tsx — 範例
type Broker = {
  slug: string;
  displayName: string;
  legalName: string | null;
  // ❌ 漏 displayNameZhHans
};
```

然後 `localizedBrokerName(broker, locale)` 對 zh-Hans 讀者悄悄走 fallback 到 `displayName`（繁中）。
TypeScript 不會抓到，因為 helper signature `LocalizedNameInput.displayNameZhHans` 是 `string | null | undefined` —— `undefined` 是合法的（partial select 場景需要）。

**解法**：rule 51 §A3 加紅線「hand-rolled props 型別必須列三列」。本 session 巡完 10 個這類 component（VerifyForm、BrokerDirectory、BrokerDetailTabs、settings/page、verify/page、brokers/page、UsersClient BrokerPills、VerificationsClient table+modal+verified-list）。

**未來 agent 接新 endpoint / 寫新 component 時要 grep**：

```bash
rg 'displayName: string' apps/web apps/console --type tsx
# 任何 hit 都要對照確認也有 displayNameZhHans + legalName
```

### 5. 不要為了「locale-blindness」改 admin/activity feed

`GET /v1/admin/activity` 回的 description 是 server-rendered 字串（中文寫死），目前不是 locale-aware。本 session 故意**不**碰它，原因：

- ADR-0026 scope 是「broker 名字」，activity feed 的 locale 問題是另一個 ADR 範圍
- 改 activity feed 要先決定：(a) 改回 raw event payload 讓 frontend 自己翻譯、或 (b) admin event log 接受永遠中文（因為 admin 預設中文 locale）
- 這是個 design decision，不適合搭便車進 ADR-0026 commit

**已加進 status doc** `下一步` 段（item 9 之後）作為 follow-up。

### 6. ADR-0026 的「Production DB backfill」不是緊急事項

ADR-0026 implementation notes step 6 要求 prod RDS 也跑一次 `db:backfill:zh-hans`。本 session 只 backfill dev DB（3482 broker 全綠）。

**為什麼 prod 不急**：

- c3 已把 `sync-brokers.ts` 接上 OpenCC，prod 下次 SFC sync（每週日 03:00 HKT，per ADR-0020）會自動轉新 broker
- prod 上既有 broker 的 `displayNameZhHans` 確實為 null，但 helper 會 fallback 到繁中（不是 crash）
- 簡中讀者目前在 prod 仍會看到繁中，但已知症狀，不影響功能
- 等下個 deploy 視窗一起跑（per status doc 下一步 #9）

## 產生的 ADR

- **無新 ADR**。本 session 純落地 ADR-0026，沒有新決策。

## 待後續處理事項

詳見 `docs/03-status.md` 「下一步」與「待決策」段更新後的內容。重點：

1. Production DB zh-Hans backfill（等 dev 驗證 OK + 下次 deploy 視窗）
2. E2E 測試加新測試點：切到 zh-Hans 確認 broker 名稱顯示簡體
3. （非本 session 範圍）admin/activity feed 的 locale-blindness 改造

## 給未來 AI agent 的建議

1. **新增 broker reference 的 API endpoint 時**：永遠記得 `select` + 回傳裡放 `displayName` + `displayNameZhHans` + `legalName` 三列。Rule 51 §A2 是紅線。如果該 endpoint 用 slug-key（沒 FK relation 可 include），呼叫 `apps/api/src/shared/brokerHydration.ts#hydrateBrokerNames(slugs, tenantId)`，它已經 select 三列。

2. **新增 broker 顯示 UI component 時**：
   - 不要直接 render `b.displayName`、`b.displayNameZhHans`、`b.legalName`、`b.slug` — 一律 pipe 進 `localizedBrokerName(b, locale)` from `@opentrade/shared`
   - 不要 inline `locale === 'zh-Hans' ? ... : ...` — 會跟 helper 不同步
   - 如果有 hand-rolled props type（很常見），列**三列**而非兩列

3. **新增 `t` / `cn` 以外的繁簡變體**：直接寫 ADR 改 ADR-0026 D2 而非用 ad-hoc converter；否則跨 broker 來源會不一致。

4. **將來真要走方案 B 或 C**（per ADR-0026 alternatives）：方案 A 的 `displayNameZhHans` column 可以 drop（rollback migration），不會卡住任何路徑。

5. **Backfill script 通則**：
   - 如果 update 會改 WHERE 條件結果 → 用「重複抓前 N 筆未處理」+ stall guard
   - 如果 update 不會改 WHERE 條件 → cursor pagination 也安全
   - **永遠加 stall guard**，因為任何一筆失敗都可能造成「同樣的前 N 筆永遠拿回來」

## 與其他 ADR/conversation 的關係

- 直接 prequel：[`2026-05-24-broker-name-i18n-and-zh-hans.md`](./2026-05-24-broker-name-i18n-and-zh-hans.md)（方案拍板過程）
- 上游 ADR：[ADR-0026](../decisions/0026-zh-hans-broker-name.md)（本 session 已 mark Implemented）
- 相關 cursor rule：[rule 51 §模式 A](../../.cursor/rules/51-i18n.mdc)（本 session 已升 ship 三列）
- 對照組 ADR：[ADR-0023 UGC translation DeepL](../decisions/0023-ugc-translation-deepl.md)（review body 走 translation table 而 broker name 不走 — 在 ADR-0026 alternatives 已論證）
