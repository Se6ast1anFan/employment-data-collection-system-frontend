import type { FunctionalRole, RoleCode } from './api'

export interface Page<T> { items: T[]; page: number; size: number; total: number }
export interface PageQuery { page?: number; size?: number }
export interface UserQuery extends PageQuery {
  orgId?: string; roleCode?: RoleCode; enabled?: boolean; keyword?: string; functionalRoleId?: string
}
export interface OrganizationQuery extends PageQuery { orgType?: RoleCode; keyword?: string }
export interface RoleQuery extends PageQuery { level?: RoleCode; keyword?: string }
export interface Organization {
  id: string; name: string; orgType: RoleCode; regionCode: string; regionName: string; parentOrgId: string | null; enabled: boolean
}
export interface AdminUser {
  id: string; username: string; displayName: string; org: Organization; roleCode: RoleCode
  functionalRoles: FunctionalRole[]; permissions: string[]; enabled: boolean; version: number; createdAt: string
}
export interface AdminRole extends FunctionalRole {
  permissionCodes: string[]; assignedUserCount: number; systemProtected: boolean; version: number
}
export interface Permission { code: string; name: string; level: RoleCode; feature: string; operation: string }
export interface UserEdit { displayName: string; functionalRoleIds: string[] }
export interface UserCreate extends UserEdit { orgId: string; username: string; initialPassword: string }
export interface RoleEdit { name: string; permissionCodes: string[] }
export interface RoleCreate extends RoleEdit { level: RoleCode }
export interface RoleDeletion { deletedRoleId: string; affectedUserCount: number; replacementRoleId: string | null }
export interface Check { status: 'UP' | 'DOWN' | 'UNKNOWN'; checkedAt: string }
export interface SizeMetric extends Check { usedBytes: number | null; totalBytes: number | null }
export interface Monitor {
  sampledAt: string
  cpu: Check & { usagePercent: number | null }
  memory: SizeMetric
  disk: SizeMetric
  backend: Check & { version: string; startedAt: string }
  mysql: Check
  rabbitmq: Check
  nationalReceiver: Check
}
