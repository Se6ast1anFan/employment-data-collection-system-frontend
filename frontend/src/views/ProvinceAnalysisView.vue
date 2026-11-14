<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { chartAnalysisProvider as api, compareCalendar, listChartPeriods } from '@/services/calendarAnalysis'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/services/api'
import type { SurveyPeriod } from '@/types/report'
import type { AnalysisFilters, CitiesAnalysis, CompareAnalysis, TrendAnalysis } from '@/types/week6'
import { calendarBuckets, calendarMetricChange, calendarMethods, comparisonGrains, referenceCalendarBucket, type CalendarBucket, type CalendarMethod, type ComparisonGrain } from '@/utils/calendarAnalysis'
import { contiguousCodes, metricDefinitions, percentText, signedText } from '@/utils/week6'
import RegionPicker from '@/components/RegionPicker.vue'
import AnalysisChart from '@/components/AnalysisChart.vue'
import CityShareChart from '@/components/CityShareChart.vue'
import MetricsTable from '@/components/MetricsTable.vue'

const auth = useAuthStore()
const canReadPeriods = computed(() => auth.can('PROVINCE.PERIOD.READ'))
const route = useRoute()
const modes = { cities: '各市数量与占比', compare: '两期六项对比', trend: '连续多期趋势' } as const
const mode = ref<keyof typeof modes>('cities')
const grain = ref<ComparisonGrain>('period')
const method = ref<CalendarMethod>('manual')
const periods = ref<SurveyPeriod[]>([])
const demo = ref<Awaited<ReturnType<typeof listChartPeriods>>['defaults']>()
const busy = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const periodCode = ref(''), first = ref(''), second = ref(''), start = ref(''), end = ref('')
const filters = reactive<Partial<AnalysisFilters>>({})
const cities = ref<CitiesAnalysis | null>(null)
const compare = ref<CompareAnalysis | null>(null)
const calendar = ref<Awaited<ReturnType<typeof compareCalendar>> | null>(null)
const trend = ref<TrendAnalysis | null>(null)
const chartMode = ref<'bar' | 'line'>('bar')
const metric = ref<typeof metricDefinitions[number]['key']>('periodEmploymentTotal')
const currentMetric = computed(() => metricDefinitions.find(item => item.key === metric.value)!)
const currentUnit = computed(() => grain.value !== 'period' && currentMetric.value.unit === '人' ? '人次' : currentMetric.value.unit)
const periodNames = computed(() => new Map(periods.value.map(period => [period.code, period.label])))

function labelFor(period: { periodCode: string; periodLabel?: string }) {
  return period.periodLabel?.trim() || periodNames.value.get(period.periodCode)?.trim() || '未命名调查期'
}

const calendarOptions = computed<{ items: CalendarBucket[]; error?: string }>(() => {
  if (grain.value === 'period') return { items: [] }
  try { return { items: calendarBuckets(periods.value, grain.value) } }
  catch (cause) { return { items: [], error: (cause as Error).message } }
})
const compareOptions = computed(() => grain.value === 'period' ? periods.value : calendarOptions.value.items)
const automatic = computed(() => grain.value !== 'period' && method.value !== 'manual')
const currentBucket = computed(() => calendarOptions.value.items.find(bucket => bucket.code === second.value))
const referenceBucket = computed(() => {
  if (grain.value === 'period' || method.value === 'manual' || !currentBucket.value) return undefined
  return referenceCalendarBucket(currentBucket.value, grain.value, method.value, calendarOptions.value.items)
})
const unevenCoverage = computed(() => {
  const [base, current] = calendar.value ?? []
  return base && current && (base.periodCount !== current.periodCount || base.samplePeriodCount !== current.samplePeriodCount)
})
const comparisonRows = computed(() => calendar.value ?? compare.value?.periods.map(period => ({
  ...period, periodLabel: labelFor(period), hasSample: period.metrics.enterpriseCount > 0,
})) ?? [])
const trendRows = computed(() => trend.value?.points.map(period => ({ ...period, periodLabel: labelFor(period) })) ?? [])
const comparePoints = computed(() => comparisonRows.value.map(row => ({
  label: row.periodLabel, value: row.hasSample ? row.metrics?.[currentMetric.value.key] ?? null : null,
})))
const relativeSummary = computed(() => {
  const [base, current] = comparePoints.value
  if (!automatic.value || !base || !current) return undefined
  const isRate = currentMetric.value.key === 'changePercent'
  const change = calendarMetricChange(base.value, current.value, isRate)
  const methodLabel = calendarMethods[method.value]
  return {
    difference: change.difference === null ? '—' : `${signedText(change.difference)} ${isRate ? '个百分点' : currentUnit.value}`,
    growth: isRate ? undefined : change.growth === null ? '—' : `${change.growth > 0 ? '+' : ''}${percentText(change.growth)}`,
    label: methodLabel,
  }
})
const trendPoints = computed(() => trendRows.value.map(row => ({ label: row.periodLabel, value: row.hasSample ? row.metrics?.changePercent ?? null : null })))
const filterLabels: Record<keyof AnalysisFilters, string> = {
  enterpriseOrgId: '企业编号', regionCode: '地区', natureParentCode: '性质父级', natureCode: '性质子级', industryParentCode: '行业父级', industryCode: '行业子级',
}

