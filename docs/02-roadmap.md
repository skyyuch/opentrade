# OpenTrade 路線圖

> 本文件描述「我們什麼時候做什麼」。
> 進度狀態見 [`03-status.md`](./03-status.md)（每 session 更新）。

---

## 階段總覽

| Phase        | 名稱              | 預期時程 | 主要交付                                       | 關鍵 milestone         |
| ------------ | ----------------- | -------- | ---------------------------------------------- | ---------------------- |
| **Phase 0**  | 地基              | 1-2 週   | Monorepo + Cursor Rules + IaC + Storybook 雛形 | 可在本地跑起空殼       |
| **Phase 1**  | MVP-A：鏈上評論   | 3-4 週   | 散戶可寫評論並上鏈、商戶可認領專頁             | 拿到第一份真實鏈上評論 |
| **Phase 2**  | MVP-B：KOL 訊號   | 3-4 週   | KOL 可發訊號上鏈、用戶看勝率 dashboard         | 第一位 KOL 上鏈        |
| **Phase 3**  | MVP-C：陪審團 V1  | 4-5 週   | 簡化版去中心化陪審投票                         | 第一個爭議仲裁完成     |
| **Phase 4**  | 申請基金 + 內測   | 2-3 週   | 申請數碼港 CCMF、邀請種子用戶                  | CCMF 申請送出          |
| **Phase 5**  | 公測 + 第二輪基金 | 持續     | 公開測試、改 bug、擴功能、申請 50 萬基金       | 1,000 真實用戶         |
| **Phase 6+** | 擴張              | 2027+    | 台星馬市場、加密交易所評論                     | 跨地區運作             |

**總時程目標**：Phase 0-3 在 **12-16 週內**完成，剛好趕上 CCMF 下一輪申請窗口。

---

## Phase 0：地基（當前階段）

### 目標

讓未來所有 code 都能在一致、長遠正確的基礎上展開。

### 交付清單

#### 0.1 文件骨架（Commit #1）✅ 進行中

- [x] `AGENTS.md`
- [x] `README.md`
- [x] `docs/00-vision.md`
- [x] `docs/01-architecture.md`
- [x] `docs/02-roadmap.md`（本檔）
- [ ] `docs/03-status.md`
- [ ] `docs/04-glossary.md`
- [ ] `docs/decisions/` 0001-0010 ADR
- [ ] `docs/conversations/2026-05-17-initial-planning.md`
- [ ] `.cursor/rules/` 全部規則

#### 0.2 Monorepo 骨架（Commit #2）

- [ ] `package.json` (root)
- [ ] `pnpm-workspace.yaml`
- [ ] `turbo.json`
- [ ] `tsconfig.base.json`
- [ ] 各 package 的 stub package.json
- [ ] ESLint + Prettier 配置（root）
- [ ] Husky + lint-staged

#### 0.3 各 package 初始化（Commit #3-#5）

- [ ] `apps/web` Next.js + next-intl + Tailwind + shadcn
- [ ] `apps/console` Next.js + next-intl + Tailwind + shadcn
- [ ] `apps/api` Hono skeleton
- [ ] `packages/db` Prisma init
- [ ] `packages/contracts` Foundry init
- [ ] `packages/ui` Storybook
- [ ] `packages/shared` types stub
- [ ] `packages/config` 多鏈 config

#### 0.4 設計系統 + Storybook（Commit #6）

- [ ] Design tokens (colors, typography, spacing)
- [ ] 基礎元件（Button, Input, Card, Dialog）
- [ ] Storybook 跑得起來

#### 0.5 基礎設施 IaC（Commit #7）

- [ ] Terraform 雛形（VPC, RDS, ECS Fargate, S3）
- [ ] 三環境分離（dev/staging/prod）
- [ ] Secrets Manager 結構
- [ ] AWS 帳號接通

#### 0.6 CI/CD（Commit #8）

- [ ] GitHub Actions: lint + typecheck + test
- [ ] PR template + CODEOWNERS
- [ ] Branch protection 設定

### Phase 0 完成定義 (Definition of Done)

- ✅ 所有 commit 都 build pass
- ✅ `pnpm typecheck` 在 root 跑得起來
- ✅ `pnpm lint` 全部 pass
- ✅ Storybook 跑得起來能看到示範元件
- ✅ Foundry test 跑得起來（即使是空殼測試）
- ✅ Terraform `plan` 跑得起來（沒實際 apply）
- ✅ CI 在 PR 上自動跑

---

## Phase 1：MVP-A 鏈上評論

### 目標

用戶能在 Web 上寫評論，內容上鏈不可改，商戶能認領專頁。

### 主要功能

#### 1.1 身份系統

- Privy 整合（社交登入 → 自動產生 AA 錢包）
- L1 用戶基本資料
- L2 SBT 鑄造流程（zk-proof 驗證券商月結單）
- L4 商戶認領流程（KYC + SFC 牌照驗證）

#### 1.2 評論功能

- 散戶端：找券商 → 寫評論 → 上鏈
- 評論內容 hash 上鏈，完整文字存 IPFS
- 評論顯示（按時間 / 按 SBT 等級加權）
- 三語言支援（自動 AI 翻譯，標明「機器翻譯」）

