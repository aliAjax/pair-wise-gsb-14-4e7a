<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { ACCOUNTS } from "./types";
import { useLedger, groupName } from "./store";
import OverviewPanel from "./components/OverviewPanel.vue";
import BaselinePanel from "./components/BaselinePanel.vue";
import ReceiptPanel from "./components/ReceiptPanel.vue";
import ReviewPanel from "./components/ReviewPanel.vue";
import AuditPanel from "./components/AuditPanel.vue";

const store = useLedger();
const tab = ref("overview");

const tabs = computed(() => [
  { key: "overview", label: "下发台账" },
  { key: "baseline", label: "基准与租约" },
  { key: "receipt", label: "回执归集" },
  {
    key: "review",
    label: store.openConflicts.length > 0 ? `区域复核（${store.openConflicts.length}）` : "区域复核",
  },
  { key: "audit", label: "审计追踪" },
]);

const roleHint = computed(() => {
  const a = store.currentAccount;
  if (a.role === "hq") return "可发布基准、自动生成租约；签名与回执仅站端可交";
  if (a.role === "region") return "可晚改回退已签场次、裁定同枪冲突";
  return `仅可提交本组（${a.groupId ? groupName(a.groupId) : ""}）材料：签名、回执`;
});

function resetAll() {
  store.reset();
  ElMessage.success("已重置为演示数据");
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油 · 区域夜间换价</p>
          <h1>互相牵制下发台账</h1>
          <p class="subtitle">
            总部基准、油枪租约、站端回执三方分账互相牵制：基准更新未签油枪即失效；断网回执按租约编号+枪号合并，同枪冲突留两边交区域复核；签名失败从完整租约重试；站端账号仅可交本组材料。
          </p>
        </div>
        <div class="account-box">
          <label>
            当前账号
            <select v-model="store.accountId" @change="store.persist()">
              <option v-for="a in ACCOUNTS" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <p class="role-hint">{{ roleHint }}</p>
          <button class="secondary" type="button" @click="resetAll">重置演示数据</button>
        </div>
      </header>

      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          class="tab"
          :class="{ active: tab === t.key }"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </nav>

      <OverviewPanel v-if="tab === 'overview'" />
      <BaselinePanel v-else-if="tab === 'baseline'" />
      <ReceiptPanel v-else-if="tab === 'receipt'" />
      <ReviewPanel v-else-if="tab === 'review'" />
      <AuditPanel v-else />
    </div>
  </main>
</template>
