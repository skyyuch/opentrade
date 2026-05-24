# ADR-0025: Multi-broker Verification Strategy (Phase 1 off-chain, Phase 2 on-chain)

## Status

Accepted

## Date

2026-05-24

## Context

OpenTrade 的散戶 (per `docs/01-architecture.md` §6 身份分層) 透過驗證券商帳戶取得 L2 等級才能寫評論。香港散戶現實是同時有 3-5 家券商帳戶 (HSBC、輝立、富途、中銀、IB、Tiger…)，每家體驗都不同。要不要支援「同一個用戶在多家券商各自驗證」？這是 `docs/03-status.md` 待決策清單的最高優先項。

### 技術現狀（決策前）

1. `SbtVerificationRequest` schema 允許一個 user 對多個 `brokerSlug` 各提一筆 (沒擋 unique，只擋同時 `PENDING`)。
2. `ReviewerSBT` (per ADR-0021 D2) 用 `mapping(address => bool) public hasMinted` 在合約層強制 one-mint-per-address，第二次 mint 會 `revert AlreadyMinted`。
3. Admin approve 流程把 user `sbtTier = L2` + 觸發 outbox `sbt.mint_requested`。第二次 approve 通過時，outbox worker 會打鏈失敗，**靜默卡住**（重試 5 次後 FAILED）。

換句話說，「APPROVED 後再驗第二家」**目前是個未被承認的 bug**，必須先決定處理方向才能補。

### 商業需求三個層次（要分清楚）

1. **可不可以驗多家券商**：可以 — 香港散戶常態，限制單一只會逼用戶選一家放棄其他。
2. **驗多家有什麼價值**：價值在「橫向訊號」(cross-broker reference)，不在「升用戶等級」：
   - 評論卡顯示「此 reviewer 同時驗證了 IB、富途」→ 比單 broker 用戶有更強 cross-reference 能力
   - Filter「只看同時持有 IB 和富途的用戶評論」→ WikiFX 做不到，是平台差異化
   - 對 KOL signals / 爭議仲裁的可信度判斷有價值
3. **可不可以靠驗證次數升 L 等級**：**不可以**。L 等級依 vision §6 是身份質變 (投資者 → 陪審員 → 機構)，不是「投資者+1」「投資者+2」。把 L3 (陪審員) 商品化會直接踩公平紅線。要表達「驗證程度更高」應在 L2 內部用 metadata，不要動 L1-L5 軸。

### 三個候選技術方案

| 方案  | 描述                                                                                 | 鏈上紅線                                                  | Phase 1 成本                             |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------- |
| **A** | broker list 純 DB，鏈上 SBT 仍是「驗 L2 一次」二元證明                               | **違反**（平台理論上能改 broker list）                    | 最小                                     |
| **B** | SBT tokenURI 動態累加 broker（合約加 `setTokenURI()`），每次 approve 重 pin metadata | 不違反，但 tokenURI 變 mutable 與「永久身份」直覺有點衝突 | 中（合約升級 + audit）                   |
| **C** | per-broker SBT (ERC1155 或多 ERC721)                                                 | 不違反                                                    | 大（重寫 ReviewerSBT，散戶錢包 UI 惡夢） |

完整評估見「Alternatives Considered」段。

## Decision

採 **B 漸進版**：Phase 1 用方案 A 機制 (DB list)，Phase 2 才升合約 v2 把 broker list 上鏈。中間用 commitment hash 鏈上 audit trail 緩解 Phase 1 期間「broker list 平台可改」的紅線風險。

### D1: 用戶可以對任意數量的券商各自驗證

`SbtVerificationRequest` schema 不限制 broker 數量。同一 user 可以對 broker A、B、C 各提一筆獨立驗證（每筆獨立 `commitment` hash + IPFS evidence）。

### D2: 同一 (user × broker) 通過後不可重複提交

Schema 加 partial unique index：

```sql
CREATE UNIQUE INDEX sbt_verification_requests_user_broker_approved_unique
  ON sbt_verification_requests (userId, brokerSlug)
  WHERE status = 'APPROVED';
```

- 用戶對「已驗過」的 broker 重新提交 → API 回 `CONFLICT` (409)
- 用戶對「曾被駁回」的 broker 可以重試 (REJECTED 不擋)
- 用戶對「正在審核」的 broker 不可重提 (PENDING 已擋，沿用既有邏輯)

