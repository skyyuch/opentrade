# M7 Execution Pt.2 — Complaints Separation Frontend + Tests (2026-05-26)

> 本文件歸檔 OpenTrade 項目 2026-05-26 M7 milestone execution session（下半段）的精華內容。
> 接續 [M7 pt.1](./2026-05-26-m7-execution-pt1.md) handoff，完成 14-milestone 計畫第 8 個 milestone（M7 — Complaints separation per ADR-0029）的下半段：API 補丁 + EvidenceUpload UI primitive + ComplaintForm web component + broker detail aggregate split + 第三 tab + 完整測試 pack，共 5 個 atomic commit + 1 個 status wrap + 1 個 hash 校正補丁。**M7 全 12 commits 完成，14-milestone 計畫進度 8/14 / 38/70 atomic commits。**

## 對話脈絡

- **日期**：2026-05-26（接 M7 pt.1 handoff 同日繼續，user 用 `8ba21db` handoff commit 開新 session）
- **參與者**：項目負責人 + AI agent
- **AI 模型**：Claude Opus 4.7（pt.1 完成 7 commits 後切新 session 從 conversation summary 接手）
- **背景**：14-milestone 計畫第 8 個 milestone 的下半段 — Complaints separation per [ADR-0029](../decisions/0029-complaints-vs-reviews-separation.md) 已完成後端 + admin（M7.0-M7.4），剩消費者前端 ComplaintForm + EvidenceUpload primitive + broker detail 第三 tab + tests + i18n。
- **前置狀態**：M0-M7 上半 7 commits 完成 = 31/70 atomic commits；API `POST /v1/complaints` + 公開 read 兩 endpoint + admin verify/reject 三 endpoint 已 ship；console `/admin/complaints` 已可瀏覽（等待 ComplaintForm 後可全鏈路煙測）。

---

## 主要討論內容（按主題分節）

### 1. Session 啟動 + pre-flight 8 件文件 review

User 啟動 session 時要求依序讀 10 份文件並以固定格式回報，包括：

- `AGENTS.md` / `docs/00-vision.md` / `docs/03-status.md`（pt.1 結尾狀態）
- `docs/02-roadmap.md` / 14-milestone plan
- ADR-0028 / ADR-0029 / STAGING.md
- M7 pt.1 conversation archive

AI agent 回報「我已掌握當前項目狀態：M7 上半 7/9 commits 完成（DB schema + outbox + API DDD 三 commit + console admin），下半 5 commits（M7.5b/M7.5c/M7.6a/M7.6b/M7.7）+ 1 個 M7.5a API 補丁（zod 對齊 UI spec）。當前 Phase：1 polish ~99% + 14-milestone 7/14 / 31/70 atomic commits。下一步預期：M7.5a → M7.5b → M7.5c → M7.6a → M7.6b → M7.7。」

User 確認後說「開工吧」。

### 2. M7.5a 補丁的發現 — UI spec 與 API zod 不一致

AI agent 在 M7.5c 規劃階段（寫 ComplaintForm 前）對照 API zod schema 與 UI spec 發現：

| 欄位                   | API zod 現況（M7.3b 寫的）   | UI spec                    | 不一致          |
| ---------------------- | ---------------------------- | -------------------------- | --------------- |
| `title`                | required                     | optional max 80            | 必須改 optional |
| `body`                 | max 5000 chars               | max 2000 chars             | 必須縮          |
| `evidence` 檔案大小    | ComplaintEntity JSDoc 寫 5MB | 與 `/verify` 共用 10MB     | 文件不一致      |
| `evidenceIpfsCid` MIME | JSDoc 只列 PNG/JPG/PDF       | 與 `/verify` 共用，含 WebP | 缺 WebP         |

決議：拆獨立 `M7.5a feat(api)` 補丁，與 M7.5b/c 同 session 一起 commit 但不混進其他 atomic 單位：

#### M7.5a commit `a474b98` `feat(api): relax complaint title and align body bounds for M7.5 form`

- `apps/api/src/domains/complaints/presentation/routes.ts`：
  - `title: z.string().max(80).optional()`（從 required 改 optional + max 從 200 縮 80）
  - `body: z.string().min(10).max(2000)`（max 從 5000 縮 2000）
