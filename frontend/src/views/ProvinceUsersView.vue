<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AdminOrganizationPicker from '@/components/AdminOrganizationPicker.vue'
import { roleNames } from '@/config/navigation'
import { getAdmin } from '@/services/admin'
import { useAuthStore } from '@/stores/auth'
import { adminError, passwordHint, passwordRule } from '@/utils/admin'
import { formatBeijingTime } from '@/utils/filing'
import type { AdminRole, AdminUser, Organization, UserQuery } from '@/types/admin'

const auth = useAuthStore()
const router = useRouter()
const can = (action: string) => auth.can('PROVINCE.USER.' + action)
const token = () => auth.token!
const filters = reactive<UserQuery>({})
const organization = ref<Organization>()
let applied: UserQuery = {}
const rows = ref<AdminUser[]>([])
const page = ref(1)
const total = ref(0)
const size = 20
const busy = ref(false)
const error = ref('')
const notice = ref('')
const selected = ref<AdminUser>()
const dialog = ref<'detail' | 'create' | 'edit' | 'status' | 'reset' | 'delete'>()
const open = computed({ get: () => !!dialog.value, set: value => { if (!value && !saving.value) close() } })
const titles = { detail: '账号详情', create: '创建账号', edit: '修改账号', status: '确认账号状态', reset: '重置密码', delete: '删除账号' }
const saving = ref(false)
const dialogError = ref('')
const form = reactive({ username: '', displayName: '', password: '', functionalRoleIds: [] as string[] })
const createOrg = ref<Organization>()
const roleOptions = ref<AdminRole[]>([])
const loadingRoles = ref(false)
let roleRequest = 0
const level = computed(() => dialog.value === 'create' ? createOrg.value?.orgType : selected.value?.roleCode)

async function load(target = page.value) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const api = await getAdmin()
    let { data } = await api.users({ ...applied, page: target - 1, size }, token())
    const last = Math.max(1, Math.ceil(data.total / size))
    if (target > last) ({ data } = await api.users({ ...applied, page: last - 1, size }, token()))
    rows.value = data.items; total.value = data.total; page.value = data.page + 1
  } catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
function search() {
  applied = { ...filters, enabled: typeof filters.enabled === 'boolean' ? filters.enabled : undefined,
    keyword: filters.keyword?.trim(), orgId: organization.value?.id }
  void load(1)
}
function clear() {
  filters.keyword = undefined; filters.roleCode = undefined; filters.enabled = undefined
  organization.value = undefined
  search()
}
function close() {
  dialog.value = undefined; selected.value = undefined
  roleRequest++
  form.password = ''
  loadingRoles.value = false
}
function create() {
  selected.value = undefined; createOrg.value = undefined; roleOptions.value = []
  Object.assign(form, { username: '', displayName: '', password: '', functionalRoleIds: [] })
  dialogError.value = ''; dialog.value = 'create'
}
async function read(id: string) {
  if (saving.value) return
  selected.value = undefined; dialogError.value = ''; dialog.value = 'detail'
  saving.value = true
  try { selected.value = (await (await getAdmin()).user(id, token())).data }
  catch (cause) { dialogError.value = adminError(cause) }
  finally { saving.value = false }
}
async function loadRoles(org?: Organization) {
  if (dialog.value === 'create') form.functionalRoleIds = []
  const roleLevel = org?.orgType ?? level.value
  const id = ++roleRequest
  roleOptions.value = []; dialogError.value = ''
  if (!roleLevel) { loadingRoles.value = false; return }
  loadingRoles.value = true
  try {
    const api = await getAdmin()
    for (let page = 0; id === roleRequest; page++) {
      const { data } = await api.roles({ level: roleLevel, page, size: 100 }, token())
      if (id !== roleRequest) return
      roleOptions.value.push(...data.items)
      if (!data.items.length || (page + 1) * data.size >= data.total) break
    }
  } catch (cause) { if (id === roleRequest) dialogError.value = adminError(cause) }
  finally { if (id === roleRequest) loadingRoles.value = false }
}
function prepare(action: 'edit' | 'reset' | 'status' | 'delete') {
  if (!selected.value) return
  dialogError.value = ''; form.password = ''; dialog.value = action
  if (action === 'edit') {
    form.displayName = selected.value.displayName
    form.functionalRoleIds = selected.value.functionalRoles.map(role => role.id)
    void loadRoles()
  }
}
const actionLabel = computed(() => dialog.value === 'status' ? selected.value?.enabled ? '停用账号' : '启用账号' :
  dialog.value === 'edit' ? '保存修改' : titles[dialog.value ?? 'detail'])
