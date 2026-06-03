<!--
  交路信息管理组件
  功能：管理交路名称的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllTrainGroup, saveTrainGroup, deleteTrainGroupById } from '../../api/dispatchApi.js' // 交路信息接口
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])             // 交路列表
const loading = ref(false)       // 加载状态
const dialogVisible = ref(false) // 对话框显示状态
const form = ref({ id: null, '交路名称': '' }) // 交路表单
const page = ref(1)              // 当前页码
const pageSize = ref(15)         // 每页条数
const tableKey = ref(0)          // 表格刷新 key

/** 前端分页计算 */
const pagedList = computed(() => list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

/** 加载全部交路信息 */
const loadData = async () => {
  loading.value = true
  try {
    const data = await getAllTrainGroup()
    list.value = Array.isArray(data) ? [...data] : (data ? [data] : [])
    tableKey.value++
  } catch (e) { console.error(e) }
  loading.value = false
}

/** 打开新增/编辑对话框 */
const openDialog = (row = null) => {
  form.value = row ? { ...row } : { id: null, '交路名称': '' }
  dialogVisible.value = true
}

/** 保存交路信息 */
const saveData = async () => {
  try {
    const payload = { ...form.value }
    const isEdit = !!payload.id
    if (!payload.id) delete payload.id
    await saveTrainGroup(payload)
    logOperation(isEdit ? '修改交路信息' : '新增交路信息', `${isEdit ? '修改' : '新增'}交路:${payload['交路名称']}`)
    await loadData()
    ElMessage.success('保存成功')
    dialogVisible.value = false
  } catch (e) { ElMessage.error('保存失败') }
}

/** 删除交路信息，带确认 */
const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除？', '提示') } catch { return }
  try {
    const route = list.value.find(item => item.id === id)
    await deleteTrainGroupById(id)
    logOperation('删除交路信息', `删除交路:${route?.['交路名称'] || id}`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/** 暴露 loadData 供父组件调用 */
defineExpose({ loadData })
</script>

<template>
  <!-- 交路信息管理页面 - 修改人：王天智 -->
  <div>
    <!-- 新增按钮 -->
    <div class="mb-4">
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增
      </el-button>
    </div>
    <!-- 交路数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="交路名称" label="交路名称" />
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

    <!-- 新增/编辑交路对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑交路信息' : '新增交路信息'" width="400px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="80px">
        <el-form-item label="交路名称"><el-input v-model="form['交路名称']" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
