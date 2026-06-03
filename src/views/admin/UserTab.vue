<!--
  用户管理组件
  功能：管理后台登录用户的用户名、密码的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {getAllUsers, saveUser, deleteUserById, updateUserStatus, updateUser} from '../../api/dispatchApi.js' // 用户管理接口
import { myLog, getCurrentLogUser } from '../../api/log.js'

/* ========== 响应式数据 ========== */
// 用户列表数据
const list = ref([])

// 表格加载状态
const loading = ref(false)

// 新增用户对话框显示状态
const dialogVisible = ref(false)

// 编辑用户对话框显示状态
const updatedialogVisible = ref(false)

// 用户表单数据（id、用户名、密码）
const form = ref({ id: null, username: '', password: '' })

// 当前分页页码
const page = ref(1)

// 每页显示条数
const pageSize = ref(15)

// 表格刷新 key，用于强制刷新表格
const tableKey = ref(0)

// 用户名搜索关键字
const searchText = ref('')

// 表单 ref，用于表单验证
const formRef = ref(null)

/**
 * 密码强度校验器
 * 新增和编辑时均必填，需满足长度和字符要求
 * 
 * @param {Object} _rule - 验证规则对象（未使用）
 * @param {string} value - 密码值
 * @param {Function} callback - 验证回调函数
 * @returns {void}
 */
const validatePassword = (_rule, value, callback) => {
  // 检查密码是否为空
  if (!value) return callback(new Error('请输入密码'))
  
  // 检查密码长度最小值
  if (value.length < 6) return callback(new Error('密码长度不能少于6位'))
  
  // 检查密码长度最大值
  if (value.length > 20) return callback(new Error('密码长度不能超过20位'))
  
  // 检查密码是否包含空格
  if (/\s/.test(value)) return callback(new Error('密码不能包含空格'))
  
  // 验证通过
  callback()
}

/**
 * 表单验证规则
 * 定义用户名和密码的验证规则
 */
const formRules = {
  // 用户名验证规则
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度为2-20个字符', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, message: '用户名只能包含中文、字母、数字和下划线', trigger: 'blur' },
  ],
  // 密码验证规则
  password: [
    { validator: validatePassword, trigger: 'blur' },
  ],
}

/**
 * 计算按搜索关键字过滤后的用户列表
 * 按 username 模糊匹配，忽略大小写
 * 
 * @returns {Array<Object>} 过滤后的用户列表
 */
const filteredList = computed(() => {
  // 获取搜索关键字，去除空格并转小写
  const keyword = (searchText.value || '').trim().toLowerCase()
  
  // 若无关键字，返回全部列表
  if (!keyword) return list.value
  
  // 按用户名模糊匹配过滤
  return list.value.filter(u => (u.username || '').toLowerCase().includes(keyword))
})

/**
 * 计算前端分页后的用户列表
 * 基于过滤后的列表进行分页
 * 
 * @returns {Array<Object>} 当前页的用户列表
 */
const pagedList = computed(() => 
  filteredList.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
)

/**
 * 搜索关键字变化时重置分页
 * 避免搜索后分页越界
 * 
 * @returns {void}
 */
const onSearchChange = () => { 
  page.value = 1 
}

/**
 * 加载全部用户数据
 * 从后台接口获取用户列表，更新表格
 * 
 * @async
 * @returns {Promise<void>}
 */
const loadData = async () => {
  // 设置加载状态
  loading.value = true
  try {
    // 调用接口获取用户列表
    const data = await getAllUsers()
    
    // 处理数据格式，确保为数组
    list.value = Array.isArray(data) ? [...data] : (data ? [data] : [])
    
    // 刷新表格
    tableKey.value++
  } catch (e) { 
    console.error(e) 
  }
  // 清除加载状态
  loading.value = false
}

/**
 * 打开新增/编辑对话框
 * 编辑时清空密码字段，避免回显
 * 
 * @param {Object|null} row - 编辑的行数据，null 表示新增
 * @returns {void}
 */
const openDialog = (row = null) => {
  // 初始化表单数据
  form.value = row ? { ...row, password: '' } : { id: null, username: '', password: '' }
  
  // 根据是否有 row 打开对应对话框
  if (row) {
    // 编辑模式
    updatedialogVisible.value = true
  } else {
    // 新增模式
    dialogVisible.value = true
  }
  
  // 打开弹窗后清除上一次的校验状态
  nextTick(() => formRef.value?.clearValidate())
}

