<!--
  PermissionItemTab.vue -- 权限项管理
  功能：管理系统权限项的增删改查：
    - 权限项对应后端接口或操作（如 user:delete、role:assign）
    - 每条权限项可分配给一个或多个角色
  使用方：AdminView.vue 权限管理 Tab
-->
<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
// 权限项 CRUD 接口
import {
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermissionById,
} from '../../api/dispatchApi.js'
import { logOperation } from '../../api/log.js'

const loading = ref(false)
const permissions = ref([])    // 权限项列表

const dialogVisible = ref(false)
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

const formatPermissionType = (type) => {
  const item = permissionTypeOptions.find(v => v.value === type)
  return item ? item.label : type
}

const loadData = async () => {
  loading.value = true
  try {
    const permissionData = await getAllPermissions()
    permissions.value = Array.isArray(permissionData) ? permissionData : (permissionData ? [permissionData] : [])
  } catch (error) {
    console.error(error)
    ElMessage.error('加载权限项数据失败')
  } finally {
    loading.value = false
  }
}

const openDialog = (row = null) => {
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
  dialogVisible.value = true
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
    const message = payload.id ? await updatePermission(payload.id, payload) : await createPermission(payload)
    logOperation(isEdit ? '修改权限项' : '新增权限项', `${isEdit ? '修改' : '新增'}权限:${payload.permissionName}`)
    ElMessage.success(typeof message === 'string' ? message : '权限保存成功')
    dialogVisible.value = false
    await loadData()
  } catch (error) {
    console.error(error)
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
  } catch (error) {
    console.error(error)
    ElMessage.error('权限删除失败')
  }
}

defineExpose({ loadData })
</script>

<template>
  <div v-loading="loading" style="height: 100%; overflow: auto; padding-right: 4px;">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span>权限项管理</span>
          <el-button type="primary" @click="openDialog()">新增权限</el-button>
        </div>
      </template>
      <el-table :data="permissions" stripe border height="100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="permissionName" label="权限名称" min-width="160" />
        <el-table-column prop="permissionCode" label="权限编码" min-width="180" />
        <el-table-column prop="permissionUrl" label="URL" min-width="220" show-overflow-tooltip />
        <el-table-column prop="permissionMethod" label="方法" width="90" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ formatPermissionType(row.permissionType) }}</template>
        </el-table-column>
        <el-table-column prop="parentId" label="父级ID" width="100" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="removePermission(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="permissionForm.id ? '编辑权限' : '新增权限'" width="620px" class="touch-draggable-dialog">
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
        <el-form-item label="父级ID">
          <el-input-number v-model="permissionForm.parentId" :min="1" :step="1" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePermission">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
