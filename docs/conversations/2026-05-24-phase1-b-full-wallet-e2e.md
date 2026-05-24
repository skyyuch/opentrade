# Phase 1 (b) 全新-wallet L2 verify-broker full happy-path E2E — 2026-05-24

> 本文件歸檔 OpenTrade 項目 2026-05-24 第四場 session 的精華內容。
> 這場 session 沒有任何 code commit，是一次**單軸線高密度的端到端驗證**，把 Phase 1 ~96% 推到 ~99%。

## 對話脈絡

- **日期**：2026-05-24（同一天的第四場 session）
- **參與者**：項目負責人 + Claude Opus 4.7
- **背景**：接 ADR-0027 廢除 UGC 翻譯 + outbox SBT mint idempotency 守護 session handoff（Phase 1 ~96%）。Privy Dashboard、Base Sepolia 合約、broker name i18n 三列、UGC translation deprecated、outbox worker idempotent 都已 ship；剩三條 critical-path / polish 中，**(b) 全新-wallet L2 verify-broker E2E** 是唯一阻擋 Phase 1 收尾的 critical-path 項目（idempotency guard 只證了「skip 分支」，沒證「mint 分支真上鏈」）。
- **單一目標**：以全新 Privy wallet 跑完整 verify-broker happy path，把 7 個 step 全部走完並驗證 ADR-0021 / 0022 / 0025 / 0027 整 stack 端到端在 Base Sepolia 上對全新 wallet 真實可運作。

## 主要討論內容

### 1. Pre-flight 環境健康度 cold-start（t1）

上場 session 結束後本機 dev 環境完全死了 — 3 個 dev port（3000 / 3001 / 4000）都沒 listen、無 outbox-worker process。本 session 從零起 4 個 dev process：

- `apps/api` :4000 — Hono + tsx watch
- `outbox-worker` — dev:outbox（dotenv-cli + tsx）
- `apps/web` :3000 — Next 14 dev
- `apps/console` :3001 — Next 14 dev

全部於 18s 內 ready。3 條 sanity probe 全綠：

1. `/v1/health` → 200 OK + DB latency 12ms
2. Base Sepolia RPC reachable + relayer `0xD221ce091E364D24029B92bC89a3f9831e3e5d01` 餘額 `0x3f75f007149f` = ~0.0000698 ETH（夠 ~700 mint）
3. Relayer 在 `ReviewerSBT 0x31D8e863ce71c90d399Ff69eeACeC84226b3e61b` 上同時擁有 `DEFAULT_ADMIN_ROLE` + `MINTER_ROLE`（兩次 `hasRole(...)` 都回 `0x01`）

**教訓**：上場 session handoff 的「dev process 還活著」假設不能跨 session 持有 — 每個新 session 都必須做 pre-flight cold-start 檢查，否則 user 在 step 2 點 verify 時會打到死的 :4000 然後浪費時間追 bug。

### 2. 全新 wallet provision（t2）

Privy embedded smart wallet 是 deterministic per Privy account（不是 per browser），所以**同一個 google account 開無痕視窗會拿到同一個 wallet**。User 用 `skyyuch627@gmail.com`（vs 既存 `skyyuch@gmail.com` 那個 Sky wallet）登入後，DB 落新 user row：

| 欄位          | 值                                           |
| ------------- | -------------------------------------------- |
| id            | `07e479d9-f19c-4667-895c-335177cb3b9f`       |
| walletAddress | `0x52B830cE780f66912210bD2C980Ec89B1A8AcF9E` |
| email         | `skyyuch627@gmail.com`                       |
| role          | USER                                         |
| sbtTier       | L1                                           |

直接打 Base Sepolia RPC `eth_call ReviewerSBT.balanceOf(0x52B830cE...)` 回 `0x0` ✓ — 證實這真的是一個鏈上全新 wallet，worker 將走 mint 分支不是 idempotency-skip 分支。

### 3. Verify submit + IPFS pin + commitment（t3）

User 在 `/verify` 選 `01F Limited`（Sky 之前沒驗過）並上傳一張 PNG。DB `sbt_verification_requests` row 落地：

```
id              : 0086dfe7-eec8-4c56-869b-5a57a6014430
brokerSlug      : 01f-limited
status          : PENDING
evidenceIpfsCid : bafybeiezekx4eqymzprw7m6w...  (Pinata pin 成功)
evidenceMimeType: image/png                       (per ADR-0025 post-rollout 8b)
commitment      : 0xa995c1e5fab34391...           (前端 keccak256)
createdAt       : 15:16:18
```

### 4. Admin approve 的 4 件事原子轉換（t4）

User 切到 console (`:3001/zh-Hant/login` username=admin) → `/admin/verifications` → 點 case modal → 看到 IPFS image preview + data panel（broker / wallet / commitment / CID 都對） → 按「批准」。

DB query 4 件事全綠：

