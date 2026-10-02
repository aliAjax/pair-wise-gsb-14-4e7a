<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useLedgerStore } from "../ledger/store";
import { DIRECTORY, groupName, gunLabel } from "../ledger/directory";
import { FUEL_TYPES, type FuelType, type LeaseRecord } from "../ledger/types";

const store = useLedgerStore();

const visibleGroups = computed(() =>
  DIRECTORY.groups.filter((g) => {
    const a = store.currentAccount;
    return a.groupIds === null || a.groupIds.includes(g.id);
  })
);

const newGroup = ref(visibleGroups.value[0]?.id ?? DIRECTORY.groups[0].id);
const rows = reactive<Record<string, { checked: boolean; fuel: FuelType; price: number }>>({});

function syncRows() {
  const group = DIRECTORY.groups.find((g) => g.id === newGroup.value);
  for (const gun of group?.guns ?? []) {
    if (!rows[gun.id]) rows[gun.id] = { checked: true, fuel: "92号汽油", price: 7.62 };
  }
}
syncRows();
watch(newGroup, syncRows);

const activePriceOf = (groupId: string, fuel: FuelType): number => {
  const b = [...store.state.baselines].reverse().find((x) => x.groupId === groupId && x.status === "active");
  return b?.prices.find((p) => p.fuel === fuel)?.price ?? 0;
};

function createLease() {
  const guns = Object.entries(rows)
    .filter(([id]) => DIRECTORY.groups.find((g) => g.id === newGroup.value)?.guns.some((x) => x.id === id))
    .filter(([, r]) => r.checked)
    .map(([gunId, r]) => ({ gunId, fuel: r.fuel, price: Number(r.price) }));
  store.createLeaseCmd(newGroup.value, guns);
}

const leases = computed(() => store.state.leases.slice().reverse());
const attempts = computed(() => store.state.signAttempts);

const statusMeta: Record<string, { text: string; cls: string }> = {
  pending: { text: "待签名", cls: "amber" },
  signed: { text: "已签名", cls: "green" },
  invalidated: { text: "已失效", cls: "red" }
};

// 演示：勾选一部分枪提交 -> 缺枪签名失败；再点“用完整租约重试”
const picked = reactive<Record<string, Set<string>>>({});
function toggle(lease: LeaseRecord, gunId: string) {
  const set = picked[lease.id] ?? new Set(lease.guns.map((g) => g.gunId));
  if (!picked[lease.id]) picked[lease.id] = set;
  if (set.has(gunId)) set.delete(gunId);
  else set.add(gunId);
}
function pickedList(lease: LeaseRecord): string[] {
  return [...(picked[lease.id] ?? new Set(lease.guns.map((g) => g.gunId)))];
}
function isPicked(lease: LeaseRecord, gunId: string) {
  return (picked[lease.id] ?? new Set(lease.guns.map((g) => g.gunId))).has(gunId);
}

const fmt = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });
</script>

<template>
  <div class="grid-2">
    <section class="card">
      <h2>创建油枪签署租约</h2>
      <p class="hint">租约按站组开具；组内没有生效基准时不允许排场次。</p>
      <label class="field">
        <span>站组</span>
        <select v-model="newGroup">
          <option v-for="g in visibleGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </label>
      <table class="table compact">
        <thead><tr><th>入约</th><th>油枪</th><th>油品</th><th>签署价签</th><th>现行基准</th></tr></thead>
        <tbody>
          <tr v-for="gun in DIRECTORY.groups.find((g) => g.id === newGroup)?.guns ?? []" :key="gun.id">
            <td><input type="checkbox" v-model="rows[gun.id].checked" /></td>
            <td>{{ gun.label }}</td>
            <td>
              <select v-model="rows[gun.id].fuel">
                <option v-for="f in FUEL_TYPES" :key="f" :value="f">{{ f }}</option>
              </select>
            </td>
            <td><input class="price-input" type="number" step="0.01" v-model.number="rows[gun.id].price" /></td>
            <td>¥{{ activePriceOf(newGroup, rows[gun.id].fuel).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
      <button class="primary" @click="createLease">创建租约</button>
    </section>

    <section class="card">
      <h2>签署场次 / 主管晚改</h2>
      <p class="hint">
        规则③：已签场次主管带不回（拦截留痕）；规则④：签名必须覆盖完整租约，缺枪只记
        <code>SignFailed</code>、状态不变，用完整租约重试即可。
      </p>
      <div v-if="leases.length === 0" class="empty">暂无租约</div>
      <article v-for="lease in leases" :key="lease.id" class="lease">
        <header>
          <div>
            <strong>{{ groupName(lease.groupId) }} · 第 {{ lease.seq }} 号租约</strong>
            <span class="sub">{{ lease.createdBy }} 开 · {{ fmt(lease.createdAt) }}</span>
          </div>
          <span v-if="attempts[lease.id]" class="badge red">签名失败 {{ attempts[lease.id] }} 次</span>
        </header>
        <div class="guns">
          <label
            v-for="gun in lease.guns"
            :key="gun.gunId"
            class="gun"
            :class="statusMeta[gun.status].cls"
          >
            <input
              type="checkbox"
              :checked="isPicked(lease, gun.gunId)"
              :disabled="gun.status !== 'pending'"
              @change="toggle(lease, gun.gunId)"
            />
            <span>{{ gunLabel(lease.groupId, gun.gunId) }}</span>
            <span class="fuel">{{ gun.fuel }} ¥{{ gun.price.toFixed(2) }}</span>
            <span class="state">{{ statusMeta[gun.status].text }}</span>
          </label>
        </div>
        <div class="actions">
          <button
            class="primary small"
            :disabled="!lease.guns.some((g) => g.status === 'pending')"
            @click="store.signLeaseCmd(lease.id, pickedList(lease))"
          >
            按所选枪号提交签名
          </button>
          <button
            class="secondary small"
            :disabled="!lease.guns.some((g) => g.status === 'pending')"
            @click="store.signLeaseCmd(lease.id, lease.guns.map((g) => g.gunId))"
          >
            用完整租约重试（{{ lease.guns.length }} 枪）
          </button>
          <button class="warn small" @click="store.rollbackCmd(lease.id)">主管晚改：带回待执行</button>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.price-input {
  width: 92px;
  padding: 6px 8px;
}
.lease {
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: #fbfcfe;
}
.lease header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.sub {
  display: block;
  font-size: 12px;
  color: #7a859b;
  margin-top: 2px;
}
.guns {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}
.gun {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid #e3e9f2;
  background: #fff;
  color: #33405c;
}
.gun .fuel { color: #536078; }
.gun .state {
  margin-left: auto;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
}
.gun.amber .state { background: #fdf3e0; color: #9a6410; }
.gun.green .state { background: #e8f4ef; color: #14724f; }
.gun.red .state { background: #fbe9e5; color: #b03a24; }
.gun.red { opacity: 0.85; }
.warn {
  background: #b07b16;
}
</style>
