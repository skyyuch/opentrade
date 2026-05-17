# OpenTrade — AI Agent Briefing

> 這份文件是任何 AI agent（Cursor / Claude / Codex / 其他）進入 OpenTrade 專案的**第一站**。
> 在做任何事情之前，**必須先完整閱讀本檔，並依下方流程啟動 session**。

---

## 你正在參與的項目

**OpenTrade** 是一個以香港金融市場為起點的 **Web 3.0 去中心化金融服務評論平台**。

- **目標市場（Phase 1）**：香港持牌證券商、財經 KOL（俗稱「財演」）、技術指標賣家
- **核心差異**：用區塊鏈不可篡改特性，解決外匯天眼 (WikiFX) 等 Web 2.0 平台「收費刪負評」的不公正問題
- **核心機制**：
  1. 用戶評論上鏈（不可刪、不可改）
  2. 財演策略訊號上鏈（杜絕「贏了高調、輸了刪文」）
  3. 用戶投訴 → 去中心化陪審團仲裁
- **資金路徑**：MVP → 香港數碼港 CCMF → 創科局基金 → 創投

完整願景見 [`docs/00-vision.md`](docs/00-vision.md)。

---

## Session 啟動流程（每個 AI agent 進來都必須跑一次）

> **這不是建議，是強制流程。**

### Step 1：閱讀必讀文件（依序）

1. 本檔 `AGENTS.md`
2. `docs/00-vision.md` — 理解產品定位
3. `docs/03-status.md` — 理解當前進度（這份文件最動態，每 session 必看）
4. `docs/02-roadmap.md` — 理解現在處於哪個 Phase
5. `docs/decisions/` 最近 5 份 ADR — 理解最近的架構決策
6. `.cursor/rules/` 全部規則 — Cursor 會自動載入，但你要主動意識其存在

### Step 2：回報

完成 Step 1 後，第一句話必須是：

> 「我已掌握當前項目狀態：[2-3 句摘要]。當前 Phase：[X]。下一步預期：[Y]。請確認後我開始工作。」

等使用者確認，才能動手。

### Step 3：開工前拆解任務

任何符合下列條件之一的任務，**禁止直接動手**，必須先用 `TodoWrite` 拆解：

- 涉及 2 個以上檔案
- 涉及 2 個以上 layer（前端 / API / DB / 合約）
- 預期超過 30 分鐘工作量
- 屬於新功能、重構、或架構變更

詳見 `.cursor/rules/96-task-decomposition.mdc`。

---

## 紅線（永遠不能違反）

這些是 OpenTrade 的**絕對禁止事項**，違反等於毀掉整個項目的核心承諾：

### 業務紅線

- ❌ **絕對不可以實作「平台可刪除使用者評論」的功能**
  - 評論上鏈後不可刪是項目存在的根本原因
  - 即使是 admin，也只能「標註」不能「刪除」鏈上資料
- ❌ **絕對不可以實作「商戶付費影響評論顯示順序」的功能**
  - 這會讓 OpenTrade 變成第二個外匯天眼
- ❌ **不可以發表任何投資建議**
  - 平台只是純資訊呈現，所有 UI 必須附 disclaimer
  - 觸及香港 SFC 第 4 類牌照風險

### 技術紅線

- ❌ **不可以寫死任何 API key、私鑰、合約地址、DB 密碼** → 一律走 env / Secrets Manager
- ❌ **前端絕對不能直連資料庫** → 一律走 API
- ❌ **不可以在 server log 寫入 PII（個資）原始資料** → 必須先脫敏 / hash / zk-proof
- ❌ **合約不可以有 owner-only 修改評論的函數** → 違反不可篡改承諾
- ❌ **不可以寫死任何特定鏈（Base）** → 所有鏈相關設定走 config，保持 OP Stack 通用
- ❌ **Smart contract 不可以使用未經審計的 library** → 必須用 OpenZeppelin

### 流程紅線

- ❌ **不可以在 session 結束時不更新 `docs/03-status.md`**
- ❌ **不可以在做完重要決策後不寫 ADR**
- ❌ **不可以一個 commit 超過 300 行 diff**（migration、locale、自動產生檔案除外）
- ❌ **不可以略過測試直接 commit**（`pnpm typecheck` + 相關 test 必須 pass）

---

## Session 結束前必做（強制 Handoff 流程）

無論是「使用者說今天到此」、「Agent 自己判斷該換 session」、或「自然完成一個 phase」，都要：

1. ✅ 更新 `docs/03-status.md`：當前進度、下一步、未決問題
2. ✅ 若有新決策 → 寫 ADR 到 `docs/decisions/`
3. ✅ 若對話有重要內容 → 歸檔到 `docs/conversations/YYYY-MM-DD-主題.md`
4. ✅ 檢視 `.cursor/rules/` 是否需要更新
5. ✅ 列出新 session 第一個 prompt 建議（給使用者直接複製貼）

詳細觸發條件見 `.cursor/rules/98-session-handoff.mdc`。

---

## 工作風格

- **使用者主要語言**：繁體中文（Traditional Chinese, zh-Hant）
- **commit message / code comment / 變數命名**：英文
- **docs/ 與對使用者的回應**：繁體中文
- **永遠先拆細任務，再執行**
- **永遠先 commit 小步，再走下一步**
- **永遠不在沒測試的情況下推進**

---

## 重要工具與框架（必須遵守）

| 類別      | 選型                                         | 不可改用其他 |
| --------- | -------------------------------------------- | ------------ |
| Monorepo  | pnpm + Turborepo                             |              |
| 前端      | Next.js 14 (App Router) + TypeScript         |              |
| UI        | Tailwind + shadcn/ui                         |              |
| i18n      | next-intl（繁中、簡中、英文）                |              |
| Web3 前端 | wagmi v2 + viem + Privy                      |              |
| API       | Hono on Node.js                              |              |
| DB        | PostgreSQL (RDS) + Prisma ORM                |              |
| 智能合約  | Solidity + Foundry + OpenZeppelin            |              |
| 鏈        | Base L2（架構保持 OP Stack 通用）            |              |
| 雲端      | AWS（RDS、ECS Fargate、S3、Secrets Manager） |              |
| IaC       | Terraform                                    |              |
| CI/CD     | GitHub Actions                               |              |
| UI 開發   | Storybook（獨立工作流）                      |              |
| 測試      | Vitest + Playwright + Forge                  |              |

任何要改用其他工具的提案，**必須先寫 ADR 並讓使用者拍板**。

---

## 相關連結

- 專案願景：[`docs/00-vision.md`](docs/00-vision.md)
- 技術架構：[`docs/01-architecture.md`](docs/01-architecture.md)
- 路線圖：[`docs/02-roadmap.md`](docs/02-roadmap.md)
- 當前狀態：[`docs/03-status.md`](docs/03-status.md)
- 術語表：[`docs/04-glossary.md`](docs/04-glossary.md)
- 架構決策：[`docs/decisions/`](docs/decisions/)
- 對話歸檔：[`docs/conversations/`](docs/conversations/)

---

**最後更新**：2026-05-17
**維護者**：項目負責人 + 所有貢獻過的 AI agents