- **(a)** request status PENDING → APPROVED + `reviewedAt=15:18:59`
- **(b)** `User.sbtTier` L1 → **L2** + `User.role` USER → **REVIEWER**
- **(c)** `user_verified_brokers` 新 row `9bbb7621-...` insert（hash chain ledger entry，commit `0xa995c1e5...` 抄 verification request 的 commitment 往前接）
- **(d)** outbox 同 transaction 內 emit 2 個 event：
  - `verification.broker_added` (aggregateType=user_verified_broker) — 給 hash chain ledger
  - `sbt.mint_requested` (aggregateType=sbt_verification) — 給 worker 上鏈
  - 兩個都 `attempts=0 / lastError=null / processed` ✓

per ADR-0025 D3 的 transactional flow design 完整實作。

### 5. Worker 走 mint 分支 happy path（t5）

`sbt.mint_requested` 從 createdAt 15:18:59 到 processedAt 15:19:05 — **6 秒** internal（worker 15s poll cycle 命中前）。

worker log 只有一行：

```
{"level":"info","msg":"SBT minted on-chain","time":"2026-05-24T15:19:05.675Z","verificationId":"0086dfe7-eec8-4c56-869b-5a57a6014430","userId":"07e479d9-f19c-4667-895c-335177cb3b9f","wallet":"0x52B830cE780f66912210bD2C980Ec89B1A8AcF9E","txHash":"0x5d565de989ba31f805cf1dbb3b0e4b70605cba503027114ec686407bf4559ce5"}
```

**沒有** `"Skipping SBT mint — wallet already holds an SBT"` warn log → 證實 commit `9df2336` 加的 `balanceOf > 0n` guard 正確走了 0n 分支（前 a2 session 只驗了「balanceOf > 0 → skip」，本次驗了「balanceOf = 0 → mint」）。

**副作用觀察**：`verification.broker_added` 在 worker log 是 `"Unknown event type"` warn — event 雖 mark `processed` 沒卡 queue（per outbox unknown-event pass-through 設計），但 warn log 是 noise + 會 mask 未來真實 bug。加入「下一步」段的 t14 作為 phase 1 收尾 batch follow-up（加 noop handler 消 warn）。

### 6. On-chain side effect 全綠（t6）

`eth_getTransactionReceipt(0x5d565de9...)` 解析：

- `status` = `0x1` ✓
- `blockNumber` = 41,933,829
- `gasUsed` = 179,969（合理 ERC721 mint + storage cost）
- 2 logs from SBT contract:
  - log 0 = Transfer event：topic0 `0xddf252ad1be2c89b...`（ERC721 std signature） + from `0x0...0`（mint） + to `0x52b830ce...`（新 wallet） + **tokenId `2`**（tokenId 1 是 Sky 之前那枚）
  - log 1 = 自訂 ReviewerSBT event：topic0 `0x401afd266fd6d651...`（可能是 `SbtMinted` 或 audit event）
- `ownerOf(2)` = `0x52b830ce780f66912210bd2c980ec89b1a8acf9e` ✓
- `balanceOf(0x52B830cE)` = `1` ✓（從 t2 的 0 變 1）
- `tokenURI(2)` = `ipfs://verification/0086dfe7-eec8-4c56-869b-5a57a6014430` ✓（**內含實際 verificationId**，pointer 模式）

**Phase 2 follow-up**：tokenURI 是 synthetic pointer 不是真實 ERC-721 metadata JSON CID。若 Phase 2 marketplace integration（如 OpenSea Base Sepolia） 需要 polish 成標準格式。Phase 1 不阻塞 — soulbound SBT 本來就不會在 marketplace 流通。

### 7. Reviewer gate unlock + review submit happy path（t7）

新 wallet user 現在是 L2 REVIEWER，submit review 應該過 gate。User 在 `/zh-Hant/brokers/01f-limited` 寫一筆 review「測試 / rating=5」，DB review row 落地：

```
id            : 7cd16b81-e4b8-47cd-aa27-bc211f0b1454
userId        : 07e479d9-... (新 wallet user)         ← reviewer gate 通過
brokerSlug    : 01f-limited
rating        : 5
status        : CONFIRMED                              ← PENDING→CONFIRMED
chainReviewId : 3                                      ← prev a2=2, 本筆 ReviewRegistry 第 3 筆
txHash        : 0x9c9f0e1310ceb2c81da7...
ipfsCid       : bafkreighxb5wtpdwaxicmmsm...           ← Pinata pin
sourceLocale  : zh-Hant                                ← per ADR-0027 author-original
contentHash   : 0xaf06e67a42abee23...
createdAt     : 15:21:39
```

outbox `review.submitted` event 從 createdAt 15:21:39 到 processedAt 15:21:52 — 13 秒（worker poll cycle 命中前）。`attempts=0 / lastError=null` ✓。

`eth_getTransactionReceipt(0x9c9f0e13...)` 解析：

- `status=0x1` / block 41,933,913 / gasUsed 195,309
- `from` = relayer `0xD221ce0...` ✓
- `to` = ReviewRegistry `0x8aB5...f187` ✓
- 1 log = `ReviewSubmitted` event topic0 `0x1fa5b00888507bb5...` ✓

worker log: `"Review confirmed on-chain"` + reviewId + chainReviewId=3 + txHash 完整匹配。

## 產生的 ADR