function filterText(value: Partial<AnalysisFilters>) {
  return Object.entries(value).filter(([, item]) => item).map(([key, item]) => `${filterLabels[key as keyof AnalysisFilters]}：${item}`).join('，') || '全省全部分类'
}

async function loadPeriods() {
  if (!canReadPeriods.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await listChartPeriods(auth.token!)
    periods.value = result.periods
    demo.value = result.defaults
  }
  catch (cause) { error.value = (cause as Error).message }
  finally { busy.value = false }
}

async function query() {
  if (busy.value) return
  clearResults()
  const selected = mode.value
  const requestFilters = { ...filters }
  if (selected === 'cities' && !periodCode.value) { error.value = '请选择调查期'; return }
  let codes: string[] = []
  if (selected === 'trend') {
    try { codes = contiguousCodes(periods.value, start.value, end.value) }
    catch (cause) { error.value = (cause as Error).message; return }
  }
  if (selected === 'compare') {
    if (automatic.value && !referenceBucket.value) {
      error.value = calendarOptions.value.error ?? '请选择本期'
      return
    }
    if (!automatic.value && (!first.value || !second.value || first.value === second.value)) {
      error.value = calendarOptions.value.error ?? `请选择两个不同的${comparisonGrains[grain.value]}`
      return
    }
  }
  busy.value = true
  try {
    if (selected === 'cities') cities.value = (await api.cities({ periodCode: periodCode.value, regionCode: requestFilters.regionCode }, auth.token!)).data
    else if (selected === 'trend') trend.value = (await api.trend({ ...requestFilters, periodCodes: codes }, auth.token!)).data
    else if (grain.value === 'period') compare.value = (await api.compare({ ...requestFilters, firstPeriodCode: first.value, secondPeriodCode: second.value }, auth.token!)).data
    else {
      const left = automatic.value ? referenceBucket.value : calendarOptions.value.items.find(bucket => bucket.code === first.value)
      const right = currentBucket.value
      if (!left || !right) throw new Error('所选范围已更新，请重新选择比较对象。')
      calendar.value = await compareCalendar([left, right], requestFilters, auth.token!)
    }
  } catch (cause) {
    error.value = (cause as Error).message
    if (cause instanceof ApiError) fieldErrors.value = cause.fieldErrors
  } finally { busy.value = false }
}

function clearFilters() {
  for (const key of Object.keys(filters)) delete filters[key as keyof AnalysisFilters]
  void query()
}

function previewDemo() {
  if (!demo.value || busy.value) return
  periodCode.value = end.value = demo.value.last
  start.value = demo.value.first
  first.value = grain.value === 'period' ? demo.value.first : demo.value.calendarBase[grain.value]
  second.value = grain.value === 'period' ? demo.value.last : demo.value.calendar[grain.value]
  clearFilters()
}

