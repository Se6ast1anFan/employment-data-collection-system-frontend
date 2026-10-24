export type RoleCode = 'ENTERPRISE' | 'CITY' | 'PROVINCE'

export interface ApiResponse<T> {
  code: string
  message: string
  data: T
  traceId: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface CurrentUser {
  id: string
  displayName: string
  roleCode: RoleCode
  orgId: string
  orgName: string
}

export interface LoginData {
  accessToken: string
  expiresInSeconds: number
  user: CurrentUser
}

export interface CurrentUserData {
  user: CurrentUser
}

export interface HealthData {
  status: 'UP'
  version: string
}

export interface RegionItem {
  code: string
  name: string
  level: number
}

export interface PageAction {
  label: string
  week: number
}

export interface PlaceholderPageConfig {
  title: string
  description: string
  actions: PageAction[]
}

export interface MenuItemConfig {
  label: string
  path: string
}
