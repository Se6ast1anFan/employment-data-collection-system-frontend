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
import { filingProgressLabels, reportProgressLabels } from '@/utils/revision'
import type { CityOverview, EnterpriseOverview, OverviewLink, ProvinceOverview, FilingProgressStatus, ReportProgressStatus } from '@/types/revision'
import type { SurveyPeriod } from '@/types/report'

const auth = useAuthStore()
const role = auth.user!.roleCode
const enterprise = ref<EnterpriseOverview>()
const city = ref<CityOverview>()
const province = ref<ProvinceOverview>()
const periods = ref<SurveyPeriod[]>([])
const periodCode = ref('')
const selected = computed(() => enterprise.value?.selectedPeriod ?? city.value?.selectedPeriod ?? province.value?.selectedPeriod ?? null)
const busy = ref(false)
const error = ref('')
const periodError = ref('')
const ready = ref(false)
const steps = ['备案', '选择调查期', '保存报表', '提交报表', '市级审核', '省级审核']
const reportSteps: Record<string, { step: number; label: string; completed?: boolean }> = {
  DRAFT: { step: 4, label: '草稿待提交' },
  RETURNED_CITY: { step: 4, label: '市级退回，待修改并重新提交' },
  RETURNED_PROVINCE: { step: 4, label: '省级退回，待修改并重新提交' },
  SUBMITTED_CITY: { step: 5, label: '待市级审核' },
  SUBMITTED_PROVINCE: { step: 6, label: '待省级审核' },
  APPROVED_PROVINCE: { step: 6, label: '省级审核通过，六步完成', completed: true },
}
const enterpriseProgress = computed<{ step: number | null; label: string; completed?: boolean }>(() => {
  const overview = enterprise.value
  if (!overview) {
    return { step: null, label: busy.value ? '正在读取填报进度' : error.value ? '填报进度读取失败' : '暂无填报进度数据' }
  }
  if (overview.filingStatus !== 'APPROVED') return { step: 1, label: '待备案或备案未通过' }
  if (!overview.selectedPeriod) return { step: 2, label: '待选择调查期' }
  if (overview.reportStatus === null) return { step: 3, label: '待保存报表' }
  if (Object.hasOwn(reportSteps, overview.reportStatus)) return reportSteps[overview.reportStatus]!
  if (overview.reportStatus === 'VOIDED') return { step: null, label: '本期报表已作废' }
  return { step: null, label: '本期报表状态暂无法识别' }
})
const activeStep = computed(() => {
  const { step, completed } = enterpriseProgress.value
  return completed ? steps.length : step === null ? 0 : step - 1
})
const isReturned = computed(() => ['RETURNED_CITY', 'RETURNED_PROVINCE'].includes(enterprise.value?.reportStatus ?? ''))
const cityCards = { pendingCity: '待市审', returnedCity: '市级退回', approvedCity: '市审通过', forwardedProvince: '已转报省级', notSubmitted: '本期未上报' } as const
const cityStatus = { pendingCity: 'SUBMITTED_CITY', returnedCity: 'RETURNED_CITY' } as const

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
    if (role === 'ENTERPRISE') enterprise.value = (await api.enterpriseOverview(code, token)).data
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
        if (role === 'ENTERPRISE') periods.value = (await reportProvider.enterprisePeriods(auth.token!)).data.items.filter(p => !p.legacy)
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
      <section class="period-band" aria-label="调查期">
      <el-form inline :disabled="busy" @submit.prevent="load">
        <el-form-item label="调查期">
          <el-select v-if="role !== 'CITY' && periods.length" v-model="periodCode" clearable style="width:250px" @change="load">
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
        <h2>企业填报六步进度</h2>
        <ol class="filing-steps" aria-label="企业填报六步进度">
          <li v-for="(step, index) in steps" :key="step" :class="{ 'step-done': index < activeStep, 'step-current': !enterpriseProgress.completed && enterpriseProgress.step === index + 1 }" :aria-current="!enterpriseProgress.completed && enterpriseProgress.step === index + 1 ? 'step' : undefined">
            <span class="step-marker" aria-hidden="true">{{ index < activeStep ? '✓' : index + 1 }}</span>
            <span>{{ step }}<span v-if="index < activeStep" class="sr-only">（已完成）</span></span>
          </li>
        </ol>
        <div class="progress-summary" :class="{ 'progress-summary--returned': isReturned }">
          <div>
            <strong role="status"><template v-if="enterpriseProgress.step !== null && !enterpriseProgress.completed">第 {{ enterpriseProgress.step }} 步 · </template>{{ enterpriseProgress.label }}</strong>
            <div v-if="enterprise" class="progress-meta">
              <span>备案：{{ filingProgressLabels[enterprise.filingStatus as FilingProgressStatus] || enterprise.filingStatus }}</span>
              <span v-if="selected">本期报表：{{ enterprise.reportStatus ? reportProgressLabels[enterprise.reportStatus as ReportProgressStatus] || enterprise.reportStatus : '本期未上报' }}</span>
            </div>
          </div>
          <router-link v-if="enterprise?.nextAction?.enabled && target(enterprise.nextAction)" class="overview-primary" :to="target(enterprise.nextAction)!">{{ enterprise.nextAction.label }}</router-link>
          <el-button v-else-if="error" @click="load">重新读取</el-button>
        </div>
        <template v-if="enterprise">
        <el-alert v-if="enterprise.latestReturnReason" :title="'退回备注：' + enterprise.latestReturnReason" type="warning" :closable="false" />
        <div class="overview-links">
          <router-link to="/enterprise/profile">备案资料</router-link>
          <router-link to="/enterprise/report/history">历史数据</router-link>
          <router-link to="/enterprise/notices">通知（{{ enterprise.visibleNoticeCount }}）</router-link>
        </div>
        </template>
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
        <h2>省级待办与审核结果</h2>
        <dl class="overview-counters">
          <div><dt>备案待审</dt><dd><router-link :to="{path:'/province/filings',query:{status:'PENDING'}}">{{ province.pendingFilingCount }}<span>查看待审备案</span></router-link></dd></div>
          <div><dt>报表待审</dt><dd><router-link v-if="selected" :to="{path:'/province/reports',query:{periodCode:selected.periodCode}}">{{ province.pendingReportCount }}<span>查看待审报表</span></router-link><template v-else>{{ province.pendingReportCount }}</template></dd></div>
          <div><dt>省审通过</dt><dd><router-link v-if="selected" :to="{path:'/province/reports',query:{periodCode:selected.periodCode,status:'APPROVED_PROVINCE'}}">{{ province.approvedReportCount }}<span>查看通过报表</span></router-link><template v-else>{{ province.approvedReportCount }}</template></dd></div>
        </dl>
        <p class="muted">备案待审按当前备案统计，报表数量按所选调查期统计。</p>
        </section>
        <section class="overview-panel">
        <h2>分市上报进度</h2>
        <p class="muted">已转报 {{ province.cityProgress.submittedCityCount }} 市，未转报 {{ province.cityProgress.notSubmittedCityCount }} 市</p>
        <el-table :data="province.cityProgress.items" empty-text="暂无各市上报记录">
          <el-table-column prop="cityName" label="城市" min-width="120" />
          <el-table-column prop="eligibleEnterpriseCount" label="符合填报资格" align="right" min-width="120" />
          <el-table-column prop="submittedEnterpriseCount" label="已上报企业" align="right" min-width="105" />
          <el-table-column prop="notSubmittedEnterpriseCount" label="未上报企业" align="right" min-width="105" />
          <el-table-column label="进度详情" min-width="90"><template #default="{ row }"><router-link v-if="selected" :to="{path:'/province/enterprise-progress',query:{periodCode:selected.periodCode,cityCode:row.cityCode}}">查看</router-link></template></el-table-column>
        </el-table>
        <div class="overview-links">
          <template v-for="entry in province.entries" :key="entry.route"><router-link v-if="target(entry)" :to="target(entry)!">{{ entry.label }}</router-link></template>
          <router-link :to="{path:'/province/summary',query:{periodCode:selected?.periodCode}}">数据汇总</router-link>
          <router-link :to="{path:'/province/analysis',query:{periodCode:selected?.periodCode}}">图表分析</router-link>
        </div>
        </section>
        <section v-if="province.nationalReportCard" class="overview-panel">
          <h2>国家上报 <el-tag type="warning">模拟接口 · MOCK</el-tag></h2>
          <p>{{ province.nationalReportCard.label }}<span v-if="province.nationalReportCard.periodCode"> · {{ province.nationalReportCard.periodCode }}</span></p>
          <router-link :to="nationalBatchLocation(province.nationalReportCard.periodCode, province.nationalReportCard.batchId)">
            {{ province.nationalReportCard.canRetry ? '查看批次与继续发送' : province.nationalReportCard.canStart ? '进入上报预览' : '查看国家上报' }}
          </router-link>
        </section>
      </template>
    </div>
  </section>
</template>
