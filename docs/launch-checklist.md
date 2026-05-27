# OpenTrade 上線前必定執行 Checklist

> **上線定義**：Phase 5 公測標準 — 完全對外開放，任何人可使用，無邀請制。
> 本文件列舉所有必須在公開上線前完成的工作項目。
> 每項標記 priority：🔴 Blocking / 🟡 Strongly Recommended / 🟢 Continuous。

---

## Priority 說明

| Tag                         | 含義                   | 不做的後果                           |
| --------------------------- | ---------------------- | ------------------------------------ |
| 🔴 **Blocking**             | 不做不能對外開放       | 法律風險 / 安全漏洞 / 信任崩塌       |
| 🟡 **Strongly Recommended** | 不做仍可 ship 但風險大 | 用戶體驗破損 / 營運盲區 / 技術債爆發 |
| 🟢 **Continuous**           | 上線後持續強化         | 不影響 launch 但長期必做             |

---

## §1 Observability & Logging 後台

> **核心問題**：現時沒有地方看到 log。上線後 debug、安全監控、用戶支援全部依賴 log 後台。

### 技術選型

- **Server-side**：CloudWatch Logs + Logs Insights + CloudWatch Dashboard（對齊既有 AWS 棧，零額外 infra）
- **Client-side**：Sentry（free tier 5k errors/月，Phase 5+ 升付費 tier）
- **預估成本**：~$5-20/月（CloudWatch ingestion + storage），Sentry $0 → $29/月

### 子項

- [ ] 🔴 **1.1** 結構化 logging — Pino logger 升級，統一 JSON 格式，加 correlation ID（每 request 一個 UUID，從 web → api → outbox worker 串聯）
- [ ] 🔴 **1.2** CloudWatch Log Groups 結構化：
  - `/opentrade/api` — API server logs
  - `/opentrade/web` — Next.js SSR logs
  - `/opentrade/console` — Console SSR logs
  - `/opentrade/outbox-worker` — Outbox worker lifecycle
  - `/opentrade/audit` — 安全事件 + admin action log（獨立 group，永久保留）
- [ ] 🔴 **1.3** Log retention policy：hot logs 30 天 → archive to S3 Glacier；audit log 永久保留
- [ ] 🔴 **1.4** PII / Secret scrub middleware（per rule 50）— log 不可含 email / phone / wallet private key / JWT token body
- [ ] 🟡 **1.5** CloudWatch Logs Insights saved queries（常用 8-10 條）：
  - 5xx error 抓取（by timestamp range）
  - 特定 user trace（by correlation ID）
  - IPFS upload 失敗
  - Outbox worker stuck / retry 超限
  - JWT 驗證拒絕（brute-force 偵測）
  - Rate limit hit（by IP / by user）
  - DB slow query（> 1s）
  - Smart contract tx failure（revert reason）
- [ ] 🟡 **1.6** CloudWatch Dashboard（5 個核心 panel）：
  - API 5xx error rate（1 min granularity）
  - API latency p50 / p95 / p99
  - Outbox worker lag（pending events count + oldest event age）
  - DB connection pool utilization
  - API request volume（by endpoint group）
- [ ] 🔴 **1.7** SNS Alert 設定（觸發 → email，Phase 5+ 升 PagerDuty）：
  - 5xx > 5/min
  - Outbox lag > 5 min
  - DB connection pool > 80%
  - CloudWatch anomaly detection on request volume（DDoS early warning）
  - Audit log 出現 admin role 變動
- [ ] 🟡 **1.8** Sentry 接入 web + console（client-side JS error + source map upload）
- [ ] 🟢 **1.9** APM tracing（Phase 5+ 考慮 AWS X-Ray 或 OpenTelemetry）

---

## §2 Branch / CI 紅線

> Per rule 70 + `docs/03-status.md` 流程層級紅線。

- [ ] 🔴 **2.1** 列清 7 條 required status check 具體名稱（typecheck / lint / unit / build / forge / e2e / migration safety）
- [ ] 🔴 **2.2** `.github/workflows/` 補齊所有 status check workflow，main 上每個 commit 至少跑過一次
- [ ] 🔴 **2.3** 寫 ADR 紀錄：何時完全解除 admin bypass 權限
- [ ] 🔴 **2.4** 新功能一律走 `feature/xxx → PR → CI → squash merge`（rule 70 紅線）
- [ ] 🟡 **2.5** Branch protection 設定（GitHub Settings UI）：require PR review + require status checks + disable admin bypass
- [ ] 🟡 **2.6** CODEOWNERS 更新（第二位 contributor 加入時）

