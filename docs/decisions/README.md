# Architecture Decision Records (ADR)

> ADR = 我們做了什麼決定、為什麼做、考慮過什麼替代方案。

## 為什麼需要 ADR

大型項目最大的風險是「決策的脈絡丟失」。三個月後新人問「為什麼要選 X 不選 Y」，沒有 ADR 就只能憑記憶答，記憶錯了就會做出錯誤的逆向修改。

**ADR 是項目記憶的核心元件**。

---

## 何時必須寫 ADR

只要符合下列任一條件：

- 引入 / 移除一個重要的技術選型（框架、library、雲端服務）
- 改變專案結構（新增 / 移除 / 合併 packages 或 apps）
- 改變部署 / 環境策略
- 改變安全 / 合規策略
- 引入 / 改變一個跨多個 module 的 pattern（例如 Event Bus、CQRS）
- 任何「未來想改回去會很痛」的決定

---

## ADR 格式

每個 ADR 都是 `decisions/NNNN-kebab-case-title.md`，內容固定格式：

```markdown
# ADR-NNNN: 標題（一句話說清決定了什麼）

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-XXXX

## Date

YYYY-MM-DD

## Context

（為什麼需要做這個決定？背景是什麼？什麼問題逼使我們做選擇？）

## Decision

（我們決定了什麼？盡量具體，不要含糊）

## Alternatives Considered

（考慮過哪些替代方案？為什麼沒選？）

- **Alternative A**: ...
  - Pros: ...
  - Cons: ...
- **Alternative B**: ...
  - ...

## Consequences

（這個決定的後果，包括正面與負面）

### Positive

- ...

### Negative / Trade-offs

- ...

### Neutral

- ...

## Implementation Notes

（如果有需要立即實作的事，列在這）

## References

- Link to relevant code / docs
- Link to conversation log
- Link to external docs
```

---

## 已有 ADR 列表

| #    | Title                                                 | Status   | Date       |
| ---- | ----------------------------------------------------- | -------- | ---------- |
| 0001 | 採用 Base L2 作為主要區塊鏈                           | Accepted | 2026-05-17 |
| 0002 | 採用 AWS 作為唯一雲端供應商                           | Accepted | 2026-05-17 |
| 0003 | i18n 三語架構：繁中（預設）/ 簡中 / 英文              | Accepted | 2026-05-17 |
| 0004 | Monorepo 使用 pnpm + Turborepo                        | Accepted | 2026-05-17 |
| 0005 | Web3 帳號抽象化使用 Privy                             | Accepted | 2026-05-17 |
| 0006 | API 採用 DDD + Modular Monolith 架構                  | Accepted | 2026-05-17 |
| 0007 | V1 不發行自有代幣，使用積分系統                       | Accepted | 2026-05-17 |
| 0008 | 陪審團採分階段實作但架構保留完整性                    | Accepted | 2026-05-17 |
| 0009 | UI 採 Storybook 獨立工作流先行                        | Accepted | 2026-05-17 |
| 0010 | 用戶端與商戶後台拆兩個獨立 Next.js app                | Accepted | 2026-05-17 |
| 0011 | OpenTrade UI 設計語言（Civic Trust + Web3 科技感）    | Accepted | 2026-05-17 |
| 0012 | 本機開發環境使用 docker-compose 跑 PostgreSQL         | Accepted | 2026-05-17 |
| 0013 | Pin Prisma to 6.x — defer Prisma 7 adoption           | Accepted | 2026-05-17 |
| 0014 | apps/api runtime architecture (env / bundle / Prisma) | Accepted | 2026-05-17 |
| 0015 | packages/contracts toolchain setup                    | Accepted | 2026-05-17 |
| 0016 | AWS account architecture (Org, Identity Center, SSO)  | Accepted | 2026-05-20 |
| 0017 | Terraform IaC structure + Phase-0 full apply scope    | Accepted | 2026-05-21 |
| 0018 | CI/CD GitHub Actions architecture (Phase 0 scope)     | Accepted | 2026-05-21 |
| 0019 | ReviewRegistry contract design (Phase 1)              | Accepted | 2026-05-21 |

---

## 變更 ADR 的規則

- ADR 一旦 `Accepted`，**不可直接修改內容**（保留歷史完整性）
- 要推翻舊 ADR：寫一個新 ADR，將舊 ADR status 改為 `Superseded by ADR-XXXX`
- Typo 或格式修正可直接改
