<script setup lang="ts">
import type { EnterpriseProfileFields, RegionInfo } from '@/types/filing'
import { formatRegion } from '@/utils/filing'

defineProps<{ profile: EnterpriseProfileFields; region: RegionInfo }>()
</script>

<template>
  <el-descriptions :column="1" border class="profile-snapshot">
    <el-descriptions-item label="所属地区">{{ formatRegion(region) }}</el-descriptions-item>
    <el-descriptions-item label="组织机构代码">{{ profile.organizationCode || '—' }}</el-descriptions-item>
    <el-descriptions-item label="企业名称">{{ profile.enterpriseName || '—' }}</el-descriptions-item>
    <el-descriptions-item label="企业性质">{{ profile.natureParentCode }} / {{ profile.natureCode }}</el-descriptions-item>
    <el-descriptions-item label="所属行业">{{ profile.industryParentCode }} / {{ profile.industryCode }}</el-descriptions-item>
    <el-descriptions-item label="主要经营业务">{{ profile.mainBusiness || '—' }}</el-descriptions-item>
    <el-descriptions-item label="联系人">{{ profile.contactName || '—' }}</el-descriptions-item>
    <el-descriptions-item label="联系地址">{{ profile.addressParentCode }} / {{ profile.addressCode }}</el-descriptions-item>
    <el-descriptions-item label="邮政编码">{{ profile.postalCode || '—' }}</el-descriptions-item>
    <el-descriptions-item label="联系电话">{{ profile.contactPhone || '—' }}</el-descriptions-item>
    <el-descriptions-item label="传真">{{ profile.fax || '—' }}</el-descriptions-item>
    <el-descriptions-item label="EMAIL">{{ profile.email || '—' }}</el-descriptions-item>
  </el-descriptions>
</template>
