<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ProfileSnapshot from '@/components/ProfileSnapshot.vue'
import RegionPicker from '@/components/RegionPicker.vue'
import { ApiError } from '@/services/api'
import { filingProvider } from '@/services/filing'
import { useAuthStore } from '@/stores/auth'
import type { FilingDetailData, FilingListData, FilingVersionData, Period } from '@/types/filing'
import { filingResultLabels, filingStatusLabels, formatBeijingTime, formatRegion } from '@/utils/filing'

const auth = useAuthStore()
const loading = ref(false)
const detailLoading = ref(false)
const reviewing = ref(false)
const exporting = ref(false)
const data = ref<FilingListData | null>(null)
const periods = ref<Period[]>([])
const detail = ref<FilingDetailData | null>(null)
const detailVisible = ref(false)
const snapshot = ref<FilingVersionData | null>(null)
const snapshotVisible = ref(false)
const returnVisible = ref(false)
const returnReason = ref('')
const returnError = ref('')
const filters = reactive({
  status: 'PENDING' as 'PENDING' | 'APPROVED', regionCode: null as string | null,
  periodCode: null as string | null, page: 0, size: 20,
})
const currentPage = computed({
  get: () => filters.page + 1,
  set: (value: number) => { filters.page = value - 1 },
})

async function load() {
  loading.value = true
  try {
    const query = {
      status: filters.status, regionCode: filters.regionCode || undefined,
      page: filters.page, size: filters.size,
      ...(filters.status === 'APPROVED' && filters.periodCode ? { periodCode: filters.periodCode } : {}),
    }
    data.value = (await filingProvider.listFilings(query, auth.token!)).data
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '备案列表加载失败') }
  finally { loading.value = false }
}

async function loadPeriods() {
  try { periods.value = (await filingProvider.getPeriods(auth.token!)).data }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '调查期加载失败') }
}

async function openDetail(filingId: string) {
  detailVisible.value = true
  detailLoading.value = true
  try { detail.value = (await filingProvider.getProvinceFiling(filingId, auth.token!)).data }
  catch (error) { detailVisible.value = false; ElMessage.error(error instanceof Error ? error.message : '备案详情加载失败') }
  finally { detailLoading.value = false }
}

async function showVersion(version: number) {
  if (!detail.value) return
  try {
    snapshot.value = (await filingProvider.getProvinceVersion(detail.value.filingId, version, auth.token!)).data
    snapshotVisible.value = true
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '历史版本加载失败') }
}

async function refreshAfterConflict(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 409) return false
  ElMessage.warning('备案状态或版本已变化，已为你刷新最新数据')
  if (detail.value) await openDetail(detail.value.filingId)
  await load()
  return true
}

async function approve() {
  if (!detail.value) return
  try { await ElMessageBox.confirm('确认通过当前版本备案吗？通过后本周不可修改。', '通过备案', { type: 'warning' }) }
  catch { return }
  reviewing.value = true
  try {
    await filingProvider.approve(detail.value.filingId, { expectedVersion: detail.value.currentVersion }, auth.token!)
    ElMessage.success('备案已通过')
    detailVisible.value = false
    await load()
  } catch (error) {
    if (!(await refreshAfterConflict(error))) ElMessage.error(error instanceof Error ? error.message : '审核失败')
  } finally { reviewing.value = false }
}

function openReturn() {
  returnReason.value = ''
  returnError.value = ''
  returnVisible.value = true
}

async function confirmReturn() {
  if (!detail.value) return
  const reason = returnReason.value.trim()
  if (!reason || reason.length > 500) { returnError.value = '请输入 1 至 500 字退回理由'; return }
  reviewing.value = true
  try {
    await filingProvider.returnFiling(detail.value.filingId, { expectedVersion: detail.value.currentVersion, reason }, auth.token!)
    ElMessage.success('备案已退回企业修改')
    returnVisible.value = false
    detailVisible.value = false
    await load()
  } catch (error) {
    if (error instanceof ApiError && error.fieldErrors.reason) returnError.value = error.fieldErrors.reason
    if (!(await refreshAfterConflict(error))) ElMessage.error(error instanceof Error ? error.message : '退回失败')
  } finally { reviewing.value = false }
}

function resetFilters() {
  filters.regionCode = null
  filters.periodCode = null
  filters.page = 0
  void load()
}

