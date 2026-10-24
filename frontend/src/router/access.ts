import type { RoleCode } from '@/types/api'

export function canAccess(allowedRoles: RoleCode[] | undefined, role: RoleCode | undefined) {
  if (!allowedRoles?.length) return true
  return Boolean(role && allowedRoles.includes(role))
}
