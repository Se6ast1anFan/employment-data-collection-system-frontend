import { describe, expect, it } from 'vitest'

import { emptyProfile, normalizeProfile, validateProfile } from '@/utils/filing'

describe('企业备案字段处理', () => {
  it('去除空白、组织机构代码转大写并将空值转为 null', () => {
    const profile = emptyProfile()
    profile.organizationCode = ' ab12 '
    profile.email = '   '
    expect(normalizeProfile(profile)).toEqual(expect.objectContaining({ organizationCode: 'AB12', email: null }))
  })

  it('草稿仅校验已填写值，提交校验全部必填项', () => {
    const draft = emptyProfile()
    expect(validateProfile(draft, false)).toEqual({})
    expect(validateProfile(draft, true)).toEqual(expect.objectContaining({
      organizationCode: expect.any(String), enterpriseName: expect.any(String), fax: expect.any(String),
    }))
    draft.postalCode = '123'
    expect(validateProfile(draft, false).postalCode).toContain('6 位')
  })
})
