<!--
  PermissionTab.vue -- 权限综合管理页
  在单个页面集成三个维度的权限管理：
    - 权限项管理：增删改查系统权限（permission 条目）
    - 角色管理：增删改查角色，为角色分配权限集合
    - 用户角色分配：为用户指定角色
  提供跨维度联动视图，方便一次性完成完整的 RBAC 配置
  使用方：AdminView.vue 权限管理 Tab
-->
<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
// 用户/角色/权限全套 CRUD 及关联接口
import {
  getAllUsers,
  getAllRoles,
  getAllPermissions,
  createRole,
  updateRole,
  deleteRoleById,
  createPermission,
  updatePermission,
  deletePermissionById,
  replaceUserRoles,
  getPermissionsByRoleId,
  replaceRolePermissions,
} from '../../api/dispatchApi.js'
import { logOperation } from '../../api/log.js'

const loading = ref(false)
const users = ref([])
const roles = ref([])
const permissions = ref([])

const userRoleDialogVisible = ref(false)
const roleDialogVisible = ref(false)
const permissionDialogVisible = ref(false)
const rolePermissionDialogVisible = ref(false)

const currentUser = ref(null)
const currentRole = ref(null)
const selectedUserRoleIds = ref([])
const selectedRolePermissionIds = ref([])

const roleForm = ref({ id: null, roleName: '', roleCode: '', description: '' })
const permissionForm = ref({
  id: null,
  permissionName: '',
  permissionCode: '',
  permissionUrl: '',
  permissionMethod: 'GET',
  permissionType: 1,
  parentId: null,
})

const methodOptions = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const permissionTypeOptions = [
  { label: '菜单', value: 1 },
  { label: '按钮', value: 2 },
  { label: '接口', value: 3 },
]

const roleMap = computed(() => {
  const map = {}
  ;(roles.value || []).forEach(item => {
    map[item.id] = item
  })
  return map
})

const formatRoleNames = (row) => {
  const list = row.roles || []
  return list.map(item => item.roleName || item.roleCode).filter(Boolean)
}

const formatPermissionType = (type) => {
  const item = permissionTypeOptions.find(v => v.value === type)
  return item ? item.label : type
}

const loadData = async () => {
  loading.value = true
  try {
    const [userData, roleData, permissionData] = await Promise.all([
      getAllUsers(),
      getAllRoles(),
      getAllPermissions(),
    ])
    users.value = Array.isArray(userData) ? userData : (userData ? [userData] : [])
    roles.value = Array.isArray(roleData) ? roleData : (roleData ? [roleData] : [])
    permissions.value = Array.isArray(permissionData) ? permissionData : (permissionData ? [permissionData] : [])
  } catch (e) {
    console.error(e)
    ElMessage.error('加载权限管理数据失败')
  }
  loading.value = false
}

const openUserRoleDialog = (row) => {
  currentUser.value = row
  selectedUserRoleIds.value = (row.roles || []).map(item => item.id)
  userRoleDialogVisible.value = true
}

const saveUserRoles = async () => {
  if (!currentUser.value?.id) {
    return
  }
  try {
    const msg = await replaceUserRoles(currentUser.value.id, selectedUserRoleIds.value)
    const roleNames = roles.value
      .filter(item => selectedUserRoleIds.value.includes(item.id))
      .map(item => item.roleName || item.roleCode)
      .join('、')
    logOperation('分配用户角色', `为用户:${currentUser.value.username}分配角色:${roleNames || '无'}`)
    ElMessage.success(typeof msg === 'string' ? msg : '用户角色分配成功')
    userRoleDialogVisible.value = false
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('用户角色分配失败')
  }
}

const openRoleDialog = (row = null) => {
  roleForm.value = row
    ? {
      id: row.id,
      roleName: row.roleName || '',
      roleCode: row.roleCode || '',
      description: row.description || '',
    }
    : { id: null, roleName: '', roleCode: '', description: '' }
  roleDialogVisible.value = true
}

