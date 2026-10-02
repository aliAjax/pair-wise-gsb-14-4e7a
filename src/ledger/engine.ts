import { DIRECTORY } from "./directory";
import type {
  Account,
  BaselineRecord,
  CommandResult,
  ConflictRecord,
  LeaseRecord,
  LedgerEvent,
  NewLedgerEvent,
  ReceiptRecord
} from "./types";

// ============ 事件回放投影：台账事件是唯一事实源 ============

export interface LedgerState {
  baselines: BaselineRecord[];
  leases: LeaseRecord[];
  receipts: ReceiptRecord[];
  conflicts: ConflictRecord[];
  /** 每把租约的签名失败次数（用于审计重试是否从完整租约发起） */
  signAttempts: Record<string, number>;
}

export function emptyState(): LedgerState {
  return { baselines: [], leases: [], receipts: [], conflicts: [], signAttempts: {} };
}

export function reduce(events: LedgerEvent[]): LedgerState {
  const state = emptyState();
  for (const e of events) apply(state, e);
  return state;
}

function activeBaseline(state: LedgerState, groupId: string): BaselineRecord | undefined {
  return [...state.baselines].reverse().find((b) => b.groupId === groupId && b.status === "active");
}

function findLease(state: LedgerState, leaseId: string): LeaseRecord | undefined {
  return state.leases.find((l) => l.id === leaseId);
}

function openConflictOf(state: LedgerState, leaseId: string, gunId: string): ConflictRecord | undefined {
  return state.conflicts.find(
    (c) => c.leaseId === leaseId && c.gunId === gunId && c.status === "open"
  );
}

function apply(state: LedgerState, e: LedgerEvent): void {
  switch (e.type) {
    case "BaselineIssued": {
      for (const b of state.baselines) {
        if (b.groupId === e.groupId && b.status === "active") {
          b.status = "superseded";
          b.supersededBy = e.baselineId;
        }
      }
      state.baselines.push({
        id: e.baselineId,
        seq: state.baselines.filter((b) => b.groupId === e.groupId).length + 1,
        groupId: e.groupId,
        status: "active",
        prices: e.prices,
        issuedAt: e.at,
        issuedBy: e.byName
      });
      break;
    }
    case "LeaseCreated": {
      state.leases.push({
        id: e.leaseId,
        groupId: e.groupId,
        seq: state.leases.filter((l) => l.groupId === e.groupId).length + 1,
        createdAt: e.at,
        createdBy: e.byName,
        guns: e.guns.map((g) => ({ ...g, status: "pending" }))
      });
      break;
    }
    case "LeaseSigned": {
      const lease = findLease(state, e.leaseId);
      if (!lease) break;
      for (const gun of lease.guns) {
        if (e.gunIds.includes(gun.gunId) && gun.status === "pending") {
          gun.status = "signed";
          gun.signedAt = e.at;
          gun.pinnedBaselineId = e.baselineId;
        }
      }
      break;
    }
    case "GunsInvalidated": {
      const lease = findLease(state, e.leaseId);
      lease?.guns.forEach((gun) => {
        if (e.gunIds.includes(gun.gunId) && gun.status === "pending") gun.status = "invalidated";
      });
      break;
    }
    case "RollbackApplied":
    case "RollbackRejected":
    case "SignFailed":
      // 纯记录事件：状态变化已体现在 LeaseSigned / GunsInvalidated 中
      if (e.type === "SignFailed") state.signAttempts[e.leaseId] = e.attempt;
      break;
    case "ReceiptAccepted":
      state.receipts.push(receiptFromEvent(e, "accepted"));
      break;
    case "ReceiptDuplicate":
      state.receipts.push(receiptFromEvent(e, "duplicate"));
      break;
    case "ReceiptRejected":
      state.receipts.push({
        id: `rcpt-rej-${e.seq}`,
        leaseId: e.leaseId,
        groupId: e.groupId,
        gunId: e.gunId,
        channel: e.channel,
        price: e.price,
        receivedAt: e.at,
        submittedBy: e.byName,
        outcome: "rejected",
        idempotencyKey: e.idempotencyKey
      });
      break;
    case "ReceiptConflict": {
      // 同枪冲突：两边回执都保留、都标记为 conflict，交区域复核，任一边都不盖章
      const existing = state.receipts.find((r) => r.id === e.existingReceiptId);
      if (existing) existing.outcome = "conflict";
      state.receipts.push({
        id: e.receiptId,
        leaseId: e.leaseId,
        groupId: e.groupId,
        gunId: e.gunId,
        channel: e.newChannel,
        price: e.newPrice,
        receivedAt: e.at,
        submittedBy: e.byName,
        outcome: "conflict",
        idempotencyKey: e.idempotencyKey,
        conflictsWithReceiptId: e.existingReceiptId
      });
      state.conflicts.push({
        id: e.conflictId,
        leaseId: e.leaseId,
        groupId: e.groupId,
        gunId: e.gunId,
        status: "open",
        onlineReceiptId: e.newChannel === "online" ? e.receiptId : e.existingReceiptId,
        offlineReceiptId: e.newChannel === "offline" ? e.receiptId : e.existingReceiptId,
        onlinePrice: e.newChannel === "online" ? e.newPrice : e.existingPrice,
        offlinePrice: e.newChannel === "offline" ? e.newPrice : e.existingPrice,
        detectedAt: e.at
      });
      break;
    }
    case "ConflictResolved": {
      const conflict = state.conflicts.find((c) => c.id === e.conflictId);
      if (conflict) {
        conflict.status = "resolved";
        conflict.resolvedAt = e.at;
        conflict.resolvedBy = e.byName;
        conflict.decision = e.decision;
        conflict.decidedPrice = e.decidedPrice;
      }
      const win = state.receipts.find((r) => r.id === e.acceptedReceiptId);
      const lose = state.receipts.find((r) => r.id === e.rejectedReceiptId);
      if (win) win.outcome = "accepted";
      if (lose) lose.outcome = "rejected";
      break;
    }
    case "CrossGroupDenied":
      break;
  }
}

