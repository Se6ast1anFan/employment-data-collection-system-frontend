import { ApiError } from '@/services/api'
import { getMockUserForToken, hasMockUsername, managementMockAccounts, registerMockEnterpriseAccount, updateMockAccount } from '@/mock/auth'
import { mockFilingReviewers } from '@/mock/filing'
import { managementMockState } from '@/mock/report'
import { passwordRule } from '@/utils/admin'
import type { realAdmin } from '@/services/admin'
import type { AdminRole, AdminUser, Organization, Page, PageQuery, Permission } from '@/types/admin'
import type { CurrentUser, RoleCode } from '@/types/api'
import contract from '../../../docs/第七八周前后端接口约定.openapi.json'

const catalog = contract['x-permissionCatalog'] as Permission[]
const levels = ['PROVINCE', 'CITY', 'ENTERPRISE'] as const
const roles = new Map<string, AdminRole>()
const users = new Map<string, AdminUser>()
const removedUsers = new Set<string>()
const organizations = new Map<string, Organization>()
const reservedNames = new Set<string>()
let nextRole = 9010
let nextUser = 98000

for (const [index, level] of levels.entries()) {
  const id = String(9000 + index)
  roles.set(id, { id, code: level + '_DEFAULT', name: ['省级默认', '市级默认', '企业默认'][index], level,
    permissionCodes: catalog.filter(p => p.level === level).map(p => p.code), assignedUserCount: 0, systemProtected: true, version: 1 })
}
const defaultRole = (level: RoleCode) => roles.get(String(9000 + levels.indexOf(level)))!
const roleIds = (user: AdminUser) => user.functionalRoles.map(role => role.id)
const permissionsOf = (ids: string[]) => [...new Set(ids.flatMap(id => roles.get(id)?.permissionCodes ?? []))]
const brief = ({ id, code, name, level }: AdminRole) => ({ id, code, name, level })
function checkedRoles(ids: string[], level: RoleCode) {
  const selected = [...new Set(ids)].map(id => roles.get(id))
  if (!selected.length || selected.some(role => role?.level !== level)) throw conflict('ROLE_LEVEL_MISMATCH')
  return selected.map(role => brief(role!))
}
const envelope = <T>(data: T) => ({ code: 'OK', message: '', data, traceId: 'mock-admin' })
const conflict = (reasonCode: string, historyTypes?: string[]) => new ApiError(409, '操作冲突', 'CONFLICT', '', {}, { reasonCode, historyTypes })
const missing = () => new ApiError(404, '找不到该记录')
const invalid = (message: string) => new ApiError(400, message)
const matches = (value: string, keyword?: string) => value.toLowerCase().includes(keyword?.trim().toLowerCase() ?? '')
function paginate<T>(items: T[], query: PageQuery): Page<T> {
  const page = query.page ?? 0, size = query.size ?? 20
  return { items: items.slice(page * size, (page + 1) * size), page, size, total: items.length }
}
function syncAccounts() {
  for (const { user, username } of managementMockAccounts()) {
    if (users.has(user.id)) continue
    let org = organizations.get(user.orgId)
    if (!org) {
      org = { id: user.orgId, name: user.orgName, orgType: user.roleCode, regionCode: '', regionName: '演示地区',
        parentOrgId: user.roleCode === 'PROVINCE' ? null : user.roleCode === 'CITY' ? '100' : '201', enabled: true }
      organizations.set(org.id, org)
    }
    users.set(user.id, { id: user.id, username, displayName: user.displayName, org, roleCode: user.roleCode,
      enabled: true, version: 1, createdAt: new Date().toISOString(), functionalRoles: [brief(defaultRole(user.roleCode))], permissions: [] })
  }
}
function activeUsers() {
  syncAccounts()
  return [...users.values()].filter(user => !removedUsers.has(user.id))
}
function readUser(user: AdminUser): AdminUser {
  const ids = roleIds(user)
  return { ...user, functionalRoles: checkedRoles(ids, user.roleCode), permissions: permissionsOf(ids) }
}
export function mockCurrentUser(user: CurrentUser): CurrentUser {
  syncAccounts()
  const record = users.get(user.id)
  if (!record) return user
  const { displayName, functionalRoles, permissions } = readUser(record)
  return { ...user, displayName, functionalRoles, permissions }
}
function authorize(token: string, permission: string) {
  const user = getMockUserForToken(token)
  if (!user) throw new ApiError(401, '登录状态已失效，请重新登录')
  if (user.roleCode !== 'PROVINCE' || !mockCurrentUser(user).permissions?.includes('PROVINCE.' + permission))
    throw new ApiError(403, '当前账号缺少此操作权限')
}
function getUser(id: string) {
  syncAccounts()
  const user = users.get(id)
  if (!user || removedUsers.has(id)) throw missing()
  return user
}
function getRole(id: string) { const role = roles.get(id); if (!role) throw missing(); return role }
function version(row: { version: number }, expectedVersion: number) {
  if (row.version !== expectedVersion) throw conflict('VERSION_CONFLICT')
}
const managerPermissions = catalog.filter(p => /^PROVINCE\.(USER|ROLE)\./.test(p.code))
function requireAdmin(candidate: (user: AdminUser) => string[] | null) {
  if (!activeUsers().some(user => {
    if (user.roleCode !== 'PROVINCE' || !user.enabled || !user.org.enabled) return false
    const codes = candidate(user)
    return codes && managerPermissions.every(p => codes.includes(p.code))
  })) throw conflict('LAST_ADMIN')
}
function roleUsers(id: string) { return activeUsers().filter(user => roleIds(user).includes(id)) }
function counted(role: AdminRole) { return { ...role, assignedUserCount: roleUsers(role.id).length } }
function roleNameKey(level: RoleCode, name: string) { return level + ':' + name.trim().toLowerCase() }
function validateRole(level: RoleCode, name: string, codes: string[], current?: AdminRole) {
  const key = roleNameKey(level, name)
  if (!name.trim() || name.trim().length > 50 || !codes.length) throw invalid('请填写角色名称并选择权限')
  if (codes.some(code => !catalog.some(p => p.level === level && p.code === code))) throw conflict('ROLE_LEVEL_MISMATCH')
  if (key !== (current && roleNameKey(level, current.name)) &&
      (reservedNames.has(key) || [...roles.values()].some(role => roleNameKey(role.level, role.name) === key))) throw conflict('ROLE_NAME_EXISTS')
}

