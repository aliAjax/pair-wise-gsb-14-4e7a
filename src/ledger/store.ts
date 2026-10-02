import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { DIRECTORY } from "./directory";
import {
  auditView,
  createLease,
  issueBaseline,
  resolveReceiptConflict,
  signLease,
  submitReceipt,
  supervisorRollback,
  type GunAuditRow,
  type LedgerState
} from "./engine";
import { reduce } from "./engine";
import type {
  Account,
  CommandResult,
  FuelType,
  LedgerEvent,
  NewLedgerEvent
} from "./types";

const STORAGE_KEY = "night-price-ledger-v1";

export function seedEvents(): LedgerEvent[] {
  // 预置一段可演示的历史台账：
  // 华东已有第1版基准 + 一张部分签名的租约；华北仅有基准。
  const hq: Account = DIRECTORY.accounts[0];
  const eastStation: Account = DIRECTORY.accounts[3];
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now - offsetMin * 60000).toISOString();
  const ev: LedgerEvent[] = [];
  const push = (e: NewLedgerEvent, actor: Account, offsetMin: number) => {
    ev.push({ seq: ev.length + 1, at: iso(offsetMin), by: actor.id, byName: actor.name, ...e } as LedgerEvent);
  };

  const baselineEast = "seed-baseline-east";
  const baselineNorth = "seed-baseline-north";
  push({ type: "BaselineIssued", baselineId: baselineEast, groupId: "g-east", prices: [
    { fuel: "92号汽油", price: 7.62 },
    { fuel: "95号汽油", price: 8.11 },
    { fuel: "98号汽油", price: 9.05 },
    { fuel: "0号柴油", price: 7.18 }
  ] }, hq, 240);
  push({ type: "BaselineIssued", baselineId: baselineNorth, groupId: "g-north", prices: [
    { fuel: "92号汽油", price: 7.58 },
    { fuel: "95号汽油", price: 8.05 },
    { fuel: "98号汽油", price: 8.99 },
    { fuel: "0号柴油", price: 7.12 }
  ] }, hq, 230);
  push({ type: "LeaseCreated", leaseId: "seed-lease-east-1", groupId: "g-east", guns: [
    { gunId: "gun-01", fuel: "92号汽油", price: 7.62 },
    { gunId: "gun-02", fuel: "95号汽油", price: 8.11 },
    { gunId: "gun-03", fuel: "98号汽油", price: 9.05 }
  ] }, eastStation, 200);
  // 1、2 号枪已按完整租约签名；3、4 号枪另有一张待签租约，留给夜改/基准更新演示
  push({ type: "LeaseSigned", leaseId: "seed-lease-east-1", groupId: "g-east",
    gunIds: ["gun-01", "gun-02"], baselineId: baselineEast }, eastStation, 190);
  push({ type: "LeaseCreated", leaseId: "seed-lease-east-2", groupId: "g-east", guns: [
    { gunId: "gun-03", fuel: "98号汽油", price: 9.05 },
    { gunId: "gun-04", fuel: "0号柴油", price: 7.18 }
  ] }, eastStation, 180);
  push({ type: "LeaseCreated", leaseId: "seed-lease-north-1", groupId: "g-north", guns: [
    { gunId: "gun-11", fuel: "92号汽油", price: 7.58 },
    { gunId: "gun-12", fuel: "95号汽油", price: 8.05 }
  ] }, DIRECTORY.accounts[4], 170);
  // 11 号枪已盖章（在线），可演示断网回连同价幂等 / 异价冲突
  push({ type: "LeaseSigned", leaseId: "seed-lease-north-1", groupId: "g-north",
    gunIds: ["gun-11", "gun-12"], baselineId: baselineNorth }, DIRECTORY.accounts[4], 160);
  push({ type: "ReceiptAccepted", receiptId: "seed-rcpt-11", leaseId: "seed-lease-north-1",
    groupId: "g-north", gunId: "gun-11", channel: "online", price: 7.58,
    idempotencyKey: "seed-rcpt-11" }, DIRECTORY.accounts[4], 150);
  return ev;
}

function loadEvents(): LedgerEvent[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedEvents();
  try {
    const parsed = JSON.parse(raw) as LedgerEvent[];
    return Array.isArray(parsed) ? parsed : seedEvents();
  } catch {
    return seedEvents();
  }
}

export interface Toast {
  id: number;
  ok: boolean;
  text: string;
}

export const useLedgerStore = defineStore("night-price-ledger", () => {
  const events = ref<LedgerEvent[]>(loadEvents());
  const currentAccountId = ref<string>("u-hq");
  const toasts = ref<Toast[]>([]);
  let toastSeq = 0;

  const state = computed<LedgerState>(() => reduce(events.value));
  const audit = computed<GunAuditRow[]>(() => auditView(events.value));
  const currentAccount = computed<Account>(
    () => DIRECTORY.accounts.find((a) => a.id === currentAccountId.value) ?? DIRECTORY.accounts[0]
  );

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.value));
  }

  function notify(result: CommandResult) {
    toastSeq += 1;
    const toast: Toast = { id: toastSeq, ok: result.ok, text: result.message };
    toasts.value.push(toast);
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== toast.id);
    }, 4200);
  }

  /** 所有命令统一入口：命令产出的事件（含拒绝留痕）一律按落库顺序编号后只追加。 */
  function commit(result: CommandResult) {
    if (result.events.length > 0) {
      let nextSeq = events.value.reduce((max, e) => Math.max(max, e.seq), 0);
      const stamped = result.events.map((e) => ({ ...e, seq: ++nextSeq }));
      events.value = [...events.value, ...stamped];
      persist();
    }
    notify(result);
  }

  const accounts = DIRECTORY.accounts;

  function switchAccount(id: string) {
    currentAccountId.value = id;
  }

  const issueBaselineCmd = (groupId: string, prices: { fuel: FuelType; price: number }[], note?: string) =>
    commit(issueBaseline(events.value, currentAccount.value, { groupId, prices, note }));

  const createLeaseCmd = (groupId: string, guns: { gunId: string; fuel: FuelType; price: number }[], note?: string) =>
    commit(createLease(events.value, currentAccount.value, { groupId, guns, note }));

  const signLeaseCmd = (leaseId: string, submittedGunIds: string[]) =>
    commit(signLease(events.value, currentAccount.value, leaseId, submittedGunIds));

  const rollbackCmd = (leaseId: string) =>
    commit(supervisorRollback(events.value, currentAccount.value, leaseId));

  const receiptCmd = (
    leaseId: string,
    gunId: string,
    channel: "online" | "offline",
    price: number,
    idempotencyKey?: string
  ) => commit(submitReceipt(events.value, currentAccount.value, { leaseId, gunId, channel, price, idempotencyKey }));

  const resolveConflictCmd = (conflictId: string, decision: "online" | "offline") =>
    commit(resolveReceiptConflict(events.value, currentAccount.value, conflictId, decision));

  function resetSeed() {
    events.value = seedEvents();
    persist();
  }

  return {
    events,
    state,
    audit,
    accounts,
    currentAccountId,
    currentAccount,
    toasts,
    switchAccount,
    issueBaselineCmd,
    createLeaseCmd,
    signLeaseCmd,
    rollbackCmd,
    receiptCmd,
    resolveConflictCmd,
    resetSeed
  };
});