- `apps/api/src/domains/complaints/domain/ComplaintEntity.ts`：JSDoc 注明 `title?` 缺省會在 presentation 層 coerce 為空字串（與 DB VARCHAR(200) NOT NULL 一致）
- `packages/db/prisma/schema.prisma`：`evidenceIpfsCid` JSDoc 校正 5MB → 10MB + 加 WebP MIME

**設計重點**：title 在 presentation 層 coerce undefined → '' 而非 zod transform — zod transform 會把 input type 改變，呼叫端必須跟著改；coerce 在 presentation 層讓 use case + repo 看到的型別保持 `string`（非 nullable），最少擾動。

### 3. M7.5b — EvidenceUpload primitive + axe-core 重構

#### M7.5b commit `6d476bb` `feat(ui): add EvidenceUpload primitive for verify and complaint flows`（~700 行 diff，atomic-but-large）

借 SentimentPicker（380 行 with stories）+ M5.1 / M6.0 / M6.2a 先例 — primitive 423 行 + stories 188 行 + tests 142 行三檔不能拆。

`packages/ui/src/primitives/evidence-upload/EvidenceUpload.tsx` 主要設計：

- **3-state state machine**：`idle`（顯示 drop zone + click to upload）/ `uploading`（顯示 spinner + 進度 label）/ `uploaded`（顯示 thumbnail/icon + filename + 「移除」CTA）
- **caller-supplied labels**（per rule 10 不引 next-intl）— 由 apps 注入 i18n strings
- **兩 theme cva**：`semantic`（console light theme — success/muted/danger tokens）/ `neon`（web dark theme — `#00FF88` accent + slate）
- **drag-drop 偵測**：`onDragOver` + `onDragLeave` + `onDrop` 三 handler；drag 進入時顯示 `data-drag-over="true"` + 視覺反饋
- **圖片 thumbnail preview**：PNG/JPG/WebP 透過 `URL.createObjectURL` + cleanup `URL.revokeObjectURL` on unmount
- **PDF/未知 MIME**：fallback icon

#### Axe-core 違例與重構

**早期 prototype**（被本 session 改掉的版本）：

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={() => inputRef.current?.click()}
  onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
>
  <input ref={inputRef} type="file" className="hidden" />
  {/* drop zone label + icon */}
</div>
```

**Axe-core 報雙違例**：

1. **`nested-interactive`** — `<div role="button">` 不能含 `<input type="file">`（input 本身是 interactive）
2. **missing accessible name** — `<input>` 沒有關聯 label

**重構為 W3C 推薦 pattern**：

```tsx
<label htmlFor={inputId} className="...drop-zone styling...">
  <input
    id={inputId}
    type="file"
    className="sr-only" // visually hidden but focusable
    onChange={handleFileChange}
  />
  {/* drop zone label + icon */}