### D3: 等級升級僅在「第一次 approve」觸發；後續 broker 不再鑄 SBT、不再升 tier

Admin approve 流程改為：

```
if user.sbtTier === 'L1':
  // 第一次成功 → 升 L2 + 觸發 outbox sbt.mint_requested
  user.sbtTier = 'L2'
  user.role = 'REVIEWER'
  emit OutboxEvent('sbt.mint_requested')
else:
  // 已是 L2+：不升 tier、不再鑄 SBT
  // broker list 在 DB 累加（D4 解釋）
  // 不打鏈，避免 hasMinted revert
```

`role` 欄位邏輯不變 (REVIEWER 一旦設置就維持)。L 等級升級**只能透過獨立流程** (L3 邀請、L4 商戶 KYC)，不靠驗證次數。

### D4: Verified broker list 暫時 off-chain (Phase 1)

新表 `UserVerifiedBroker`：

```prisma
model UserVerifiedBroker {
  id              String   @id @default(cuid())
  userId          String
  brokerSlug      String
  verificationId  String   @unique  // FK to SbtVerificationRequest
  commitment      String              // 從原 verification request copy 來
  approvedAt      DateTime @default(now())

  user            User                    @relation(fields: [userId], references: [id])
  verification    SbtVerificationRequest @relation(fields: [verificationId], references: [id])

  @@unique([userId, brokerSlug])
  @@index([userId])
  @@map("user_verified_brokers")
}
```

- Admin approve verification 時在同一 DB transaction 寫入
- Review 列表 join 此表顯示 reviewer 的 broker 徽章
- `/verify` UI 用此表決定哪些 broker 已驗、不再讓用戶選

### D5: 每筆 broker approve 把 commitment 寫進 OutboxEvent（鏈下 hash chain）

為了 Phase 1 期間有「平台不可篡改 broker list」的審計能力：

- Admin approve 時 emit `OutboxEvent('verification.broker_added', { userId, brokerSlug, commitment, prevCommitment })`
- 這些 event 寫進 `outbox_events` 表（既有），日後可被 indexer / 監察單位 pull
- `prevCommitment` 是同一 user 上一筆 broker 的 commitment（hash chain）— 任何 admin 後改 broker list 都會破鏈
- Phase 1 不打到 ReviewerSBT 鏈上 (per D3)，這個 chain 暫時是「可信但不在 L2」
- Phase 2 升合約 v2 時把這個 chain 灌進鏈上 broker mapping，歷史 0 損失

這是「broker list 暫時 off-chain」紅線風險的**主要緩解**。

### D6: Phase 2 升級路徑 (預期 6-12 個月後)

Phase 2 寫新 ADR superseding ADR-0021 部分章節，內容：

- ReviewerSBT 用 UUPS 升 v2，加 `mapping(uint256 => string[]) public verifiedBrokers` 與 `addBroker(tokenId, brokerSlug, commitment)` 函數 (`onlyRole(MINTER_ROLE)`)
- 加 `mapping(bytes32 => bool) public usedCommitments` (nullifier，防月結單復用)
- `tokenURI()` 介面不變，但 metadata JSON schema 加 `verifiedBrokers` 欄位
- Phase 1 SBT 全部就地繼承 (UUPS in-place upgrade，同 tokenId、同 owner、同 ERC721 介面)
- 把 D4 的 `UserVerifiedBroker` 表批次灌進鏈上 (admin batch script)
- 棄用 `OutboxEvent('verification.broker_added')`，改為實時 `addBroker` 鏈上呼叫

升級後 ADR-0021 D5 (immutable tokenURI) 會被改寫；ADR-0021 整體 (one-mint-per-address) 仍成立，因為仍是一個 user 一張 SBT，只是 metadata 從 static 變 dynamic。

### D7: 不寫死 Phase 2 時程，由用戶數據驅動

Phase 2 升級不立刻安排；觸發條件是以下之一：

- 月驗證量 > 500 筆
- 累計驗證 > 5000 用戶
- > 30% L2 用戶有 ≥ 2 broker（驗證「散戶真的會去驗多家」假設）
- CCMF / 投資人盡調明確要求「broker list 必須上鏈」

若 Phase 2 觸發前用戶數據顯示「絕大多數用戶只驗 1 家」，則延後升級或採方案 A 永久版 (broker list 永遠 off-chain，Phase 1 機制就是 final)。

## Alternatives Considered

