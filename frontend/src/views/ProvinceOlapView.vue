<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { cubeFactLimit, cubePeriodLimit, listOlapPeriods, loadOlapFacts } from '@/services/olap'
import type { SurveyPeriod } from '@/types/report'
import { directionLabels } from '@/utils/revision'
import { percentText } from '@/utils/week6'
import {
  aggregateCube, buildCube, cubeDimensions, cubeLayerTotals, cubeMember, cubeMembers, cubeMetrics, cubeValue,
  dimensionKeys, filterCube, matchesHeader, metricKeys,
  type CubeDimension, type CubeFact, type CubeFilters, type CubeHeader, type CubeMetric,
} from '@/utils/olap'

const auth = useAuthStore()
const canReadPeriods = computed(() => auth.can('PROVINCE.PERIOD.READ'))
const manualPeriods = ref('')
const route = useRoute()
const periods = shallowRef<SurveyPeriod[]>([])
const demoCodes = ref<string[]>([])
const selectedPeriods = ref<string[]>([])
const snapshot = shallowRef<{ periods: Map<string, string>; facts: CubeFact[] }>()
const busy = ref(false)
const error = ref('')
const rowAxis = ref<CubeDimension>('city')
const colAxis = ref<CubeDimension>('direction')
const layerAxis = ref<CubeDimension>('period')
const activeLayer = ref<string | null>(null)
const metric = ref<CubeMetric>('net')
const filters = reactive<CubeFilters>({})
const expandedCities = ref(new Set<string>())
const rowPage = ref(1)
const colPage = ref(1)
const rowSize = 16
const colSize = 8
const detailSize = 10
const detailPage = ref(1)
const detailOpen = ref(false)
const detail = shallowRef<{ title: string; facts: CubeFact[] }>()
const emptyPeriods = new Map<string, string>()

const loadedPeriods = computed(() => snapshot.value?.periods ?? emptyPeriods)
const facts = computed(() => snapshot.value?.facts ?? [])
const pending = computed(() => snapshot.value && (
  selectedPeriods.value.length !== loadedPeriods.value.size || selectedPeriods.value.some(code => !loadedPeriods.value.has(code))
))
const members = computed(() => Object.fromEntries(dimensionKeys.map(key => [key, cubeMembers(facts.value, key, loadedPeriods.value)])) as Record<CubeDimension, ReturnType<typeof cubeMembers>>)
const filteredFacts = computed(() => filterCube(facts.value, filters, loadedPeriods.value))
const availableLayers = computed(() => {
  const axis = layerAxis.value
  const selected = filters[axis]
  return cubeMembers(filteredFacts.value, axis, loadedPeriods.value).filter(item => !selected?.length || selected.includes(item.value))
})
const layerTotals = computed(() => cubeLayerTotals(filteredFacts.value, layerAxis.value, loadedPeriods.value))
const allLayersTotal = computed(() => aggregateCube(filteredFacts.value))
const layerCards = computed(() => {
  const cards = availableLayers.value.slice(0, 4)
  const active = availableLayers.value.find(item => item.value === activeLayer.value)
  return active && !cards.includes(active) ? [...cards.slice(0, 3), active] : cards
})
const activePlane = computed(() => {
  const index = availableLayers.value.findIndex(item => item.value === activeLayer.value)
  if (index < 0) return null
  const depth = availableLayers.value.length === 1 ? 11 : 22 * index / (availableLayers.value.length - 1)
  return `30,${47 + depth} 91,${12 + depth} 151,${47 + depth} 91,${82 + depth}`
})
const scopedFacts = computed(() => filteredFacts.value.filter(fact => activeLayer.value === null
  || cubeMember(fact, layerAxis.value, loadedPeriods.value).value === activeLayer.value))
const matrix = computed(() => buildCube(scopedFacts.value,
  { dimension: rowAxis.value, expandedCities: expandedCities.value },
  { dimension: colAxis.value, expandedCities: expandedCities.value }, loadedPeriods.value))
function filterHeaders(headers: CubeHeader[], dimension: CubeDimension) {
  const selected = filters[dimension]
  return selected?.length ? headers.filter(header => selected.includes(header.city ?? header.value)) : headers
}
const visibleRows = computed(() => filterHeaders(matrix.value.rows, rowAxis.value))
const visibleCols = computed(() => filterHeaders(matrix.value.columns, colAxis.value))
const rows = computed(() => visibleRows.value.slice((rowPage.value - 1) * rowSize, rowPage.value * rowSize))
const columns = computed(() => visibleCols.value.slice((colPage.value - 1) * colSize, colPage.value * colSize))
const details = computed(() => detail.value?.facts.slice((detailPage.value - 1) * detailSize, detailPage.value * detailSize) ?? [])
const mockSnapshot = computed(() => demoCodes.value.some(code => loadedPeriods.value.has(code)))
const number = new Intl.NumberFormat('zh-CN')

