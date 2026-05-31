# OpenTrade 術語表

> 本文件維護專案中重要的中英術語對照與定義。
> 任何新引入的領域術語，第一次出現時必須在此登記。

---

## 業務術語

| 中文         | English                      | 定義                                                                           |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------ |
| 外匯天眼     | WikiFX                       | 競品。香港 / 中國地區知名的 Web 2.0 外匯經紀商評論平台，被批評有付費刪負評爭議 |
| 財演         | Financial KOL / Stock Pundit | 香港俗稱，公開喊單、提供投資意見的網路紅人                                     |
| 喊單         | Trading Call / Signal        | 公開預測買賣標的的行為                                                         |
| 技術指標賣家 | Technical Indicator Vendor   | 銷售自家開發的買賣訊號指標的人                                                 |
| 持牌證券商   | Licensed Securities Broker   | 持有香港 SFC 第 1 類 / 第 2 類牌照的證券商                                     |
| 認領         | Claim Profile                | 商戶 / KOL 主動認領平台預建檔的個人 / 公司專頁                                 |
| 自證         | Self-attestation             | 上鏈業績作為自己誠實營運的證明                                                 |

## 香港監管術語

| 中文         | English                                | 定義                                                                               |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------------------- |
| SFC          | Securities and Futures Commission      | 香港證券及期貨事務監察委員會                                                       |
| 第 1 類牌照  | Type 1 License                         | 證券交易（schema 內為 `HK_SFC_TYPE_1`）                                            |
| 第 2 類牌照  | Type 2 License                         | 期貨合約交易（`HK_SFC_TYPE_2`）                                                    |
| 第 3 類牌照  | Type 3 License                         | 槓桿式外匯交易（`HK_SFC_TYPE_3`）                                                  |
| 第 4 類牌照  | Type 4 License                         | 就證券提供意見（`HK_SFC_TYPE_4`，OpenTrade 必須避開）                              |
| 第 5 類牌照  | Type 5 License                         | 就期貨合約提供意見（`HK_SFC_TYPE_5`）                                              |
| 第 6 類牌照  | Type 6 License                         | 就機構融資提供意見（`HK_SFC_TYPE_6`）                                              |
| 第 7 類牌照  | Type 7 License                         | 提供自動化交易服務（`HK_SFC_TYPE_7`）                                              |
| 第 8 類牌照  | Type 8 License                         | 證券保證金融資（`HK_SFC_TYPE_8`）                                                  |
| 第 9 類牌照  | Type 9 License                         | 提供資產管理（`HK_SFC_TYPE_9`）                                                    |
| 第 10 類牌照 | Type 10 License                        | 提供信貸評級服務（`HK_SFC_TYPE_10`）                                               |
| CE Number    | Central Entity Number                  | SFC 發給每位持牌人的識別號（例如 "BJA907"），在 `BrokerLicense.licenseNumber` 欄位 |
| VATP         | Virtual Asset Trading Platform License | 虛擬資產交易平台牌照（OpenTrade 不發 token 即可避開）                              |
| PDPO         | Personal Data (Privacy) Ordinance      | 個人資料（私隱）條例                                                               |
| 創科局       | ITC                                    | Innovation and Technology Commission，香港創新科技署                               |
| CCMF         | Cyberport Creative Micro Fund          | 數碼港創意微型基金，10 萬港幣                                                      |
| HKSTP        | Hong Kong Science and Technology Parks | 香港科技園                                                                         |

## Web3 / 區塊鏈術語

| 中文         | English                          | 定義                                               |
| ------------ | -------------------------------- | -------------------------------------------------- |
| 智能合約     | Smart Contract                   | 部署在區塊鏈上、自動執行的程式碼                   |
| 第二層網路   | Layer 2 (L2)                     | 建立在 Ethereum 之上、降低 gas 成本的擴容方案      |
| OP Stack     | OP Stack                         | Optimism 開源的 L2 框架，Base 等多條鏈使用         |
| 帳戶抽象化   | Account Abstraction (ERC-4337)   | 讓使用者用社交帳號登入產生錢包，無需自管私鑰       |
| Paymaster    | Paymaster                        | 代付 gas 的合約模組，讓用戶體驗 gasless            |
| Gas Fee      | Gas Fee                          | 區塊鏈上執行交易的手續費                           |
| 鑄造         | Mint                             | 在鏈上產生新的 token / NFT / SBT                   |
| 質押         | Stake                            | 鎖定代幣作為承諾或保證金                           |
| 靈魂綁定代幣 | Soulbound Token (SBT)            | 不可轉讓的 NFT，用於身份證明                       |
| 零知識證明   | Zero-Knowledge Proof (zk-proof)  | 不揭露原始資料的情況下證明某事為真                 |
| 預言機       | Oracle                           | 把鏈外資料（如價格）餵到鏈上的服務，例如 Chainlink |
| 可驗證隨機   | Verifiable Random Function (VRF) | 鏈上產生公平可驗證的隨機數                         |
| 多重簽名     | Multisig                         | 需要多個錢包共同簽署才能執行的安全機制             |
| 升級代理     | Proxy Pattern                    | 合約升級模式，OpenZeppelin 的 UUPS 為其中一種      |
| 時鎖         | Timelock                         | 強制延後一段時間才能執行的合約模式（升級防呆）     |
| 鏈上索引器   | Indexer                          | 把鏈上事件轉成可查詢資料庫的工具，例如 The Graph   |