### 方案 A：broker list 永遠 off-chain

- **Pros**：實作最簡、不必動合約、不必 audit
- **Cons**：違反「不可篡改」紅線—平台理論上能改 broker list（即使用 D5 hash chain 緩解，仍非「鏈上強制」）。對 CCMF / SFC 敘事弱化
- **拒絕理由**：與「公平、公開、不可篡改」核心承諾衝突。但 Phase 1 借用其機制是可接受的過渡

### 方案 B 完整版：Phase 1 直接做合約 v2 (zk + multi-broker + nullifier)

- **Pros**：第一天就鏈上、第一天就零知識、第一天就支援多 broker
- **Cons**：
  - 延後上線 2-3 個月（zk circuit dev 4-6 週 + audit 4 週 + 整合 2-3 週）
  - 多 USD 30-50k 審計費
  - 用戶體驗反而退步：zk-proof 在散戶手機算 30-60 秒會 lag、放棄率上升
  - CCMF 看 traction 不看技術，延後上線 = 更晚拿到用戶數據
  - 商業假設（散戶會驗第 2 家嗎？）尚未驗證就重押技術投資
- **拒絕理由**：性價比低，散戶幾乎看不出差別（見「使用者差別」段），但平台付出延後上線的高昂成本

### 方案 C：per-broker SBT (ERC1155 或多 ERC721)

- **Pros**：語意最清楚（「IB 帳戶」是 IB 的 SBT、「富途帳戶」是富途的 SBT）
- **Cons**：
  - 重寫 ReviewerSBT (ADR-0021 整個重來)
  - 散戶錢包看到 N 顆 SBT，UX 惡夢（「為什麼我有 5 個 OpenTrade SBT？」）
  - 跨 broker 邏輯複雜化 (寫評論時要判定哪張 SBT 對應哪個 broker)
- **拒絕理由**：使用者體驗顯著退步，且對商業價值無幫助。除非未來業務模型逼著區分「per-broker 證明」，否則不必走

### 方案：直接把 broker 視為 nullifier (一個 commitment 對應一個 broker，禁止重用)

- **Pros**：合約端用 nullifier mapping 即可
- **Cons**：仍需 mint 多次 SBT，與 ADR-0021 D2 衝突；或必須改 D2 改成「one mint per (address × broker)」—等於走方案 C
- **拒絕理由**：邏輯上等同方案 C 的子集

## Consequences

### Positive

- **Phase 1 立即上線**：MVP 不卡 zk circuit 開發，CCMF 申請可開始
- **散戶體驗一致**：1-2 天人工審核反而比「30 秒自動通過」對保守散戶更具信任感
- **未來路徑清楚**：Phase 2 是 in-place upgrade，Phase 1 SBT 不會被淘汰
- **商業假設可驗證**：先看「散戶真的會驗多家嗎」再決定 Phase 2 做與不做
- **Admin 流程仍可控**：Phase 1 用戶數量 < 10000，1 名 admin 撐得住
- **解決靜默 bug**：D3 修了「APPROVED 後第二次驗證會卡 outbox」的隱性問題
- **資料完整性**：D2 的 unique index 防 admin 誤操作雙重 approve

### Negative / Trade-offs

- **Phase 1 期間 broker list 在 DB**：admin 帳號被駭可改 list，必須靠 D5 outbox hash chain + admin 操作日誌緩解
- **Admin 仍能看到月結單原檔**：per ADR-0022 既有妥協 (Phase 2 升 zk 才解決)
- **「驗第二家不升等」需要明確 UI 溝通**：用戶可能誤以為驗越多越強，要在 `/verify` 文案明確「驗越多 broker = 更可信，但不影響 L2 等級」
- **未來 ADR-0021 D5 會被新 ADR superseded**：tokenURI 從 immutable 變 dynamic 需謹慎包裝為「append-only metadata」避免被解讀為「可篡改」

### Neutral

- ReviewerSBT 合約本次**完全不動**，sticking with ADR-0021 D2 (one-mint-per-address) 不變
- DB schema 加一張表、一個 partial index、admin approve 流程修改；無 migration 風險
- 既有 Phase 1 已 mint 的 SBT 全部不受影響
- `/verify` 頁的 UI 狀態機加一個 `'approved-can-add'` 分支（已驗過至少 1 家 + 仍有未驗 broker 可選）

## Implementation Notes

依以下順序開工，建議分 4-6 commit：

