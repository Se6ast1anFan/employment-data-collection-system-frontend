<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { revisionProvider as api } from '@/services/revision'
import { reportProvider } from '@/services/report'
import { ApiError } from '@/services/api'
import { roleNames, getMenusForRole } from '@/config/navigation'
import { formatBeijingTime } from '@/utils/filing'
import { nationalBatchLocation } from '@/utils/national'
import { windowLabels } from '@/utils/report'
import CoverageMeter from '@/components/CoverageMeter.vue'
import type { CityOverview, EnterpriseOverview, OverviewLink, ProvinceOverview } from '@/types/revision'
import type { SurveyPeriod } from '@/types/report'

const auth = useAuthStore()
const role = auth.user!.roleCode
const enterprise = ref<EnterpriseOverview>()
const city = ref<CityOverview>()
const province = ref<ProvinceOverview>()
const periods = ref<SurveyPeriod[]>([])
const periodCode = ref('')
const selected = computed(() => enterprise.value?.homePeriod ?? city.value?.selectedPeriod ?? province.value?.selectedPeriod ?? null)
const busy = ref(false)
const error = ref('')
const periodError = ref('')
const ready = ref(false)
const homeLabels = { NOT_SAVED: '未保存', DRAFT_SAVED: '已保存草稿', SUBMITTED: '已提交', RETURNED: '被退回' } as const
const homeLabel = computed(() => {
  const state = enterprise.value?.homeState
  return state ? homeLabels[state] ?? '暂未取得填报状态' : busy.value ? '正在读取填报状态' : '暂未取得填报状态'
})
const isReturned = computed(() => enterprise.value?.homeState === 'RETURNED')
const homeActionLabel = computed(() => {
  const entry = enterprise.value?.homeNextAction
  if (!entry || target(entry)?.path !== '/enterprise/report/new') return entry?.label
  switch (enterprise.value?.homeState) {
    case 'NOT_SAVED': return '填写并保存草稿'
    case 'DRAFT_SAVED': return '打开草稿并提交'
    case 'RETURNED': return '修改并重新提交'
    default: return '查看报表'
  }
})
const cityCards = { pendingCity: '待市审', returnedCity: '市级退回', approvedCity: '市审通过', forwardedProvince: '已转报省级', notSubmitted: '本期未上报' } as const
const cityStatus = { pendingCity: 'SUBMITTED_CITY', returnedCity: 'RETURNED_CITY' } as const
const hideCompletedCities = ref(false)
const cityRows = computed(() => province.value?.cityProgress.items ?? [])
const incompleteCityRows = computed(() => cityRows.value.filter(row =>
  !(row.eligibleEnterpriseCount > 0 && row.realSubmittedCount === row.eligibleEnterpriseCount),
))
const completedCityCount = computed(() => cityRows.value.length - incompleteCityRows.value.length)

function target(entry: OverviewLink) {
  const [path = '', params] = entry.route.split('?')
  const query = new URLSearchParams(params)
  if (role === 'ENTERPRISE') {
    const match = /^\/enterprise\/reports\/([^/]+)$/.exec(path)
    if (match || path === '/enterprise/report/new') {
      if (!selected.value) return undefined
      return { path: '/enterprise/report/new', query: { periodCode: selected.value.periodCode } }
    }
  }
  if (!getMenusForRole(role).some(menu => menu.path === path)) return undefined
  if (['/city/reports', '/province/reports', '/province/enterprise-progress', '/province/summary', '/province/analysis'].includes(path)) {
    return { path, query: { periodCode: selected.value?.periodCode ?? query.get('periodCode') ?? undefined } }
  }
  return { path }
}
async function load() {
  if (busy.value) return
  busy.value = true
  ready.value = false
  error.value = ''
  enterprise.value = city.value = province.value = undefined
  try {
    const code = periodCode.value.trim(), token = auth.token!
    if (role === 'ENTERPRISE') enterprise.value = (await api.enterpriseOverview('', token)).data
    if (role === 'CITY') city.value = (await api.cityOverview(code, token)).data
    if (role === 'PROVINCE') province.value = (await api.provinceOverview(code, token)).data
    periodCode.value = selected.value?.periodCode ?? ''
    ready.value = true
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 404 ? '工作概览接口暂不可用，请重试或使用侧栏业务入口。' : (e as Error).message
  } finally { busy.value = false }
}
onMounted(async () => {
  await Promise.all([
    load(),
    (async () => {
      try {
        if (role === 'PROVINCE') periods.value = (await reportProvider.periods(auth.token!)).data.items.filter(p => !p.legacy)
      } catch (e) { periodError.value = '调查期选项读取失败：' + (e as Error).message }
    })(),
  ])
})
</script>

