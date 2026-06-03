<!--
  股道信息管理组件
  功能：管理股道名称、股道长度、股道偏移量等信息的增删改查
  说明：一列位/二列位由数据库触发器自动生成，无需手动控制
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllStockRoad, saveStockRoad, deleteStockRoadById } from '../../api/dispatchApi.js' // 股道信息接口
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])             // 股道列表
const loading = ref(false)       // 加载状态
const dialogVisible = ref(false) // 对话框显示状态
const form = ref({ id: null, '股道名称': '', '股道长度': null, '股道偏移量': null }) // 股道表单
const page = ref(1)              // 当前页码
const pageSize = ref(15)         // 每页条数
const tableKey = ref(0)          // 表格刷新 key

/**
 * 前端分页计算
 * 根据当前页码和每页条数，从完整列表中截取对应页的数据
 * @returns {Array} 当前页的股道列表
 */
const pagedList = computed(() => list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

/**
 * 加载全部股道数据
 * 从后端获取股道列表，更新本地状态，刷新表格显示
 * @async
 * @returns {Promise<void>}
 */
const loadData = async () => {
  loading.value = true
  try {
    const data = await getAllStockRoad()
    list.value = Array.isArray(data) ? [...data] : (data ? [data] : [])
    tableKey.value++
  } catch (e) { console.error(e) }
  loading.value = false
}

/**
 * 打开新增/编辑股道对话框
 * 若传入 row 则为编辑模式（回显数据），否则为新增模式（空表单）
 * @param {Object|null} row - 股道行数据，为 null 时为新增模式
 * @returns {void}
 */
const openDialog = (row = null) => {
  form.value = row
    ? { id: row.id, '股道名称': row['股道名称'], '股道长度': row['股道长度'], '股道偏移量': row['股道偏移量'], '一列位': row['一列位'], '二列位': row['二列位'], '重联状态': row['重联状态'] }
    : { id: null, '股道名称': '', '股道长度': null, '股道偏移量': null }
  dialogVisible.value = true
}

/**
 * 保存股道信息
 * 校验股道名称不能为空，新增时由数据库触发器自动生成一列位/二列位
 * @async
 * @returns {Promise<void>}
 */
const saveData = async () => {
  if (!form.value['股道名称']?.trim()) { ElMessage.warning('请输入股道名称'); return }
  try {
    const payload = { ...form.value }
    const isEdit = !!payload.id
    if (!payload.id) {
      // 新增时不传一列位/二列位，由数据库触发器自动生成
      delete payload.id
      delete payload['一列位']
      delete payload['二列位']
    }
    await saveStockRoad(payload)
    logOperation(isEdit ? '修改股道信息' : '新增股道信息', `${isEdit ? '修改' : '新增'}:${payload['股道名称']}股道`)
    await loadData()
    ElMessage.success('保存成功')
    dialogVisible.value = false
  } catch (e) { ElMessage.error('保存失败') }
}

/**
 * 删除股道信息
 * 先弹出确认框，用户确认后执行删除，并记录操作日志
 * @async
 * @param {number|string} id - 股道 ID
 * @returns {Promise<void>}
 */
const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除？', '提示') } catch { return }
  try {
    const stockRoad = list.value.find(item => item.id === id)
    await deleteStockRoadById(id)
    logOperation('删除股道信息', `删除:${stockRoad?.['股道名称'] || id}股道`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/**
 * 暴露 loadData 方法供父组件调用
 * 允许父组件主动刷新股道列表数据
 */
defineExpose({ loadData })
</script>

<template>
  <!-- 股道信息管理页面 - 修改人：王天智 -->
  <div>
    <!-- 新增按钮 -->
    <div class="mb-4">
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增
      </el-button>
    </div>
    <!-- 股道数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="股道名称" label="股道名称" width="120" />
      <el-table-column prop="股道长度" label="股道长度" width="120">
        <template #default="{ row }">
          <span>{{ row['股道长度'] != null ? row['股道长度'] : '未设置' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="股道偏移量" label="股道偏移量(起始位置)" width="160">
        <template #default="{ row }">
          <span>{{ row['股道偏移量'] != null ? row['股道偏移量'] : '未设置' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="一列位" label="一列位ID" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row['一列位'] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="二列位" label="二列位ID" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row['二列位'] }}</el-tag>
        </template>
      </el-table-column>
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

    <!-- 新增/编辑股道对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑股道信息' : '新增股道信息'" width="500px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="150px">
        <el-form-item label="股道名称">
          <el-input v-model="form['股道名称']" placeholder="请输入股道名称" />
        </el-form-item>
        <el-form-item label="股道长度">
          <el-input-number v-model="form['股道长度']" :min="0" placeholder="轨道总长度" />
        </el-form-item>
        <el-form-item label="股道偏移量(起始位置)">
          <el-input-number v-model="form['股道偏移量']" placeholder="股道起始偏移" />
        </el-form-item>
        <el-alert v-if="!form.id" type="info" :closable="false" show-icon
          title="一列位/二列位ID由系统自动生成，无需手动填写" class="mb-2" />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

