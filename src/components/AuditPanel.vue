<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "../ledger/store";
import { DIRECTORY, groupName, gunLabel } from "../ledger/directory";
import { reduce } from "../ledger/engine";

const store = useLedgerStore();

const rows = computed(() => store.audit);

const statusCls: Record<string, string> = {
  signed: "green",
  unsigned: "amber",
  invalidated: "red",
  "no-lease": "gray"
};

// 每个站组的基准版本数
const baselineCount = (groupId: string) =>
  reduce(store.events).baselines.filter((b) => b.groupId === groupId).length;
</script>

<template>
  <section class="card">
    <h2>油枪基准沿用 / 失效审计</h2>
    <p class="hint">
      全量回放台账得到：每把枪当前沿用哪一版基准（签名即钉版）、或因基准更新时未签名而失效；
      同时汇总盖章数与未决冲突。
    </p>
    <div v-for="g in DIRECTORY.groups" :key="g.id" class="group-block">
      <h3>{{ groupName(g.id) }} <span class="muted">（累计 {{ baselineCount(g.id) }} 版基准）</span></h3>
      <table class="table">
        <thead>
          <tr><th>油枪</th><th>场次</th><th>状态</th><th>基准沿用情况</th><th>盖章</th><th>冲突</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows.filter((r) => r.groupId === g.id)" :key="row.gunId">
            <td>{{ gunLabel(row.groupId, row.gunId) }}</td>
            <td>{{ row.leaseSeq ? `第 ${row.leaseSeq} 号租约` : "—" }}</td>
            <td><span class="badge" :class="statusCls[row.status]">{{ row.statusText }}</span></td>
            <td class="baseline" :class="statusCls[row.status]">{{ row.baselineText }}</td>
            <td>{{ row.acceptedStamps }} 次</td>
            <td>
              <span v-if="row.conflictOpen" class="badge red">待复核</span>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.group-block {
  margin-bottom: 18px;
}
.group-block:last-child {
  margin-bottom: 0;
}
h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.muted {
  color: #9aa4b8;
  font-weight: 400;
  font-size: 12px;
}
.baseline {
  font-size: 13px;
}
.baseline.green { color: #14724f; }
.baseline.amber { color: #9a6410; }
.baseline.red { color: #b03a24; }
.baseline.gray { color: #7a859b; }
</style>
