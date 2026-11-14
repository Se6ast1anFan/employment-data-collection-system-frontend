import type {
  ApiResponse,
  CurrentUser,
  CurrentUserData,
  LoginData,
  LoginRequest,
  RoleCode,
} from '@/types/api'

interface MockAccount {
  username: string
  password: string
  user: CurrentUser
  enabled?: boolean
  deleted?: boolean
}

const MOCK_PASSWORD = 'Demo@123456'

const accounts: MockAccount[] = [
  {
    username: 'demo_enterprise',
    password: MOCK_PASSWORD,
    user: {
      id: '101',
      displayName: '演示企业用户',
      roleCode: 'ENTERPRISE',
      orgId: '301',
      orgName: '演示企业',
    },
  },
  {
    username: 'demo_city',
    password: MOCK_PASSWORD,
    user: {
      id: '102',
      displayName: '演示市级用户',
      roleCode: 'CITY',
      orgId: '201',
      orgName: '演示市级管理部门',
    },
  },
  {
    username: 'demo_province',
    password: MOCK_PASSWORD,
    user: {
      id: '103',
      displayName: '演示省级用户',
      roleCode: 'PROVINCE',
      orgId: '100',
      orgName: '演示省级管理部门',
    },
  },
]

const tokenUsers = new Map<string, CurrentUser>()

const wait = () => new Promise((resolve) => window.setTimeout(resolve, 250))
const traceId = () => `mock-${crypto.randomUUID()}`

export class MockAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const mockAccounts = accounts.map(({ username, user: { displayName, roleCode } }) => ({
  username,
  displayName,
  roleCode,
}))

export const mockAuthProvider = {
  async login(payload: LoginRequest): Promise<ApiResponse<LoginData>> {
    await wait()
    const account = accounts.find(
      (item) => item.username === payload.username && item.password === payload.password && item.enabled !== false && !item.deleted,
    )
    if (!account) {
      throw new MockAuthError(401, '账号或密码错误')
    }

    const user = account.user
    const token = `mock-token-${user.roleCode.toLowerCase()}-${user.id}-${crypto.randomUUID()}`
    tokenUsers.set(token, user)
    return {
      code: 'OK',
      message: '',
      data: { accessToken: token, expiresInSeconds: 7200, user },
      traceId: traceId(),
    }
  },

  async me(token: string): Promise<ApiResponse<CurrentUserData>> {
    await wait()
    const user = tokenUsers.get(token)
    if (!user) {
      throw new MockAuthError(401, '登录状态已失效，请重新登录')
    }
    const { mockCurrentUser } = await import('@/mock/admin')
    return { code: 'OK', message: '', data: { user: mockCurrentUser(user) }, traceId: traceId() }
  },
}

export function getMockUserForToken(token: string): CurrentUser | undefined {
  return tokenUsers.get(token)
}

export function hasMockUsername(username: string): boolean {
  return accounts.some((account) => account.username === username)
}

export function registerMockEnterpriseAccount(account: MockAccount): void {
  accounts.push(account)
}

export const roleLabels: Record<RoleCode, string> = {
  ENTERPRISE: '企业用户',
  CITY: '市级用户',
  PROVINCE: '省级用户',
}

export function managementMockAccounts() { return accounts.map(({username,user})=>({username,user})) }

export function updateMockAccount(id: string, change: { displayName?: string; password?: string; enabled?: boolean; deleted?: boolean }) {
  const account = accounts.find(item => item.user.id === id)
  if (!account) return
  if (change.displayName !== undefined) account.user.displayName = change.displayName
  if (change.enabled !== undefined) account.enabled = change.enabled
  if (change.deleted) account.deleted = true
  if (change.password !== undefined) account.password = change.password
  if (change.enabled === false || change.deleted || change.password !== undefined) {
    for (const [token, user] of tokenUsers) if (user.id === id) tokenUsers.delete(token)
  }
}
