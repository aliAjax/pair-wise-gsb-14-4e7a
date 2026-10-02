<script setup lang="ts">
import { computed } from "vue";
import { useLedger, groupName, nozzleOf, pricesText, fmtTime, stateClass } from "../store";

const store = useLedger();

const metricCards = computed(() => [
  { label: "在途租约", value: store.metrics.inFlight },
  { label: "待签名油枪", value: store.metrics.pendingSign },
  { label: "待复核冲突", value: store.metrics.openConflicts },
  { label: "重复盖章拦截", value: store.metrics.dup },
]);

const restraints = [
  "基准更新后，在途租约中未签名油枪立即失效，并自动生成新基准租约",
  "已签名油枪沿用原基准，审计页逐枪留痕「沿用 / 失效」",
  "回执按租约编号 + 枪号合并：内容一致拦截重复盖章，不一致两边留档交区域复核",
  "签名失败必须从完整租约快照重试，不允许残缺补签",
  "存在盖章回执的场次，主管晚改被回执牵制",
  "站端账号越权提交他组材料一律拦截并留痕",
];

const sortedLeases = computed(() => [...store.visibleLeases].sort((a, b) => b.leaseNo.localeCompare(a.leaseNo)));
</script>

<template>
  <section class="metrics cols-4">
    <article v-for="m in metricCards" :key="m.label" class="metric">
      <span>{{ m.label }}</span>
      <strong>{{ m.value }}</strong>
    </article>
  </section>

  <section class="panel" style="margin-bottom: 18px">
    <h2>牵制规则</h2>
    <ul class="rule-list">
      <li v-for="r in restraints" :key="r">{{ r }}</li>
    </ul>
  </section>

  <section class="list-panel">
    <div class="toolbar">
      <h2>租约台账</h2>
      <span class="hint">基准、租约、回执三方分账，状态由枪位签名与回执合并实时推导</span>
    </div>
    <div class="record-grid">
      <article v-for="lease in sortedLeases" :key="lease.leaseNo" class="record">
        <div class="record-head">
          <p class="record-title">{{ lease.leaseNo }} · {{ lease.session }}</p>
          <span class="status">{{ store.leaseStatus(lease) }}</span>
        </div>
        <div class="details">
          <span>站组：{{ groupName(lease.groupId) }}</span>
          <span>基准：v{{ lease.baselineVersion }}</span>
          <span>快照：{{ pricesText(lease.prices) }}</span>
          <span>回执：{{ store.receiptProgress(lease) }}</span>
        </div>
        <div class="chip-row">
          <span
            v-for="n in lease.nozzles"
            :key="n.nozzleId"
            class="chip"
            :class="stateClass(n.state)"
            :title="nozzleOf(n.nozzleId)?.station"
          >
            {{ n.nozzleId }} · {{ n.state }}
          </span>
        </div>
        <p v-if="lease.reopenedBy" class="note" style="margin-top: 12px">
          晚改回退：{{ lease.reopenedBy }} 于 {{ fmtTime(lease.reopenedAt) }} 将已签场次带回待执行
        </p>
      </article>
      <div v-if="sortedLeases.length === 0" class="empty">本组暂无租约</div>
    </div>
  </section>
</template>
