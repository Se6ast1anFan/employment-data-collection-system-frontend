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
        <p>{{ auth.user?.orgName }} · 调查期管理与企业填报已接入</p>
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
      <template #header><strong>第五周范围说明</strong></template>
      <el-alert title="省级修订、作废、按期汇总、账号查询与三类导出已接入" type="info" :closable="false" show-icon />
      <p>本周使用已省审通过且未作废的有效数据。原值、修订与作废记录保留；省级通过不表示已报部委。真实运行需部署第五周接口及 V7。</p>
    </el-card>
  </section>
</template>
