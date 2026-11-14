import { ApiError } from '@/services/api'

export const passwordRule = /^(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,64}$/
export const passwordHint = '使用 8–64 位可见 ASCII 字符，至少含一个字母和一个数字。'

export function adminError(cause: unknown) {
  if (!(cause instanceof ApiError)) return (cause as Error).message
  const history: Record<string, string> = {
    REPORT_SUBMISSION: '正式报表提交', FILING_REVIEW: '企业备案审核', REPORT_REVIEW: '报表审核',
  }
  const reasons: Record<string, string> = {
    LAST_ADMIN: '此操作会导致没有可登录且拥有完整用户与角色管理权限的省级管理员。',
    ROLE_REPLACEMENT_REQUIRED: '该角色已有分配，请刷新详情并选择同级替代角色。',
    ROLE_LEVEL_MISMATCH: '请选择与账号身份或原角色同级的功能角色。',
    VERSION_CONFLICT: '资料已被更新，请关闭窗口并重新读取最新详情后再操作。',
    USERNAME_EXISTS: '该用户名已被使用或保留，请更换用户名。',
    ROLE_NAME_EXISTS: '该层级已使用或保留此角色名称，请更换名称。',
    PROTECTED_ROLE: '系统默认角色受保护。',
  }
  if (cause.data?.reasonCode === 'USER_HAS_HISTORY') {
    const detail = cause.data.historyTypes?.map(key => history[key] ?? key).join('、')
    return `该账号有${detail || '报表提交或审核'}记录，无法删除。需要停止使用时可停用账号。`
  }
  return [reasons[cause.data?.reasonCode ?? ''] ?? cause.message, ...Object.values(cause.fieldErrors)].join(' ')
}
