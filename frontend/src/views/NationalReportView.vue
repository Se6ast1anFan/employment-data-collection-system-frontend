<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { nationalProvider as api } from '@/services/national'
import { ApiError } from '@/services/api'
import { formatBeijingTime } from '@/utils/filing'
import { batchStatusLabels, canRetryNational, nationalInFlight } from '@/utils/national'
import { orderedPeriods } from '@/utils/week6'
import NationalPayloadPreview from '@/components/NationalPayloadPreview.vue'
import type { SurveyPeriod } from '@/types/report'
import type { BatchStatus, NationalBatchDetail, NationalBatchQuery, NationalBatchSummary, NationalReadiness } from '@/types/national'

const auth = useAuthStore()
const route = useRoute()
const periods = ref<SurveyPeriod[]>([])
const statuses = reactive<Record<string, NationalReadiness>>({})
const statusErrors = reactive<Record<string, string>>({})
const loadingPeriods = ref(false)
const periodError = ref('')
const selectedCode = ref('')
const preview = computed(() => statuses[selectedCode.value])
const confirming = ref<NationalReadiness>()
const confirmOpen = ref(false)
const acknowledgeMissing = ref(false)
const creating = ref(false)
const creationError = ref('')
const creationBlockers = ref<string[]>([])
const loadingPreview = ref(false)

const batches = ref<NationalBatchSummary[]>([])
const total = ref(0)
const page = ref(1)
const historyBusy = ref(false)
const historyError = ref('')
const historyFilters = reactive<{ periodCode?: string; status?: BatchStatus }>({})
let historyQuery: NationalBatchQuery = { page: 0, size: 20 }
let historyRequest = 0

const batchId = ref('')
const drawerOpen = ref(false)
const batch = ref<NationalBatchDetail>()
const detailBusy = ref(false)
const retrying = ref(false)
const detailError = ref('')
const retryError = ref('')
const pollPaused = ref(false)
let detailRequest: AbortController | undefined
let pollTimer: ReturnType<typeof setTimeout> | undefined
let pollCount = 0
let disposed = false

const pendingCount = (data: NationalReadiness) => {
  const c = data.counts
  return c.pendingCityCount + c.pendingProvinceCount + c.returnedCityCount + c.returnedProvinceCount
}

async function fetchReadiness(code: string) {
  delete statusErrors[code]
  try {
    statuses[code] = (await api.readiness(code, auth.token!)).data
  } catch (e) {
    delete statuses[code]
    statusErrors[code] = (e as Error).message
  }
}
async function loadPeriods() {
  if (loadingPeriods.value || creating.value || loadingPreview.value) return
  loadingPeriods.value = true
  periodError.value = ''
  try {
    const items = (await api.periods(auth.token!)).data.items
    periods.value = orderedPeriods(items).reverse()
    if (selectedCode.value && !items.some(period => period.code === selectedCode.value)) selectedCode.value = ''
    if (!selectedCode.value) selectedCode.value = periods.value.find(period => !period.legacy)?.code ?? periods.value[0]?.code ?? ''
    const codes = [...new Set([selectedCode.value, ...periods.value.map(period => period.code)].filter(Boolean))]
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, codes.length) }, async () => {
      while (!disposed && cursor < codes.length) await fetchReadiness(codes[cursor++]!)
    }))
  } catch (e) { periodError.value = (e as Error).message }
  finally { loadingPeriods.value = false }
}
function selectPeriod(code: string) {
  selectedCode.value = code
  creationError.value = ''
  creationBlockers.value = []
  if (!loadingPeriods.value) void refreshPreview()
}
async function refreshPreview() {
  if (!selectedCode.value || loadingPreview.value || loadingPeriods.value) return
  loadingPreview.value = true
  try { await fetchReadiness(selectedCode.value) }
  finally { loadingPreview.value = false }
}
async function loadHistory(requestedPage = page.value) {
  const seq = ++historyRequest
  historyBusy.value = true
  historyError.value = ''
  try {
    const data = (await api.list({ ...historyQuery, page: requestedPage - 1 }, auth.token!)).data
    if (disposed || seq !== historyRequest) return
    const last = Math.max(1, Math.ceil(data.total / historyQuery.size))
    if (requestedPage > last) { await loadHistory(last); return }
    page.value = data.page + 1
    total.value = data.total
    batches.value = data.items
  } catch (e) {
    if (disposed || seq !== historyRequest) return
    historyError.value = (e as Error).message
    batches.value = []
    total.value = 0
  } finally { if (seq === historyRequest) historyBusy.value = false }
}
function applyHistoryFilters() {
  historyQuery = { ...historyFilters, page: 0, size: 20 }
  void loadHistory(1)
}

