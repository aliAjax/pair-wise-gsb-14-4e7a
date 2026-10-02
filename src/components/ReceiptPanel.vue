<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { FUELS, type PriceMap, type Result } from "../types";
import { useLedger, groupName, pricesText, fmtTime, receiptClass } from "../store";

const store = useLedger();

const isStation = computed(() => store.currentAccount.role === "station");

const leaseNo = ref("");
const nozzleId = ref("");
const source = ref<"在线" | "断网回连">("断网回连");
const prices = reactive<PriceMap>({ "92号汽油": 0, "95号汽油": 0, "0号柴油": 0 });
const statusFilter = ref("全部");

const leaseOptions = computed(() => store.visibleLeases);
const lease = computed(() => store.leases.find((l) => l.leaseNo === leaseNo.value));

watch(leaseNo, () => {
  nozzleId.value = "";
  if (lease.value) Object.assign(prices, lease.value.prices);
});

function act(r: Result) {
  if (r.ok) ElMessage.success(r.message);
  else ElMessage.error(r.message);
}

function submit() {
  act(
    store.submitReceipt({
      leaseNo: leaseNo.value,
      nozzleId: nozzleId.value,
      prices: { ...prices },
      source: source.value,
    })
  );
}

function runBatch() {
  act(store.submitOfflineBatch());
}

const receiptStatuses = ["全部", "已合并", "重复拦截", "冲突待复核", "复核采纳", "复核驳回"];

const filteredReceipts = computed(() => {
  const list = [...store.visibleReceipts].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return statusFilter.value === "全部" ? list : list.filter((r) => r.status === statusFilter.value);
});
</script>

<template>
  <section class="workspace">
    <div>
      <form class="panel" @submit.prevent="submit">
        <h2>提交价签回执</h2>
        <el-alert v-if="!isStation" type="warning" :closable="false" title="仅站端账号可提交回执，请切换站组账号" />
        <el-alert
          v-else
          type="info"
          :closable="false"
          title="回执按租约编号+枪号合并：同内容拦截重复盖章，不同内容留两边交区域复核"
        />
        <div class="form-grid">
          <label>
            租约编号
            <select v-model="leaseNo" required>
              <option value="">请选择</option>
              <option v-for="l in leaseOptions" :key="l.leaseNo" :value="l.leaseNo">
                {{ l.leaseNo }} · {{ l.session }} · {{ groupName(l.groupId) }} · v{{ l.baselineVersion }}
              </option>
            </select>
          </label>
          <label>
            枪号
            <select v-model="nozzleId" required :disabled="!lease">
              <option value="">请选择</option>
              <option v-for="n in lease?.nozzles ?? []" :key="n.nozzleId" :value="n.nozzleId">
                {{ n.nozzleId }}（{{ n.state }}）
              </option>
            </select>
          </label>
          <label>
            回执来源
            <select v-model="source">
              <option>在线</option>
              <option>断网回连</option>
            </select>
          </label>
          <label v-for="f in FUELS" :key="f">
            站端价签 · {{ f }}
            <input v-model.number="prices[f]" type="number" step="0.01" min="0" required />
          </label>
          <button type="submit" :disabled="!isStation">提交回执</button>
        </div>
      </form>

      <section class="panel" style="margin-top: 18px">
        <h2>断网回连批次</h2>
        <p class="hint">
          模拟滨江站断网恢复后补传 L-1000 三张回执：BJ-01 与已合并回执同内容（应拦截重复盖章）、BJ-02
          价格不一致（应留两边交区域复核）、BJ-03 首次回执（应合并）。批次属城东组——用城西站组账号点击可看到越权拦截。
        </p>
        <button type="button" style="margin-top: 10px" @click="runBatch">模拟断网回连批次（L-1000）</button>
      </section>
    </div>

    <section class="list-panel">
      <div class="toolbar">
        <h2>回执台账</h2>
        <select v-model="statusFilter">
          <option v-for="s in receiptStatuses" :key="s">{{ s }}</option>
        </select>
      </div>
      <table class="table">
        <thead>
          <tr><th>接收时间</th><th>租约</th><th>枪号</th><th>来源</th><th>价签</th><th>提交人</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredReceipts" :key="r.id">
            <td>{{ fmtTime(r.receivedAt) }}</td>
            <td>{{ r.leaseNo }}</td>
            <td>{{ r.nozzleId }}</td>
            <td>{{ r.source }}<template v-if="r.batchId"> · {{ r.batchId }}</template></td>
            <td>{{ pricesText(r.prices) }}</td>
            <td>{{ r.submittedBy }}</td>
            <td><span class="chip" :class="receiptClass(r.status)">{{ r.status }}</span></td>
          </tr>
          <tr v-if="filteredReceipts.length === 0">
            <td colspan="7" class="empty">暂无回执</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>
