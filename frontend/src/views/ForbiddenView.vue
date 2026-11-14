<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
function logout() {
  auth.clearSession()
  void router.replace('/login')
}
</script>

<template>
  <main class="error-page">
    <el-result icon="warning" title="403" sub-title="当前账号缺少此页面或操作的权限。需要访问时，请联系省级管理员。">
      <template #extra>
        <el-button type="primary" @click="router.push('/home')">返回工作台</el-button>
        <el-button v-if="auth.isAuthenticated" @click="logout">退出登录</el-button>
      </template>
    </el-result>
  </main>
</template>