function stopPoll() {
  clearTimeout(pollTimer)
  pollTimer = undefined
  detailRequest?.abort()
  detailRequest = undefined
  detailBusy.value = false
}
function schedulePoll(status: BatchStatus) {
  if (!nationalInFlight(status) || !drawerOpen.value || disposed) return
  if (pollCount >= 24) { pollPaused.value = true; return }
  pollTimer = setTimeout(() => { pollCount++; void refreshBatch() }, 2000)
}
async function refreshBatch(manual = false) {
  if (!batchId.value || detailBusy.value || retrying.value || !drawerOpen.value) return
  clearTimeout(pollTimer)
  if (manual) { pollCount = 0; pollPaused.value = false }
  const controller = new AbortController()
  const id = batchId.value
  detailRequest = controller
  detailBusy.value = true
  detailError.value = ''
  try {
    const oldStatus = batch.value?.status
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
    const data = (await api.detail(id, auth.token!, signal)).data
    if (controller.signal.aborted || disposed || batchId.value !== id) return
    batch.value = data
    const readiness = statuses[data.periodCode]
    if (readiness?.existingBatch?.batchId === id) readiness.existingBatch.status = data.status
    if (oldStatus !== data.status) void loadHistory()
    schedulePoll(data.status)
  } catch (e) {
    if (!controller.signal.aborted && !disposed) detailError.value = (e as Error).message
  } finally {
    if (detailRequest === controller) { detailRequest = undefined; detailBusy.value = false }
  }
}
function openBatch(id: string) {
  stopPoll()
  batch.value = undefined
  detailError.value = retryError.value = ''
  batchId.value = id
  drawerOpen.value = true
  void refreshBatch(true)
}
watch(drawerOpen, open => { if (!open) stopPoll() })
async function retryBatch() {
  const current = batch.value
  if (!current || !canRetryNational(current.status) || detailBusy.value || retrying.value) return
  stopPoll()
  retrying.value = true
  retryError.value = ''
  try { await api.retry(current.batchId, auth.token!) }
  catch (e) { retryError.value = (e as Error).message }
  finally { retrying.value = false }
  await refreshBatch(true)
}

function showConfirmation() {
  if (!preview.value?.canSubmit || creating.value || loadingPreview.value || loadingPeriods.value) return
  confirming.value = preview.value
  acknowledgeMissing.value = false
  creationError.value = ''
  creationBlockers.value = []
  confirmOpen.value = true
}
async function createBatch() {
  const selected = confirming.value
  if (!selected?.canSubmit || creating.value || (selected.requiresMissingAcknowledgement && !acknowledgeMissing.value)) return
  creating.value = true
  creationError.value = ''
  creationBlockers.value = []
  const code = selected.period.periodCode
  try {
    const data = (await api.create({ periodCode: code, acknowledgeMissing: acknowledgeMissing.value }, auth.token!)).data
    if (disposed) return
    confirmOpen.value = false
    delete statuses[code]
    openBatch(data.batchId)
    await fetchReadiness(code)
    void loadHistory(1)
  } catch (e) {
    if (disposed) return
    const data = e instanceof ApiError ? e.data : undefined
    creationError.value = (e as Error).message
    creationBlockers.value = [
      ...(data?.blockers?.map(blocker => blocker.message) ?? []),
      ...(e instanceof ApiError ? Object.values(e.fieldErrors) : []),
    ]
    confirmOpen.value = false
    delete statuses[code]
    if (e instanceof ApiError && e.status === 409 && data?.reasonCode === 'BATCH_EXISTS' && data.existingBatchId) openBatch(data.existingBatchId)
    await fetchReadiness(code)
  } finally { creating.value = false }
}
function readRoute() {
  if (typeof route.query.periodCode === 'string') selectedCode.value = route.query.periodCode
  if (typeof route.query.batchId === 'string' && (!drawerOpen.value || route.query.batchId !== batchId.value)) openBatch(route.query.batchId)
}
onMounted(() => {
  readRoute()
  void loadPeriods()
  void loadHistory()
})
watch(() => [route.query.periodCode, route.query.batchId], () => {
  readRoute()
  void refreshPreview()
})
onBeforeUnmount(() => { disposed = true; stopPoll() })
</script>