</label>
```

**好處**：

- 原生 `<label>`-`<input>` 雙向連動 — click label 觸發 file picker / focus label 等同 focus input
- Enter/Space 透過 input 原生 keyboard handling
- 無需手寫 `onClick` / `onKeyDown` / `tabIndex` / `role`
- axe-core 0 violations 跨兩 theme
- drag-drop 仍走 label 的 `onDrop` handler 與 input 無關

#### Storybook 9 stories + 24 tests

`EvidenceUpload.stories.tsx`：Idle / Uploading / UploadedImage / UploadedPdf / UploadedNoPreview / Disabled / SemanticTheme / NeonTheme / Localised / ClickFlow（with `userEvent.upload`）

`EvidenceUpload.test.tsx` 24 tests：

- 3-state 渲染
- drag-drop 偵測（`fireEvent.dragOver` + `fireEvent.drop`）
- MIME/size client 端 guard
- axe-core 0 violations 跨兩 theme（`@axe-core/react` jsdom）

#### 遇到的細部錯誤

| 錯誤                                                                                                | 修法                                                                         |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `TS2742` — `meta.args: { onFileSelect: fn() }` 在 Storybook portable type 推斷 fail                 | 把 `fn()` 從 `meta.args` 移到個別 stories 的 `play` function                 |
| `@typescript-eslint/no-non-null-assertion` — auto-fix 把 type assertion 改成 non-null assertion     | 改用 explicit type guard（`if (!(el instanceof HTMLInputElement)) return;`） |
| `TS2379` / `TS2339` — `querySelector` 回 `Element \| null` 不能直接讀 HTMLElement-only properties   | 用 generic：`container.querySelector<HTMLInputElement>('input[type=file]')`  |
| test assertion `expect(input.className).not.toContain('hidden')` 誤判（`overflow-hidden` 也 match） | 改用 `expect(input.classList.contains('hidden')).toBe(false)`                |

### 4. M7.5c — ComplaintForm + 新 submit page

#### M7.5c commit `7962caa` `feat(web): add complaint submission page and form for broker pages`（~830 行 diff，atomic-but-large）

User 確認單一新 feature（client + page + types + i18n 不應拆）— 借 VerifyForm（1087 行單檔）先例。

新 route `/[locale]/brokers/[slug]/complaints/new`：

**(a) `apps/web/src/lib/api/client.ts`**：

- `submitComplaint(token, input): Promise<SubmitComplaintResponse>` thin wrapper
- `ComplaintSentiment` / `SubmitComplaintInput` / `SubmitComplaintResponse` types
- Reuse `uploadVerifyEvidence(token, file)` 既有 endpoint（per ADR-0029 D3 — 投訴與 SBT 驗證共用 Pinata pipeline，web 端永不直連 Pinata per rule 50）

**(b) `ComplaintForm.tsx`（463 行）client component** — 多 state machine 設計：

```ts
type ViewMode =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'requires-sbt' }
  | { kind: 'ready' }
  | { kind: 'success'; complaintId: string };

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'uploaded'; cid: string; mimeType: string; filename: string }
  | { status: 'error'; message: string };

type FormState =
  | { phase: 'editing' }
  | { phase: 'submitting' }
  | { phase: 'error'; message: string };