---

## §3 Smart Contract Audit

> Per rule 41 + rule 00 紅線：合約不可有 owner-only 修改評論的函數 + 必須用 OpenZeppelin。

- [ ] 🔴 **3.1** 第三方 audit firm 接洽 + 簽約（候選：OpenZeppelin / Trail of Bits / CertiK / 香港 local firm）
- [ ] 🔴 **3.2** Audit 完成 + 所有 Critical / High findings 修復
- [ ] 🔴 **3.3** Bug bounty program 啟動 + 至少跑 30 天再對外開放
- [ ] 🔴 **3.4** Multisig + Timelock 部署（建議 3-of-5 signers）
- [ ] 🔴 **3.5** Pause mechanism 驗證（緊急暫停合約 per rule 50 incident response）
- [ ] 🟡 **3.6** OZ Defender / Tenderly 接入（合約 monitoring + auto-pause trigger）
- [ ] 🟡 **3.7** Upgrade path 驗證（UUPS proxy storage layout 一致性 per status.md 開放問題）

---

## §4 Production Deploy 機制

- [ ] 🔴 **4.1** Production migration runbook 實跑（`db:backfill:prod` 全 script dry-run on staging）
- [ ] 🔴 **4.2** ReviewRegistry + ReviewerSBT + KolSbt **mainnet** 部署 plan + deploy script + verify script
- [ ] 🔴 **4.3** Outbox worker production health check + ECS auto-restart + dead letter queue
- [ ] 🔴 **4.4** Database backup 策略：automated daily snapshots + cross-region replica（RDS Multi-AZ）
- [ ] 🔴 **4.5** 異地復原演練（至少一次 full restore from snapshot → verify data integrity）
- [ ] 🔴 **4.6** RTO / RPO 定義（建議：RTO < 1h / RPO < 5min for production）
- [ ] 🟡 **4.7** Production secrets rotation playbook（JWT key / DB password / Privy secret / Pinata key）
- [ ] 🟡 **4.8** Blue-green deploy 或 rolling deploy 策略（ECS Fargate service update）
- [ ] 🟡 **4.9** CDN cache invalidation playbook（CloudFront）

---

## §5 Security / Privacy

> Per rule 50 + PDPO（香港個人資料條例）。

- [ ] 🔴 **5.1** User.email 加密策略拍板 + 實作（envelope encryption via KMS 或 application-level AES-256-GCM）
- [ ] 🔴 **5.2** PDPO 6 條 data subject right 全部實作：
  - 查閱權（access）
  - 更正權（correction）
  - 刪除權（erasure — 注意鏈上資料不可刪，但 off-chain PII 必須可刪）
  - 資料可攜權（portability — export JSON）
  - 反對權（objection）
  - 限制處理權（restriction）
- [ ] 🔴 **5.3** PDPO 72h incident notification 流程文件化
- [ ] 🔴 **5.4** Incident response playbook + post-mortem template（存 `docs/incidents/`）
- [ ] 🔴 **5.5** Penetration test（外部 firm）— 必須通過，所有 Critical / High 修復
- [ ] 🔴 **5.6** WAF rule 生效 + rate limit production 驗證
- [ ] 🔴 **5.7** Secrets Manager 全 rotate 一次（確保 production 不沿用 dev secret）
- [ ] 🟡 **5.8** DDoS mitigation plan（CloudFront + WAF + Shield Standard）
- [ ] 🟡 **5.9** Content Security Policy header（XSS 二線防禦）
- [ ] 🟢 **5.10** 定期 secret rotation 自動化（Lambda + Secrets Manager rotation function）

---

## §6 AWS Infra（per ADR-0016）

- [ ] 🔴 **6.1** `opentrade-prod` sub-account 建立（獨立 IAM 邊界）
- [ ] 🔴 **6.2** Production Terraform workspace 建立（`infra/terraform/environments/prod`）
- [ ] 🔴 **6.3** RDS Multi-AZ 啟用（production only）
- [ ] 🔴 **6.4** `us-east-1` opt-in（CloudFront ACM SSL 證書）
- [ ] 🔴 **6.5** SCP 三條啟用：region allow-list / DenyRootUserActions / DenyMFADisable
- [ ] 🟡 **6.6** `opentrade-staging` sub-account 建立（deploy pipeline 驗證用）
- [ ] 🟡 **6.7** OpenTradeAdmin permission set 拆分：Admin / ReadOnly / BillingOnly
- [ ] 🟡 **6.8** CloudFront distribution + custom domain 設定
- [ ] 🟡 **6.9** Route 53 hosted zone + DNS records
- [ ] 🟢 **6.10** Cost optimization review（reserved instance / savings plan 評估）

