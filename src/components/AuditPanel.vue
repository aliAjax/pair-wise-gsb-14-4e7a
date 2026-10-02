<script setup lang="ts">
import { computed } from "vue";
import { useLedger, groupName, fmtTime, stateClass } from "../store";

const store = useLedger();

const scopeHint = computed(() =>
  store.currentAccount.role === "station" ? "仅显示本组事件与枪位" : "显示全部站组事件与枪位"
);

function kindClass(kind: string): string {
  if (["基准失效", "签名失败", "回执冲突", "越权拦截"].includes(kind)) return "chip-bad";
  if (["晚改回退", "晚改拦截", "回执重复拦截"].includes(kind)) return "chip-warn";
  if (["基准沿用", "签名", "签名重试", "回执合并", "复核裁定"].includes(kind)) return "chip-ok";
  return "chip-pending";
}
</script>

<template>
  <section class="list-panel" style="margin-bottom: 18px">
    <div class="toolbar">
      <h2>每枪基准处置</h2>
      <span class="hint">基准更新后：已签名沿用原基准，未签名失效并按新基准重签</span>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>枪号</th><th>站点</th><th>站组</th><th>租约</th><th>场次</th><th>基准</th><th>签名状态</th><th>基准处置</th><th>回执</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in store.auditGrid" :key="row.leaseNo + row.nozzleId">
          <td>{{ row.nozzleId }}</td>
          <td>{{ row.station }}</td>
          <td>{{ groupName(row.groupId) }}</td>
          <td>{{ row.leaseNo }}</td>
          <td>{{ row.session }}</td>
          <td>v{{ row.baselineVersion }}</td>
          <td><span class="chip" :class="stateClass(row.signState)">{{ row.signState }}</span></td>
          <td>
            <span v-if="row.disposition.startsWith('沿用')" class="chip chip-ok">{{ row.disposition }}</span>
            <span v-else-if="row.disposition.startsWith('失效')" class="chip chip-bad">{{ row.disposition }}</span>
            <span v-else class="muted">—</span>
          </td>
          <td>{{ row.receiptStatus }}</td>
        </tr>
        <tr v-if="store.auditGrid.length === 0">
          <td colspan="9" class="empty">暂无数据</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="list-panel">
    <div class="toolbar">
      <h2>事件流水</h2>
      <span class="hint">{{ scopeHint }}</span>
    </div>
    <table class="table">
      <thead>
        <tr><th>时间</th><th>账号</th><th>事件</th><th>租约</th><th>枪号</th><th>详情</th></tr>
      </thead>
      <tbody>
        <tr v-for="e in store.visibleAudit" :key="e.id">
          <td>{{ fmtTime(e.at) }}</td>
          <td>{{ e.actor }}</td>
          <td><span class="chip" :class="kindClass(e.kind)">{{ e.kind }}</span></td>
          <td>{{ e.leaseNo ?? "—" }}</td>
          <td>{{ e.nozzleId ?? "—" }}</td>
          <td>{{ e.detail }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
