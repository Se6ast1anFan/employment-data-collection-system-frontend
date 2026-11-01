<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { roleHomePaths } from '@/config/navigation'
import { mockAccounts } from '@/mock/auth'
import { canAccess } from '@/router/access'
import { ApiError } from '@/services/api'
import { apiMode } from '@/services/auth'
import { useAuthStore } from '@/stores/auth'
import type { LoginRequest } from '@/types/api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive<LoginRequest>({ username: '', password: '' })
const isMock = computed(() => apiMode === 'mock')

const rules: FormRules<LoginRequest> = {
  username: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    { max: 64, message: '登录账号不能超过 64 个字符', trigger: 'blur' },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

function fillMock(username: string) {
  form.username = username
  form.password = 'Demo@123456'
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await auth.login(form)
    const requested = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const role = auth.user!.roleCode
    const requestedRoute = requested ? router.resolve(requested) : null
    const destination =
      requestedRoute && canAccess(requestedRoute.meta.roles, role)
        ? requested
        : roleHomePaths[role]
    await router.replace(destination)
    ElMessage.success('登录成功')
  } catch (error) {
    ElMessage.error(error instanceof ApiError || error instanceof Error ? error.message : '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <p class="eyebrow">云南省企业就业失业数据采集系统</p>
      <h1>第六周数据分析与通知</h1>
      <p>省级按调查期分析有效报表并管理本省通知，企业与市级可浏览所属省通知。</p>
      <ul>
        <li>企业、市级、省级三类角色独立菜单</li>
        <li>企业备案版本、退回理由与审核留痕</li>
        <li>后续周次功能继续保持清晰占位</li>
      </ul>
    </section>
    <el-card class="login-card" shadow="always">
      <div class="login-card__header">
        <div>
          <h2>用户登录</h2>
          <p>请输入系统账号和密码</p>
        </div>
        <el-tag :type="isMock ? 'warning' : 'success'">{{ isMock ? 'Mock 模式' : '真实接口' }}</el-tag>
      </div>
      <el-alert
        v-if="!isMock"
        title="当前连接真实接口；若后端尚未启动，请使用 npm run dev:mock 演示。"
        type="info"
        :closable="false"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="submit">
        <el-form-item label="登录账号" prop="username">
          <el-input v-model="form.username" maxlength="64" autocomplete="username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" autocomplete="current-password" show-password placeholder="请输入密码" />
        </el-form-item>
        <el-button type="primary" class="login-submit" :loading="loading" @click="submit">登录</el-button>
      </el-form>
      <div v-if="isMock" class="mock-accounts">
        <span>演示账号（密码统一为 Demo@123456）</span>
        <el-button v-for="account in mockAccounts" :key="account.username" text type="primary" @click="fillMock(account.username)">
          {{ account.displayName }}
        </el-button>
      </div>
    </el-card>
  </main>
</template>
