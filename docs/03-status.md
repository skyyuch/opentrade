# OpenTrade 當前狀態

> ⚠️ **這是項目最動態的文件，每個 session 必讀必寫。**
> 任何 AI agent 開始工作前，必須先讀本檔取得最新進度。
> 任何 AI agent 結束 session 前，必須更新本檔。

---

## 最後更新

- **日期**：2026-05-17
- **更新者**：初始規劃 session（Claude Opus 4.7）
- **本次更新摘要**：建立項目記憶系統、完成 Commit #1 的文件骨架部分

---

## 當前 Phase

**Phase 0：地基搭建**

進度：30%

---

## 已完成

### Commit #1：文件骨架 + Cursor Rules（本次 session）

- [x] 建立目錄結構 `docs/`、`.cursor/rules/`
- [x] `AGENTS.md` 根層 AI briefing
- [x] `README.md`
- [x] `.gitignore`
- [x] `.editorconfig`
- [x] `docs/00-vision.md` 願景
- [x] `docs/01-architecture.md` 架構
- [x] `docs/02-roadmap.md` 路線圖
- [x] `docs/03-status.md` 本檔
- [ ] `docs/04-glossary.md` 術語表
- [ ] `docs/decisions/` ADR 0001-0010
- [ ] `docs/conversations/2026-05-17-initial-planning.md` 對話歸檔
- [ ] `docs/grant-application/README.md`
- [ ] `.cursor/rules/` 17 條規則

---

## 進行中

無（本 session 完成 Commit #1 後即停止 / 換手）。

---

## 下一步（按優先序）

### 立即（下個 session）

1. **Commit #2：Monorepo 骨架**
   - 初始化 `pnpm + Turborepo`
   - 建立 root `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`tsconfig.base.json`
   - 設定 ESLint + Prettier
   - 設定 Husky + lint-staged

2. **Commit #3-#5：各 package 初始化**
   - 根據 [`01-architecture.md`](./01-architecture.md) 第三節結構初始化各 package

3. **Commit #6：設計系統 + Storybook**
4. **Commit #7：Terraform IaC 雛形**
5. **Commit #8：CI/CD GitHub Actions**

### 中期（Phase 1）

完成 Phase 0 所有 commit 後，進入 Phase 1 MVP-A（鏈上評論功能），詳見 [`02-roadmap.md`](./02-roadmap.md)。

---

## 待決策（懸而未決的問題）

### 環境 / 帳號層級

- ❓ **GitHub 帳號 / Org**：個人 or organization？建議建一個 GitHub Org `opentrade-hk`
- ❓ **GitHub repo 名稱**：建議 `opentrade`
- ❓ **AWS 帳號**：是否已有？要建 dev/staging/prod 三帳號還是先一個？
- ❓ **網域**：opentrade.io / opentrade.hk / opentrade.app — 之後再決定，不影響開發
- ❓ **AI 翻譯服務**：DeepL（質量最好）vs OpenAI（便宜）— 預設 DeepL 主、GPT 備援

### 業務層級

- ❓ **退休 SFC 高層董事人選**：何時正式加入？影響合規定位 narrative
- ❓ **預算上限**：本季 / 本年度的開發預算（影響 AWS 規模、設計師外包）
- ❓ **第一批種子陪審員邀請名單**：Phase 4 需要 30-50 位

### 技術層級

- ❓ **License 選擇**：Business Source License 1.1 vs AGPL-3.0 — 上線前決定
- ❓ **設計師資源**：是否找 freelance 香港設計師（HK$30-80k 預算）做 Figma 高保真稿
- ❓ **KOL 訊號的 oracle**：Chainlink Price Feeds vs Pyth — Phase 2 開始前決定

---

## 已知風險

| 風險 | 嚴重度 | 緩解措施 |
|---|---|---|
| 沒有 Web3 開發經驗 | 中 | 用 Foundry + OpenZeppelin + AI 輔助；上主網前必做第三方 audit |
| 冷啟動使用者來源 | 高 | 種子陪審員（業界人脈）+ Glassdoor 式 Give-to-Get 機制 |
| 香港 SFC 第 4 類牌照風險 | 中 | 純技術定位 + disclaimer + 退休 SFC 董事背書 |
| KOL 不願意上鏈被監督 | 中 | 把不上鏈定位為紅旗，創造「上鏈 KOL」精英身分 |
| AWS 成本失控 | 低 | dev 環境用最低規格，prod 規模隨用戶增長 |
| AI 翻譯品質不夠 | 低 | DeepL + 標明「機器翻譯」+ 後續引入人工校對 |

---

## 重要連結

- AI Agent 入口：[`AGENTS.md`](../AGENTS.md)
- 願景：[`00-vision.md`](./00-vision.md)
- 架構：[`01-architecture.md`](./01-architecture.md)
- 路線圖：[`02-roadmap.md`](./02-roadmap.md)
- 術語：[`04-glossary.md`](./04-glossary.md)
- 架構決策：[`decisions/`](./decisions/)

---

## Session History

每個 session 結束時，在這裡新增一行（最新的在上面）。

| 日期 | Session 主題 | Agent 模型 | 主要產出 | Conversation Log |
|---|---|---|---|---|
| 2026-05-17 | 初始規劃 + 建立項目記憶系統 | Claude Opus 4.7 | Commit #1 文件骨架 | [link](./conversations/2026-05-17-initial-planning.md) |
