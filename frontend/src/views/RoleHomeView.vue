<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { revisionProvider as api } from '@/services/revision'
import { reportProvider } from '@/services/report'
import { ApiError } from '@/services/api'
import { roleNames, getMenusForRole } from '@/config/navigation'
import { formatBeijingTime } from '@/utils/filing'
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
const steps = ['备案', '选择调查期', '保存', '提交', '市审', '省审']
const stepCodes: Record<string, number> = {
  FILING: 0, WAIT_FOR_FILING: 0, SUBMIT_FILING: 0, WAIT_FOR_PERIOD_OR_FILING: 0,
  SELECT_PERIOD: 1, WAIT_FOR_PERIOD: 1, SAVE_DRAFT: 2, FIX_RETURNED_REPORT: 2,
  SUBMIT_REPORT: 3, WAIT_CITY_REVIEW: 4, CITY_REVIEW: 4, WAIT_PROVINCE_REVIEW: 5, PROVINCE_REVIEW: 5, COMPLETE: 6,
}
const cityCards = { pendingCity: '待市审', approvedCity: '市审通过', returnedCity: '市级退回', forwardedProvince: '已转报省级', notSubmitted: '本期未上报' } as const
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
  <section>
    <div class="page-heading">
      <div><p class="eyebrow">{{ roleNames[role] }}</p><h1>工作概览</h1><p>{{ auth.user?.orgName }} · {{ auth.user?.displayName }}</p></div>
      <el-button :disabled="busy" @click="load">刷新概览</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="periodError" :title="periodError" type="warning" :closable="false" />
    <el-card v-loading="busy" shadow="never" class="business-card">
      <el-form inline :disabled="busy" @submit.prevent="load">
        <el-form-item label="调查期">
          <el-select v-if="role !== 'CITY' && periods.length" v-model="periodCode" clearable style="width:250px" @change="load">
            <el-option v-for="period in periods" :key="period.code" :label="period.label" :value="period.code" />
          </el-select>
          <el-input v-else v-model="periodCode" maxlength="32" placeholder="留空读取默认调查期" />
        </el-form-item>
        <el-button native-type="submit">查看期次</el-button>
      </el-form>
      <p v-if="selected">{{ selected.periodLabel }}（{{ selected.periodCode }}） · {{ windowLabels[selected.windowStatus] || selected.windowStatus }} · 截止 {{ formatBeijingTime(selected.deadlineAt) }}（北京时间）</p>
      <el-alert v-else-if="ready" title="暂无调查期" type="info" :closable="false" />
      <template v-if="enterprise">
        <p>备案进度 {{ filingProgressLabels[enterprise.filingStatus as FilingProgressStatus] || enterprise.filingStatus }}</p>
        <p v-if="selected">本期报表 {{ enterprise.reportStatus ? reportProgressLabels[enterprise.reportStatus as ReportProgressStatus] || enterprise.reportStatus : '本期未上报' }}</p>
        <el-steps v-if="Object.hasOwn(stepCodes, enterprise.currentStep)" :active="stepCodes[enterprise.currentStep]" finish-status="success" align-center>
          <el-step v-for="step in steps" :key="step" :title="step" />
        </el-steps>
        <p v-else>当前步骤 {{ enterprise.nextAction?.label || enterprise.currentStep }}</p>
        <el-alert v-if="enterprise.latestReturnReason" :title="'退回备注：' + enterprise.latestReturnReason" type="warning" :closable="false" />
        <p v-if="enterprise.nextAction">下一步 {{ enterprise.nextAction.label }}</p>
        <div class="overview-links">
          <router-link v-if="enterprise.nextAction?.enabled && target(enterprise.nextAction)" :to="target(enterprise.nextAction)!">{{ enterprise.nextAction.label }}</router-link>
          <router-link to="/enterprise/profile">备案资料</router-link>
          <router-link to="/enterprise/report/history">历史数据</router-link>
          <router-link to="/enterprise/notices">通知（{{ enterprise.visibleNoticeCount }}）</router-link>
        </div>
      </template>
      <template v-if="city">
        <p>统计范围 {{ auth.user?.orgName }} · {{ selected?.periodLabel || '暂无调查期' }}。市审通过和转报省级的记录可能重叠。</p>
        <dl class="overview-counters">
          <div v-for="(label, key) in cityCards" :key="key">
            <dt>{{ label }}</dt>
            <dd><router-link v-if="selected && (key === 'pendingCity' || key === 'returnedCity')" :to="{path:'/city/reports', query:{periodCode:selected.periodCode,status:cityStatus[key]}}">{{ city.reportCounts[key] }}</router-link><span v-else>{{ city.reportCounts[key] }}</span></dd>
          </div>
        </dl>
        <div class="overview-links">
          <router-link v-if="city.nextAction?.enabled && target(city.nextAction)" :to="target(city.nextAction)!">{{ city.nextAction.label }}</router-link>
          <router-link to="/city/notices">{{ city.noticeEntry?.label || '通知管理' }}</router-link>
        </div>
      </template>
      <template v-if="province">
        <p>统计范围 {{ auth.user?.orgName }} · {{ selected?.periodLabel || '暂无调查期' }}。备案待审按当前备案统计。</p>
        <dl class="overview-counters">
          <div><dt>备案待审</dt><dd><router-link :to="{path:'/province/filings',query:{status:'PENDING'}}">{{ province.pendingFilingCount }}</router-link></dd></div>
          <div><dt>报表待审</dt><dd><router-link v-if="selected" :to="{path:'/province/reports',query:{periodCode:selected?.periodCode}}">{{ province.pendingReportCount }}</router-link><span v-else>{{ province.pendingReportCount }}</span></dd></div>
          <div><dt>省审通过</dt><dd><router-link v-if="selected" :to="{path:'/province/reports',query:{periodCode:selected?.periodCode,status:'APPROVED_PROVINCE'}}">{{ province.approvedReportCount }}</router-link><span v-else>{{ province.approvedReportCount }}</span></dd></div>
          <div><dt>已转报城市</dt><dd>{{ province.cityProgress.submittedCityCount }}</dd></div>
          <div><dt>未转报城市</dt><dd>{{ province.cityProgress.notSubmittedCityCount }}</dd></div>
        </dl>
        <el-table :data="province.cityProgress.items" empty-text="暂无各市上报记录">
          <el-table-column prop="cityName" label="城市" />
          <el-table-column prop="eligibleEnterpriseCount" label="符合填报资格" />
          <el-table-column prop="submittedEnterpriseCount" label="已上报企业" />
          <el-table-column prop="notSubmittedEnterpriseCount" label="未上报企业" />
          <el-table-column label="进度详情"><template #default="{ row }"><router-link v-if="selected" :to="{path:'/province/enterprise-progress',query:{periodCode:selected.periodCode,cityCode:row.cityCode}}">查看</router-link></template></el-table-column>
        </el-table>
        <div class="overview-links">
          <template v-for="entry in province.entries" :key="entry.route"><router-link v-if="target(entry)" :to="target(entry)!">{{ entry.label }}</router-link></template>
          <router-link :to="{path:'/province/summary',query:{periodCode:selected?.periodCode}}">数据汇总</router-link>
          <router-link :to="{path:'/province/analysis',query:{periodCode:selected?.periodCode}}">图表分析</router-link>
        </div>
      </template>
    </el-card>
  </section>
</template>

<style scoped>
.overview-counters { display: flex; flex-wrap: wrap; gap: 16px; }
.overview-counters div { border: 1px solid #e5e8ee; border-radius: 8px; padding: 12px 16px; min-width: 110px; }
dd { margin: 6px 0 0; font-size: 22px; }
.overview-links { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 16px; }
</style>