function format(value: number | null) {
  if (value === null) return '—'
  return metric.value === 'rate' ? percentText(value) : number.format(value)
}

function value(row?: CubeHeader, col?: CubeHeader) {
  return cubeValue(matrix.value.cell(row?.key, col?.key), metric.value)
}

function cellTone(row: CubeHeader, col: CubeHeader) {
  const result = value(row, col)
  if (result === null) return 'cell-empty'
  if (metric.value !== 'net' && metric.value !== 'rate') return ''
  return result < 0 ? 'cell-negative' : result > 0 ? 'cell-positive' : ''
}

function transpose() {
  const previous = rowAxis.value
  rowAxis.value = colAxis.value
  colAxis.value = previous
}

function chooseAxis(axis: 'row' | 'col' | 'layer', event: Event) {
  const dimension = (event.target as HTMLSelectElement).value as CubeDimension
  const axes = { row: rowAxis, col: colAxis, layer: layerAxis }
  const current = axes[axis]
  const occupied = Object.values(axes).find(other => other !== current && other.value === dimension)
  if (occupied) occupied.value = current.value
  current.value = dimension
}

function toggleCity(city: string) {
  const expanded = new Set(expandedCities.value)
  if (expanded.has(city)) expanded.delete(city)
  else expanded.add(city)
  expandedCities.value = expanded
}

function clearFilters() {
  for (const key of dimensionKeys) delete filters[key]
  activeLayer.value = null
  expandedCities.value = new Set()
}

function inspect(row?: CubeHeader, col?: CubeHeader) {
  const items = scopedFacts.value.filter(fact => matchesHeader(fact, rowAxis.value, row, loadedPeriods.value)
    && matchesHeader(fact, colAxis.value, col, loadedPeriods.value))
  if (!items.length) return
  detail.value = { title: [row?.label, col?.label].filter(Boolean).join(' / ') || '合计', facts: items }
  detailPage.value = 1
  detailOpen.value = true
}

async function load() {
  if (busy.value) return
  const wanted = new Set(canReadPeriods.value ? selectedPeriods.value : manualPeriods.value.split(/[,，\s]+/).filter(Boolean))
  const selection = canReadPeriods.value
    ? new Map(periods.value.filter(period => wanted.has(period.code)).map(period => [period.code, period.label]))
    : new Map([...wanted].map(code => [code, code]))
  error.value = ''
  busy.value = true
  try {
    const rows = await loadOlapFacts([...selection.keys()], auth.token!)
    snapshot.value = { periods: selection, facts: rows }
    clearFilters()
  } catch (cause) { error.value = (cause as Error).message }
  finally { busy.value = false }
}

function loadDemo() {
  selectedPeriods.value = [...demoCodes.value]
  void load()
}

async function initialize() {
  if (busy.value) return
  if (!canReadPeriods.value) {
    if (typeof route.query.periodCode === 'string') {
      manualPeriods.value = route.query.periodCode
      await load()
    }
    return
  }
  error.value = ''
  busy.value = true
  try {
    const options = await listOlapPeriods(auth.token!)
    periods.value = options.periods
    demoCodes.value = options.demoCodes
    const requested = typeof route.query.periodCode === 'string' && periods.value.find(period => period.code === route.query.periodCode)
    const fallback = [...periods.value].reverse().find(period => period.windowStatus === 'OPEN' || period.windowStatus === 'CLOSED') ?? periods.value.at(-1)
    selectedPeriods.value = requested ? [requested.code] : demoCodes.value.length ? [...demoCodes.value] : fallback ? [fallback.code] : []
  } catch (cause) { error.value = (cause as Error).message }
  finally { busy.value = false }
  if (selectedPeriods.value.length) await load()
}

