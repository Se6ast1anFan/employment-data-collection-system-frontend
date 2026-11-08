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
      <span class="brand-mark" aria-hidden="true">云</span>
      <h1>云南省企业就业失业<br />数据采集系统</h1>
      <ol class="login-flow" aria-label="业务流程">
        <li>企业填报</li><li>市级审核</li><li>省级汇总与分析</li>
      </ol>
    </section>
    <el-card class="login-card" shadow="never">
      <div class="login-card__header">
        <div>
          <h2>用户登录</h2>
          <p>请输入系统账号和密码</p>
        </div>
        <el-tag v-if="isMock" type="warning">本地演示</el-tag>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @keyup.enter="submit">
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
