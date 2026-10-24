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
  },
  actions: {
    async login(payload: LoginRequest) {
      const loginResponse = await authProvider.login(payload)
      this.token = loginResponse.data.accessToken
      this.user = loginResponse.data.user
    },
    clearSession() {
      this.token = null
      this.user = null
    },
  },
})
