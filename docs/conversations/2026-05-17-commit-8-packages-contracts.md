# Commit number-eight — `packages/contracts` 初始化（2026-05-17）

> 本文件歸檔 OpenTrade 項目 Commit number-eight 對話的精華內容。
> 給未來 AI agent 接手用：讀完本檔即可掌握 `packages/contracts` Foundry 工具鏈為何長這樣、為什麼沒寫業務合約、以及未來 Phase 1 寫 `ReviewRegistry` 時要警惕的工具鏈陷阱。

---

## 對話脈絡

- **日期**：2026-05-17（與 commit #1～number-seven 同日；當天第 8 個 commit 系列）
- **參與者**：項目負責人，Claude Opus 4.7 作為 AI agent
- **背景**：Commit number-seven 完成後 Phase 0 進度 95%；本 session 負責 Commit number-eight（packages/contracts 初始化）
- **session 起點**：使用者複製貼上 AGENTS.md 標準 handoff prompt，要求 agent 讀 8 份文件、回報進度，並明確指示「Foundry init + OpenZeppelin v5，Phase 0 只設地基不寫實際合約邏輯，ReviewRegistry / SignalLogger / JuryPool 留到 Phase 1-3」
- **agent 開場確認後**：列出 6 個設計問題（A-F：OZ 版本、forge init Counter 處理、submodule 模式、solhint 引入時機、Chainlink 是否預載、是否寫 ADR-0015）+ 提出 8-9 個原子 commit 拆解；使用者拍板「全部按你的建議」
- **執行**：agent 從安裝 Foundry 一路 ship 到 rule 99 self-review，10 個 todo 全部 completed

---

## 主要討論內容（按主題分節）

### 1. 拆解粒度：10 個原子 todo（其中 8 個 git commit）

依 cursor rule 96「強制拆解觸發」（跨 layer、新功能初始化），agent 開工前先 `TodoWrite` 拆成 t1～t10：

| Todo | 範疇                                                                          | 對應 commit           |
| ---- | ----------------------------------------------------------------------------- | --------------------- |
| t1   | Install Foundry locally via `foundryup --install stable`                      | (env prep，無 commit) |
| t2   | `forge init` scaffolding + `foundry.toml` + `remappings.txt`                  | `89b567d`             |
| t3   | OpenZeppelin v5.6.1 contracts + upgradeable submodules                        | `aaa92ce`             |
| t4   | solhint warning-only config + `lint-staged` 切到 `forge fmt`                  | `13940ca`             |
| t5   | `test/Sanity.t.sol` 工具鏈煙霧測試                                            | `bdd4b3f`             |
| t6   | `packages/contracts/package.json` scripts + package-level `turbo.json`        | `57f1646`             |
| t7   | `packages/contracts/README.md` rewrite                                        | `ff7cddf`             |
| t8   | ADR-0015 + `docs/decisions/README.md` index 更新                              | `42ccff8`             |
| t9   | rule 99 self-review（rule 41 OZ v5 path 修正 + commitlint `decisions` scope） | `18b52c8`             |
| t10  | Handoff：status + conversation + new session prompt                           | （本 commit）         |

每個 commit < 200 行 diff，能獨立通過 CI。t8 ADR-0015 約 300 行 diff，per rule 70 「migration / locale / generated」例外 ≈ docs 也適用（ADR 完整不可拆）。

---

### 2. 開場敲定的 6 個設計問題（A-F）

session 開頭 agent 不是直接動手，而是先提出 6 個會深度影響拆解結構的設計問題請使用者拍板：

| #   | 問題                          | 拍板結果                                                            | 落地位置                                   |
| --- | ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| A   | OZ v5 哪個 minor              | OZ v5.4 latest（agent 開場誤記） → 實際 ls-remote 後 pin **v5.6.1** | ADR-0015 D2                                |
| B   | `forge init` Counter 怎麼處理 | 刪 Counter，換 `Sanity.t.sol`                                       | t2 + t5                                    |
| C   | OZ 安裝模式                   | `forge install` git submodule（per rule 41）                        | t3（後改 raw `git submodule add`，見下方） |
| D   | solhint 是否本 commit 引入    | 是，warning-only minimal ruleset                                    | t4 + ADR-0015 D5                           |
| E   | Chainlink 是否預載            | 否，延後到 Phase 2/3 用到再加                                       | ADR-0015 D8                                |
| F   | 是否寫 ADR-0015               | 是，紀錄全部 8 個決策                                               | t8                                         |