const saveRole = async () => {
  if (!roleForm.value.roleName || !roleForm.value.roleCode) {
    ElMessage.warning('请输入角色名称和角色编码')
    return
  }
  try {
    const isEdit = !!roleForm.value.id
    const msg = roleForm.value.id ? await updateRole(roleForm.value) : await createRole(roleForm.value)
    logOperation(isEdit ? '修改角色' : '新增角色', `${isEdit ? '修改' : '新增'}角色:${roleForm.value.roleName}`)
    ElMessage.success(typeof msg === 'string' ? msg : '角色保存成功')
    roleDialogVisible.value = false
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('角色保存失败')
  }
}

const removeRole = async (id) => {
  try { await ElMessageBox.confirm('确定删除该角色？删除后会清理用户角色和角色权限关联。', '提示') } catch { return }
  try {
    const role = roles.value.find(item => item.id === id)
    await deleteRoleById(id)
    logOperation('删除角色', `删除角色:${role?.roleName || id}`)
    ElMessage.success('角色删除成功')
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('角色删除失败')
  }
}

const openPermissionDialog = (row = null) => {
  permissionForm.value = row
    ? {
      id: row.id,
      permissionName: row.permissionName || '',
      permissionCode: row.permissionCode || '',
      permissionUrl: row.permissionUrl || '',
      permissionMethod: row.permissionMethod || 'GET',
      permissionType: row.permissionType ?? 1,
      parentId: row.parentId ?? null,
    }
    : {
      id: null,
      permissionName: '',
      permissionCode: '',
      permissionUrl: '',
      permissionMethod: 'GET',
      permissionType: 1,
      parentId: null,
    }
  permissionDialogVisible.value = true
}

const savePermission = async () => {
  if (!permissionForm.value.permissionName || !permissionForm.value.permissionCode) {
    ElMessage.warning('请输入权限名称和权限编码')
    return
  }
  try {
    const payload = {
      ...permissionForm.value,
      parentId: permissionForm.value.parentId || null,
    }
    const isEdit = !!payload.id
    const msg = payload.id ? await updatePermission(payload.id, payload) : await createPermission(payload)
    logOperation(isEdit ? '修改权限项' : '新增权限项', `${isEdit ? '修改' : '新增'}权限:${payload.permissionName}`)
    ElMessage.success(typeof msg === 'string' ? msg : '权限保存成功')
    permissionDialogVisible.value = false
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('权限保存失败')
  }
}

const removePermission = async (id) => {
  try { await ElMessageBox.confirm('确定删除该权限？删除后会清理角色权限关联。', '提示') } catch { return }
  try {
    const permission = permissions.value.find(item => item.id === id)
    await deletePermissionById(id)
    logOperation('删除权限项', `删除权限:${permission?.permissionName || id}`)
    ElMessage.success('权限删除成功')
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('权限删除失败')
  }
}

const openRolePermissionDialog = async (row) => {
  currentRole.value = row
  rolePermissionDialogVisible.value = true
  selectedRolePermissionIds.value = []
  try {
    const data = await getPermissionsByRoleId(row.id)
    selectedRolePermissionIds.value = (Array.isArray(data) ? data : []).map(item => item.id)
  } catch (e) {
    console.error(e)
    ElMessage.error('加载角色权限失败')
  }
}

const saveRolePermissions = async () => {
  if (!currentRole.value?.id) {
    return
  }
  try {
    const msg = await replaceRolePermissions(currentRole.value.id, selectedRolePermissionIds.value)
    const permissionNames = permissions.value
      .filter(item => selectedRolePermissionIds.value.includes(item.id))
      .map(item => item.permissionName || item.permissionCode)
      .join('、')
    logOperation('分配角色权限', `为角色:${currentRole.value.roleName}分配权限:${permissionNames || '无'}`)
    ElMessage.success(typeof msg === 'string' ? msg : '角色权限分配成功')
    rolePermissionDialogVisible.value = false
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('角色权限分配失败')
  }
}

defineExpose({ loadData })
</script>

