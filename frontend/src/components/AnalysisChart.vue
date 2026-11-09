<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { chartGeometry, type ChartPoint } from '@/utils/chart'

const props = defineProps<{ points: ChartPoint[]; unit: string; title: string; mode: 'line' | 'bar' }>()
const viewport = ref<HTMLDivElement>()
const availableWidth = ref(0)
let resize: ResizeObserver | undefined
const geometry = computed(() => chartGeometry(props.points, availableWidth.value, props.unit === '%'))
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const fmt = (value: number) => number.format(value)
const showMissing = computed(() => props.points.some(point => point.value === null))
const hasValues = computed(() => props.points.some(point => point.value !== null))
const lineSegments = computed(() => geometry.value.segments.filter(segment => segment.length >= 2))
const barWidth = computed(() => Math.min(56, geometry.value.slot * 0.38))
const palette = { accent: '#176781', danger: '#a13837', surface: '#ffffff', line: '#d5e1e7', muted: '#50677a' } as const
const themeColor = (name: keyof typeof palette) => `var(--${name}, ${palette[name]})`

function labelLines(label: string) {
  const length = Math.max(5, Math.min(24, Math.floor((geometry.value.slot - 12) / 12)))
  const chars = [...label]
  const lines = Array.from({ length: Math.min(3, Math.ceil(chars.length / length)) }, (_, index) => chars.slice(index * length, (index + 1) * length).join('').trim())
  if (chars.length > 3 * length) lines[2] = `${lines[2]!.slice(0, -1)}…`
  return lines
}

onMounted(() => {
  if (!viewport.value || typeof ResizeObserver === 'undefined') return
  availableWidth.value = viewport.value.clientWidth
  resize = new ResizeObserver(([entry]) => { if (entry) availableWidth.value = Math.floor(entry.contentRect.width) })
  resize.observe(viewport.value)
})
onUnmounted(() => resize?.disconnect())
</script>

<template>
  <figure class="chart-figure">
    <figcaption><strong>{{ title }}</strong><span>单位 {{ unit }}</span></figcaption>
    <div ref="viewport" class="chart-scroll" role="region" aria-label="图表绘图区，可横向滚动" tabindex="0">
      <svg :viewBox="`0 0 ${geometry.width} ${geometry.height}`" :width="geometry.width" :height="geometry.height" role="img" :aria-label="`${title}，单位${unit}`">
        <g v-for="tick in geometry.ticks" :key="tick">
          <line v-if="tick !== 0" :x1="geometry.left" :x2="geometry.width - geometry.right" :y1="geometry.y(tick)" :y2="geometry.y(tick)"
            :stroke="palette.line" :style="{ stroke: themeColor('line') }" stroke-dasharray="3 3" />
          <text :x="geometry.left - 9" :y="geometry.y(tick) + 4" text-anchor="end" class="chart-axis-label">{{ fmt(tick) }}</text>
        </g>
        <line :x1="geometry.left" :x2="geometry.width - geometry.right" :y1="geometry.zero" :y2="geometry.zero"
          :stroke="palette.muted" :style="{ stroke: themeColor('muted') }" />
        <template v-if="mode === 'line'">
          <polyline v-for="(segment, index) in lineSegments" :key="index" :points="segment.map(point => `${point.x},${point.y}`).join(' ')"
            class="chart-line" fill="none" :stroke="palette.accent" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
            :style="{ fill: 'none', stroke: themeColor('accent') }" />
        </template>
        <g v-for="(point, index) in points" :key="index">
          <template v-if="point.value !== null">
            <rect v-if="mode === 'bar'" :x="geometry.x(index) - barWidth / 2" :y="Math.min(geometry.zero, geometry.y(point.value))"
              :width="barWidth" :height="Math.max(1, Math.abs(geometry.zero - geometry.y(point.value)))" rx="2"
              :fill="point.value < 0 ? palette.danger : palette.accent" :style="{ fill: themeColor(point.value < 0 ? 'danger' : 'accent') }">
              <title>{{ point.label }}：{{ fmt(point.value) }}{{ unit }}</title>
            </rect>
            <circle v-else :cx="geometry.x(index)" :cy="geometry.y(point.value)" r="5" :fill="palette.accent" :stroke="palette.surface"
              stroke-width="1.5" :style="{ fill: themeColor('accent'), stroke: themeColor('surface') }"><title>{{ point.label }}：{{ fmt(point.value) }}{{ unit }}</title></circle>
            <text :x="geometry.x(index)" :y="geometry.y(point.value) + (point.value < 0 ? 16 : -10)" text-anchor="middle" class="chart-value">{{ fmt(point.value) }}{{ unit === '%' ? '%' : '' }}</text>
          </template>
          <text v-else :x="geometry.x(index)" :y="geometry.bottom - 12" text-anchor="middle" class="chart-axis-label">—<title>{{ point.label }}：无可用数值</title></text>
          <text :x="geometry.x(index)" :y="geometry.bottom + 34" text-anchor="middle" class="chart-axis-label">
            <title>{{ point.label }}</title>
            <tspan v-for="(line, lineIndex) in labelLines(point.label)" :key="lineIndex" :x="geometry.x(index)" :dy="lineIndex ? 14 : 0">{{ line }}</tspan>
          </text>
        </g>
      </svg>
    </div>
    <ul v-if="points.length <= 2" class="chart-legend" aria-label="比较对象">
      <li v-for="(point, index) in points" :key="index"><span aria-hidden="true" :class="{ 'legend-empty': point.value === null, 'legend-negative': mode === 'bar' && point.value !== null && point.value < 0 }" />{{ point.label }}</li>
    </ul>
    <p v-if="showMissing || (mode === 'line' && !lineSegments.length && hasValues)" class="chart-note">
      <span v-if="showMissing">「—」表示无样本<span v-if="unit === '%'">或建档岗位合计为零</span>。</span>
      <span v-if="mode === 'line' && !lineSegments.length && hasValues">没有相邻的有效数据，只显示数据点。</span>
      <span v-else-if="mode === 'line' && showMissing && lineSegments.length">缺失处不连线。</span>
    </p>
  </figure>
</template>

<style scoped>
.chart-figure { margin: 16px 0; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); }
.chart-figure figcaption { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; padding: 12px 15px; border-bottom: 1px solid var(--line); }
.chart-figure figcaption span, .chart-note { color: var(--muted); font-size: 13px; }
.chart-scroll { overflow-x: auto; background: var(--surface); }
.chart-scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
svg { display: block; max-width: none; font-family: inherit; font-variant-numeric: tabular-nums; }
text { font-size: 12px; fill: var(--ink); }
.chart-axis-label { fill: var(--muted); }
.chart-value { font-weight: 600; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 6px 20px; list-style: none; padding: 8px 15px; margin: 0; border-top: 1px solid var(--line); }
.chart-legend li { display: flex; align-items: baseline; gap: 7px; overflow-wrap: anywhere; }
.chart-legend li span { flex: none; width: 9px; height: 9px; border-radius: 2px; background: var(--accent, #176781); }
.chart-legend li .legend-negative { background: var(--danger, #a13837); }
.chart-legend li .legend-empty { background: transparent; border: 1px solid var(--muted); }
.chart-note { margin: 0; padding: 5px 15px 10px; }
</style>
