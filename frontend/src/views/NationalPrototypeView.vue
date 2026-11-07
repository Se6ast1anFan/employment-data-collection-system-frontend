<script setup lang="ts">
import { computed, ref } from 'vue'

type Stage = 'DRAFT' | 'READY' | 'FAILED' | 'SENT' | 'ACKNOWLEDGED'
const periods = ['原型期一', '原型期二']
const period = ref(periods[0]!)
const seed = [
  { code: 'SAMPLE01', name: '匿名企业甲', city: '演示甲市', baselineSource: '原型期一', baseline: 100, current: 93, reason: '原型演示减员', revision: 2 },
  { code: 'SAMPLE02', name: '匿名企业乙', city: '演示乙市', baselineSource: '原型期一', baseline: 72, current: 75, reason: '无', revision: 1 },
]
const states = ref(Object.fromEntries(periods.map((p, i) => [p, {
  stage: 'DRAFT' as Stage, batch: 'SIM-' + (i + 1), voided: [] as string[], events: [] as string[],
}])))
const labels = { DRAFT: '待生成', READY: '待发送', FAILED: '发送失败', SENT: '发送成功 · 待模拟回执', ACKNOWLEDGED: '已收到模拟回执' }
const state = computed(() => states.value[period.value]!)
const locked = computed(() => ['SENT', 'ACKNOWLEDGED'].includes(state.value.stage))
const rows = computed(() => seed.filter(row => !state.value.voided.includes(row.code)).map(row => ({ ...row, periodCode: period.value })))
const cities = computed(() => [...new Set(rows.value.map(row => row.city))].map(city => {
  const members = rows.value.filter(row => row.city === city)
  return { city, enterpriseCount: members.length, baseline: members.reduce((n,r)=>n+r.baseline,0), current: members.reduce((n,r)=>n+r.current,0) }
}))
function generate() {
  if (state.value.stage !== 'DRAFT' || !rows.value.length) return
  state.value.stage = 'READY'
  state.value.events.push('已生成模拟批次，去重键为期次与批次编号。')
}
function simulateSend(success: boolean) {
  if (!['READY', 'FAILED'].includes(state.value.stage) || !rows.value.length) return
  state.value.stage = success ? 'SENT' : 'FAILED'
  state.value.events.push(success ? '模拟发送成功，批次内报表立即锁定作废。' : '模拟发送失败，可用同一批次编号重试。')
}
function acknowledge() {
  if (state.value.stage !== 'SENT') return
  state.value.stage = 'ACKNOWLEDGED'
  state.value.events.push('模拟回执已记录，按批次核对企业数和各市人数汇总。')
}
function voidRow(code: string) {
  if (locked.value || !rows.value.some(r => r.code === code)) return
  state.value.voided.push(code)
  state.value.stage = 'DRAFT'
  state.value.events.push('已模拟作废 ' + code + '，重新生成批次时排除该报表。')
}
</script>

<template>
  <section>
    <div class="page-heading"><div><h1>国家上报流程原型</h1><p>待老师评审 · 以下使用匿名样例和模拟状态。</p></div></div>
    <el-alert title="原型演示，发送、回执及锁定均在本页面模拟" type="warning" :closable="false" />
    <el-card class="business-card" shadow="never">
      <el-form inline><el-form-item label="模拟调查期"><el-select v-model="period" style="width:180px"><el-option v-for="p in periods" :key="p" :label="p" :value="p" /></el-select></el-form-item></el-form>
      <p>批次 {{ state.batch }} · {{ labels[state.stage] }} · {{ rows.length }} 份有效企业报表</p>
      <el-alert v-if="locked" title="发送成功即锁定作废，等待回执期间也保持锁定。" type="warning" :closable="false" />
      <el-table :data="rows" empty-text="暂无可纳入本期模拟批次的报表">
        <el-table-column prop="city" label="所属市" />
        <el-table-column prop="name" label="企业" />
        <el-table-column prop="code" label="企业代码" />
        <el-table-column prop="periodCode" label="调查期" />
        <el-table-column prop="baselineSource" label="建档来源期" />
        <el-table-column prop="baseline" label="建档人数" />
        <el-table-column prop="current" label="调查人数" />
        <el-table-column prop="reason" label="减少原因" />
        <el-table-column prop="revision" label="修订版本" />
        <el-table-column label="作废"><template #default="{ row }"><el-button link type="danger" :disabled="locked" @click="voidRow(row.code)">{{ locked ? '已锁定' : '模拟作废' }}</el-button></template></el-table-column>
      </el-table>
      <h2>按市汇总</h2>
      <el-table :data="cities" empty-text="暂无汇总"><el-table-column prop="city" label="所属市" /><el-table-column prop="enterpriseCount" label="企业数" /><el-table-column prop="baseline" label="建档人数合计" /><el-table-column prop="current" label="调查人数合计" /></el-table>
      <div class="form-actions">
        <el-button :disabled="state.stage !== 'DRAFT' || !rows.length" @click="generate">生成模拟批次</el-button>
        <el-button :disabled="!['READY', 'FAILED'].includes(state.stage)" @click="simulateSend(false)">模拟发送失败</el-button>
        <el-button type="primary" :disabled="!['READY', 'FAILED'].includes(state.stage)" @click="simulateSend(true)">{{ state.stage === 'FAILED' ? '模拟重试成功' : '模拟发送成功' }}</el-button>
        <el-button :disabled="state.stage !== 'SENT'" @click="acknowledge">记录模拟回执</el-button>
      </div>
      <h2>模拟操作记录</h2>
      <p v-if="!state.events.length">暂无模拟操作。</p>
      <ol v-else><li v-for="(event, i) in state.events" :key="i">{{ event }}</li></ol>
    </el-card>
  </section>
</template>
