<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { apiMode } from '@/services/auth'
import { getNationalV2 } from '@/services/nationalV2'
import { ApiError } from '@/services/api'
import { formatBeijingTime } from '@/utils/filing'
import { orderedPeriods } from '@/utils/week6'
import type { SurveyPeriod } from '@/types/report'
import type { BatchDetailV2, BatchStatusV2, BatchSummaryV2, ReadinessV2 } from '@/types/midterm'

const route = useRoute()
const auth = useAuthStore()
const can = (action: string) => auth.can('PROVINCE.NATIONAL.' + action)
const token = () => auth.token!
const periods = ref<SurveyPeriod[]>([])
const periodCode = ref('')
const readiness = ref<ReadinessV2>()
const loadingPeriods = ref(false)
const loadingPreview = ref(false)
const periodError = ref('')
const previewError = ref('')
const actionError = ref('')
const actionDetails = ref<string[]>([])
const actionMessage = ref('')
const action = ref<'generate' | 'revoke' | 'freeze'>()
const acting = ref(false)
const confirming = computed({ get: () => !!action.value, set: open => { if (!open && !acting.value) action.value = undefined } })
const actionLabels = { generate: '生成代填', revoke: '撤销代填', freeze: '确认冻结并排队' }
const statusLabels: Record<BatchStatusV2, string> = { QUEUED: '已冻结，等待发送', SENDING: '分片发送中', ASSEMBLING: '模拟端组装中', MOCK_ACCEPTED: '回执待核对', SEND_FAILED: '发送失败' }
const inFlight = (status: BatchStatusV2) => ['QUEUED', 'SENDING', 'ASSEMBLING'].includes(status)
const formatLabel = (item: { payloadFormat?: string; mode?: string }) => item.payloadFormat === 'XML' || item.mode === 'MOCK_QUEUE'
  ? 'XML / 消息队列 / 内部模拟' : 'JSON / 内部模拟'
const canGenerate = computed(() => {
  const data = readiness.value
  return !!data && !data.existingBatch && !data.noRealSource.length && !!(data.fillable.length || data.proxyItems.length)
    && data.blockers.every(item => item.code === 'UNCOVERED_ENTERPRISE')
})
const eligible = computed(() => readiness.value?.counts.eligibleCount ?? 0)
const awaitingReview = computed(() => {
  const c = readiness.value?.counts
  return c ? c.pendingCityCount + c.pendingProvinceCount + c.returnedCityCount + c.returnedProvinceCount : 0
})
const reportLink = (id: string) => ({ path: '/province/data/reports/' + encodeURIComponent(id), query: { readonly: '1' } })
const batchList = ref<BatchSummaryV2[]>([])
const page = ref(1)
const total = ref(0)
const historyBusy = ref(false)
const historyError = ref('')
const filters = reactive<{ periodCode?: string; status?: BatchStatusV2 }>({})
let applied = { ...filters }
let previewRequest = 0, historyRequest = 0
const drawer = ref(false)
const batchId = ref('')
const batch = ref<BatchDetailV2>()
const confirmedReceipt = computed<BatchDetailV2['receipt']>(() => {
  const detail = batch.value
  if (!detail || (detail.payloadFormat === 'XML' && detail.status !== 'MOCK_ACCEPTED')) return null
  return detail.receipt
})
const detailBusy = ref(false)
const detailError = ref('')
const retrying = ref(false)
const pollPaused = ref(false)
const canRetry = computed(() => can('RETRY') && batch.value?.payloadFormat === 'XML' && ['QUEUED', 'SEND_FAILED'].includes(batch.value.status))
let controller: AbortController | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let polls = 0
let disposed = false

