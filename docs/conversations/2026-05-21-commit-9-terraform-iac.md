# Commit number-nine — Terraform IaC + apps/api Dockerfile — 2026-05-21

> 本文件歸檔 OpenTrade 項目於 2026-05-21 ship Commit number-nine 的精華對話：
> 從 plan-only Phase-0 改為 full apply、Terraform 模組決策、apps/api Dockerfile
> 的 pnpm-deploy + Prisma engine 設計、以及實際 apply 過程中的錯誤排除。

---

## 對話脈絡

- **日期**：2026-05-21
- **參與者**：項目負責人（skyyu）+ Claude Opus 4.7（本 agent）
- **背景**：上一 session（2026-05-20）完成 AWS account bootstrap（ADR-0016 + rule 80），AWS Organization、management/dev account、IAM Identity Center、cost guardrails 全部就緒。Phase 0 進度 97%，剩 Commit number-nine（Terraform IaC）+ Commit number-ten（CI/CD）。
- **觸發點**：使用者開新 session，要求按 AGENTS.md 流程啟動，讀完 ADR-0014 / 0010 / 0002 / 0016 + rule 80 + 狀態 + roadmap 後，動手 ship Commit number-nine。
- **session 結尾狀態**：Commit `9202374` 已 ship；Phase 0 進度 100%；下一步 Commit number-ten CI/CD。

---

## 主要討論內容

### 1. Phase-0 apply scope：從「plan-only」改為「真 apply」

最關鍵的轉折發生在 session 開頭。原 `docs/02-roadmap.md` Phase-0 DoD 寫：

> Terraform `plan` 跑得起來（沒實際 apply）

我列出 11 個待拍板問題後（state backend 命名、IaC 結構、plan-vs-apply、NAT 數量、RDS 規格、AWS provider pin、tagging 等），給了使用者 A/B 兩個方案：

- **A 路**：plan-only，零月費
- **B 路**：full apply 到 dev tier，~$54/mo，會觸發 $50 budget alert（per ADR-0016）

使用者回：

> 我認為全部都按準備上線做吧，成本不是太誇張是可以接受的

理由是：把所有 module wire-up、IAM evaluation、SG reachability、subnet group 約束等真實問題集中在 Phase 0 解決，而不是堆到 Phase 1 launch week 才一次爆發。$54 是「一次性 controlled-circumstances 學費」，遠低於 Phase-1 壓力下排查 infra 問題的代價。

➜ 寫進 ADR-0017 D4 為核心決策，並更新 `docs/02-roadmap.md` Phase-0 DoD。

### 2. 模組-環境分割（Module ⟂ Environment）

決定走經典三層：

```
infra/terraform/
├── bootstrap/            # 一次性，本身用 local state
│   └── state-backend/    # 創 S3 bucket + DynamoDB lock
├── environments/
│   └── dev/              # composition root，串接所有 module
└── modules/
    ├── vpc/
    ├── rds-postgres/
    ├── ecs-fargate-cluster/
    ├── ecr-repo/
    ├── frontend-cdn/
    └── secrets/
```

關鍵紀律寫進 rule 81：

- 每個 module 4 個檔（versions / variables / main / outputs）
- module 不可 declare provider / 讀 env / 寫死 region|account|name
- environment 內 main.tf 只放 `module "..."` + identity guard
- backend.tf 的 bucket/dynamodb_table 是 literal（Terraform 限制）

未來 Phase 4+ staging/prod 變成 `environments/{staging,prod}/` 兄弟資料夾，重用同一批 modules 配上 prod-grade variable values。

### 3. Cost-tuning toggle 慣例

每個影響成本的設定**都必須是 module variable**（不寫死），dev 預設選便宜版，prod 將變數翻面：

| 維度                                | dev                         | prod              |
| ----------------------------------- | --------------------------- | ----------------- |
| `single_nat_gateway`                | true（1 個 NAT，省 $33/mo） | false（dual NAT） |
| `multi_az` (RDS)                    | false                       | true              |
| `instance_class` (RDS)              | `db.t4g.micro` Graviton     | `db.r7g.large`+   |
| `image_tag_mutability` (ECR)        | MUTABLE                     | IMMUTABLE         |
| `recovery_window_in_days` (Secrets) | 0                           | 30                |
| ...                                 |                             |                   |