---

## §7 Legal / Compliance

- [ ] 🔴 **7.1** Privacy Policy（zh-Hant / zh-Hans / en）— 律師簽核版
- [ ] 🔴 **7.2** Terms of Service（三語）— 律師簽核版
- [ ] 🔴 **7.3** Disclaimer copy — 退休 SFC 董事 + 律師 review 簽核
- [ ] 🔴 **7.4** SFC 第 4 類牌照 self-assessment 文件（確認不觸紅線）
- [ ] 🔴 **7.5** 正式法律意見書（盤點 SFC 第 4 類 + VATP + PDPO + 證據法）
- [ ] 🟡 **7.6** Cookie policy / consent banner
- [ ] 🟡 **7.7** DMCA / notice-and-takedown 流程（僅 off-chain 內容；on-chain 不適用但需 disclaimer）
- [ ] 🟢 **7.8** 商標註冊（OpenTrade 名稱 + Logo）

---

## §8 UX / Performance

- [ ] 🔴 **8.1** Error boundary + 404 / 500 / 503 custom page（三語）
- [ ] 🔴 **8.2** Status page（uptimerobot.com 或 自建 minimal）— 公開系統狀態
- [ ] 🟡 **8.3** Lighthouse Core Web Vitals baseline（LCP < 2.5s / FID < 100ms / CLS < 0.1）
- [ ] 🟡 **8.4** Mobile RWD 全頁面 review（iOS Safari + Android Chrome）
- [ ] 🟡 **8.5** 三語 i18n 人工校對（非機翻；至少 zh-Hant 全 review 一次）
- [ ] 🟡 **8.6** Loading skeleton / optimistic UI（避免白屏）
- [ ] 🟢 **8.7** Image optimization（next/image + WebP + lazy load）
- [ ] 🟢 **8.8** Bundle size audit + code splitting 優化

---

## §9 內容 / 資料

- [ ] 🔴 **9.1** Production seed data — HK SFC 持牌證券商完整列表預載（3,482 brokers 已在 dev DB）
- [ ] 🔴 **9.2** robots.txt 策略：web 允許 crawl / console disallow（已實作）/ API disallow
- [ ] 🟡 **9.3** sitemap.xml 自動生成（Next.js built-in sitemap）
- [ ] 🟡 **9.4** OG image / favicon / app icon 全套
- [ ] 🟡 **9.5** SEO meta tags review（title / description / structured data）
- [ ] 🟢 **9.6** 初始 KOL 入駐（至少 3-5 位願意公開上鏈的 KOL）

---

## §10 上線當天 Runbook

- [ ] 🔴 **10.1** Go-live checklist 表（每項勾人、勾時間、勾驗證點）
- [ ] 🔴 **10.2** Rollback plan（三層：DB schema rollback / contract pause / ECS deploy rollback）
- [ ] 🔴 **10.3** On-call rotation 排班（24/7 至少頭 2 週；之後降為 business hour + emergency pager）
- [ ] 🔴 **10.4** Communication template（內部告知 / 用戶通知 / 媒體稿 / 監管機構通知）
- [ ] 🟡 **10.5** Load test（模擬 1,000 concurrent users，驗證 ECS auto-scaling + RDS connection pool）
- [ ] 🟡 **10.6** Canary release（先開放 10% traffic，觀察 1 小時無異常再全量）

---

## §11 Anti-Abuse（公開上線專屬）

> 邀請制不需要；完全對外開放後必須。

- [ ] 🔴 **11.1** Sybil 防範：
  - IP rate limit（Privy 層 + API 層雙重）
  - 同一錢包地址短時間大量操作偵測
  - KOL 申請反洗單（同一裝置 / 同一 IP 多次申請）
- [ ] 🔴 **11.2** 內容過濾 pipeline（per ADR-0034 雙層架構 — 鏈上 immutable + indexer 可隱藏標註）：
  - 敏感詞 blocklist（繁 / 簡 / 英）
  - 仇恨言論 AI 偵測（Phase 5 可用 Perspective API 或 OpenAI moderation endpoint）
  - 人工 review queue（admin flag → 隱藏 from default feed → 用戶仍可透過直連查看原始鏈上內容）