async function exportExcel() {
  exporting.value = true
  try {
    const file = await filingProvider.exportFilings({
      regionCode: filters.regionCode || undefined, periodCode: filters.periodCode || undefined,
    }, auth.token!)
    const url = URL.createObjectURL(file.blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = file.fileName; anchor.click()
    URL.revokeObjectURL(url)
    ElMessage.success('Excel 下载已开始')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败') }
  finally { exporting.value = false }
}

watch(() => filters.status, () => {
  filters.page = 0
  if (filters.status === 'PENDING') filters.periodCode = null
  void load()
})

onMounted(() => { void Promise.all([load(), loadPeriods()]) })
</script>

<template>
  <section>
    <div class="page-heading"><div><p class="eyebrow">第二周企业备案</p><h1>省级备案管理</h1><p>处理待审备案，查询并导出已备案企业。</p></div><el-button @click="load">刷新</el-button></div>
    <el-card shadow="never" class="business-card">
      <el-tabs v-model="filters.status">
        <el-tab-pane label="待审核" name="PENDING" />
        <el-tab-pane label="已备案" name="APPROVED" />
      </el-tabs>
      <el-form inline class="filter-form">
        <el-form-item label="所属地区"><RegionPicker v-model="filters.regionCode" /></el-form-item>
        <el-form-item v-if="filters.status === 'APPROVED'" label="调查期"><el-select v-model="filters.periodCode" clearable placeholder="全部期次" style="width:220px"><el-option v-for="item in periods" :key="item.code" :label="item.label" :value="item.code" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" @click="filters.page=0; load()">查询</el-button><el-button @click="resetFilters">清除</el-button><el-button v-if="filters.status === 'APPROVED'" :loading="exporting" @click="exportExcel">导出 Excel</el-button></el-form-item>
      </el-form>
      <el-alert v-if="filters.status === 'APPROVED'" title="调查期仅用于“截至期末已备案”筛选，不表示企业参与该期报送。" type="info" :closable="false" />
      <el-table v-loading="loading" :data="data?.items" empty-text="暂无符合条件的备案记录">
        <el-table-column prop="enterpriseName" label="企业名称" min-width="180" />
        <el-table-column prop="organizationCode" label="组织机构代码" width="150" />
        <el-table-column label="所属地区" min-width="180"><template #default="scope">{{ formatRegion(scope.row.region) }}</template></el-table-column>
        <el-table-column label="版本" width="80"><template #default="scope">v{{ scope.row.currentVersion }}</template></el-table-column>
        <el-table-column label="提交时间" width="180"><template #default="scope">{{ formatBeijingTime(scope.row.submittedAt) }}</template></el-table-column>
        <el-table-column v-if="filters.status === 'APPROVED'" label="通过时间" width="180"><template #default="scope">{{ formatBeijingTime(scope.row.reviewedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="100" fixed="right"><template #default="scope"><el-button link type="primary" @click="openDetail(scope.row.filingId)">查看详情</el-button></template></el-table-column>
      </el-table>
      <el-pagination v-if="(data?.total ?? 0) > 0" v-model:current-page="currentPage" :page-size="filters.size" :total="data?.total" layout="total, prev, pager, next" @current-change="load" />
    </el-card>

    <el-drawer v-model="detailVisible" title="备案详情" size="min(880px, 94vw)">
      <div v-loading="detailLoading">
        <el-descriptions v-if="detail" :column="1" border class="detail-summary">
          <el-descriptions-item label="状态"><el-tag>{{ filingStatusLabels[detail.status] }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="当前版本">v{{ detail.currentVersion }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatBeijingTime(detail.submittedAt) }}</el-descriptions-item>
          <el-descriptions-item label="审核时间">{{ formatBeijingTime(detail.reviewedAt) }}</el-descriptions-item>
          <el-descriptions-item label="退回理由">{{ detail.returnReason || '—' }}</el-descriptions-item>
        </el-descriptions>
        <ProfileSnapshot v-if="detail" :profile="detail.profile" :region="detail.region" />
        <h3 v-if="detail">审核历史</h3>
        <el-table v-if="detail" :data="detail.history" size="small">
          <el-table-column prop="version" label="版本" width="70" />
          <el-table-column label="结果" width="100"><template #default="scope">{{ filingResultLabels[scope.row.result as keyof typeof filingResultLabels] }}</template></el-table-column>
          <el-table-column label="提交时间"><template #default="scope">{{ formatBeijingTime(scope.row.submittedAt) }}</template></el-table-column>
          <el-table-column prop="reason" label="退回理由" show-overflow-tooltip />
          <el-table-column label="操作" width="90"><template #default="scope"><el-button link type="primary" @click="showVersion(scope.row.version)">快照</el-button></template></el-table-column>
        </el-table>
        <div v-if="detail?.status === 'PENDING'" class="form-actions"><el-button type="danger" plain :loading="reviewing" @click="openReturn">退回</el-button><el-button type="primary" :loading="reviewing" @click="approve">通过</el-button></div>
      </div>
    </el-drawer>

    <el-dialog v-model="returnVisible" title="退回备案" width="min(560px, 92vw)"><el-form label-position="top"><el-form-item label="退回理由" required :error="returnError"><el-input v-model="returnReason" type="textarea" :rows="5" maxlength="500" show-word-limit /></el-form-item></el-form><template #footer><el-button @click="returnVisible=false">取消</el-button><el-button type="danger" :loading="reviewing" @click="confirmReturn">确认退回</el-button></template></el-dialog>
    <el-dialog v-model="snapshotVisible" :title="`备案历史版本 ${snapshot?.version ?? ''}`" width="min(900px, 92vw)"><ProfileSnapshot v-if="snapshot" :profile="snapshot.profile" :region="snapshot.region" /><template #footer><el-button @click="snapshotVisible=false">关闭</el-button></template></el-dialog>
  </section>
</template>
