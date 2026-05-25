# 2026-05-25 團隊會議：擁抱監管 + Token 經濟 + Phase 2 戰略 — 2026-05-25

> 本文件歸檔 OpenTrade 項目 2026-05-25 第一場團隊會議的精華內容。
> 本場會議產生大量策略性內容，與既有 ADR 有 6 條衝突（C1-C6），影響 Phase 1 收尾、Phase 2 規劃、與對外資助申請時程。
> 本文件**依主題重排**，不依發言時間軸。原始逐字稿與 AI 摘要保留在 user 本機 `~/Downloads/05_25_會議：Web3_金融評分平台，代幣經濟，監管科技_*.md`，未上傳 repo（依 rule 50 涉及內部討論未公開內容）。

## 對話脈絡

- **日期**：2026-05-25
- **形式**：實體會議 (HK)
- **參與者**：Speaker 1（項目負責人 / 技術主導）、Speaker 2（策略 / 對外）、Speaker 3（合規 / 文件）、Speaker 4、Speaker 5（流量 / 行銷）
- **AI 模型**：Claude Opus 4.7（本歸檔由 AI agent 在 2026-05-25 19:00 整合）
- **背景**：Phase 1 ~99% 完成（Phase 1 (b) 全新-wallet E2E 全綠 per [2026-05-24-phase1-b-full-wallet-e2e.md](./2026-05-24-phase1-b-full-wallet-e2e.md)）。團隊回頭整盤策略，補上 Phase 2-4 商業化、資金、與監管溝通的方向。
- **下次會議**：2026-06-20（端午節後）
- **時間敏感截止日**：
  - 2026-05-29 至 2026-06-04 — Speaker 2 與 SmartTone 洽談
  - **2026-06-08** — Speaker 2 短篇文章（5-10 分鐘閱讀量）對外敘事材料截止
  - **2026-06-20** — 端午後團隊會面 + Pitch Deck (3/5/10 分版本) 期望準備好
  - 2026-07-01 至 2026-09-30 — 創科局資助申請窗口

## 主要討論內容

### 1. 戰略升級：擁抱監管 (Embrace Regulation) 為核心 narrative

會議拍板把專案 narrative 從「公正評論平台」升級為「**擁抱監管**」：

- 不再純然定位為「對抗 WikiFX 的 Web3 平台」，而是**主動為券商 / KOL 提供合規工具**、**與監管機構合作**、**半官方行業自律機構**
- 對外溝通三主軸：**Verify**（真偽核查）/ **Profile**（用戶 profile 價值化）/ **社群**（用戶參與）
- 香港 → 台灣 → 新加坡擴張路徑（與既有 [02-roadmap.md](../02-roadmap.md) Phase 6+ 一致）
- 引用「老虎證券、富途公告趨勢」作為「擁抱監管已是業界主流」的證據

### 2. 資金 / 商業策略

#### Token Economy（與 [ADR-0007](../decisions/0007-no-token-in-v1.md) 衝突）

- 仿 Asia Miles 模式打造「Cocaine Economy」（會議原話）：
  - B 端券商**購買**平台 Token，作為回饋用戶的 Loyalty Program
  - 用戶在券商交易 / 提供數據 → 換 Token → 兌換線上線下服務（如 Netflix 月費）
  - 跨業積分系統打通香港金融行業
- **與 [ADR-0007](../decisions/0007-no-token-in-v1.md) 直接衝突**（V1 不發 token 以避 VATP 牌照），需新 ADR superseding 或寫明 Phase 5+ 才啟動

#### SaaS + 廣告雙軌營收

- 評審偏好 SaaS（穩定現金流），對齊既有 vision §七
- 廣告位設計：主站不含廣告 / 另開身份 / 網站觀看廣告，公正性不受影響（類比 YouTube Premium 模式）
- 合作夥伴專頁月費

#### 資助申請

