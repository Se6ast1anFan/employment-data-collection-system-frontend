<script setup lang="ts">
import { computed } from 'vue'
import type { SixMetrics } from '@/types/week6'
import { calendarMetricChange } from '@/utils/calendarAnalysis'
import { metricDefinitions, percentText, signedText } from '@/utils/week6'

interface MetricRow {
  periodCode: string
  periodLabel?: string
  metrics: SixMetrics | null
  hasSample?: boolean
  periodCount?: number
  samplePeriodCount?: number
  change?: 'difference' | 'growth'
}

const props = defineProps<{
  rows: MetricRow[]
  calendar?: boolean
  relativeLabel?: string
}>()

const tableRows = computed<MetricRow[]>(() => props.relativeLabel ? [
  ...props.rows,
  { periodCode: '', periodLabel: `${props.relativeLabel}差额`, metrics: null, change: 'difference' },
  { periodCode: '', periodLabel: `${props.relativeLabel}增幅`, metrics: null, change: 'growth' },
] : props.rows)

const rowClassName = ({ row }: { row: MetricRow }) => row.change ? 'metric-change-row' : ''

function metricText(row: MetricRow, key: typeof metricDefinitions[number]['key']) {
  if (row.change) {
    const change = calendarMetricChange(props.rows[0]?.metrics?.[key] ?? null, props.rows[1]?.metrics?.[key] ?? null, key === 'changePercent')
    const value = change[row.change]
    if (value === null) return '—'
    if (row.change === 'growth') return `${value > 0 ? '+' : ''}${percentText(value)}`
    return `${signedText(value)}${key === 'changePercent' ? ' 个百分点' : ''}`
  }
  if (!row.metrics) return '—'
  if (key === 'changePercent') return percentText(row.metrics[key])
  if (key === 'netChange') return signedText(row.metrics[key])
  return row.metrics[key]
}
</script>

<template>
  <el-table :data="tableRows" empty-text="暂无分析结果" :row-class-name="rowClassName">
    <el-table-column :label="calendar ? '比较范围' : '调查期'" min-width="150">
      <template #default="{ row }">{{ row.periodLabel || row.periodCode }}<span v-if="row.hasSample === false">（{{ row.periodCount === 0 ? '未配置调查期' : '无样本' }}）</span></template>
    </el-table-column>
    <el-table-column v-if="calendar" label="纳入 / 有样本期数" align="right" min-width="145">
      <template #default="{ row }">{{ row.change ? '—' : `${row.periodCount} / ${row.samplePeriodCount}` }}</template>
    </el-table-column>
    <el-table-column v-else prop="periodCode" label="期次代码" min-width="140" />
    <el-table-column v-for="metric in metricDefinitions" :key="metric.key" :label="`${metric.label}（${calendar && metric.unit === '人' ? '人次' : metric.unit}）`" min-width="150" align="right">
      <template #default="{ row }">{{ metricText(row, metric.key) }}</template>
    </el-table-column>
    <el-table-column v-if="!calendar" label="备案版本来源（企业数）" min-width="260">
      <template #default="{ row }">
        <span v-if="row.metrics?.filingSourceCounts">冻结版本 {{ row.metrics.filingSourceCounts.SNAPSHOT_VERSION }} · 当前回退 {{ row.metrics.filingSourceCounts.CURRENT_FALLBACK }} · 不可用 {{ row.metrics.filingSourceCounts.UNAVAILABLE }}</span>
        <span v-else>—</span>
      </template>
    </el-table-column>
  </el-table>
  <p v-if="relativeLabel" class="muted">增幅按差额 ÷ 基期值计算。基期值非正数时仅显示差额，岗位变化占比的差额用百分点表示。</p>
</template>

<style scoped>
:deep(.metric-change-row) { --el-table-tr-bg-color: var(--canvas); font-weight: 600; }
</style>
