<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useLedgerStore } from "../ledger/store";
import { groupName, gunLabel } from "../ledger/directory";

const store = useLedgerStore();

const myLeases = computed(() =>
  store.state.leases
    .slice()
    .reverse()
    .filter((l) => {
      const a = store.currentAccount;
      return a.groupIds === null || a.groupIds.includes(l.groupId);
    })
);

const form = reactive({
  leaseId: "",
  gunId: "",
  channel: "offline" as "online" | "offline",
  price: 0,
  idemKey: ""
});

watch(
  myLeases,
  (leases) => {
    if (!leases.some((l) => l.id === form.leaseId)) selectLease(leases[0]?.id ?? "");
  },
  { immediate: true }
);

const currentLease = computed(() => store.state.leases.find((l) => l.id === form.leaseId));
const eligibleGuns = computed(() => currentLease.value?.guns ?? []);

function selectLease(leaseId: string) {
  form.leaseId = leaseId;
  const lease = store.state.leases.find((l) => l.id === leaseId);
  const gun = lease?.guns[0];
  form.gunId = gun?.gunId ?? "";
  form.price = gun?.price ?? 0;
  form.idemKey = crypto.randomUUID().slice(0, 8);
}

watch(
  () => form.gunId,
  (gunId) => {
    const gun = currentLease.value?.guns.find((g) => g.gunId === gunId);
    if (gun) form.price = gun.price;
  }
);

function submit(sameKey: boolean) {
  if (!form.leaseId || !form.gunId) return;
  if (!sameKey) form.idemKey = crypto.randomUUID().slice(0, 8);
  // 断网补传场景：站端重发时沿用同一幂等键
  store.receiptCmd(form.leaseId, form.gunId, form.channel, Number(form.price), form.idemKey);
}

const receipts = computed(() => store.state.receipts.slice().reverse());

const outcomeMeta: Record<string, { text: string; cls: string }> = {
  accepted: { text: "已盖章", cls: "green" },
  duplicate: { text: "幂等重复", cls: "gray" },
  conflict: { text: "冲突留存", cls: "red" },
  rejected: { text: "拒绝盖章", cls: "red" }
};
const channelText = { online: "在线", offline: "断网补传" };
const fmt = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });
</script>

<template>
  <div class="grid-2">
    <section class="card">
      <h2>提交站端价签回执</h2>
      <p class="hint">
        规则②：按「租约编号 + 枪号」合并。断网回连重发请<strong>沿用同一回执编号</strong>——
        同编号或同价签幂等不重复盖章；同枪价签不一致则两边都留存、交区域复核。
      </p>
      <label class="field">
        <span>租约场次</span>
        <select :value="form.leaseId" @change="selectLease(($event.target as HTMLSelectElement).value)">
          <option v-for="l in myLeases" :key="l.id" :value="l.id">
            {{ groupName(l.groupId) }} · 第 {{ l.seq }} 号租约
          </option>
        </select>
      </label>
      <label class="field">
        <span>油枪</span>
        <select v-model="form.gunId">
          <option v-for="g in eligibleGuns" :key="g.gunId" :value="g.gunId">
            {{ gunLabel(currentLease!.groupId, g.gunId) }}（{{ g.status === "signed" ? "已签名" : g.status === "invalidated" ? "已失效" : "待签名" }}）
          </option>
        </select>
      </label>
      <div class="two-col">
        <label class="field">
          <span>上报渠道</span>
          <select v-model="form.channel">
            <option value="online">在线</option>
            <option value="offline">断网补传</option>
          </select>
        </label>
        <label class="field">
          <span>回执价签（元/升）</span>
          <input v-model.number="form.price" type="number" step="0.01" min="0.01" />
        </label>
      </div>
      <label class="field">
        <span>回执编号（断网重发保持不变）</span>
        <input v-model="form.idemKey" />
      </label>
      <div class="actions">
        <button class="primary" @click="submit(false)">提交回执</button>
        <button class="secondary" @click="submit(true)">模拟断网重发（同编号）</button>
      </div>
    </section>

    <section class="card">
      <h2>回执合并记录</h2>
      <table class="table compact">
        <thead><tr><th>时间</th><th>租约/枪</th><th>渠道</th><th>价签</th><th>编号</th><th>结果</th><th>上报人</th></tr></thead>
        <tbody>
          <tr v-for="r in receipts" :key="r.id" :class="{ dim: r.outcome === 'duplicate' }">
            <td class="nowrap">{{ fmt(r.receivedAt) }}</td>
            <td>{{ groupName(r.groupId) }} / {{ gunLabel(r.groupId, r.gunId) }}</td>
            <td>{{ channelText[r.channel] }}</td>
            <td>¥{{ r.price.toFixed(2) }}</td>
            <td class="mono">{{ r.idempotencyKey }}</td>
            <td><span class="badge" :class="outcomeMeta[r.outcome].cls">{{ outcomeMeta[r.outcome].text }}</span></td>
            <td>{{ r.submittedBy }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="receipts.length === 0" class="empty">尚无回执</div>
    </section>
  </div>
</template>

<style scoped>
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #7a859b;
}
.dim {
  opacity: 0.72;
}
</style>