- **2026 Q3 提 Proposal** 申請創科局「十萬元體系」（PoC + Research grant）
- **HKMA Sandbox via HKSTP**：~HK$100k 入場費，取得與金融機構接觸資格 + Digital ID 監管試驗
  - 與既有 [ADR-0002](../decisions/0002-aws-stack.md) 月費 < $200 預算層級綁定
- 長遠：被收購 / 上市 → 為 VC 提供退出途徑

### 3. 產品功能設計（部分與既有實作衝突）

#### 評分機制（C1 衝突 — 與既有 5-star schema 衝突）

- **不做五顆星**，改 OpenRice 式「讚／普通／不讚」+ 已驗證投訴數
- 理由：避免付費影響排名（rule 00 紅線）、避免主觀加權、維持中立
- **同會議末段 §02:42:10 又出現「五顆星重要性被強調」** → 內部分歧未拍板，本場會議主決策仍走「無五星」
- 影響面：DB `Review.rating Int 1-5` + 全平台 UI 星等顯示 + IPFS payload schema

#### 投訴與評論分離

- **投訴**（可驗證事實，如系統當機 2 小時）vs **評論**（主觀感受，如客服很差）兩機制分離
- 投訴需證據（IPFS 上傳 → admin / jury verify）
- 「已驗證投訴數」聚合顯示在 broker 頁
- 既有實作把 review + complaint 視為同 entity，需新 ADR 拍板分離方式（同表加 enum vs 分表）

#### 身份分級 L1-L3（與既有 SbtTier 一致）

- Level 1：Email 註冊，僅瀏覽
- Level 2：綁定錢包或「智方便」驗證，可留言互動 → **與既有 [ADR-0022](../decisions/0022-l2-commitment-hash-verification.md) commitment-hash 並存**
- Level 3：陪審團成員，需上傳交易紀錄（如月結單）認證資深交易者身份
- **「智方便」(iAM Smart) 整合是新需求**（與 [ADR-0005](../decisions/0005-privy-aa-wallet.md) Privy 並存或取代），會議推 L3 高可信驗證採用智方便

#### 公開回應機制 (Broker Response)

- 平台保持中立媒體化呈現，引入專家評論
- 商戶可對任一 review / complaint 公開回應一次（會議稱「Porto 聲明窗口」）
- **新功能**，當前實作沒有

#### 內容不可刪除 + 仇恨言論過濾

- 內容上鏈後**任何人**（包括 admin）不可刪 → 與 rule 00 紅線一致
- 但需加：仇恨言論禁止 + 敏感詞過濾 + 已核實／未核實標籤
- **技術上要區分**：「鏈上 immutable」vs「indexer 可隱藏並標註」兩層
- 需新 ADR + 新 rule 52（content moderation）

#### KOL 功能（Phase 2 既有規劃 + 會議補充）

- KOL 上鏈記錄交易與訴訟內容 → 與既有 Phase 2 規劃一致
- **新加要求**：KOL 準入門檻（CFA / CFP 等專業資格）+ 對監管提供後台支援工具
- 「未經鏈上驗證」紅標 UX

### 4. 用戶驗證與數據管理

#### 真實性驗證

- 標示「本券商客戶」提升評論可信性 → 已實作（per [ADR-0025](../decisions/0025-multi-broker-verification-strategy.md)）
- 參考亞馬遜濾鏡機制（承認其存在刷單與付費好評濫用）
- 二手商品（如二手錶）類比場景討論，方向：「真交易後才可評論」
- 全港證券客戶資料庫設想：在保護資料前提下加速識別與處理違規

#### 真人唯一性

- 防範重複開戶 → 提升資料品質
- 與券商合作邊界：提供「Yes/No」級驗證，不需披露敏感地址
- 參考澳洲能源帳戶地址驗證

#### 數據維度

- 出入金時效、App 評分、相似券商評價（Speaker 1 owner — 設計問題集）
- 用戶背景：地址、年齡、學歷、行業
- 長遠：稅務資料整合（智方便 + 政府合作）

### 5. 流量策略

#### SEO

