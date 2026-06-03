<!--
  车辆信息管理组件
  功能：管理车辆的车组号、编组、车型等信息的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, RefreshLeft, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { queryTrains, saveTrain, deleteTrainById } from '../../api/dispatchApi.js'
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])             // 当前页车辆列表
const total = ref(0)             // 后端总记录数
const loading = ref(false)       // 加载状态
const dialogVisible = ref(false) // 对话框显示状态
const form = ref({ id: null, '车号': '', '车型': '', '车种': '', '状态': '', '走行公里': 0, 'A1D1修日期': null, 'A2D2修日期': null, 'A3D3修日期': null, 'A4D4修日期': null })
const page = ref(1)              // 当前页码（1-based，后端 0-based）
const pageSize = ref(15)         // 每页条数
const tableKey = ref(0)          // 表格刷新 key

/** 后端查询条件（对应 车辆信息查询条件DTO） */
const searchForm = reactive({
  车号: '',
  车型: '',
  车种: '',
  状态: '',
  走行公里Min: null,
  走行公里Max: null,
  A1D1修日期区间: [],  // [开始, 结束] yyyy-MM-dd
  A2D2修日期区间: [],
  A3D3修日期区间: [],
  A4D4修日期区间: [],
})

/** 高级筛选展开状态 */
const advancedVisible = ref(false)

/** 构造提交后端的查询条件（仅保留非空值，避免后端受到空字符串干扰） */
function buildCondition() {
  const cond = {}
  // 文本字段
  if (searchForm.车号.trim()) cond.车号 = searchForm.车号.trim()
  if (searchForm.车型.trim()) cond.车型 = searchForm.车型.trim()
  if (searchForm.车种.trim()) cond.车种 = searchForm.车种.trim()
  if (searchForm.状态.trim()) cond.状态 = searchForm.状态.trim()
  // 走行公里区间
  if (searchForm.走行公里Min !== null && searchForm.走行公里Min !== undefined && searchForm.走行公里Min !== '') {
    cond.走行公里Min = Number(searchForm.走行公里Min)
  }
  if (searchForm.走行公里Max !== null && searchForm.走行公里Max !== undefined && searchForm.走行公里Max !== '') {
    cond.走行公里Max = Number(searchForm.走行公里Max)
  }
  // 修程日期区间：el-date-picker type=daterange 返回 [start, end]
  const appendRange = (rangeVal, startKey, endKey) => {
    if (Array.isArray(rangeVal) && rangeVal.length === 2) {
      if (rangeVal[0]) cond[startKey] = rangeVal[0]
      if (rangeVal[1]) cond[endKey] = rangeVal[1]
    }
  }
  appendRange(searchForm.A1D1修日期区间, 'A1D1修日期开始', 'A1D1修日期结束')
  appendRange(searchForm.A2D2修日期区间, 'A2D2修日期开始', 'A2D2修日期结束')
  appendRange(searchForm.A3D3修日期区间, 'A3D3修日期开始', 'A3D3修日期结束')
  appendRange(searchForm.A4D4修日期区间, 'A4D4修日期开始', 'A4D4修日期结束')
  return cond
}

/** 调用后端分页+多条件查询 */
const loadData = async () => {
  loading.value = true
  try {
    const res = await queryTrains(buildCondition(), page.value - 1, pageSize.value)
    // Spring Data Page 结构：{ content, totalElements, number, size, ... }
    list.value = Array.isArray(res?.content) ? res.content : []
    total.value = typeof res?.totalElements === 'number' ? res.totalElements : list.value.length
    tableKey.value++
  } catch (e) {
    console.error(e)
    ElMessage.error('查询失败')
  }
  loading.value = false
}

/** 点击查询：重置到第一页并请求 */
const handleSearch = () => {
  page.value = 1
  loadData()
}

/** 点击重置：清空条件并重新查询 */
const handleReset = () => {
  searchForm.车号 = ''
  searchForm.车型 = ''
  searchForm.车种 = ''
  searchForm.状态 = ''
  searchForm.走行公里Min = null
  searchForm.走行公里Max = null
  searchForm.A1D1修日期区间 = []
  searchForm.A2D2修日期区间 = []
  searchForm.A3D3修日期区间 = []
  searchForm.A4D4修日期区间 = []
  page.value = 1
  loadData()
}