## 平台機制術語

| 中文           | English        | 定義                                                          |
| -------------- | -------------- | ------------------------------------------------------------- |
| 陪審團         | Jury           | OpenTrade 的去中心化爭議仲裁機制，由 L3 SBT 持有者組成        |
| 創始陪審員     | Founding Juror | Phase 4 邀請的 30-50 位業界前輩，擁有 L3 SBT                  |
| Give-to-Get    | —              | Glassdoor 式機制：用戶必須先貢獻內容，才能解鎖完整資料        |
| Kleros         | Kleros         | 業界知名的 Web3 去中心化法院協議，OpenTrade 陪審制度參考對象  |
| Outbox Pattern | —              | 資料庫寫入與事件發送的可靠性模式，避免「DB 寫成功但事件丟失」 |
| Multi-tenant   | —              | 一套系統服務多個租戶（例如多個地區市場）的架構模式            |

## 開發與架構術語

| 中文             | English                            | 定義                                                                                                                    |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 領域驅動設計     | Domain-Driven Design (DDD)         | 按業務領域組織代碼的方法論                                                                                              |
| 模組化單體       | Modular Monolith                   | 單一部署單元，但內部按領域嚴格切分，未來可拆 microservices                                                              |
| 命令查詢分離     | CQRS                               | 讀路徑與寫路徑分離的架構模式                                                                                            |
| 六邊形架構       | Hexagonal Architecture             | 業務邏輯與外部依賴解耦的架構模式                                                                                        |
| 架構決策記錄     | Architecture Decision Record (ADR) | 記錄重大技術決策的文件格式                                                                                              |
| 基礎設施即程式碼 | Infrastructure as Code (IaC)       | 用程式碼描述基礎設施，例如 Terraform                                                                                    |
| 特性開關         | Feature Flag                       | 用設定控制功能開關，無需重新部署                                                                                        |
| 不可變基礎設施   | Immutable Infrastructure           | 部署新版本而非修改現有伺服器                                                                                            |
| 軟刪除           | Soft Delete                        | 將記錄標為 `deletedAt` 而非真的 DELETE，保留歷史可追溯性                                                                |
| 監管機構         | Regulator                          | 發出金融牌照的官方機構，schema 內為 `Regulator` enum                                                                    |
| 牌照記錄         | BrokerLicense                      | 證券商持有的單張牌照紀錄，吊銷後保留 row 並改為 REVOKED                                                                 |
| 標的目錄         | Instrument catalog                 | 平台策展的可交易標的（港股/美股/指數/虛擬貨幣/商品）參考表，供訊號標的選擇器搜尋；全域參考資料無 `tenantId`（ADR-0038） |
| 標的類別         | Instrument category                | 選擇器呈現的五種類別，是 `AssetClass` enum 的策展子集（ADR-0038 D2）；新增 `INDEX`/`COMMODITY` 兩值                     |
| 分析師筆記       | KolNote                            | KOL 發布的不可變富文本筆記（K 線截圖等），hash 上鏈 + 內容存 IPFS，可獨立或附於某訊號（ADR-0039）                       |

## OpenTrade 內部專用詞

| 內部詞               | 含義                                           |
| -------------------- | ---------------------------------------------- |
| `apps/web`           | 散戶用戶端 Next.js 應用                        |
| `apps/console`       | 商戶 / KOL / Admin 後台 Next.js 應用           |
| `apps/api`           | 後端 API 服務 (Hono on Node.js)                |
| `packages/contracts` | Solidity 智能合約專案（Foundry）               |
| `packages/db`        | Prisma schema 與 migrations                    |
| `packages/ui`        | 設計系統 + Storybook                           |
| `packages/shared`    | 共用 types / utils                             |
| `packages/config`    | 多鏈、多租戶、feature flag 設定                |
| L0-L5                | 用戶身份等級，詳見 `01-architecture.md` 第六節 |