async function loadReadiness(code: string) {
  const id = ++previewRequest
  readiness.value = undefined
  previewError.value = ''
  if (!code) { loadingPreview.value = false; return }
  loadingPreview.value = true
  try {
    const data = (await (await getNationalV2()).readiness(code, token())).data
    if (!Number.isInteger(data.proxyVersion) || !data.previewSummary || !Array.isArray(data.proxyItems)) throw new Error('当前服务尚未返回 V2 上报门槛，请确认服务已升级。')
    if (id === previewRequest && !disposed) readiness.value = data
  } catch (cause) {
    if (id === previewRequest && !disposed) previewError.value = (cause as Error).message
  } finally { if (id === previewRequest) loadingPreview.value = false }
}
async function loadPeriods() {
  if (loadingPeriods.value || acting.value) return
  if (!auth.can('PROVINCE.PERIOD.READ')) { await loadReadiness(periodCode.value); return }
  loadingPeriods.value = true
  periodError.value = ''
  try {
    const { data } = await (await getNationalV2()).periods(token())
    periods.value = orderedPeriods(data.items).reverse()
    if (!periods.value.some(item => item.code === periodCode.value)) {
      const demo = apiMode === 'mock' ? periods.value.find(item => item.code === 'MOCK_V2_CLOSED') : undefined
      periodCode.value = (demo ?? periods.value.find(item => !item.legacy && item.windowStatus === 'CLOSED') ?? periods.value[0])?.code ?? ''
    }
    await loadReadiness(periodCode.value)
  } catch (cause) { periodError.value = (cause as Error).message }
  finally { loadingPeriods.value = false }
}
function pickPeriod() {
  actionMessage.value = actionError.value = ''
  actionDetails.value = []
  void loadReadiness(periodCode.value)
}
async function loadHistory(number = page.value) {
  const id = ++historyRequest
  historyBusy.value = true
  historyError.value = ''
  try {
    const { data } = await (await getNationalV2()).list({ ...applied, page: number - 1, size: 20 }, token())
    if (id !== historyRequest || disposed) return
    const last = Math.max(1, Math.ceil(data.total / 20))
    if (number > last) { await loadHistory(last); return }
    batchList.value = data.items
    page.value = data.page + 1
    total.value = data.total
  } catch (cause) { if (id === historyRequest && !disposed) historyError.value = (cause as Error).message }
  finally { if (id === historyRequest) historyBusy.value = false }
}
function applyHistoryFilters() {
  applied = { ...filters }
  void loadHistory(1)
}

function stopPoll() {
  clearTimeout(timer)
  controller?.abort()
  controller = undefined
  detailBusy.value = false
}
async function readDetail(reset = false) {
  if (!drawer.value || detailBusy.value || retrying.value || !batchId.value) return
  clearTimeout(timer)
  if (reset) { polls = 0; pollPaused.value = false }
  const request = new AbortController()
  controller = request
  detailBusy.value = true
  detailError.value = ''
  const id = batchId.value
  try {
    const { data } = await (await getNationalV2()).detail(id, token(), AbortSignal.any([request.signal, AbortSignal.timeout(12000)]))
    if (request.signal.aborted || disposed || id !== batchId.value) return
    const previous = batch.value?.status
    batch.value = data
    if (readiness.value?.existingBatch?.batchId === id) readiness.value.existingBatch.status = data.status
    if (previous !== data.status) void loadHistory()
    if (data.payloadFormat === 'XML' && (inFlight(data.status) || (data.status === 'MOCK_ACCEPTED' && !data.receipt))) {
      if (polls < 24) timer = setTimeout(() => { polls++; void readDetail() }, 1500)
      else pollPaused.value = true
    }
  } catch (cause) { if (!request.signal.aborted && !disposed) detailError.value = (cause as Error).message }
  finally { if (controller === request) { controller = undefined; detailBusy.value = false } }
}
function openBatch(id: string) {
  stopPoll()
  batchId.value = id
  batch.value = undefined
  drawer.value = true
  void readDetail(true)
}
async function retry() {
  if (!canRetry.value || retrying.value || detailBusy.value) return
  stopPoll()
  retrying.value = true
  detailError.value = ''
  try {
    await (await getNationalV2()).retry(batchId.value, token())
    retrying.value = false
    await readDetail(true)
  } catch (cause) { detailError.value = (cause as Error).message }
  finally { retrying.value = false }
}