watch(layerAxis, () => { activeLayer.value = null })
watch(availableLayers, items => {
  if (activeLayer.value !== null && !items.some(item => item.value === activeLayer.value)) activeLayer.value = null
})
watch([rowAxis, colAxis, activeLayer, filters, snapshot], () => { rowPage.value = colPage.value = 1 }, { deep: true })
watch(expandedCities, () => {
  rowPage.value = Math.min(rowPage.value, Math.max(1, Math.ceil(visibleRows.value.length / rowSize)))
  colPage.value = Math.min(colPage.value, Math.max(1, Math.ceil(visibleCols.value.length / colSize)))
})
onMounted(initialize)
</script>

<template>
  <section class="olap-page">
    <div class="page-heading">
      <div><h1>多维分析</h1><p>按调查期、城市、企业和人员变动等维度探索就业数据立方体。</p></div>
      <el-tag v-if="mockSnapshot" type="warning">本地演示样本</el-tag>
    </div>

    <section class="olap-source" aria-labelledby="olap-source-title">
      <div><h2 id="olap-source-title">分析范围</h2><p>每家企业每期取最新、省审通过且未作废的报表，人数使用当前有效值。</p></div>
      <el-form class="source-form" label-position="top" @submit.prevent="load">
        <el-form-item label="调查期（可多选）">
          <el-select-v2 v-if="canReadPeriods" v-model="selectedPeriods" :options="periods.map(period => ({ label: period.label, value: period.code }))"
            multiple filterable clearable collapse-tags :max-collapse-tags="2" :multiple-limit="cubePeriodLimit"
            :disabled="busy || !periods.length" placeholder="选择调查期" />
          <el-input v-else v-model.trim="manualPeriods" placeholder="输入调查期代码，以逗号或空格分隔" />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="busy" :disabled="canReadPeriods ? !selectedPeriods.length : !manualPeriods">载入数据</el-button>
      </el-form>
      <div v-if="snapshot || demoCodes.length" class="source-status">
        <p v-if="snapshot" role="status">已载入 {{ loadedPeriods.size }} 期、{{ number.format(facts.length) }} 条报表<span v-if="pending">。期次选择有变动，点击「载入数据」应用。</span></p>
        <el-button v-if="demoCodes.length && (!mockSnapshot || pending)" link type="primary" :disabled="busy" @click="loadDemo">载入演示样本</el-button>
      </div>
      <p v-else-if="canReadPeriods && !busy && !periods.length && !error" class="source-status">暂无可分析调查期。<el-button link type="primary" @click="initialize">重新读取调查期</el-button></p>
      <div v-if="error" class="source-error">
        <el-alert :title="error" type="error" show-icon :closable="false" />
        <el-button v-if="!periods.length" :disabled="busy" @click="initialize">重新读取调查期</el-button>
        <p v-if="snapshot">立方体仍显示上一次完整载入的数据。</p>
      </div>
    </section>

    <section v-if="snapshot" class="cube-workspace" :aria-busy="busy" aria-labelledby="cube-title">
      <div class="cube-toolbar">
        <div><h2 id="cube-title">就业数据立方体</h2><p>选取行、列和切片维度。点击城市名称展开企业，点击数值查看报表。</p></div>
        <el-button :disabled="busy" @click="clearFilters">清除筛选与切片</el-button>
      </div>
      <div class="cube-fields">
        <label>行维度<select :value="rowAxis" :disabled="busy" @change="chooseAxis('row', $event)"><option v-for="key in dimensionKeys" :key="key" :value="key">{{ cubeDimensions[key] }}</option></select></label>
        <label>列维度<select :value="colAxis" :disabled="busy" @change="chooseAxis('col', $event)"><option v-for="key in dimensionKeys" :key="key" :value="key">{{ cubeDimensions[key] }}</option></select></label>
        <el-button class="transpose" :disabled="busy" @click="transpose">交换行列</el-button>
        <label>切片维度<select :value="layerAxis" :disabled="busy" @change="chooseAxis('layer', $event)"><option v-for="key in dimensionKeys" :key="key" :value="key">{{ cubeDimensions[key] }}</option></select></label>
        <label>度量<select v-model="metric" :disabled="busy"><option v-for="key in metricKeys" :key="key" :value="key">{{ cubeMetrics[key][0] }}</option></select></label>
      </div>
      <details class="cube-filters">
        <summary>维度筛选 <span v-if="Object.values(filters).some(values => values?.length)">（已应用）</span></summary>
        <el-form label-position="top" class="facet-grid" :disabled="busy">
          <el-form-item v-for="key in dimensionKeys" :key="key" :label="cubeDimensions[key]">
            <el-select-v2 v-model="filters[key]" :options="members[key]" multiple filterable clearable collapse-tags placeholder="全部" />
          </el-form-item>
        </el-form>
      </details>

      <div class="cube-body">
        <aside class="cube-slices" aria-label="立方体切片">
          <div class="cube-graphic" aria-hidden="true">
            <svg viewBox="0 0 180 106">
              <path d="M30 47 91 12l60 35-60 35z M30 47v22l61 35 60-35V47 M91 82v22" class="cube-outline" />
              <path d="M30 55 91 90l60-35 M30 62l61 35 60-35 M60 30l61 35v21 M121 30 60 65v21" class="cube-grid-lines" />
              <polygon v-if="activePlane" :points="activePlane" class="cube-selected" />
            </svg>
          </div>
          <h3>按{{ cubeDimensions[layerAxis] }}切片</h3>
          <button type="button" class="slice-button" :aria-pressed="activeLayer === null" :disabled="busy" @click="activeLayer = null"><span>全部层</span><strong>{{ format(cubeValue(allLayersTotal, metric)) }}</strong></button>
          <button v-for="item in layerCards" :key="item.value" type="button" class="slice-button" :aria-pressed="activeLayer === item.value" :disabled="busy" @click="activeLayer = item.value">
            <span :title="item.label">{{ item.label }}</span><strong>{{ format(cubeValue(layerTotals.get(item.value), metric)) }}</strong>
          </button>
          <el-select-v2 v-if="availableLayers.length > 4" :model-value="activeLayer ?? undefined" :options="availableLayers" filterable
            placeholder="查找其他切片" aria-label="查找其他切片" :disabled="busy" @change="activeLayer = $event" />
        </aside>

        <div class="cube-result">
          <div class="matrix-title">
            <div><h3>{{ cubeDimensions[rowAxis] }} × {{ cubeDimensions[colAxis] }}</h3><p>{{ cubeMetrics[metric][0] }}（{{ cubeMetrics[metric][1] }}） · {{ availableLayers.find(item => item.value === activeLayer)?.label ?? '全部层' }}</p></div>
            <span>{{ number.format(scopedFacts.length) }} 条样本</span>
          </div>
          <div v-if="scopedFacts.length" class="matrix-scroll" role="region" aria-label="透视表，可横向滚动" tabindex="0">
            <table class="pivot-table">
              <thead><tr>
                <th scope="col" class="pivot-label">{{ cubeDimensions[rowAxis] }} / {{ cubeDimensions[colAxis] }}</th>
                <th v-for="col in columns" :key="col.key" scope="col" :class="{ 'pivot-subtotal': col.subtotal }">
                  <button v-if="colAxis === 'city' && col.city === undefined" type="button" class="pivot-expand" :aria-expanded="!!col.subtotal" :disabled="busy" @click="toggleCity(col.value)">{{ col.subtotal ? '−' : '+' }} {{ col.label }}<span v-if="col.subtotal">小计</span></button>
                  <span v-else>{{ col.label }}</span>
                </th>
                <th scope="col" class="pivot-total">合计</th>
              </tr></thead>
              <tbody><tr v-for="row in rows" :key="row.key">
                <th scope="row" class="pivot-label" :class="{ 'pivot-subtotal': row.subtotal, 'pivot-child': row.city !== undefined }">
                  <button v-if="rowAxis === 'city' && row.city === undefined" type="button" class="pivot-expand" :aria-expanded="!!row.subtotal" :disabled="busy" @click="toggleCity(row.value)">{{ row.subtotal ? '−' : '+' }} {{ row.label }}<span v-if="row.subtotal">小计</span></button>
                  <span v-else>{{ row.label }}</span>
                </th>
                <td v-for="col in columns" :key="col.key" :class="cellTone(row, col)">
                  <button v-if="matrix.cell(row.key, col.key)" type="button" class="pivot-cell" :aria-label="`${row.label}，${col.label}，${format(value(row,col))}，查看报表`" :disabled="busy" @click="inspect(row, col)">{{ format(value(row, col)) }}</button>
                  <span v-else>—</span>
                </td>
                <td class="pivot-total">{{ format(value(row)) }}</td>
              </tr></tbody>
              <tfoot><tr><th scope="row" class="pivot-label">合计</th><td v-for="col in columns" :key="col.key">{{ format(value(undefined, col)) }}</td><td>{{ format(value()) }}</td></tr></tfoot>
            </table>
          </div>
          <el-empty v-else description="当前切片或筛选范围没有合格样本" :image-size="64" />
          <div class="matrix-pages">
            <div v-if="visibleRows.length > rowSize"><span>行</span><el-pagination v-model:current-page="rowPage" :total="visibleRows.length" :page-size="rowSize" layout="prev, pager, next" :pager-count="5" small /></div>
            <div v-if="visibleCols.length > colSize"><span>列</span><el-pagination v-model:current-page="colPage" :total="visibleCols.length" :page-size="colSize" layout="prev, pager, next" :pager-count="5" small /></div>
          </div>
          <p class="cube-note">「—」表示无样本或建档人数为零时的占比。跨期岗位人数为各期累计人次，企业按编号去重，占比按汇总净变化除以汇总建档岗位计算。</p>
        </div>
      </div>
    </section>
    <p class="cube-limit">每次可载入 {{ cubePeriodLimit }} 个调查期、{{ number.format(cubeFactLimit) }} 条报表。报表修订或作废后，点击「载入数据」重新计算。</p>

    <el-dialog v-model="detailOpen" :title="`单元格报表明细 / ${detail?.title ?? ''}`" width="min(920px, 94vw)">
      <p>共 {{ detail?.facts.length ?? 0 }} 条报表。</p>
      <el-table :data="details" row-key="reportId">
        <el-table-column label="企业" prop="enterpriseName" min-width="155" />
        <el-table-column label="调查期" min-width="145"><template #default="{ row }">{{ loadedPeriods.get(row.periodCode) }}</template></el-table-column>
        <el-table-column label="所属市" prop="cityName" min-width="100" />
        <el-table-column label="行业" prop="industryName" min-width="110" />
        <el-table-column label="企业性质" min-width="115"><template #default="{ row }">{{ row.natureName || row.natureCode || '分类未记录' }}</template></el-table-column>
        <el-table-column label="建档岗位" prop="baselineEmploymentCount" width="100" align="right" />
        <el-table-column label="调查岗位" prop="periodEmploymentCount" width="100" align="right" />
        <el-table-column label="净变化" prop="netChange" width="85" align="right" />
        <el-table-column label="人员变动" width="100"><template #default="{ row }">{{ directionLabels[row.changeDirection as keyof typeof directionLabels] }}</template></el-table-column>
        <el-table-column label="建档来源期" min-width="120"><template #default="{ row }">{{ row.baselineSourcePeriodCode ?? '—' }}</template></el-table-column>
        <el-table-column label="报表" width="95"><template #default="{ row }"><router-link v-if="!demoCodes.includes(row.periodCode) && auth.can('PROVINCE.DATA.READ')" :to="'/province/data/reports/' + encodeURIComponent(row.reportId)">追溯报表</router-link><span v-else>{{ demoCodes.includes(row.periodCode) ? '演示' : '—' }}</span></template></el-table-column>
      </el-table>
      <el-pagination v-if="(detail?.facts.length ?? 0) > detailSize" v-model:current-page="detailPage" :total="detail?.facts.length" :page-size="detailSize" layout="total, prev, pager, next" />
    </el-dialog>
  </section>
