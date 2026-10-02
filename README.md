# 区域夜间换价 · 下发台账（站组基准 / 油枪租约 / 价签回执 三联互控）

- 行业：石油
- 技术栈：Vue3、Vite、TypeScript、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`
- 规则验证：`npx esbuild scripts/test-rules.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs`（29 项断言）

纯前端闭环，台账事件持久化在浏览器 localStorage（key：`night-price-ledger-v1`）。

## 核心设计：append-only 事件台账

总部的「站组基准」、油枪的「签署租约」、站端的「价签回执」三类材料分表维护，但全部动作
只追加不可变事件（`src/ledger/types.ts`），页面状态由 `reduce()` 回放得到
（`src/ledger/engine.ts`），任何成功、失败、越权都在「台账流水」页可查。

## 五条互相牵制的规则

1. **基准更新 → 未签名油枪失效**：`BaselineIssued` 对同组所有租约中 `pending` 的枪追加
   `GunsInvalidated`；已签名枪钉住签名时版本（`pinnedBaselineId`），不受新基准影响；
   失效枪的回执一律拒绝盖章。
2. **断网回执按（租约编号, 枪号）合并**：同回执编号幂等（断网重发不重复盖章）；
   同租约同枪同价也幂等；**同枪异价则在线/断网两版回执都标记 conflict 原样留存，
   两边都不盖章，自动开冲突单交区域复核**，复核期间该枪新回执暂停盖章；区域择一采用后
   另一边驳回（`ReceiptConflict` / `ConflictResolved`）。
3. **主管晚改带不回已签场次**：`supervisorRollback` 对已签枪追加 `RollbackRejected` 拦截
   留痕、枪保持 signed；只有未签枪可 `RollbackApplied` 带回待执行。
4. **签名失败从完整租约重试**：签名必须覆盖租约全部枪号，缺枪/夹带/失效枪时只记
   `SignFailed`（含提交枪号、缺失枪号、尝试次数），**不改任何状态**，再用完整租约重试成功。
5. **越权账号只能交本组材料**：非 hq 账号的每个命令都按 `groupIds` 作用域校验，
   跨组建租约/签租约/交回执/复核均拒绝并追加 `CrossGroupDenied` 留痕。

## 页面

- ① 站组基准：下发新版本、版本台账
- ② 租约签署：建租约、按所选枪号提交（演示缺枪失败）、完整租约重试、主管晚改
- ③ 价签回执：在线/断网补传、同编号重发模拟、合并结果记录
- ④ 区域复核：冲突两边价签并列，择一采用
- ⑤ 枪效审计：**每把枪沿用第几版基准（签名钉版）或因基准更新失效**、盖章数、未决冲突
- 台账流水：全部事件按序号倒序，可按类别过滤
