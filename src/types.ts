export type Fuel = "92号汽油" | "95号汽油" | "0号柴油";

export const FUELS: Fuel[] = ["92号汽油", "95号汽油", "0号柴油"];

export const FUEL_SHORT: Record<Fuel, string> = {
  "92号汽油": "92#",
  "95号汽油": "95#",
  "0号柴油": "0#",
};

export type PriceMap = Record<Fuel, number>;

export interface Group {
  id: string;
  name: string;
}

export const GROUPS: Group[] = [
  { id: "G-E", name: "城东组" },
  { id: "G-W", name: "城西组" },
];

export interface Nozzle {
  id: string;
  station: string;
  groupId: string;
}

export const NOZZLES: Nozzle[] = [
  { id: "BJ-01", station: "滨江站", groupId: "G-E" },
  { id: "BJ-02", station: "滨江站", groupId: "G-E" },
  { id: "BJ-03", station: "滨江站", groupId: "G-E" },
  { id: "HS-01", station: "环山站", groupId: "G-E" },
  { id: "HS-02", station: "环山站", groupId: "G-E" },
  { id: "DK-01", station: "渡口站", groupId: "G-W" },
  { id: "DK-02", station: "渡口站", groupId: "G-W" },
  { id: "LY-01", station: "柳营站", groupId: "G-W" },
  { id: "LY-02", station: "柳营站", groupId: "G-W" },
];

export type Role = "hq" | "region" | "station";

export interface Account {
  id: string;
  name: string;
  role: Role;
  groupId?: string;
}

export const ACCOUNTS: Account[] = [
  { id: "hq", name: "总部调价中心", role: "hq" },
  { id: "reg", name: "区域主管·夜班", role: "region" },
  { id: "st-e", name: "城东站组账号", role: "station", groupId: "G-E" },
  { id: "st-w", name: "城西站组账号", role: "station", groupId: "G-W" },
];

/** 站组基准：总部按组下发的版本化价格基准 */
export interface Baseline {
  id: string;
  groupId: string;
  version: number;
  prices: PriceMap;
  issuedBy: string;
  issuedAt: string;
  note: string;
}

export type SignState = "待签名" | "已签名" | "签名失败" | "已失效";

export interface LeaseNozzle {
  nozzleId: string;
  state: SignState;
  attempts: number;
  signedAt?: string;
  failReason?: string;
  /** 把它置为失效的基准 id */
  invalidatedBy?: string;
}

/** 油枪签署的租约：绑定某场次、某基准版本与若干枪位 */
export interface Lease {
  leaseNo: string;
  session: string;
  groupId: string;
  baselineId: string;
  baselineVersion: number;
  /** 完整租约快照：签名重试、回执比对都以它为准 */
  prices: PriceMap;
  nozzles: LeaseNozzle[];
  createdAt: string;
  reopenedBy?: string;
  reopenedAt?: string;
}

export type ReceiptStatus = "已合并" | "重复拦截" | "冲突待复核" | "复核采纳" | "复核驳回";

/** 站端价签回执 */
export interface Receipt {
  id: string;
  leaseNo: string;
  nozzleId: string;
  groupId: string;
  prices: PriceMap;
  source: "在线" | "断网回连";
  submittedBy: string;
  stampedAt: string;
  receivedAt: string;
  status: ReceiptStatus;
  batchId?: string;
}

/** 同枪冲突：两边（或多方）全部留档，交区域复核 */
export interface Conflict {
  id: string;
  leaseNo: string;
  nozzleId: string;
  groupId: string;
  receiptIds: string[];
  status: "待复核" | "已复核";
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  kind: string;
  groupId?: string;
  leaseNo?: string;
  nozzleId?: string;
  detail: string;
}

export interface Result {
  ok: boolean;
  message: string;
}
