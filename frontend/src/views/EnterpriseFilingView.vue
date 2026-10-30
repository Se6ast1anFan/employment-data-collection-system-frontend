<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import ProfileSnapshot from '@/components/ProfileSnapshot.vue'
import { filingProvider } from '@/services/filing'
import { useAuthStore } from '@/stores/auth'
import type { FilingStatusData, FilingVersionData } from '@/types/filing'
import { filingResultLabels, filingStatusLabels, formatBeijingTime } from '@/utils/filing'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const status = ref<FilingStatusData | null>(null)
const snapshot = ref<FilingVersionData | null>(null)
const snapshotVisible = ref(false)
const statusText = computed(() => status.value?.status ? filingStatusLabels[status.value.status] : '尚未提交')

async function load() {
  loading.value = true
  try { status.value = (await filingProvider.getFiling(auth.token!)).data }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '备案状态加载失败') }
  finally { loading.value = false }
}

async function showVersion(version: number) {
  try {
    snapshot.value = (await filingProvider.getEnterpriseVersion(version, auth.token!)).data
    snapshotVisible.value = true
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '历史版本加载失败') }
}

onMounted(load)
</script>

<template>
  <section v-loading="loading">
    <div class="page-heading"><div><p class="eyebrow">第二周企业备案</p><h1>备案状态</h1><p>查看提交、审核、退回原因及全部历史版本。</p></div><el-button @click="load">刷新</el-button></div>
    <el-card shadow="never" class="business-card">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="当前状态"><el-tag>{{ statusText }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="当前版本">{{ status?.currentVersion ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">{{ formatBeijingTime(status?.submittedAt) }}</el-descriptions-item>
        <el-descriptions-item label="审核时间">{{ formatBeijingTime(status?.reviewedAt) }}</el-descriptions-item>
        <el-descriptions-item label="填报资格">{{ status?.canReport ? '已具备' : '尚未具备' }}</el-descriptions-item>
        <el-descriptions-item label="退回理由">{{ status?.returnReason || '—' }}</el-descriptions-item>
      </el-descriptions>
      <div class="form-actions">
        <el-button v-if="!status?.status || ['DRAFT','RETURNED'].includes(status.status)" type="primary" @click="router.push('/enterprise/profile')">{{ status?.status === 'RETURNED' ? '修改并重新提交' : '填写备案资料' }}</el-button>
        <el-button v-if="status?.canReport" type="success" plain @click="router.push('/enterprise/report/new')">进入数据填报</el-button>
      </div>
    </el-card>
    <el-card shadow="never" class="business-card">
      <template #header><strong>历史版本</strong></template>
      <el-empty v-if="!status?.history.length" description="尚无已提交版本" />
      <el-table v-else :data="status.history">
        <el-table-column prop="version" label="版本" width="90" />
        <el-table-column label="结果" width="120"><template #default="scope">{{ filingResultLabels[scope.row.result as keyof typeof filingResultLabels] }}</template></el-table-column>
        <el-table-column label="提交时间"><template #default="scope">{{ formatBeijingTime(scope.row.submittedAt) }}</template></el-table-column>
        <el-table-column label="审核时间"><template #default="scope">{{ formatBeijingTime(scope.row.reviewedAt) }}</template></el-table-column>
        <el-table-column prop="reason" label="退回理由" show-overflow-tooltip />
        <el-table-column label="操作" width="100"><template #default="scope"><el-button link type="primary" @click="showVersion(scope.row.version)">查看快照</el-button></template></el-table-column>
      </el-table>
    </el-card>
    <el-dialog v-model="snapshotVisible" :title="`备案历史版本 ${snapshot?.version ?? ''}`" width="min(900px, 92vw)">
      <ProfileSnapshot v-if="snapshot" :profile="snapshot.profile" :region="snapshot.region" />
      <template #footer><el-button @click="snapshotVisible=false">关闭</el-button></template>
    </el-dialog>
  </section>
</template>