function receiptFromEvent(
  e: Extract<LedgerEvent, { type: "ReceiptAccepted" | "ReceiptDuplicate" }>,
  outcome: ReceiptRecord["outcome"]
): ReceiptRecord {
  return {
    id: e.receiptId,
    leaseId: e.leaseId,
    groupId: e.groupId,
    gunId: e.gunId,
    channel: e.channel,
    price: e.price,
    receivedAt: e.at,
    submittedBy: e.byName,
    outcome,
    idempotencyKey: e.idempotencyKey
  };
}

// ============ 命令层：鉴权 + 互相牵制规则 ============

// 事件序号不在命令层预分配：Store 追加落库时按台账真实顺序统一编号（stamp）。
function stamp(actor: Account, note?: string): { at: string; by: string; byName: string; note?: string } {
  return { at: new Date().toISOString(), by: actor.id, byName: actor.name, note };
}

// draft 产出的事件 seq 暂置 -1，由 Store.append 按落库顺序改写。
function draft<T extends NewLedgerEvent>(state: LedgerState, actor: Account, body: T, note?: string) {
  return { seq: -1, ...stamp(actor, note), ...body } as unknown as LedgerEvent;
}

function ok(events: LedgerEvent[], message: string): CommandResult {
  return { ok: true, message, events };
}
function fail(events: LedgerEvent[], message: string): CommandResult {
  return { ok: false, message, events };
}

function canAccess(actor: Account, groupId: string): boolean {
  if (actor.role === "hq") return true;
  return actor.groupIds?.includes(groupId) ?? false;
}

function denyEvent(
  state: LedgerState,
  actor: Account,
  targetGroupId: string,
  action: string,
  payload: unknown
): LedgerEvent {
  return draft(state, actor, {
    type: "CrossGroupDenied",
    actorGroupScope: actor.groupIds ?? [],
    targetGroupId,
    action,
    payload: JSON.stringify(payload)
  });
}

export interface IssueBaselineInput {
  groupId: string;
  prices: { fuel: import("./types").FuelType; price: number }[];
  note?: string;
}

