<script setup lang="ts">
import { computed, ref } from "vue";
import { useLedgerStore } from "./ledger/store";
import { DIRECTORY } from "./ledger/directory";
import BaselinePanel from "./components/BaselinePanel.vue";
import LeasePanel from "./components/LeasePanel.vue";
import ReceiptPanel from "./components/ReceiptPanel.vue";
import ConflictPanel from "./components/ConflictPanel.vue";
import AuditPanel from "./components/AuditPanel.vue";
import EventLogPanel from "./components/EventLogPanel.vue";
import ToastHost from "./components/ToastHost.vue";

const store = useLedgerStore();

const tabs = [
  { id: "baseline", label: "① 站组基准" },
  { id: "lease", label: "② 租约签署" },
  { id: "receipt", label: "③ 价签回执" },
  { id: "conflict", label: "④ 区域复核" },
  { id: "audit", label: "⑤ 枪效审计" },
  { id: "events", label: "台账流水" }
] as const;
type TabId = (typeof tabs)[number]["id"];
const activeTab = ref<TabId>("baseline");

const roleText: Record<string, string> = {
  hq: "总部",
  regional: "区域主管",
  station: "站端"
};

const scopeText = computed(() => {
  const a = store.currentAccount;
  if (a.groupIds === null) return "全站组";
  return a.groupIds.map((id) => DIRECTORY.groups.find((g) => g.id === id)?.name ?? id).join("、");
});

const metrics = computed(() => {
  const s = store.state;
  const pendingGuns = s.leases.reduce(
    (n, l) => n + l.guns.filter((g) => g.status === "pending").length,
    0
  );
  const invalidGuns = s.leases.reduce(
    (n, l) => n + l.guns.filter((g) => g.status === "invalidated").length,
    0
  );
  return [
    { label: "生效基准版本", value: s.baselines.filter((b) => b.status === "active").length },
    { label: "签署租约场次", value: s.leases.length },
    { label: "待签名油枪", value: pendingGuns },
    { label: "基准更新失效枪", value: invalidGuns },
    { label: "待区域复核冲突", value: s.conflicts.filter((c) => c.status === "open").length }
  ];
});

function reset() {
  if (confirm("恢复演示台账？本地追加的事件将被清空。")) store.resetSeed();
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">区域夜间换价 · 下发台账（事件溯源 / append-only）</p>
          <h1>站组基准 · 油枪租约 · 价签回执 三联互控台账</h1>
          <p class="subtitle">
            基准更新即冻结未签名油枪；断网回执按租约编号+枪号合并、冲突两边留存交复核；
            签名失败只留痕、从完整租约重试；主管带不回已签场次；越权账号只能交本组材料。
          </p>
        </div>
        <div class="identity card">
          <label class="identity-row">
            <span>当前操作账号</span>
            <select :value="store.currentAccountId" @change="store.switchAccount(($event.target as HTMLSelectElement).value)">
              <option v-for="a in store.accounts" :key="a.id" :value="a.id">
                {{ a.name }}（{{ roleText[a.role] }}）
              </option>
            </select>
          </label>
          <p class="scope">权限范围：<strong>{{ scopeText }}</strong></p>
          <button class="secondary small" type="button" @click="reset">恢复演示数据</button>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric" :class="{ alert: m.label.includes('冲突') && m.value > 0 }">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          :class="{ active: activeTab === t.id }"
          @click="activeTab = t.id"
        >
          {{ t.label }}
        </button>
      </nav>

      <section class="tab-body">
        <BaselinePanel v-if="activeTab === 'baseline'" />
        <LeasePanel v-else-if="activeTab === 'lease'" />
        <ReceiptPanel v-else-if="activeTab === 'receipt'" />
        <ConflictPanel v-else-if="activeTab === 'conflict'" />
        <AuditPanel v-else-if="activeTab === 'audit'" />
        <EventLogPanel v-else />
      </section>
    </div>
    <ToastHost />
  </main>
</template>

<style scoped>
.identity {
  min-width: 280px;
  display: grid;
  gap: 10px;
}
.identity-row {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #536078;
}
.scope {
  margin: 0;
  font-size: 13px;
  color: #536078;
}
.small {
  padding: 7px 10px;
  font-size: 13px;
  justify-self: start;
}
.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.tabs button {
  background: #fff;
  color: #33405c;
  border: 1px solid #d5deeb;
  border-radius: 999px;
  padding: 8px 16px;
}
.tabs button.active {
  background: #176b87;
  color: #fff;
  border-color: #176b87;
}
.tab-body {
  display: grid;
  gap: 16px;
}
.metric.alert strong {
  color: #c84b31;
}
</style>