```

- **viewMode** gate by Privy auth + L2 SBT tier
  - `loading` 等 Privy + auth bootstrap
  - `unauthenticated` 顯示 sign-in CTA
  - `requires-sbt` 顯示「先去 verify a broker」CTA link `/verify`（友好 UX vs 提交後拿 403 — 後端仍會守 reviewer middleware 但 UX 不應讓 user 走到那邊才知道）
  - `ready` 顯示 form
  - `success` 顯示 confirmation card + 「回到 broker page」link
- **uploadState** 分離自 formState — upload 成功後 CID + MIME + filename 暫存讓 form 可獨立編輯 body / sentiment 而不重 upload
- **formState** 收 server-side error；error message 走 `translateApiError` 兩層 i18n（per M5.7 + ADR-0027 設計 — server 的英文 message 只進 log，UI 一律顯 i18n copy）
- M10 商戶公開回應 `respondsToReviewId` 預留欄位**本 form 不暴露**（per ADR-0029 D6 + STAGING.md S8 等 M10）

**(c) `app/[locale]/brokers/[slug]/complaints/new/page.tsx`（153 行）server component shell**：

- 抓 broker 三語名（per cursor rule 51 + ADR-0026）
- 渲染 `<ComplaintForm broker={...} labels={...} />`
- 「投訴 ≠ 評論」explainer sidebar：
  - 證據要求（PNG/JPG/PDF/WebP + 10MB cap）
  - 平台審核流程（OPEN → admin verify → VERIFIED / REJECTED）
  - 永久記錄聲明（rule 00 — 不會被平台刪除，即使駁回 admin note 也公開）

**(d) 三 locale messages 各加 43 鍵** 覆蓋全 form。

#### 遇到的細部錯誤

| 錯誤                                                                          | 修法                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `TS2786` — async React component 在 JSX 不支援（Next 14 server context 限制） | 把 `ComplaintExplainer` 從 async component 改 sync helper function 接 `t` prop |
| `TS6133` — unused import `ApiClientError`                                     | 移除（error message 統一走 `translateApiError`，不需直接 import error class）  |

### 5. M7.6a — broker detail aggregate split（投訴污染修復）

#### 發現的 silent bug

AI agent 在 M7.6a 規劃時跑 grep 對 `prisma.review.findMany` / `_count.reviews` 用法，發現 **M7.3a complaint 寫入後所有 broker detail aggregate 都被投訴污染**：

- complaint 在 DB 用 `kind=COMPLAINT` 但仍是 Review row
- complaints 預設 `rating: 1`（per M7.3a 滿足 ADR-0028 D6 NOT NULL deprecation window）+ `sentiment: NEGATIVE`（per M7.5a + ComplaintForm 強制三選一通常選 NEGATIVE）
- 既有 broker detail `reviewCount` / `positiveRate` / `sentimentAggregate` / `ratingDistribution` 全部沒過濾 kind → **每筆投訴會讓 broker score 灌一筆 1星 + NEGATIVE**

#### M7.6a commit `7c211be` `feat(api): split broker aggregates by review/complaint kind`（~131 行 diff）

修法分 6 個 surface：

**(a) `GET /v1/brokers` (list)**：

```ts
prisma.broker.findMany({
  include: {
    reviews: { where: { kind: 'REVIEW' }, ... },
    _count: { select: { reviews: { where: { kind: 'REVIEW' } } } },
  },
});
```

**(b) `GET /v1/brokers/:slug` (detail)**：同 narrowing + 新 `verifiedComplaintCount: number`：

```ts
const verifiedComplaintCount = await prisma.review.count({
  where: {
    tenantId,
    brokerId: broker.id,
    kind: 'COMPLAINT',
    verifiedAt: { not: null },
    // ⚠️ rejected 投訴 per rule 00「reject != delete」**不計入** headline 紅燈訊號
    // rejected row 仍可見於投訴 tab 內但不拉公開信譽訊號
  },
});
```

**(c) `GET /v1/brokers/:slug/owner-stats` (商戶 dashboard)**：三條 count/find 全加 `kind=REVIEW` 避免投訴灌水 — user spec 沒提，但 invariant 一致才不會留漏

**(d) similarBrokers `_count`** 同處理

**(e) `IReviewRepository.ReviewListOptions`** 加 optional `kind` field；Prisma adapter 預設 `'REVIEW'`：

```ts
async listByBroker(options: ReviewListOptions) {
  const kind = options.kind ?? 'REVIEW';  // ⚠️ 舊「不過濾」改成「預設 REVIEW」
  // M7.3a 後唯一 silent 拉投訴的路徑被堵住
  return prisma.review.findMany({ where: { ..., kind }, ... });
}
```

**(f) `GET /v1/reviews/broker/:slug`** 加 `?kind=REVIEW|COMPLAINT` query 過濾預設 REVIEW（admin tooling symmetry — canonical complaint read 走 `/v1/complaints/broker/:slug`，但 review 端點接受 kind override 給 admin tool 用）

**(g) `apps/web/lib/api/client BrokerDetail` 加 `verifiedComplaintCount: number` 型別 + e2e api-stub 加預設值**（M7.6a 純後端但 web e2e fixture 必須跟著加給 M7.7 e2e 用）

#### 設計重點

- M7.6a 唯一額外做的是 **owner-stats + similarBrokers `_count` 也加 kind=REVIEW 過濾**——M7.3a 後沒任何路徑被刻意暴露在沒過濾的舊行為，比 user spec 多做一步但 invariant 一致才不會留漏
- `IReviewRepository.listByBroker` default 從「不過濾」改「預設 REVIEW」 — TypeScript 編譯期沒有壞 case（option 是 optional），但 runtime 行為改了；需要在 commit message 明示 + 未來呼叫端要拉 complaint list 一定要 explicit pass `kind: 'COMPLAINT'`

### 6. M7.6b — broker detail 第三 tab

#### M7.6b commit `84ef125` `feat(web): add complaints tab to broker detail page`（~511 行 diff，atomic-but-large）

第三 tab + 三 sub-component + 三 locale block 單一 feature 不應拆。

**Tab 重構**：

```ts
type Tab = 'reviews' | 'licenses' | 'complaints'; // 加第三 tab

