<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { revisionProvider } from '@/services/revision'
import { reportProvider } from '@/services/report'
import { useAuthStore } from '@/stores/auth'
import { formatBeijingTime } from '@/utils/filing'
import { orderedPeriods } from '@/utils/week6'
import { filingProgressLabels, reportProgressLabels, reportFilterLabels, reportFilterStates } from '@/utils/revision'
import type { FilingProgressStatus, ProgressQuery, ProgressResult, ReportProgressFilter } from '@/types/revision'
import type { SurveyPeriod } from '@/types/report'
import RegionPicker from '@/components/RegionPicker.vue'
import CoverageMeter from '@/components/CoverageMeter.vue'

const route = useRoute(), auth = useAuthStore()
const periods = ref<SurveyPeriod[]>([])
const periodCode = ref(typeof route.query.periodCode === 'string' ? route.query.periodCode : '')
const cityCode = ref<string | null>(typeof route.query.cityCode === 'string' ? route.query.cityCode : null)
const filingStatus = ref<FilingProgressStatus>()
const reportStatus = ref<ReportProgressFilter>()
const result = ref<ProgressResult>()
const applied = ref<ProgressQuery>()
const page = ref(1)
const busy = ref(false)
const error = ref('')

async function query(reset = true) {
  if (busy.value || !periodCode.value) return
  const q: ProgressQuery = reset
    ? { periodCode: periodCode.value, cityCode: cityCode.value, filingStatus: filingStatus.value, reportStatus: reportStatus.value, page: 0, size: 20 }
    : { ...applied.value!, page: page.value - 1 }
  busy.value = true
  error.value = ''
  try {
    const data = (await revisionProvider.progress(q, auth.token!)).data
    result.value = data
    applied.value = q
    page.value = data.page + 1
  } catch (e) {
    result.value = undefined
    applied.value = undefined
    error.value = (e as Error).message
  } finally { busy.value = false }
}
function filingOnly(status?: FilingProgressStatus) {
  filingStatus.value = status
  reportStatus.value = undefined
  void query()
}
function reportOnly(status: ReportProgressFilter) {
  filingStatus.value = undefined
  reportStatus.value = status
  void query()
}
onMounted(async () => {
  busy.value = true
  try {
    periods.value = orderedPeriods((await reportProvider.periods(auth.token!)).data.items.filter(p => !p.legacy))
    if (!periods.value.some(p => p.code === periodCode.value)) periodCode.value = periods.value.at(-1)?.code ?? ''
  } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
  if (periodCode.value && !error.value) await query()
})
</script>

<template>
  <section>
    <div class="page-heading"><div><h1>企业进度查询</h1><p>当前备案和本期上报分别统计，未填报企业仍在查询范围内。</p></div></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-card shadow="never" v-loading="busy">
      <el-form inline :disabled="busy" @submit.prevent="query()">
        <el-form-item label="调查期"><el-select v-model="periodCode" style="width:230px" @change="query()"><el-option v-for="p in periods" :key="p.code" :label="p.label" :value="p.code" /></el-select></el-form-item>
        <el-form-item label="所属市"><RegionPicker v-model="cityCode" any-level :select-level="2" /></el-form-item>
        <el-form-item label="备案情况"><el-select v-model="filingStatus" clearable style="width:140px"><el-option v-for="(label,key) in filingProgressLabels" :key="key" :label="label" :value="key" /></el-select></el-form-item>
        <el-form-item label="本期上报情况"><el-select v-model="reportStatus" clearable style="width:150px"><el-option v-for="(label,key) in reportFilterLabels" :key="key" :label="label" :value="key" /></el-select></el-form-item>
        <el-button native-type="submit" type="primary" :disabled="!periodCode">查询</el-button>
        <el-button :disabled="!periodCode" @click="cityCode=null; filingOnly()">清除筛选</el-button>
      </el-form>
      <template v-if="result">
        <div class="result-summary">
          <div><strong>查询结果</strong><p>{{ result.periodCode }} · {{ applied?.cityCode || '全省' }} · {{ applied?.filingStatus ? filingProgressLabels[applied.filingStatus] : '全部备案状态' }} · {{ applied?.reportStatus ? reportFilterLabels[applied.reportStatus] : '全部上报状态' }}</p></div>
          <strong>{{ result.summary.totalEnterprises }} 家企业</strong>
        </div>
        <CoverageMeter :counts="result.coverageSummary" />
        <div class="counts"><strong>备案</strong><el-button v-for="(label,key) in filingProgressLabels" :key="key" :disabled="busy" @click="filingOnly(key)">{{ label }} {{ result.summary.filingCounts[key] ?? 0 }}</el-button></div>
        <div class="counts"><strong>上报</strong><el-button v-for="(label,key) in reportFilterLabels" :key="key" :disabled="busy" @click="reportOnly(key)">{{ label }} {{ reportFilterStates[key].reduce((n,s)=>n+(result?.summary.reportCounts[s]??0),0) }}</el-button></div>
        <el-table :data="result.items" empty-text="暂无符合条件的企业">
          <el-table-column prop="enterpriseName" label="企业" min-width="160" />
          <el-table-column prop="cityName" label="所属市" />
          <el-table-column label="备案情况" min-width="120"><template #default="{ row }"><el-tag :type="row.filingStatus === 'APPROVED' ? 'success' : row.filingStatus === 'RETURNED' ? 'warning' : 'info'">{{ filingProgressLabels[row.filingStatus as FilingProgressStatus] }}</el-tag></template></el-table-column>
          <el-table-column label="调查期"><template #default>{{ result.periodCode }}</template></el-table-column>
          <el-table-column label="本期上报情况" min-width="150"><template #default="{ row }"><el-tag :type="row.reportStatus === 'APPROVED_PROVINCE' ? 'success' : row.reportStatus === 'VOIDED' ? 'danger' : reportFilterStates.RETURNED.includes(row.reportStatus) ? 'warning' : 'info'">{{ reportProgressLabels[row.reportStatus as keyof typeof reportProgressLabels] }}</el-tag></template></el-table-column>
          <el-table-column label="本期覆盖" min-width="175"><template #default="{ row }">
            <span>{{ row.eligible === false ? '不在应报范围' : row.coverageMode === 'REAL' ? '真实已报' : row.coverageMode === 'PROXY' ? '已代填' : row.coverageMode === 'NONE' ? '尚未覆盖' : '—' }}</span>
            <p v-if="row.proxySource" class="muted">来源 {{ row.proxySource.sourcePeriodCode }} · {{ row.proxySource.periodEmploymentCount }} 人</p>
          </template></el-table-column>
          <el-table-column label="最近提交（北京时间）" min-width="190"><template #default="{ row }">{{ formatBeijingTime(row.lastSubmittedAt) }}</template></el-table-column>
        </el-table>
        <el-pagination v-model:current-page="page" :total="result.total" :page-size="20" :disabled="busy" layout="total,prev,pager,next" @current-change="query(false)" />
      </template>
      <el-empty v-else-if="!busy && !error" description="暂无可选调查期" />
    </el-card>
  </section>
</template>

<style scoped>
.result-summary { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; padding: 12px 14px; background: var(--canvas); border-inline-start: 3px solid var(--accent); }
.result-summary p { margin: 2px 0 0; color: var(--muted); overflow-wrap: anywhere; }
.counts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0; }
.counts .el-button { margin-left: 0; }
</style>
