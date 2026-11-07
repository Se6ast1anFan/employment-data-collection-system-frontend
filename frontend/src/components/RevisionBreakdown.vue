<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import RegionPicker from '@/components/RegionPicker.vue'
import { useAuthStore } from '@/stores/auth'
import { revisionProvider as api } from '@/services/revision'
import { ApiError } from '@/services/api'
import { chartGeometry } from '@/utils/chart'
import { percentText } from '@/utils/week6'
import { directionLabels, groupLabels } from '@/utils/revision'
import type { SurveyPeriod } from '@/types/report'
import type { AnalysisFilters } from '@/types/week6'
import type { BreakdownResult, BreakdownRow, ChangeDirection, EnterpriseAnalysisQuery, EnterpriseAnalysisResult, GroupBy } from '@/types/revision'

const props = defineProps<{ periods: SurveyPeriod[]; initialPeriod: string }>()
const emit = defineEmits<{ selectEnterprise: [orgId: string, periodCode: string, filters: Partial<AnalysisFilters>] }>()
const auth = useAuthStore()
const period = ref(props.initialPeriod)
const second = ref('')
const groupBy = ref<GroupBy>('CHANGE_DIRECTION')
const filters = reactive<Partial<AnalysisFilters>>({})
const direction = ref<ChangeDirection>()
const groups = ref<BreakdownResult[]>([])
const details = ref<EnterpriseAnalysisResult>()
const detailQuery = ref<EnterpriseAnalysisQuery>()
const selectedGroup = ref('')
const detailPage = ref(1)
const busy = ref(false)
const error = ref('')
const detailError = ref('')
const fieldErrors = ref<Record<string,string>>({})
const attrs = { natureParentCode: '性质父级代码', natureCode: '性质子级代码', industryParentCode: '行业父级代码', industryCode: '行业子级代码' } as const
const columns = {
  enterpriseCount: '企业数', baselineEmploymentTotal: '建档人数', periodEmploymentTotal: '调查人数',
  increaseTotal: '增员人数', reductionTotal: '减员人数', netChange: '净变化', changePercent: '变化占比',
  increaseEnterpriseCount: '增员企业', unchangedEnterpriseCount: '不变企业', decreaseEnterpriseCount: '减员企业',
} as const
type Metric = keyof typeof columns
const metric = ref<Metric>('enterpriseCount')
const colors = ['#2468ad', '#c96837']
const aligned = computed(() => {
  const codes = new Map<string, string>()
  for (const result of groups.value) for (const row of result.items) codes.set(row.groupCode, row.groupName)
  return [...codes].map(([code, name]) => ({ code, name, rows: groups.value.map(result => result.items.find(row => row.groupCode === code)) }))
})
const barSlots = computed(() => aligned.value.flatMap(group => group.rows.map((row, series) => ({
  row, series, label: group.name, value: row?.[metric.value] ?? null,
  periodCode: groups.value[series]!.periodCode,
}))))
const geometry = computed(() => chartGeometry(barSlots.value))
function metricText(value: number | null, key: Metric) {
  return key === 'changePercent' ? percentText(value) : value ?? '—'
}
function reset() {
  groups.value = []
  details.value = detailQuery.value = undefined
  selectedGroup.value = detailError.value = error.value = ''
  fieldErrors.value = {}
}
watch([period, second, groupBy, filters, direction], reset, { deep: true, flush: 'sync' })

