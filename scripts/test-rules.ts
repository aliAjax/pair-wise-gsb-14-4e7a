// 五条牵制规则的端到端冒烟测试（直接驱动台账命令层）
import { reduce, issueBaseline, createLease, signLease, supervisorRollback, submitReceipt, resolveReceiptConflict, auditView } from "../src/ledger/engine";
import type { Account, LedgerEvent } from "../src/ledger/types";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name} ${extra}`);
  }
}

const hq: Account = { id: "hq", name: "总部", role: "hq", groupIds: null };
const east: Account = { id: "east", name: "华东主管", role: "regional", groupIds: ["g-east"] };
const north: Account = { id: "north", name: "华北站端", role: "station", groupIds: ["g-north"] };

const prices92 = [{ fuel: "92号汽油" as const, price: 7.62 }];
const prices95 = [{ fuel: "92号汽油" as const, price: 7.79 }];

function append(events: LedgerEvent[], result: { ok: boolean; events: LedgerEvent[] }) {
  let seq = events.reduce((m, e) => Math.max(m, e.seq), 0);
  return [...events, ...result.events.map((e) => ({ ...e, seq: ++seq }))];
}

// ---------- 规则①：基准更新后未签名油枪失效；已签名枪沿用旧版 ----------
{
  console.log("规则① 基准更新联动失效");
  let ev: LedgerEvent[] = [];
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-east", prices: prices92 }));
  const created = createLease(ev, east, {
    groupId: "g-east",
    guns: [
      { gunId: "gun-01", fuel: "92号汽油", price: 7.62 },
      { gunId: "gun-02", fuel: "92号汽油", price: 7.62 }
    ]
  });
  ev = append(ev, created);
  const leaseId = created.events[0].type === "LeaseCreated" ? (created.events[0] as { leaseId: string }).leaseId : "";

  // 只签 gun-01（完整租约签名要求全枪，所以这里先造只含单枪的租约）
  // 重新造：一张单枪租约已签 + 一张两枪租约待签
  const signedLease = createLease(ev, east, { groupId: "g-east", guns: [{ gunId: "gun-01", fuel: "92号汽油", price: 7.62 }] });
  ev = append(ev, signedLease);
  const signedLeaseId = (signedLease.events[0] as { leaseId: string }).leaseId;
  ev = append(ev, signLease(ev, east, signedLeaseId, ["gun-01"]));

  // 下发新基准
  const update = issueBaseline(ev, hq, { groupId: "g-east", prices: prices95 });
  ev = append(ev, update);

  const st = reduce(ev);
  const l1 = st.leases.find((l) => l.id === signedLeaseId)!;
  const l2 = st.leases.find((l) => l.id === leaseId)!;
  check("未签名枪随新基准失效", l2.guns.every((g) => g.status === "invalidated"));
  check("已签名枪不受影响仍 signed", l1.guns[0].status === "signed");
  check("已签名枪沿用（钉住）第1版基准", l1.guns[0].pinnedBaselineId === st.baselines[0].id);
  check("产生 GunsInvalidated 留痕", update.events.some((e) => e.type === "GunsInvalidated"));
  check("失效枪的回执被拒绝", submitReceipt(ev, east, { leaseId: leaseId, gunId: "gun-01", channel: "offline", price: 7.79 }).ok === false);
}

// ---------- 规则②：断网回执按租约+枪号合并；冲突两边留存 ----------
{
  console.log("规则② 回执合并 / 幂等 / 冲突留存");
  let ev: LedgerEvent[] = [];
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-north", prices: prices92 }));
  const c = createLease(ev, north, { groupId: "g-north", guns: [{ gunId: "gun-11", fuel: "92号汽油", price: 7.62 }] });
  ev = append(ev, c);
  const leaseId = (c.events[0] as { leaseId: string }).leaseId;
  ev = append(ev, signLease(ev, north, leaseId, ["gun-11"]));

  const r1 = submitReceipt(ev, north, { leaseId, gunId: "gun-11", channel: "online", price: 7.62, idempotencyKey: "K1" });
  ev = append(ev, r1);
  check("首条在线回执盖章", r1.ok);

  const r2 = submitReceipt(ev, north, { leaseId, gunId: "gun-11", channel: "offline", price: 7.62, idempotencyKey: "K1" });
  ev = append(ev, r2);
  check("断网重发同编号 → 幂等不重复盖章", r2.ok && r2.events[0].type === "ReceiptDuplicate");

  const r3 = submitReceipt(ev, north, { leaseId, gunId: "gun-11", channel: "offline", price: 7.62, idempotencyKey: "K2" });
  ev = append(ev, r3);
  check("同租约同枪同价不同编号 → 仍幂等", r3.ok && r3.events[0].type === "ReceiptDuplicate");

  const r4 = submitReceipt(ev, north, { leaseId, gunId: "gun-11", channel: "offline", price: 7.49, idempotencyKey: "K3" });
  ev = append(ev, r4);
  check("同枪异价 → 冲突，两边留存、不予盖章", !r4.ok && r4.events[0].type === "ReceiptConflict");

  let st = reduce(ev);
  const gunReceipts = st.receipts.filter((r) => r.gunId === "gun-11" && (r.outcome === "conflict"));
  check("两边回执都保留为 conflict", gunReceipts.length === 2);
  const conflictId = st.conflicts[0].id;
  check("存在 open 冲突单", st.conflicts[0].status === "open");

  const r5 = submitReceipt(ev, north, { leaseId, gunId: "gun-11", channel: "online", price: 7.62, idempotencyKey: "K4" });
  ev = append(ev, r5);
  check("冲突未决期间第三边拒绝盖章", !r5.ok);

  const res = resolveReceiptConflict(ev, north, conflictId, "offline");
  ev = append(ev, res);
  st = reduce(ev);
  check("区域复核后冲突关闭", st.conflicts[0].status === "resolved" && st.conflicts[0].decidedPrice === 7.49);
  check("仅一边被采用盖章，另一边驳回", st.receipts.filter((r) => r.gunId === "gun-11" && r.outcome === "accepted").length === 1);
}

// ---------- 规则③：主管晚改带不回已签场次 ----------
{
  console.log("规则③ 主管晚改拦截");
  let ev: LedgerEvent[] = [];
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-east", prices: prices92 }));
  const c1 = createLease(ev, east, { groupId: "g-east", guns: [{ gunId: "gun-01", fuel: "92号汽油", price: 7.62 }] });
  ev = append(ev, c1);
  const signedId = (c1.events[0] as { leaseId: string }).leaseId;
  ev = append(ev, signLease(ev, east, signedId, ["gun-01"]));

  const c2 = createLease(ev, east, { groupId: "g-east", guns: [{ gunId: "gun-02", fuel: "92号汽油", price: 7.62 }] });
  ev = append(ev, c2);
  const pendingId = (c2.events[0] as { leaseId: string }).leaseId;

  const rb1 = supervisorRollback(ev, east, signedId);
  ev = append(ev, rb1);
  check("已签场次晚改被拦截", !rb1.ok && rb1.events.some((e) => e.type === "RollbackRejected"));
  check("被拦截后枪仍是已签名", reduce(ev).leases.find((l) => l.id === signedId)!.guns[0].status === "signed");

  const rb2 = supervisorRollback(ev, east, pendingId);
  ev = append(ev, rb2);
  check("未签名场次可带回待执行", rb2.events.some((e) => e.type === "RollbackApplied"));
}

// ---------- 规则④：签名失败从完整租约重试 ----------
{
  console.log("规则④ 完整租约重试");
  let ev: LedgerEvent[] = [];
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-east", prices: prices92 }));
  const c = createLease(ev, east, {
    groupId: "g-east",
    guns: [
      { gunId: "gun-01", fuel: "92号汽油", price: 7.62 },
      { gunId: "gun-02", fuel: "92号汽油", price: 7.62 },
      { gunId: "gun-03", fuel: "92号汽油", price: 7.62 }
    ]
  });
  ev = append(ev, c);
  const leaseId = (c.events[0] as { leaseId: string }).leaseId;

  const s1 = signLease(ev, east, leaseId, ["gun-01", "gun-03"]); // 缺 gun-02
  ev = append(ev, s1);
  check("缺枪提交 → SignFailed", !s1.ok && s1.events[0].type === "SignFailed");
  check("失败后状态不变（仍全部待签名）", reduce(ev).leases.at(-1)!.guns.every((g) => g.status === "pending"));

  const s2 = signLease(ev, east, leaseId, ["gun-01", "gun-02", "gun-03", "gun-99"]); // 多枪
  ev = append(ev, s2);
  check("夹带非本租约枪 → 继续失败", !s2.ok);

  const s3 = signLease(ev, east, leaseId, ["gun-01", "gun-02", "gun-03"]);
  ev = append(ev, s3);
  check("完整租约重试成功", s3.ok && s3.events[0].type === "LeaseSigned");
  check("失败次数累计 2 次可审计", reduce(ev).signAttempts[leaseId] === 2);
}

// ---------- 规则⑤：越权账号只能交本组材料 ----------
{
  console.log("规则⑤ 越权拦截");
  let ev: LedgerEvent[] = [];
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-east", prices: prices92 }));
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-north", prices: prices92 }));

  const d1 = issueBaseline(ev, north, { groupId: "g-east", prices: prices95 });
  ev = append(ev, d1);
  check("华北账号不能给华东下发基准", !d1.ok && d1.events[0].type === "CrossGroupDenied");

  const d2 = createLease(ev, north, { groupId: "g-east", guns: [{ gunId: "gun-01", fuel: "92号汽油", price: 7.62 }] });
  ev = append(ev, d2);
  check("华北账号不能在华东建租约", !d2.ok);

  const c = createLease(ev, east, { groupId: "g-east", guns: [{ gunId: "gun-01", fuel: "92号汽油", price: 7.62 }] });
  ev = append(ev, c);
  const leaseId = (c.events[0] as { leaseId: string }).leaseId;

  const d3 = signLease(ev, north, leaseId, ["gun-01"]);
  ev = append(ev, d3);
  check("华北账号不能签华东租约", !d3.ok && d3.events[0].type === "CrossGroupDenied");

  const d4 = submitReceipt(ev, north, { leaseId, gunId: "gun-01", channel: "offline", price: 7.62 });
  ev = append(ev, d4);
  check("华北账号不能提交华东回执", !d4.ok);

  const okOwn = createLease(ev, north, { groupId: "g-north", guns: [{ gunId: "gun-11", fuel: "92号汽油", price: 7.62 }] });
  check("本组内操作不受影响", okOwn.ok);
}

// ---------- 审计视图：每把枪沿用或失效的基准 ----------
{
  console.log("审计视图");
  let ev: LedgerEvent[] = [];
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-east", prices: prices92 }));
  const c = createLease(ev, east, {
    groupId: "g-east",
    guns: [
      { gunId: "gun-01", fuel: "92号汽油", price: 7.62 },
      { gunId: "gun-02", fuel: "92号汽油", price: 7.62 }
    ]
  });
  ev = append(ev, c);
  const leaseId = (c.events[0] as { leaseId: string }).leaseId;
  const one = createLease(ev, east, { groupId: "g-east", guns: [{ gunId: "gun-01", fuel: "92号汽油", price: 7.62 }] });
  ev = append(ev, one);
  const oneId = (one.events[0] as { leaseId: string }).leaseId;
  ev = append(ev, signLease(ev, east, oneId, ["gun-01"]));
  ev = append(ev, issueBaseline(ev, hq, { groupId: "g-east", prices: prices95 }));

  const rows = auditView(ev);
  const gun1 = rows.find((r) => r.gunId === "gun-01")!;
  const gun2 = rows.find((r) => r.gunId === "gun-02")!;
  check("gun-01 审计为已签名且沿用第1版", gun1.status === "signed" && gun1.pinnedBaselineSeq === 1 && gun1.activeBaselineSeq === 2);
  check("gun-02 审计为基准更新后失效", gun2.status === "invalidated");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