export const mockAdmin: typeof realAdmin = {
  async organizations(query, token) {
    authorize(token, 'USER.READ')
    return envelope(paginate([...organizations.values()].filter(item => (!query.orgType || query.orgType === item.orgType) && matches(item.name, query.keyword)), query))
  },
  async users(query, token) {
    authorize(token, 'USER.READ')
    const rows = activeUsers().filter(user => (!query.orgId || user.org.id === query.orgId) &&
      (!query.roleCode || user.roleCode === query.roleCode) && (query.enabled === undefined || query.enabled === user.enabled) &&
      (!query.functionalRoleId || roleIds(user).includes(query.functionalRoleId)) &&
      (matches(user.username, query.keyword) || matches(user.displayName, query.keyword)))
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id, undefined, { numeric: true }))
    return envelope(paginate(rows.map(readUser), query))
  },
  async user(id, token) { authorize(token, 'USER.READ'); return envelope(readUser(getUser(id))) },
  async createUser(input, token) {
    authorize(token, 'USER.CREATE')
    const org = organizations.get(input.orgId)
    if (!org?.enabled) throw missing()
    const username = input.username.trim()
    const displayName = input.displayName.trim()
    if (!username || username.length > 64 || !displayName || displayName.length > 80 || !passwordRule.test(input.initialPassword))
      throw invalid('请检查用户名、显示姓名和初始密码')
    if (hasMockUsername(username)) throw conflict('USERNAME_EXISTS')
    const id = String(++nextUser)
    const functionalRoles = checkedRoles(input.functionalRoleIds, org.orgType)
    const user = { id, username, displayName, org, roleCode: org.orgType, functionalRoles, permissions: [],
      enabled: true, version: 1, createdAt: new Date().toISOString() }
    registerMockEnterpriseAccount({ username, password: input.initialPassword,
      user: { id, displayName, roleCode: org.orgType, orgId: org.id, orgName: org.name } })
    users.set(id, user)
    return envelope(readUser(user))
  },
  async updateUser(id, input, expected, token) {
    authorize(token, 'USER.UPDATE')
    const user = getUser(id); version(user, expected)
    if (!input.displayName.trim() || input.displayName.trim().length > 80) throw invalid('请填写 1–80 字的显示姓名')
    const functionalRoles = checkedRoles(input.functionalRoleIds, user.roleCode)
    requireAdmin(row => permissionsOf(row.id === id ? input.functionalRoleIds : roleIds(row)))
    Object.assign(user, { displayName: input.displayName.trim(), functionalRoles, version: user.version + 1 })
    updateMockAccount(id, { displayName: user.displayName })
    return envelope(readUser(user))
  },
  async status(id, enabled, expected, token) {
    authorize(token, 'USER.STATUS')
    const user = getUser(id); version(user, expected)
    if (!enabled) requireAdmin(row => row.id === id ? null : permissionsOf(roleIds(row)))
    user.enabled = enabled; user.version++
    updateMockAccount(id, { enabled })
    return envelope(readUser(user))
  },
  async reset(id, password, expected, token) {
    authorize(token, 'USER.RESET_PASSWORD')
    const user = getUser(id); version(user, expected)
    if (!passwordRule.test(password)) throw invalid('新密码格式无效')
    user.version++
    updateMockAccount(id, { password })
    return envelope(readUser(user))
  },
  async deleteUser(id, expected, token) {
    authorize(token, 'USER.DELETE')
    const user = getUser(id); version(user, expected)
    const histories = [...managementMockState.histories.values()]
    const historyTypes = []
    if (histories.some(item => item.snapshots.some(snapshot => snapshot.submittedBy === id))) historyTypes.push('REPORT_SUBMISSION')
    if (mockFilingReviewers.has(id)) historyTypes.push('FILING_REVIEW')
    if (histories.some(item => item.reviewEvents.some(event => event.reviewerUserId === id))) historyTypes.push('REPORT_REVIEW')
    if (historyTypes.length) throw conflict('USER_HAS_HISTORY', historyTypes)
    requireAdmin(row => row.id === id ? null : permissionsOf(roleIds(row)))
    removedUsers.add(id); user.version++
    updateMockAccount(id, { deleted: true })
    return envelope(readUser(user))
  },
  async permissions(token) { authorize(token, 'ROLE.READ'); return envelope({ items: catalog }) },
  async roles(query, token) {
    authorize(token, 'ROLE.READ')
    const rows = [...roles.values()].filter(role => (!query.level || role.level === query.level) && matches(role.name, query.keyword))
    rows.sort((a, b) => levels.indexOf(a.level) - levels.indexOf(b.level) || Number(b.systemProtected) - Number(a.systemProtected) || a.name.localeCompare(b.name))
    return envelope(paginate(rows.map(counted), query))
  },
  async role(id, token) { authorize(token, 'ROLE.READ'); return envelope(counted(getRole(id))) },
  async createRole(input, token) {
    authorize(token, 'ROLE.CREATE')
    validateRole(input.level, input.name, input.permissionCodes)
    const id = String(++nextRole)
    const role = { ...input, name: input.name.trim(), id, code: 'CUSTOM_' + id, assignedUserCount: 0, systemProtected: false, version: 1 }
    roles.set(id, role)
    return envelope(role)
  },
  async updateRole(id, input, expected, token) {
    authorize(token, 'ROLE.UPDATE')
    const role = getRole(id); version(role, expected)
    if (role.systemProtected) throw conflict('PROTECTED_ROLE')
    validateRole(role.level, input.name, input.permissionCodes, role)
    requireAdmin(user => [...new Set(roleIds(user).flatMap(roleId => roleId === id ? input.permissionCodes : permissionsOf([roleId])))])
    Object.assign(role, { ...input, name: input.name.trim(), version: role.version + 1 })
    return envelope(counted(role))
  },
  async deleteRole(id, expected, replacementId, token) {
    authorize(token, 'ROLE.DELETE')
    const role = getRole(id); version(role, expected)
    if (role.systemProtected) throw conflict('PROTECTED_ROLE')
    const affected = roleUsers(id)
    if (affected.length && !replacementId) throw conflict('ROLE_REPLACEMENT_REQUIRED')
    const replacement = replacementId ? getRole(replacementId) : null
    if (replacement && (replacement.id === id || replacement.level !== role.level)) throw conflict('ROLE_LEVEL_MISMATCH')
    const replace = (user: AdminUser) => roleIds(user).flatMap(roleId => roleId === id ? replacement ? [replacement.id] : [] : [roleId])
    requireAdmin(user => permissionsOf(replace(user)))
    for (const user of affected) {
      user.functionalRoles = checkedRoles(replace(user), user.roleCode)
      user.version++
    }
    reservedNames.add(roleNameKey(role.level, role.name))
    roles.delete(id)
    return envelope({ deletedRoleId: id, affectedUserCount: affected.length, replacementRoleId: replacement?.id ?? null })
  },
  async monitor(token) {
    authorize(token, 'MONITOR.READ')
    const checkedAt = new Date().toISOString()
    const unknown = { status: 'UNKNOWN' as const, checkedAt }
    return envelope({ sampledAt: checkedAt, cpu: { ...unknown, usagePercent: null },
      memory: { ...unknown, usedBytes: null, totalBytes: null }, disk: { ...unknown, usedBytes: null, totalBytes: null },
      backend: { ...unknown, version: '本地演示', startedAt: '' }, mysql: unknown, rabbitmq: unknown, nationalReceiver: unknown })
  },
}
