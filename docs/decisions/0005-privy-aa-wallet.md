# ADR-0005: Web3 帳號抽象化使用 Privy

## Status
Accepted

## Date
2026-05-17

## Context

OpenTrade 的目標使用者是**普通投資者，多數不熟悉 Web3**。如果要求他們：
- 安裝 MetaMask
- 自管私鑰 / 助記詞
- 自己買 ETH 付 gas

**90% 的使用者會在第一步就流失。**

我們需要：
1. 使用者用「Web 2.0 體驗」登入：Google、Apple、手機號
2. 系統自動為他們生成錢包（Account Abstraction）
3. 使用者操作鏈上動作時 gas 由平台代付（Gasless）
4. 但**錢包完全屬於使用者**（去中心化精神不可違背）

## Decision

採用 **Privy** 作為 OpenTrade 的 Web3 身份與錢包抽象化方案。

### 採用方式
- 前端整合：`@privy-io/react-auth`
- 與 wagmi v2 整合：`@privy-io/wagmi`
- Server-side 驗證：`@privy-io/server-auth`

### 預期使用流程
1. 使用者點擊「登入」
2. 看到 Google / Apple / 手機 / Email 等選項
3. 選擇方式登入後，Privy 自動為其產生錢包
4. 私鑰由 Privy 透過 MPC（多方計算）保管，使用者可隨時匯出
5. 使用者寫評論等鏈上動作時，Privy + 我們自建的 Paymaster 代付 gas
6. 使用者可選擇「升級為自管錢包」（匯出私鑰到 MetaMask）

### 後端身份驗證
- API 從前端收到 Privy JWT
- 使用 `@privy-io/server-auth` 驗證 JWT
- 從中提取錢包地址 + 用戶 ID
- 簽發我們自己的 short-lived JWT 給後續 API 用

## Alternatives Considered

### Alternative A: Thirdweb
- **Pros**：與 Privy 類似，整合也算容易；提供更多預製合約模板
- **Cons**：
  - 對社交登入的處理不如 Privy 乾淨
  - 對 HK / 亞太 KYC 整合較弱
  - 平台廣告位偏多，企業感較弱
- **結論**：第二優先，但 Privy 更適合 OpenTrade

### Alternative B: Magic Link
- **Pros**：早期市場領導者
- **Cons**：商業模式不夠穩定，最近多次變動；Web3 整合不如 Privy 完整
- **結論**：不選

### Alternative C: WalletConnect + 純自管錢包
- **Pros**：去中心化最徹底
- **Cons**：使用者必須先有錢包；散戶完全不懂；MVP 必死
- **結論**：作為「進階用戶」備選，預設使用 Privy

### Alternative D: 自建 AA 錢包系統
- **Pros**：完全可控，無第三方依賴
- **Cons**：
  - 需要實作 ERC-4337 全套（bundler、paymaster、entry point）
  - 私鑰儲存方案（HSM、MPC）開發成本極高
  - 法律 / 合規責任全自擔
  - MVP 階段絕對 over-engineering
- **結論**：5 年後規模化或許值得，現在不做

### Alternative E: Coinbase Smart Wallet
- **Pros**：與 Base 同生態，整合最緊
- **Cons**：使用者必須先有 Coinbase 帳號或下載 Coinbase Wallet；對非加密用戶不友善
- **結論**：可作為「進階登入選項」之一，但不作預設

## Consequences

### Positive
- 使用者完全 Web 2.0 體驗，學習門檻 = 0
- AA + Paymaster 讓 gas 對使用者透明（平台代付）
- 私鑰由 Privy MPC 保管，使用者可隨時匯出（保留去中心化精神）
- 向監管解釋時：「我們不持有使用者私鑰」是強有力 narrative
- 對申請數碼港 / Web3 Hub 認證有幫助

### Negative / Trade-offs
- **第三方依賴**：Privy 倒了會影響使用者登入（mitigation：使用者可隨時匯出私鑰，平台保留 export 功能）
- **付費**：Privy 月費可觀（按用戶數計費），規模化後成本上升
- **Privy 使用者上限觸及後**：要思考遷移路徑或自建

### Neutral
- 使用者「身份」與「錢包地址」緊密綁定，分割使用者匿名性的能力有限（這對 OpenTrade 是 feature 不是 bug）

## Implementation Notes

### 環境設定
- Privy App ID 透過 env 注入（dev / staging / prod 分開）
- 不可寫死任何 Privy 設定值

### 設定 Privy 時需要注意

```ts
// apps/web/src/providers/privy.tsx (僅示意)
{
  loginMethods: ['google', 'apple', 'sms', 'email', 'wallet'],
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
    requireUserPasswordOnCreate: false,
  },
  defaultChain: base,        // ⚠️ 但要從 packages/config 讀
  supportedChains: [base, baseSepolia],
}
```

### Paymaster 規則

- 不是所有動作都代付，必須有規則：
  - **平台代付**：寫評論、投陪審票
  - **使用者付**：KOL 發訊號、商戶認領、質押動作
  - **每用戶每日上限**：避免被 sybil 攻擊濫用 gas
- 詳細規則寫在 `apps/api/src/domains/identity/`

### 嚴禁事項

- ❌ 把 Privy server secret 暴露到前端
- ❌ 忽略 JWT 驗證直接信任前端傳來的錢包地址
- ❌ 用 Privy 帳號取代我們自己的 user 表（要有自己的 user 領域 + Privy 是 identity provider）
- ❌ 假設使用者錢包地址永遠不變（使用者可能從 embedded wallet 升級為自管，重新登入）

## References

- [Privy 官方文件](https://docs.privy.io/)
- [ERC-4337 規範](https://eips.ethereum.org/EIPS/eip-4337)
- [docs/01-architecture.md 第 4.1 節](../01-architecture.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