type TabDescriptor = {
  id: Tab;
  labelKey: string;
  pill?: {
    count: number;
    variant: 'neutral' | 'danger'; // 投訴 tab pill 顯示 verifiedComplaintCount
    // > 0 紅（danger） / = 0 灰（neutral）
  };
};
```

`TabBar` 改 `overflow-x-auto no-scrollbar` 讓四 tab 在窄螢幕優雅捲動。

**新 `ComplaintsTab` 三段**：

**(a) `ComplaintsSummaryCard`**：

- Headline `verifiedCount`（紅色大字 if > 0 / 綠色大字 if 0 + 「平台已驗證 0 件投訴」訊息）
- 副 chip `openCount`（amber）+ `rejectedCount`（grey）
- 「File a complaint」CTA → `/brokers/:slug/complaints/new`（per rule 51 + next-intl `<Link>` 自動加 locale prefix）

**(b) 列表 disclaimer**：注明三狀態 verdict 模型 + reject ≠ delete 承諾 + 評論與投訴的差異說明

**(c) `ComplaintCard` 每筆 row**：

- Status badge：orange OPEN / red VERIFIED / grey REJECTED
- Source locale pill（per ADR-0027 — author-original 語言標記）
- Body 全文（**rejected row body 仍可見** — rule 00）
- REJECTED 列顯示 inline「Platform note on rejection」block（per ADR-0029 D4 公開展示 admin 拒絕理由）
- Evidence IPFS link `target=_blank rel=noopener`
- Content hash chip（可點開查 keccak256）
- VerifiedAt 日期（when applicable）

#### `deriveComplaintStatus()` 公開到 `lib/api/client.ts`

**設計理由**：未來 M10 商戶後台 complaint inbox 也會需要這個 status 映射 — 把它 co-locate 在 client.ts 而不是埋在 ComplaintCard.tsx 內，single source of truth：

```ts
export function deriveComplaintStatus(c: ComplaintItem): ComplaintStatus {
  if (c.verifiedAt) return 'VERIFIED';
  if (c.adminNote) return 'REJECTED';
  return 'OPEN';
}
```

`fetchBrokerComplaints()` + `ComplaintItem` / `BrokerComplaintsResponse` / `ComplaintStatus` types 同檔。

**Server page 並行 fetch**：

```ts
const [broker, reviews, complaints] = await Promise.all([
  fetchBroker(slug),
  fetchBrokerReviews(slug),
  fetchBrokerComplaints(slug),
]);
```

`revalidate: 0` 確保 verify/reject 翻轉立即出現（投訴狀態變化是用戶可感知的 trust signal）。

三 locale 各加 13 鍵 brokerDetail + 12 鍵新 `complaintCard` namespace。

### 7. M7.7 — 完整測試 pack

#### M7.7 commit `dea6f64` `test(api,web): cover complaint use cases, form state machine, and read-path e2e`（~1189 行 diff，純測試 — rule 96 例外條款接受）

三層覆蓋：

#### API 三 use case 31 tests

**(a) `SubmitComplaintUseCase.test.ts` 11 tests**：

- IPFS payload v2-for-complaint shape（version=2 + kind=COMPLAINT + evidenceIpfsCid + sentiment 全 carry）
- 不在 IPFS 的欄位（sourceLocale + tenantId 只在 DB / response）
- M7.5a 空 title 契約（undefined title coerce 為 ''）
- keccak256 hash 確定性（same input → same hash）
- Pin name format `complaint-<timestamp>`
- Repo hand-off（IPFS pin 完才呼叫 repo.create）
- OPEN-state defaults（verifiedAt null + adminNote null）
- IPFS port 錯誤傳播（pin 失敗則不寫 DB）
- Repo port 錯誤傳播（DB 寫失敗則拋 + 但 IPFS pin 已成 — outbox pattern 接受 dangling pin）

**(b) `VerifyComplaintUseCase.test.ts` 12 tests**：

VERIFY 分支（5 tests）：

- 404 when not found
- Call shape（kind: 'verify' + verifiedByUserId）
- VerifiedAt timestamp within reasonable window
- Already-verified idempotent（re-verify 更新 verifiedByUserId 但不拋）

REJECT 分支（6 tests）：

- 404 when not found
- adminNote < 5 char rejected
- adminNote all-whitespace rejected
- adminNote > 500 char rejected
- adminNote leading/trailing whitespace trim
- Call shape（kind: 'reject' + adminNote trimmed）

**「rule 00 reject != delete」mutation contract 守護**（1 dedicated test）：

- Reject mutation payload assertion — 永不帶 `body` / `title` / `evidenceIpfsCid` / `deletedAt`
- 是「未來如果有人加 reject-also-clears-evidence 邏輯」這個 regression 的 explicit guard

**(c) `ListComplaintsUseCase.test.ts` 8 tests**：

- Full filter pass-through（status / brokerSlug / limit / offset）
- Undefined fields 不 coerce
- Status enum table-test（OPEN/VERIFIED/REJECTED/ALL/undefined 各自正確 forward）
- Repo result by reference（per rule 10 — 不在此 layer mapping，給 presentation layer 自行決定）

#### Web ComplaintForm 11 tests (`ComplaintForm.test.tsx`)

ViewMode state machine（3 tests）：

- Unauthenticated → render sign-in CTA + login() callback
- Requires-SBT（sbtTier != L2）→ render「先 verify a broker」CTA
- Ready → render form

Upload client validation（3 tests）：

- 不支援 MIME → reject without API call
  - **遇到的 bug**：原 test 用 `userEvent.upload(input, file)` 對不支援 MIME 預期 reject — fail 因 jsdom 預設遵守 `accept=".png,.jpg,.webp,.pdf"` 直接過濾掉檔案，component 自己的 MIME validation 沒機會跑
  - **修法**：加 `{ applyAccept: false }` 繞過 jsdom accept gate，讓 component 的 validation 跑
- > 10MB 預先拒（Pinata 呼叫前）
- 有效檔走 `uploadVerifyEvidence` → drop zone 變 uploaded state

Submit 閘門（1 test）：

- Button disabled until evidence + body + sentiment 三者齊備

Submit 生命週期（4 tests）：

- Trimmed payload 正確結構（body trim + 空 title 不送 field）
- Success render（form 變 success card）
- Empty title omitted from payload（per M7.5a 契約）
- RATE_LIMIT_EXCEEDED localized copy
  - **遇到的 bug**：原 test mock `ApiClientError` with code `'RATE_LIMITED'` + message `'Too many submissions — try again later'`，預期 UI 顯示 raw message — fail 因 UI 走 `translateApiError`：(a) `RATE_LIMITED` 不是 errorMessage.ts 認得的 code（正確是 `RATE_LIMIT_EXCEEDED`）+ (b) 即使 code 對 UI 也顯 i18n copy「You're going a bit too fast」而非 server message
  - **修法**：改用 `RATE_LIMIT_EXCEEDED` + assert 對 i18n copy `/You're going a bit too fast/`