/**
 * 保存新增用户信息
 * 通过表单校验后再提交到后台
 * 
 * @async
 * @returns {Promise<void>}
 */
const saveData = async () => {
  // 执行表单验证
  try {
    await formRef.value.validate()
  } catch { 
    return 
  }
  
  // 提交数据
  try {
    // 复制表单数据
    const payload = { ...form.value }
    
    // 移除 id 字段（新增时不需要）
    if (!payload.id) delete payload.id
    
    // 调用新增接口
    await saveUser(payload)
    
    // 记录操作日志
    myLog('系统日志', getCurrentLogUser(), '新增用户', `新增:${payload.username}用户`)
    
    // 刷新列表
    await loadData()
    
    // 显示成功提示
    ElMessage.success('添加成功')
    
    // 关闭对话框
    dialogVisible.value = false
  } catch (e) { 
    ElMessage.error('添加失败') 
  }
}

/**
 * 修改用户信息
 * 通过表单校验后再提交到后台
 * 
 * @async
 * @returns {Promise<void>}
 */
const updateData = async () => {
  try {
    await formRef.value.validate()
  } catch { return }
  try {
    const payload = { ...form.value }
    if (!payload.id) delete payload.id
    await updateUser(form.value)
    myLog('系统日志', getCurrentLogUser(), '修改用户', `修改:${form.value.username}用户`)
    await loadData()
    ElMessage.success('修改成功')
    updatedialogVisible.value = false
  } catch (e) { ElMessage.error('修改失败') }
}

/** 删除用户，带确认 */
const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除该用户？', '提示') } catch { return }
  try {
    await deleteUserById(id)
    const user = list.value.find(item => item.id === id)
    myLog('系统日志', getCurrentLogUser(), '删除用户', `删除:${user?.username || id}用户`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/**
 * 切换用户启用/禁用状态
 * 注意：el-switch 的 v-model 是双向绑定，这里已经拿到切换后的新值；
 * 若后端更新失败，需要回滚本地状态，避免界面与数据库不一致
 */
const toggleUserStatus = async (row) => {
  const targetEnabled = row.enabled
  try {
    await updateUserStatus(row.id, targetEnabled)
    myLog('系统日志', getCurrentLogUser(), '用户启停用', `${targetEnabled ? '启用' : '停用'}:${row.username}用户`)
    ElMessage.success(targetEnabled ? '已启用' : '已禁用')
  } catch (e) {
    console.error(e)
    // 接口失败回滚 UI 状态
    row.enabled = !targetEnabled
    ElMessage.error('状态修改失败')
  }
}

/** 暴露 loadData 供父组件调用 */
defineExpose({ loadData })
</script>

<template>
  <!-- 用户管理页面 - 修改人：王天智 -->
  <div>
    <!-- 顶部操作栏：新增用户 + 搜索 -->
    <div class="mb-4 flex items-center justify-between">
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增用户
      </el-button>
      <el-input
        v-model="searchText"
        placeholder="搜索用户名"
        clearable
        style="width: 240px;"
        @input="onSearchChange"
        @clear="onSearchChange"
      />
    </div>
    <!-- 用户数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="username" label="用户名" />
      <!-- 启用/禁用列：通过 el-switch 直接切换账号状态 -->
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-switch
            v-model="row.enabled"
            active-text="启用"
            inactive-text="禁用"
            inline-prompt
            @change="toggleUserStatus(row)"
          />
        </template>
      </el-table-column>
      <!-- 操作列 -->
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteItem(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <el-pagination class="mt-3 justify-end" background layout="total, prev, pager, next, sizes"
      :total="filteredList.length" v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,15,30,50]" />

    <!-- 新增/编辑用户对话框 -->
    <el-dialog v-model="dialogVisible" :title="'新增用户'" width="400px" class="touch-draggable-dialog">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" maxlength="20" show-word-limit />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password
            placeholder="请输入密码（6-20位）" maxlength="20" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
    <!-- 编辑用户对话框 -->
    <el-dialog v-model="updatedialogVisible" :title="'编辑用户'" width="400px" class="touch-draggable-dialog">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" maxlength="20" show-word-limit />
        </el-form-item>
        <el-form-item label="新密码" prop="password">
          <el-input v-model="form.password" type="password" show-password
            placeholder="请输入新密码（6-20位，不能包含空格）" maxlength="20" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="updatedialogVisible = false">取消</el-button>
        <el-button type="primary" @click="updateData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
