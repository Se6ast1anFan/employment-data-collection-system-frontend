<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { previewPeriodYear, createPeriodYear } from '@/services/periodYear'
import { ApiError } from '@/services/api'
import { formatBeijingTime } from '@/utils/filing'
import type { YearMonth, YearPreview, YearResult } from '@/types/midterm'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ created: [] }>()
const auth = useAuthStore()
const year = ref<number>()
const preview = ref<YearPreview>()
const result = ref<YearResult>()
const conflicts = ref<YearMonth[]>([])
const busy = ref(false)
const error = ref('')
const valid = computed(() => year.value !== undefined && Number.isInteger(year.value) && year.value >= 2000 && year.value <= 2100)
const dispositions = { CREATE: '将创建', EXISTING: '已存在', CONFLICT: '冲突' }
watch(year, () => { preview.value = result.value = undefined; conflicts.value = []; error.value = '' })
const rows = computed(() => preview.value?.months.map(row => conflicts.value.find(item => item.periodCode === row.periodCode) ?? row) ?? [])

async function run(create: boolean) {
  if (busy.value || !valid.value || (create && (!preview.value?.canCreate || preview.value.year !== year.value || conflicts.value.length))) return
  busy.value = true
  error.value = ''
  try {
    if (create) {
      result.value = await createPeriodYear(year.value!, auth.token!)
      emit('created')
    } else {
      conflicts.value = []
      result.value = undefined
      preview.value = await previewPeriodYear(year.value!, auth.token!)
    }
  } catch (cause) {
    error.value = (cause as Error).message
    if (cause instanceof ApiError && cause.status === 409) {
      conflicts.value = cause.data?.conflictMonths ?? []
      if (!conflicts.value.length) preview.value = undefined
    }
  } finally { busy.value = false }
}
</script>

<template>
  <el-dialog v-model="open" title="创建全年调查期" width="min(920px, 96vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
    <p class="muted">按北京时间生成 12 个月度调查期。统计范围和填报窗口均为前含后不含。</p>
    <el-form inline @submit.prevent="run(false)">
      <el-form-item label="年份"><el-input-number v-model="year" :min="2000" :max="2100" :precision="0" :controls="false" :disabled="busy" placeholder="例如 2027" /></el-form-item>
      <el-button native-type="submit" :disabled="!valid" :loading="busy">预览 12 个月</el-button>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="result" :title="`${result.year} 年处理完成，创建 ${result.created.length} 期，已存在 ${result.existing.length} 期。`" type="success" :closable="false" show-icon />
    <template v-if="preview">
      <p v-if="!result">将创建 {{ preview.createdCount }} 期，已存在 {{ preview.existingCount }} 期，冲突 {{ conflicts.length || preview.conflictCount }} 期。</p>
      <el-table :data="rows" row-key="periodCode" max-height="440">
        <el-table-column prop="periodLabel" label="月度调查期" min-width="155" />
        <el-table-column label="统计范围（北京时间）" min-width="210"><template #default="{ row }">{{ formatBeijingTime(row.startAt) }} 至 {{ formatBeijingTime(row.endExclusiveAt) }}</template></el-table-column>
        <el-table-column label="填报窗口（北京时间）" min-width="210"><template #default="{ row }">{{ formatBeijingTime(row.openAt) }} 至 {{ formatBeijingTime(row.closeAt) }}</template></el-table-column>
        <el-table-column label="预览结果" min-width="155"><template #default="{ row }">
          <el-tag :type="row.disposition === 'CONFLICT' ? 'danger' : row.disposition === 'EXISTING' ? 'info' : 'success'">{{ dispositions[row.disposition as YearMonth['disposition']] }}</el-tag>
          <div v-if="row.conflictReason" class="muted">{{ row.conflictReason === 'CODE_BOUNDARY_MISMATCH' ? '同代码的时间边界不同' : '与其他真实期次重叠' }}</div>
        </template></el-table-column>
      </el-table>
    </template>
    <template #footer>
      <el-button :disabled="busy" @click="open = false">{{ result ? '关闭' : '取消' }}</el-button>
      <el-button v-if="!result" type="primary" :loading="busy" :disabled="!preview?.canCreate || !!conflicts.length" @click="run(true)">确认创建全年调查期</el-button>
    </template>
  </el-dialog>
</template>