async function applyAction() {
  const data = readiness.value, selected = action.value
  if (!data || !selected || acting.value || data.period.periodCode !== periodCode.value) return
  if (selected === 'generate' && !canGenerate.value || selected === 'revoke' && (data.existingBatch || !data.proxyItems.length)
    || selected === 'freeze' && (!data.canSubmit || data.existingBatch)) return
  if (!can({ generate: 'PROXY_CREATE', revoke: 'PROXY_DELETE', freeze: 'BATCH_CREATE' }[selected])) return
  const code = data.period.periodCode
  acting.value = true
  actionError.value = actionMessage.value = ''
  actionDetails.value = []
  try {
    const api = await getNationalV2()
    if (selected === 'generate') {
      const result = (await api.generate(code, data.proxyVersion, token())).data
      actionMessage.value = `已生成 ${result.generatedCount} 家企业的代填记录。`
    } else if (selected === 'revoke') {
      const result = (await api.revoke(code, data.proxyVersion, token())).data
      actionMessage.value = `已撤销 ${result.removedCount} 家企业的未冻结代填。`
    } else {
      const result = (await api.create(code, token())).data
      actionMessage.value = 'XML 已冻结并排队，请在批次详情查看分片和模拟回执。'
      openBatch(result.batchId)
      void loadHistory(1)
    }
  } catch (cause) {
    actionError.value = (cause as Error).message
    if (cause instanceof ApiError) {
      actionDetails.value = [...Object.values(cause.fieldErrors), ...(cause.data?.blockers?.map(item => item.message) ?? [])]
      if (cause.data?.enterpriseOrgIds?.length) actionDetails.value.push('无历史来源企业编号：' + cause.data.enterpriseOrgIds.join('、'))
      if (cause.data?.reasonCode === 'PROXY_SOURCE_CHANGED') actionDetails.value.push('请重新生成代填并再次核对来源。')
      if (cause.data?.existingBatchId) openBatch(cause.data.existingBatchId)
    }
  } finally {
    action.value = undefined
    if (!disposed) await loadReadiness(code)
    acting.value = false
  }
}
watch(drawer, open => { if (!open) stopPoll() })
function readRoute() {
  if (typeof route.query.periodCode === 'string') periodCode.value = route.query.periodCode
  if (typeof route.query.batchId === 'string') openBatch(route.query.batchId)
}
onMounted(() => { readRoute(); void loadPeriods(); void loadHistory() })
watch(() => [route.query.periodCode, route.query.batchId], () => { readRoute(); pickPeriod() })
onBeforeUnmount(() => { disposed = true; stopPoll() })
</script>

