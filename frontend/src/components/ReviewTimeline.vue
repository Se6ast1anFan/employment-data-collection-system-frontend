<script setup lang="ts">
import type { ReviewEvent } from '@/types/review'
import { formatBeijingTime } from '@/utils/filing'
defineProps<{events:ReviewEvent[]}>()
</script>
<template><el-empty v-if="!events.length" description="暂无审核记录"/><el-timeline v-else><el-timeline-item v-for="e in events" :key="e.eventId" :timestamp="formatBeijingTime(e.reviewedAt)"><strong>{{e.level==='CITY'?'市级':'省级'}}{{e.action==='APPROVE'?'通过':'退回'}} · 提交版本 {{e.submissionVersion}}</strong><p>{{e.reviewerDisplayName}}（用户 {{e.reviewerUserId}}，机构 {{e.reviewerOrgId}}）</p><p>{{e.fromStatus}} → {{e.toStatus}}</p><p>{{e.comment||'未填写备注'}}</p></el-timeline-item></el-timeline></template>