無 — 本 session 純驗證，沒新決策。

## 待後續處理事項

- [ ] **(phase 1 收尾 batch)** `verification.broker_added` outbox 加 noop handler 消 worker `"Unknown event type"` warn noise（per t5 副作用觀察；非阻塞）
- [ ] **(待 user)** Console Google UI 修復 — `globals.css` 主題系統 vs Google 硬編碼色衝突（前 session 留下殘留 bug，本 session t4 沒觸發但沒做 regression check）
- [ ] **(production deploy 前)** 跑 `db:backfill:zh-hans` + `db:backfill:source-locale`（兩腳本同個 window，皆 idempotent，per ADR-0026 step 6 + ADR-0027 D8）
- [ ] **(Phase 1 polish)** IPFS gateway charset proxy — `GET /v1/reviews/:id/ipfs-content` 設 `Content-Type: application/json; charset=utf-8`，解 Pinata gateway plain-view 中文亂碼 cosmetic
- [ ] **(Phase 2 marketplace)** `tokenURI` 從 synthetic `ipfs://verification/<id>` 升成標準 ERC-721 metadata JSON pin（per t6 副作用觀察；soulbound SBT 不會上 marketplace 但若要支援 wallet 顯示需要）
- [ ] **(承襲)** 「Phase 2 前轉 PR-only flow」still pending（per 待決策/流程層級段；本 session 雖無 code commit 但歷史 14 commit + 本 session 2 commit 仍累積在 admin bypass 下未 push origin）

## 給未來 AI agent 的建議

### 紀律

1. **每個新 session 都必須做 pre-flight cold-start 檢查** — 上場 session 結束時的「dev process 還活著」假設不能跨 session 持有；user 在 t2 點 verify 時若打到死的 :4000，會浪費 5-10 分鐘追幽靈 bug。檢查順序：lsof port → ps process → curl /v1/health → docker ps postgres → grep env keys。
2. **Privy embedded wallet 是 per Privy account 不是 per browser** — 想要全新 wallet 必須換 google account 或 email，無痕視窗只解決 cookie cache，不解決 Privy 的 deterministic key derivation。Onboarding 文件 + status doc 都要寫清楚。
3. **驗證 happy path 跟驗證 skip 路徑同等重要** — 前 a2 session 加 idempotency guard 後只驗了「balance>0 → skip」分支沒驗「balance=0 → mint」分支。本 session 補完。任何 if-else 分支只驗一邊就 ship 是技術債務。
4. **outbox event 增加新 type 時必須同步加 worker handler** — `verification.broker_added` 在 ADR-0025 D5 emit 出來但 worker 沒對應 handler，雖然 unknown-event pass-through 設計救了 queue 不卡，但 warn log 是 noise + 會 mask 未來真實 bug。下次新 event type 設計時 PR description 必須列「對應 worker handler」清單。
5. **直接打 RPC 比信 BaseScan UI 更可靠** — RPC `eth_getTransactionReceipt` + `eth_call` 三招（`balanceOf` / `ownerOf` / `tokenURI`）就能完整驗 on-chain side effect，不需要等 BaseScan 索引（有時延遲分鐘級）。本 session 完全沒用 BaseScan。
6. **Synthetic tokenURI 是合理 Phase 1 妥協但 Phase 2 要 polish** — `ipfs://verification/<verificationId>` pointer 模式內含資訊但不符 ERC-721 metadata schema。soulbound SBT 不上 marketplace 不阻塞，但 wallet UI（MetaMask, Rainbow）顯示時會空白。記錄到「待後續處理」段。

### 文件交叉引用

- 本 session 證實的 ADR stack：ADR-0019 (review submit gate) + ADR-0021 (ReviewerSBT one-mint-per-address) + ADR-0022 (commitment-hash verification) + ADR-0025 (multi-broker hash-chain ledger + D3 conditional emit) + ADR-0027 (sourceLocale wire-through)
- 與前 session 的 outbox SBT mint idempotency guard (commit `9df2336`) 互補：那 commit 驗 skip 分支（同 wallet 不會炸 AlreadyMinted），本 session 驗 mint 分支（全新 wallet 真上鏈）
- rule 30 §Worker Consumer Idempotency 已 codify 兩層守護（emit 端 + worker 端），本 session 兩個分支都跑過 — rule 文件無需更新

### 下一個 session 的優先項

按重要度：

1. **`/admin` Console Google UI 修復** — `globals.css` 主題系統 vs Google 硬編碼色衝突（前 session 殘留，本 session 未觸發但未做 regression check）；user 在 production demo 時這會被看到
2. **`verification.broker_added` worker noop handler** — 5 分鐘工作，消 warn log noise
3. **IPFS gateway charset proxy** — `GET /v1/reviews/:id/ipfs-content` 設 `charset=utf-8`，~30 分鐘工作
4. **Production DB backfill 雙腳本** — 等 prod RDS 接通才跑，不是 dev 工作
5. **Phase 2 boundary：admin bypass 解除 + PR-only flow** — 觸發點未到（第二位 contributor / SFC 高層接觸 / Phase 1→2 boundary 三者最早）
