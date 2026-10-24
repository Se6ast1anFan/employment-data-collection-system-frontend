<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { ApiError } from '@/services/api'
import { filingProvider } from '@/services/filing'
import { useAuthStore } from '@/stores/auth'
import type { DictionaryParent, EnterpriseProfileData, EnterpriseProfileFields, FilingOptionsData } from '@/types/filing'
import { emptyProfile, filingStatusLabels, formatBeijingTime, formatRegion, normalizeProfile, validateProfile } from '@/utils/filing'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const submitting = ref(false)
const options = ref<FilingOptionsData | null>(null)
const profileData = ref<EnterpriseProfileData | null>(null)
const form = reactive<EnterpriseProfileFields>(emptyProfile())
const fieldErrors = reactive<Record<string, string>>({})
const editable = computed(() => profileData.value?.editable ?? false)
const statusText = computed(() => profileData.value?.status ? filingStatusLabels[profileData.value.status] : '尚未填写')

const children = (source: DictionaryParent[] | undefined, parentCode: string | null) =>
  source?.find((item) => item.code === parentCode)?.children ?? []

function setErrors(errors: Record<string, string>) {
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]
  Object.assign(fieldErrors, errors)
}

function applyProfile(data: EnterpriseProfileData) {
  profileData.value = data
  const value = data.profile ?? emptyProfile()
  Object.assign(form, value)
  if (!form.enterpriseName) form.enterpriseName = auth.user?.orgName ?? null
}

async function load() {
  loading.value = true
  try {
    const [optionResult, profileResult] = await Promise.all([
      filingProvider.getOptions(auth.token!), filingProvider.getProfile(auth.token!),
    ])
    options.value = optionResult.data
    applyProfile(profileResult.data)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '企业资料加载失败')
  } finally { loading.value = false }
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    setErrors(error.fieldErrors)
    if (error.status === 409) void load()
  }
  ElMessage.error(error instanceof Error ? error.message : fallback)
}

async function saveDraft(showSuccess = true): Promise<EnterpriseProfileData | null> {
  const normalized = normalizeProfile(form)
  const errors = validateProfile(normalized, false)
  setErrors(errors)
  if (Object.keys(errors).length) return null
  saving.value = true
  try {
    const result = await filingProvider.saveProfile(normalized, auth.token!)
    applyProfile(result.data)
    if (showSuccess) ElMessage.success('草稿已保存')
    return result.data
  } catch (error) {
    handleError(error, '草稿保存失败')
    return null
  } finally { saving.value = false }
}

async function submitFiling() {
  const normalized = normalizeProfile(form)
  const errors = validateProfile(normalized, true)
  setErrors(errors)
  if (Object.keys(errors).length) {
    ElMessage.warning('请先完成并检查全部必填信息')
    return
  }
  try {
    await ElMessageBox.confirm('提交后资料将进入待省级备案状态，审核完成前不能修改。确认提交吗？', '提交备案', { type: 'warning' })
  } catch { return }
  submitting.value = true
  try {
    const saved = await saveDraft(false)
    if (!saved) return
    await filingProvider.submit({ expectedVersion: saved.currentVersion }, auth.token!)
    ElMessage.success('备案已提交省级审核')
    await router.push('/enterprise/filing')
  } catch (error) {
    handleError(error, '备案提交失败')
  } finally { submitting.value = false }
}

function resetChild(parentKey: 'natureParentCode' | 'industryParentCode' | 'addressParentCode', childKey: 'natureCode' | 'industryCode' | 'addressCode') {
  const source = parentKey === 'natureParentCode' ? options.value?.natures : parentKey === 'industryParentCode' ? options.value?.industries : options.value?.addresses
  if (!children(source, form[parentKey]).some((item) => item.code === form[childKey])) form[childKey] = null
}

onMounted(load)
</script>

