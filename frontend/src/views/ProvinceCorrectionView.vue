<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { nationalProvider } from '@/services/national'
import { nationalBatchLocation, nationalLockMessage } from '@/utils/national'
import { managementProvider as api } from '@/services/management'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/services/api'
import { formLabels, emptyReport } from '@/utils/report'
import { correctionChanges, correctionErrors } from '@/utils/management'
import { formatBeijingTime } from '@/utils/filing'
import type { CorrectionDetail } from '@/types/management'
import type { ReportForm } from '@/types/report'
const route=useRoute(),auth=useAuthStore(),detail=ref<CorrectionDetail|null>(null),busy=ref(false),error=ref(''),reason=ref(''),voidReason=ref(''),errors=ref<Record<string,string>>({})
const form=reactive<ReportForm>(emptyReport())
const lockedReports = reactive(new Set<string>())
const lockedBatchId = ref('')
const readonlyView = computed(() => route.query.readonly === '1')
const locked = computed(() => !!detail.value && lockedReports.has(detail.value.reportId))
const editable = computed(() => !!detail.value && !detail.value.voided && !readonlyView.value && !locked.value)
let detailGeneration = 0
const reduced=computed(()=>form.periodEmploymentCount!=null&&form.baselineEmploymentCount!=null&&form.periodEmploymentCount<form.baselineEmploymentCount)
const comparison=computed(()=>detail.value?Object.entries(formLabels).map(([key,label])=>({key,label,original:detail.value!.originalForm[key as keyof ReportForm],effective:detail.value!.effectiveForm[key as keyof ReportForm]})):[])
async function load() {
  const generation = ++detailGeneration
  detail.value = null
  lockedBatchId.value = ''
  const d = (await api.detail(String(route.params.reportId), auth.token!)).data
  if (generation !== detailGeneration) return
  detail.value = d
  Object.assign(form, d.effectiveForm)
  reason.value = voidReason.value = ''
  errors.value = {}
  if (d.voided || readonlyView.value) return
  // V1 的追溯接口未增加锁定字段。用冻结批次明细确认本报表是否入批。
  try {
    const { existingBatch } = (await nationalProvider.readiness(d.periodCode, auth.token!)).data
    if (!existingBatch || generation !== detailGeneration) return
    const batch = (await nationalProvider.detail(existingBatch.batchId, auth.token!)).data
    if (generation !== detailGeneration || !batch.payload.enterprises.some(row => row.reportId === d.reportId)) return
    lockedReports.add(d.reportId)
    lockedBatchId.value = batch.batchId
  } catch {
    // 兼容早期服务。修订与作废接口仍以服务端锁定冲突为准。
  }
}
async function run(fn: () => Promise<void>, mutationReportId?: string) {
  if (busy.value && mutationReportId) return
  const originalReportId = String(route.params.reportId)
  busy.value = true
  error.value = ''
  try { await fn() }
  catch (e) {
    if (String(route.params.reportId) !== originalReportId) return
    error.value = (e as Error).message
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (e.status === 409 && mutationReportId) {
        if (e.data?.reasonCode === 'LOCKED_BY_NATIONAL_BATCH') {
          lockedReports.add(mutationReportId)
          error.value = nationalLockMessage
        } else {
          try { await load(); error.value = '状态或版本已变化，已重新读取，请核对后再操作' }
          catch (refreshError) { detail.value = null; error.value = '无法读取最新状态：' + (refreshError as Error).message }
        }
      }
      if (e.status === 404) detail.value = null
    }
  } finally { if (String(route.params.reportId) === originalReportId) busy.value = false }
}
function clearReasons(){for(const k of ['primaryReasonCode','primaryReasonDetail','secondaryReasonCode','secondaryReasonDetail','tertiaryReasonCode','tertiaryReasonDetail'] as const)form[k]=null}
async function correct(){if(!detail.value||!editable.value||busy.value)return;const id=detail.value.reportId;errors.value=correctionErrors(form,null,reason.value);const changes=correctionChanges(detail.value.effectiveForm,form);if(!Object.keys(changes).length)errors.value.changes='请至少修改一项实际值';if(Object.keys(errors.value).length)return;try{await ElMessageBox.confirm('确认修订当前有效值？原始提交快照保留，修订将追加操作日志。','修订确认',{type:'warning'})}catch{return}if(detail.value?.reportId!==id||!editable.value)return;await run(async()=>{const d=detail.value!;await api.correct(d.reportId,{expectedVersion:d.currentVersion,submissionVersion:d.submissionVersion,reason:reason.value.trim(),changes},auth.token!);if(String(route.params.reportId)===id)await load();ElMessage.success('修订已保存')},id)}
async function voidReport(){if(!detail.value||!editable.value||busy.value)return;const id=detail.value.reportId;if(!voidReason.value.trim()||voidReason.value.trim().length>500){errors.value.reason='作废原因必填且最多500字';return}try{await ElMessageBox.confirm('确认作废此报表？它将从普通查询、汇总和导出中排除；原始快照与历史保留，本周不提供恢复。','作废确认',{type:'warning',confirmButtonText:'确认作废'})}catch{return}if(detail.value?.reportId!==id||!editable.value)return;await run(async()=>{const d=detail.value!;await api.void(d.reportId,{expectedVersion:d.currentVersion,submissionVersion:d.submissionVersion,reason:voidReason.value.trim()},auth.token!);if(String(route.params.reportId)===id)await load();ElMessage.success('报表已作废，追溯记录保留')},id)}
onMounted(()=>run(load))
watch(() => [route.params.reportId, readonlyView.value], () => { if (typeof route.params.reportId === 'string') void run(load) })
</script>
<template><section v-loading="busy"><div class="page-heading"><div><h1>省级报表修订与追溯</h1><p>原始报送值保留；建档期人数不可修订。</p></div><el-button :disabled="busy" @click="run(load)">重新读取</el-button></div><el-alert v-if="error" :title="error" type="error" :closable="false"/><template v-if="detail"><p>报表 {{detail.reportId}} · {{detail.periodCode}} · 当前版本 {{detail.currentVersion}} · 提交版本 {{detail.submissionVersion}}</p><el-alert v-if="detail.voided" :title="'已作废 · '+formatBeijingTime(detail.voidedAt)" type="warning" :closable="false"/><el-table :data="comparison"><el-table-column prop="label" label="字段" min-width="200"/><el-table-column prop="original" label="原始提交值" min-width="200"/><el-table-column prop="effective" label="当前有效值" min-width="200"/></el-table><el-alert v-if="locked" :title="nationalLockMessage" type="warning" :closable="false"/>
<p v-if="lockedBatchId"><router-link :to="nationalBatchLocation(detail.periodCode, lockedBatchId)">查看模拟批次 {{ lockedBatchId }}</router-link></p>
<p v-if="readonlyView">当前从上报明细进入，仅查看原值与修订记录。</p>
<el-card v-if="editable" shadow="never"><h2>修订有效值</h2><p>当前接口未提供省级原因选项；保留响应中的代码，修改代码时由服务端校验原因层级。</p><el-form label-position="top" :disabled="busy"><p>建档期人数：{{form.baselineEmploymentCount}}</p><el-form-item label="调查期人数" :error="errors.periodEmploymentCount" required><el-input-number v-model="form.periodEmploymentCount" :min="0" :max="2147483647" :precision="0"/></el-form-item><el-form-item :label="formLabels.otherReason" :error="errors.otherReason" required><el-input v-model="form.otherReason" type="textarea" maxlength="500" show-word-limit/></el-form-item><template v-if="reduced"><el-form-item label="减少类型" :error="errors.reductionTypeCode"><el-input v-model="form.reductionTypeCode" clearable @change="clearReasons" placeholder="输入减少类型代码"/></el-form-item><template v-for="prefix in (['primary','secondary','tertiary'] as const)" :key="prefix"><el-form-item :label="formLabels[`${prefix}ReasonCode`]" :error="errors[`${prefix}ReasonCode`]"><el-input v-model="form[`${prefix}ReasonCode`]" clearable placeholder="输入原因代码，留空清除"/></el-form-item><el-form-item :label="formLabels[`${prefix}ReasonDetail`]" :error="errors[`${prefix}ReasonDetail`]"><el-input v-model="form[`${prefix}ReasonDetail`]" type="textarea" maxlength="500" show-word-limit/></el-form-item></template></template><el-form-item label="修订原因" :error="errors.reason" required><el-input v-model="reason" type="textarea" maxlength="500" show-word-limit/></el-form-item><p v-if="errors.changes" role="alert">{{errors.changes}}</p><el-button type="primary" :disabled="busy" @click="correct">确认修订</el-button></el-form><h2>作废历史报表</h2><p>只追加作废记录，不改变省审通过状态，排除普通查询、汇总和导出；不提供恢复。</p><el-form-item label="作废原因" :error="errors.reason" required><el-input v-model="voidReason" type="textarea" maxlength="500" show-word-limit :disabled="busy"/></el-form-item><el-button type="danger" :disabled="busy" @click="voidReport">作废报表</el-button></el-card><h2>逐字段修订日志</h2><el-table :data="detail.corrections" empty-text="暂无修订记录"><el-table-column prop="operationId" label="操作ID"/><el-table-column prop="submissionVersion" label="提交版本"/><el-table-column label="字段" min-width="170"><template #default="s">{{formLabels[s.row.fieldName as keyof ReportForm]}}</template></el-table-column><el-table-column prop="oldValue" label="修订前"/><el-table-column prop="newValue" label="修订后"/><el-table-column prop="reason" label="原因" min-width="200"/><el-table-column prop="actorDisplayName" label="人员"/><el-table-column label="北京时间" min-width="180"><template #default="s">{{formatBeijingTime(s.row.occurredAt)}}</template></el-table-column></el-table><template v-if="detail.voidEvent"><h2>作废记录</h2><p>{{detail.voidEvent.reason}} · {{detail.voidEvent.actorDisplayName}} · {{formatBeijingTime(detail.voidEvent.occurredAt)}} · 提交版本 {{detail.voidEvent.submissionVersion}}</p></template></template></section></template>