/** 规则①：总部更新站组基准后，该组所有未签名油枪立即失效。 */
export function issueBaseline(events: LedgerEvent[], actor: Account, input: IssueBaselineInput): CommandResult {
  const state = reduce(events);
  if (!canAccess(actor, input.groupId)) {
    return fail([denyEvent(state, actor, input.groupId, "issueBaseline", input)], "越权：只能向本组下发基准");
  }
  if (input.prices.some((p) => !(p.price > 0))) return fail([], "价签金额必须大于 0");

  const baselineId = crypto.randomUUID();
  const newEvents: LedgerEvent[] = [
    draft(
      state,
      actor,
      { type: "BaselineIssued", baselineId, groupId: input.groupId, prices: input.prices },
      input.note
    )
  ];

  // 连带失效：组内所有租约中仍处于待签名的枪
  for (const lease of state.leases.filter((l) => l.groupId === input.groupId)) {
    const pendingGunIds = lease.guns.filter((g) => g.status === "pending").map((g) => g.gunId);
    if (pendingGunIds.length > 0) {
      const prev = activeBaseline(state, input.groupId);
      newEvents.push(
        draft(state, actor, {
          type: "GunsInvalidated",
          groupId: input.groupId,
          baselineId,
          supersededBaselineId: prev?.id ?? baselineId,
          leaseId: lease.id,
          gunIds: pendingGunIds
        })
      );
    }
  }
  const invalidated = newEvents.length - 1;
  return ok(newEvents, invalidated > 0 ? `基准已下发，${invalidated} 个场次的未签名油枪连带失效` : "基准已下发，无待签名油枪");
}

export interface CreateLeaseInput {
  groupId: string;
  guns: { gunId: string; fuel: import("./types").FuelType; price: number }[];
  note?: string;
}

export function createLease(events: LedgerEvent[], actor: Account, input: CreateLeaseInput): CommandResult {
  const state = reduce(events);
  if (!canAccess(actor, input.groupId)) {
    return fail([denyEvent(state, actor, input.groupId, "createLease", input)], "越权：只能在本组创建签署租约");
  }
  const group = DIRECTORY.groups.find((g) => g.id === input.groupId);
  if (!group) return fail([], "站组不存在");
  if (input.guns.length === 0) return fail([], "租约至少包含一把油枪");

  const gunIds = input.guns.map((g) => g.gunId);
  if (new Set(gunIds).size !== gunIds.length) return fail([], "同一把枪在租约中重复出现");
  const illegal = gunIds.filter((id) => !group.guns.some((g) => g.id === id));
  if (illegal.length > 0) return fail([], `油枪不属于本组：${illegal.join("、")}`);
  if (input.guns.some((g) => !(g.price > 0))) return fail([], "价签金额必须大于 0");

  // 基准是租约的前置：没有基准不能排签署场次
  if (!activeBaseline(state, input.groupId)) return fail([], "本组尚无生效基准，不能创建租约");

  const leaseId = crypto.randomUUID();
  return ok(
    [draft(state, actor, { type: "LeaseCreated", leaseId, groupId: input.groupId, guns: input.guns }, input.note)],
    "租约已创建，等待油枪逐枪签名"
  );
}

