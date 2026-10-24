<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

import RegionPicker from '@/components/RegionPicker.vue'
import { ApiError } from '@/services/api'
import { filingProvider } from '@/services/filing'
import { useAuthStore } from '@/stores/auth'
import type { EnterpriseAccountCreateRequest, EnterpriseAccountData } from '@/types/filing'
import { formatRegion } from '@/utils/filing'

const auth = useAuthStore()
const loading = ref(false)
const created = ref<EnterpriseAccountData | null>(null)
const fieldErrors = reactive<Record<string, string>>({})
const form = reactive<EnterpriseAccountCreateRequest>({ username: '', initialPassword: '', orgName: '', regionCode: '' })

function setErrors(errors: Record<string, string>) {
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]
  Object.assign(fieldErrors, errors)
}

function localErrors() {
  const errors: Record<string, string> = {}
  if (!form.username.trim() || form.username.trim().length > 64) errors.username = '登录账号长度须为 1 至 64 个字符'
  if (!/^(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,64}$/.test(form.initialPassword)) {
    errors.initialPassword = '须为 8 至 64 位可见 ASCII 字符，无空格，且至少包含一个字母和一个数字'
  }
  if (!form.orgName.trim() || form.orgName.trim().length > 120) errors.orgName = '企业名称长度须为 1 至 120 个字符'
  if (!form.regionCode) errors.regionCode = '请选择企业所属地区'
  return errors
}

async function submit() {
  const errors = localErrors()
  setErrors(errors)
  if (Object.keys(errors).length) return
  loading.value = true
  try {
    const result = await filingProvider.createEnterpriseAccount({
      username: form.username.trim(), initialPassword: form.initialPassword,
      orgName: form.orgName.trim(), regionCode: form.regionCode,
    }, auth.token!)
    created.value = result.data
    form.initialPassword = ''
    ElMessage.success('企业账号创建成功')
  } catch (error) {
    if (error instanceof ApiError) setErrors(error.fieldErrors)
    ElMessage.error(error instanceof Error ? error.message : '企业账号创建失败')
  } finally { loading.value = false }
}

function reset() {
  Object.assign(form, { username: '', initialPassword: '', orgName: '', regionCode: '' })
  created.value = null
  setErrors({})
}
</script>

<template>
  <section>
    <div class="page-heading">
      <div><p class="eyebrow">第二周企业备案</p><h1>创建企业账号</h1><p>由省级管理部门创建企业组织、登录账号并固定所属地区。</p></div>
    </div>
    <el-alert title="当前 HTTP 联调环境只能使用匿名演示口令和资料；真实数据接入前必须启用 HTTPS。" type="warning" :closable="false" show-icon />
    <el-card shadow="never" class="business-card">
      <el-form label-position="top" @keyup.enter="submit">
        <el-row :gutter="18">
          <el-col :xs="24" :md="12"><el-form-item label="登录账号" required :error="fieldErrors.username"><el-input v-model="form.username" maxlength="64" /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="初始口令" required :error="fieldErrors.initialPassword"><el-input v-model="form.initialPassword" type="password" show-password autocomplete="new-password" /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="企业名称" required :error="fieldErrors.orgName"><el-input v-model="form.orgName" maxlength="120" /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="所属地区" required :error="fieldErrors.regionCode"><RegionPicker v-model="form.regionCode" /></el-form-item></el-col>
        </el-row>
        <div class="form-actions"><el-button @click="reset">重置</el-button><el-button type="primary" :loading="loading" @click="submit">创建账号</el-button></div>
      </el-form>
    </el-card>
    <el-result v-if="created" icon="success" title="企业账号已创建" sub-title="初始口令不会回显或保存，请由建号人线下交付。">
      <template #extra><el-descriptions :column="1" border><el-descriptions-item label="登录账号">{{ created.username }}</el-descriptions-item><el-descriptions-item label="企业名称">{{ created.orgName }}</el-descriptions-item><el-descriptions-item label="所属地区">{{ formatRegion(created.region) }}</el-descriptions-item></el-descriptions></template>
    </el-result>
  </section>
</template>
