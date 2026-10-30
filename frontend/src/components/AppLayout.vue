<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand, SwitchButton } from '@element-plus/icons-vue'

import { getMenusForRole, roleNames } from '@/config/navigation'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const collapsed = ref(false)

const role = computed(() => auth.user?.roleCode)
const menus = computed(() => role.value ? getMenusForRole(role.value) : [])
const roleLabel = computed(() => role.value ? roleNames[role.value] : '')

function logout() {
  auth.clearSession()
  router.replace('/login')
}
</script>

<template>
  <el-container class="app-shell">
    <el-aside :width="collapsed ? '64px' : '228px'" class="app-sidebar">
      <div class="brand" :class="{ 'brand--collapsed': collapsed }">
        <div class="brand-mark">云</div>
        <div v-if="!collapsed" class="brand-text">
          <strong>就业数据采集</strong>
          <span>第四周市省两级审核</span>
        </div>
      </div>
      <el-menu :default-active="route.path" router :collapse="collapsed" class="role-menu">
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">
        <el-button text :icon="collapsed ? Expand : Fold" aria-label="切换侧边栏" @click="collapsed = !collapsed" />
        <div class="header-user">
          <div class="user-summary">
            <strong>{{ auth.user?.displayName }}</strong>
            <span>{{ roleLabel }} · {{ auth.user?.orgName }}</span>
          </div>
          <el-button :icon="SwitchButton" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="app-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
