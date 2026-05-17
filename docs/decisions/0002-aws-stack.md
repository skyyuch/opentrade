# ADR-0002: 採用 AWS 作為唯一雲端供應商

## Status

Accepted

## Date

2026-05-17

## Context

OpenTrade 是金融類 Web 應用，未來可能：

- 申請各種合規認證（SOC 2、ISO 27001）
- 接受監管機構檢視（SFC、ITC）
- 處理使用者個資與金融相關證明

對雲端的要求：

1. **可靠性與災備**：金融類產品要求 Multi-AZ、自動備份、跨區複製
2. **合規工具鏈**：CloudTrail、IAM、KMS、Secrets Manager 等成熟元件
3. **長遠可控**：避免被 PaaS 廠商鎖死，需要時能往下控制
4. **基礎設施即程式碼**：所有資源 Terraform 化，可一鍵還原
5. **與監管溝通的能力**：「資料存哪、誰有權限」必須能直接提出證據

## Decision

採用 **AWS 作為唯一雲端供應商**，在三個 AWS 帳號或三個獨立環境中部署：

- dev
- staging
- prod

**不採用 PaaS 全託管平台**（Vercel、Supabase 等），即使它們在前期更方便。

技術元件分配：

- **Frontend**：Next.js → 透過 OpenNext → S3 + CloudFront + Lambda@Edge
- **API**：Hono → Docker → ECS Fargate
- **DB**：RDS Postgres 16，Multi-AZ + Read Replica
- **Storage**：S3（私密檔案）
- **Secrets**：Secrets Manager
- **DNS / TLS**：Route 53 + ACM
- **CDN**：CloudFront
- **背景任務**：SQS + Lambda
- **Email**：SES
- **觀察性**：CloudWatch + X-Ray + Sentry（前端錯誤）
- **網路**：VPC + Private Subnet（DB 不可從公網存取）
- **WAF**：prod 必啟
- **IaC**：Terraform

**例外（off-AWS 必要）**：

- **IPFS 儲存**：Pinata（鏈上證據必須去中心化儲存，不可放 AWS）

## Alternatives Considered

### Alternative A: Vercel + Supabase + Render

- **Pros**：MVP 開發極快，配置最少
- **Cons**：
  - 無法提供金融級可控性
  - SOC 2 / ISO 認證敘事困難
  - 跨服務商整合零碎
  - Vercel + Supabase + Render 三家任一掛掉都影響整體
  - 廠商鎖死難遷移
- **結論**：與「徹底長遠方案」原則衝突，不選

### Alternative B: Google Cloud Platform (GCP)

- **Pros**：BigQuery 強、Firebase 整合好
- **Cons**：合規工具鏈不如 AWS、HK 在地支援不如 AWS
- **結論**：不選

### Alternative C: Microsoft Azure

- **Pros**：對 Microsoft 客戶友善
- **Cons**：Web3 生態相對冷清、AI 教材最少
- **結論**：不選

### Alternative D: 多雲（AWS + Cloudflare + ...）

- **Pros**：CDN 用 Cloudflare 確實便宜很多
- **Cons**：MVP 階段過度複雜
- **結論**：Phase 5+ 規模化時可考慮 CDN 部分換 Cloudflare

## Consequences

### Positive

- 完整的合規與安全工具鏈（IAM、CloudTrail、KMS、GuardDuty、Config）
- 跨服務無縫整合（Lambda 觸發 SES、SQS 觸發 ECS）
- 大規模使用者基礎，AI 對 AWS 操作教材豐富
- Terraform 對 AWS 支援度業界第一
- 將來與監管 / 投資人解釋「資料安全」最有說服力
- 多租戶 / 多區域 / 多帳號架構成熟

### Negative / Trade-offs

- **DevOps 學習曲線高**：相比 Vercel 一鍵部署，AWS 需要更多 IaC 工作
- **MVP 階段慢一點**：第一個 Phase 0 需要花 1 週設定 Terraform / VPC / IAM
- **成本管理需要紀律**：忘關 dev 資源會燒錢；必須設 budget alert
- **本機 dev 體驗不如 Vercel**：需要用 LocalStack 或長期測試環境

### Neutral

- AWS 帳單複雜，但有 Cost Explorer 與 Budgets 工具可管控

## Implementation Notes

### 帳號策略

**Phase 0 / 1 階段**（資金有限）：

- 使用單一 AWS 帳號 + 三套 Terraform workspace
- IAM 嚴格分權（dev role / staging role / prod role）

**Phase 4+ 階段**（接近上線）：

- 拆成三個 AWS 帳號（AWS Organizations）
- prod 帳號獨立 root，最嚴格

### Cost 預警

Phase 0 預期月費：< $50 USD

- ECS Fargate dev（1 task）：$15
- RDS t4g.small：$15
- S3 + CloudFront：$5
- Secrets Manager + 其他：$10

**任何 commit 不可造成 dev 環境月費 > $200**，否則必須先寫 ADR 討論。

### 嚴禁事項

- ❌ 在 AWS Console 手動建立任何 production 資源（必須 Terraform）
- ❌ 把 secrets 寫進 Terraform `*.tfvars` 後 commit（必須 Secrets Manager）
- ❌ 使用 AWS root account 做日常操作（只用 IAM user / role）
- ❌ Public S3 buckets（除了明確的 frontend 靜態資源）

## References

- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [docs/01-architecture.md 第 4.7 節](../01-architecture.md)
- [初始規劃對話](../conversations/2026-05-17-initial-planning.md)