<template>
  <section v-loading="loading">
    <div class="page-heading">
      <div><p class="eyebrow">第二周企业备案</p><h1>企业基本信息</h1><p>填写备案资料，保存草稿后提交省级审核。</p></div>
      <div class="heading-actions"><el-tag>{{ statusText }}</el-tag><el-button @click="router.push('/enterprise/filing')">查看备案状态</el-button></div>
    </div>
    <el-alert v-if="options?.demo" title="当前下拉选项为匿名演示字典，不代表正式云南编码。" type="warning" :closable="false" show-icon />
    <el-alert v-if="profileData && !editable" title="当前备案状态下资料只读；状态变化后请刷新页面。" type="info" :closable="false" show-icon />
    <el-card shadow="never" class="business-card">
      <el-form label-position="top" :disabled="!editable">
        <el-row :gutter="18">
          <el-col :span="24"><el-form-item label="所属地区（不可修改）"><el-input :model-value="formatRegion(profileData?.region)" disabled /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="组织机构代码" required :error="fieldErrors.organizationCode"><el-input v-model="form.organizationCode" maxlength="9" @blur="form.organizationCode = form.organizationCode?.trim().toUpperCase() || null" /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="企业名称" required :error="fieldErrors.enterpriseName"><el-input v-model="form.enterpriseName" maxlength="120" /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="企业性质（一级）" required :error="fieldErrors.natureParentCode"><el-select v-model="form.natureParentCode" style="width:100%" @change="resetChild('natureParentCode','natureCode')"><el-option v-for="item in options?.natures" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="企业性质（二级）" required :error="fieldErrors.natureCode"><el-select v-model="form.natureCode" style="width:100%"><el-option v-for="item in children(options?.natures, form.natureParentCode)" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="所属行业（一级）" required :error="fieldErrors.industryParentCode"><el-select v-model="form.industryParentCode" style="width:100%" @change="resetChild('industryParentCode','industryCode')"><el-option v-for="item in options?.industries" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="所属行业（二级）" required :error="fieldErrors.industryCode"><el-select v-model="form.industryCode" style="width:100%"><el-option v-for="item in children(options?.industries, form.industryParentCode)" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="主要经营业务" required :error="fieldErrors.mainBusiness"><el-input v-model="form.mainBusiness" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="联系人" required :error="fieldErrors.contactName"><el-input v-model="form.contactName" maxlength="80" /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="邮政编码" required :error="fieldErrors.postalCode"><el-input v-model="form.postalCode" maxlength="6" /></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="联系地址（一级）" required :error="fieldErrors.addressParentCode"><el-select v-model="form.addressParentCode" style="width:100%" @change="resetChild('addressParentCode','addressCode')"><el-option v-for="item in options?.addresses" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item></el-col>
          <el-col :xs="24" :md="12"><el-form-item label="联系地址（二级）" required :error="fieldErrors.addressCode"><el-select v-model="form.addressCode" style="width:100%"><el-option v-for="item in children(options?.addresses, form.addressParentCode)" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item></el-col>
          <el-col :xs="24" :md="8"><el-form-item label="联系电话" required :error="fieldErrors.contactPhone"><el-input v-model="form.contactPhone" placeholder="手机或区号-电话号码" /></el-form-item></el-col>
          <el-col :xs="24" :md="8"><el-form-item label="传真" required :error="fieldErrors.fax"><el-input v-model="form.fax" placeholder="区号-电话号码" /></el-form-item></el-col>
          <el-col :xs="24" :md="8"><el-form-item label="EMAIL（选填）" :error="fieldErrors.email"><el-input v-model="form.email" /></el-form-item></el-col>
        </el-row>
        <div class="form-actions"><span v-if="profileData?.updatedAt" class="muted">最近保存：{{ formatBeijingTime(profileData.updatedAt) }}</span><el-button :loading="saving" :disabled="!editable" @click="saveDraft()">保存草稿</el-button><el-button type="primary" :loading="submitting" :disabled="!editable" @click="submitFiling">提交备案</el-button></div>
      </el-form>
    </el-card>
  </section>
</template>
