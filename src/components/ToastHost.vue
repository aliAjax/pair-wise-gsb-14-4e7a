<script setup lang="ts">
import { useLedgerStore } from "../ledger/store";

const store = useLedgerStore();
</script>

<template>
  <div class="toast-host">
    <transition-group name="toast">
      <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.ok ? 'ok' : 'err'">
        <span class="dot" />
        <span>{{ t.text }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 20px;
  bottom: 20px;
  display: grid;
  gap: 10px;
  z-index: 1000;
  max-width: 420px;
}
.toast {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #fff;
  border: 1px solid #d5deeb;
  border-left-width: 4px;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.55;
  color: #2c3850;
  box-shadow: 0 10px 30px rgba(23, 32, 51, 0.12);
}
.toast.ok { border-left-color: #14724f; }
.toast.err { border-left-color: #c84b31; }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex: none;
  background: #14724f;
}
.toast.err .dot { background: #c84b31; }
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