/** 规则④（重试）：签名必须携带完整租约；缺枪只记 SignFailed，不改任何状态，再从完整租约重试。 */
export function signLease(events: LedgerEvent[], actor: Account, leaseId: string, submittedGunIds: string[]): CommandResult {
  const state = reduce(events);
  const lease = findLease(state, leaseId);
  if (!lease) return fail([], "租约不存在");
  if (!canAccess(actor, lease.groupId)) {
    return fail([denyEvent(state, actor, lease.groupId, "signLease", { leaseId, submittedGunIds })], "越权：只能签署本组租约");
  }

  const allGunIds = lease.guns.map((g) => g.gunId);
  const submitted = [...new Set(submittedGunIds)];
  const missing = allGunIds.filter((id) => !submitted.includes(id));
  const extra = submitted.filter((id) => !allGunIds.includes(id));
  const invalid = lease.guns.filter((g) => submitted.includes(g.gunId) && g.status === "invalidated").map((g) => g.gunId);
  const alreadySigned = lease.guns.filter((g) => submitted.includes(g.gunId) && g.status === "signed").map((g) => g.gunId);

  if (missing.length > 0 || extra.length > 0 || invalid.length > 0) {
    const attempt = (state.signAttempts[leaseId] ?? 0) + 1;
    const reasons: string[] = [];
    if (missing.length > 0) reasons.push(`缺 ${missing.length} 把枪（${missing.join("、")}）`);
    if (extra.length > 0) reasons.push(`含非本租约枪 ${extra.join("、")}`);
    if (invalid.length > 0) reasons.push(`${invalid.join("、")} 已因基准更新失效，须按新基准重排场次`);
    const ev = draft(state, actor, {
      type: "SignFailed",
      leaseId,
      reason: reasons.join("；"),
      submittedGunIds: submitted,
      expectedGunIds: allGunIds,
      missingGunIds: missing,
      invalidGunIds: invalid,
      attempt
    });
    return fail([ev], `第 ${attempt} 次签名失败：${reasons.join("；")}。请用完整租约重试`);
  }
  if (alreadySigned.length === allGunIds.length) return fail([], "该租约所有枪已完成签名");

  const baseline = activeBaseline(state, lease.groupId);
  if (!baseline) return fail([], "本组无生效基准，无法签名");

  return ok(
    [draft(state, actor, { type: "LeaseSigned", leaseId, groupId: lease.groupId, gunIds: allGunIds, baselineId: baseline.id })],
    `签名完成，${allGunIds.length} 把枪沿用第 ${baseline.seq} 版基准`
  );
}

/** 规则③：主管晚改——已签场次拦截留痕；只有未签名枪可带回待执行。 */
export function supervisorRollback(events: LedgerEvent[], actor: Account, leaseId: string): CommandResult {
  const state = reduce(events);
  const lease = findLease(state, leaseId);
  if (!lease) return fail([], "租约不存在");
  if (!canAccess(actor, lease.groupId)) {
    return fail([denyEvent(state, actor, lease.groupId, "supervisorRollback", { leaseId })], "越权：只能操作本组租约");
  }

  const newEvents: LedgerEvent[] = [];
  const signedGunIds = lease.guns.filter((g) => g.status === "signed").map((g) => g.gunId);
  const pendingGunIds = lease.guns.filter((g) => g.status === "pending").map((g) => g.gunId);

  if (signedGunIds.length > 0) {
    newEvents.push(
      draft(state, actor, {
        type: "RollbackRejected",
        leaseId,
        groupId: lease.groupId,
        signedGunIds
      })
    );
  }
  if (pendingGunIds.length > 0) {
    newEvents.push(
      draft(state, actor, {
        type: "RollbackApplied",
        leaseId,
        groupId: lease.groupId,
        pendingGunIds
      })
    );
  }
  if (newEvents.length === 0) return fail([], "租约内没有可带回待执行的未签名枪（其余已失效或已签名）");

  const parts: string[] = [];
  if (signedGunIds.length > 0) parts.push(`已签 ${signedGunIds.length} 把枪被拦截`);
  if (pendingGunIds.length > 0) parts.push(`${pendingGunIds.length} 把未签名枪带回待执行`);
  return fail(newEvents, parts.join("；") + "——已签场次不允许回退");
}

export interface ReceiptInput {
  leaseId: string;
  gunId: string;
  channel: "online" | "offline";
  price: number;
  /** 站端上报幂等键：断网重发携带同一键 */
  idempotencyKey?: string;
}