/** 分页或每页条数变化时重新请求 */
const handlePageChange = (newPage) => {
  page.value = newPage
  loadData()
}
const handleSizeChange = (newSize) => {
  pageSize.value = newSize
  page.value = 1
  loadData()
}

/** 打开新增/编辑对话框 */
const openDialog = (row = null) => {
  form.value = row ? { ...row } : { id: null, '车号': '', '车型': '', '车种': '', '状态': '', '走行公里': 0, 'A1D1修日期': null, 'A2D2修日期': null, 'A3D3修日期': null, 'A4D4修日期': null }
  dialogVisible.value = true
}

/** 保存车辆信息 */
const saveData = async () => {
  if (!form.value['车号']?.trim()) { ElMessage.warning('请输入车号'); return }
  try {
    const payload = { ...form.value }
    const isEdit = !!payload.id
    if (!payload.id) delete payload.id
    await saveTrain(payload)
    logOperation(isEdit ? '修改车辆信息' : '新增车辆信息', `${isEdit ? '修改' : '新增'}:${payload['车号']}车辆`)
    await loadData()
    ElMessage.success('保存成功')
    dialogVisible.value = false
  } catch (e) { ElMessage.error('保存失败') }
}

/** 删除车辆，带确认 */
const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除？', '提示') } catch { return }
  try {
    const train = list.value.find(item => item.id === id)
    await deleteTrainById(id)
    logOperation('删除车辆信息', `删除:${train?.['车号'] || id}车辆`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/** 获取车辆列表供外部使用（当前页数据） */
const getList = () => list.value

/** 暴露方法供父组件调用 */
defineExpose({ loadData, getList })
</script>

<template>
  <!-- 车辆信息管理页面 - 修改人：王天智 -->
  <div>
    <!-- 操作栏：多条件查询 + 新增（统一暂色卡片风格） -->
    <div class="toolbar flex items-center flex-wrap gap-2">
      <el-input
        v-model="searchForm.车号"
        placeholder="车号"
        clearable
        style="width: 180px"
        @keyup.enter="handleSearch"
      />
      <el-input
        v-model="searchForm.车型"
        placeholder="车型"
        clearable
        style="width: 160px"
        @keyup.enter="handleSearch"
      />
      <el-input
        v-model="searchForm.车种"
        placeholder="车种"
        clearable
        style="width: 160px"
        @keyup.enter="handleSearch"
      />
      <el-input
        v-model="searchForm.状态"
        placeholder="状态"
        clearable
        style="width: 140px"
        @keyup.enter="handleSearch"
      />
      <el-button type="primary" @click="handleSearch">
        <el-icon class="mr-1"><Search /></el-icon>查询
      </el-button>
      <el-button @click="handleReset">
        <el-icon class="mr-1"><RefreshLeft /></el-icon>重置
      </el-button>
      <el-button :icon="advancedVisible ? ArrowUp : ArrowDown" @click="advancedVisible = !advancedVisible">
        {{ advancedVisible ? '收起' : '高级筛选' }}
      </el-button>
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增
      </el-button>
    </div>

    <!-- 高级筛选：走行公里区间 + 修程日期区间 -->
    <el-collapse-transition>
      <div v-show="advancedVisible" class="advanced-panel mb-4">
        <div class="flex items-center flex-wrap gap-3">
          <div class="flex items-center gap-1">
            <span class="text-sm text-gray-600 whitespace-nowrap">走行公里：</span>
            <el-input-number
              v-model="searchForm.走行公里Min"
              :min="0"
              placeholder="最小"
              controls-position="right"
              style="width: 140px"
            />
            <span class="text-gray-400">~</span>
            <el-input-number
              v-model="searchForm.走行公里Max"
              :min="0"
              placeholder="最大"
              controls-position="right"
              style="width: 140px"
            />
          </div>
        </div>
        <div class="flex items-center flex-wrap gap-3 mt-3">
          <div class="flex items-center gap-1">
            <span class="text-sm text-gray-600 whitespace-nowrap">A1D1修日期：</span>
            <el-date-picker
              v-model="searchForm.A1D1修日期区间"
              type="daterange"
              range-separator="~"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              style="width: 260px"
            />
          </div>
          <div class="flex items-center gap-1">
            <span class="text-sm text-gray-600 whitespace-nowrap">A2D2修日期：</span>
            <el-date-picker
              v-model="searchForm.A2D2修日期区间"
              type="daterange"
              range-separator="~"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              style="width: 260px"
            />
          </div>
          <div class="flex items-center gap-1">
            <span class="text-sm text-gray-600 whitespace-nowrap">A3D3修日期：</span>
            <el-date-picker
              v-model="searchForm.A3D3修日期区间"
              type="daterange"
              range-separator="~"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              style="width: 260px"
            />
          </div>
          <div class="flex items-center gap-1">
            <span class="text-sm text-gray-600 whitespace-nowrap">A4D4修日期：</span>
            <el-date-picker
              v-model="searchForm.A4D4修日期区间"
              type="daterange"
              range-separator="~"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              style="width: 260px"
            />
          </div>
        </div>
      </div>
    </el-collapse-transition>
    <!-- 车辆数据表格 -->
    <el-table :key="tableKey" :data="list" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="车号" label="车号" width="120" />
      <el-table-column prop="车型" label="车型" width="100" />
      <el-table-column prop="车种" label="车种" width="100" />
      <el-table-column prop="状态" label="状态" width="100" />
      <el-table-column prop="走行公里" label="走行公里" width="100" />
      <el-table-column prop="A1D1修日期" label="A1D1修日期" width="120" />
      <el-table-column prop="A2D2修日期" label="A2D2修日期" width="120" />
      <el-table-column prop="A3D3修日期" label="A3D3修日期" width="120" />
      <el-table-column prop="A4D4修日期" label="A4D4修日期" width="120" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteItem(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页（总数由后端返回） -->
    <el-pagination class="mt-3 justify-end" background layout="total, prev, pager, next, sizes"
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10,15,30,50]"
      @current-change="handlePageChange"
      @size-change="handleSizeChange" />

    <!-- 新增/编辑车辆对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑车辆信息' : '新增车辆信息'" width="560px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="110px">
        <el-form-item label="车号"><el-input v-model="form['车号']" placeholder="请输入车号" /></el-form-item>
        <el-form-item label="车型"><el-input v-model="form['车型']" placeholder="请输入车型" /></el-form-item>
        <el-form-item label="车种"><el-input v-model="form['车种']" placeholder="请输入车种" /></el-form-item>
        <el-form-item label="状态"><el-input v-model="form['状态']" placeholder="请输入状态" /></el-form-item>
        <el-form-item label="走行公里"><el-input-number v-model="form['走行公里']" :min="0" /></el-form-item>
        <el-form-item label="A1D1修日期"><el-date-picker v-model="form['A1D1修日期']" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
        <el-form-item label="A2D2修日期"><el-date-picker v-model="form['A2D2修日期']" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
        <el-form-item label="A3D3修日期"><el-date-picker v-model="form['A3D3修日期']" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
        <el-form-item label="A4D4修日期"><el-date-picker v-model="form['A4D4修日期']" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 操作栏：暂色渐变卡片背景，和其他管理页统一 */
.toolbar {
  margin-bottom: 14px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #fdf9e9 0%, #fef9f0 100%);
  border: 1px solid #f1e5c4;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(146, 64, 14, 0.04);
}
.toolbar :deep(.el-input__wrapper),
.toolbar :deep(.el-input-number .el-input__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #f1e5c4;
  transition: box-shadow 0.2s;
}
.toolbar :deep(.el-input__wrapper:hover),
.toolbar :deep(.el-input-number .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #fbbf24;
}
.toolbar :deep(.el-input__wrapper.is-focus),
.toolbar :deep(.el-input-number .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #d97706;
}

/* 高级筛选面板：浅色卡片与 toolbar 呼应 */
.advanced-panel {
  padding: 12px 14px;
  background: #fdf6e9;
  border: 1px dashed #e8dcc8;
  border-radius: 8px;
}
.advanced-panel :deep(.el-input__wrapper),
.advanced-panel :deep(.el-input-number .el-input__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #e8dcc8;
  transition: box-shadow 0.2s;
}
.advanced-panel :deep(.el-input__wrapper:hover),
.advanced-panel :deep(.el-input-number .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #fbbf24;
}
.advanced-panel :deep(.el-input__wrapper.is-focus),
.advanced-panel :deep(.el-input-number .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #d97706;
}
.advanced-panel .text-gray-600 {
  color: #92400e !important;
  font-weight: 600;
}
.advanced-panel .text-gray-400 {
  color: #a16207 !important;
}
</style>
