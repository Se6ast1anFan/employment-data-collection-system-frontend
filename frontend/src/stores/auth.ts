import { defineStore } from 'pinia'

import { authProvider } from '@/services/auth'
import type { CurrentUser, LoginRequest } from '@/types/api'

interface AuthState {
  token: string | null
  user: CurrentUser | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ token: null, user: null }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    can: (state) => (permission: string) => {
      const user = state.user
      if (!user || !permission.startsWith(user.roleCode + '.')) return false
      if (Array.isArray(user.permissions)) return user.permissions.includes(permission)
      return user.permissions === undefined && user.functionalRoles === undefined &&
        !/^PROVINCE\.(USER|ROLE|MONITOR)\./.test(permission)
    },
  },
  actions: {
    async login(payload: LoginRequest) {
      const loginResponse = await authProvider.login(payload)
      const token = loginResponse.data.accessToken
      const response = await authProvider.me(token)
      this.token = token
      this.user = response.data.user
    },
    async refreshUser() {
      const token = this.token
      if (!token) return
      const response = await authProvider.me(token)
      if (this.token === token) this.user = response.data.user
    },
    clearSession() {
      this.token = null
      this.user = null
    },
  },
})
