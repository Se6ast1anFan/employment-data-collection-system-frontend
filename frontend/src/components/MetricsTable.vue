<script setup lang="ts">
import type { SixMetrics } from '@/types/week6'
import { metricDefinitions, percentText, signedText } from '@/utils/week6'
defineProps<{rows:{periodCode:string;periodLabel:string;metrics:SixMetrics;hasSample?:boolean}[]}>()
</script>
<template><el-table :data="rows" empty-text="暂无分析结果"><el-table-column prop="periodLabel" label="调查期" min-width="150"/><el-table-column prop="periodCode" label="期次代码" min-width="140"/><el-table-column v-for="m in metricDefinitions" :key="m.key" :label="`${m.label}（${m.unit}）`" min-width="150"><template #default="s">{{m.key==='changePercent'?percentText(s.row.metrics[m.key]):m.key==='netChange'?signedText(s.row.metrics[m.key]):s.row.metrics[m.key]}}</template></el-table-column><el-table-column label="备案版本来源（企业数）" min-width="260"><template #default="s">冻结版本 {{s.row.metrics.filingSourceCounts.SNAPSHOT_VERSION}} · 当前回退 {{s.row.metrics.filingSourceCounts.CURRENT_FALLBACK}} · 不可用 {{s.row.metrics.filingSourceCounts.UNAVAILABLE}}</template></el-table-column></el-table></template>