#### Playwright e2e 3 tests (`complaint-read-path.spec.ts`)

api-stub fixture 擴展：

- 加 3-row complaints array（OPEN + VERIFIED + REJECTED）
- 把 `verifiedComplaintCount` 從 0 → 1
- 新 `GET /v1/complaints/broker/:slug` stub endpoint

**(t1) 紅 pill 顯示**：點開 broker detail page，第三 tab pill 顯示 count "1" + 紅色（danger variant）；點 tab 展開 ComplaintsSummaryCard

**(t2) 三狀態 badge 各渲染一次 + rule 00 守護**：

- VERIFIED badge（red）render once
- REJECTED badge（grey）render once + inline「Platform note on rejection」block 渲染 adminNote
- OPEN badge（orange）render once
- **rule 00 assertion**：rejected row body 仍可見（不被 admin reject 隱藏）

**(t3) CTA navigation**：「File a complaint」CTA href = `/en/brokers/:slug/complaints/new`（next-intl 加 locale prefix）

#### 測試總計躍升

| Layer                | Before M7.7 | After M7.7 |
| -------------------- | ----------- | ---------- |
| API unit             | 29          | **60**     |
| Web unit/component   | 17          | **28**     |
| Web e2e (Playwright) | 3           | **6**      |

### 8. Status doc wrap + hash 校正補丁

#### Commit `3709b00` `docs(status): wrap M7 with pt.2 frontend, aggregate split, third tab, and test pack`

更新 `docs/03-status.md`：