<template>
  <div v-loading="loading" style="height: 100%; overflow: auto; padding-right: 4px;">
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="flex items-center justify-between">
              <span>用户分配角色</span>
            </div>
          </template>
          <el-table :data="users" stripe border max-height="320">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="username" label="用户名" min-width="120" />
            <el-table-column label="角色" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag v-for="name in formatRoleNames(row)" :key="name" class="mr-1 mb-1">{{ name }}</el-tag>
                <span v-if="!formatRoleNames(row).length">未分配</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="openUserRoleDialog(row)">分配角色</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="flex items-center justify-between">
              <span>角色管理</span>
              <el-button type="primary" @click="openRoleDialog()">新增角色</el-button>
            </div>
          </template>
          <el-table :data="roles" stripe border max-height="320">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="roleName" label="角色名称" min-width="120" />
            <el-table-column prop="roleCode" label="角色编码" min-width="120" />
            <el-table-column prop="description" label="说明" min-width="140" show-overflow-tooltip />
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openRolePermissionDialog(row)">分配权限</el-button>
                <el-button size="small" type="primary" @click="openRoleDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="removeRole(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-4">
      <template #header>
        <div class="flex items-center justify-between">
          <span>权限项管理</span>
          <el-button type="primary" @click="openPermissionDialog()">新增权限</el-button>
        </div>
      </template>
      <el-table :data="permissions" stripe border max-height="360">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="permissionName" label="权限名称" min-width="140" />
        <el-table-column prop="permissionCode" label="权限编码" min-width="160" />
        <el-table-column prop="permissionUrl" label="URL" min-width="180" show-overflow-tooltip />
        <el-table-column prop="permissionMethod" label="方法" width="90" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ formatPermissionType(row.permissionType) }}</template>
        </el-table-column>
        <el-table-column prop="parentId" label="父级ID" width="90" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openPermissionDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="removePermission(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="userRoleDialogVisible" :title="`分配角色 - ${currentUser?.username || ''}`" width="560px" class="touch-draggable-dialog">
      <el-checkbox-group v-model="selectedUserRoleIds" class="grid grid-cols-2 gap-2">
        <el-checkbox v-for="item in roles" :key="item.id" :value="item.id">{{ item.roleName }}（{{ item.roleCode }}）</el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="userRoleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveUserRoles">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roleDialogVisible" :title="roleForm.id ? '编辑角色' : '新增角色'" width="520px" class="touch-draggable-dialog">
      <el-form :model="roleForm" label-width="90px">
        <el-form-item label="角色名称"><el-input v-model="roleForm.roleName" /></el-form-item>
        <el-form-item label="角色编码"><el-input v-model="roleForm.roleCode" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="roleForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="permissionDialogVisible" :title="permissionForm.id ? '编辑权限' : '新增权限'" width="620px" class="touch-draggable-dialog">
      <el-form :model="permissionForm" label-width="100px">
        <el-form-item label="权限名称"><el-input v-model="permissionForm.permissionName" /></el-form-item>
        <el-form-item label="权限编码"><el-input v-model="permissionForm.permissionCode" /></el-form-item>
        <el-form-item label="权限URL"><el-input v-model="permissionForm.permissionUrl" /></el-form-item>
        <el-form-item label="请求方法">
          <el-select v-model="permissionForm.permissionMethod" style="width: 100%">
            <el-option v-for="item in methodOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限类型">
          <el-select v-model="permissionForm.permissionType" style="width: 100%">
            <el-option v-for="item in permissionTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="父级ID"><el-input-number v-model="permissionForm.parentId" :min="1" :step="1" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="permissionDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePermission">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rolePermissionDialogVisible" :title="`分配权限 - ${currentRole?.roleName || ''}`" width="720px" class="touch-draggable-dialog">
      <el-checkbox-group v-model="selectedRolePermissionIds" class="grid grid-cols-2 gap-2">
        <el-checkbox v-for="item in permissions" :key="item.id" :value="item.id">
          {{ item.permissionName }}（{{ item.permissionCode }}）
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="rolePermissionDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRolePermissions">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
