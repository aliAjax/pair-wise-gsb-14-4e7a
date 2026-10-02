// 下发台账：事件溯源领域模型
// 所有业务状态都由不可变台账事件（LedgerEvent）回放得到，不允许直接改状态。

export type FuelType = "92号汽油" | "95号汽油" | "98号汽油" | "0号柴油";
export const FUEL_TYPES: readonly FuelType[] = ["92号汽油", "95号汽油", "98号汽油", "0号柴油"];

export type Role = "hq" | "regional" | "station";

export interface Account {
  id: string;
  name: string;
  role: Role;
  /** 可管辖的站组 id 列表；hq 为全部（null 表示不设限） */
  groupIds: string[] | null;
}

export interface Group {
  id: string;
  name: string;
  /** 该站组下的油枪 */
  guns: { id: string; label: string }[];
}

export interface Directory {
  groups: Group[];
  accounts: Account[];
}

export type BaselineStatus = "active" | "superseded";

export interface BaselinePrice {
  fuel: FuelType;
  price: number;
}

export interface BaselineRecord {
  id: string;
  seq: number;
  groupId: string;
  status: BaselineStatus;
  prices: BaselinePrice[];
  issuedAt: string;
  issuedBy: string;
  /** 被哪一版基准替换 */
  supersededBy?: string;
}

export type LeaseGunStatus = "pending" | "signed" | "invalidated";

export interface LeaseGun {
  gunId: string;
  fuel: FuelType;
  price: number;
  status: LeaseGunStatus;
  signedAt?: string;
  /** 该枪签名时沿用的基准版本（签名即把基准钉在这一版上） */
  pinnedBaselineId?: string;
}

export interface LeaseRecord {
  id: string;
  groupId: string;
  seq: number;
  createdAt: string;
  createdBy: string;
  guns: LeaseGun[];
  /** 已签名后被主管晚改带回待执行的枪 */
  rolledBackAt?: string;
  rolledBackBy?: string;
}

export type ReceiptOutcome =
  | "accepted" // 正常合并盖章
  | "duplicate" // 同租约同枪同价签，幂等不重复盖章
  | "conflict" // 同租约同枪价签不一致，留两边交区域复核
  | "rejected"; // 拒绝（枪未签名/已失效/越权等）

export interface ReceiptRecord {
  id: string;
  leaseId: string;
  groupId: string;
  gunId: string;
  channel: "online" | "offline";
  price: number;
  receivedAt: string;
  submittedBy: string;
  outcome: ReceiptOutcome;
  /** 幂等键：同渠道重复上报按同一键合并 */
  idempotencyKey: string;
  /** 与已存回执冲突时，指向已存在的那一条 */
  conflictsWithReceiptId?: string;
}

export interface ConflictRecord {
  id: string;
  leaseId: string;
  groupId: string;
  gunId: string;
  status: "open" | "resolved";
  onlineReceiptId: string;
  offlineReceiptId: string;
  onlinePrice: number;
  offlinePrice: number;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  decision?: "online" | "offline";
  /** 复核后确认采用的价签价格 */
  decidedPrice?: number;
}

// ---------------- 台账事件（只追加，不可修改） ----------------

export interface EventBase {
  seq: number;
  at: string;
  by: string; // 操作者 accountId
  byName: string;
  note?: string;
}

export interface BaselineIssuedEvent extends EventBase {
  type: "BaselineIssued";
  baselineId: string;
  groupId: string;
  prices: BaselinePrice[];
}

export interface LeaseCreatedEvent extends EventBase {
  type: "LeaseCreated";
  leaseId: string;
  groupId: string;
  guns: { gunId: string; fuel: FuelType; price: number }[];
}

export interface LeaseSignedEvent extends EventBase {
  type: "LeaseSigned";
  leaseId: string;
  groupId: string;
  gunIds: string[];
  baselineId: string; // 签名时沿用的基准版本
}

export interface SignFailedEvent extends EventBase {
  type: "SignFailed";
  leaseId: string;
  reason: string;
  /** 本次提交携带的枪号；用于审计是否拿了完整租约来重试 */
  submittedGunIds: string[];
  expectedGunIds: string[];
  missingGunIds: string[];
  invalidGunIds: string[];
  attempt: number;
}

/** 主管晚改：已签场次不允许带回待执行，事件中如实记录被拦下的枪 */
export interface RollbackRejectedEvent extends EventBase {
  type: "RollbackRejected";
  leaseId: string;
  groupId: string;
  signedGunIds: string[];
}

export interface RollbackAppliedEvent extends EventBase {
  type: "RollbackApplied";
  leaseId: string;
  groupId: string;
  /** 只有未签名的枪会被带回待执行 */
  pendingGunIds: string[];
}

export interface GunsInvalidatedEvent extends EventBase {
  type: "GunsInvalidated";
  groupId: string;
  baselineId: string;
  supersededBaselineId: string;
  leaseId: string;
  gunIds: string[];
}

export interface ReceiptAcceptedEvent extends EventBase {
  type: "ReceiptAccepted";
  receiptId: string;
  leaseId: string;
  groupId: string;
  gunId: string;
  channel: "online" | "offline";
  price: number;
  idempotencyKey: string;
}

export interface ReceiptDuplicateEvent extends EventBase {
  type: "ReceiptDuplicate";
  receiptId: string;
  leaseId: string;
  groupId: string;
  gunId: string;
  channel: "online" | "offline";
  price: number;
  idempotencyKey: string;
}

export interface ReceiptConflictEvent extends EventBase {
  type: "ReceiptConflict";
  receiptId: string; // 新回执（后到的一边，断网回连一般为 offline）
  existingReceiptId: string;
  conflictId: string;
  leaseId: string;
  groupId: string;
  gunId: string;
  newChannel: "online" | "offline";
  existingChannel: "online" | "offline";
  newPrice: number;
  existingPrice: number;
  idempotencyKey: string;
}

export interface ReceiptRejectedEvent extends EventBase {
  type: "ReceiptRejected";
  leaseId: string;
  groupId: string;
  gunId: string;
  channel: "online" | "offline";
  price: number;
  reason: string;
  idempotencyKey: string;
}

export interface ConflictResolvedEvent extends EventBase {
  type: "ConflictResolved";
  conflictId: string;
  leaseId: string;
  groupId: string;
  gunId: string;
  decision: "online" | "offline";
  onlinePrice: number;
  offlinePrice: number;
  decidedPrice: number;
  acceptedReceiptId: string;
  rejectedReceiptId: string;
}

export interface CrossGroupDeniedEvent extends EventBase {
  type: "CrossGroupDenied";
  actorGroupScope: string[];
  targetGroupId: string;
  action: string;
  payload: string;
}

export type LedgerEvent =
  | BaselineIssuedEvent
  | LeaseCreatedEvent
  | LeaseSignedEvent
  | SignFailedEvent
  | RollbackRejectedEvent
  | RollbackAppliedEvent
  | GunsInvalidatedEvent
  | ReceiptAcceptedEvent
  | ReceiptDuplicateEvent
  | ReceiptConflictEvent
  | ReceiptRejectedEvent
  | ConflictResolvedEvent
  | CrossGroupDeniedEvent;

export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewLedgerEvent = DistributiveOmit<LedgerEvent, "seq" | "at" | "by" | "byName">;

export interface CommandResult {
  ok: boolean;
  message: string;
  /** 本次追加的台账事件（含越权拒绝事件） */
  events: LedgerEvent[];
}
