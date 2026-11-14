<script setup lang="ts">
import { ref } from 'vue'
import { getAdmin } from '@/services/admin'
import { useAuthStore } from '@/stores/auth'
import { adminError } from '@/utils/admin'
import type { Organization } from '@/types/admin'

const model = defineModel<Organization>()
const props = defineProps<{ enabledOnly?: boolean }>()
const auth = useAuthStore()
const rows = ref<Organization[]>([])
const busy = ref(false)
const error = ref('')
let requestId = 0

async function search(keyword = '') {
  const id = ++requestId
  busy.value = true
  error.value = ''
  try {
    const { data } = await (await getAdmin()).organizations({ keyword: keyword.trim(), page: 0, size: 100 }, auth.token!)
    if (id === requestId) rows.value = data.items.filter(org => !props.enabledOnly || org.enabled)
  } catch (cause) {
    if (id === requestId) { rows.value = []; error.value = adminError(cause) }
  } finally {
    if (id === requestId) busy.value = false
  }
}
</script>

<template>
  <el-select v-model="model" value-key="id" filterable remote clearable :remote-method="search" :loading="busy"
    placeholder="输入组织名称搜索" style="width:100%" @visible-change="(open: boolean) => { if (open) search() }">
    <el-option v-for="org in rows" :key="org.id" :value="org" :label="org.name">
      {{ org.name }} <span class="muted">{{ org.regionName }}</span>
    </el-option>
    <template #empty><p class="admin-select-empty">{{ error || '暂无匹配组织，请调整搜索词' }}</p></template>
  </el-select>
</template>