function detailFilters(): Partial<AnalysisFilters> {
  return Object.fromEntries(Object.entries(filters).map(([key,value]) => [key, value?.trim() || undefined]))
}
async function queryGroups() {
  if (busy.value) return
  reset()
  if (!period.value) { error.value = '请选择调查期'; return }
  if (second.value === period.value) { error.value = '请选择不同的对比期次'; return }
  const codes = second.value ? [period.value, second.value] : [period.value]
  busy.value = true
  try {
    groups.value = (await Promise.all(codes.map(periodCode => api.breakdown({ ...detailFilters(), periodCode, groupBy: groupBy.value }, auth.token!)))).map(r => r.data)
  } catch (e) {
    error.value = (e as Error).message
    if (e instanceof ApiError) fieldErrors.value = e.fieldErrors
  } finally { busy.value = false }
}
async function loadDetails(query: EnterpriseAnalysisQuery) {
  if (busy.value) return
  busy.value = true
  detailError.value = ''
  try {
    const data = (await api.enterprises(query, auth.token!)).data
    details.value = data
    detailPage.value = data.page + 1
    detailQuery.value = query
  } catch (e) {
    details.value = detailQuery.value = undefined
    detailError.value = (e as Error).message
    if (e instanceof ApiError) fieldErrors.value = e.fieldErrors
  } finally { busy.value = false }
}
function queryDetails() {
  if (busy.value) return
  if (!period.value) { detailError.value = '请选择调查期'; return }
  selectedGroup.value = ''
  void loadDetails({ ...detailFilters(), periodCode: period.value, changeDirection: direction.value, page: 0, size: 20 })
}
function drill(row: BreakdownRow, code: string, series: number) {
  if (busy.value) return
  const response = groups.value[series]
  if (!response) return
  const { enterpriseOrgId: _, ...applied } = response.filters
  const q: EnterpriseAnalysisQuery = { ...applied, periodCode: code, page: 0, size: 20 }
  switch (response.groupBy) {
    case 'CITY': q.regionCode = row.groupCode; break
    case 'NATURE': q.natureCode = row.groupCode; break
    case 'INDUSTRY': q.industryCode = row.groupCode; break
    case 'CHANGE_DIRECTION':
      if (!Object.hasOwn(directionLabels, row.groupCode)) { detailError.value = '此分组未返回可识别的变动类型'; return }
      q.changeDirection = row.groupCode as ChangeDirection
  }
  selectedGroup.value = row.groupName
  void loadDetails(q)
}
function changePage(page: number) {
  if (detailQuery.value && page !== details.value!.page + 1) void loadDetails({ ...detailQuery.value, page: page - 1 })
}
function chooseEnterprise(orgId: string) {
  if (!detailQuery.value) return
  const { periodCode, page: _, size: __, changeDirection: ___, ...sample } = detailQuery.value
  emit('selectEnterprise', orgId, periodCode, sample)
}
</script>

