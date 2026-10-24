import { mockAuthProvider } from '@/mock/auth'
import { request } from '@/services/api'
import type { ApiResponse, CurrentUserData, LoginData, LoginRequest } from '@/types/api'

export interface AuthProvider {
  login(payload: LoginRequest): Promise<ApiResponse<LoginData>>
  me(token: string): Promise<ApiResponse<CurrentUserData>>
}

const realAuthProvider: AuthProvider = {
  login: (payload) =>
    request<LoginData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  me: (token) => request<CurrentUserData>('/auth/me', {}, token),
}

export const apiMode = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'real'
export const authProvider: AuthProvider = apiMode === 'mock' ? mockAuthProvider : realAuthProvider