為什麼這樣有用：Phase 4+ 升 prod 時，只是改 `terraform.tfvars`，不改 module 程式碼。Module 是 immutable building block。

### 4. apps/api Dockerfile 的設計取捨

ADR-0014 已經規劃好：tsup 把 workspace deps inline，`@prisma/client` external，Dockerfile 在 Phase 0 ship。Commit number-nine 把它兌現。

**關鍵取捨：Debian slim 而非 Alpine**

最早寫 Dockerfile 用 `node:22.11-alpine`，但 Prisma 的 binary engine 預設是 glibc/openssl-3 build。在 musl libc 的 Alpine 跑會踩到「找不到 libssl」之類的麻煩。解法有兩個：

- 在 `schema.prisma` 加 `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`（影響本機開發）
- 改用 `node:22.13-slim`（Debian），免去所有 OpenSSL 版本相依議題

選 Debian slim。代價是 image 多 ~30 MB，換來零 musl 風險。寫進 ADR-0017 negative consequences。

**關鍵取捨：`pnpm deploy --ignore-scripts` + 手動注入 `.prisma/client`**

走過三個版本才收斂：

1. **第一版**：`pnpm deploy --prod` ➜ 失敗。`@opentrade/db` 的 `postinstall: prisma generate` 在 deploy 階段被觸發，但 prisma CLI 是 devDep 被 `--prod` 排除，所以 postinstall 炸 `prisma: not found`。
2. **第二版**：`pnpm deploy --prod --ignore-scripts` + `cp -rL packages/db/node_modules/.prisma /deploy/` ➜ 失敗。`packages/db/node_modules/.prisma` 不存在 — 因為 pnpm strict layout 把 prisma generate 的輸出放到 `.pnpm` content store。
3. **第三版**：deploy 後跑 `find /workspace/node_modules/.pnpm -maxdepth 3 -type d -name '.prisma'` 動態定位後 `cp -rL`。✓

這個動態 find 寫死了「未來 Prisma 升級若改 `.pnpm` 內路徑就要修 Dockerfile」的腳印，inline 留註解警告，並在 ADR-0017 negative consequences 紀錄。

**Image 結果**：554 MB 未壓縮 / 124 MB 壓縮（ECR 看到的）。對 Node + Prisma backend 算合理。Phase 4 可以重新評估 distroless / alpine + binaryTargets。

### 5. Identity guard：programmatic enforcement of rule 80

每個 environment 的 `main.tf` 都先放：

```hcl
data "aws_caller_identity" "current" {}

resource "null_resource" "guard_account_id" {
  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.account_id
      error_message = "Caller is account ${data.aws_caller_identity.current.account_id} but expected ${var.account_id}. Did you forget --profile opentrade-dev?"
    }
  }
}
```

這是把 rule 80 的「不可 apply 到 management account」紅線從紀律變成 plan-time hard fail。任何「忘了 `--profile` → 跑去碰錯帳號」的事件都被擋在 plan 階段、apply 之前。

### 6. Secret 不進 state file

`modules/secrets/` 只創 empty slot：

```hcl
resource "aws_secretsmanager_secret" "this" {
  for_each                = toset(var.secret_names)
  name                    = each.value
  recovery_window_in_days = var.recovery_window_in_days
  # 注意：沒有 secret_string，沒有 secret_version
}
```

值由 operator 在 Terraform 之外用 `aws secretsmanager put-secret-value` 寫入。理由：rule 50 紅線「secret 不進 state」+ AWS 推薦的 「Terraform 管 IAM/ARN，CLI/console 管值」分工。

RDS master password 走 AWS 自管的另一條路：`manage_master_user_password = true`，AWS 自動生密碼並寫到 Secrets Manager，Terraform 連密碼長什麼樣都不知道。

### 7. Apply 過程的故障：RDS engine 16.4 → 16.14

第一次 apply 跑了約 7 分鐘後，RDS db_instance 創建失敗：

```
InvalidParameterCombination: Cannot find version 16.4 for postgres
```