function clearResults() {
  cities.value = compare.value = calendar.value = trend.value = null
  error.value = ''
  fieldErrors.value = {}
}

watch(grain, value => {
  first.value = value === 'period' ? demo.value?.first ?? '' : demo.value?.calendarBase[value] ?? ''
  second.value = value === 'period' ? demo.value?.last ?? '' : demo.value?.calendar[value] ?? ''
  method.value = value === 'year' ? 'yoy' : value === 'period' ? 'manual' : 'sequential'
}, { flush: 'sync' })
watch([mode, grain, method, periodCode, first, second, start, end, filters], clearResults, { deep: true, flush: 'sync' })
onMounted(async () => {
  await loadPeriods()
  if (typeof route.query.periodCode === 'string' && (!canReadPeriods.value || periods.value.some(period => period.code === route.query.periodCode))) {
    periodCode.value = route.query.periodCode
    await query()
  } else if (demo.value) previewDemo()
})
</script>

<template>
  <section class="analysis-page">
    <div class="page-heading">
      <div><h1>就业数据分析</h1><p>分析本省已省审通过、未作废的最新提交版本，使用当前有效修订值。</p></div>
      <div class="heading-actions">
        <el-button v-if="demo" :disabled="busy" @click="previewDemo">载入演示样本</el-button>
        <el-button v-if="canReadPeriods" :disabled="busy" @click="loadPeriods">刷新调查期</el-button>
      </div>
    </div>
    <p v-if="!canReadPeriods" class="muted">可按调查期代码查询。连续趋势和日历周期对比需要调查期查看权限。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <ul v-if="Object.keys(fieldErrors).length" role="alert"><li v-for="(message, key) in fieldErrors" :key="key">{{ message }}</li></ul>
    <div class="analysis-tabs" role="group" aria-label="分析方式">
      <el-button v-for="(label, key) in modes" v-show="canReadPeriods || key !== 'trend'" :key="key" :type="mode === key ? 'primary' : 'default'" :aria-pressed="mode === key" :disabled="busy" @click="mode = key">{{ label }}</el-button>
    </div>
    <el-card shadow="never" v-loading="busy">
      <el-form label-position="top" :disabled="busy" @submit.prevent="query">
        <div v-if="mode === 'compare' && canReadPeriods" class="comparison-controls">
          <el-form-item label="比较粒度" class="comparison-grain">
            <el-radio-group v-model="grain" aria-label="比较粒度">
              <el-radio-button v-for="(label, key) in comparisonGrains" :key="key" :value="key">{{ label }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="grain !== 'period'" label="比较方式">
            <el-radio-group v-model="method" aria-label="比较方式">
              <el-radio-button value="manual">自选对比</el-radio-button>
              <el-radio-button value="yoy">同比</el-radio-button>
              <el-radio-button v-if="grain !== 'year'" value="sequential">环比</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>
        <div class="analysis-filters">
          <el-form-item v-if="mode === 'cities'" label="调查期">
            <el-select v-if="canReadPeriods" v-model="periodCode" placeholder="选择调查期"><el-option v-for="period in periods" :key="period.code" :label="period.label" :value="period.code" /></el-select><el-input v-else v-model.trim="periodCode" maxlength="32" placeholder="输入调查期代码" />
          </el-form-item>
          <template v-if="mode === 'compare' && automatic">
            <el-form-item label="本期">
              <el-select v-model="second" :placeholder="`选择${comparisonGrains[grain]}`"><el-option v-for="item in compareOptions" :key="item.code" :value="item.code" :label="item.label" /></el-select>
            </el-form-item>
            <el-form-item :label="method === 'yoy' ? '基期（上年同期）' : grain === 'quarter' ? '基期（上一季度）' : '基期（上一个月）'">
              <p class="reference-period">{{ referenceBucket?.label ?? '选择本期后自动匹配' }}<span v-if="referenceBucket && !referenceBucket.periodCodes.length"> · 未配置调查期</span></p>
            </el-form-item>
          </template>
          <template v-else-if="mode === 'compare'">
            <el-form-item :label="grain === 'period' ? '第一调查期' : '比较范围 A'">
              <el-select v-if="canReadPeriods" v-model="first" :placeholder="`选择${comparisonGrains[grain]}`"><el-option v-for="item in compareOptions" :key="item.code" :value="item.code" :label="item.label" :disabled="item.code === second" /></el-select><el-input v-else v-model.trim="first" maxlength="32" placeholder="输入调查期代码" />
            </el-form-item>
            <el-form-item :label="grain === 'period' ? '第二调查期' : '比较范围 B'">
              <el-select v-if="canReadPeriods" v-model="second" :placeholder="`选择${comparisonGrains[grain]}`"><el-option v-for="item in compareOptions" :key="item.code" :value="item.code" :label="item.label" :disabled="item.code === first" /></el-select><el-input v-else v-model.trim="second" maxlength="32" placeholder="输入调查期代码" />
            </el-form-item>
          </template>
          <template v-if="mode === 'trend'">
            <el-form-item label="起始调查期"><el-select v-model="start"><el-option v-for="period in periods" :key="period.code" :value="period.code" :label="period.label" /></el-select></el-form-item>
            <el-form-item label="结束调查期"><el-select v-model="end"><el-option v-for="period in periods" :key="period.code" :value="period.code" :label="period.label" /></el-select></el-form-item>
          </template>
          <el-form-item label="地区（含下级）"><RegionPicker v-model="filters.regionCode" any-level :disabled="busy" /></el-form-item>
          <template v-if="mode !== 'cities'">
            <el-form-item label="单企业编号" :error="fieldErrors.enterpriseOrgId"><el-input v-model.trim="filters.enterpriseOrgId" clearable placeholder="留空表示不限" /></el-form-item>
            <el-form-item v-for="key in (['natureParentCode', 'natureCode', 'industryParentCode', 'industryCode'] as const)" :key="key" :label="filterLabels[key] + '代码'" :error="fieldErrors[key]">
              <el-input v-model="filters[key]" clearable :maxlength="64" placeholder="留空表示不限" />
            </el-form-item>
          </template>
        </div>
        <p v-if="mode !== 'cities'" class="muted">性质、行业使用两级备案代码。父级包含其子项，父子代码同时填写时须匹配。分析优先采用报表提交时的备案版本。</p>
        <p v-if="mode === 'compare' && grain !== 'period'" class="muted">{{ calendarOptions.error || '按调查期开始日（北京时间）归组。各组独立取样，企业在组内去重，岗位按组内各期累计人次计算。' }}</p>
        <p v-if="mode === 'trend'" class="muted">自动纳入起止之间相邻的 2 至 24 个调查期，无样本期次也会保留。</p>
        <div class="form-actions"><el-button :disabled="busy" @click="clearFilters">清除样本条件</el-button><el-button type="primary" native-type="submit" :disabled="busy">查询 / 刷新分析</el-button></div>
      </el-form>
    </el-card>

    <el-card class="business-card analysis-result" shadow="never" :aria-busy="busy">
      <template v-if="mode === 'cities' && cities">
        <h2>{{ cities.periodLabel }} · 各市企业数量</h2>
        <p class="result-context">统计范围 {{ cities.regionCode || '全省' }}。占比保留两位小数，合计可能略有误差。</p>
        <el-empty v-if="cities.empty" description="本期本范围没有合格样本，不绘制饼图" />
        <CityShareChart v-else :data="cities" />
        <el-table :data="cities.cities" empty-text="暂无城市样本">
          <el-table-column prop="cityName" label="城市" />
          <el-table-column prop="enterpriseCount" label="企业数（家）" align="right" />
          <el-table-column label="企业占比" align="right"><template #default="{ row }">{{ percentText(row.sharePercent) }}</template></el-table-column>
        </el-table>
      </template>
      <template v-else-if="mode === 'compare' && comparisonRows.length">
        <div class="analysis-result-heading">
          <div>
            <h2>{{ grain === 'period' ? '两期六项岗位指标' : `${comparisonGrains[grain]}${calendarMethods[method]}` }}</h2>
            <p v-if="automatic" class="result-context">本期 {{ comparisonRows[1]?.periodLabel }}，基期 {{ comparisonRows[0]?.periodLabel }}</p>
            <p class="result-context">样本条件 {{ filterText(compare?.filters ?? filters) }}。两个比较范围独立取样。</p>
          </div>
          <div class="chart-controls">
            <el-select v-model="metric" aria-label="图表指标"><el-option v-for="item in metricDefinitions" :key="item.key" :value="item.key" :label="item.label" /></el-select>
            <el-radio-group v-model="chartMode" aria-label="图表展示方式"><el-radio-button value="bar">柱状图</el-radio-button><el-radio-button value="line">折线图</el-radio-button></el-radio-group>
          </div>
        </div>
        <div v-if="relativeSummary" class="relative-summary" aria-live="polite">
          <span>{{ currentMetric.label }}</span>
          <span>{{ relativeSummary.label }}差额 <strong>{{ relativeSummary.difference }}</strong></span>
          <span v-if="relativeSummary.growth !== undefined">{{ relativeSummary.label }}增幅 <strong>{{ relativeSummary.growth }}</strong></span>
        </div>
        <el-empty v-if="comparisonRows.every(row => !row.hasSample)" description="所选两个范围均无合格样本" />
        <AnalysisChart v-else :points="comparePoints" :unit="currentUnit" :title="currentMetric.label" :mode="chartMode" />
        <MetricsTable :rows="comparisonRows" :calendar="grain !== 'period'" :relative-label="automatic ? calendarMethods[method] : undefined" />
        <p v-if="unevenCoverage" class="coverage-note">两组纳入的调查期数或有样本的期数不同，比较累计人次时请核对覆盖范围。</p>
        <p v-if="grain !== 'period'" class="muted">备案来源计数请查看单调查期对比。日历汇总的岗位数为累计人次，变化占比按汇总后的净变化除以建档岗位计算。</p>
      </template>
      <template v-else-if="mode === 'trend' && trend">
        <h2>连续调查期岗位变化占比</h2>
        <p class="result-context">样本条件 {{ filterText(trend.filters) }}。</p>
        <AnalysisChart :points="trendPoints" unit="%" title="岗位变化占比趋势" mode="line" />
        <MetricsTable :rows="trendRows" />
      </template>
      <el-empty v-else :description="mode === 'compare' ? '选择比较粒度和两个比较范围后查询' : '请选择调查期并查询'" />
    </el-card>
    <p class="muted">岗位净变化＝调查期总岗位－建档期总岗位。岗位减少总数只累计减员。岗位变化占比＝净变化 ÷ 建档期总岗位 × 100%。报表修订或作废后，重新查询可更新结果。</p>
  </section>
</template>

<style scoped>
.analysis-tabs, .chart-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.analysis-tabs { margin: 16px 0; }
.analysis-tabs .el-button { margin-left: 0; }
.analysis-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 0 16px; }
.comparison-controls { display: flex; flex-wrap: wrap; gap: 0 24px; }
.reference-period { margin: 0; width: 100%; padding: 0 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--canvas); }
.reference-period span, .coverage-note { color: var(--amber); }
.analysis-result-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px; }
.analysis-result h2 { margin: 0; }
.result-context { margin: 5px 0 0; color: var(--muted); }
.relative-summary { display: flex; flex-wrap: wrap; gap: 5px 20px; margin-top: 12px; padding: 8px 12px; border-inline-start: 3px solid var(--accent); background: var(--accent-soft); color: var(--ink); }
.relative-summary strong { margin-inline-start: 5px; }
.chart-controls .el-select { width: 168px; max-width: 100%; }
.analysis-result .el-table { margin-top: 12px; }
@media (max-width: 480px) {
  .comparison-grain :deep(.el-radio-button__inner) { padding-inline: 8px; }
}
</style>
