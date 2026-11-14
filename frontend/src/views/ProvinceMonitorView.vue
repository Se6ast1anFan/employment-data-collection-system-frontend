<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getAdmin } from '@/services/admin'
import { apiMode } from '@/services/auth'
import { useAuthStore } from '@/stores/auth'
import { adminError } from '@/utils/admin'
import { formatBeijingTime } from '@/utils/filing'
import type { Check, Monitor } from '@/types/admin'

const auth = useAuthStore()
const sample = ref<Monitor>()
const busy = ref(false)
const error = ref('')
let controller: AbortController | undefined
let timer: ReturnType<typeof setInterval>
const statusLabels: Record<Check['status'], string> = { UP: '正常', DOWN: '故障', UNKNOWN: '不可用' }
const statusTypes = { UP: 'success', DOWN: 'danger', UNKNOWN: 'info' } as const
function bytes(value: number | null) {
  if (value === null) return '—'
  return `${(value / 1024 ** 3).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GiB`
}
const metrics = computed(() => {
  if (!sample.value) return []
  const { cpu, memory, disk } = sample.value
  return [
    { label: 'CPU 使用率', check: cpu, value: cpu.usagePercent === null ? '—' : cpu.usagePercent + '%' },
    { label: '内存已用 / 总量', check: memory, value: bytes(memory.usedBytes) + ' / ' + bytes(memory.totalBytes) },
    { label: '磁盘已用 / 总量', check: disk, value: bytes(disk.usedBytes) + ' / ' + bytes(disk.totalBytes) },
  ]
})
const services = computed(() => sample.value ? [
  { label: '业务后端', ...sample.value.backend },
  { label: 'MySQL', ...sample.value.mysql },
  { label: 'RabbitMQ', ...sample.value.rabbitmq },
  { label: '模拟国家接收端', ...sample.value.nationalReceiver },
] : [])
async function refresh() {
  if (busy.value) return
  const request = new AbortController()
  controller = request; busy.value = true; error.value = ''
  try {
    const { data } = await (await getAdmin()).monitor(auth.token!, AbortSignal.any([request.signal, AbortSignal.timeout(15000)]))
    if (!request.signal.aborted) sample.value = data
  } catch (cause) {
    if (!request.signal.aborted) error.value = adminError(cause)
  } finally { if (!request.signal.aborted) busy.value = false }
}
onMounted(() => { void refresh(); timer = setInterval(refresh, 30_000) })
onBeforeUnmount(() => { clearInterval(timer); controller?.abort() })
</script>

<template>
  <section class="admin-workbench">
    <div class="page-heading">
      <div><h1>系统监控</h1><p>每 30 秒刷新一次。检查时间使用北京时间。</p></div>
      <el-button :loading="busy" @click="refresh">刷新监控</el-button>
    </div>
    <el-alert v-if="apiMode === 'mock'" title="本地 Mock 未采集服务器指标。" type="info" :closable="false" />
    <el-alert v-if="error" :title="sample ? '刷新失败，以下为上次采样。' + error : error" type="error" :closable="false" />
    <el-card v-loading="busy && !sample" shadow="never">
      <template v-if="sample">
        <p class="muted">采样时间 {{ formatBeijingTime(sample.sampledAt) }}</p>
        <h2>主机资源</h2>
        <dl class="monitor-resources">
          <div v-for="metric in metrics" :key="metric.label">
            <dt>{{ metric.label }}</dt>
            <dd class="monitor-value">{{ metric.value }}</dd>
            <dd><el-tag :type="statusTypes[metric.check.status]">{{ statusLabels[metric.check.status] }}</el-tag></dd>
            <dd class="muted">检查于 {{ formatBeijingTime(metric.check.checkedAt) }}</dd>
          </div>
        </dl>
        <h2>服务检查</h2>
        <el-table :data="services">
          <el-table-column prop="label" label="服务" min-width="155" />
          <el-table-column label="状态" width="112"><template #default="{ row }">
            <el-tag :type="statusTypes[(row as Check).status]">{{ statusLabels[(row as Check).status] }}</el-tag>
          </template></el-table-column>
          <el-table-column label="版本" min-width="120"><template #default="{ row }">{{ row.version || '—' }}</template></el-table-column>
          <el-table-column label="启动时间" min-width="170"><template #default="{ row }">{{ formatBeijingTime(row.startedAt) }}</template></el-table-column>
          <el-table-column label="最近检查时间" min-width="170"><template #default="{ row }">{{ formatBeijingTime(row.checkedAt) }}</template></el-table-column>
        </el-table>
      </template>
      <el-empty v-else-if="!busy" description="暂无采样，可点击刷新监控重试" />
    </el-card>
  </section>
</template>

<style scoped>
.monitor-resources { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; }
.monitor-resources > div { border-top: 2px solid var(--accent); padding: 12px 0; }
.monitor-resources dd { margin: 6px 0 0; }
.monitor-value { font-size: clamp(17px, 2.2vw, 23px); font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
