# 初始規劃對話 — 2026-05-17

> 本文件歸檔 OpenTrade 項目第一次完整規劃對話的精華內容。
> 這份對話奠定了所有後續架構決策的基礎，未來任何 AI agent / 新成員必讀。

---

## 對話脈絡

- **日期**：2026-05-17
- **參與者**：項目負責人（CFD 業界從業者） × Claude Opus 4.7（規劃 AI）
- **背景**：項目負責人原本與 Google Gemini 討論過產品概念，決定以此次對話為基礎正式啟動項目
- **產出**：本次 commit（Commit #1）的所有文件 + Cursor Rules + 10 份 ADR

---

## 一、項目起源

項目負責人是香港 CFD 行業多年從業者，與幾位同行觀察到：

1. **獲客成本極高**：CFD 行業競爭激烈，獲客 cost 高
2. **平台經營風險大**：盈虧管理壓力沉重
3. **WikiFX 不公正**：業界普遍反映外匯天眼存在「付費刪負評」、「不付廣告費就被攻擊」等問題

→ 萌生「做一個公平、公開的金融服務評論平台」想法。

關鍵戰略決策：**不在 Web 2.0 跟 WikiFX 拼流量**（它太大，撼動不了），改用 **Web 3.0 不可篡改特性進行降維打擊**。

---

## 二、產品核心構想

### 不要「評分」，要「評論」

- 同樣是 SFC 持牌券商，分數高低如何判定？
- 持牌與沒持牌的差距如何量化？
- 結論：放棄評分，學 **OpenRice / Glassdoor**，用「好評 / 差評 / 一般」標籤

### 三大殺手級機制

1. **去中心化陪審團**（仿 Kleros）：用戶投訴 → 雙方提供證據 → 用戶陪審投票 → 結果上鏈不可改
2. **財演策略智能合約化**：KOL 喊單訊號上鏈，無法刪除竄改，鏈上勝率公開可驗證
3. **OpenRice 式評論**：散戶簡單表態，不需要懂專業評分

### MVP 收窄聚焦（戰略決策）

原本想做全金融（外匯、證券、黃金、保險），但太龐大，**收窄到香港**：

- 持牌證券商（補 SFC 不管的「使用體驗」）
- 財演 / KOL（鏈上業績認證）
- 技術指標賣家（鏈上歷史不可竄改）

→ 快速 MVP → 申請數碼港 / 創科局基金 → 認識人脈 → 發展其他金融類別

---

## 三、技術架構討論精華

### 鏈的選擇（→ ADR-0001）

考慮過：Ethereum、Base、Arbitrum、Optimism、Polygon、Solana、BNB、自建 L3。

**結論：Base L2**（Coinbase 背書、HK 認可度高、EVM、gas 極低、AI 教材豐富）。

但**架構從第一天就保持 OP Stack 通用**，不寫死 Base，未來可遷移多鏈。

### 雲端選擇（→ ADR-0002）

項目負責人明確要求：「**所有方案都不要臨時快速解案，而是徹底長遠的方案**」

→ 從原本建議的 Vercel + Supabase 升級到 **AWS 全棧 + Terraform**。

選擇理由：金融類產品需要 AWS 級的合規能力、災備、IAM、監管溝通。

### Account Abstraction（→ ADR-0005）

項目負責人並非開發背景，使用者多為非 Web3 用戶。

→ 採用 **Privy** 做 AA + Paymaster：使用者用 Google 登入即可，自動產生錢包，gas 由平台代付。

### Web 2.5 混合（→ 多份 ADR）

不是「全部上鏈」也不是「全部 DB」：

- **公開且不可變**（評論 hash、KOL 訊號、陪審結果）→ 鏈上 + IPFS
- **私密且可變**（商戶介紹、用戶 profile、翻譯快取）→ DB

---

## 四、項目負責人的關鍵要求

對話中項目負責人提出多個關鍵要求，全部寫入 Cursor Rules / AGENTS.md：

### 1. 「徹底長遠方案」原則

> 「所有方案都不要臨時快速解案，而是徹底長遠的方案」