</template>

<style scoped>
.olap-page { min-width: 0; }
.olap-page h2 { margin: 0; }
.olap-page h3 { margin: 0; }
.olap-source, .cube-workspace { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.olap-source { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.3fr); gap: 10px 24px; padding: 18px 20px; border-inline-start: 3px solid var(--accent); }
.olap-source p, .cube-toolbar p, .matrix-title p { margin: 3px 0 0; color: var(--muted); }
.source-form { display: flex; align-items: flex-end; gap: 10px; min-width: 0; }
.source-form .el-form-item { flex: 1; min-width: 0; margin: 0; }
.source-status, .source-error { grid-column: 1 / -1; font-size: 13px; }
.source-status { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.source-error .el-button { margin-top: 8px; }
.cube-workspace { margin-top: 16px; }
.cube-toolbar { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; padding: 18px 20px 14px; }
.cube-fields { display: grid; grid-template-columns: minmax(115px, 1fr) minmax(115px, 1fr) auto minmax(115px, 1fr) minmax(145px, 1.25fr); gap: 10px; align-items: end; padding: 0 20px 16px; }
.cube-fields label { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: 13px; }
.cube-fields select { min-width: 0; height: 32px; padding: 0 7px; border: 1px solid var(--el-border-color); border-radius: 4px; background: var(--surface); color: var(--ink); font: inherit; }
.cube-fields select:focus-visible, .matrix-scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cube-filters { border-block: 1px solid var(--line); padding: 0 20px; }
.cube-filters summary { width: fit-content; padding: 9px 0; cursor: pointer; color: var(--accent); font-weight: 600; }
.cube-filters summary span { font-weight: 400; }
.facet-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 0 14px; }
.cube-body { display: grid; grid-template-columns: 226px minmax(0, 1fr); }
.cube-slices { min-width: 0; padding: 16px 14px; background: var(--canvas); border-inline-end: 1px solid var(--line); border-radius: 0 0 0 8px; }
.cube-graphic { max-width: 145px; margin: 0 auto 10px; }
.cube-graphic svg { display: block; width: 100%; }
.cube-outline { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.4; }
.cube-grid-lines { fill: none; stroke: #77a7b7; stroke-width: 1; }
.cube-selected { fill: #c6dce3; fill-opacity: .85; stroke: var(--accent); stroke-width: 1.5; }
.cube-slices h3 { font-size: 14px; margin-bottom: 9px; }
.slice-button { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; width: 100%; padding: 8px; border: 0; border-inline-start: 3px solid transparent; border-radius: 4px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.slice-button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slice-button strong { flex: none; }
.slice-button:hover, .slice-button[aria-pressed='true'] { background: var(--accent-soft); }
.slice-button[aria-pressed='true'] { color: var(--accent); border-inline-start-color: var(--accent); font-weight: 700; }
.cube-slices .el-select { margin-top: 8px; }
.cube-result { min-width: 0; padding: 16px 20px 14px; }
.matrix-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; margin-bottom: 12px; }
.matrix-title > span { color: var(--muted); font-size: 13px; }
.matrix-scroll { max-width: 100%; overflow-x: auto; border: 1px solid var(--line); border-radius: 5px; }
.pivot-table { width: 100%; border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; }
.pivot-table :is(th, td) { padding: 8px 11px; border-bottom: 1px solid var(--line); min-width: 74px; text-align: right; }
.pivot-table :is(thead, tfoot), .pivot-table .pivot-subtotal, .pivot-table .pivot-total { background: var(--canvas); font-weight: 700; }
.pivot-table .pivot-label { position: sticky; inset-inline-start: 0; z-index: 1; min-width: 128px; max-width: 190px; text-align: left; background: var(--surface); overflow-wrap: anywhere; border-inline-end: 1px solid var(--line); }
.pivot-table :is(thead, tfoot) .pivot-label, .pivot-table .pivot-subtotal { background: var(--canvas); }
.pivot-table .pivot-child { padding-inline-start: 22px; color: var(--muted); font-weight: 400; }
.pivot-expand, .pivot-cell { border: 0; background: transparent; color: inherit; padding: 1px 3px; font: inherit; cursor: pointer; }
.pivot-expand { text-align: inherit; color: var(--accent); }
.pivot-expand span { margin-inline-start: 5px; color: var(--muted); font-size: 12px; }
.pivot-cell { text-decoration: underline dotted; text-underline-offset: 4px; }
.pivot-cell:hover, .pivot-expand:hover { color: var(--accent); }
.pivot-cell:focus-visible, .pivot-expand:focus-visible { outline-offset: 1px; }
.pivot-table .cell-positive { background: #e5f2f6; color: #176781; }
.pivot-table .cell-negative { background: #fff3e3; color: #875017; }
.pivot-table .cell-empty { color: var(--muted); }
.pivot-table tfoot td, .pivot-table tfoot th { border-bottom: 0; }
.matrix-pages, .matrix-pages > div { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; }
.matrix-pages .el-pagination { margin: 8px 0 0; }
.cube-note, .cube-limit { color: var(--muted); font-size: 13px; }
.cube-note { margin: 12px 0 0; }
.cube-limit { margin: 10px 0; }

@media (max-width: 1040px) {
  .cube-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .transpose { justify-self: start; }
}
@media (max-width: 680px) {
  .olap-source, .cube-body { grid-template-columns: minmax(0, 1fr); }
  .olap-source, .cube-toolbar, .cube-result { padding: 14px; }
  .cube-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-inline: 14px; }
  .transpose { grid-row: 3; }
  .cube-filters { padding-inline: 14px; }
  .cube-slices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; border-inline-end: 0; border-bottom: 1px solid var(--line); border-radius: 0; }
  .cube-graphic { display: none; }
  .cube-slices h3 { grid-column: 1 / -1; }
  .slice-button { padding: 5px; }
}
</style>
