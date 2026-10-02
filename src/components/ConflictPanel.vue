<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "../ledger/store";
import { groupName, gunLabel } from "../ledger/directory";

const store = useLedgerStore();

const myConflicts = computed(() =>
  store.state.conflicts
    .slice()
    .reverse()
    .filter((c) => {
      const a = store.currentAccount;
      return a.groupIds === null || a.groupIds.includes(c.groupId);
    })
);

const leaseSeq = (leaseId: string) => store.state.leases.find((l) => l.id === leaseId)?.seq ?? "?";
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—");
</script>

<template>
  <section class="card">
    <h2>同枪价签冲突 · 区域复核</h2>
    <p class="hint">
      同租约同枪出现异价回执时，系统<strong>两边都不盖章</strong>，原样留存在线/断网两版价签；
      复核期间该枪新回执一律暂停盖章。区域只能复核本组冲突。
    </p>
    <div v-if="myConflicts.length === 0" class="empty">暂无冲突，回执合并口径正常</div>
    <article v-for="c in myConflicts" :key="c.id" class="conflict" :class="{ closed: c.status === 'resolved' }">
      <header>
        <strong>
          {{ groupName(c.groupId) }} · 第 {{ leaseSeq(c.leaseId) }} 号租约 ·
          {{ gunLabel(c.groupId, c.gunId) }}
        </strong>
        <span class="badge" :class="c.status === 'open' ? 'red' : 'gray'">
          {{ c.status === "open" ? "待复核" : `已复核（采用${c.decision === "online" ? "在线" : "断网"}版）` }}
        </span>
      </header>
      <div class="sides">
        <div class="side">
          <span class="tag">在线回执</span>
          <strong>¥{{ c.onlinePrice.toFixed(2) }}</strong>
        </div>
        <div class="vs">VS</div>
        <div class="side">
          <span class="tag offline">断网补传</span>
          <strong>¥{{ c.offlinePrice.toFixed(2) }}</strong>
        </div>
      </div>
      <div class="meta">
        发现时间：{{ fmt(c.detectedAt) }} ｜ 复核人：{{ c.resolvedBy ?? "—" }} ｜ 复核时间：{{ fmt(c.resolvedAt) }}
      </div>
      <div v-if="c.status === 'open'" class="actions">
        <button class="primary small" @click="store.resolveConflictCmd(c.id, 'online')">采用在线 ¥{{ c.onlinePrice.toFixed(2) }}</button>
        <button class="secondary small" @click="store.resolveConflictCmd(c.id, 'offline')">采用断网补传 ¥{{ c.offlinePrice.toFixed(2) }}</button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.conflict {
  border: 1px solid #e3d3cf;
  border-left: 4px solid #c84b31;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #fffdfc;
}
.conflict.closed {
  border-color: #dfe7f1;
  border-left-color: #94a3b8;
  background: #fbfcfe;
}
.conflict header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.sides {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 14px 0 8px;
}
.side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  padding: 14px;
  border-radius: 10px;
  background: #f2f7fb;
}
.side.offline,
.side:has(.offline) {
  background: #fbf4e8;
}
.side strong {
  font-size: 24px;
  color: #172033;
}
.tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4f8a;
}
.tag.offline {
  background: #fde7c3;
  color: #9a6410;
}
.vs {
  font-weight: 700;
  color: #9aa4b8;
}
.meta {
  font-size: 12px;
  color: #7a859b;
}
</style>