我用 `aws rds describe-db-engine-versions --engine postgres --region ap-southeast-1` 查可用版本：16.6、16.8、16.9、16.10、16.11、16.12、16.13、16.14。預設值 16.4 是我寫死時隨便挑的，沒驗證過。

修復：`module/rds-postgres/variables.tf` 把 `engine_version` 預設改成 `16.14`，並更新 description 強調「必須對 region 跑 describe-db-engine-versions 確認」。Second apply 跑 8 分鐘收尾，56 resources 全部到位。

➜ 寫進 ADR-0017 implementation notes。Future agent 看 ADR 就會知道「engine version 不可隨意 pin」。

### 8. Rule 99 self-review → 新增 rule 81

完成程式碼後，按 rule 99 紀律 self-review：

- 既有 17 條 rule 中沒有任何一條描述「Terraform IaC 怎麼寫」
- rule 80 有提 Terraform 但只是 AWS account 邊界與 SSO profile 的 enforcement，不講程式碼結構

➜ 新增 `81-terraform-iac.mdc`（編號落在 70-89 process band，與 rule 80 緊鄰），codify ADR-0017 11 個決策為 operational 紀律：4-file convention、composition root 形狀、provider/default_tags、backend、secret-never-in-state、cost-tuning toggle 慣例、apply 紅線、module 新增/移除流程。

同步更新 rule 99（rule 樹加 81）+ rule 80（cross-reference 加 81 與 ADR-0017）。

---

## 產生的 ADR

- **ADR-0017**：Terraform IaC structure + Phase-0 apply scope
  - 11 個決策 + 7 個 alternatives considered
  - 包含 module-environment split、state backend、4-file convention、apply scope（**supersedes** roadmap 的 plan-only DoD）、dev cost-tuning、cost envelope ~$54/mo、provider pins、identity guard、default tags、secrets scaffolding、ECS cluster-now-service-Phase-1
  - 三段 consequences（positive / negative / neutral）+ 詳細 implementation notes（含 RDS engine 16.4→16.14 故障紀錄）

---

## 產生的 Cursor Rule

- **rule 81-terraform-iac.mdc**（`alwaysApply: true`）
  - 跟 rule 80（AWS account 邊界）形成「邊界 + 程式碼」雙保險
  - 強制 4-file module convention、identity guard、default-tags 5-key set、cost-tuning toggle 為 var、secret 紀律、apply 紅線
  - 嚴禁清單 17 條

---

## 真實 AWS 資源（commit-time snapshot）

| 資源                | 識別                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| VPC                 | `vpc-07de0826512fd588b`                                                            |
| Public subnets      | `subnet-0a268818af4d1cf3c`、`subnet-09b7b2dda696b1f7c`（ap-southeast-1a/1b）       |
| Private subnets     | `subnet-0498c87025638e87b`、`subnet-0fad467ccaa8a6938`                             |
| RDS endpoint        | `opentrade-dev-postgres.c12wwm68i3oo.ap-southeast-1.rds.amazonaws.com:5432`        |
| ECS cluster         | `opentrade-dev-cluster` (no service yet)                                           |
| ECR repo            | `371637912734.dkr.ecr.ap-southeast-1.amazonaws.com/opentrade-api`                  |
| Web CDN             | `https://d2vx070o8286j9.cloudfront.net`                                            |
| Console CDN         | `https://d1b00mlhv5lfyy.cloudfront.net`（X-Robots-Tag noindex）                    |
| Secret slots        | `opentrade/dev/{jwt-secret,privy-app-secret,deepl-api-key}` (空)                   |
| RDS master password | AWS 自管，ARN 出現在 outputs                                                       |
| State backend       | `s3://opentrade-tfstate-dev-371637912734` + `dynamodb/opentrade-tfstate-locks-dev` |

ECR 第一個 image：`opentrade-api:dev`，digest `sha256:d2691b347e77eb0cb2e90819ec5659d47b504588e0b5b1af7a03d7217686c85b`，compressed 124 MB。

---

## 待後續處理事項

