import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import { queryString } from '@/services/management'
import type { AdminRole, AdminUser, Monitor, Organization, OrganizationQuery, Page, Permission, RoleCreate, RoleDeletion, RoleEdit, RoleQuery, UserCreate, UserEdit, UserQuery } from '@/types/admin'

const base = '/province/admin'
const item = (path: string, id: string) => path + '/' + encodeURIComponent(id)
const json = (method: string, body: object) => ({ method, body: JSON.stringify(body) })

export const realAdmin = {
  organizations: (query: OrganizationQuery, token: string) => request<Page<Organization>>(base + '/organizations' + queryString(query), {}, token),
  users: (query: UserQuery, token: string) => request<Page<AdminUser>>(base + '/users' + queryString(query), {}, token),
  user: (id: string, token: string) => request<AdminUser>(base + item('/users', id), {}, token),
  createUser: (body: UserCreate, token: string) => request<AdminUser>(base + '/users', json('POST', body), token),
  updateUser: (id: string, body: UserEdit, expectedVersion: number, token: string) => request<AdminUser>(base + item('/users', id), json('PUT', { ...body, expectedVersion }), token),
  status: (id: string, enabled: boolean, expectedVersion: number, token: string) => request<AdminUser>(base + item('/users', id) + '/status', json('PUT', { enabled, expectedVersion }), token),
  reset: (id: string, newPassword: string, expectedVersion: number, token: string) => request<AdminUser>(base + item('/users', id) + '/reset-password', json('POST', { newPassword, expectedVersion }), token),
  deleteUser: (id: string, expectedVersion: number, token: string) => request<AdminUser>(base + item('/users', id), json('DELETE', { expectedVersion }), token),
  permissions: (token: string) => request<{ items: Permission[] }>(base + '/permissions', {}, token),
  roles: (query: RoleQuery, token: string) => request<Page<AdminRole>>(base + '/roles' + queryString(query), {}, token),
  role: (id: string, token: string) => request<AdminRole>(base + item('/roles', id), {}, token),
  createRole: (body: RoleCreate, token: string) => request<AdminRole>(base + '/roles', json('POST', body), token),
  updateRole: (id: string, body: RoleEdit, expectedVersion: number, token: string) => request<AdminRole>(base + item('/roles', id), json('PUT', { ...body, expectedVersion }), token),
  deleteRole: (id: string, expectedVersion: number, replacementRoleId: string | undefined, token: string) => request<RoleDeletion>(base + item('/roles', id) + '/replace-and-delete', json('POST', { expectedVersion, replacementRoleId }), token),
  monitor: (token: string, signal?: AbortSignal) => request<Monitor>(base + '/monitor', { signal }, token),
}

export async function getAdmin() {
  return apiMode === 'mock' ? (await import('@/mock/admin')).mockAdmin : realAdmin
}
