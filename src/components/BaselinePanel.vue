<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useLedgerStore } from "../ledger/store";
import { DIRECTORY, groupName } from "../ledger/directory";
import { FUEL_TYPES, type FuelType } from "../ledger/types";

const store = useLedgerStore();

const visibleGroups = computed(() =>
  DIRECTORY.groups.filter((g) => {
    const a = store.currentAccount;
    return a.groupIds === null || a.groupIds.includes(g.id);
  })
);

const groupId = ref<string>(visibleGroups.value[0]?.id ?? DIRECTORY.groups[0].id);

const form = reactive<Record<FuelType, number>>({
  "92号汽油": 7.62,
  "95号汽油": 8.11,
  "98号汽油": 9.05,
  "0号柴油": 7.18
});

const activeBaseline = computed(() =>
  [...store.state.baselines].reverse().find((b) => b.groupId === groupId.value && b.status === "active")
);

watch(
  activeBaseline,
  (b) => {
    if (b) for (const p of b.prices) form[p.fuel] = p.price;
  },
  { immediate: true }
);

const history = computed(() =>
  store.state.baselines
    .filter((b) => b.groupId === groupId.value)
    .slice()
    .reverse()
);

const fmt = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

function submit() {
  const prices = FUEL_TYPES.map((fuel) => ({ fuel, price: Number(form[fuel]) }));
  store.issueBaselineCmd(groupId.value, prices, "夜间换价下发");
}
</script>

<template>
  <div class="grid-2">
    <section class="card">
      <h2>下发站组基准价</h2>
      <p class="hint">
        规则①：新版基准一旦下发，本组所有租约中<strong>未签名油枪立即失效</strong>，
        须按新基准重排场次；已签名油枪不受影响（钉住签名时版本）。
      </p>
      <label class="field">
        <span>站组</span>
        <select v-model="groupId">
          <option v-for="g in visibleGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </label>
      <div v-if="visibleGroups.length === 0" class="deny">当前账号无权管辖任何站组</div>
      <div class="price-grid">
        <label v-for="fuel in FUEL_TYPES" :key="fuel" class="field">
          <span>{{ fuel }}</span>
          <input v-model.number="form[fuel]" type="number" step="0.01" min="0.01" />
        </label>
      </div>
      <button class="primary" :disabled="visibleGroups.length === 0" @click="submit">下发新基准版本</button>
    </section>

    <section class="card">
      <h2>基准版本台账</h2>
      <p class="hint">每份基准只追加、不可删改；旧版自动置为「已替换」。</p>
      <table class="table">
        <thead>
          <tr><th>站组</th><th>版本</th><th>状态</th><th>价签</th><th>下发人</th><th>时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="b in history" :key="b.id">
            <td>{{ groupName(b.groupId) }}</td>
            <td>第 {{ b.seq }} 版</td>
            <td><span class="badge" :class="b.status === 'active' ? 'green' : 'gray'">{{ b.status === "active" ? "生效中" : "已替换" }}</span></td>
            <td class="prices">
              <span v-for="p in b.prices" :key="p.fuel">{{ p.fuel }} ¥{{ p.price.toFixed(2) }}</span>
            </td>
            <td>{{ b.issuedBy }}</td>
            <td class="nowrap">{{ fmt(b.issuedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.price-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.prices {
  display: grid;
  gap: 2px;
  font-size: 12px;
  color: #536078;
}
.deny {
  background: #fdf0ee;
  color: #b03a24;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}
</style>