「先提問再拆解」這個流程在事後證明關鍵——`forge install` bug 是個 agent 本來預期能用 happy path 解決的事，事先設定 expectations 讓 trade-off 在使用者面前透明。

---

### 3. **工具鏈意外**：`forge install OpenZeppelin/openzeppelin-contracts@v5.x` 反覆 fail

最大也最費時的意外。`git ls-remote --tags` 明確顯示 v5.6.1 / v5.6.0 / v5.5.0 都存在於 OZ contracts repo，但 `forge install` 依序試了三個版本都報：

```
Cloning into '...lib/openzeppelin-contracts'...
Resolving deltas: 100% (2003/2003), done.
Cloning into '...lib/openzeppelin-contracts/lib/halmos-cheatcodes'...   # ← nested submodule clone 也成功
Installing openzeppelin-contracts ...
Error: Tag: "v5.x.x" not found for repo "..."!
```

forge 內部 clone 成功且 nested submodule init 完，但最後 `git checkout v5.x.x` 步驟報「tag not found」。`--shallow` 與否、不同 v5.x tag 都同樣 fail。對 forge-std（沒 nested submodule）卻 work — 推測是 Foundry 1.7.1 對含 nested submodule 的 repo + 新 tag 的解析有 bug。

**解決方式**：跳過 `forge install`，直接：

```bash
git submodule add https://github.com/OpenZeppelin/openzeppelin-contracts \
  packages/contracts/lib/openzeppelin-contracts
cd packages/contracts/lib/openzeppelin-contracts
git fetch --tags
git checkout v5.6.1
```

結果一樣：`.gitmodules` 多一條 entry，`packages/contracts/lib/openzeppelin-contracts` 變 submodule pointer。對 `forge build` 完全透明。

**清理 staging side-effects**：第一次失敗時 `.gitmodules` 已被 `git submodule add` 寫了一條（即使後續 fail），需要 `git rm --cached` + 手動 `Write` 還原 `.gitmodules`，再從乾淨狀態重來。這個踩坑要警惕未來 agent。

**Phase 1 升 OZ 版本**：可以維持「raw submodule add」流程，或等 Foundry 修了 tag bug 切回 `forge install`。兩種結果在 `.gitmodules` 上一致。

---

### 4. **設計重要決策**：rule 96「徹底長遠方案」如何反映在 `.lintstagedrc.mjs`

當 t5 即將加入第一個 `.sol` 檔時，agent 發現既有 `package.json` 內 `lint-staged` 規則 `"*.sol": ["prettier --write"]` 會炸（沒裝 `prettier-plugin-solidity`，prettier exit 2）。

**選項 A（hack）**：裝 `prettier-plugin-solidity`，與 `forge fmt` 兩個 formatter 並存
**選項 B（折衷）**：`*.sol` 直接 prettier 跑，但加 `|| true` 吞錯
**選項 C（徹底長遠）**：把 `lint-staged` 從 `package.json` 抽到 `.lintstagedrc.mjs`，給 `*.sol` 寫專屬 function 用 `forge fmt --root packages/contracts`，並把 OZ 內含的 `.prettierrc`（reference `prettier-plugin-solidity`）排除進 `.prettierignore`

per rule 96，agent 選 C。這多出兩個檔（`.lintstagedrc.mjs` + `.prettierignore` 修改），但：

1. **`foundry.toml [fmt]` 變成 `.sol` 的單一 style source** — 風格決策貼著 contract code 而不是分散在 lint-staged config
2. **t5 commit 真實觸發過** — pre-commit hook 印出 `[STARTED] forge fmt --root packages/contracts /...test/Sanity.t.sol`，端到端 pipeline 證明 work
3. **不引入 prettier-plugin-solidity** → 沒有第二個 formatter 競賽的可能

驗 `forge fmt --root packages/contracts /tmp/test.sol` 對絕對 path 也 work，且讀到 `foundry.toml` 的 `bracket_spacing = true`、`number_underscore = "thousands"` 等客製化，是 lint-staged hook 能跑通的關鍵。