<template>
  <section class="work-overview">
    <div class="page-heading">
      <div><h1>工作概览</h1><p>{{ auth.user?.orgName }} · {{ roleNames[role] }}</p></div>
      <el-button :disabled="busy" @click="load">刷新概览</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="periodError" :title="periodError" type="warning" :closable="false" />
    <div v-loading="busy" :aria-busy="busy" class="overview-stack">
      <section v-if="role !== 'ENTERPRISE'" class="period-band" aria-label="调查期">
      <el-form inline :disabled="busy" @submit.prevent="load">
        <el-form-item label="调查期">
          <el-select v-if="role === 'PROVINCE' && periods.length" v-model="periodCode" clearable style="width:250px" @change="load">
            <el-option v-for="period in periods" :key="period.code" :label="period.label" :value="period.code" />
          </el-select>
          <el-input v-else v-model="periodCode" maxlength="32" placeholder="留空读取默认调查期" />
        </el-form-item>
        <el-button native-type="submit">查看期次</el-button>
      </el-form>
      <div v-if="selected" class="period-summary">
        <div><strong>{{ selected.periodLabel }}</strong><span class="muted">{{ selected.periodCode }}</span></div>
        <el-tag :type="selected.windowStatus === 'OPEN' ? 'success' : 'info'">{{ windowLabels[selected.windowStatus] || selected.windowStatus }}</el-tag>
        <span>截止 {{ formatBeijingTime(selected.deadlineAt) }}（北京时间）</span>
      </div>
      <el-alert v-else-if="ready" title="暂无调查期" type="info" :closable="false" />
      </section>
      <section v-if="role === 'ENTERPRISE'" class="overview-panel">
        <h2>本期填报</h2>
        <div class="progress-summary" :class="{ 'progress-summary--returned': isReturned }">
          <div>
            <strong role="status">{{ homeLabel }}</strong>
            <div class="progress-meta">{{ selected?.periodLabel ?? '暂无当前调查期' }}</div>
            <p v-if="isReturned" class="muted">退回原因：{{ enterprise?.homeReturnReason || '未填写备注' }}</p>
          </div>
          <router-link v-if="enterprise?.homeNextAction?.enabled && target(enterprise.homeNextAction)" class="overview-primary" :to="target(enterprise.homeNextAction)!">{{ homeActionLabel }}</router-link>
          <el-button v-else-if="error" @click="load">重新读取</el-button>
        </div>
        <template v-if="enterprise">
        <div class="overview-links">
          <router-link to="/enterprise/profile">备案资料</router-link>
          <router-link to="/enterprise/report/new">数据填报与期次选择</router-link>
          <router-link to="/enterprise/report/history">历史数据</router-link>
          <router-link to="/enterprise/notices">通知（{{ enterprise.visibleNoticeCount }}）</router-link>
        </div>
        </template>
      </section>
      <section v-if="city" class="overview-panel">
        <h2>本市填报进度</h2>
        <CoverageMeter v-if="selected" :counts="city" />
        <p v-else class="muted">暂无调查期</p>
      </section>
      <section v-if="city" class="overview-panel">
        <h2>辖区审核队列</h2>
        <dl class="overview-counters">
          <div v-for="(label, key) in cityCards" :key="key">
            <dt>{{ label }}</dt>
            <dd>
              <router-link v-if="selected && (key === 'pendingCity' || key === 'returnedCity')" :to="{path:'/city/reports', query:{periodCode:selected.periodCode,status:cityStatus[key]}}">
                {{ city.reportCounts[key] }}<span>查看{{ label }}报表</span>
              </router-link>
              <template v-else>{{ city.reportCounts[key] }}</template>
            </dd>
          </div>
        </dl>
        <p class="muted">统计范围为{{ auth.user?.orgName }}。市审通过和转报省级的记录可能重叠。</p>
        <div class="overview-links">
          <router-link v-if="city.nextAction?.enabled && target(city.nextAction)" :to="target(city.nextAction)!">{{ city.nextAction.label }}</router-link>
          <router-link to="/city/notices">{{ city.noticeEntry?.label || '通知管理' }}</router-link>
        </div>
      </section>
      <template v-if="province">
        <section class="overview-panel">
        <div class="city-progress-heading">
          <h2>分市上报进度</h2>
          <el-button v-if="selected" :disabled="!completedCityCount && !hideCompletedCities" @click="hideCompletedCities = !hideCompletedCities">
            {{ hideCompletedCities ? '显示已报齐城市' : '隐藏已报齐城市' }}（{{ completedCityCount }}）
          </el-button>
        </div>
        <div v-if="selected" class="period-band"><strong>全省合计</strong><CoverageMeter :counts="province.provinceTotals" /></div>
        <el-table :data="hideCompletedCities ? incompleteCityRows : cityRows"
          :empty-text="hideCompletedCities && completedCityCount ? '本期城市均已报齐，可点击显示查看' : '暂无各市上报记录'">
          <el-table-column label="城市" min-width="145"><template #default="{ row }"><router-link v-if="selected" :to="{path:'/province/enterprise-progress',query:{periodCode:selected.periodCode,cityCode:row.cityCode}}">{{ row.cityName }}</router-link><span v-else>{{ row.cityName }}</span></template></el-table-column>
          <el-table-column label="应报企业" align="right" min-width="100"><template #default="{ row }">{{ row.realSubmittedCount === undefined ? '—' : row.eligibleEnterpriseCount }}</template></el-table-column>
          <el-table-column label="本期覆盖" min-width="285"><template #default="{ row }"><CoverageMeter :counts="row" /></template></el-table-column>
        </el-table>
        <div class="overview-links">
          <template v-for="entry in province.entries" :key="entry.route"><router-link v-if="target(entry)" :to="target(entry)!">{{ entry.label }}</router-link></template>
          <router-link :to="{path:'/province/summary',query:{periodCode:selected?.periodCode}}">数据汇总</router-link>
          <router-link :to="{path:'/province/analysis',query:{periodCode:selected?.periodCode}}">图表分析</router-link>
          <router-link :to="{path:'/province/olap',query:{periodCode:selected?.periodCode}}">多维分析</router-link>
        </div>
        </section>
        <section class="overview-panel">
          <h2>省级待办与审核结果</h2>
          <dl class="overview-counters">
            <div><dt>备案待审</dt><dd><router-link :to="{path:'/province/filings',query:{status:'PENDING'}}">{{ province.pendingFilingCount }}<span>查看待审备案</span></router-link></dd></div>
            <div><dt>报表待审</dt><dd><router-link v-if="selected" :to="{path:'/province/reports',query:{periodCode:selected.periodCode}}">{{ province.pendingReportCount }}<span>查看待审报表</span></router-link><template v-else>{{ province.pendingReportCount }}</template></dd></div>
            <div><dt>省审通过</dt><dd><router-link v-if="selected" :to="{path:'/province/reports',query:{periodCode:selected.periodCode,status:'APPROVED_PROVINCE'}}">{{ province.approvedReportCount }}<span>查看通过报表</span></router-link><template v-else>{{ province.approvedReportCount }}</template></dd></div>
          </dl>
          <p class="muted">备案待审按当前备案统计，报表数量按所选调查期统计。</p>
        </section>
        <section class="overview-panel">
          <h2>国家上报 <el-tag type="warning">内部模拟</el-tag></h2>
          <p>在国家上报页核对本期覆盖、代填来源和模拟批次。</p>
          <router-link :to="nationalBatchLocation(selected?.periodCode, province.nationalReportCard?.batchId)">
            {{ province.nationalReportCard?.batchId ? '查看模拟批次' : '查看国家上报' }}
          </router-link>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.city-progress-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-bottom: 14px; }
.city-progress-heading h2 { margin: 0; }
</style>