<template>
  <el-card shadow="never" v-loading="busy">
    <el-form label-position="top" class="filters" :disabled="busy">
      <el-form-item label="调查期"><el-select v-model="period" placeholder="请选择调查期"><el-option v-for="p in periods" :key="p.code" :value="p.code" :label="p.label" /></el-select></el-form-item>
      <el-form-item label="第二调查期（分组对比）"><el-select v-model="second" clearable placeholder="留空查看单期"><el-option v-for="p in periods" :key="p.code" :value="p.code" :label="p.label" /></el-select></el-form-item>
      <el-form-item label="按维度分组"><el-select v-model="groupBy"><el-option v-for="(label,key) in groupLabels" :key="key" :value="key" :label="label" /></el-select></el-form-item>
      <el-form-item label="所属市" :error="fieldErrors.regionCode"><RegionPicker v-model="filters.regionCode" :disabled="busy" any-level :select-level="2" /></el-form-item>
      <el-form-item v-for="(label,key) in attrs" :key="key" :label="label" :error="fieldErrors[key]"><el-input v-model.trim="filters[key]" clearable maxlength="64" placeholder="留空表示不限" /></el-form-item>
      <el-form-item label="企业编号（明细筛选）" :error="fieldErrors.enterpriseOrgId"><el-input v-model.trim="filters.enterpriseOrgId" clearable placeholder="留空表示不限" /></el-form-item>
      <el-form-item label="人员变动（明细筛选）"><el-select v-model="direction" clearable><el-option v-for="(label,key) in directionLabels" :key="key" :value="key" :label="label" /></el-select></el-form-item>
    </el-form>
    <div class="form-actions">
      <el-button type="primary" :disabled="busy" @click="queryGroups">查询分组</el-button>
      <el-button :disabled="busy" @click="queryDetails">查询企业明细</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="groups.length">
      <h2>{{ groupLabels[groupBy] }}分组</h2>
      <el-empty v-if="!aligned.length" description="所选调查期没有合格样本" />
      <template v-else>
        <el-form inline><el-form-item label="柱图指标"><el-select v-model="metric" style="width:180px"><el-option v-for="(label,key) in columns" :key="key" :value="key" :label="label" /></el-select></el-form-item></el-form>
        <ul class="legend"><li v-for="(item,i) in groups" :key="item.periodCode"><span :style="{backgroundColor:colors[i]}" />{{ item.periodCode }}</li></ul>
        <div class="chart">
          <svg :viewBox="`0 0 ${geometry.width} ${geometry.height}`" :style="{minWidth:geometry.width+'px'}" role="group" :aria-label="columns[metric]+'分组柱状图'">
            <line x1="65" :x2="geometry.width-30" :y1="geometry.zero" :y2="geometry.zero" stroke="#7a8898" />
            <g v-for="(bar,i) in barSlots" :key="i">
              <rect v-if="bar.value !== null && bar.row" tabindex="0" role="button"
                :aria-label="`${bar.label} ${bar.periodCode} ${columns[metric]} ${metricText(bar.value,metric)}，查看企业明细`"
                :x="geometry.x(i)-14" :y="Math.min(geometry.zero, geometry.y(bar.value))" width="28"
                :height="Math.max(2,Math.abs(geometry.zero-geometry.y(bar.value)))" :fill="colors[bar.series]"
                @click="drill(bar.row,bar.periodCode,bar.series)" @keydown.enter.prevent="drill(bar.row,bar.periodCode,bar.series)" @keydown.space.prevent="drill(bar.row,bar.periodCode,bar.series)" />
              <text :x="geometry.x(i)" :y="bar.value === null ? geometry.zero-10 : Math.min(geometry.zero,geometry.y(bar.value))-8" text-anchor="middle">{{ metricText(bar.value,metric) }}</text>
              <text v-if="i%groups.length===0" :x="geometry.x(i)+(groups.length>1?(geometry.x(i+1)-geometry.x(i))/2:0)" y="252" text-anchor="middle">{{ bar.label }}</text>
            </g>
          </svg>
        </div>
        <el-table :data="aligned" row-key="code">
          <el-table-column label="分组" prop="name" min-width="140" fixed />
          <el-table-column v-for="(response,i) in groups" :key="response.periodCode" :label="response.periodCode">
            <el-table-column v-for="(label,key) in columns" :key="key" :label="label" width="105">
              <template #default="{ row }">{{ row.rows[i] ? metricText(row.rows[i][key],key) : '—' }}</template>
            </el-table-column>
            <el-table-column label="下钻" width="110"><template #default="{ row }"><el-button v-if="row.rows[i]" link type="primary" :disabled="busy" @click="drill(row.rows[i],response.periodCode,i)">企业明细</el-button></template></el-table-column>
          </el-table-column>
        </el-table>
      </template>
    </template>
    <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
    <template v-if="details">
      <h2>企业明细 · {{ details.periodCode }}{{ selectedGroup ? ' · '+selectedGroup : '' }}</h2>
      <el-table :data="details.items" empty-text="当前条件无合格企业样本">
        <el-table-column prop="enterpriseName" label="企业" min-width="150" />
        <el-table-column prop="enterpriseOrgId" label="企业编号" />
        <el-table-column prop="cityName" label="所属市" />
        <el-table-column prop="natureName" label="企业性质" />
        <el-table-column prop="industryName" label="所属行业" />
        <el-table-column prop="baselineSourcePeriodCode" label="建档来源期" min-width="140" />
        <el-table-column prop="baselineEmploymentCount" label="建档人数" />
        <el-table-column prop="periodEmploymentCount" label="调查人数" />
        <el-table-column prop="netChange" label="净变化" />
        <el-table-column label="变化占比"><template #default="{ row }">{{ percentText(row.changePercent) }}</template></el-table-column>
        <el-table-column label="人员变动"><template #default="{ row }">{{ directionLabels[row.changeDirection as ChangeDirection] }}</template></el-table-column>
        <el-table-column label="主要原因" min-width="150"><template #default="{ row }">{{ [row.primaryReasonCode,row.primaryReasonDetail].filter(Boolean).join(' · ') || '—' }}</template></el-table-column>
        <el-table-column label="操作" fixed="right" width="170"><template #default="{ row }">
          <router-link :to="'/province/data/reports/'+encodeURIComponent(row.reportId)">报表追溯</router-link>
          <el-button link type="primary" @click="chooseEnterprise(row.enterpriseOrgId)">比较此企业</el-button>
        </template></el-table-column>
      </el-table>
      <el-pagination v-model:current-page="detailPage" :total="details.total" :page-size="20" :disabled="busy" layout="total,prev,pager,next" @current-change="changePage" />
    </template>
  </el-card>
</template>

<style scoped>
.filters { display: grid; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); gap: 0 16px; }
.chart { overflow-x: auto; border: 1px solid #e5e8ee; border-radius: 6px; margin: 12px 0; }
svg { display: block; width: 100%; font-size: 13px; }
rect { cursor: pointer; }
text { pointer-events: none; }
.legend { display: flex; gap: 18px; list-style: none; padding: 0; }
.legend span { display: inline-block; width: 12px; height: 12px; margin-right: 6px; }
</style>