### 1. DB schema (1 commit)

- `packages/db/prisma/schema.prisma`：加 `UserVerifiedBroker` model + `User.verifiedBrokers` relation
- 新 migration：建表 + 兩個 unique index（per D2 SQL + D4 model）
- 不在 baseline migration 補 — 用新 migration 即可

### 2. API approve flow 改造 (1 commit)

- `apps/api/src/domains/identity/presentation/routes.ts` 的 `/admin/verifications/:id/approve`：
  - 包成 `prisma.$transaction`
  - 新增 `UserVerifiedBroker` row（per D4）
  - emit `OutboxEvent('verification.broker_added', { userId, brokerSlug, commitment, prevCommitment })`（per D5）
  - **僅在 `user.sbtTier === 'L1'`** 才升 tier + emit `sbt.mint_requested`（per D3）
- POST `/verify-broker` schema 防呆：若 `(userId, brokerSlug)` 已 APPROVED → throw `CONFLICT` (per D2)
- GET `/verification-status` response 加 `verifiedBrokers: string[]` 給前端用
- GET `/admin/verifications` response 加 `userVerifiedBrokers: string[]` 給 admin 看用戶 broker list 全貌

### 3. Web `/verify` UI 狀態機擴充 (1 commit)

- `apps/web/src/components/verify/VerifyForm.tsx`：
  - `viewMode` 加 `'approved-can-add'`：已驗過至少 1 家 + 仍有未驗 broker
  - `BrokerCombobox` 接受 `excludeSlugs: string[]` 把已驗過的隱藏
  - 加 `VerifyApprovedWithMoreCard`：顯示已驗 broker 徽章列 + 「+ 新增另一家券商」button → 切回 idle form
  - 文案明確「驗越多 broker = 更可信，但不影響 L2 等級」
- i18n 加新 keys (三語)

### 4. Console 顯示 broker list (1 commit)

- `apps/console/src/app/[locale]/admin/verifications/VerificationsClient.tsx`：
  - Case modal 顯示「該用戶已驗 broker」清單
  - 已驗過的 broker 用綠色標記（避免 admin 重複 approve）

### 5. Review 卡顯示 broker 徽章 (1 commit)

- `apps/api/src/domains/reviews`：list response 的 `author` 物件加 `verifiedBrokers: string[]`
- `apps/web` 的 review card 顯示 broker 徽章 (最多 3 個 + 「N 家」摺疊)

### 6. 文件 (1 commit)

- 更新 `docs/03-status.md`：Move 「多券商驗證策略」從待決策 → 已決策（連結本 ADR）
- 更新 `docs/decisions/README.md`：加 ADR-0025 entry

### 不做的事 (per D6 / D7)

- ❌ 不動 ReviewerSBT 合約
- ❌ 不寫 zk circuit
- ❌ 不批次灌歷史 commitment 上鏈

### 紅線檢查

| 項目                                      | 是否符合                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 不可實作平台可刪除評論                    | ✅ 無關                                                                                          |
| 不可付費影響評論順序                      | ✅ 無關                                                                                          |
| 不可發投資建議                            | ✅ 無關                                                                                          |
| 鏈上資料 admin 不可改                     | ✅（既有 SBT 仍 immutable；新加的 broker list 走 D5 outbox hash chain 並標記為「Phase 1 過渡」） |
| Smart contract 不可有 owner-only 修改評論 | ✅ 無關（不動合約）                                                                              |
| Phase 1 不發代幣                          | ✅ 無關                                                                                          |

## References

- [ADR-0021](./0021-reviewer-sbt-contract-design.md) — ReviewerSBT 合約設計（D2 one-mint-per-address 沿用、D5 tokenURI immutable 將被 Phase 2 新 ADR superseded）
- [ADR-0022](./0022-l2-commitment-hash-verification.md) — L2 commitment-hash 方案（Phase 2 升 zk-proof 路徑）
- [docs/00-vision.md](../00-vision.md) — 公平、公開、不可篡改三大紅線
- [docs/01-architecture.md §6](../01-architecture.md) — L0-L5 身份分層
- [docs/03-status.md](../03-status.md) — 待決策清單（本 ADR 解除「多券商驗證策略」項）
- [docs/conversations/2026-05-24-verify-page-rebuild.md](../conversations/2026-05-24-verify-page-rebuild.md) — 前 session 留下的待處理問題（多券商策略 + admin IPFS preview UI）