async function save() {
  const action = dialog.value, user = selected.value
  if (!action || action === 'detail' || saving.value || loadingRoles.value) return
  dialogError.value = ''
  const displayName = form.displayName.trim()
  const username = form.username.trim()
  const userEdit = { displayName, functionalRoleIds: [...form.functionalRoleIds] }
  if ((action === 'create' || action === 'edit') && (!displayName || !userEdit.functionalRoleIds.length)) {
    dialogError.value = '请填写显示姓名并选择至少一个同级功能角色。'; return
  }
  if (action === 'create' && (!createOrg.value?.enabled || !username)) {
    dialogError.value = '请选择已启用的组织，并输入用户名。'; return
  }
  if ((action === 'create' || action === 'reset') && !passwordRule.test(form.password)) {
    dialogError.value = passwordHint; return
  }
  if (action !== 'create' && !user) return
  const label = actionLabel.value
  const self = !!user && user.id === auth.user?.id
  saving.value = true; notice.value = ''
  try {
    const api = await getAdmin()
    if (action === 'create') await api.createUser({ ...userEdit, orgId: createOrg.value!.id, username, initialPassword: form.password }, token())
    else if (action === 'edit') await api.updateUser(user!.id, userEdit, user!.version, token())
    else if (action === 'status') await api.status(user!.id, !user!.enabled, user!.version, token())
    else if (action === 'reset') await api.reset(user!.id, form.password, user!.version, token())
    else await api.deleteUser(user!.id, user!.version, token())
    close()
    notice.value = label + '成功。'
    if (self && action !== 'edit') {
      auth.clearSession()
      await router.replace('/login')
      return
    }
    if (self) await auth.refreshUser()
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
      <div><h1>用户管理</h1><p>管理本省已有组织内的账号及功能角色。</p></div>
      <el-button v-if="can('CREATE') && auth.can('PROVINCE.ROLE.READ')" type="primary" @click="create">创建账号</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="notice" :title="notice" type="success" :closable="false" />
    <el-card shadow="never" v-loading="busy">
      <el-form class="admin-filters" label-position="top" :disabled="busy" @submit.prevent="search">
        <el-form-item label="用户名或显示姓名"><el-input v-model="filters.keyword" clearable maxlength="80" /></el-form-item>
        <el-form-item label="所属组织"><AdminOrganizationPicker v-model="organization" /></el-form-item>
        <el-form-item label="身份">
          <el-select v-model="filters.roleCode" clearable placeholder="全部身份">
            <el-option v-for="(label, key) in roleNames" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号状态">
          <el-select v-model="filters.enabled" clearable placeholder="全部状态">
            <el-option label="启用" :value="true" /><el-option label="停用" :value="false" />
          </el-select>
        </el-form-item>
        <div class="admin-filter-actions"><el-button type="primary" native-type="submit">查询</el-button><el-button @click="clear">清除</el-button></div>
      </el-form>
      <el-table :data="rows" row-key="id" empty-text="暂无匹配账号">
        <el-table-column prop="username" label="用户名" min-width="145" />
        <el-table-column prop="displayName" label="显示姓名" min-width="140" />
        <el-table-column prop="org.name" label="所属组织" min-width="170" />
        <el-table-column label="身份" width="110"><template #default="{ row }">{{ roleNames[(row as AdminUser).roleCode] }}</template></el-table-column>
        <el-table-column label="功能角色" min-width="170"><template #default="{ row }">{{ (row as AdminUser).functionalRoles.map(role => role.name).join('、') }}</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="read(row.id)">详情</el-button></template></el-table-column>
      </el-table>
      <el-pagination :current-page="page" :page-size="size" :total="total" :disabled="busy" layout="total,prev,pager,next" @current-change="load" />
    </el-card>

    <el-dialog v-model="open" :title="dialog ? titles[dialog] : ''" width="min(660px, 94vw)"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <el-alert v-if="dialogError" :title="dialogError" type="error" :closable="false" />
      <div v-if="selected" class="admin-subject">
        <strong>{{ selected.displayName }}</strong>（{{ selected.username }}）
        <span>{{ selected.org.name }} / {{ roleNames[selected.roleCode] }}</span>
      </div>
      <template v-if="dialog === 'detail' && selected">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="账号状态">{{ selected.enabled ? '启用' : '停用' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间（北京时间）">{{ formatBeijingTime(selected.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="功能角色">{{ selected.functionalRoles.map(role => role.name).join('、') }}</el-descriptions-item>
          <el-descriptions-item label="有效权限"><ul class="admin-permissions"><li v-for="code in selected.permissions" :key="code">{{ code }}</li></ul></el-descriptions-item>
        </el-descriptions>
      </template>
      <el-form v-if="dialog === 'create' || dialog === 'edit'" label-position="top" :disabled="saving" @submit.prevent="save">
        <template v-if="dialog === 'create'">
          <el-form-item label="所属组织（选定后决定身份）" required>
            <AdminOrganizationPicker v-model="createOrg" enabled-only @update:model-value="loadRoles" />
            <span v-if="createOrg">{{ roleNames[createOrg.orgType] }}</span>
          </el-form-item>
          <el-form-item label="用户名" required><el-input v-model="form.username" maxlength="64" autocomplete="off" /></el-form-item>
          <el-form-item label="初始密码" required>
            <el-input v-model="form.password" type="password" maxlength="64" autocomplete="new-password" />
            <span class="muted">{{ passwordHint }}</span>
          </el-form-item>
        </template>
        <el-form-item label="显示姓名" required><el-input v-model="form.displayName" maxlength="80" /></el-form-item>
        <el-form-item label="同级功能角色" required>
          <el-select v-model="form.functionalRoleIds" multiple filterable :disabled="!level" :loading="loadingRoles" placeholder="选择功能角色">
            <el-option v-for="role in roleOptions" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <p v-if="dialog === 'status'">{{ selected?.enabled ? '停用后该账号无法登录，现有会话将失效。' : '启用后该账号可用现有密码登录。' }}</p>
      <p v-if="dialog === 'delete'">删除后账号无法登录，现有会话将失效，用户名将被保留。已有正式提交或审核记录的账号可停用。</p>
      <el-form v-if="dialog === 'reset'" label-position="top" :disabled="saving" @submit.prevent="save">
        <p>旧密码和现有会话将失效，请通过线下方式告知本人新密码。</p>
        <el-form-item label="新密码" required>
          <el-input v-model="form.password" type="password" maxlength="64" autocomplete="new-password" />
          <span class="muted">{{ passwordHint }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="admin-dialog-actions" v-if="dialog === 'detail' && selected">
          <el-button v-if="can('UPDATE') && auth.can('PROVINCE.ROLE.READ')" @click="prepare('edit')">修改姓名和角色</el-button>
          <el-button v-if="can('STATUS')" @click="prepare('status')">{{ selected.enabled ? '停用账号' : '启用账号' }}</el-button>
          <el-button v-if="can('RESET_PASSWORD')" @click="prepare('reset')">重置密码</el-button>
          <el-button v-if="can('DELETE')" type="danger" plain @click="prepare('delete')">删除账号</el-button>
        </div>
        <template v-else-if="dialog && dialog !== 'detail'">
          <el-button :disabled="saving" @click="close">取消</el-button>
          <el-button :type="dialog === 'delete' || (dialog === 'status' && selected?.enabled) ? 'danger' : 'primary'"
            :loading="saving" :disabled="loadingRoles" @click="save">{{ actionLabel }}</el-button>
        </template>
      </template>
    </el-dialog>
  </section>
</template>