---

### 5. **rule 99 self-review 的重要發現**：OZ v5 移除了 `ReentrancyGuardUpgradeable`

t9 開始檢視 rule 41 範例與 v5 是否同步時，發現兩件 drift：

#### Drift 1：`security/` 已搬到 `utils/`

OZ v5 早在 release notes 就講過：`PausableUpgradeable` 從 `security/` 搬到 `utils/`。rule 41 第 46 行還在用 v4 path。

```diff
- import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
+ import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
```

#### Drift 2：`ReentrancyGuardUpgradeable` 在 v5 **完全移除**

這個更隱晦。`find packages/contracts/lib/openzeppelin-contracts-upgradeable -name 'ReentrancyGuard*'` 只找到 mocks，沒 production contract。

```bash
$ git ls-tree -r HEAD | grep ReentrancyGuard
test/utils/ReentrancyGuard.test.js
```

連 test 都只剩 non-upgradeable 那份的測試。

**原因**：OZ v5 用 ERC-7201 namespaced storage redesign 後，每個 contract 有 unique storage slot range，non-upgradeable 與 upgradeable 變體之間 storage 不再 conflict。`ReentrancyGuardUpgradeable` 變成多餘，併進非 upgradeable `ReentrancyGuard`。

**rule 41 修正**：

```diff
- import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
+ import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
```

並加 inline comment 警示未來 agent 不要「修回去」。

#### 衍生 status item

Phase 1 寫 `ReviewRegistry` 時，要實測 storage layout (`forge inspect ReviewRegistry storage-layout`) 確認 namespaced storage 真的不會 conflict。已記進 `docs/03-status.md` 待決策。

---

### 6. **設計決策**：`evm_version = "paris"` 而非 cancun

雖然 Base Mainnet 已支援 Cancun（PUSH0 / TLOAD / TSTORE），但：

- 不是每個 OP Stack rollup 都已上 Cancun
- Paris bytecode 在所有 OP Stack 鏈都 work
- `ReentrancyGuardTransient`（用 TLOAD/TSTORE，gas 大省）需要 Cancun

→ Phase 0 保守選 Paris。等 (a) 多鏈部署實際需要 + (b) ReentrancyGuardTransient 的 gas saving 真的有意義時，寫 ADR 切到 Cancun。

紀錄在 ADR-0015 D3 + alternative D。

---

### 7. **設計決策**：`bytecode_hash = "none"` + `cbor_metadata = false`

這兩個 flag 一起讓 `forge build` 在不同機器產生 byte-identical bytecode。原因：

- Solidity 預設在 contract bytecode 末尾附加 metadata hash（包含 source path + compiler config hash）
- 同樣 source code，不同 build 機器的 metadata hash 不同 → bytecode 不同 → BaseScan verify fail
- CI runner 跑 verify 時，跟 local dev 的 bytecode 對不起來

關掉這兩 flag → bytecode deterministic，BaseScan verify 從任何機器都 work。代價：失去 metadata hash 訊號（source 公開 verify 後不重要）。

ADR-0015 D3 + neutral consequence 都記了。

---

### 8. **設計決策**：solhint warning-only Phase 0，error-level Phase 1

`.solhint.json` 是手挑的 9 條 minimal ruleset，全部 `warn`：

```json
{
  "rules": {
    "compiler-version": ["warn", "^0.8.24"],
    "func-visibility": ["warn", { "ignoreConstructors": true }],
    "private-vars-leading-underscore": "warn",
    "no-empty-blocks": "warn",
    "no-global-import": "warn",
    "no-console": "warn",
    "max-line-length": ["warn", 120],
    "ordering": "warn",
    "reason-string": "off"
  }
}
```

**為何不 `extends: "solhint:recommended"`**：recommended 預設大部分 rule 是 `error`，會在 Phase 0 還沒有業務合約時就擋住 toolchain smoke test。Phase 1 第一個業務合約 PR 必須同時：(a) tighten ruleset 到 error-level 並 extend recommended; (b) 把 lint glob 從 `test/**/*.sol` 擴到 `{src,test,script}/**/*.sol`。

