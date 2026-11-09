<script setup lang="ts">
import { computed } from 'vue'
import type { CitiesAnalysis } from '@/types/week6'
import { percentText } from '@/utils/week6'

const props = defineProps<{ data: CitiesAnalysis }>()
const colors = ['var(--accent)', '#36846d', '#ad7025', '#73538d', '#aa534b', '#6a899a', '#788245', '#46679b']
const slices = computed(() => {
  let position = 0
  return props.data.cities.map((city, index) => {
    const start = position
    position += city.enterpriseCount / props.data.totalEnterpriseCount * 100
    return `${colors[index % colors.length]} ${start}% ${position}%`
  })
})
</script>

<template>
  <figure v-if="!data.empty && data.totalEnterpriseCount > 0" class="pie-figure">
    <figcaption><strong>各市企业数量占比</strong><span>分母 {{ data.totalEnterpriseCount }} 家</span></figcaption>
    <div class="pie-layout">
      <div class="pie" role="img" aria-label="各市企业数量占比饼图，明细见同页表格" :style="{ background: `conic-gradient(${slices.join(',')})` }" />
      <ul aria-label="城市图例">
        <li v-for="(city, index) in data.cities" :key="city.cityOrgId">
          <span class="pie-key" :style="{ background: colors[index % colors.length] }" aria-hidden="true" />{{ city.cityName }}：{{ city.enterpriseCount }} 家 · {{ percentText(city.sharePercent) }}
        </li>
      </ul>
    </div>
  </figure>
</template>

<style scoped>
.pie-figure { margin: 16px 0; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); }
.pie-figure figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; padding: 12px 15px; border-bottom: 1px solid var(--line); }
.pie-figure figcaption span { color: var(--muted); font-size: 13px; }
.pie-layout { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; padding: 18px; background: var(--surface); }
.pie { flex: none; width: min(100%, 190px); aspect-ratio: 1; border-radius: 50%; }
.pie-layout ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(165px, 100%), 1fr)); flex: 1 1 190px; gap: 8px 12px; list-style: none; padding: 0; margin: 0; }
.pie-key { display: inline-block; width: 9px; height: 9px; margin-inline-end: 7px; border-radius: 2px; }
</style>
