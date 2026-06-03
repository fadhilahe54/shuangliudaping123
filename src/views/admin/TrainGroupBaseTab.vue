<!--
  车组基础信息管理组件
  功能：管理车组号、编组数、车型等基础信息的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllTrainGroupBase, saveTrainGroupBase, deleteTrainGroupBaseById } from '../../api/dispatchApi.js' // 车组基础信息接口
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])             // 车组列表
const loading = ref(false)       // 加载状态
const dialogVisible = ref(false) // 对话框显示状态
const form = ref({ id: null, '车组号': '', '编组': 0, '车型': '' }) // 车组表单
const page = ref(1)              // 当前页码
const pageSize = ref(15)         // 每页条数
const tableKey = ref(0)          // 表格刷新 key
const searchKeyword = ref('')    // 搜索关键字（车组号/车型）

/** 模糊过滤后的列表（车组号 / 车型） */
const filteredList = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return list.value
  return list.value.filter(item =>
    String(item['车组号'] || '').toLowerCase().includes(kw) ||
    String(item['车型'] || '').toLowerCase().includes(kw)
  )
})

/** 前端分页计算（基于过滤后列表） */
const pagedList = computed(() => filteredList.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

/** 搜索时重置到第1页 */
const handleSearch = () => { page.value = 1 }

/** 加载全部车组基础数据 */
const loadData = async () => {
  loading.value = true
  try {
    const data = await getAllTrainGroupBase()
    list.value = Array.isArray(data) ? [...data] : (data ? [data] : [])
    tableKey.value++
  } catch (e) { console.error(e) }
  loading.value = false
}

/** 打开新增/编辑对话框 */
const openDialog = (row = null) => {
  form.value = row ? { ...row } : { id: null, '车组号': '', '编组': 0, '车型': '' }
  dialogVisible.value = true
}

/** 保存车组信息，校验车组号不能为空，移除关联车辆字段 */
const saveData = async () => {
  if (!form.value['车组号']?.trim()) { ElMessage.warning('请输入车组号'); return }
  try {
    const payload = { ...form.value }
    const isEdit = !!payload.id
    if (!payload.id) delete payload.id
    delete payload['车辆信息List']
    await saveTrainGroupBase(payload)
    logOperation(isEdit ? '修改车组基础信息' : '新增车组基础信息', `${isEdit ? '修改' : '新增'}:${payload['车组号']}车组`)
    await loadData()
    ElMessage.success('保存成功')
    dialogVisible.value = false
  } catch (e) { ElMessage.error('保存失败') }
}

/** 删除车组，带确认 */
const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除？', '提示') } catch { return }
  try {
    const group = list.value.find(item => item.id === id)
    await deleteTrainGroupBaseById(id)
    logOperation('删除车组基础信息', `删除:${group?.['车组号'] || id}车组`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/** 获取车组列表供外部使用（如状态分配组件） */
const getList = () => list.value

/** 暴露方法供父组件调用 */
defineExpose({ loadData, getList })
</script>

<template>
  <!-- 车组基础信息管理页面 - 修改人：王天智 -->
  <div>
    <!-- 操作栏：搜索（左） + 统计/新增（右） -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索车组号 / 车型"
          clearable
          class="search-input"
          @input="handleSearch"
          @clear="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <span v-if="searchKeyword" class="match-hint">
          命中 <b>{{ filteredList.length }}</b> / {{ list.length }} 条
        </span>
      </div>
      <div class="toolbar-right">
        <span class="total-hint">共 {{ list.length }} 条</span>
        <el-button type="primary" @click="openDialog()">
          <el-icon class="mr-1"><Plus /></el-icon>新增
        </el-button>
      </div>
    </div>
    <!-- 车组数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="车组号" label="车组号" width="150" />
      <el-table-column prop="编组" label="编组" width="100" />
      <el-table-column prop="车型" label="车型" />
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

    <!-- 新增/编辑车组对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑车组' : '新增车组'" width="500px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="100px">
        <el-form-item label="车组号"><el-input v-model="form['车组号']" placeholder="请输入车组号" /></el-form-item>
        <el-form-item label="编组"><el-input-number v-model="form['编组']" :min="0" /></el-form-item>
        <el-form-item label="车型"><el-input v-model="form['车型']" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 操作栏：左右两侧布局 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #fdf9e9 0%, #fef9f0 100%);
  border: 1px solid #f1e5c4;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(146, 64, 14, 0.04);
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-input {
  /* 宽度：280px */
  width: 280px;
}

/* 搜索输入框包装器（Element Plus 深度选择器） */
.search-input :deep(.el-input__wrapper) {
  /* 圆角：6px */
  border-radius: 6px;
  /* 边框阴影：淡黄色，1px */
  box-shadow: 0 0 0 1px #f1e5c4;
  /* 过渡动画：0.2s */
  transition: box-shadow 0.2s;
}

/* 搜索输入框悬停状态 */
.search-input :deep(.el-input__wrapper:hover) {
  /* 边框阴影：黄色，1px */
  box-shadow: 0 0 0 1px #fbbf24;
}

/* 搜索输入框聚焦状态 */
.search-input :deep(.el-input__wrapper.is-focus) {
  /* 边框阴影：深黄色，1px */
  box-shadow: 0 0 0 1px #d97706;
}

/* ========== 匹配提示样式 ========== */
/* 搜索匹配提示文字 */
.match-hint {
  /* 字号：12px */
  font-size: 12px;
  /* 文字颜色：深棕色 */
  color: #92400e;
  /* 背景：淡黄色 */
  background: #fef3c7;
  /* 内边距：3px 10px */
  padding: 3px 10px;
  /* 圆角：10px */
  border-radius: 10px;
  /* 边框：淡黄色，1px */
  border: 1px solid #fde68a;
}

/* 匹配提示中的高亮文字 */
.match-hint b {
  /* 文字颜色：深棕色 */
  color: #b45309;
  /* 字重：700，加粗 */
  font-weight: 700;
}

/* 总数提示文字 */
.total-hint {
  /* 字号：12px */
  font-size: 12px;
  /* 文字颜色：深黄色 */
  color: #a16207;
}
</style>