<template>
  <section class="national-v2">
    <div class="page-heading">
      <div><h1>国家上报</h1><p>核对本期应报覆盖，冻结 XML 后查看消息分片和内部模拟回执。</p></div>
      <el-tag type="warning">内部模拟接收</el-tag>
    </div>
    <el-card shadow="never" class="business-card">
      <template #header><h2>调查期与上报门槛</h2></template>
      <el-alert v-if="periodError" :title="periodError" type="error" :closable="false" />
      <el-form inline :disabled="loadingPeriods || acting" @submit.prevent="pickPeriod">
        <el-form-item label="调查期">
          <el-select v-if="auth.can('PROVINCE.PERIOD.READ')" v-model="periodCode" filterable style="width: min(290px, 64vw)" @change="pickPeriod">
            <el-option v-for="period in periods" :key="period.code" :value="period.code" :label="period.label" />
          </el-select>
          <el-input v-else v-model.trim="periodCode" maxlength="32" placeholder="输入调查期代码" />
        </el-form-item>
        <el-button native-type="submit" :disabled="!periodCode || loadingPreview">刷新本期门槛</el-button>
        <el-button v-if="auth.can('PROVINCE.PERIOD.READ')" @click="loadPeriods">刷新调查期</el-button>
      </el-form>
      <el-alert v-if="previewError" :title="previewError" type="error" :closable="false" />
      <div v-loading="loadingPreview" :aria-busy="loadingPreview">
        <template v-if="readiness">
          <p>{{ readiness.period.periodLabel }} · 填报截止 {{ formatBeijingTime(readiness.period.closeAt) }}（北京时间）</p>
          <dl class="count-strip">
            <div><dt>应报企业</dt><dd>{{ eligible }}</dd></div>
            <div><dt>真实报表已省审通过</dt><dd>{{ readiness.counts.realCount }}</dd></div>
            <div><dt>已代填</dt><dd>{{ readiness.counts.proxyCount }}</dd></div>
            <div><dt>尚未覆盖</dt><dd>{{ readiness.counts.missingCount }}</dd></div>
          </dl>
          <p v-if="awaitingReview" class="muted">其中待审或退回 {{ awaitingReview }} 家，须完成审核或重新提交。</p>
          <ul v-if="readiness.blockers.length" class="national-blockers"><li v-for="blocker in readiness.blockers" :key="blocker.code">{{ blocker.message }}</li></ul>
          <p v-else>应报企业已全部覆盖，可以核对并冻结。</p>
          <el-button v-if="readiness.existingBatch" type="primary" @click="openBatch(readiness.existingBatch.batchId)">查看现有批次</el-button>
        </template>
        <el-empty v-else-if="!loadingPreview && !previewError" description="选择调查期后查看上报门槛" :image-size="60" />
      </div>
    </el-card>

    <template v-if="readiness && !readiness.existingBatch">
      <el-card shadow="never" class="business-card">
        <template #header><h2>缺报待补与代填来源</h2></template>
        <p class="muted">代填使用企业最近一次真实且省审通过的有效月度报表。建档和调查人数均复制该来源的调查人数。</p>
        <el-collapse>
          <el-collapse-item :title="`缺报待补 · 尚未覆盖 ${readiness.counts.missingCount} 家`" name="uncovered">
            <el-table :data="[...readiness.fillable, ...readiness.noRealSource]" empty-text="暂无可列出的缺报企业">
              <el-table-column prop="enterpriseName" label="企业" min-width="160" />
              <el-table-column prop="regionCode" label="行政区划" min-width="105" />
              <el-table-column label="处理方式" min-width="150"><template #default="{ row }">{{ row.source ? '可代填' : '无历史来源，阻止上报' }}</template></el-table-column>
            </el-table>
            <p v-if="awaitingReview" class="muted">另有待审或退回 {{ awaitingReview }} 家，请在原审核页面处理。</p>
          </el-collapse-item>
        </el-collapse>
        <h3>可代填 · {{ readiness.fillable.length }} 家</h3>
        <el-table :data="readiness.fillable" empty-text="暂无可代填企业">
          <el-table-column prop="enterpriseName" label="企业" min-width="160" />
          <el-table-column prop="regionCode" label="行政区划" min-width="105" />
          <el-table-column prop="source.sourcePeriodCode" label="来源期次" min-width="130" />
          <el-table-column label="来源报表" min-width="135"><template #default="{ row }"><router-link :to="reportLink(row.source.sourceReportId)">{{ row.source.sourceReportId }}</router-link><span class="muted"> · 版本 {{ row.source.sourceCurrentVersion }}</span></template></el-table-column>
          <el-table-column prop="source.periodEmploymentCount" label="复制人数" align="right" min-width="100" />
        </el-table>
        <h3>无历史来源 · {{ readiness.noRealSource.length }} 家</h3>
        <el-table :data="readiness.noRealSource" empty-text="暂无缺少历史来源的企业">
          <el-table-column prop="enterpriseName" label="企业" min-width="160" />
          <el-table-column prop="enterpriseOrgId" label="企业编号" min-width="115" />
          <el-table-column prop="regionCode" label="行政区划" min-width="105" />
          <el-table-column label="阻止原因" min-width="195"><template #default>没有可用历史真实报表</template></el-table-column>
        </el-table>
        <div class="form-actions">
          <el-button v-if="can('PROXY_DELETE')" :disabled="acting || !readiness.proxyItems.length" @click="action = 'revoke'">撤销未冻结代填</el-button>
          <el-button v-if="can('PROXY_CREATE')" type="primary" :disabled="acting || !canGenerate" @click="action = 'generate'">{{ readiness.proxyItems.length ? '重新生成代填' : '生成代填' }}</el-button>
        </div>
      </el-card>
      <el-card shadow="never" class="business-card">
        <template #header><h2>全省汇总与逐企业 XML 摘要</h2></template>
        <p>当前预览 {{ readiness.previewSummary.enterpriseCount }} 家（真实 {{ readiness.previewSummary.realCount }}，代填 {{ readiness.previewSummary.proxyCount }}）。</p>
        <p>建档 {{ readiness.previewSummary.baselineEmploymentTotal }} 人，调查 {{ readiness.previewSummary.periodEmploymentTotal }} 人，净变化 {{ readiness.previewSummary.netChange }} 人。</p>
        <el-table :data="[...readiness.realEnterprises, ...readiness.proxyItems]" row-key="enterpriseOrgId" empty-text="暂无可纳入预览的企业">
          <el-table-column prop="enterpriseName" label="企业" min-width="160" />
          <el-table-column label="填报类型" width="150"><template #default="{ row }"><el-tag :type="row.reportId ? 'success' : 'warning'">{{ row.reportId ? '真实填报 REAL' : '代填 PROXY' }}</el-tag></template></el-table-column>
          <el-table-column prop="regionCode" label="行政区划" min-width="100" />
          <el-table-column label="报表与来源" min-width="170"><template #default="{ row }">
            <router-link :to="reportLink(row.reportId || row.sourceReportId)">{{ row.reportId || row.sourceReportId }}</router-link>
            <span v-if="row.proxySourcePeriodCode" class="muted"> · {{ row.proxySourcePeriodCode }} / 版本 {{ row.sourceCurrentVersion }}</span>
          </template></el-table-column>
          <el-table-column prop="baselineEmploymentCount" label="建档" width="82" align="right" />
          <el-table-column prop="periodEmploymentCount" label="调查" width="82" align="right" />
          <el-table-column prop="netChange" label="净变化" width="85" align="right" />
        </el-table>
        <div class="form-actions"><el-button v-if="can('BATCH_CREATE')" type="primary" :disabled="acting || !readiness.canSubmit" @click="action = 'freeze'">确认冻结并排队</el-button></div>
      </el-card>
    </template>
    <el-alert v-if="actionMessage" :title="actionMessage" type="success" show-icon :closable="false" />
    <el-alert v-if="actionError" :title="actionError" type="error" show-icon :closable="false" />
    <ul v-if="actionDetails.length"><li v-for="(detail, i) in actionDetails" :key="i">{{ detail }}</li></ul>

    <el-card shadow="never" class="business-card" v-loading="historyBusy">
      <template #header><h2>上报批次历史</h2></template>
      <el-form inline @submit.prevent="applyHistoryFilters">
        <el-form-item label="调查期"><el-select v-model="filters.periodCode" clearable filterable placeholder="全部调查期" style="width:200px"><el-option v-for="p in periods" :key="p.code" :value="p.code" :label="p.label" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部状态" style="width:175px"><el-option v-for="(label, key) in statusLabels" :key="key" :value="key" :label="label" /></el-select></el-form-item>
        <el-button native-type="submit">查询历史</el-button>
      </el-form>
      <el-alert v-if="historyError" :title="historyError" type="error" :closable="false" />
      <el-table :data="batchList" row-key="batchId" empty-text="暂无匹配批次">
        <el-table-column prop="batchId" label="批次号" min-width="180" />
        <el-table-column prop="periodCode" label="调查期" min-width="140" />
        <el-table-column label="报文与接收模式" min-width="190"><template #default="{ row }">{{ formatLabel(row) }}</template></el-table-column>
        <el-table-column label="状态" min-width="155"><template #default="{ row }">{{ statusLabels[row.status as BatchStatusV2] ?? row.status }}</template></el-table-column>
        <el-table-column label="真实 / 代填" width="118"><template #default="{ row }">{{ row.realCount ?? row.enterpriseCount }} / {{ row.proxyCount ?? 0 }}</template></el-table-column>
        <el-table-column label="冻结时间（北京时间）" min-width="177"><template #default="{ row }">{{ formatBeijingTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="105" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openBatch(row.batchId)">查看批次</el-button></template></el-table-column>
      </el-table>
      <el-pagination :current-page="page" :total="total" :page-size="20" :disabled="historyBusy" layout="total,prev,pager,next" @current-change="loadHistory" />
    </el-card>

    <el-dialog v-model="confirming" :title="action ? actionLabels[action] : ''" width="min(560px,94vw)" :close-on-click-modal="!acting" :close-on-press-escape="!acting" :show-close="!acting">
      <p v-if="action === 'freeze'">冻结本期 {{ readiness?.previewSummary.enterpriseCount }} 家企业的 XML，其中代填 {{ readiness?.previewSummary.proxyCount }} 家。冻结后，入批真实报表与代填记录立即锁定，批次进入发送队列。</p>
      <p v-else-if="action === 'revoke'">将撤销本期全部未冻结代填。真实报表继续保留。</p>
      <p v-else>将按当前缺报和真实来源生成或刷新整期代填记录。</p>
      <template #footer>
        <el-button :disabled="acting" @click="action = undefined">取消</el-button>
        <el-button type="primary" :loading="acting" @click="applyAction">{{ action ? actionLabels[action] : '确认' }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawer" title="模拟批次详情" size="min(980px, 96vw)" :close-on-click-modal="!retrying">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <div class="heading-actions"><el-button :disabled="detailBusy || retrying" @click="readDetail(true)">刷新批次</el-button>
        <el-button v-if="canRetry" type="primary" :disabled="detailBusy" :loading="retrying" @click="retry">重试原批次</el-button></div>
      <div v-loading="detailBusy" class="batch-detail">
        <template v-if="batch">
          <h2>{{ batch.batchId }}</h2>
          <p>{{ formatLabel(batch) }} · {{ batch.status === 'MOCK_ACCEPTED' && confirmedReceipt ? '模拟国家后端已接收' : statusLabels[batch.status] ?? batch.status }}</p>
          <p v-if="batch.payloadFormat !== 'XML'" class="muted">V1 历史批次仅供查看。</p>
          <p v-if="pollPaused" class="muted">已暂停自动刷新，可点击「刷新批次」继续查看。</p>
          <p v-if="batch.lastError" role="alert">{{ batch.lastError }}</p>
          <section v-if="batch.chunkProgress">
            <h3>分片与组装</h3>
            <p>队列已确认 {{ batch.chunkProgress.brokerConfirmedCount }} / {{ batch.chunkProgress.chunkCount }} 片</p>
            <p>模拟端已存储 {{ batch.chunkProgress.receiverStoredCount }} / {{ batch.chunkProgress.chunkCount }} 片</p>
            <p>组装时间 {{ formatBeijingTime(batch.chunkProgress.assembledAt) }}（北京时间）</p>
            <p v-if="batch.chunkProgress.lastError">{{ batch.chunkProgress.lastError }}</p>
          </section>
          <h3>模拟接收回执</h3>
          <template v-if="confirmedReceipt">
            <p>回执号 {{ confirmedReceipt.mockReceiptId }} · 模拟接收 {{ confirmedReceipt.acceptedEnterpriseCount }} 家</p>
            <p v-if="'chunkCount' in confirmedReceipt">真实 {{ confirmedReceipt.realCount }} 家 · 代填 {{ confirmedReceipt.proxyCount }} 家 · {{ confirmedReceipt.chunkCount }} 片</p>
            <p>接收时间 {{ formatBeijingTime(confirmedReceipt.receivedAt) }}（北京时间）</p>
            <p class="hash">回执 SHA-256 {{ confirmedReceipt.payloadSha256 }}</p>
          </template>
          <p v-else class="muted">暂未收到模拟端回执。</p>
          <h3>发送尝试</h3>
          <el-table :data="batch.attempts" empty-text="暂无发送尝试">
            <el-table-column prop="attemptNo" label="序号" width="70" />
            <el-table-column label="开始（北京时间）" min-width="163"><template #default="{ row }">{{ formatBeijingTime(row.startedAt) }}</template></el-table-column>
            <el-table-column label="结果" min-width="100"><template #default="{ row }">{{ row.result === 'ACCEPTED' ? '处理完成' : row.result === 'FAILED' ? '失败' : '处理中' }}</template></el-table-column>
            <el-table-column prop="errorSummary" label="错误说明" min-width="155" />
          </el-table>
          <h3>冻结报文</h3>
          <p class="hash">SHA-256 {{ batch.payloadSha256 }}</p>
          <details v-if="batch.payloadXml || batch.payload">
            <summary>查看冻结 {{ batch.payloadXml ? 'XML 原文' : 'JSON 历史报文' }}</summary>
            <pre>{{ batch.payloadXml ?? JSON.stringify(batch.payload, null, 2) }}</pre>
          </details>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.national-v2 h2 { margin: 0; font-size: 18px; }
.national-v2 h3 { margin: 18px 0 8px; }
.count-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; border: 1px solid var(--line); background: var(--line); }
.count-strip > div { padding: 10px 12px; background: var(--canvas); }
.count-strip dd { margin: 3px 0 0; font-size: 22px; font-weight: 650; }
.national-blockers { padding-inline-start: 28px; color: var(--amber); }
.batch-detail { min-height: 100px; }
.batch-detail h2 { overflow-wrap: anywhere; }
.hash { overflow-wrap: anywhere; }
summary { cursor: pointer; color: var(--accent); }
pre { max-height: 320px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line); background: var(--canvas); padding: 12px; }
</style>
