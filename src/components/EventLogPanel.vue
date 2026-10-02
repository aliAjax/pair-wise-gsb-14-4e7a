<script setup lang="ts">
import { computed, ref } from "vue";
import { useLedgerStore } from "../ledger/store";
import type { LedgerEvent } from "../ledger/types";

const store = useLedgerStore();
const filter = ref("all");

const filters = [
  { id: "all", label: "全部" },
  { id: "Baseline", label: "基准" },
  { id: "Lease", label: "租约/签名" },
  { id: "Receipt", label: "回执" },
  { id: "Denied", label: "越权拦截" },
  { id: "Conflict", label: "冲突复核" }
] as const;

const typeText: Record<LedgerEvent["type"], string> = {
  BaselineIssued: "基准下发",
  LeaseCreated: "租约创建",
  LeaseSigned: "租约签名",
  SignFailed: "签名失败",
  RollbackRejected: "晚改拦截",
  RollbackApplied: "晚改带回",
  GunsInvalidated: "未签枪失效",
  ReceiptAccepted: "回执盖章",
  ReceiptDuplicate: "回执幂等",
  ReceiptConflict: "回执冲突",
  ReceiptRejected: "回执拒绝",
  ConflictResolved: "冲突复核",
  CrossGroupDenied: "越权拒绝"
};

const danger = new Set<LedgerEvent["type"]>([
  "SignFailed",
  "RollbackRejected",
  "ReceiptConflict",
  "ReceiptRejected",
  "CrossGroupDenied"
]);

function match(type: string): boolean {
  if (filter.value === "all") return true;
  if (filter.value === "Denied") return type === "CrossGroupDenied";
  if (filter.value === "Conflict") return type.includes("Conflict");
  return type.startsWith(filter.value);
}

const rows = computed(() =>
  store.events
    .slice()
    .reverse()
    .filter((e) => match(e.type))
);

const fmt = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

function detail(e: LedgerEvent): string {
  switch (e.type) {
    case "BaselineIssued":
      return `${e.groupId}，${e.prices.map((p) => `${p.fuel}¥${p.price.toFixed(2)}`).join(" / ")}`;
    case "LeaseCreated":
      return `${e.groupId}，枪号：${e.guns.map((g) => g.gunId).join("、")}`;
    case "LeaseSigned":
      return `枪号：${e.gunIds.join("、")}，钉住基准 ${e.baselineId.slice(0, 8)}`;
    case "SignFailed":
      return `${e.reason}（第 ${e.attempt} 次，提交 ${e.submittedGunIds.length}/${e.expectedGunIds.length} 枪）`;
    case "RollbackRejected":
      return `已签枪拦截：${e.signedGunIds.join("、")}`;
    case "RollbackApplied":
      return `未签枪带回：${e.pendingGunIds.join("、")}`;
    case "GunsInvalidated":
      return `${e.groupId} 租约 ${e.leaseId.slice(0, 8)} 失效枪：${e.gunIds.join("、")}`;
    case "ReceiptAccepted":
    case "ReceiptDuplicate":
    case "ReceiptRejected":
      return `${e.groupId} ${e.gunId} ${e.channel === "online" ? "在线" : "断网"} ¥${e.price} ${e.type === "ReceiptRejected" ? `｜${e.reason}` : ""}`;
    case "ReceiptConflict":
      return `${e.gunId}：${e.existingChannel}¥${e.existingPrice} vs ${e.newChannel}¥${e.newPrice}，两边留存`;
    case "ConflictResolved":
      return `${e.gunId}：采用${e.decision === "online" ? "在线" : "断网"} ¥${e.decidedPrice}`;
    case "CrossGroupDenied":
      return `${e.byName} 试图${e.action} 非本组 ${e.targetGroupId}，作用域 [${e.actorGroupScope.join(", ")}]`;
  }
}
</script>

<template>
  <section class="card">
    <h2>台账事件流水（只追加 · 不可修改）</h2>
    <p class="hint">所有成功、失败、越权、冲突复核动作均在此留痕，序号只增不减，是全部页面状态的唯一事实源。</p>
    <div class="filters">
      <button
        v-for="f in filters"
        :key="f.id"
        type="button"
        class="chip"
        :class="{ active: filter === f.id }"
        @click="filter = f.id"
      >
        {{ f.label }}
      </button>
    </div>
    <table class="table compact">
      <thead><tr><th>#</th><th>时间</th><th>事件</th><th>明细</th><th>操作人</th></tr></thead>
      <tbody>
        <tr v-for="e in rows" :key="e.seq" :class="{ dangerRow: danger.has(e.type) }">
          <td class="mono">{{ e.seq }}</td>
          <td class="nowrap">{{ fmt(e.at) }}</td>
          <td><span class="badge" :class="danger.has(e.type) ? 'red' : 'blue'">{{ typeText[e.type] }}</span></td>
          <td class="detail">{{ detail(e) }}</td>
          <td>{{ e.byName }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.chip {
  border-radius: 999px;
  border: 1px solid #d5deeb;
  background: #fff;
  color: #33405c;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.chip.active {
  background: #176b87;
  color: #fff;
  border-color: #176b87;
}
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: #7a859b;
}
.detail {
  font-size: 13px;
  color: #445069;
  max-width: 520px;
}
.dangerRow td {
  background: #fdf6f4;
}
.badge.blue {
  background: #e4eefc;
  color: #1d4f8a;
}
</style>