- [ ] 🔴 **11.3** DDoS / Abuse 防範：
  - CloudFront + WAF geo-blocking（可選）
  - API Gateway throttling
  - Abnormal behavior detection（同 IP 大量註冊、同錢包大量提交）
- [ ] 🟡 **11.4** 舉報機制（用戶可 flag 內容 → 進 admin review queue）
- [ ] 🟡 **11.5** 用戶封禁機制（admin 可 suspend user → 保留鏈上歷史但禁止新操作）

---

## §12 商業 Readiness（公開上線專屬）

- [ ] 🔴 **12.1** 客服管道建立（至少 email + 一個即時通訊：Discord / Telegram / WhatsApp Business）
- [ ] 🔴 **12.2** 公司戶開立 + 收款流程（若 Phase 5 開始收 SaaS 費）
- [ ] 🟡 **12.3** 退款政策（Terms of Service 內含）
- [ ] 🟡 **12.4** ToS dispute resolution clause（仲裁條款）
- [ ] 🟡 **12.5** Analytics 接入（Plausible / PostHog — 避 Google Analytics GDPR 爭議）
- [ ] 🟡 **12.6** Pitch Deck 準備（3 / 5 / 10 分版本，per 5/25 會議 6/20 deadline）
- [ ] 🟢 **12.7** Press kit（logo 套件 + 一段式 / 三段式介紹文 + 創辦人 headshot）

---

## 開放問題（待拍板）

| #   | 問題                             | 影響段落 | 建議                                                                            |
| --- | -------------------------------- | -------- | ------------------------------------------------------------------------------- |
| 1   | Audit firm 候選                  | §3       | OpenZeppelin（金標但貴）/ CertiK（快但名聲兩極）/ 香港 local（便宜但經驗少）    |
| 2   | Penetration test budget          | §5       | HK$30k-100k 範圍；建議先做 automated scan（Burp Suite Pro）再做 manual          |
| 3   | Bug bounty 預算 + 平台           | §3       | Immunefi（Web3 focused）/ HackerOne（通用）；pool 至少 $10k USD                 |
| 4   | Multisig signers 名單            | §3       | 建議 3-of-5：負責人 + 退休 SFC 董事 + 技術顧問 + 合規顧問 + 投資人代表          |
| 5   | 域名最終方案                     | §6       | opentrade.io / opentrade.ai / opentrade.hk — 待決策                             |
| 6   | Content moderation ADR-0034 拍板 | §11      | 雙層架構（鏈上不動 + indexer 標註）已有共識，但 rule 52 待寫                    |
| 7   | Token Economy 引入時機           | §12      | Phase 5+ 寫 ADR-0030 superseding ADR-0007；短文寫 "Loyalty Points" 不寫 "Token" |
| 8   | Log 後台 APM 升級時機            | §1       | Phase 5+ 考慮 AWS X-Ray 或 OpenTelemetry；Phase 5 先用 CloudWatch 夠用          |

---

## 與其他文件的關聯

| 文件                                              | 關聯                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`docs/03-status.md`](./03-status.md)             | 進度追蹤；每完成一項本 checklist 勾選 → 同步更新 status                        |
| [`docs/02-roadmap.md`](./02-roadmap.md)           | Phase 4-5 milestone 定義                                                       |
| [`docs/00-vision.md`](./00-vision.md)             | 核心紅線來源                                                                   |
| [`docs/decisions/`](./decisions/)                 | ADR-0002 預算 / ADR-0016 AWS / ADR-0034 content moderation / ADR-0007 no token |
| [`.cursor/rules/`](../.cursor/rules/)             | rule 00 業務紅線 / rule 41 合約 / rule 50 安全 / rule 70 CI / rule 80 AWS      |
| [`docs/grant-application/`](./grant-application/) | M12 grant 短文（部分 narrative 會引用本 checklist 進度作為 MVP 成熟度證明）    |

---

## 使用方式

1. 每個 session 開始前掃一眼本 checklist，確認當前工作是否推進了某項
2. 完成某項後：勾選 `[x]` + 備註日期 + 對應 commit / ADR / 文件
3. 所有 🔴 Blocking 項目完成 → 可以安排 launch date
4. 🟡 項目在 launch 後 30 天內補齊
5. 🟢 項目持續迭代

---

**建立日期**：2026-05-27
**最後更新**：2026-05-27
**維護者**：項目負責人 + 所有貢獻過的 AI agents
