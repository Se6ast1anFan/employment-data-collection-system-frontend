<script setup lang="ts">
import { computed } from 'vue'
import type { Coverage } from '@/types/midterm'

const props = defineProps<{ counts?: Partial<Coverage> }>()
const data = computed(() => {
  const counts = props.counts
  if (!counts) return undefined
  const { eligibleEnterpriseCount: eligible, realSubmittedCount: real, proxyCount: proxy, notCoveredCount: uncovered,
    pendingCount: pending, returnedCount: returned } = counts
  if ([eligible, real, proxy, uncovered, pending, returned].some(value => !Number.isSafeInteger(value) || value! < 0)) return undefined
  if (real! + proxy! + uncovered! !== eligible) return undefined
  return { eligible: eligible!, real: real!, proxy: proxy!, uncovered: uncovered!, pending: pending!, returned: returned! }
})
</script>

<template>
  <div v-if="data" class="coverage-meter">
    <template v-if="data.eligible">
      <strong>真实已报 {{ data.real }} / {{ data.eligible }}</strong>
      <progress :value="data.real" :max="data.eligible" :aria-label="`真实已报 ${data.real} 家，应报 ${data.eligible} 家`" />
      <div class="coverage-counts"><span>代填 {{ data.proxy }} / {{ data.eligible }}</span><span>尚未覆盖 {{ data.uncovered }} / {{ data.eligible }}</span></div>
      <p v-if="data.pending || data.returned" class="muted">待处理 {{ data.pending }} 家，已退回 {{ data.returned }} 家</p>
    </template>
    <span v-else class="muted">暂无应报企业</span>
  </div>
  <span v-else class="muted">暂未取得本期覆盖数据</span>
</template>

<style scoped>
.coverage-meter { min-width: 0; padding-block: 5px; }
progress { display: block; width: 100%; height: 8px; margin: 6px 0; border: 0; border-radius: 5px; overflow: hidden; appearance: none; background: var(--canvas); }
progress::-webkit-progress-bar { background: var(--canvas); }
progress::-webkit-progress-value { background: var(--accent); }
progress::-moz-progress-bar { background: var(--accent); }
.coverage-counts { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--muted); }
.coverage-meter p { margin: 4px 0 0; }
</style>