- **Phase 1 第一個 task**：寫 `apps/api` 的 ECS task definition + service + ALB + healthCheck，攻破第一條 release tag 並 push 到 ECR（取代目前的 `:dev` MUTABLE tag）
- **Phase 1**：用 `aws secretsmanager put-secret-value` 把 jwt-secret / privy-app-secret / deepl-api-key 三個空 slot 填值，並把 jwt 從 placeholder min-32-chars 升 ES256 keypair（per rule 50 + ADR-0005）
- **Commit number-ten（下一個）**：CI/CD GitHub Actions
  - lint + typecheck + test 在 PR 上自動跑
  - **Terraform 也進 CI**：`terraform fmt -check -recursive` + `terraform validate` per env（不可 apply，per rule 81）
  - Phase 4+ 起加 GitHub OIDC 自動 push image 到 ECR + deploy ECS
- **Phase 4+**：建 `environments/staging/` + `environments/prod/`，啟用 SCP（per rule 80），把 RDS Multi-AZ / dual NAT / immutable ECR / WAF 都翻面
- **Phase 4+**：在 management account 開 `us-east-1`（給 CloudFront ACM），加 ACM cert + Route 53 records 把 CDN 從 `*.cloudfront.net` 換成 `opentrade.io` / `console.opentrade.io`
- **Pre-existing TODO（rule 81 暗示）**：`.gitignore` 排除 `.terraform.lock.hcl`，但 Terraform 官方建議 commit lock file。未來可寫一個小 commit 把它取消排除。本次 commit 沒處理以避免 scope creep。

---

## 給未來 AI agent 的建議

1. **讀 ADR-0017 之前先讀 ADR-0016**：account 邊界與 SSO profile 是 Terraform 程式碼的前提；ADR-0017 假設你已經懂 ADR-0016。
2. **改任何 module 之前先讀 rule 81**：4-file convention、cost-tuning toggle 慣例、apply 紅線都在那裡。
3. **不要在 description 字串內用 `${var}` 語法**：Terraform 1.15+ 會在 init 階段嘗試 evaluate 而炸。改用文字佔位 `'<prefix>-vpc'`。
4. **RDS engine version 永遠先用 `aws rds describe-db-engine-versions` 驗證**：AWS 會 deprecate 舊版本，預設值即使「之前 work」現在也可能不行。
5. **Apply 失敗中斷不是世界末日**：Terraform state 會記住已建好的部分，修 module / 變更 var 後 re-apply 會接續，不會全部重做。我們在 RDS 16.4 故障時就是這樣處理的。
6. **動 `apps/api/Dockerfile` 之前**：理解 ADR-0014（tsup 為何 external @prisma/client）+ ADR-0017 D11（Phase 0 cluster-only），不要把 ECS service 搬進 Phase 0。
7. **Docker build context 是 monorepo root，不是 apps/api/**：每次 `docker build` 都從 root 跑：`docker build -f apps/api/Dockerfile -t opentrade-api:dev .`
8. **不要碰 `bootstrap/state-backend/`**：那是 chicken-and-egg root，已經 apply 過。再次 apply 應該顯示「no changes」。`terraform destroy` 對它是災難級操作。
9. **任何 cost 影響的變動必走變數**：寫死在 main.tf 是 rule 81 紅線；future-prod 升級會痛。

---

## 連結

- [ADR-0017](../decisions/0017-terraform-iac-and-phase0-apply-scope.md) — 本 session 核心決策
- [ADR-0016](../decisions/0016-aws-account-architecture.md) — 上一 session 的 AWS account 基礎
- [ADR-0014](../decisions/0014-api-runtime-architecture.md) — apps/api Dockerfile 的契約
- [ADR-0010](../decisions/0010-split-web-and-console.md) — console 為何要 noindex header
- [rule 81-terraform-iac.mdc](../../.cursor/rules/81-terraform-iac.mdc) — 本 session 新增的程式碼紀律
- [rule 80-aws-accounts.mdc](../../.cursor/rules/80-aws-accounts.mdc) — 配套的 AWS 邊界紀律
- [docs/03-status.md](../03-status.md) — 當前狀態（Phase 0 = 100%）
- [git commit `9202374`](https://github.com/skyyuch/opentrade/commit/9202374) — 本 session 的程式碼產出