→ 從第一天就：

- DDD + Modular Monolith 架構（→ ADR-0006）
- Multi-tenant ready（DB schema 從第一天有 tenantId）
- UUPS Proxy 升級代理（合約可升級但需 timelock）
- Multi-chain ready（OP Stack 通用，不寫死 Base）
- IaC（Terraform）從第一天
- CI/CD 從第一天
- Observability 從第一天

### 2. 三語 i18n（→ ADR-0003）

> 「語言要繁，簡，英」

→ 從第一天就用 next-intl 三語架構，繁中為預設。

### 3. DB 獨立疑慮 → 確認 L1-L4 都獨立

對話中項目負責人擔心 DB 不夠獨立。釐清「獨立」有多個層次：

- L1 實體獨立 ✅（RDS）
- L2 網路獨立 ✅（VPC private subnet）
- L3 程式碼獨立 ✅（packages/db）
- L4 部署獨立 ✅（自己的 GitHub Action）
- L5 服務獨立（微服務化）❌ 不選，避免 over-engineering

### 4. 跨 Session 不漏資訊（→ Cursor Rules 96-99）

> 「項目規模很大，但同一個 agent 對話不可能做完，要如何才不會令今天聊的計劃漏掉」

→ 建立四層「項目記憶系統」：

- L1: AGENTS.md
- L2: .cursor/rules/
- L3: docs/（含 ADR、conversations、status）
- L4: GitHub Issues

並建立 Cursor Rules 強制機制：

- 進 session 必讀文件
- 結束 session 必更新 status
- Auto handoff 提醒（→ rule 98）
- Self-review rules（→ rule 99）

### 5. UI 獨立做（→ ADR-0009、ADR-0010）

> 「做用戶及商戶後台 UI 時，需要獨立做，因為 UI 很重要，能不能吸引投資者及創科局」

→ 兩個獨立 Next.js app（apps/web、apps/console）+ packages/ui 設計系統 + Storybook 獨立工作流。

### 6. 自動建議換 Agent（→ Cursor Rule 98）

> 「rules 加一個、自動判斷提醒我建議開一個新 agent」

→ Rule 98-session-handoff 設計七大觸發條件，達成任一即提醒換 session，並提供完整 handoff 流程。

### 7. 拆細任務提升品質（→ Cursor Rule 96）

> 「過去使用 cursor 開發時，發現一個問題，就是如果將工作分拆細分，質量會比較好。現時有 sub agent 會有改善嗎，還是細分拆會比較好？」

對話結論：**拆細是根本，subagent 是輔助**。

→ Rule 96-task-decomposition：

- 任務符合條件必先拆解（用 TodoWrite）
- 一次只 in_progress 一個
- subagent 用於並行探索、批次重複工作
- 寫業務 code 主 agent 自己做，不 delegate

---

## 五、商業與合規討論

### 商業模式紅線

對話確立的「絕對不做」：

- ❌ 收費刪評論（會變第二個 WikiFX）
- ❌ 商家付費影響顯示順序
- ❌ V1 發行自有代幣（VATP 監管風險）

可行收入路徑：

1. B 端 SaaS 工具費（dashboard、API、客戶情緒分析）
2. 爭議仲裁協議費
3. 資料 API 授權
4. 政府 / 機構合作

### 合規定位

- 不需要 SFC 牌照（純技術服務商）
- 避開第 4 類牌照（提供意見）→ 平台不做整理推薦榜
- 避開 VATP → V1 用 Points 系統不發 token（→ ADR-0007）
- PDPO → zk-proof 處理 KYC 證明，原始資料不上鏈

### 顧問配置

項目負責人提到：規劃中**邀請退休 SFC 高層作為董事**，這對申請基金、與監管溝通有重大加分作用。

---

## 六、討論到的有用對標

### 競品分析（將寫入 docs/competitor-analysis.md，Phase 0 後期）

