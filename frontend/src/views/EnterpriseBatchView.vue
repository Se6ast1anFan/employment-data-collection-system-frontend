<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { reportProvider } from '@/services/report'
import { revisionProvider } from '@/services/revision'
import { useAuthStore } from '@/stores/auth'
import { reportStatusLabels } from '@/utils/review'
import { blockedLabels } from '@/utils/report'
import type { ReportListItem, ReportView } from '@/types/report'
import type { BatchResult } from '@/types/revision'

type Candidate = ReportListItem & { canSubmit: boolean; blockedReason: ReportView['blockedReason'] }
const auth = useAuthStore()
const rows = ref<Candidate[]>([])
const selected = ref<Candidate[]>([])
const result = ref<BatchResult>()
const busy = ref(false)
const error = ref('')
const ready = ref(false)
const pendingStates = ['DRAFT', 'RETURNED_CITY', 'RETURNED_PROVINCE']

async function reload() {
  ready.value = false
  selected.value = []
  rows.value = []
  const token = auth.token!
  const periods = (await reportProvider.enterprisePeriods(token)).data.items
  const byPeriod = new Map(periods.map(p => [p.code, p]))
  const candidates = new Map<string, Candidate>()
  const succeeded = new Set(result.value?.items.filter(row => row.success).map(row => row.periodCode))
  for (let page = 0; ; page++) {
    const data = (await reportProvider.list({ page, size: 100 }, token)).data
    for (const row of data.items) {
      const period = byPeriod.get(row.periodCode)
      if (!pendingStates.includes(row.status) || row.voided || succeeded.has(row.periodCode)) continue
      candidates.set(row.periodCode, {
        ...row, canSubmit: period?.canWrite === true, blockedReason: period?.blockedReason ?? null,
      })
    }
    if ((page + 1) * data.size >= data.total || !data.items.length) break
  }
  rows.value = [...candidates.values()]
  ready.value = true
}
async function refresh() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await reload() } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
async function submit() {
  if (!auth.can('ENTERPRISE.REPORT.SUBMIT')) return
  if (busy.value || !selected.value.length || !ready.value) return
  const items = selected.value.filter(row => row.canSubmit).map(row => ({ periodCode: row.periodCode, expectedVersion: row.currentVersion }))
  if (!items.length) return
  busy.value = true
  try {
    try { await ElMessageBox.confirm(`确认提交选中的 ${items.length} 份报表？服务端按期次顺序逐条检查并返回结果。`, '批量提交', { type: 'warning' }) }
    catch { return }
    error.value = ''
    ready.value = false
    try {
      result.value = (await revisionProvider.batchSubmit(items, auth.token!)).data
    } catch (e) {
      error.value = (e as Error).message
    }
    try { await reload() }
    catch (e) { error.value = [error.value, '待上报列表刷新失败，请重新读取：' + (e as Error).message].filter(Boolean).join('。') }
  } finally { busy.value = false }
}
onMounted(refresh)
</script>

<template>
  <section>
    <div class="page-heading"><div><h1>待上报报表</h1><p>勾选本企业不同调查期的草稿或可重报记录。服务端按调查期先后逐条提交。</p></div><el-button :disabled="busy" @click="refresh">重新读取</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-card v-loading="busy" shadow="never">
      <el-table :data="rows" row-key="periodCode" empty-text="暂无待上报报表" @selection-change="selected=$event">
        <el-table-column type="selection" :selectable="(row: Candidate) => row.canSubmit && ready && !busy" />
        <el-table-column prop="periodLabel" label="调查期" min-width="160" />
        <el-table-column prop="periodCode" label="期次代码" min-width="140" />
        <el-table-column label="状态"><template #default="{ row }">{{ reportStatusLabels[row.status as keyof typeof reportStatusLabels] }}</template></el-table-column>
        <el-table-column prop="currentVersion" label="当前版本" />
        <el-table-column label="提交条件" min-width="170"><template #default="{ row }">{{ row.canSubmit ? '可选，提交时检查表单与版本' : blockedLabels[row.blockedReason as keyof typeof blockedLabels] || '当前不可选' }}</template></el-table-column>
        <el-table-column label="单份操作"><template #default="{ row }"><router-link :to="{path:'/enterprise/report/new',query:{periodCode:row.periodCode}}">打开填报</router-link></template></el-table-column>
      </el-table>
      <div class="form-actions"><el-button v-if="auth.can('ENTERPRISE.REPORT.SUBMIT')" type="primary" :disabled="busy || !ready || !selected.length" @click="submit">批量提交（{{ selected.length }}）</el-button></div>
    </el-card>
    <el-card v-if="result" class="business-card" shadow="never">
      <h2>成功 {{ result.successCount }} 条，失败 {{ result.failureCount }} 条</h2>
      <p>失败项可打开填报修正，再使用刷新后的版本重新勾选。</p>
      <el-table :data="result.items">
        <el-table-column prop="periodCode" label="调查期" />
        <el-table-column label="结果"><template #default="{ row }">{{ row.success ? '已提交' : '失败' }}</template></el-table-column>
        <el-table-column label="失败原因" min-width="190"><template #default="{ row }">{{ row.reason ?? row.reasonCode ?? '—' }}</template></el-table-column>
        <el-table-column prop="reportId" label="报表编号" />
        <el-table-column prop="currentVersion" label="当前版本" />
        <el-table-column prop="submissionVersion" label="提交版本" />
        <el-table-column prop="baselineSourcePeriodCode" label="建档来源期" />
        <el-table-column prop="baselineEmploymentCount" label="建档人数" />
      </el-table>
    </el-card>
  </section>
</template>