- 將每個獨立頁面打造成獨立 landing page
- 增頁量至 ~250 頁提升 Google 索引可見度
- 仿 Sorra 模式 + 積分／Token 兌換激勵

#### KOL 引流

- 第二階段引入 KOL 投資記錄與訴訟內容
- 與 KOL 及財經媒體合作模式
- 「黃冠憶」、「Louis 沈」等潛在合作對象（人脈清單由 Speaker 2 + 團隊整理）

### 6. 對外合作與發展

#### 監管溝通

- 以行業協會名義訪問證監會 (SFC)
- 建立合作關係並了解其困難挑戰
- 申請 HKMA Sandbox via HKSTP 試點 Digital ID 監管參與

#### 背書

- 退休 SFC 高層、退休 HKMA 高層、券商 CEO、立法會人士
- 使用專業錄音設備建立關係（合法錄音 + 告知）

#### 橫向擴展

- 長期可橫向至 CFD 市場
- 反向銷售技術方案：醫管局（雙向評分 + 資料雲化）、房屋署（樓宇維修記錄上鏈）
- 行業切入優先順序：金融先行（資金充沛 + 自助導向）、醫療阻力較大

### 7. 品牌與域名

- **域名方向**：OpenTrade / open.trade（昂貴且已有人用） / **OpenTrade.ai**（資產化方向）
- `.hk` 取得受限、`.sg` 較便宜
- 不同地區運營牌照需研究（如巴西）
- 探索購買多後綴並轉售或作 IP 資產

### 8. 團隊與資源

- 招募具 **AI 背景且可佐證經驗**的技術成員加入核心或顧問團
- Speaker 1 主導技術 + 對外演講敘事
- Speaker 2 主導 Pitch + 短文 + KOL/券商人脈
- Speaker 3 釐清 Doc AI 申請流程
- Speaker 5 流量 + 域名渠道

## 與既有 ADR / 紅線完全吻合的部分

| 會議內容                           | 對應既有決策                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 內容上架後不可刪除                 | rule 00 紅線 + [ADR-0019](../decisions/0019-review-registry-contract-design.md) ReviewRegistry 設計                                                                                                    |
| 商戶付費不影響評論顯示             | rule 00 紅線                                                                                                                                                                                           |
| 不做投資建議（避 SFC 第 4 類牌照） | rule 00 紅線                                                                                                                                                                                           |
| 前端 Web2 / 後端 Web3              | [ADR-0005](../decisions/0005-privy-aa-wallet.md)                                                                                                                                                       |
| 三主軸 Verify / Profile / 社群     | [00-vision.md](../00-vision.md) §三                                                                                                                                                                    |
| 香港 → 台灣 → 新加坡擴張           | [02-roadmap.md](../02-roadmap.md) Phase 6+                                                                                                                                                             |
| L1-L3 分級 + SBT                   | [ADR-0021](../decisions/0021-reviewer-sbt-contract-design.md) + [ADR-0022](../decisions/0022-l2-commitment-hash-verification.md) + [ADR-0025](../decisions/0025-multi-broker-verification-strategy.md) |
| KOL 訊號上鏈                       | Phase 2 既有規劃                                                                                                                                                                                       |
| 中立媒體 + 不評分（事實導向）      | [00-vision.md](../00-vision.md) §五「不是什麼」                                                                                                                                                        |

## 會議結論與既有設計衝突的 6 項（C1-C6）

