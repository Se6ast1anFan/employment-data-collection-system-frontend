<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { systemProvider } from '@/services/system'
import { ElMessage } from 'element-plus'

defineProps<{ modelValue?: string | null; disabled?: boolean; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const auth = useAuthStore()

interface RegionOption {
  value: string
  label: string
  leaf: boolean
}

const cascaderProps = {
  emitPath: false,
  value: 'value',
  label: 'label',
  lazy: true,
  lazyLoad: async (
    node: { level: number; value?: string },
    resolve: (items: RegionOption[]) => void,
  ) => {
    try {
      const result = await systemProvider.regions(node.level === 0 ? undefined : node.value, auth.token!)
      resolve(result.data.map((item) => ({ value: item.code, label: item.name, leaf: item.level >= 3 })))
    } catch (error) {
      resolve([])
      ElMessage.error(error instanceof Error ? error.message : '地区加载失败')
    }
  },
}
</script>

<template>
  <el-cascader
    :model-value="modelValue || undefined"
    :props="cascaderProps"
    :disabled="disabled"
    :placeholder="placeholder || '请选择所属地区'"
    clearable
    filterable
    style="width: 100%"
    @update:model-value="emit('update:modelValue', typeof $event === 'string' ? $event : null)"
  />
</template>
