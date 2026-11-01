<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { analysisProvider as api } from '@/services/week6'
import { reportProvider } from '@/services/report'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/services/api'
import type { SurveyPeriod } from '@/types/report'
import type { AnalysisFilters, CitiesAnalysis, CompareAnalysis, TrendAnalysis } from '@/types/week6'
import { contiguousCodes, orderedPeriods, metricDefinitions, percentText } from '@/utils/week6'
import RegionPicker from '@/components/RegionPicker.vue'
import AnalysisChart from '@/components/AnalysisChart.vue'
import CityShareChart from '@/components/CityShareChart.vue'
import MetricsTable from '@/components/MetricsTable.vue'
const auth=useAuthStore()
const mode=ref<'cities'|'compare'|'trend'>('cities')
const periods=ref<SurveyPeriod[]>([]), busy=ref(false), error=ref(''), fieldErrors=ref<Record<string,string>>({})
const periodCode=ref(''), first=ref(''), second=ref(''), start=ref(''), end=ref('')
const filters=reactive<Partial<AnalysisFilters>>({})
const cities=ref<CitiesAnalysis|null>(null),compare=ref<CompareAnalysis|null>(null),trend=ref<TrendAnalysis|null>(null)
const chartMode=ref<'bar'|'line'>('bar'), metric=ref('periodEmploymentTotal')
const currentMetric=computed(()=>metricDefinitions.find(m=>m.key===metric.value)!)
const comparePoints=computed(()=>compare.value?.periods.map(p=>({label:p.periodCode,value:p.metrics[currentMetric.value.key]}))??[])
const trendPoints=computed(()=>trend.value?.points.map(p=>({label:p.periodCode,value:p.metrics.changePercent}))??[])
const filterLabels:Record<keyof AnalysisFilters,string>={regionCode:'地区',natureParentCode:'性质父级',natureCode:'性质子级',industryParentCode:'行业父级',industryCode:'行业子级'}
function filterText(f:AnalysisFilters){return Object.entries(f).filter(([,v])=>v).map(([k,v])=>`${filterLabels[k as keyof AnalysisFilters]}：${v}`).join(' · ')||'全省全部分类'}
async function loadPeriods(){busy.value=true;error.value='';try{periods.value=orderedPeriods((await reportProvider.periods(auth.token!)).data.items.filter(p=>!p.legacy))}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function query(){
  fieldErrors.value={};error.value=''
  const selected=mode.value
  if(selected==='cities'&&!periodCode.value){error.value='请选择调查期';return}
  if(selected==='compare'&&(!first.value||!second.value||first.value===second.value)){error.value='请选择两个不同调查期';return}
  let codes:string[]=[]
  if(selected==='trend')try{codes=contiguousCodes(periods.value,start.value,end.value)}catch(e){error.value=(e as Error).message;return}
  busy.value=true
  try{
    if(selected==='cities'){cities.value=null;cities.value=(await api.cities({periodCode:periodCode.value,regionCode:filters.regionCode},auth.token!)).data}
    if(selected==='compare'){compare.value=null;compare.value=(await api.compare({...filters,firstPeriodCode:first.value,secondPeriodCode:second.value},auth.token!)).data}
    if(selected==='trend'){trend.value=null;trend.value=(await api.trend({...filters,periodCodes:codes},auth.token!)).data}
  }catch(e){error.value=(e as Error).message;if(e instanceof ApiError)fieldErrors.value=e.fieldErrors}finally{busy.value=false}
}
function clearFilters(){for(const k of Object.keys(filters))delete filters[k as keyof AnalysisFilters];void query()}
onMounted(loadPeriods)
</script>
<template>
<section>
  <div class="page-heading"><div><h1>就业数据分析</h1><p>只分析本省已省审通过、未作废的最新提交版本；调查期人数使用当前有效修订值。</p></div><el-button :disabled="busy" @click="loadPeriods">刷新调查期</el-button></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <ul v-if="Object.keys(fieldErrors).length" role="alert"><li v-for="(message,key) in fieldErrors" :key="key">{{message}}</li></ul>
  <div class="analysis-tabs"><el-button v-for="item in ([{key:'cities',label:'各市数量与占比'},{key:'compare',label:'两期六项对比'},{key:'trend',label:'连续多期趋势'}] as const)" :key="item.key" :type="mode===item.key?'primary':'default'" :disabled="busy" @click="mode=item.key">{{item.label}}</el-button></div>
  <el-card shadow="never" v-loading="busy">
    <el-form label-position="top" :disabled="busy" class="analysis-filters">
      <el-form-item v-if="mode==='cities'" label="调查期"><el-select v-model="periodCode" placeholder="请选择调查期"><el-option v-for="p in periods" :key="p.code" :label="p.label" :value="p.code"/></el-select></el-form-item>
      <template v-if="mode==='compare'"><el-form-item label="第一调查期"><el-select v-model="first"><el-option v-for="p in periods" :key="p.code" :value="p.code" :label="p.label"/></el-select></el-form-item><el-form-item label="第二调查期"><el-select v-model="second"><el-option v-for="p in periods" :key="p.code" :value="p.code" :label="p.label"/></el-select></el-form-item></template>
      <template v-if="mode==='trend'"><el-form-item label="起始调查期"><el-select v-model="start"><el-option v-for="p in periods" :key="p.code" :value="p.code" :label="p.label"/></el-select></el-form-item><el-form-item label="结束调查期"><el-select v-model="end"><el-option v-for="p in periods" :key="p.code" :value="p.code" :label="p.label"/></el-select></el-form-item></template>
      <el-form-item label="地区（含下级）"><RegionPicker v-model="filters.regionCode" any-level :disabled="busy"/></el-form-item>
      <template v-if="mode!=='cities'"><el-form-item v-for="key in (['natureParentCode','natureCode','industryParentCode','industryCode'] as const)" :key="key" :label="filterLabels[key]+'代码'" :error="fieldErrors[key]"><el-input v-model="filters[key]" clearable :maxlength="64" placeholder="留空表示不限"/></el-form-item></template>
    </el-form>
    <p v-if="mode!=='cities'" class="muted">性质、行业使用两级备案代码，父级包含全部子项；父子同时填写须匹配。当前省级字典选项尚待接口补齐。各期优先取提交时备案版本，回退数量在表格单列。</p>
    <p v-if="mode==='trend'">自动包含起止之间全部调查期，按开始时间、期次代码排序，共 2 至 24 期；无样本期次保留。</p>
    <div class="form-actions"><el-button :disabled="busy" @click="clearFilters">清除样本条件</el-button><el-button type="primary" :disabled="busy" @click="query">查询 / 刷新分析</el-button></div>
  </el-card>
  <el-card class="business-card" shadow="never">
    <template v-if="mode==='cities'&&cities"><h2>{{cities.periodLabel}} · 各市企业数量</h2><p>样本总数 / 占比分母：{{cities.totalEnterpriseCount}} 家；地区：{{cities.regionCode||'全省'}}。占比四舍五入至两位小数，合计可能略有误差。</p><el-empty v-if="cities.empty" description="本期本范围没有合格样本，不绘制饼图"/><CityShareChart v-else :data="cities"/><el-table :data="cities.cities" empty-text="暂无城市样本"><el-table-column prop="cityName" label="城市"/><el-table-column prop="enterpriseCount" label="企业数（家）"/><el-table-column label="企业占比"><template #default="s">{{percentText(s.row.sharePercent)}}</template></el-table-column></el-table></template>
    <template v-else-if="mode==='compare'&&compare"><h2>两期六项岗位指标</h2><p>当前结果：{{compare.firstPeriodCode}} → {{compare.secondPeriodCode}} · {{filterText(compare.filters)}}。两期样本独立，不取企业交集。</p><MetricsTable :rows="compare.periods"/><div class="chart-controls"><el-select v-model="metric" aria-label="图表指标"><el-option v-for="m in metricDefinitions" :key="m.key" :value="m.key" :label="m.label+'（'+m.unit+'）'"/></el-select><el-radio-group v-model="chartMode" aria-label="图表展示方式"><el-radio-button value="bar">柱状图</el-radio-button><el-radio-button value="line">折线图</el-radio-button></el-radio-group></div><AnalysisChart :points="comparePoints" :unit="currentMetric.unit" :title="currentMetric.label" :mode="chartMode"/></template>
    <template v-else-if="mode==='trend'&&trend"><h2>连续调查期岗位变化占比</h2><p>当前条件：{{filterText(trend.filters)}}。每个调查期均保留；无样本或建档期合计为零时显示“—”。</p><AnalysisChart :points="trendPoints" unit="%" title="岗位变化占比趋势" mode="line"/><MetricsTable :rows="trend.points"/></template>
    <el-empty v-else description="请选择调查期并查询"/>
  </el-card>
  <p>岗位净变化＝调查期总岗位－建档期总岗位（正数为净增加，负数为净减少）；岗位减少总数只累计减员，不被增员抵消；岗位变化占比＝净变化 ÷ 建档期总岗位 × 100%。更改条件后需重新查询；修订或作废后刷新重算。</p>
</section>
</template>
<style scoped>.analysis-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.analysis-tabs .el-button{margin-left:0}.analysis-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0 20px}.chart-controls{display:flex;gap:16px;flex-wrap:wrap;margin-top:22px}.chart-controls .el-select{width:240px}</style>