| #   | 衝突                        | 現狀                                                                              | 會議結論                                                      | 影響面                                                        |
| --- | --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| C1  | 五顆星評分機制              | `Review.rating Int 1-5` 已在 production schema + 全平台 UI 展示星等               | 不做五顆星，採讚／普通／不讚 + 驗證投訴數（但內部分歧未拍板） | DB schema、ReviewCard、API、ReviewForm                        |
| C2  | Token Economy 引入時機      | [ADR-0007](../decisions/0007-no-token-in-v1.md) 明確「V1 不發 token」避 VATP 牌照 | 會議將 Token Economy 列為 B 端營收主軸 + Pitch 核心           | 監管定位、商業模式、Phase 規劃                                |
| C3  | 智方便 (iAM Smart) 身份驗證 | 現用 Privy 社交登入 + commitment-hash 月結單驗證做 L2                             | 「L3 用智方便高可信驗證」                                     | [ADR-0005](../decisions/0005-privy-aa-wallet.md) 補充或新 ADR |
| C4  | HKMA Sandbox via HKSTP      | 當前 roadmap 走 CCMF / 數碼港 Phase 4                                             | 新增 HKSTP 路徑 ~HK$100k 入場                                 | 預算分配（[ADR-0002](../decisions/0002-aws-stack.md)）        |
| C5  | 公開回應機制                | 不存在                                                                            | 「Porto 聲明窗口」+ 平台中立媒體呈現                          | 新 domain feature / Phase 2.5                                 |
| C6  | 仇恨言論過濾 + 敏感詞       | 沒實作；rule 00 + rule 50 只規範平台不可刪除                                      | 「禁仇恨言論 + 敏感字過濾」+「不可刪除但可標註」              | 新 ADR + 新 rule 52                                           |

## 產生的 ADR 索引（將在後續 commits 寫入）

- **ADR-0028**: 廢除五星評分，採三向情緒（POSITIVE / NEUTRAL / NEGATIVE） — C1 解
- **ADR-0029**: 投訴與評論分離設計（同表 `kind` enum）
- **ADR-0030**: Token Economy 引入時機（superseding [ADR-0007](../decisions/0007-no-token-in-v1.md)） — C2 待議
- **ADR-0031**: iAM Smart L3 整合（與 [ADR-0005](../decisions/0005-privy-aa-wallet.md) 並存） — C3 待議
- **ADR-0032**: HKMA Sandbox via HKSTP 預算與時程 — C4 待議
- **ADR-0033**: Public broker response mechanism — C5 待議
- **ADR-0034**: Content moderation 兩層架構（鏈上 immutable + indexer 可隱藏） — C6 待議
- **ADR-0035**: Vision narrative 升級至「擁抱監管」
- **ADR-0036**: KOL signal architecture（Phase 2）
- **ADR-0037**: Merchant editable scope + ad isolation（Phase 2.5）

延後 ADR 的索引以 `docs/decisions/STAGING.md` 維護觸發點與優先序。

## 待後續處理事項

### Speaker 1（技術 / 演講敘事）

- [ ] 設計提交文件表單中的運營指標問題集（出入金時效、App 評分、相似券商評價）
- [ ] 準備並主導對外演講與完整敘事
- [ ] 向券商詢問合作方式與條件，以便在簡報中呈現（含是否能提及 MOU）

### Speaker 2（策略 / 對外）

- [ ] **2026-06-08 前**：產出短篇文章（5-10 分鐘閱讀量，偏 5 分鐘）作為對外敘事材料
- [ ] **2026-06-20 前**：Pitch Deck（3 / 5 / 10 分版本）+ 商業模式循環圖
- [ ] 撰寫 Token Economy 方案與 AI 組織化設計文稿
- [ ] 研擬與政府建立合作框架，聚焦 CRS 合規與道德出發點
- [ ] 與券商合作以導入驗證流程（依券商指示、銀行成立、提供預結單、地址驗證）
- [ ] 與券商合作，鼓勵使用手機拍攝提交，並讓券商在平台公開回應投訴
- [ ] 整理並拓展 KOL、券商與學術/政界人脈清單
- [ ] 確認新的香港網站是否已上線，並建議由 Nelson 負責
- [ ] 聯繫相關人員（Lelson、可能的 Jeffrey）並制定網站與「Build Dream」計劃的執行劇本
- [ ] **2026 Q3 (2026-07-01 至 2026-09-30)** 提交資助申請與原型展示計畫

### Speaker 3（合規 / 文件）

- [ ] 釐清 Doc AI 相關申請流程與所需中介，並向 GoDaddy 提出域名請求

