# ADR-0008: 陪審團採分階段實作但架構保留完整性

## Status

Accepted

## Date

2026-05-17

## Context

OpenTrade 的核心差異化功能之一是**去中心化陪審團仲裁**（類似 Kleros）。完整 Kleros 機制包含：

- 隨機抽取陪審員
- 雙方質押代幣
- 陪審員投票
- 投錯方拿不到獎勵 / 損失質押
- 多輪上訴機制
- 代幣經濟激勵

但完整實作需要：

- 自有 token（與 ADR-0007 衝突）
- 大量陪審員池（冷啟動難）
- 複雜的合約邏輯
- 完整的法律審查

V1 階段不可能全部做完，但又不能寫成「之後重寫」的 demo。

## Decision

採用**分階段交付，但 V1 架構從第一天就支援完整 Kleros 機制**：

### V1（Phase 3 交付，4-5 週）

- 用戶提交投訴 + 證據（IPFS）
- 被投訴方有 7 天反駁（提交反駁證據）
- 從 **L3「創始陪審員」池**（30-50 人邀請制）抽 **5 位**
- 抽選使用 **Chainlink VRF**（鏈上可驗證隨機）
- 陪審員 7 天投票，多數決
- **不質押 token**（用 SBT 身份保證）
- 結果上鏈，**不可改**

### V2（Phase 5+，引入 Points / 完整流程）

- 投訴 / 反駁需質押 Points（避免濫用）
- 陪審員投對結果可獲得 Points 獎勵
- 投錯結果（與最終多數結果不一致）損失部分 Points
- 引入第二輪上訴機制

### V3（Phase 6+，token 化後）

- Points 升級為 token（若監管允許）
- 完整 Kleros 經濟激勵
- 陪審員池擴大到「持有 SBT 的所有用戶」

### 架構保留完整性的重點

合約 `JuryPool` 與 `DisputeArbitration` 從 V1 就設計成：

- ✅ 隨機抽選機制就位（VRF）
- ✅ 質押 / 獎勵 / 罰金的**介面（interface）**留好
- ✅ 投票結果計票邏輯支援上訴（即使 V1 不上訴）
- ✅ 多陪審員池（不同類型爭議用不同池）支援
- ✅ 升級代理（UUPS Proxy）

從 V1 進到 V2 / V3 **只是「啟用」這些介面**，不是重寫合約。

## Alternatives Considered

### Alternative A: V1 直接做完整 Kleros

- **Pros**：一次到位
- **Cons**：
  - 違反 ADR-0007（V1 不發 token）
  - Phase 3 時程不夠
  - 冷啟動陪審員池太小，token 經濟跑不起來
- **結論**：不選

### Alternative B: V1 做最簡 demo（單一 admin 仲裁）

- **Pros**：開發極快
- **Cons**：
  - 失去 OpenTrade 的核心差異化
  - 違反「去中心化」承諾
  - 將來重做要動合約 → 對使用者影響大
- **結論**：不選

### Alternative C: V1 不做陪審團，所有評論直接顯示

- **Pros**：開發更快
- **Cons**：
  - 沒有爭議解決機制 → 商戶被惡意攻擊無救濟管道
  - 拿基金敘事不完整
- **結論**：不選

### Alternative D: 直接 fork Kleros 部署

- **Pros**：成熟
- **Cons**：
  - Kleros 的 PNK token 在 Base 沒有部署
  - 整套機制 over-engineering
  - 我們需要自己的陪審員池
- **結論**：學習 Kleros 設計，但不直接 fork

## Consequences

### Positive

- V1 4-5 週可交付，趕得上 CCMF 申請
- V1 已是「鏈上不可改」的真陪審制度，不是 demo
- V1 → V2 → V3 升級**不需要重寫合約**（透過 UUPS Proxy + 介面預留）
- 對使用者而言：今天用 V1，明天用 V2，無感切換
- 對監管：V1 純 SBT 身份，無 token，最安全
- 對 demo：可以講「這是 Kleros 級的去中心化仲裁系統」

### Negative / Trade-offs

- V1 沒有 token 激勵，陪審員出席率可能不高（緩解：邀請制種子陪審員，業界前輩出於聲譽參與）
- V1 抽選只有 5 人，樣本小，可能有判決偏差
- 合約設計時要寫的「介面預留」會增加 V1 的複雜度
- 升級代理本身有風險（必須有 timelock + multisig）

### Neutral

- 跟 Kleros 學設計，必須在合約 comment 中標註參考來源

## Implementation Notes

### V1 合約預期結構

```
packages/contracts/src/disputes/
├── JuryPool.sol              # 陪審員池管理（V1: 邀請制；V2+: 開放）
├── DisputeArbitration.sol    # 爭議仲裁主合約
├── interfaces/
│   ├── IJuryStaking.sol      # ⚠️ V1 無實作，但介面預留
│   ├── IRewardDistributor.sol # ⚠️ V1 無實作，但介面預留
│   └── IDisputeAppeal.sol    # ⚠️ V1 無實作，但介面預留
└── libs/
    └── DisputeStorage.sol    # 儲存結構支援未來欄位
```

### 升級安全

- 所有合約使用 **UUPS Proxy**
- 升級權限走 **2-of-3 multisig + 48 小時 timelock**
- 任何升級必須先有 ADR

### 創始陪審員（L3 SBT）

Phase 4 邀請制，名單從業界人脈來：

- 退休 SFC 員工
- 退休銀行 / 證券業高管
- 知名金融記者
- 學界（HKUST、CUHK 商學院教授）
- 創辦團隊在 CFD 業界認識的前輩

每人鑄造一個不可轉讓 SBT。

### V1 抽選流程

```
1. 投訴提交 → 7 天反駁期
2. 期滿後合約呼叫 VRF
3. 從 L3 池中隨機抽 5 位
4. 通知被抽中陪審員（鏈下 + 鏈上事件）
5. 陪審員 7 天內投票
6. 期滿計票，多數決
7. 結果寫進合約，emit DisputeResolved
```

### 嚴禁事項

- ❌ V1 用 admin 暫時 override 陪審結果（即使是 bug 也不行 → 改用 V2 上訴流程處理）
- ❌ 寫死 5 人為陪審數（用 config 變數，未來可調）
- ❌ 投票結果可被任何人覆蓋

## References

- [Kleros 白皮書](https://kleros.io/whitepaper.pdf)
- [Chainlink VRF](https://docs.chain.link/vrf)
- [OpenZeppelin UUPS Proxy](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable)
- [docs/01-architecture.md 第 4.5 節](../01-architecture.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
