<!--
  RoleManageTab.vue -- 角色管理
  功能：管理系统角色的增删改查，并为每个角色分配权限：
    - 左侧：角色列表（增删改，点击选中某角色）
    - 右侧：权限树，勾选后一键保存替换该角色的全部权限
  使用方：AdminView.vue 权限管理 Tab
-->
<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
// 角色及权限 CRUD 接口
import {
  getAllRoles,
  getAllPermissions,
  createRole,
  updateRole,
  deleteRoleById,
  getPermissionsByRoleId,       // 查询某角色已有权限
  replaceRolePermissions,       // 一次性替换角色所有权限
} from '../../api/dispatchApi.js'
import { logOperation } from '../../api/log.js'

const loading = ref(false)
const roles = ref([])
const permissions = ref([])

const roleDialogVisible = ref(false)
const rolePermissionDialogVisible = ref(false)

const currentRole = ref(null)
const selectedRolePermissionIds = ref([])

const roleForm = ref({ id: null, roleName: '', roleCode: '', description: '' })

const loadData = async () => {
  loading.value = true
  try {
    const [roleData, permissionData] = await Promise.all([
      getAllRoles(),
      getAllPermissions(),
    ])
    roles.value = Array.isArray(roleData) ? roleData : (roleData ? [roleData] : [])
    permissions.value = Array.isArray(permissionData) ? permissionData : (permissionData ? [permissionData] : [])
  } catch (error) {
    console.error(error)
    ElMessage.error('加载角色管理数据失败')
  } finally {
    loading.value = false
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
    const message = roleForm.value.id ? await updateRole(roleForm.value) : await createRole(roleForm.value)
    logOperation(isEdit ? '修改角色' : '新增角色', `${isEdit ? '修改' : '新增'}角色:${roleForm.value.roleName}`)
    ElMessage.success(typeof message === 'string' ? message : '角色保存成功')
    roleDialogVisible.value = false
    await loadData()
  } catch (error) {
    console.error(error)
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
  } catch (error) {
    console.error(error)
    ElMessage.error('角色删除失败')
  }
}

const openRolePermissionDialog = async (row) => {
  currentRole.value = row
  rolePermissionDialogVisible.value = true
  selectedRolePermissionIds.value = []

  try {
    const data = await getPermissionsByRoleId(row.id)
    selectedRolePermissionIds.value = (Array.isArray(data) ? data : []).map(item => item.id)
  } catch (error) {
    console.error(error)
    ElMessage.error('加载角色权限失败')
  }
}

const saveRolePermissions = async () => {
  if (!currentRole.value?.id) return

  try {
    const message = await replaceRolePermissions(currentRole.value.id, selectedRolePermissionIds.value)
    const permissionNames = permissions.value
      .filter(item => selectedRolePermissionIds.value.includes(item.id))
      .map(item => item.permissionName || item.permissionCode)
      .join('、')
    logOperation('分配角色权限', `为角色:${currentRole.value.roleName}分配权限:${permissionNames || '无'}`)
    ElMessage.success(typeof message === 'string' ? message : '角色权限分配成功')
    rolePermissionDialogVisible.value = false
    await loadData()
  } catch (error) {
    console.error(error)
    ElMessage.error('角色权限分配失败')
  }
}

defineExpose({ loadData })
</script>

<template>
  <div v-loading="loading" style="height: 100%; overflow: auto; padding-right: 4px;">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span>角色管理</span>
          <el-button type="primary" @click="openRoleDialog()">新增角色</el-button>
        </div>
      </template>
      <el-table :data="roles" stripe border height="100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="roleName" label="角色名称" min-width="140" />
        <el-table-column prop="roleCode" label="角色编码" min-width="140" />
        <el-table-column prop="description" label="说明" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openRolePermissionDialog(row)">分配权限</el-button>
            <el-button size="small" type="primary" @click="openRoleDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="removeRole(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

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
