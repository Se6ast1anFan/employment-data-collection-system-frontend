<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { noticeProvider as api } from '@/services/week6'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/services/api'
import { noticeErrors, codePointLength } from '@/utils/week6'
import { formatBeijingTime } from '@/utils/filing'
import type { NoticeDetail, NoticeSummary } from '@/types/week6'
const auth=useAuthStore(), province=computed(()=>auth.user?.roleCode==='PROVINCE')
const rows=ref<NoticeSummary[]>([]),detail=ref<NoticeDetail|null>(null),page=ref(1),total=ref(0)
const busy=ref(false),error=ref(''),visible=ref(false),editor=ref(false),errors=ref<Record<string,string>>({})
const editId=ref<string|null>(null),editVersion=ref<number|null>(null),form=reactive({title:'',content:''})
async function load(){
  rows.value=[]
  const r=(await api.list({page:page.value-1,size:20},auth.token!)).data
  total.value=r.total
  const last=Math.max(1,Math.ceil(r.total/20))
  if(page.value>last){page.value=last;return load()}
  rows.value=r.items
}
async function read(id:string){detail.value=null;detail.value=(await api.detail(id,auth.token!)).data;visible.value=true}
async function perform(fn:()=>Promise<void>,id?:string){
  if(busy.value)return
  busy.value=true;error.value=''
  try{await fn()}catch(e){
    error.value=(e as Error).message
    if(e instanceof ApiError){
      errors.value=e.fieldErrors
      if(e.status===404){editor.value=false;visible.value=false;detail.value=null;try{await load()}catch{/* 保留原错误 */}}
      if(e.status===409){
        editor.value=false
        error.value='通知状态或版本已变化，已读取最新数据，请重新确认'
        try{if(id)await read(id)}catch{
          visible.value=false;detail.value=null
          error.value='通知已删除或无法读取最新详情，已刷新列表'
        }
        // 详情可能已被另一位省级用户删除，仍需独立刷新列表。
        try{await load()}catch{error.value='通知状态已变化，最新列表读取失败，请刷新重试'}
        ElMessage.warning(error.value)
      }
    }
  }finally{busy.value=false}
}
function create(){editId.value=null;editVersion.value=null;form.title='';form.content='';errors.value={};editor.value=true}
async function edit(id:string){await perform(async()=>{await read(id);if(!province.value||!detail.value?.canEdit)return;editId.value=id;editVersion.value=detail.value.currentVersion;form.title=detail.value.title;form.content=detail.value.content;errors.value={};editor.value=true},id)}
async function save(){
  if(!province.value||busy.value)return
  errors.value=noticeErrors(form)
  if(Object.keys(errors.value).length)return
  const body={title:form.title.trim(),content:form.content.trim()}
  await perform(async()=>{
    const r=editId.value?await api.update(editId.value,{...body,expectedVersion:editVersion.value!},auth.token!):await api.create(body,auth.token!)
    editor.value=false;detail.value=r.data;visible.value=true;page.value=1;await load();ElMessage.success(editId.value?'通知已修改':'通知已发布')
  },editId.value??undefined)
}
async function remove(){
  const d=detail.value
  if(!province.value||!d?.canDelete||busy.value)return
  try{await ElMessageBox.confirm(`确认删除通知“${d.title}”？删除后将不再展示。`,'删除通知',{type:'warning',confirmButtonText:'确认删除'})}catch{return}
  await perform(async()=>{await api.delete(d.noticeId,d.currentVersion,auth.token!);visible.value=false;detail.value=null;await load();ElMessage.success('通知已删除')},d.noticeId)
}
onMounted(()=>perform(load))
</script>
<template>
<section>
  <div class="page-heading"><div><h1>{{province?'通知管理':'通知浏览'}}</h1><p>{{province?'发布和管理本省通知，发布时间与发布单位由系统生成。':'查看所属省发布的通知。'}}</p></div><div class="heading-actions"><el-button :disabled="busy" @click="perform(load)">刷新列表</el-button><el-button v-if="province" type="primary" :disabled="busy" @click="create">发布通知</el-button></div></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-card shadow="never" v-loading="busy"><el-table :data="rows" empty-text="暂无可见通知"><el-table-column prop="title" label="标题" min-width="220"/><el-table-column prop="publisherUnitName" label="发布单位" min-width="180"/><el-table-column label="发布时间（北京时间）" min-width="190"><template #default="s">{{formatBeijingTime(s.row.publishedAt)}}</template></el-table-column><el-table-column label="修改时间" min-width="190"><template #default="s">{{formatBeijingTime(s.row.updatedAt)}}</template></el-table-column><el-table-column label="操作" fixed="right" width="140"><template #default="s"><el-button link type="primary" :disabled="busy" @click="perform(()=>read(s.row.noticeId),s.row.noticeId)">查看</el-button><el-button v-if="province&&s.row.canEdit" link :disabled="busy" @click="edit(s.row.noticeId)">修改</el-button></template></el-table-column></el-table><el-pagination v-model:current-page="page" :disabled="busy" :total="total" :page-size="20" layout="total,prev,pager,next" @current-change="perform(load)"/></el-card>
  <el-drawer v-model="visible" title="通知详情" size="min(800px,96vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy"><template v-if="detail"><h2>{{detail.title}}</h2><p>{{detail.publisherUnitName}} · {{formatBeijingTime(detail.publishedAt)}}</p><p v-if="detail.updatedAt">修改于 {{formatBeijingTime(detail.updatedAt)}}</p><div class="notice-content">{{detail.content}}</div><div v-if="province" class="form-actions"><el-button v-if="detail.canEdit" :disabled="busy" @click="edit(detail.noticeId)">修改通知</el-button><el-button v-if="detail.canDelete" type="danger" :disabled="busy" @click="remove">删除通知</el-button></div></template></el-drawer>
  <el-dialog v-model="editor" :title="editId?'修改通知':'发布通知'" width="min(700px,96vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy"><el-form label-position="top" :disabled="busy"><el-form-item label="通知标题" required :error="errors.title"><el-input v-model="form.title" placeholder="标题必填，最多50字"/><span class="muted">{{codePointLength(form.title.trim())}} / 50 字</span></el-form-item><el-form-item label="通知正文" required :error="errors.content"><el-input v-model="form.content" type="textarea" :rows="10" placeholder="正文必填，最多2000字，支持换行"/><span class="muted">{{codePointLength(form.content.trim())}} / 2000 字</span></el-form-item></el-form><p>按字符计数，首尾空白不计入；正文以纯文本展示。</p><template #footer><el-button :disabled="busy" @click="editor=false">取消</el-button><el-button type="primary" :loading="busy" @click="save">{{editId?'保存修改':'确认发布'}}</el-button></template></el-dialog>
</section>
</template>
<style scoped>.notice-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;border-top:1px solid #e5e8ee;padding-top:20px}h2{overflow-wrap:anywhere}</style>
