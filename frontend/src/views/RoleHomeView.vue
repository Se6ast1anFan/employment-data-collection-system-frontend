<script setup lang="ts">
import { computed } from 'vue'

import { getMenusForRole, roleNames } from '@/config/navigation'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const role = computed(() => auth.user?.roleCode)
const roleLabel = computed(() => role.value ? roleNames[role.value] : '')
const menuCount = computed(() => role.value ? getMenusForRole(role.value).length - 1 : 0)
</script>

<template>
  <section>
    <div class="page-heading">
      <div>
        <p class="eyebrow">{{ roleLabel }}</p>
        <h1>欢迎，{{ auth.user?.displayName }}</h1>
        <p>{{ auth.user?.orgName }} · 第二周企业备案功能已接入</p>
      </div>
    </div>
    <el-row :gutter="18">
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="status-card"><strong>已开放</strong><span>登录、权限与企业备案</span></el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="status-card"><strong>{{ menuCount }}</strong><span>个角色业务入口</span></el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="status-card"><strong>权限有效</strong><span>菜单与路由双重控制</span></el-card>
      </el-col>
    </el-row>
    <el-card shadow="never" class="week-one-card">
      <template #header><strong>第二周范围说明</strong></template>
      <el-alert title="企业备案已开放，填报及报表审核仍按后续周次开发" type="info" :closable="false" show-icon />
      <p>省级可创建企业账号并审核备案，企业可保存、提交和查看备案历史；其他模块仍不会产生业务数据。</p>
    </el-card>
  </section>
</template>
