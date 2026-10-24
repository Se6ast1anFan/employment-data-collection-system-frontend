import 'vue-router'

import type { PlaceholderPageConfig, RoleCode } from './api'

export {}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    roles?: RoleCode[]
    pageConfig?: PlaceholderPageConfig
  }
}
