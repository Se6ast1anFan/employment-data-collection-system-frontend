<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { roleNames } from '@/config/navigation'
import { getAdmin } from '@/services/admin'
import { useAuthStore } from '@/stores/auth'
import { adminError } from '@/utils/admin'
import type { AdminRole, AdminUser, Permission, RoleQuery } from '@/types/admin'
import type { RoleCode } from '@/types/api'

const auth = useAuthStore()
const can = (action: string) => auth.can('PROVINCE.ROLE.' + action)
const token = () => auth.token!
const filters = reactive<RoleQuery>({})
let applied: RoleQuery = {}
const rows = ref<AdminRole[]>([])
const catalog = ref<Permission[]>([])
const page = ref(1)
const total = ref(0)
const size = 20
const busy = ref(false)
const error = ref('')
const notice = ref('')
const selected = ref<AdminRole>()
const dialog = ref<'detail' | 'create' | 'edit' | 'delete'>()
const titles = { detail: '角色详情', create: '创建功能角色', edit: '修改功能角色', delete: '删除功能角色' }
const saving = ref(false)
const dialogError = ref('')
const open = computed({
  get: () => !!dialog.value,
  set: value => { if (!value && !saving.value) { dialog.value = undefined; userRequest++ } },
})
const form = reactive({ name: '', level: 'PROVINCE' as RoleCode, permissionCodes: [] as string[] })
const replacement = ref<string>()
const replacements = ref<AdminRole[]>([])
const assignedUsers = ref<AdminUser[]>([])
const userPage = ref(1)
const userTotal = ref(0)
const userBusy = ref(false)
const userError = ref('')
let userRequest = 0

const permissionGroups = computed(() => {
  const groups = new Map<string, Permission[]>()
  for (const permission of catalog.value) {
    if (permission.level !== form.level) continue
    if (!groups.has(permission.feature)) groups.set(permission.feature, [])
    groups.get(permission.feature)!.push(permission)
  }
  return [...groups]
})
const permissionNames = computed(() => new Map(catalog.value.map(p => [p.code, p.name])))

async function load(target = page.value) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const api = await getAdmin()
    let { data } = await api.roles({ ...applied, page: target - 1, size }, token())
    const last = Math.max(1, Math.ceil(data.total / size))
    if (target > last) ({ data } = await api.roles({ ...applied, page: last - 1, size }, token()))
    rows.value = data.items; total.value = data.total; page.value = data.page + 1
  } catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
