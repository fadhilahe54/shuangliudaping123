<!--
  车组状态管理组件
  功能：管理车组运维状态（如临修、整修、高级修等）的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllTrainStatus, saveTrainStatus, deleteTrainStatusById } from '../../api/dispatchApi.js' // 车组状态接口
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])             // 状态列表
const loading = ref(false)       // 加载状态
const dialogVisible = ref(false) // 对话框显示状态
const form = ref({ id: null, '状态名称': '', '备注': '' }) // 状态表单
const page = ref(1)              // 当前页码
const pageSize = ref(15)         // 每页条数
const tableKey = ref(0)          // 表格刷新 key

/** 前端分页计算 */
const pagedList = computed(() => list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

/** 加载全部车组状态数据 */
const loadData = async () => {
  loading.value = true
  try {
    const data = await getAllTrainStatus()
    list.value = Array.isArray(data) ? [...data] : (data ? [data] : [])
    tableKey.value++
  } catch (e) { console.error(e) }
  loading.value = false
}

/** 打开新增/编辑对话框 */
const openDialog = (row = null) => {
  form.value = row ? { ...row } : { id: null, '状态名称': '', '备注': '' }
  dialogVisible.value = true
}

/** 保存状态信息，校验状态名称不能为空，移除关联车组字段 */
const saveData = async () => {
  if (!form.value['状态名称']?.trim()) { ElMessage.warning('请输入状态名称'); return }
  try {
    const payload = { ...form.value }
    const isEdit = !!payload.id
    if (!payload.id) delete payload.id
    delete payload['车组信息List']
    await saveTrainStatus(payload)
    logOperation(isEdit ? '修改车组状态' : '新增车组状态', `${isEdit ? '修改' : '新增'}:${payload['状态名称']}状态`)
    await loadData()
    ElMessage.success('保存成功')
    dialogVisible.value = false
  } catch (e) { ElMessage.error('保存失败') }
}

/** 删除状态，带确认 */
const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除？', '提示') } catch { return }
  try {
    const status = list.value.find(item => item.id === id)
    await deleteTrainStatusById(id)
    logOperation('删除车组状态', `删除:${status?.['状态名称'] || id}状态`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/** 暴露 loadData 供父组件调用 */
defineExpose({ loadData })
</script>

<template>
  <!-- 车组状态管理页面 - 修改人：王天智 -->
  <div>
    <!-- 新增按钮 -->
    <div class="mb-4">
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增
      </el-button>
    </div>
    <!-- 状态数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="状态名称" label="状态名称" />
      <el-table-column prop="备注" label="备注" show-overflow-tooltip />
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

    <!-- 新增/编辑状态对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑车组状态' : '新增车组状态'" width="400px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="100px">
        <el-form-item label="状态名称"><el-input v-model="form['状态名称']" placeholder="如：临修、整修、高级修、异地停放、调向、试运行等" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form['备注']" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
