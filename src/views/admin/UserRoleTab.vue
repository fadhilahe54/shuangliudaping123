<!--
  UserRoleTab.vue -- 用户角色分配管理
  功能：在后台管理页为用户分配/更换角色
    - 左侧：用户列表（可按用户名/角色名搜索筛选）
    - 右侧：角色复选列表，勾选后一键保存替换该用户所有角色
  使用方：AdminView.vue 权限管理 Tab
-->
<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
// 用户列表、角色列表、替换用户角色接口
import {
  getAllUsers,
  getAllRoles,
  replaceUserRoles,
} from '../../api/dispatchApi.js'
// 操作日志记录
import { logOperation } from '../../api/log.js'

const loading = ref(false)
const users = ref([])           // 所有用户列表
const roles = ref([])           // 所有角色列表
const searchText = ref('')      // 用户名/角色名搜索关键字

/**
 * 按关键字过滤后的用户列表：
 *  - 用户名模糊匹配
 *  - 或者已分配的角色名/角色编码模糊匹配
 *  - 全部忽略大小写
 */
const filteredUsers = computed(() => {
  const keyword = (searchText.value || '').trim().toLowerCase()
  if (!keyword) return users.value
  return users.value.filter(u => {
    if ((u.username || '').toLowerCase().includes(keyword)) return true
    return (u.roles || []).some(r =>
      (r.roleName || '').toLowerCase().includes(keyword)
      || (r.roleCode || '').toLowerCase().includes(keyword)
    )
  })
})

const dialogVisible = ref(false)
const currentUser = ref(null)
const selectedRoleIds = ref([])

const formatRoleNames = (row) => {
  const list = row.roles || []
  return list.map(item => item.roleName || item.roleCode).filter(Boolean)
}

const loadData = async () => {
  loading.value = true
  try {
    const [userData, roleData] = await Promise.all([
      getAllUsers(),
      getAllRoles(),
    ])
    users.value = Array.isArray(userData) ? userData : (userData ? [userData] : [])
    roles.value = Array.isArray(roleData) ? roleData : (roleData ? [roleData] : [])
  } catch (error) {
    console.error(error)
    ElMessage.error('加载用户角色数据失败')
  } finally {
    loading.value = false
  }
}

const openDialog = (row) => {
  currentUser.value = row
  selectedRoleIds.value = (row.roles || []).map(item => item.id)
  dialogVisible.value = true
}

const saveUserRoles = async () => {
  if (!currentUser.value?.id) return

  try {
    const message = await replaceUserRoles(currentUser.value.id, selectedRoleIds.value)
    const roleNames = roles.value
      .filter(item => selectedRoleIds.value.includes(item.id))
      .map(item => item.roleName || item.roleCode)
      .join('、')
    logOperation('分配用户角色', `为用户:${currentUser.value.username}分配角色:${roleNames || '无'}`)
    ElMessage.success(typeof message === 'string' ? message : '用户角色分配成功')
    dialogVisible.value = false
    await loadData()
  } catch (error) {
    console.error(error)
    ElMessage.error('用户角色分配失败')
  }
}

defineExpose({ loadData })
</script>

<template>
  <div v-loading="loading" style="height: 100%; overflow: auto; padding-right: 4px;">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span>用户角色分配</span>
          <el-input
            v-model="searchText"
            placeholder="搜索用户名 / 角色名"
            clearable
            style="width: 240px;"
          />
        </div>
      </template>
      <el-table :data="filteredUsers" stripe border height="100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="用户名" min-width="140" />
        <el-table-column label="当前角色" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-for="name in formatRoleNames(row)" :key="name" class="mr-1 mb-1">{{ name }}</el-tag>
            <span v-if="!formatRoleNames(row).length">未分配</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openDialog(row)">分配角色</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="`分配角色 - ${currentUser?.username || ''}`" width="560px" class="touch-draggable-dialog">
      <el-checkbox-group v-model="selectedRoleIds" class="grid grid-cols-2 gap-2">
        <el-checkbox v-for="item in roles" :key="item.id" :value="item.id">
          {{ item.roleName }}（{{ item.roleCode }}）
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveUserRoles">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