/** 规则②：断网回执按 (租约编号, 枪号) 合并；同键/同价幂等，同枪异价两边留存交区域复核。 */
export function submitReceipt(events: LedgerEvent[], actor: Account, input: ReceiptInput): CommandResult {
  const state = reduce(events);
  const lease = findLease(state, input.leaseId);
  if (!lease) return fail([], "租约不存在");
  if (!canAccess(actor, lease.groupId)) {
    return fail([denyEvent(state, actor, lease.groupId, "submitReceipt", input)], "越权：只能提交本组材料");
  }
  const gun = lease.guns.find((g) => g.gunId === input.gunId);
  if (!gun) return fail([], "枪号不属于该租约");
  if (!(input.price > 0)) return fail([], "回执价签金额必须大于 0");

  const key = input.idempotencyKey ?? `${input.leaseId}:${input.gunId}:${input.channel}:${input.price}`;

  if (gun.status !== "signed") {
    return fail(
      [
        draft(state, actor, {
          type: "ReceiptRejected",
          leaseId: input.leaseId,
          groupId: lease.groupId,
          gunId: input.gunId,
          channel: input.channel,
          price: input.price,
          reason: gun.status === "invalidated" ? "油枪已随基准更新失效，回执不予盖章" : "油枪尚未签名，回执不予盖章",
          idempotencyKey: key
        })
      ],
      gun.status === "invalidated" ? "该枪已失效，回执拒绝盖章" : "该枪未签名，回执拒绝盖章"
    );
  }

  // 同枪已有未决冲突：第三边不再盖章，等区域先复核
  const openConflict = openConflictOf(state, input.leaseId, input.gunId);
  if (openConflict) {
    return fail(
      [
        draft(state, actor, {
          type: "ReceiptRejected",
          leaseId: input.leaseId,
          groupId: lease.groupId,
          gunId: input.gunId,
          channel: input.channel,
          price: input.price,
          reason: "同枪冲突待区域复核，暂停盖章",
          idempotencyKey: key
        })
      ],
      "该枪存在未复核冲突，暂停继续盖章"
    );
  }

  const byKey = state.receipts.find((r) => r.idempotencyKey === key);
  if (byKey) {
    return ok(
      [
        draft(state, actor, {
          type: "ReceiptDuplicate",
          receiptId: crypto.randomUUID(),
          leaseId: input.leaseId,
          groupId: lease.groupId,
          gunId: input.gunId,
          channel: input.channel,
          price: input.price,
          idempotencyKey: key
        })
      ],
      "重复回执：按租约编号+枪号命中已有盖章，幂等不重复盖章"
    );
  }

  // 已落章回执（按租约+枪合并口径）
  const stamped = state.receipts.find(
    (r) => r.leaseId === input.leaseId && r.gunId === input.gunId && r.outcome === "accepted"
  );
  if (stamped) {
    if (stamped.price === input.price) {
      return ok(
        [
          draft(state, actor, {
            type: "ReceiptDuplicate",
            receiptId: crypto.randomUUID(),
            leaseId: input.leaseId,
            groupId: lease.groupId,
            gunId: input.gunId,
            channel: input.channel,
            price: input.price,
            idempotencyKey: key
          })
        ],
        "同租约同枪同价签重复上报，不重复盖章"
      );
    }
    // 同枪冲突：新边（断网回连）与旧边都保留
    const receiptId = crypto.randomUUID();
    const conflictId = crypto.randomUUID();
    return fail(
      [
        draft(state, actor, {
          type: "ReceiptConflict",
          receiptId,
          existingReceiptId: stamped.id,
          conflictId,
          leaseId: input.leaseId,
          groupId: lease.groupId,
          gunId: input.gunId,
          newChannel: input.channel,
          existingChannel: stamped.channel,
          newPrice: input.price,
          existingPrice: stamped.price,
          idempotencyKey: key
        })
      ],
      `同枪价签冲突（${stamped.channel} ¥${stamped.price} / ${input.channel} ¥${input.price}）：两边留存，交区域复核`
    );
  }

  return ok(
    [
      draft(state, actor, {
        type: "ReceiptAccepted",
        receiptId: crypto.randomUUID(),
        leaseId: input.leaseId,
        groupId: lease.groupId,
        gunId: input.gunId,
        channel: input.channel,
        price: input.price,
        idempotencyKey: key
      })
    ],
    "回执已合并并盖章"
  );
}