<template>
  <section class="national-page">
    <div class="page-heading">
      <div><h1>国家上报 <el-tag type="warning">模拟接口 · MOCK</el-tag></h1><p>选择调查期，核对预览并确认生成冻结批次。</p></div>
      <el-button :loading="loadingPeriods" :disabled="creating || loadingPreview" @click="loadPeriods">刷新调查期</el-button>
    </div>
    <el-alert title="V1 使用项目内部模拟接收端，真实国家平台尚未接入。" type="warning" :closable="false" show-icon />

    <el-card class="business-card" shadow="never" v-loading="loadingPeriods">
      <template #header><strong>调查期列表</strong></template>
      <el-alert v-if="periodError" :title="periodError" type="error" :closable="false" />
      <el-table :data="periods" row-key="code" empty-text="暂无调查期">
        <el-table-column label="调查期" min-width="175"><template #default="{ row }">{{ row.label }}（{{ row.code }}）</template></el-table-column>
        <el-table-column label="填报截止（北京时间）" min-width="185"><template #default="{ row }">{{ formatBeijingTime(statuses[row.code]?.period.closeAt ?? row.closeAt) }}</template></el-table-column>
        <el-table-column label="省审通过且有效" width="125"><template #default="{ row }">{{ statuses[row.code]?.counts.approvedCount ?? '—' }}</template></el-table-column>
        <el-table-column label="待处理" width="85"><template #default="{ row }">{{ statuses[row.code] ? pendingCount(statuses[row.code]!) : '—' }}</template></el-table-column>
        <el-table-column label="缺报" width="80"><template #default="{ row }">{{ statuses[row.code]?.counts.missingCount ?? '—' }}</template></el-table-column>
        <el-table-column label="上报门槛" min-width="220">
          <template #default="{ row }">
            <span v-if="statusErrors[row.code]">读取失败：{{ statusErrors[row.code] }}</span>
            <el-tag v-else-if="statuses[row.code]?.canSubmit" type="success">可上报</el-tag>
            <span v-else-if="statuses[row.code]">{{ statuses[row.code]!.blockers.map(b => b.message).join('、') || '暂不可上报' }}</span>
            <span v-else>待读取</span>
          </template>
        </el-table-column>
        <el-table-column label="最近批次" min-width="145"><template #default="{ row }">
          <el-button v-if="statuses[row.code]?.existingBatch" link type="primary" @click="openBatch(statuses[row.code]!.existingBatch!.batchId)">{{ batchStatusLabels[statuses[row.code]!.existingBatch!.status] }}</el-button>
          <span v-else>{{ statuses[row.code] ? '暂无批次' : '—' }}</span>
        </template></el-table-column>
        <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }">
          <el-button link type="primary" :disabled="creating || loadingPreview" @click="selectPeriod(row.code)">{{ selectedCode === row.code ? '刷新预览' : '查看预览' }}</el-button>
        </template></el-table-column>
      </el-table>
    </el-card>

    <el-card class="business-card" shadow="never" v-loading="loadingPreview">
      <template #header><strong>上报预览{{ selectedCode ? ' · ' + selectedCode : '' }}</strong></template>
      <el-alert v-if="creationError" :title="creationError" type="error" :closable="false" />
      <ul v-if="creationBlockers.length"><li v-for="(message, index) in creationBlockers" :key="index">{{ message }}</li></ul>
      <el-alert v-if="selectedCode && statusErrors[selectedCode]" :title="statusErrors[selectedCode]" type="error" :closable="false" />
      <template v-if="preview">
        <ul v-if="preview.blockers.length" class="blockers"><li v-for="blocker in preview.blockers" :key="blocker.code">{{ blocker.message }}</li></ul>
        <p>以下为当前有效数据预览。批次建立后，请在详情查看冻结报文。</p>
        <NationalPayloadPreview :preview="preview.preview" />
        <h3>排除数据</h3>
        <p>待市审 {{ preview.counts.pendingCityCount }} · 待省审 {{ preview.counts.pendingProvinceCount }} · 市级退回 {{ preview.counts.returnedCityCount }} · 省级退回 {{ preview.counts.returnedProvinceCount }} · 已作废 {{ preview.counts.voidedCount }} · 已备案未上报 {{ preview.counts.missingCount }}</p>
        <el-table :data="preview.missingEnterprises" row-key="enterpriseOrgId" empty-text="暂无缺报企业">
          <el-table-column prop="enterpriseName" label="缺报企业" min-width="180" />
          <el-table-column prop="cityCode" label="所属市代码" />
          <el-table-column prop="regionCode" label="地区代码" />
          <el-table-column label="本期状态"><template #default="{ row }">{{ row.reportStatus === 'DRAFT' ? '草稿未提交' : '本期未上报' }}</template></el-table-column>
        </el-table>
        <div class="form-actions">
          <el-button v-if="preview.existingBatch" @click="openBatch(preview.existingBatch.batchId)">查看现有批次</el-button>
          <el-button type="primary" :loading="creating" :disabled="!preview.canSubmit || loadingPeriods || loadingPreview" @click="showConfirmation">确认上报</el-button>
        </div>
      </template>
      <el-empty v-else-if="!loadingPeriods && !loadingPreview && !statusErrors[selectedCode]" description="选择调查期后查看预览" :image-size="60" />
    </el-card>

    <el-card class="business-card" shadow="never" v-loading="historyBusy">
      <template #header><strong>模拟批次历史</strong></template>
      <el-form inline :disabled="historyBusy" @submit.prevent="applyHistoryFilters">
        <el-form-item label="调查期"><el-select v-model="historyFilters.periodCode" style="width:220px" clearable placeholder="全部调查期">
          <el-option v-for="period in periods" :key="period.code" :label="period.label" :value="period.code" />
        </el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="historyFilters.status" style="width:170px" clearable placeholder="全部状态">
          <el-option v-for="(label, key) in batchStatusLabels" :key="key" :label="label" :value="key" />
        </el-select></el-form-item>
        <el-button native-type="submit">查询批次</el-button>
      </el-form>
      <el-alert v-if="historyError" :title="historyError" type="error" :closable="false" />
      <el-table :data="batches" row-key="batchId" empty-text="暂无符合条件的模拟批次">
        <el-table-column prop="batchId" label="批次号" min-width="180" />
        <el-table-column prop="periodCode" label="调查期" min-width="140" />
        <el-table-column label="模式" width="95"><template #default>MOCK</template></el-table-column>
        <el-table-column label="状态" min-width="135"><template #default="{ row }">{{ batchStatusLabels[row.status as BatchStatus] || row.status }}</template></el-table-column>
        <el-table-column label="最近发送（北京时间）" min-width="185"><template #default="{ row }">{{ formatBeijingTime(row.lastSentAt) }}</template></el-table-column>
        <el-table-column prop="enterpriseCount" label="企业数" width="90" />
        <el-table-column prop="retryCount" label="重试次数" width="95" />
        <el-table-column prop="payloadSha256" label="SHA-256" min-width="170" show-overflow-tooltip />
        <el-table-column label="详情" width="95" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openBatch(row.batchId)">查看</el-button></template></el-table-column>
      </el-table>
      <el-pagination :current-page="page" :total="total" :page-size="20" :disabled="historyBusy" layout="total,prev,pager,next" @current-change="loadHistory" />
    </el-card>

    <el-dialog v-model="confirmOpen" title="确认模拟上报" width="min(580px, 94vw)" :close-on-click-modal="!creating" :close-on-press-escape="!creating" :show-close="!creating">
      <template v-if="confirming">
        <p>即将模拟上报 {{ confirming.preview.summary.enterpriseCount }} 家企业（{{ confirming.period.periodCode }}）。确认后，批内报表立即锁定，不能作废或修订。</p>
        <el-checkbox v-if="confirming.requiresMissingAcknowledgement" v-model="acknowledgeMissing" :disabled="creating">已知晓本期 {{ confirming.counts.missingCount }} 家企业缺报</el-checkbox>
      </template>
      <template #footer>
        <el-button :disabled="creating" @click="confirmOpen=false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="confirming?.requiresMissingAcknowledgement && !acknowledgeMissing" @click="createBatch">确认模拟上报</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawerOpen" title="模拟批次详情" size="min(1060px, 96vw)" :close-on-click-modal="!retrying" :close-on-press-escape="!retrying" :show-close="!retrying">
      <el-tag type="warning">模拟接口 · MOCK</el-tag>
      <h2>{{ batchId }}</h2>
      <el-alert v-if="detailError || retryError" :title="detailError || retryError" type="error" :closable="false" />
      <p v-if="pollPaused">自动刷新已暂停，可手动读取最新批次状态。</p>
      <div class="form-actions">
        <el-button :disabled="detailBusy || retrying" @click="refreshBatch(true)">刷新详情</el-button>
        <el-button v-if="batch && canRetryNational(batch.status)" type="primary" :disabled="detailBusy || !!detailError" :loading="retrying" @click="retryBatch">继续发送同一批次</el-button>
      </div>
      <template v-if="batch">
        <p>{{ batchStatusLabels[batch.status] }} · {{ batch.enterpriseCount }} 家 · 重试 {{ batch.retryCount }} 次</p>
        <p>创建 {{ formatBeijingTime(batch.createdAt) }} · 最近发送 {{ formatBeijingTime(batch.lastSentAt) }}（北京时间）</p>
        <p class="hash">SHA-256 {{ batch.payloadSha256 }}</p>
        <el-alert v-if="batch.lastError" :title="batch.lastError" type="error" :closable="false" />
        <h3>冻结报文与企业明细</h3>
        <p>报文版本 {{ batch.payload.schemaVersion }} · 省份 {{ batch.payload.provinceCode }} · 调查期 {{ batch.payload.periodCode }} · 冻结时间 {{ formatBeijingTime(batch.payload.generatedAt) }}</p>
        <p>调查期范围 {{ formatBeijingTime(batch.payload.periodStartAt) }} 至 {{ formatBeijingTime(batch.payload.periodEndExclusiveAt) }}（不含结束时刻，北京时间）</p>
        <NationalPayloadPreview :preview="batch.payload" />
        <details class="payload-json">
          <summary>查看冻结 JSON</summary>
          <p>以下为格式化预览。SHA-256 由服务端根据冻结的原始报文字节生成。</p>
          <pre>{{ JSON.stringify(batch.payload, null, 2) }}</pre>
        </details>
        <h3>发送尝试</h3>
        <el-table :data="batch.attempts" row-key="attemptNo" empty-text="暂无发送尝试">
          <el-table-column prop="attemptNo" label="序号" width="70" />
          <el-table-column label="开始时间"><template #default="{ row }">{{ formatBeijingTime(row.startedAt) }}</template></el-table-column>
          <el-table-column label="结束时间"><template #default="{ row }">{{ formatBeijingTime(row.finishedAt) }}</template></el-table-column>
          <el-table-column label="结果"><template #default="{ row }">{{ row.result === 'ACCEPTED' ? '模拟已接收' : row.result === 'FAILED' ? '失败' : '发送中' }}</template></el-table-column>
          <el-table-column prop="errorSummary" label="错误摘要" />
          <el-table-column prop="mockReceiptId" label="模拟回执号" />
        </el-table>
        <h3>模拟回执</h3>
        <template v-if="batch.receipt">
          <p>批次 {{ batch.receipt.batchId }} · 回执 {{ batch.receipt.mockReceiptId }} · 模拟已接收 {{ batch.receipt.acceptedEnterpriseCount }} 家</p>
          <p>接收时间 {{ formatBeijingTime(batch.receipt.receivedAt) }}（北京时间）</p>
          <p class="hash">回执 SHA-256 {{ batch.receipt.payloadSha256 }}</p>
        </template>
        <p v-else>暂无模拟回执。</p>
      </template>
      <p v-else-if="detailBusy">正在读取批次详情…</p>
    </el-drawer>
  </section>
</template>

<style scoped>
.hash { overflow-wrap: anywhere; font-family: ui-monospace, Consolas, monospace; }
.blockers { color: #8b4c12; line-height: 1.65; }
.payload-json { margin: 16px 0; }
.payload-json summary { cursor: pointer; color: #2768a6; }
.payload-json pre { overflow: auto; max-height: 320px; padding: 12px; background: #f4f6f9; }
</style>