**為何 `reason-string` off**：rule 41 已禁 `require(... , "string")`，要用 custom error。solhint 沒對應 rule 直接禁 require-string；`reason-string` 只是限長度。off。

---

### 9. **package-level `turbo.json` override**：消除既有 warning

t6 加 `packages/contracts/turbo.json` package-level overrides 處理三件事：

1. `build.outputs: ["out/**", "cache/**"]` — turbo cache forge build artifacts
2. `build.inputs` 加 `foundry.toml` / `remappings.txt` / 全部 `.sol` — config-only edit 也 invalidate cache
3. `test`/`lint`/`typecheck.outputs: []` — 消除既有 「no output files found」warning（typecheck 是 echo stub 不生 `.tsbuildinfo`）

注意：root `turbo.json` 還有 7 個 packages 也會印 「no output files found for task X#test」warning（@opentrade/api/config/console/db/shared/ui/web）。這是 既有 issue，不在本 commit 範圍。Commit number-ten（CI/CD）可一併修。

---

### 10. **驗證紀律**：每個 commit 結束前都跑 quality gate

每個 git commit 之前都先：

1. 對 .sol：`forge fmt --check` + `forge build` + `forge test` + `solhint`
2. 對 root：`pnpm format:check` + `pnpm lint` + `pnpm typecheck`

`pnpm format:check` 在 t3 (OZ submodule 加入後) 第一次跑炸（OZ 自己 `.prettierrc` reference `prettier-plugin-solidity`），同 commit 補 `.prettierignore lib/` 解決。提醒未來 agent：每次加 git submodule 時都要評估 vendored config 是否會干擾 root tooling。

t5 commit 時 `.lintstagedrc.mjs` 對 `.sol` 真實觸發過 forge fmt — pre-commit hook output 是最重要的驗證：

```
[STARTED] packages/contracts/**/*.sol — 1 file
[STARTED] forge fmt --root packages/contracts /.../Sanity.t.sol
[COMPLETED] forge fmt --root packages/contracts /.../Sanity.t.sol
```

這代表整條 lint-staged → forge fmt pipeline 端到端 work。

---

## 產生的 ADR

- **ADR-0015**：packages/contracts toolchain setup（8 個決策完整紀錄）— `docs/decisions/0015-contracts-toolchain-setup.md`

## 關連既有 ADR

- ADR-0001（Base L2）：本 ADR 對齊 OP Stack 通用設計，`evm_version = paris` 是這原則的具體落地
- ADR-0006（DDD Modular Monolith）：合約 facade 角色，本 commit 不寫業務 logic
- ADR-0007（V1 不發 token）：本 commit 不引入 token 合約，相關 interface 預留到 Phase 6+
- ADR-0008（陪審團階段交付）：本 commit 不引入 Chainlink VRF，留到 Phase 3
- rule 41（Solidity standards）：本 commit + t9 self-review 把 rule 41 範例同步到 v5

---

## 待後續處理事項

- [x] **Commit number-eight 系列 8 個 commits + handoff commit 推到 GitHub**：已 push (`b9bcbfe..f5be3c1`)，origin/main 與 local 同步
- [ ] **Phase 1 第一個業務合約 PR 必做**（per ADR-0015 D5/D6）：
  - solhint 從 warning-only 切 error-level，並 extend `solhint:recommended`
  - lint glob 從 `test/**/*.sol` 擴成 `{src,test,script}/**/*.sol`
  - 用 `forge inspect ReviewRegistry storage-layout` 實測 OZ v5 ERC-7201 namespaced storage 在 UUPS proxy 下真的安全
  - 如不安全則改用 `ReentrancyGuardTransient` 並寫 ADR 切 `evm_version = cancun`
- [ ] **Commit number-ten（CI/CD）必做**：
  - 加 `foundry-toolchain` action pin forge 1.7.x
  - PR job 先跑 `git submodule update --init --recursive`
  - `forge build / forge test / forge fmt --check` 為 hard gate；`solhint` 仍 warning-only
  - 7 個 既有 `test#*` task 的 `no output files found` warning 一併在 package-level `turbo.json` 補 `outputs: []`
