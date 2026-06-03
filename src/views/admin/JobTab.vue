<!--
  值班岗位管理组件
  功能：管理值班岗位名称、备注等信息的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed } from 'vue'                    // Vue 响应式 API
import { ElMessage, ElMessageBox } from 'element-plus' // 消息提示与确认框
import { getAllJobs, saveJob, deleteJobById } from '../../api/dispatchApi.js' // 岗位相关接口
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
// 岗位列表
const list = ref([])

// 表格加载状态
const loading = ref(false)

// 新增/编辑对话框显示状态
const dialogVisible = ref(false)

// 岗位表单数据（id、岗位名、备注）
const form = ref({ id: null, '值班岗位': '', '备注': '' })

// 当前分页页码
const page = ref(1)

// 每页显示条数
const pageSize = ref(15)

// 表格刷新 key
const tableKey = ref(0)

/**
 * 计算前端分页后的岗位列表
 * 
 * @returns {Array<Object>} 当前页的岗位列表
 */
const pagedList = computed(() => 
  list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
)

/**
 * 加载全部岗位数据
 * 从后台接口获取岗位列表
 * 
 * @async
 * @returns {Promise<void>}
 */
const loadData = async () => {
  // 设置加载状态
  loading.value = true
  try {
    // 调用接口获取岗位列表
    const data = await getAllJobs()
    
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
 * 
 * @param {Object|null} row - 编辑的行数据，null 表示新增
 * @returns {void}
 */
const openDialog = (row = null) => {
  // 初始化表单数据
  form.value = row 
    ? { ...row } 
    : { id: null, '值班岗位': '', '备注': '' }
  
  // 显示对话框
  dialogVisible.value = true
}

/**
 * 保存岗位信息
 * 校验岗位名称不能为空，并移除多余的关联人员字段
 * 
 * @async
 * @returns {Promise<void>}
 */
const saveData = async () => {
  // 校验岗位名称不能为空
  if (!form.value['值班岗位']?.trim()) { 
    ElMessage.warning('请输入岗位名称')
    return 
  }
  
  try {
    // 复制表单数据
    const payload = { ...form.value }
    
    // 判断是编辑还是新增
    const isEdit = !!payload.id
    
    // 新增时移除 id 字段
    if (!payload.id) delete payload.id
    
    // 移除多余的关联人员字段（后端不需要）
    delete payload['值班人员list']
    
    // 调用保存接口
    await saveJob(payload)
    
    // 记录操作日志
    logOperation(
      isEdit ? '修改值班岗位' : '新增值班岗位', 
      `${isEdit ? '修改' : '新增'}:${payload['值班岗位']}值班岗位`
    )
    
    // 刷新列表
    await loadData()
    
    // 显示成功提示
    ElMessage.success('保存成功')
    
    // 关闭对话框
    dialogVisible.value = false
  } catch (e) { 
    ElMessage.error('保存失败') 
  }
}

/**
 * 删除岗位
 * 带确认提示
 * 
 * @async
 * @param {number} id - 岗位 ID
 * @returns {Promise<void>}
 */
const deleteItem = async (id) => {
  // 显示确认对话框
  try { 
    await ElMessageBox.confirm('确定删除？', '提示') 
  } catch { 
    return 
  }
  try {
    const job = list.value.find(item => item.id === id)
    await deleteJobById(id)
    logOperation('删除值班岗位', `删除:${job?.['值班岗位'] || id}值班岗位`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/** 暴露 loadData 供父组件调用 */
defineExpose({ loadData })
</script>

<template>
  <!-- 值班岗位管理页面 - 修改人：王天智 -->
  <div>
    <!-- 新增按钮 -->
    <div class="mb-4">
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增
      </el-button>
    </div>
    <!-- 岗位数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="值班岗位" label="岗位名称" />
      <el-table-column prop="备注" label="备注" />
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
      :total="list.length" v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,15,30,50]" />

    <!-- 新增/编辑岗位对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑值班岗位' : '新增值班岗位'" width="400px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="80px">
        <el-form-item label="岗位名称">
          <el-input v-model="form['值班岗位']" placeholder="请输入岗位名称" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form['备注']" /></el-form-item>
      </el-form>
      <!-- 对话框底部按钮 -->
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