async function loadCatalog() {
  if (catalog.value.length) return
  catalog.value = (await (await getAdmin()).permissions(token())).data.items
}
function search() {
  applied = { ...filters, keyword: filters.keyword?.trim() }
  void load(1)
}
function clear() {
  filters.keyword = undefined; filters.level = undefined
  search()
}
async function loadUsers(target = 1) {
  const id = selected.value?.id
  if (!id || !auth.can('PROVINCE.USER.READ')) return
  const seq = ++userRequest
  userBusy.value = true; userError.value = ''
  try {
    const { data } = await (await getAdmin()).users({ functionalRoleId: id, page: target - 1, size }, token())
    if (seq !== userRequest) return
    assignedUsers.value = data.items; userTotal.value = data.total; userPage.value = data.page + 1
  } catch (cause) { if (seq === userRequest) userError.value = adminError(cause) }
  finally { if (seq === userRequest) userBusy.value = false }
}
async function read(id: string) {
  if (saving.value) return
  selected.value = undefined; dialogError.value = ''; dialog.value = 'detail'
  assignedUsers.value = []; userTotal.value = 0; userError.value = ''
  saving.value = true
  try {
    selected.value = (await (await getAdmin()).role(id, token())).data
    void loadUsers()
    await loadCatalog()
  } catch (cause) { dialogError.value = adminError(cause) }
  finally { saving.value = false }
}
async function edit(create: boolean) {
  const role = selected.value
  if (!create && (!role || role.systemProtected)) return
  if (create) selected.value = undefined
  dialogError.value = ''; dialog.value = create ? 'create' : 'edit'
  Object.assign(form, { name: create ? '' : role!.name, level: create ? filters.level || 'PROVINCE' : role!.level,
    permissionCodes: create ? [] : [...role!.permissionCodes] })
  saving.value = true
  try { await loadCatalog() }
  catch (cause) { dialogError.value = adminError(cause) }
  finally { saving.value = false }
}
async function prepareDelete() {
  const role = selected.value
  if (!role || role.systemProtected) return
  dialogError.value = ''; replacement.value = undefined; replacements.value = []
  dialog.value = 'delete'; saving.value = true
  try {
    const api = await getAdmin()
    selected.value = (await api.role(role.id, token())).data
    if (!selected.value.assignedUserCount) return
    for (let index = 0; ; index++) {
      const { data } = await api.roles({ level: role.level, page: index, size: 100 }, token())
      replacements.value.push(...data.items.filter(item => item.id !== role.id))
      if (!data.items.length || (index + 1) * data.size >= data.total) break
    }
  } catch (cause) { dialogError.value = adminError(cause) }
  finally { saving.value = false }
}
async function save() {
  const mode = dialog.value, role = selected.value
  if (!mode || mode === 'detail' || saving.value || (mode !== 'create' && !role)) return
  dialogError.value = ''
  const body = { name: form.name.trim(), permissionCodes: [...form.permissionCodes] }
  if (mode !== 'delete' && (!body.name || !body.permissionCodes.length)) {
    dialogError.value = '请填写角色名称并至少选择一项本级权限。'; return
  }
  if (mode === 'delete' && role!.assignedUserCount && !replacement.value) {
    dialogError.value = '请选择同级替代角色。'; return
  }
  saving.value = true; notice.value = ''
  try {
    const api = await getAdmin()
    if (mode === 'create') {
      await api.createRole({ ...body, level: form.level }, token())
      notice.value = '功能角色已创建。'
    } else if (mode === 'edit') {
      await api.updateRole(role!.id, body, role!.version, token())
      notice.value = '功能角色已保存。'
    } else {
      const { data } = await api.deleteRole(role!.id, role!.version, replacement.value, token())
      notice.value = `角色已删除，已替换 ${data.affectedUserCount} 个账号的角色。`
    }
    dialog.value = undefined
    if (role && auth.user?.functionalRoles?.some(item => item.id === role.id)) await auth.refreshUser()
    if (can('READ')) await load()
  } catch (cause) {
    if (dialog.value) dialogError.value = adminError(cause)
    else error.value = '操作已提交，刷新当前权限失败。' + adminError(cause)
  } finally { saving.value = false }
}
onMounted(() => load())
</script>

