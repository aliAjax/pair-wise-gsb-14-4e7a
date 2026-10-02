import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  ACCOUNTS,
  FUELS,
  FUEL_SHORT,
  GROUPS,
  NOZZLES,
  type Account,
  type AuditEvent,
  type Baseline,
  type Conflict,
  type Lease,
  type Nozzle,
  type PriceMap,
  type Receipt,
  type Result,
} from "./types";

const STORAGE_KEY = "dfwlfront-9-ledger-v1";

/* ---------- 展示辅助 ---------- */

export function groupName(groupId: string): string {
  return GROUPS.find((g) => g.id === groupId)?.name ?? groupId;
}

export function nozzleOf(nozzleId: string): Nozzle | undefined {
  return NOZZLES.find((n) => n.id === nozzleId);
}

export function pricesText(prices: PriceMap): string {
  return FUELS.map((f) => `${FUEL_SHORT[f]} ${Number(prices[f]).toFixed(2)}`).join(" / ");
}

export function pricesEqual(a: PriceMap, b: PriceMap): boolean {
  return FUELS.every((f) => Number(a[f]) === Number(b[f]));
}

export function fmtTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function stateClass(state: string): string {
  switch (state) {
    case "已签名":
      return "chip-ok";
    case "签名失败":
      return "chip-bad";
    case "已失效":
      return "chip-void";
    default:
      return "chip-pending";
  }
}

export function receiptClass(status: string): string {
  switch (status) {
    case "已合并":
    case "复核采纳":
      return "chip-ok";
    case "重复拦截":
      return "chip-warn";
    case "冲突待复核":
      return "chip-bad";
    case "复核驳回":
      return "chip-void";
    default:
      return "chip-pending";
  }
}