| 平台            | 借鑒點                                                  |
| --------------- | ------------------------------------------------------- |
| WikiFX 外匯天眼 | **反面教材**：付費刪負評是死穴                          |
| Glassdoor       | ⭐ **Give-to-Get** 機制：用戶必須先貢獻才能解鎖完整資料 |
| G2 (B2B)        | ⭐ **驗證等級 = 評論顯示權重**                          |
| Trustpilot      | 反面教材：付費影響排名                                  |
| DeBank          | ⭐ **鏈上身份 = 信譽分**                                |
| Kleros          | ⭐ **去中心化法院**機制原型                             |

### Glassdoor「Give-to-Get」對 OpenTrade 的應用（重要）

> 用戶要看券商完整評論前，必須先綁定一個 SBT（透過上傳該券商月結單做 zk-proof）

這同時解決：

1. 冷啟動有貢獻誘因
2. 自然防 Sybil（沒帳戶就沒 SBT）
3. 評論權重可依 SBT 數量加權

---

## 七、Phase 規劃（→ docs/02-roadmap.md）

| Phase    | 名稱            | 時程   |
| -------- | --------------- | ------ |
| Phase 0  | 地基            | 1-2 週 |
| Phase 1  | MVP-A 鏈上評論  | 3-4 週 |
| Phase 2  | MVP-B KOL 訊號  | 3-4 週 |
| Phase 3  | MVP-C 陪審團 V1 | 4-5 週 |
| Phase 4  | 申請基金 + 內測 | 2-3 週 |
| Phase 5+ | 公測 + 擴張     | 持續   |

**目標**：Phase 0-3 在 12-16 週完成，趕上 CCMF 申請窗口。

---

## 八、本次 session 產出清單

### Commit #1：文件骨架 + Cursor Rules

- [x] `AGENTS.md`
- [x] `README.md`
- [x] `.gitignore`、`.editorconfig`
- [x] `docs/00-vision.md`
- [x] `docs/01-architecture.md`
- [x] `docs/02-roadmap.md`
- [x] `docs/03-status.md`
- [x] `docs/04-glossary.md`
- [x] `docs/decisions/README.md`
- [x] `docs/decisions/0001-base-l2.md` ~ `0010-split-web-and-console.md`
- [x] `docs/conversations/2026-05-17-initial-planning.md`（本檔）
- [x] `docs/grant-application/README.md`
- [x] `.cursor/rules/` 17 條規則

### 待後續 commit 處理

- [ ] Commit #2：Monorepo 骨架（pnpm + Turborepo）
- [ ] Commit #3-#5：各 package 初始化
- [ ] Commit #6：設計系統 + Storybook 雛形
- [ ] Commit #7：Terraform IaC 雛形
- [ ] Commit #8：CI/CD GitHub Actions

---

## 九、未決議題（轉至 docs/03-status.md 追蹤）

- AWS 帳號設定（個人 / 公司）
- 預算上限
- 設計師資源
- 退休 SFC 高層董事正式加入時程
- 種子陪審員邀請名單（Phase 4 前要備妥）
- License 選擇
- AI 翻譯服務優先序

---

## 十、給未來 AI agent 的建議

如果你正在讀這份歸檔（無論你是哪個 session 的 agent），請理解：

1. **本項目不是普通的 MVP demo，是要做給香港政府基金與機構級審視的長遠項目**
2. **「徹底長遠方案」是項目負責人最堅持的原則**，任何「先這樣後面再改」的提議都要慎重
3. **公正、不可篡改、不被金錢污染**是 OpenTrade 的根本承諾，所有設計必須符合
4. **項目負責人不是技術背景**，但有強烈的戰略洞察與業界資源；技術判斷上應主動給專業建議，戰略判斷上應尊重其決策
5. **task decomposition 是品質根本**：任何複雜任務先用 TodoWrite 拆解再執行
6. **所有重要決策必有 ADR**：你做了任何架構級決定，必須寫一份新 ADR

---

## 對話 metadata

- 對話 token 估算：~120k（涵蓋本次完整規劃）
- 主要 AI 模型：Claude Opus 4.7
- 對話風格：項目負責人提出問題 → AI 給多種選項分析 → 項目負責人決策 → AI 落地實作
