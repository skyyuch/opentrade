# Conductor 放寬：TG 起草 spec → ratify → grind（ADR-0055）+ 股東 backlog 入 repo — 2026-06-22

> 本文件歸檔 OpenTrade 項目「如何讓 cursor-conductor 自動化整份功能 backlog」的對話精華，以及由此產生的 ADR-0055。

## 對話脈絡

- 日期：2026-06-22（接 KOL §6 測試補齊 session 的後段）
- 參與者：項目負責人（owner）＋ AI agent（Claude Opus 4.8，Cursor IDE 互動式 session）
- 背景：KOL 類別 vertical 全段（含測試）剛收官；owner 想把剩餘功能 backlog 自動化，問「為什麼不自動切下個 agent 做券商比較、有問題在 TG 問我」。

## 主要討論內容

### 1. 股東 backlog 從 plan 檔 port 進 repo

- owner 指出 KOL 類別做完卻沒更新 `~/.cursor/plans/feature-prioritization-roadmap_e493bbf2.plan.md`（repo 外的 Cursor plan 工件）。
- 先更新 plan 檔（`kol-category` → completed、剩餘四項重編號），再把內容 port 進 repo **`docs/05-feature-backlog.md`**（股東溝通版，與工程視角的 `02-roadmap.md` 區分），從 `02-roadmap.md`/`03-status.md` 交叉引用，避免「repo 內外兩份漂移」。決議：repo 版為權威，plan 檔退化為 Cursor plan-UI 的 todo 追蹤器。

### 2. 為什麼這個 session 不會自動接力

- conductor（ADR-0052）是**外部工具**（`~/dev/cursor-conductor`），需 owner 手動啟動、`--project` 指向 repo，才會逐 unit 開新 agent。互動式 IDE chat 無法自己生 agent、也不能發 TG。
- 即使啟動，conductor 只 grind **已決策、已拆解**的 unit，碰「需要新 ADR / 架構決策」或 `packages/contracts`/security/`infra` 一律硬停。券商比較沒 ADR、沒拆解 → 起手即撞圍欄。

### 3. owner 提案：大需求細項由 TG 問來「制定需求」

- owner 想把「需求定義」本身也搬進 conductor loop（TG 問答制定需求），認為更大更靈活。
- agent 的關鍵釐清：**conductor 早就能把 clarification 走 TG（D3）**；要放大的是把它推到「需求定義 / ADR 起草」。
- 但兩個東西不能丟：(a) rule 97 要求需求落地成**寫下來、可引用的 ADR**，不能只活在 TG 對話（否則拿專案的耐久文件資產換易失聊天）；(b) rule 00 紅線不能被一個 TG tap waive。

### 4. 拍板的「可控放大」→ ADR-0055

`spec → ratify → grind`：

- **spec unit**：fresh agent 用 TG 連續問設計問題 → 寫成 **draft ADR（Proposed）+ 拆解**進 repo，**只准寫 `docs/decisions/**`、不准產品 code\*\*（檔案路徑圍欄）。
- **ratify gate**：spec 後硬停；ADR 沒 flip Accepted 前不 grind。非紅線/非敏感 ADR 可 **TG approve** 批；碰紅線/敏感區必**鍵盤** ratify。
- **grind**：照 ADR-0052 不變（feature branch / 不 merge / gate / PR-on-done / admin-merge 仍人類動作）。
- **永遠硬停、不可 waive**：rule 00 紅線（不付費排名/不總分排名/不投資建議/不改鏈上/不刪評論）＋ `packages/contracts`/security/`infra`。

owner 當場 ratify（「同意」），ADR-0055 → Accepted。

## 產生的 ADR

- **ADR-0055**：Telegram-driven spec/ADR drafting then owner ratification before grind（amends ADR-0052）。

## 待後續處理事項

- **conductor 外部 repo（`~/dev/cursor-conductor`）需實作**（OpenTrade 端碰不到）：
  1. **spec-unit run mode** — drafts 一份 `Proposed` ADR 到 `docs/decisions/NNNN-*.md` + 拆解 → 結束（不寫產品 code）。
  2. **ratify gate** — 拒絕啟動執行 unit，直到 branch 上該 ADR `Status` = `Accepted`（或收到「非敏感」的 TG ratify）。
  3. **spec-unit 檔案路徑圍欄** — 只准 spec unit 寫 `docs/decisions/**`（碰其他路徑＝硬停，defense in depth）。
  4. 沿用 ADR-0052 既有：feature-branch-only、gate（`pnpm typecheck`/`lint`）+ new-commit check、PR-on-done、紅線/敏感區檔案路徑硬停、Telegram bridge（`CURSOR_API_KEY` + bot token 在 conductor `.env`）。
- **試點**：券商比較（fence-safe execution after ratify）。**陪審團/投訴仲裁維持人類主導**（合約 + security 硬停區）。
- 報價 / 新聞：各需先一份合規 ADR（可走 spec unit 起草 → owner ratify）。

## 給未來 AI agent 的建議

- 此流程**已授權但尚不可跑**，直到 conductor 端把上述三項實作完。在那之前，互動式 session 仍照 rule 98 手動 handoff。
- 任何「制定需求」的自動化，最終都必須落地成 repo 裡一份 **owner 拍板的 ADR**；TG 只是問答管道，不是決策權威。
- 紅線（rule 00）與 contracts/security/infra 永遠是人類鍵盤動作，conductor 不可代決。