### Speaker 5（流量 / 行銷）

- [ ] 明確列出香港域名（如 .hk）可用的官方註冊渠道（含是否 AWS、及本地註冊商）
- [ ] 繪製商業模式循環圖，突出收費節點與價值流轉

### 全體 / 待指派

- [ ] 調查 OpenTrader.ai 的現有運營主體與業務範疇
- [ ] 釐清不同地區（如巴西）對域名持有與運營是否需牌照的具體法規
- [ ] 招募具 AI 背景且可佐證經驗的技術成員加入核心或顧問團
- [ ] 規劃 Phase 1 後 MVP 開發與 Pitch 日程，並對接導師與合作風投流程
- [ ] 合規負責人：研究並申請金管局 MA Sandbox 試點，設計監管/二層監察驗證方案

### Product / Community Team

- [ ] 設計社群分層與貢獻度量化機制，及資歷驗證流程

## 對應的 AI agent 執行計畫（rule 96 細拆）

本歸檔對應的 14 個 milestone 執行計畫見 `.cursor/plans/會議整合_+_phase_1→2→2.5_細拆執行計畫_*.plan.md`，由 next session 依序執行：

- M0 本歸檔（本 commit）+ status snapshot
- M1 Phase 1 polish 3 條收尾
- M2 ADR-0028 + 0029 + STAGING.md 拍板
- M3-M6 Rating UX rebuild（DB / API / Web / Console / tests）
- M7 Complaints separation 實作
- M8-M9 KOL Phase 2 規劃 + 實作
- M10 商戶功能 Phase 2.5
- M12 Grant application 骨架（對應 6/8 截止日）
- M13 vision / roadmap / status 升級
- M14 Rule 99 self-review

## 給未來 AI agent 的建議

1. **C1 五顆星衝突**：會議自身有內部分歧（§01:10:18 拍板無五星 + §02:42:10 再次強調五星重要性）。本歸檔記下「主決策走無五星」，但 AI agent 在實作 ADR-0028 時應在 Alternatives Considered 段列出五星論據，並讓 user 在 ADR 通過前最後拍板。

2. **C2 Token Economy 與 ADR-0007 衝突**：不要在 V1 動 token code（[ADR-0007](../decisions/0007-no-token-in-v1.md) 寫得很硬：避 VATP 牌照、保持 RFI 不發 token）。會議的 Token 討論是**Pitch story** 不是 V1 code，AI agent 應寫 ADR-0030 把 Token Economy 定位在 Phase 5+ 並條件性 superseding ADR-0007，而非立刻實作。

3. **C5 公開回應併入商戶功能 Phase 2.5**：會議 C5「Porto 聲明窗口」與商戶功能 banner / 簡介 / 獎項 有相同的「商戶可寫入內容」邊界問題，併在 ADR-0037 統一拍板可寫範圍。

4. **C6 內容過濾的紅線張力**：實作內容過濾時要謹慎處理 rule 00 紅線「不可實作平台可刪除使用者評論的功能」。技術做法必須**雙層架構**：鏈上資料永遠不動（即使被過濾），indexer 層可標註「已被平台標記為仇恨言論」並隱藏該 review 在 default feed，但用戶仍可透過 link 直達查看原始鏈上內容。這個區分必須在 ADR-0034 寫清楚。

5. **6/8 + 6/20 兩個外部截止日的壓力**：M0 + M12 必須優先處理（給 Speaker 2 起手框架），M2 + M13 應在 6/20 前完成（讓 Pitch 引用最新 ADR）。Code work（M3-M11）順位可以按 user 偏好（已決定：Phase 1 收尾 → KOL → 商戶功能）。

6. **不要動既有 Phase 1 99% 完成的程式碼**：M1 三條 polish 是已知 follow-up，不是 refactor 機會。M3-M6 Rating rebuild 是 ADR-0028 拍板後的有意改造，但仍應 backward-compat（保留 `Review.rating` 兩個 release）。
