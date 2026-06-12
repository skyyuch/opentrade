# UAT 部署框架溝通與啟動 — 2026-06-12

> 本文件歸檔 OpenTrade 項目「AWS 部署框架」規劃對話的精華內容。
> 對應 ADR：[ADR-0046](../decisions/0046-uat-deployment-topology-and-prd-design.md)。

## 對話脈絡

- **日期**：2026-06-12
- **參與者**：項目負責人 + AI agent（Claude Fable 5）
- **背景**：金商 vertical（ADR-0045）收官後，負責人決定在繼續功能開發前先部署到 AWS，並要求先溝通訂好框架再動手。

## 負責人原始需求與最終對齊

| 原始需求                       | 最終拍板                                                              | 修正理由                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 前端一台服務器、後端一台服務器 | 4 個 ECS Fargate service（web / console / api / outbox-worker）       | 既有 ADR-0002/0017 已定容器模型；service 級隔離等同分機，且免 OS 運維、可滾動部署。「服務器」思維轉「服務」思維 |
| UAT 前後端可同一台             | UAT 不刻意合併，改用「共用 cluster + 單 AZ RDS + 最小 task 規格」省錢 | Fargate 按 task 計費，合併沒省錢還失去獨立部署；UAT 拓撲 = PRD 拓撲才有彩排價值                                 |
| PRD DB 兩套並行防數據丟失      | **RDS Multi-AZ**（同步 standby、RPO=0、自動 failover）+ 既有備份/PITR | 應用層雙寫是一致性反模式：寫入無法原子化、網絡分區產生兩套互相矛盾的真相。Multi-AZ 正是該需求的託管實作         |
| 立即建 PRD                     | PRD 只出設計（ADR-0046 D7），Phase 4+ 才建                            | rule 80 帳號邊界（prod account 需 amending ADR-0016）+ 預算（PRD ~$200-250/月會破 $200 硬上限，需預算 ADR）     |
| 域名                           | 暫無域名，UAT 用 `*.cloudfront.net` 預設網址                          | CloudFront 預設憑證自帶 HTTPS；域名日後追加為 additive 變更                                                     |

## 主要討論內容

### 1. 既有地基盤點

Phase 0 已 apply：VPC、單 AZ RDS（db.t4g.micro）、空 ECS cluster、ECR（僅 api）、2 個 S3-origin CloudFront、Secrets slots（~$54/月）。缺：ECS service/ALB、web/console Dockerfile、CI/CD 部署管線。**關鍵發現**：既有 `frontend-cdn` module 是 S3 靜態 origin，但 web/console 是 Next.js 16 SSR，必須改 ALB origin。

### 2. 無域名下的路由設計（ADR-0046 D3）

三個 CloudFront distribution 指向同一 ALB 時 Host header 全是 ALB DNS，Host-based 路由不可行 → 每個 distribution 注入 `X-Opentrade-App: web|console|api` custom header，ALB listener rule 按 header 分流；SG 釘 CloudFront origin-facing managed prefix list + 無 header 403 default action。省 2 個 ALB（~$40/月）。

### 3. 成本

UAT 增量：ALB ~$20 + 4 個最小 task ~$36 + 第三 CloudFront/logs ~$5 → 總計 ~$115-135/月（< $200 硬上限；$50 軟警報持續觸發屬已知）。

### 4. 段 2 實作踩坑（對後續段重要）

- `apps/api/.dockerignore` **從未生效**（build context = repo root 時 Docker 只讀 `<context>/.dockerignore`）→ 補 root `.dockerignore`。
- 乾淨 `pnpm install` 需 gyp toolchain（bufferutil/utf-8-validate 原生編譯）→ 三個 Dockerfile build stage 加 python3/make/g++。
- Prisma 7 的 `prisma.config.ts` extends root `tsconfig.base.json` → deps stage 必須 COPY。
- web/console `build` script 包 `dotenv -e ../../.env`（容器內無 .env）→ Dockerfile 直呼 `pnpm exec next build`。
- 前端 build 需真實 `NEXT_PUBLIC_PRIVY_APP_ID`（假 ID 會 SSR 500）；`NEXT_PUBLIC_*` 是 build-time 烘焙 → **先 apply 基礎設施拿 API CloudFront URL，才能 build 前端映像**（雞生蛋順序，段 7 按此執行）。

## 產生的 ADR

- [ADR-0046](../decisions/0046-uat-deployment-topology-and-prd-design.md): UAT deployment topology on ECS Fargate + PRD environment design（十項決策 D1-D10）

## 產出 commits（本 session，未 push）

1. `d41f133` `docs(decisions): add ADR-0046 UAT deployment topology and PRD design`
2. `a245335` `build(api): harden docker builds for clean rebuilds`
3. `14cbcbd` `build(web): add standalone output and production Dockerfile`
4. `f518680` `build(console): add standalone output and production Dockerfile`

## 待後續處理事項（7 段計畫的段 3-7）

3. Terraform `alb` + `ecs-service` modules + web/console ECR repos
4. dev 環境接線（4 service + CloudFront origin swap + API distribution + RDS SG + secret slots 擴充）
5. Secrets 填值 + `prisma migrate deploy` + seed（SFC/CGSE/instruments）——操作型，需負責人在場
6. GitHub Actions OIDC deploy workflow（terraform 仍 plan-only per rule 80）
7. `terraform apply` → 推映像 → 端到端驗證——操作型，需負責人在場

另：M12 Grant 骨架（原 6/8 截止已過，狀態待負責人確認）、M13 vision/roadmap 升級（6/20 前）仍在隊列。

## 給未來 AI agent 的建議

- 段 3-4 嚴守 ADR-0017 D3 module 四檔慣例（versions/variables/main/outputs），module 不宣告 provider、不讀環境變數、名稱全走 `name_prefix`。
- 段 4 改 `frontend-cdn` 時注意 ADR-0010 的 per-app `X-Robots-Tag`（console noindex）必須保留。
- 段 6 CI/CD：CI 內 build 映像需要 `NEXT_PUBLIC_*` 值來源（GitHub Actions variables / Secrets Manager 讀取），terraform 一律 plan-only（rule 80 紅線）。
- 段 7 apply 前先 `aws sso login --profile opentrade-dev`（token 8 小時過期）。
- 完整計畫檔在本機 `~/.cursor/plans/uat_部署框架_9ac55651.plan.md`（如已移至 workspace 則在 `.cursor/plans/`）。