#### 1.3 商戶後台

- Console 登入（KYC 後）
- 認領專頁
- 上傳 logo / 介紹（DB，可改）
- 看到自家評論列表
- 訂閱通知

#### 1.4 預載資料

- AI 爬取 SFC 持牌證券商清單，預先建檔
- 用戶看到的不是空白頁，是「該家 X 還沒人評論」

### Phase 1 完成定義

- ✅ 用戶可從零完成：登入 → 找券商 → 寫評論 → 看到鏈上紀錄
- ✅ 至少 1 家券商可走完認領流程
- ✅ 至少 50 條真實鏈上評論
- ✅ 三語言切換正常

---

## Phase 2：MVP-B KOL 訊號

### 目標

財演 / KOL 可在平台發訊號，鏈上記錄勝率。

### 主要功能

#### 2.1 KOL 認領

- 綁定 YouTube / IG / Twitter 帳號
- 拍攝自證影片
- KYC 驗證
- 取得 SBT (KOL Level)

#### 2.2 訊號發送

- 標的：股票 / 加密 / 外匯
- 訊號類型：買 / 賣 / 持有 + 目標價 + 止損
- 智能合約 `SignalLogger.emit(...)`
- 訊號**自動關連市場價格 oracle**（Chainlink）

#### 2.3 業績 Dashboard

- 每位 KOL 的歷史訊號完整呈現
- 自動計算勝率、最大回撤、盈虧比
- 訊號是否「打中」由 oracle 客觀判定
- 公開可驗證的鏈上計算

#### 2.4 訂閱

- 用戶可訂閱特定 KOL
- 訊號發出時推播
- Phase 2 不收費，純資料公開

### Phase 2 完成定義

- ✅ 至少 3 位 KOL 完成認證並發出訊號
- ✅ Dashboard 正確顯示鏈上資料
- ✅ 至少 100 筆訊號上鏈

---

## Phase 3：MVP-C 陪審團 V1

### 目標

用戶投訴 → 陪審團仲裁 → 結果上鏈，但用簡化版機制（不引入完整 token economy，避開 VATP 監管）。

### 主要功能

#### 3.1 投訴提交

- 用戶提交投訴 + 證據（截圖、聊天紀錄、月結單）
- 證據上 IPFS，hash 上鏈
- 通知被投訴方

#### 3.2 雙方答辯

- 被投訴方有 7 天提交反駁
- 雙方各自證據對等呈現

#### 3.3 陪審抽選

- 從 L3「創始陪審員」池中**鏈上隨機**抽 5 位
- 用 Chainlink VRF 確保隨機性

#### 3.4 投票

- 陪審員 7 天內投票
- 多數決（3:2）
- 結果上鏈

#### 3.5 結果展示

- 在被投訴方專頁顯示「鏈上仲裁紀錄」
- 透明可查，**不可刪除**

### Phase 3 完成定義

- ✅ 至少 1 個完整投訴 → 仲裁 → 結果完整跑完
- ✅ 機制**架構支持**未來引入質押 + 代幣（不需要重寫）
- ✅ 鏈上隨機抽選正確運作

---

## Phase 4：申請基金 + 內測

### 目標

產品打磨到能 demo，送出 CCMF 申請。

### 工作項目

#### 4.1 產品打磨

- UI 細節 polish（找設計師調整 1-2 週）
- 跨瀏覽器測試
- 行動裝置 RWD
- 三語言文案校對

#### 4.2 文檔與 demo

- 製作 demo 影片（中英文）
- 完成 BP（Business Plan）
- 製作架構簡報
- 退休 SFC 高層董事正式加入

#### 4.3 種子用戶

- 30-50 位邀請制陪審員（業界前輩）
- 100-200 位邀請制散戶測試者
- 收集 bug 與回饋

#### 4.4 申請材料

- CCMF 表格填寫
- 補件
- 送出

### Phase 4 完成定義

- ✅ CCMF 申請已送出
- ✅ Demo 影片完成
- ✅ 至少 200 位真實用戶在用

---

## Phase 5：公測 + 第二輪基金

### 預計時程

拿到 CCMF 後 3-6 個月。

### 主要工作

- 公開上線
- 行銷投放（小規模）
- 第二輪基金申請（HKSTP / Cyberport 50 萬等級孵化器）
- 引入更多 KOL
- 處理規模化議題（DB 讀寫分離、CDN 調優）

---

## Phase 6+：地區擴張與多元金融

### 預計時程

2027+

### 可能方向

- 台灣、新加坡證券商評論
- 香港保險、強積金、信託
- 加密貨幣交易所評論
- 機構級 API 訂閱
- 引入 utility token（觀察 VATP 監管走向後決定）

---

## 路線圖更新規則

- **每個 Phase 結束**必須更新本檔
- **Phase 內部進度**更新在 `03-status.md`
- **跨 Phase 重大調整**必須有 ADR 記錄

---

## 關連文件

- 願景：[`00-vision.md`](./00-vision.md)
- 架構：[`01-architecture.md`](./01-architecture.md)
- 當前狀態：[`03-status.md`](./03-status.md)