- 「最後更新」日期 / 摘要（加 entry (21)）
- 「當前 Phase」從「M7 上半」改「M3-M7 全棧落地（12 commits）」
- 新增「M7（下半，本 session 完成）」section 列 5 個 commit
- 「下一步 / 中期 M7 下半」段把 5-8 從 ⏳ / 🟢 改 ✅
- Session History 加 M7 pt.2 row

#### Commit `1e325d0` `docs(status): correct M7.5a/M7.5b commit hashes in status doc`

AI agent 寫 status doc 時用了：

- M7.5a placeholder hash `~`（commit 後才知道真 hash 是 `a474b98`）
- M7.5b 錯誤 hash `7920a48`（真 hash 是 `6d476bb`）

跑 `git log --oneline -10` 對照後發現錯誤；按 git safety rule（HEAD 是自己的但**沒被 user explicit request amend** + 不應自動 amend），改開 follow-up commit 校正三處：(a) M7 下半 section header / (b) 中期 next-steps list / (c) Session History row。

### 9. Rule 99 self-review + handoff

#### Rule 99 self-review 結論

本 session 所有改動皆照既有 patterns，**無需更新任何 cursor rule**：

| Pattern                                 | 來源 rule / 先例      | 本 session 使用                                      |
| --------------------------------------- | --------------------- | ---------------------------------------------------- |
| DDD 4-layer                             | rule 30               | API use cases / repository / route                   |
| `cva` primitive variants                | rule 22               | EvidenceUpload theme × state matrix                  |
| Caller-supplied labels in `packages/ui` | rule 10               | EvidenceUpload + reuse SentimentPicker               |
| Next.js + next-intl locale-aware nav    | rule 21 + rule 51     | `<Link href>` 自動加 locale                          |
| Playwright stub + Vitest RTL 分工       | rule 60               | e2e fixture + ComplaintForm.test.tsx                 |
| Lint-staged auto-fix on commit          | rule 70               | 7 個 commit 全 hooks pass                            |
| Rule 00 reject ≠ delete                 | rule 00 + ADR-0029 D4 | 三層守護（zod + use case + repo） + 1 dedicated test |

zod v4 `{ message }` API quirk / next-intl `<Link>` locale prefix / accept attribute jsdom 行為 — 這三個是工具細節不到 rule entry 等級。

#### Handoff 決定

按 rule 98 條件 1 + 2 + 3 全命中：

- **條件 1**：M7 跨多 session 累積 context 偏重（pt.1 7 commits + pt.2 5 commits + multiple hot fix 對話）
- **條件 2**：完成一個邏輯單元（M7 整個 Complaints separation feature）
- **條件 3**：領域即將切換（M7 投訴 → M8 KOL Phase 2 智能合約設計）

User 確認 handoff，補完：

- 本 conversation archive（pt.2）
- Plan file `會議整合_+_phase_1→2→2.5_細拆執行計畫_3aba1bce.plan.md` 標 M7 為 completed
- 新 session opener prompt（給 M8）

---

## 產生的 ADR

**無新 ADR** — M7 下半完全跟著 ADR-0029 D1-D8 + ADR-0028 D3-D7 落地。

---

## 待後續處理事項

### 全鏈路煙測（未做，留 M8 開始前的 pre-flight）

M7 全 12 commits ship 後尚未做的 end-to-end smoke：

1. **OPEN → VERIFIED happy path**：web user submit 投訴 → console admin verify → web broker detail 紅 pill +1 + VERIFIED badge 顯示
2. **OPEN → REJECTED rule 00 path**：web user submit 投訴 → console admin reject with adminNote → web broker detail rejected badge + inline adminNote 顯示 + body 仍可見

建議 M8 啟動 pre-flight 時跑一次（per M7 pt.1 user 已跑過的 ADR-0021/0022/0025/0027 stack E2E 同 pattern）。

### Phase 1 polish 剩餘三條（仍 pending）

- Console Google UI 修復
- Production DB 三腳本 backfill（zh-Hans + source-locale + sentiment）— 須在 production deploy 前跑（per `apps/api/README.md` runbook）
- IPFS gateway charset proxy（Pinata 中文亂碼 cosmetic — M1.3 已做但需 production validate）

### M8 起手點