/** 区域复核冲突：择一采用，另一边驳回，冲突关闭。 */
export function resolveReceiptConflict(
  events: LedgerEvent[],
  actor: Account,
  conflictId: string,
  decision: "online" | "offline"
): CommandResult {
  const state = reduce(events);
  const conflict = state.conflicts.find((c) => c.id === conflictId);
  if (!conflict) return fail([], "冲突单不存在");
  if (!canAccess(actor, conflict.groupId)) {
    return fail([denyEvent(state, actor, conflict.groupId, "resolveReceiptConflict", { conflictId })], "越权：只能复核本组冲突");
  }
  if (conflict.status !== "open") return fail([], "该冲突已复核");

  const acceptedReceiptId = decision === "online" ? conflict.onlineReceiptId : conflict.offlineReceiptId;
  const rejectedReceiptId = decision === "online" ? conflict.offlineReceiptId : conflict.onlineReceiptId;
  const decidedPrice = decision === "online" ? conflict.onlinePrice : conflict.offlinePrice;

  return ok(
    [
      draft(state, actor, {
        type: "ConflictResolved",
        conflictId,
        leaseId: conflict.leaseId,
        groupId: conflict.groupId,
        gunId: conflict.gunId,
        decision,
        onlinePrice: conflict.onlinePrice,
        offlinePrice: conflict.offlinePrice,
        decidedPrice,
        acceptedReceiptId,
        rejectedReceiptId
      })
    ],
    `复核完成：采用${decision === "online" ? "在线" : "断网补报"}价签 ¥${decidedPrice}`
  );
}

// ============ 审计视图：每把枪沿用或失效的基准 ============

export interface GunAuditRow {
  groupId: string;
  gunId: string;
  leaseId: string | null;
  leaseSeq: number | null;
  status: "unsigned" | "signed" | "invalidated" | "no-lease";
  statusText: string;
  pinnedBaselineSeq: number | null;
  activeBaselineSeq: number | null;
  baselineText: string;
  acceptedStamps: number;
  conflictOpen: boolean;
}

export function auditView(events: LedgerEvent[]): GunAuditRow[] {
  const state = reduce(events);
  const rows: GunAuditRow[] = [];
  for (const group of DIRECTORY.groups) {
    const active = activeBaseline(state, group.id);
    for (const gunRef of group.guns) {
      // 取该枪最新的一条租约场次
      const lease = [...state.leases].reverse().find(
        (l) => l.groupId === group.id && l.guns.some((g) => g.gunId === gunRef.id)
      );
      const gun = lease?.guns.find((g) => g.gunId === gunRef.id);
      let status: GunAuditRow["status"] = "no-lease";
      let statusText = "未排场次";
      let pinnedSeq: number | null = null;
      if (gun) {
        if (gun.status === "signed") {
          status = "signed";
          statusText = "已签名";
        } else if (gun.status === "invalidated") {
          status = "invalidated";
          statusText = "基准更新后失效";
        } else {
          status = "unsigned";
          statusText = "待签名";
        }
        if (gun.pinnedBaselineId) {
          pinnedSeq = state.baselines.find((b) => b.id === gun.pinnedBaselineId)?.seq ?? null;
        }
      }
      const leaseReceipts = lease
        ? state.receipts.filter((r) => r.leaseId === lease.id && r.gunId === gunRef.id)
        : [];
      const acceptedStamps = leaseReceipts.filter((r) => r.outcome === "accepted").length;
      const conflictOpen = lease ? !!openConflictOf(state, lease.id, gunRef.id) : false;

      let baselineText: string;
      if (status === "signed") {
        baselineText = pinnedSeq === active?.seq
          ? `沿用第 ${pinnedSeq} 版基准（现行）`
          : `沿用第 ${pinnedSeq} 版基准（现行第 ${active?.seq ?? "?" } 版）`;
      } else if (status === "invalidated") {
        baselineText = `未沿用：第 ${active?.seq ?? "?"} 版基准下发时未签名，已失效`;
      } else if (status === "unsigned") {
        baselineText = `未签名，待沿用第 ${active?.seq ?? "?"} 版基准`;
      } else {
        baselineText = active ? `现行第 ${active.seq} 版基准，暂无场次` : "本组尚无基准";
      }

      rows.push({
        groupId: group.id,
        gunId: gunRef.id,
        leaseId: lease?.id ?? null,
        leaseSeq: lease?.seq ?? null,
        status,
        statusText,
        pinnedBaselineSeq: pinnedSeq,
        activeBaselineSeq: active?.seq ?? null,
        baselineText,
        acceptedStamps,
        conflictOpen
      });
    }
  }
  return rows;
}
