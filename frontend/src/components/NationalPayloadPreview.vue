<script setup lang="ts">
import { computed } from 'vue'
import type { NationalPreview } from '@/types/national'

const props = defineProps<{ preview: NationalPreview }>()
const groups = computed(() => {
  const rows = new Map<string, NationalPreview['enterprises']>()
  for (const row of props.preview.enterprises) {
    const city = rows.get(row.cityCode) ?? []
    city.push(row)
    rows.set(row.cityCode, city)
  }
  return props.preview.cities.map(city => ({ city, enterprises: rows.get(city.cityCode) ?? [] }))
})
const columns = {
  organizationCode: '组织机构代码', reportId: '报表编号', regionCode: '地区代码', natureCode: '性质代码', industryCode: '行业代码',
  submissionVersion: '提交版本', currentVersion: '当前版本', baselineSourcePeriodCode: '建档来源期',
  baselineEmploymentCount: '建档人数', periodEmploymentCount: '调查人数', netChange: '净变化',
  reductionTypeCode: '减少类型', primaryReasonCode: '主要原因', primaryReasonDetail: '原因说明', otherReason: '其他原因',
} as const
</script>

<template>
  <dl class="national-totals">
    <div><dt>全省企业数</dt><dd>{{ preview.summary.enterpriseCount }}</dd></div>
    <div><dt>建档人数合计</dt><dd>{{ preview.summary.baselineEmploymentTotal }}</dd></div>
    <div><dt>调查人数合计</dt><dd>{{ preview.summary.periodEmploymentTotal }}</dd></div>
    <div><dt>净变化</dt><dd>{{ preview.summary.netChange }}</dd></div>
  </dl>
  <el-empty v-if="!groups.length" description="暂无符合条件的企业报表" :image-size="60" />
  <el-collapse v-else>
    <el-collapse-item v-for="{ city, enterprises } in groups" :key="city.cityCode" :name="city.cityCode">
      <template #title>
        <span>{{ city.cityName }}（{{ city.cityCode }}） · {{ city.enterpriseCount }} 家 · 建档 {{ city.baselineEmploymentTotal }} 人 · 调查 {{ city.periodEmploymentTotal }} 人 · 净变化 {{ city.netChange }} 人</span>
      </template>
      <el-table :data="enterprises" row-key="reportId" empty-text="暂无企业明细">
        <el-table-column prop="enterpriseName" label="企业" min-width="160" />
        <el-table-column v-for="(label, key) in columns" :key="key" :label="label" min-width="114">
          <template #default="{ row }">{{ row[key] ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="原报表" width="105" fixed="right">
          <template #default="{ row }">
            <router-link :to="{ path: '/province/data/reports/' + encodeURIComponent(row.reportId), query: { readonly: '1' } }">只读追溯</router-link>
          </template>
        </el-table-column>
      </el-table>
    </el-collapse-item>
  </el-collapse>
</template>

<style scoped>
.national-totals { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0 20px; }
.national-totals div { min-width: 110px; background: #f2f6fc; border-radius: 6px; padding: 10px 14px; }
dd { margin: 6px 0 0; font-size: 21px; font-weight: 600; }
</style>