function tonightSession(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} 夜间`;
}

/* ---------- 演示种子数据 ---------- */

interface SeedState {
  baselines: Baseline[];
  leases: Lease[];
  receipts: Receipt[];
  conflicts: Conflict[];
  audit: AuditEvent[];
  accountId: string;
}

function buildSeed(): SeedState {
  const v2East: PriceMap = { "92号汽油": 7.6, "95号汽油": 8.08, "0号柴油": 7.15 };
  const v3East: PriceMap = { "92号汽油": 7.62, "95号汽油": 8.11, "0号柴油": 7.18 };
  const v2West: PriceMap = { "92号汽油": 7.59, "95号汽油": 8.06, "0号柴油": 7.12 };

  const baselines: Baseline[] = [
    { id: "BL-E-2", groupId: "G-E", version: 2, prices: { ...v2East }, issuedBy: "总部调价中心", issuedAt: "2026-10-01T21:02:00", note: "前夜基准" },
    { id: "BL-E-3", groupId: "G-E", version: 3, prices: { ...v3East }, issuedBy: "总部调价中心", issuedAt: "2026-10-02T21:14:00", note: "今夜首轮下发" },
    { id: "BL-W-2", groupId: "G-W", version: 2, prices: { ...v2West }, issuedBy: "总部调价中心", issuedAt: "2026-10-02T21:10:00", note: "今夜首轮下发" },
  ];

  const l1000Signs: Array<[string, string]> = [
    ["BJ-01", "2026-10-01T21:32:00"],
    ["BJ-02", "2026-10-01T21:33:00"],
    ["BJ-03", "2026-10-01T21:35:00"],
    ["HS-01", "2026-10-01T21:40:00"],
    ["HS-02", "2026-10-01T21:41:00"],
  ];
  const l2001Signs: Array<[string, string]> = [
    ["DK-01", "2026-10-02T21:58:00"],
    ["DK-02", "2026-10-02T21:59:00"],
    ["LY-01", "2026-10-02T22:03:00"],
    ["LY-02", "2026-10-02T22:05:00"],
  ];

  const leases: Lease[] = [
    {
      leaseNo: "L-1000",
      session: "10-01 夜间",
      groupId: "G-E",
      baselineId: "BL-E-2",
      baselineVersion: 2,
      prices: { ...v2East },
      createdAt: "2026-10-01T21:05:00",
      nozzles: l1000Signs.map(([nozzleId, signedAt]) => ({ nozzleId, state: "已签名" as const, attempts: 1, signedAt })),
    },
    {
      leaseNo: "L-1001",
      session: "10-02 夜间",
      groupId: "G-E",
      baselineId: "BL-E-3",
      baselineVersion: 3,
      prices: { ...v3East },
      createdAt: "2026-10-02T21:15:00",
      nozzles: [
        { nozzleId: "BJ-01", state: "已签名", attempts: 1, signedAt: "2026-10-02T21:41:00" },
        { nozzleId: "BJ-02", state: "已签名", attempts: 1, signedAt: "2026-10-02T21:44:00" },
        { nozzleId: "BJ-03", state: "签名失败", attempts: 1, failReason: "站端签章服务超时" },
        { nozzleId: "HS-01", state: "待签名", attempts: 0 },
        { nozzleId: "HS-02", state: "待签名", attempts: 0 },
      ],
    },
    {
      leaseNo: "L-2001",
      session: "10-02 夜间",
      groupId: "G-W",
      baselineId: "BL-W-2",
      baselineVersion: 2,
      prices: { ...v2West },
      createdAt: "2026-10-02T21:12:00",
      nozzles: l2001Signs.map(([nozzleId, signedAt]) => ({ nozzleId, state: "已签名" as const, attempts: 1, signedAt })),
    },
  ];

  const receipts: Receipt[] = ["BJ-01", "BJ-02", "HS-01", "HS-02"].map((nozzleId, i) => ({
    id: `R-1000-${i + 1}`,
    leaseNo: "L-1000",
    nozzleId,
    groupId: "G-E",
    prices: { ...v2East },
    source: "在线" as const,
    submittedBy: "城东站组账号",
    stampedAt: `2026-10-01T22:2${i}:00`,
    receivedAt: `2026-10-01T22:2${i}:30`,
    status: "已合并" as const,
  }));

  const audit: AuditEvent[] = [];
  const push = (at: string, actor: string, kind: string, detail: string, extra?: Partial<AuditEvent>) => {
    audit.push({ id: `A-${String(audit.length + 1).padStart(3, "0")}`, at, actor, kind, detail, ...extra });
  };

  push("2026-10-01T21:02:00", "总部调价中心", "基准发布", `城东组基准 v2 发布：${pricesText(v2East)}`, { groupId: "G-E" });
  push("2026-10-01T21:05:00", "总部调价中心", "租约创建", "L-1000 · 10-01 夜间 · 基准 v2 · 5 枪待签", { groupId: "G-E", leaseNo: "L-1000" });
  for (const [nozzleId, at] of l1000Signs) {
    push(at, "城东站组账号", "签名", `${nozzleId} 签名完成 · 完整租约快照 v2`, { groupId: "G-E", leaseNo: "L-1000", nozzleId });
  }
  for (const r of receipts) {
    push(r.receivedAt, "城东站组账号", "回执合并", `L-1000 · ${r.nozzleId} 回执合并（在线）`, { groupId: "G-E", leaseNo: "L-1000", nozzleId: r.nozzleId });
  }
  push("2026-10-02T21:10:00", "总部调价中心", "基准发布", `城西组基准 v2 发布：${pricesText(v2West)}`, { groupId: "G-W" });
  push("2026-10-02T21:12:00", "总部调价中心", "租约创建", "L-2001 · 10-02 夜间 · 基准 v2 · 4 枪待签", { groupId: "G-W", leaseNo: "L-2001" });
  for (const [nozzleId, at] of l2001Signs) {
    push(at, "城西站组账号", "签名", `${nozzleId} 签名完成 · 完整租约快照 v2`, { groupId: "G-W", leaseNo: "L-2001", nozzleId });
  }
  push("2026-10-02T21:14:00", "总部调价中心", "基准发布", `城东组基准 v3 发布：${pricesText(v3East)}`, { groupId: "G-E" });
  push("2026-10-02T21:15:00", "总部调价中心", "租约创建", "L-1001 · 10-02 夜间 · 基准 v3 · 5 枪待签", { groupId: "G-E", leaseNo: "L-1001" });
  push("2026-10-02T21:41:00", "城东站组账号", "签名", "BJ-01 签名完成 · 完整租约快照 v3", { groupId: "G-E", leaseNo: "L-1001", nozzleId: "BJ-01" });
  push("2026-10-02T21:44:00", "城东站组账号", "签名", "BJ-02 签名完成 · 完整租约快照 v3", { groupId: "G-E", leaseNo: "L-1001", nozzleId: "BJ-02" });
  push("2026-10-02T21:52:00", "城东站组账号", "签名失败", "BJ-03 第 1 次签名失败：站端签章服务超时", { groupId: "G-E", leaseNo: "L-1001", nozzleId: "BJ-03" });
  audit.reverse();

  return { baselines, leases, receipts, conflicts: [], audit, accountId: "hq" };
}

function load(): SeedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SeedState;
  } catch {
    /* 数据损坏则回退到种子数据 */
  }
  return buildSeed();
}

/* ---------- 台账 store ---------- */

export interface ReceiptInput {
  leaseNo: string;
  nozzleId: string;
  prices: PriceMap;
  source: "在线" | "断网回连";
  batchId?: string;
}

export const useLedger = defineStore("ledger", () => {
  const initial = load();
  const baselines = ref<Baseline[]>(initial.baselines);
  const leases = ref<Lease[]>(initial.leases);
  const receipts = ref<Receipt[]>(initial.receipts);
  const conflicts = ref<Conflict[]>(initial.conflicts);
  const audit = ref<AuditEvent[]>(initial.audit);
  const accountId = ref(initial.accountId);

  const ok = (message: string): Result => ({ ok: true, message });
  const fail = (message: string): Result => ({ ok: false, message });

  const currentAccount = computed<Account>(() => ACCOUNTS.find((a) => a.id === accountId.value) ?? ACCOUNTS[0]);
  const scopedGroupId = computed(() => (currentAccount.value.role === "station" ? currentAccount.value.groupId : undefined));

  /* 越权账号只能看到并提交本组材料 */
  const visibleLeases = computed(() => (scopedGroupId.value ? leases.value.filter((l) => l.groupId === scopedGroupId.value) : leases.value));
  const visibleReceipts = computed(() => (scopedGroupId.value ? receipts.value.filter((r) => r.groupId === scopedGroupId.value) : receipts.value));
  const visibleConflicts = computed(() => (scopedGroupId.value ? conflicts.value.filter((c) => c.groupId === scopedGroupId.value) : conflicts.value));
  const visibleAudit = computed(() => (scopedGroupId.value ? audit.value.filter((e) => !e.groupId || e.groupId === scopedGroupId.value) : audit.value));
  const openConflicts = computed(() => visibleConflicts.value.filter((c) => c.status === "待复核"));

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        baselines: baselines.value,
        leases: leases.value,
        receipts: receipts.value,
        conflicts: conflicts.value,
        audit: audit.value,
        accountId: accountId.value,
      })
    );
  }

  function log(kind: string, detail: string, extra?: Partial<AuditEvent>) {
    audit.value.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: currentAccount.value.name,
      kind,
      detail,
      ...extra,
    });
  }

  function currentBaselineOf(groupId: string): Baseline | undefined {
    return baselines.value.filter((b) => b.groupId === groupId).sort((a, b) => b.version - a.version)[0];
  }

  function baselineVersionOf(baselineId?: string): number | undefined {
    return baselines.value.find((b) => b.id === baselineId)?.version;
  }

  function receiptOf(id: string): Receipt | undefined {
    return receipts.value.find((r) => r.id === id);
  }

  /** 该枪在该租约下已生效的回执（已合并或复核采纳） */
  function effectiveReceipt(leaseNo: string, nozzleId: string): Receipt | undefined {
    return receipts.value.find(
      (r) => r.leaseNo === leaseNo && r.nozzleId === nozzleId && (r.status === "已合并" || r.status === "复核采纳")
    );
  }

  function leaseStatus(lease: Lease): string {
    const entries = lease.nozzles;
    if (entries.every((e) => e.state === "已失效")) return "已作废";
    if (entries.every((e) => effectiveReceipt(lease.leaseNo, e.nozzleId))) return "已完成";
    if (entries.every((e) => e.state === "已签名")) return "已签署";
    if (entries.every((e) => e.state === "待签名")) return lease.reopenedBy ? "待执行·晚改回退" : "待执行";
    return "执行中";
  }

  function isInFlight(lease: Lease): boolean {
    return ["待执行", "待执行·晚改回退", "执行中"].includes(leaseStatus(lease));
  }

  function receiptProgress(lease: Lease): string {
    const done = lease.nozzles.filter((e) => effectiveReceipt(lease.leaseNo, e.nozzleId)).length;
    return `${done}/${lease.nozzles.length}`;
  }

  function createLease(groupId: string, baseline: Baseline, nozzleIds: string[], session: string): Lease {
    const seq = Math.max(1000, ...leases.value.map((l) => parseInt(l.leaseNo.replace(/\D/g, ""), 10) || 1000)) + 1;
    const lease: Lease = {
      leaseNo: `L-${seq}`,
      session,
      groupId,
      baselineId: baseline.id,
      baselineVersion: baseline.version,
      prices: { ...baseline.prices },
      nozzles: nozzleIds.map((nozzleId) => ({ nozzleId, state: "待签名" as const, attempts: 0 })),
      createdAt: new Date().toISOString(),
    };
    leases.value.push(lease);
    log("租约创建", `${lease.leaseNo} · ${session} · 基准 v${baseline.version} · ${nozzleIds.length} 枪待签`, {
      groupId,
      leaseNo: lease.leaseNo,
    });
    return lease;
  }

  /* 牵制一：基准更新后，在途租约里未签名的油枪立即失效，已签名的沿用原基准 */
  function publishBaseline(groupId: string, prices: PriceMap, note: string): Result {
    const account = currentAccount.value;
    if (account.role !== "hq") return fail("仅总部调价中心可发布基准");
    if (FUELS.some((f) => !(Number(prices[f]) > 0))) return fail("三种油品挂牌价必须大于 0");

    const version = (currentBaselineOf(groupId)?.version ?? 0) + 1;
    const baseline: Baseline = {
      id: `BL-${groupId === "G-E" ? "E" : "W"}-${version}`,
      groupId,
      version,
      prices: { ...prices },
      issuedBy: account.name,
      issuedAt: new Date().toISOString(),
      note: note || "夜间换价",
    };
    baselines.value.push(baseline);
    log("基准发布", `${groupName(groupId)}基准 v${version} 发布：${pricesText(prices)}`, { groupId });

    const invalidated: string[] = [];
    let session = "";
    for (const lease of leases.value) {
      if (lease.groupId !== groupId || !isInFlight(lease)) continue;
      session = session || lease.session;
      for (const entry of lease.nozzles) {
        if (entry.state === "已签名") {
          const logged = audit.value.some(
            (e) => e.kind === "基准沿用" && e.leaseNo === lease.leaseNo && e.nozzleId === entry.nozzleId
          );
          if (!logged) {
            log("基准沿用", `${entry.nozzleId} 已签名，沿用 v${lease.baselineVersion}，不受 v${version} 影响`, {
              groupId,
              leaseNo: lease.leaseNo,
              nozzleId: entry.nozzleId,
            });
          }
        } else if (entry.state !== "已失效") {
          entry.state = "已失效";
          entry.invalidatedBy = baseline.id;
          invalidated.push(entry.nozzleId);
          log("基准失效", `${entry.nozzleId} 未签名，v${lease.baselineVersion} 失效，须按 v${version} 重签`, {
            groupId,
            leaseNo: lease.leaseNo,
            nozzleId: entry.nozzleId,
          });
        }
      }
    }

    if (invalidated.length > 0) {
      createLease(groupId, baseline, invalidated, session || tonightSession());
    } else if (!leases.value.some((l) => l.groupId === groupId && isInFlight(l))) {
      const all = NOZZLES.filter((n) => n.groupId === groupId).map((n) => n.id);
      createLease(groupId, baseline, all, tonightSession());
    }

    persist();
    return ok(
      invalidated.length > 0
        ? `基准 v${version} 已发布：${invalidated.length} 把未签油枪失效，已生成新租约重签`
        : `基准 v${version} 已发布`
    );
  }

  function findLease(leaseNo: string): Lease | undefined {
    return leases.value.find((l) => l.leaseNo === leaseNo);
  }

  /** 站端材料提交的统一闸口：非站端、跨组一律拦截留痕 */
  function guardStation(lease: Lease): Result | null {
    const account = currentAccount.value;
    if (account.role !== "station") return fail("仅站端账号可提交材料");
    if (account.groupId !== lease.groupId) {
      log("越权拦截", `${account.name} 试图操作${groupName(lease.groupId)}租约 ${lease.leaseNo}，仅可交本组材料`, {
        groupId: lease.groupId,
        leaseNo: lease.leaseNo,
      });
      persist();
      return fail("越权拦截：仅可提交本组材料");
    }
    return null;
  }

  function signNozzle(leaseNo: string, nozzleId: string, simulateFail: boolean): Result {
    const lease = findLease(leaseNo);
    if (!lease) return fail("租约不存在");
    const denied = guardStation(lease);
    if (denied) return denied;
    const entry = lease.nozzles.find((n) => n.nozzleId === nozzleId);
    if (!entry) return fail("该枪不在租约内");
    if (entry.state === "已失效") return fail("该枪在此租约已失效，请按新租约签署");
    if (entry.state === "已签名") return fail("该枪已签名，无需重复签署");

    entry.attempts += 1;
    if (simulateFail) {
      entry.state = "签名失败";
      entry.failReason = "站端签章服务超时";
      log("签名失败", `${nozzleId} 第 ${entry.attempts} 次签名失败：站端签章服务超时`, {
        groupId: lease.groupId,
        leaseNo,
        nozzleId,
      });
      persist();
      return fail("签名失败：站端签章服务超时，可从完整租约重试");
    }
    entry.state = "已签名";
    entry.signedAt = new Date().toISOString();
    entry.failReason = undefined;
    log("签名", `${nozzleId} 签名完成 · 完整租约快照 v${lease.baselineVersion}（${pricesText(lease.prices)}）`, {
      groupId: lease.groupId,
      leaseNo,
      nozzleId,
    });
    persist();
    return ok(`${nozzleId} 签名完成`);
  }

  /* 牵制三：签名失败后从完整租约快照重试，不允许残缺补签 */
  function retrySign(leaseNo: string, nozzleId: string): Result {
    const lease = findLease(leaseNo);
    if (!lease) return fail("租约不存在");
    const denied = guardStation(lease);
    if (denied) return denied;
    const entry = lease.nozzles.find((n) => n.nozzleId === nozzleId);
    if (!entry) return fail("该枪不在租约内");
    if (entry.state === "已失效") return fail("该枪在此租约已失效，请按新租约签署");
    if (entry.state !== "签名失败") return fail("仅签名失败的油枪需要重试");

    entry.attempts += 1;
    entry.state = "已签名";
    entry.signedAt = new Date().toISOString();
    entry.failReason = undefined;
    log(
      "签名重试",
      `${nozzleId} 第 ${entry.attempts} 次重试成功 · 取自完整租约快照 v${lease.baselineVersion}（${pricesText(lease.prices)}）`,
      { groupId: lease.groupId, leaseNo, nozzleId }
    );
    persist();
    return ok(`${nozzleId} 已从完整租约重试并签名成功`);
  }

  /* 牵制四：主管晚改把已签场次带回待执行，但已有盖章回执的场次被回执牵制 */
  function lateChange(leaseNo: string): Result {
    const account = currentAccount.value;
    if (account.role !== "region") return fail("仅区域主管可执行晚改");
    const lease = findLease(leaseNo);
    if (!lease) return fail("租约不存在");

    const blocking = receipts.value.filter(
      (r) => r.leaseNo === leaseNo && (r.status === "已合并" || r.status === "冲突待复核" || r.status === "复核采纳")
    );
    if (blocking.length > 0) {
      log("晚改拦截", `${leaseNo} 已有 ${blocking.length} 张盖章回执，晚改被回执牵制，须先经区域复核处理`, {
        groupId: lease.groupId,
        leaseNo,
      });
      persist();
      return fail(`晚改被回执牵制：该场次已有 ${blocking.length} 张盖章回执，须先经区域复核处理`);
    }

    const signed = lease.nozzles.filter((n) => n.state === "已签名" || n.state === "签名失败");
    if (signed.length === 0) return fail("该租约没有已签枪位，无需晚改");
    for (const entry of signed) {
      entry.state = "待签名";
      entry.signedAt = undefined;
      entry.failReason = undefined;
    }
    lease.reopenedBy = account.name;
    lease.reopenedAt = new Date().toISOString();
    log("晚改回退", `${leaseNo} 已签 ${signed.length} 枪被主管晚改带回待执行`, { groupId: lease.groupId, leaseNo });
    persist();
    return ok(`晚改完成：${signed.length} 把已签油枪带回待执行`);
  }

  /* 牵制二：回执按租约编号+枪号合并；同内容拦截重复盖章，同枪冲突留两边交区域复核 */
  function submitReceipt(input: ReceiptInput): Result {
    const lease = findLease(input.leaseNo);
    if (!lease) return fail("租约不存在");
    const denied = guardStation(lease);
    if (denied) return denied;
    const entry = lease.nozzles.find((n) => n.nozzleId === input.nozzleId);
    if (!entry) return fail("该枪不在租约内");
    if (entry.state === "已失效") {
      log("回执拦截", `${input.leaseNo} · ${input.nozzleId} 在此租约已失效，回执被租约牵制`, {
        groupId: lease.groupId,
        leaseNo: input.leaseNo,
        nozzleId: input.nozzleId,
      });
      persist();
      return fail("该枪在此租约已失效，请按新租约回执");
    }
    if (entry.state !== "已签名") {
      log("回执拦截", `${input.leaseNo} · ${input.nozzleId} 尚未完成签名，回执被租约牵制`, {
        groupId: lease.groupId,
        leaseNo: input.leaseNo,
        nozzleId: input.nozzleId,
      });
      persist();
      return fail("该枪尚未完成签名，回执被租约牵制");
    }

    const receipt: Receipt = {
      id: `R-${String(Date.now()).slice(-8)}-${Math.random().toString(36).slice(2, 6)}`,
      leaseNo: lease.leaseNo,
      nozzleId: input.nozzleId,
      groupId: lease.groupId,
      prices: { ...input.prices },
      source: input.source,
      submittedBy: currentAccount.value.name,
      stampedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      status: "已合并",
      batchId: input.batchId,
    };

    const openConflict = conflicts.value.find(
      (c) => c.leaseNo === lease.leaseNo && c.nozzleId === input.nozzleId && c.status === "待复核"
    );
    if (openConflict) {
      const sides = openConflict.receiptIds.map((id) => receiptOf(id)).filter((r): r is Receipt => Boolean(r));
      if (sides.some((s) => pricesEqual(s.prices, receipt.prices))) {
        receipt.status = "重复拦截";
        receipts.value.push(receipt);
        log("回执重复拦截", `${lease.leaseNo} · ${input.nozzleId} 与待复核冲突内容一致，重复盖章拦截`, {
          groupId: lease.groupId,
          leaseNo: lease.leaseNo,
          nozzleId: input.nozzleId,
        });
      } else {
        receipt.status = "冲突待复核";
        receipts.value.push(receipt);
        openConflict.receiptIds.push(receipt.id);
        log("回执冲突", `${lease.leaseNo} · ${input.nozzleId} 出现新的一方，并入冲突留档待复核`, {
          groupId: lease.groupId,
          leaseNo: lease.leaseNo,
          nozzleId: input.nozzleId,
        });
      }
      persist();
      return ok(receipt.status === "重复拦截" ? "与待复核冲突内容一致，重复盖章已拦截" : "内容冲突，已并入区域复核");
    }

    const merged = receipts.value.find(
      (r) =>
        r.leaseNo === lease.leaseNo &&
        r.nozzleId === input.nozzleId &&
        (r.status === "已合并" || r.status === "复核采纳")
    );
    if (merged) {
      if (pricesEqual(merged.prices, receipt.prices)) {
        receipt.status = "重复拦截";
        receipts.value.push(receipt);
        log("回执重复拦截", `${lease.leaseNo} · ${input.nozzleId} 断网重复盖章拦截，保留原回执 ${merged.id}`, {
          groupId: lease.groupId,
          leaseNo: lease.leaseNo,
          nozzleId: input.nozzleId,
        });
        persist();
        return ok("内容一致，重复盖章已拦截");
      }
      merged.status = "冲突待复核";
      receipt.status = "冲突待复核";
      receipts.value.push(receipt);
      conflicts.value.push({
        id: `C-${String(Date.now()).slice(-8)}`,
        leaseNo: lease.leaseNo,
        nozzleId: input.nozzleId,
        groupId: lease.groupId,
        receiptIds: [merged.id, receipt.id],
        status: "待复核",
      });
      log("回执冲突", `${lease.leaseNo} · ${input.nozzleId} 同枪冲突，两边留档交区域复核`, {
        groupId: lease.groupId,
        leaseNo: lease.leaseNo,
        nozzleId: input.nozzleId,
      });
      persist();
      return ok("同枪价格冲突，两边已留档交区域复核");
    }

    receipts.value.push(receipt);
    log("回执合并", `${lease.leaseNo} · ${input.nozzleId} 回执合并（${receipt.source}）`, {
      groupId: lease.groupId,
      leaseNo: lease.leaseNo,
      nozzleId: input.nozzleId,
    });
    persist();
    return ok("回执已合并");
  }

  /* 断网回连演示批次：重复盖章 + 同枪冲突 + 正常合并 各一 */
  function submitOfflineBatch(): Result {
    const account = currentAccount.value;
    if (account.role !== "station") return fail("仅站端账号可提交回执，请切换站组账号");
    if (account.groupId !== "G-E") {
      log("越权拦截", `${account.name} 试图回传城东组断网批次（L-1000），仅可交本组材料`, {
        groupId: "G-E",
        leaseNo: "L-1000",
      });
      persist();
      return fail("越权拦截：该断网批次属城东组，仅本组账号可提交");
    }
    const batchId = `BATCH-${String(Date.now()).slice(-6)}`;
    const before = receipts.value.length;
    const items: Array<Omit<ReceiptInput, "source" | "batchId">> = [
      { leaseNo: "L-1000", nozzleId: "BJ-01", prices: { "92号汽油": 7.6, "95号汽油": 8.08, "0号柴油": 7.15 } },
      { leaseNo: "L-1000", nozzleId: "BJ-02", prices: { "92号汽油": 7.66, "95号汽油": 8.08, "0号柴油": 7.15 } },
      { leaseNo: "L-1000", nozzleId: "BJ-03", prices: { "92号汽油": 7.6, "95号汽油": 8.08, "0号柴油": 7.15 } },
    ];
    for (const item of items) {
      submitReceipt({ ...item, source: "断网回连", batchId });
    }
    const added = receipts.value.slice(before);
    const merged = added.filter((r) => r.status === "已合并").length;
    const dup = added.filter((r) => r.status === "重复拦截").length;
    const conflict = added.filter((r) => r.status === "冲突待复核").length;
    return ok(`断网批次 ${batchId} 回连完成：合并 ${merged} · 重复拦截 ${dup} · 冲突待复核 ${conflict}`);
  }

  function resolveConflict(conflictId: string, adoptReceiptId: string): Result {
    const account = currentAccount.value;
    if (account.role !== "region") return fail("仅区域主管可裁定冲突");
    const conflict = conflicts.value.find((c) => c.id === conflictId);
    if (!conflict || conflict.status !== "待复核") return fail("冲突不存在或已复核");
    if (!conflict.receiptIds.includes(adoptReceiptId)) return fail("裁定目标不在冲突双方内");
    for (const id of conflict.receiptIds) {
      const r = receiptOf(id);
      if (r) r.status = id === adoptReceiptId ? "复核采纳" : "复核驳回";
    }
    conflict.status = "已复核";
    conflict.resolvedBy = account.name;
    conflict.resolvedAt = new Date().toISOString();
    conflict.resolution = `采纳 ${adoptReceiptId}`;
    log("复核裁定", `${conflict.leaseNo} · ${conflict.nozzleId} 冲突裁定：采纳 ${adoptReceiptId}，其余驳回`, {
      groupId: conflict.groupId,
      leaseNo: conflict.leaseNo,
      nozzleId: conflict.nozzleId,
    });
    persist();
    return ok("复核裁定已生效");
  }

  /* 审计页：每把枪沿用或失效的基准 */
  const auditGrid = computed(() => {
    const rows: Array<{
      nozzleId: string;
      station: string;
      groupId: string;
      leaseNo: string;
      session: string;
      baselineVersion: number;
      signState: string;
      disposition: string;
      receiptStatus: string;
    }> = [];
    for (const lease of visibleLeases.value) {
      for (const entry of lease.nozzles) {
        let disposition = "—";
        if (entry.state === "已签名") disposition = `沿用 v${lease.baselineVersion}`;
        else if (entry.state === "已失效") {
          const v = baselineVersionOf(entry.invalidatedBy);
          disposition = v ? `失效 → 按 v${v} 重签` : "失效";
        }
        rows.push({
          nozzleId: entry.nozzleId,
          station: nozzleOf(entry.nozzleId)?.station ?? "—",
          groupId: lease.groupId,
          leaseNo: lease.leaseNo,
          session: lease.session,
          baselineVersion: lease.baselineVersion,
          signState: entry.state,
          disposition,
          receiptStatus: effectiveReceipt(lease.leaseNo, entry.nozzleId)?.status ?? "未回执",
        });
      }
    }
    return rows.sort(
      (a, b) =>
        a.groupId.localeCompare(b.groupId) || a.nozzleId.localeCompare(b.nozzleId) || a.leaseNo.localeCompare(b.leaseNo)
    );
  });

  const metrics = computed(() => ({
    inFlight: visibleLeases.value.filter(isInFlight).length,
    pendingSign: visibleLeases.value
      .flatMap((l) => l.nozzles)
      .filter((n) => n.state === "待签名" || n.state === "签名失败").length,
    openConflicts: openConflicts.value.length,
    dup: visibleReceipts.value.filter((r) => r.status === "重复拦截").length,
  }));

  function reset() {
    const seed = buildSeed();
    baselines.value = seed.baselines;
    leases.value = seed.leases;
    receipts.value = seed.receipts;
    conflicts.value = seed.conflicts;
    audit.value = seed.audit;
    accountId.value = seed.accountId;
    persist();
  }

  return {
    baselines,
    leases,
    receipts,
    conflicts,
    audit,
    accountId,
    currentAccount,
    scopedGroupId,
    visibleLeases,
    visibleReceipts,
    visibleConflicts,
    visibleAudit,
    openConflicts,
    metrics,
    auditGrid,
    persist,
    reset,
    currentBaselineOf,
    baselineVersionOf,
    receiptOf,
    effectiveReceipt,
    leaseStatus,
    isInFlight,
    receiptProgress,
    publishBaseline,
    signNozzle,
    retrySign,
    lateChange,
    submitReceipt,
    submitOfflineBatch,
    resolveConflict,
  };
});
