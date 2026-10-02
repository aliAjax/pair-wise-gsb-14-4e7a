<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { FUELS, GROUPS, type PriceMap, type Result } from "../types";
import { useLedger, groupName, nozzleOf, pricesText, fmtTime, stateClass } from "../store";

const store = useLedger();

const isHq = computed(() => store.currentAccount.role === "hq");
const isRegion = computed(() => store.currentAccount.role === "region");

const groupId = ref("G-E");
const prices = reactive<PriceMap>({ "92号汽油": 0, "95号汽油": 0, "0号柴油": 0 });
const note = ref("");

function prefill() {
  const current = store.currentBaselineOf(groupId.value);
  if (current) Object.assign(prices, current.prices);
}
prefill();
watch(groupId, prefill);

function act(r: Result) {
  if (r.ok) ElMessage.success(r.message);
  else ElMessage.error(r.message);
}

function publish() {
  act(store.publishBaseline(groupId.value, { ...prices }, note.value));
  note.value = "";
}

const sortedBaselines = computed(() => [...store.baselines].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)));
const sortedLeases = computed(() => [...store.visibleLeases].sort((a, b) => b.leaseNo.localeCompare(a.leaseNo)));

function canOperate(leaseGroupId: string) {
  return store.currentAccount.role === "station" && store.currentAccount.groupId === leaseGroupId;
}
</script>

<template>
  <section class="workspace">
    <div>
      <form class="panel" @submit.prevent="publish">
        <h2>发布站组基准</h2>
        <el-alert v-if="!isHq" type="warning" :closable="false" title="当前账号无权发布基准，仅总部调价中心可下发" />
        <el-alert
          v-else
          type="info"
          :closable="false"
          title="发布后：在途租约中未签名油枪立即失效并生成新租约，已签名油枪沿用原基准"
        />
        <div class="form-grid">
          <label>
            站组
            <select v-model="groupId">
              <option v-for="g in GROUPS" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </label>
          <label v-for="f in FUELS" :key="f">
            {{ f }} 挂牌价
            <input v-model.number="prices[f]" type="number" step="0.01" min="0" required />
          </label>
          <label>
            备注
            <input v-model="note" placeholder="如：今夜二轮调价" />
          </label>
          <button type="submit" :disabled="!isHq">发布基准（未签油枪失效）</button>
        </div>
      </form>

      <section class="panel" style="margin-top: 18px">
        <h2>基准版本</h2>
        <table class="table">
          <thead>
            <tr><th>版本</th><th>站组</th><th>价格</th><th>发布</th></tr>
          </thead>
          <tbody>
            <tr v-for="b in sortedBaselines" :key="b.id">
              <td>v{{ b.version }}</td>
              <td>{{ groupName(b.groupId) }}</td>
              <td>{{ pricesText(b.prices) }}</td>
              <td>{{ fmtTime(b.issuedAt) }} · {{ b.issuedBy }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <section class="list-panel">
      <div class="toolbar">
        <h2>租约签署</h2>
        <span class="hint">签署权在站端；签名失败须从完整租约快照重试</span>
      </div>
      <div class="record-grid">
        <article v-for="lease in sortedLeases" :key="lease.leaseNo" class="record">
          <div class="record-head">
            <p class="record-title">{{ lease.leaseNo }} · {{ lease.session }} · 基准 v{{ lease.baselineVersion }}</p>
            <span class="status">{{ store.leaseStatus(lease) }}</span>
          </div>
          <p class="note">
            完整租约快照：{{ pricesText(lease.prices) }}
            <template v-if="lease.reopenedBy">｜晚改回退 by {{ lease.reopenedBy }}（{{ fmtTime(lease.reopenedAt) }}）</template>
          </p>
          <table class="table">
            <thead>
              <tr><th>枪号</th><th>站点</th><th>状态</th><th>时间 / 原因</th><th>操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="n in lease.nozzles" :key="n.nozzleId">
                <td>{{ n.nozzleId }}</td>
                <td>{{ nozzleOf(n.nozzleId)?.station }}</td>
                <td><span class="chip" :class="stateClass(n.state)">{{ n.state }}</span></td>
                <td>
                  <template v-if="n.state === '已签名'">{{ fmtTime(n.signedAt) }}</template>
                  <template v-else-if="n.state === '签名失败'">{{ n.failReason }}（第 {{ n.attempts }} 次）</template>
                  <template v-else-if="n.state === '已失效'">被基准 v{{ store.baselineVersionOf(n.invalidatedBy) }} 取代</template>
                  <template v-else>—</template>
                </td>
                <td class="ops">
                  <template v-if="canOperate(lease.groupId)">
                    <template v-if="n.state === '待签名'">
                      <button type="button" @click="act(store.signNozzle(lease.leaseNo, n.nozzleId, false))">签名</button>
                      <button class="secondary" type="button" @click="act(store.signNozzle(lease.leaseNo, n.nozzleId, true))">模拟失败</button>
                    </template>
                    <button
                      v-else-if="n.state === '签名失败'"
                      type="button"
                      @click="act(store.retrySign(lease.leaseNo, n.nozzleId))"
                    >
                      从完整租约重试
                    </button>
                    <span v-else class="muted">—</span>
                  </template>
                  <span v-else class="muted">{{ n.state === "待签名" || n.state === "签名失败" ? "需本组站端账号" : "—" }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="isRegion" class="actions" style="margin-top: 12px">
            <button class="danger" type="button" @click="act(store.lateChange(lease.leaseNo))">主管晚改：带回待执行</button>
          </div>
        </article>
        <div v-if="sortedLeases.length === 0" class="empty">本组暂无租约</div>
      </div>
    </section>
  </section>
</template>