[ADR-0036（KOL Phase 2 規劃）](../decisions/STAGING.md#s5) — 2 commits：

1. 訊號架構 + oracle 選型（commit + reveal flow / Chainlink Price Feeds vs custom oracle）
2. KOL 準入門檻 + 認領流程

預估 M8 ~150-300 行 diff（純 ADR + plan，無 code）。M9 ~15 commits 開始實作。

### 全 14-milestone 進度

- **8/14 milestones 完成**（M0-M7 全部完成）
- **38/70 atomic commits**

---

## 給未來 AI agent 的建議

1. **API spec 與 UI spec 對照是 design-time 必做的 sanity** — M7.5a 補丁的觸發是 AI agent 在寫 ComplaintForm 前主動對照 zod schema 與 UI spec 發現不一致；如果直接寫 form 用 UI spec 數字會跑後端 400，user 體驗會炸。任何「兩端各有 source of truth」的欄位（zod / UI / DB 約束）都應該 design-time 三方對照一次。

2. **EvidenceUpload 用 native `<label>`-wraps-input 是 W3C 推薦 pattern** — 不要重造 `<div role="button">` + manual click/keyDown handlers。原生 input 的 keyboard + click + focus + drag-drop 行為瀏覽器都處理好了；手寫只會引入 axe violation 與雙觸發 bug。未來任何 file upload primitive 都應該照這條走。

3. **`{ applyAccept: false }` 是 testing-library `userEvent.upload` 對「測試 component 內部 MIME validation」的關鍵 escape hatch** — jsdom 預設遵守 input `accept` 屬性會在 testing library 層就過濾掉檔案，component 自己的 MIME validation 永遠不會跑。寫類似 test 時記得加。

4. **error message 在地化 vs raw server message**：errorMessage.ts 的設計是「server message 只進 log，UI 一律走 i18n code → copy 映射」。寫 component test 時 mock `ApiClientError` 一定要：(a) 用正確的 error code（看 errorMessage.ts 認得哪些 code）+ (b) assert i18n copy 而非 server message。本 session 的 test fix 花了 ~10 分鐘 debug 才發現這個。

5. **aggregate query 加 discriminator filter 是 schema 新增 discriminator 後的「強制 invariant 同步檢查」** — M7.6a 加 `kind=REVIEW` filter 不只是 user spec 的 sentimentAggregate + verifiedComplaintCount 兩個 surface，而是 grep `prisma.review.findMany` 跨整個 codebase 找到 6 個 surface（include + \_count + owner-stats + similarBrokers + listByBroker + reviews route）全部要過濾。每次加 discriminator column 都應該做這個跨 surface grep + 統一加過濾，否則會有 silent pollution bug。

6. **co-locate derive helper in client.ts 是 cross-surface 的 single source of truth pattern** — M7.6b 的 `deriveComplaintStatus()` 放 client.ts 而非 ComplaintCard.tsx，因為 M10 商戶後台 inbox 也會需要同樣的 status 映射；放共用層避免兩個 surface 各自 derive 漂移。任何「從 column 派生 enum」的邏輯都應該考慮這個 placement。

7. **rule 96 例外條款「pure test commit 接受 >200 行 diff」是合理的** — M7.7 的 1189 行 diff 是 31 + 11 + 3 = 45 個 test 加總，拆成多 commit 反而割裂測試 coverage 的邏輯邊界（M7 投訴 feature 的「測試套件」是一個 atomic 概念）。實作 commit 該嚴守 200 行，測試 commit 可放寬。

8. **rule 98 handoff 條件命中時不要拖** — M7 上半 + 下半各 1 個 session 是正確的 cadence，硬撐在同一個 session 跑 12 個 commit 會踏到 context 過載；session 切換的成本（重讀 8 份文件 + 等 user 確認）遠低於 context drift 的 quality cost。

9. **plan file 的 todo status 維護是 handoff 紀律的一部分** — M7 完成後 plan file `會議整合_+_phase_1→2→2.5_細拆執行計畫_3aba1bce.plan.md` 的 M7 todo 應該從 `pending` 改 `completed`，user 在 Plan Mode 看 Cursor todo 介面才能看到正確進度。下個 milestone 完成後也記得回去更新。

---

**最後更新**：2026-05-26
**歸檔者**：M7 execution session pt.2（Claude Opus 4.7）