<template>
  <section class="admin-workbench">
    <div class="page-heading">
      <div><h1>角色与权限</h1><p>按身份层级管理功能角色及其业务权限。</p></div>
      <el-button v-if="can('CREATE')" type="primary" @click="edit(true)">创建功能角色</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="notice" :title="notice" type="success" :closable="false" />
    <el-card shadow="never" v-loading="busy">
      <el-form class="admin-filters" label-position="top" :disabled="busy" @submit.prevent="search">
        <el-form-item label="角色名称"><el-input v-model="filters.keyword" maxlength="50" clearable /></el-form-item>
        <el-form-item label="身份层级"><el-select v-model="filters.level" clearable placeholder="全部层级">
          <el-option v-for="(label, key) in roleNames" :key="key" :label="label" :value="key" />
        </el-select></el-form-item>
        <div class="admin-filter-actions"><el-button type="primary" native-type="submit">查询</el-button><el-button @click="clear">清除</el-button></div>
      </el-form>
      <el-table :data="rows" row-key="id" empty-text="暂无匹配角色">
        <el-table-column prop="name" label="角色名称" min-width="160" />
        <el-table-column label="身份层级" min-width="110"><template #default="{ row }">{{ roleNames[(row as AdminRole).level] }}</template></el-table-column>
        <el-table-column prop="assignedUserCount" label="使用账号数" min-width="110" />
        <el-table-column label="保护状态" min-width="220"><template #default="{ row }">
          <el-tag v-if="row.systemProtected" type="info">系统默认，不能修改或删除</el-tag><span v-else>自定义</span>
        </template></el-table-column>
        <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="read(row.id)">详情</el-button></template></el-table-column>
      </el-table>
      <el-pagination :current-page="page" :page-size="size" :total="total" :disabled="busy" layout="total,prev,pager,next" @current-change="load" />
    </el-card>

    <el-dialog v-model="open" :title="dialog ? titles[dialog] : ''" width="min(760px, 94vw)"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <el-alert v-if="dialogError" :title="dialogError" type="error" :closable="false" />
      <div v-if="selected" class="admin-subject">
        <strong>{{ selected.name }}</strong><span>{{ roleNames[selected.level] }} / {{ selected.assignedUserCount }} 个使用账号</span>
      </div>
      <template v-if="dialog === 'detail' && selected">
        <p v-if="selected.systemProtected">系统默认，不能修改或删除。</p>
        <h3>已授予权限</h3>
        <ul class="admin-permissions"><li v-for="code in selected.permissionCodes" :key="code">{{ permissionNames.get(code) ?? code }}</li></ul>
        <template v-if="auth.can('PROVINCE.USER.READ')">
          <h3>已分配账号</h3>
          <el-alert v-if="userError" :title="userError" type="error" :closable="false" />
          <el-table :data="assignedUsers" v-loading="userBusy" empty-text="暂无已分配账号">
            <el-table-column prop="username" label="用户名" min-width="125" />
            <el-table-column prop="displayName" label="显示姓名" min-width="120" />
            <el-table-column prop="org.name" label="所属组织" min-width="140" />
            <el-table-column label="状态" width="80"><template #default="{ row }">{{ row.enabled ? '启用' : '停用' }}</template></el-table-column>
          </el-table>
          <el-pagination :current-page="userPage" :page-size="size" :total="userTotal" :disabled="userBusy" layout="total,prev,pager,next" @current-change="loadUsers" />
        </template>
        <p v-else>查看已分配账号需要用户查看权限。</p>
      </template>
      <el-form v-if="dialog === 'create' || dialog === 'edit'" label-position="top" :disabled="saving" @submit.prevent="save">
        <el-form-item label="角色名称" required><el-input v-model="form.name" maxlength="50" /></el-form-item>
        <el-form-item label="身份层级" required>
          <el-select v-model="form.level" :disabled="dialog === 'edit'" @change="form.permissionCodes = []">
            <el-option v-for="(label, key) in roleNames" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-checkbox-group v-model="form.permissionCodes" aria-label="功能权限">
          <fieldset v-for="[feature, permissions] in permissionGroups" :key="feature" class="admin-fieldset">
            <legend>{{ feature }}</legend>
            <el-checkbox v-for="permission in permissions" :key="permission.code" :value="permission.code">{{ permission.operation }}</el-checkbox>
          </fieldset>
        </el-checkbox-group>
      </el-form>
      <template v-if="dialog === 'delete' && selected">
        <p v-if="!selected.assignedUserCount">当前无账号使用此角色。删除后角色名称仍会保留。</p>
        <template v-else>
          <p>将为 {{ selected.assignedUserCount }} 个账号替换此角色，含停用账号。每个账号的其他角色会保留。</p>
          <el-form label-position="top" :disabled="saving">
            <el-form-item label="同级替代角色" required>
              <el-select v-model="replacement" filterable placeholder="请选择替代角色">
                <el-option v-for="role in replacements" :key="role.id" :value="role.id" :label="role.name" />
              </el-select>
            </el-form-item>
          </el-form>
        </template>
      </template>
      <template #footer>
        <template v-if="dialog === 'detail' && selected && !selected.systemProtected">
          <el-button v-if="can('UPDATE')" :disabled="saving" @click="edit(false)">修改角色</el-button>
          <el-button v-if="can('DELETE')" :disabled="saving" type="danger" plain @click="prepareDelete">删除角色</el-button>
        </template>
        <template v-else-if="dialog && dialog !== 'detail'">
          <el-button :disabled="saving" @click="open = false">取消</el-button>
          <el-button :type="dialog === 'delete' ? 'danger' : 'primary'" :loading="saving"
            :disabled="dialog === 'delete' && !!selected?.assignedUserCount && !replacement" @click="save">
            {{ dialog === 'delete' ? '确认删除角色' : '保存角色' }}
          </el-button>
        </template>
      </template>
    </el-dialog>
  </section>
</template>
