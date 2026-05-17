# ADR-0007: V1 不發行自有代幣，使用積分系統

## Status
Accepted

## Date
2026-05-17

## Context

OpenTrade 的陪審團 / 評論激勵機制理論上需要 token economy 才完整運作（質押、獎勵、抽成）。但是：

1. **香港 SFC 對 VATP（虛擬資產交易平台）牌照管得越來越嚴**
2. **發行原生 token 可能被詮釋為**：
   - 證券發行（觸 Type 1 牌照）
   - 集資（觸 SFC 公開招股規範）
   - 虛擬資產發行（觸 VATP）
3. **香港 ITC（創科局）/ 數碼港對「ICO 類項目」高度警惕**
4. **發 token 後若監管收緊，可能整個項目被迫遷移地區**

但完全不做激勵又會無法跑陪審 / 評論獎勵機制。

## Decision

**Phase 1-3 (V1) 不發行任何自有代幣**，改用「**積分（Points）系統**」：

### Points 系統設計

- **儲存位置**：DB（不上鏈）
- **不可轉讓**：純內部記帳，不能在外交易
- **不可換現**：明確規定 Points 不等同貨幣，無法變現
- **可消耗**：用於享受平台特定功能（例如：換取「優先陪審員」資格）
- **可累積**：寫高質量評論、正確投票仲裁可獲得

### 等同 Web2 行為的法律定位

- 類似航空公司「里程」、餐廳「會員點數」
- 不觸及 SFC、VATP、證券法
- 不需要任何虛擬資產牌照

### 觀察期：2-3 年

- Phase 1-5 期間：純積分制
- 持續觀察香港 VATP 政策、Web3 友善政策走向
- 若監管環境清晰、項目規模成熟，**Phase 6+ 再考慮 token 化**
- 屆時 Points → Token 的遷移路徑保留設計彈性

## Alternatives Considered

### Alternative A: V1 直接發 token
- **Pros**：完整 token economy，陪審 / 質押機制完整
- **Cons**：
  - 監管風險高，可能整個項目被迫遷移
  - 申請數碼港 / ITC 基金時 narrative 困難
  - 容易被詮釋為「ICO 項目」，吸引短線投機者而非真實使用者
  - 增加複雜度（合約、價格管理、流動性）
- **結論**：不選

### Alternative B: V1 用 testnet token，無實際價值
- **Pros**：跑通流程，避開真實價值
- **Cons**：
  - 對使用者而言「沒價值」=「沒激勵」
  - 仍可能被詮釋為 token 發行
- **結論**：不選

### Alternative C: V1 用穩定幣（USDC）做激勵
- **Pros**：避開自有代幣風險
- **Cons**：
  - 平台需自掏腰包提供 USDC，財務不可持續
  - 仍涉及虛擬資產處理，可能觸 VATP
- **結論**：規模化後可能用於陪審獎金，V1 不做

### Alternative D: 完全不做激勵
- **Pros**：合規最安全
- **Cons**：陪審員無動機、評論者無誘因，平台冷啟動更難
- **結論**：不選

### Alternative E: NFT-based 激勵（SBT 升級）
- **Pros**：身份榮譽感
- **Cons**：與 Points 機制可並存（事實上會並存：Points 累積 → 升等 SBT）
- **結論**：採用，但與 Points 並行而非取代

## Consequences

### Positive
- **完全避開 VATP 監管風險**
- 申請數碼港 / ITC 基金 narrative 乾淨
- 不會吸引短線投機者，使用者真實度高
- 開發複雜度降低（不需要 token 經濟模型 / 流動性 / oracle）
- 法律定位類比航空里程，先例多

### Negative / Trade-offs
- 陪審 / 評論激勵不如 token 直接（但配合 SBT 升等 + 榮譽感可彌補）
- Phase 6+ 想 token 化時，舊 Points 如何 migrate 需設計
- Web3 圈子對「沒 token 的 Web3 項目」可能不感興趣（但我們目標是 Web2 用戶，這不是問題）

### Neutral
- 提早跟監管溝通需求變低
- 無需 audit token 合約

## Implementation Notes

### 必須遵守的設計

- **Points 永遠不能進合約**（合約不持有 Points 邏輯）
- **Points 邏輯純後端 DB**：`packages/db` 有 `user_points` 表
- **任何積分相關 UI 必須避免「貨幣」用詞**：
  - ❌ 不用「賺」、「收入」、「兌換」、「提現」
  - ✅ 用「獲得」、「累積」、「兌換」（指功能而非貨幣）

### Points 累積規則範例（待 Phase 1 細化）

| 行為 | 獲得 Points |
|---|---|
| 寫一條經 SBT 驗證的評論 | +10 |
| 寫被多人「有用」標記的評論 | +20 |
| 正確參與陪審投票（與最終結果一致） | +50 |
| 連續 30 天活躍 | +100 |

### Points 消耗規則範例

| 行為 | 消耗 Points |
|---|---|
| 升級為「優先陪審員」（一次性） | 1,000 |
| 提交投訴（避免濫用） | 100 |
| 解鎖「高級評論篩選器」 | 500 |

### 嚴禁事項

- ❌ 任何 UI / 文案暗示 Points 可換取真實貨幣
- ❌ 任何允許 Points 在使用者之間轉移的功能
- ❌ 上架到任何代幣交易所
- ❌ 與其他項目進行 Points swap

### 未來 Token 化的遷移路徑（Phase 6+ 設計）

若監管環境允許，可考慮：
1. 凍結 Points 累積某天 X
2. 發行 OPEN token，Points snapshot 1:1 鑄造（或某倍率）
3. 過渡期 Points 仍可正常用，Token 與 Points 並存 6 個月
4. 屆時 Token 用途擴展（陪審質押、治理投票等）

但**必須是經過完整法律審查、有 audit、有監管溝通**才能做。

## References

- [HK SFC VATP 牌照規範](https://www.sfc.hk/-/media/EN/files/COM/Reports-and-surveys/VATP-Updated_Guidance-Final-EN.pdf)
- [docs/00-vision.md 第八節](../00-vision.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