- [ ] **Foundry tag-resolve bug 監控**：若 Foundry 上游修了，可把 OZ submodule 從 raw `git submodule add` 流程切回 `forge install ...@v5.6.x`（兩種結果在 git 上一致）

---

## 給未來 AI agent 的建議

### Commit number-nine（infra）會切換語境

從 Solidity / Foundry / OZ v5 的合約語境跳回 Terraform / AWS / Docker 的 infra 語境。建議下個 agent：

1. 重讀 `.cursor/rules/` 內任何 infra/IaC 相關規則（目前可能還沒，Commit number-nine 可能要新增）
2. 重讀 ADR-0002（AWS as sole cloud provider）
3. 重讀 ADR-0014（apps/api 運行架構，Dockerfile 設計與 Prisma engines copy strategy）
4. 重讀 ADR-0010（apps/web vs apps/console 各自獨立部署）

不需要繼續關注 contracts 的事，Phase 1 ReviewRegistry 才是 contracts 的下一個 milestone。

### 本 session 學到的要點

1. **`forge install` 在 Foundry 1.7.1 對 OZ v5.5+ tag 有 bug** — 改用 raw `git submodule add` + `git checkout <tag>`。記在 ADR-0015 D2 alternatives。
2. **OZ v5 移除了 `ReentrancyGuardUpgradeable`** — 用 ERC-7201 namespaced storage 後不再需要，直接 inherit 非 upgradeable `ReentrancyGuard`。寫第一個業務合約時必須 `forge inspect storage-layout` 實測安全性。
3. **`.lintstagedrc.mjs` functional syntax** — 當 `.sol` 不能跟 prettier 共用 `prettier --write` flow 時，抽到 `.mjs` 寫 function 是「徹底長遠方案」，比裝 `prettier-plugin-solidity` 更乾淨。
4. **每次加 git submodule 都要評估 vendored config drift** — OZ 自己 `.prettierrc` reference `prettier-plugin-solidity`，需要在 `.prettierignore` 加 `lib/` 隔離。下次加 Chainlink 等 submodule 時同樣要查。
5. **`bytecode_hash = "none"` + `cbor_metadata = false`** — deploy 到不同機器仍 byte-identical，BaseScan verify 從 CI runner 才 work。
6. **`forge fmt` + `solhint` 雙 tool 分工** — fmt 處理風格、lint 處理語意。不該 overlap，更不該裝第三個 formatter。
7. **「Phase 0 toolchain ready, 業務合約延後」是 explicit 紀律** — 不是「還沒寫完」。`README.md` + ADR-0015 + 三 `.gitkeep` 都互相強化這個訊息，避免下個 agent 「順手寫個 ReviewRegistry stub」打破紀律。
8. **每個原子 commit 都要能獨立通過 CI** — 從 t2 forge init 到 t9 self-review，每個都跑過完整 quality gate 才 commit。多花 ~10 分鐘但讓整個系列可 cherry-pick 與 revert。

### 結束本 session 時的 git 狀態

- branch: `main`，與 `origin/main` 完全同步（push 在 handoff commit 之後完成）
- HEAD（本 session 開始前）：`b9bcbfe docs(status): mark commit number-seven as pushed`
- HEAD（本 session 結束前）：`18b52c8 chore(rules): sync rule 41 imports to OZ v5 layout and reserve decisions scope`
- 本 session 9 個 commits（時間順）：
  1. `89b567d` chore(contracts): forge init scaffolding with foundry.toml and remappings
  2. `aaa92ce` chore(contracts): add openzeppelin v5.6.1 contracts and upgradeable as submodules
  3. `13940ca` chore(contracts): add solhint config and route .sol formatting through forge fmt
  4. `bdd4b3f` test(contracts): add toolchain sanity smoke test
  5. `57f1646` chore(contracts): wire forge build/test/lint into pnpm and turbo pipeline
  6. `ff7cddf` docs(contracts): rewrite README with Phase 0 toolchain status and first-time setup
  7. `42ccff8` docs(decisions): add ADR-0015 packages/contracts toolchain setup
  8. `18b52c8` chore(rules): sync rule 41 imports to OZ v5 layout and reserve decisions scope
  9. （`docs(status): handoff after commit number-eight (packages/contracts shipped)` — 本 commit）
