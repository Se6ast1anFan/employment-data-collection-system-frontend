<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Expand, Fold, Menu, SwitchButton } from '@element-plus/icons-vue'

import { getMenusForRole, roleNames } from '@/config/navigation'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const menuOpen = ref(false)
const desktopCollapsed = ref(false)
const menuToggle = ref<HTMLButtonElement>()
const navigation = ref<HTMLElement>()

const role = computed(() => auth.user?.roleCode)
const menus = computed(() => role.value ? getMenusForRole(role.value) : [])
const roleLabel = computed(() => role.value ? roleNames[role.value] : '')
const groupLabels = {
  ENTERPRISE: ['企业备案', '调查填报', '通知'],
  CITY: ['辖区审核', '通知'],
  PROVINCE: ['备案与调查期', '审核与进度', '分析与报送', '通知与系统'],
}
const groupPaths = {
  ENTERPRISE: [['profile', 'filing'], ['report/new', 'report/batch', 'report/history'], ['notices']],
  CITY: [['reports'], ['notices']],
  PROVINCE: [
    ['enterprise-accounts/new', 'filings', 'periods'],
    ['reports', 'enterprise-progress', 'accounts'],
    ['summary', 'analysis', 'national'],
    ['notices', 'users', 'roles', 'monitor'],
  ],
}
const groups = computed(() => {
  const currentRole = role.value
  if (!currentRole) return []
  const prefix = `/${currentRole.toLowerCase()}/`
  const groups = groupPaths[currentRole].map((paths, index) => ({
    label: groupLabels[currentRole][index],
    items: paths.flatMap(path => menus.value.filter(menu => menu.path === prefix + path)),
  }))
  const remaining = menus.value.filter(menu => !groups.some(group => group.items.includes(menu)))
  return [{ label: '', items: remaining }, ...groups]
})

async function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    await nextTick()
    const currentLink = navigation.value?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
    const firstLink = navigation.value?.querySelector<HTMLAnchorElement>('a')
    const link = currentLink ?? firstLink
    link?.focus()
  }
}

function closeMenu(restoreFocus = false) {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (restoreFocus) menuToggle.value?.focus()
}

watch(() => route.path, () => closeMenu(true))

function logout() {
  auth.clearSession()
  router.replace('/login')
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--collapsed': desktopCollapsed }" @keydown.esc="closeMenu(true)">
    <header class="app-header">
      <div class="header-context">
        <el-button text class="desktop-nav-toggle" :icon="desktopCollapsed ? Expand : Fold" :aria-label="desktopCollapsed ? '展开侧边栏' : '收起侧边栏'" :aria-expanded="!desktopCollapsed" aria-controls="role-navigation" @click="desktopCollapsed = !desktopCollapsed" />
        <button ref="menuToggle" type="button" class="nav-toggle" :aria-expanded="menuOpen" aria-controls="role-navigation" @click="toggleMenu">
          <el-icon aria-hidden="true"><Menu /></el-icon> 菜单
        </button>
        <span class="header-title">{{ route.meta.title }}</span>
      </div>
      <div class="header-user">
        <div class="user-summary">
          <strong>{{ auth.user?.displayName }}</strong>
          <span>{{ auth.user?.orgName }}</span>
        </div>
        <el-button :icon="SwitchButton" @click="logout">退出</el-button>
      </div>
    </header>
    <aside class="app-sidebar" :class="{ 'app-sidebar--open': menuOpen }">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">云</span>
        <div class="brand-text"><strong>就业数据采集</strong><span>{{ roleLabel }}</span></div>
      </div>
      <nav id="role-navigation" ref="navigation" class="role-menu" aria-label="业务导航">
        <div v-for="group in groups" :key="group.label" class="nav-group">
          <p v-if="group.label" class="nav-group-title">{{ group.label }}</p>
          <router-link v-for="item in group.items" :key="item.path" :to="item.path" class="nav-link" @click="closeMenu(true)">{{ item.label }}</router-link>
        </div>
      </nav>
    </aside>
    <main class="app-content"><router-view /></main>
  </div>
</template>
