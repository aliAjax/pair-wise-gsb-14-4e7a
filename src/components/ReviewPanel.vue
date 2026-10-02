<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { type Receipt, type Result } from "../types";
import { useLedger, pricesText, fmtTime, receiptClass } from "../store";

const store = useLedger();

const isRegion = computed(() => store.currentAccount.role === "region");
const picks = ref<Record<string, string>>({});

const conflictViews = computed(() =>
  [...store.visibleConflicts]
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "待复核" ? -1 : 1))
    .map((c) => ({
      ...c,
      sides: c.receiptIds.map((id) => store.receiptOf(id)).filter((r): r is Receipt => Boolean(r)),
    }))
);

function act(r: Result) {
  if (r.ok) ElMessage.success(r.message);
  else ElMessage.error(r.message);
}

function resolve(conflictId: string) {
  const pick = picks.value[conflictId];
  if (!pick) {
    ElMessage.warning("请先选择采纳哪一边");
    return;
  }
  act(store.resolveConflict(conflictId, pick));
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>区域复核 · 同枪冲突</h2>
      <span class="hint">同枪冲突两边全部留档，区域主管裁定采纳一边，其余驳回</span>
    </div>
    <el-alert v-if="!isRegion" type="info" :closable="false" title="当前账号仅可查看，裁定权在区域主管" />
    <div v-if="conflictViews.length === 0" class="empty">暂无冲突，回执合并秩序良好</div>
    <div class="record-grid">
      <article v-for="c in conflictViews" :key="c.id" class="record">
        <div class="record-head">
          <p class="record-title">{{ c.leaseNo }} · {{ c.nozzleId }}</p>
          <span class="chip" :class="c.status === '待复核' ? 'chip-bad' : 'chip-ok'">{{ c.status }}</span>
        </div>
        <div class="sides">
          <label v-for="r in c.sides" :key="r.id" class="side" :class="{ picked: picks[c.id] === r.id }">
            <span class="side-head">
              <input
                v-model="picks[c.id]"
                type="radio"
                :name="c.id"
                :value="r.id"
                :disabled="!isRegion || c.status !== '待复核'"
              />
              <strong>{{ r.id }}</strong>
              <span class="chip" :class="receiptClass(r.status)">{{ r.status }}</span>
            </span>
            <span>价签：{{ pricesText(r.prices) }}</span>
            <span>来源：{{ r.source }}<template v-if="r.batchId"> · {{ r.batchId }}</template></span>
            <span>盖章 {{ fmtTime(r.stampedAt) }} ｜ 接收 {{ fmtTime(r.receivedAt) }}</span>
            <span>提交人：{{ r.submittedBy }}</span>
          </label>
        </div>
        <div v-if="c.status === '待复核'" class="actions">
          <button type="button" :disabled="!isRegion" @click="resolve(c.id)">提交裁定（采纳选中边）</button>
        </div>
        <p v-else class="note">裁定：{{ c.resolution }} ｜ {{ c.resolvedBy }} 于 {{ fmtTime(c.resolvedAt) }}</p>
      </article>
    </div>
  </section>
</template>
