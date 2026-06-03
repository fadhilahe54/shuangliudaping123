<!--
  车次信息管理组件
  功能：管理车次、起始区间、备注等信息的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllTrainNumber, saveTrainNumber, deleteTrainNumberById } from '../../api/dispatchApi.js' // 车次信息接口
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
// 车次列表
const list = ref([])

// 表格加载状态
const loading = ref(false)

// 新增/编辑对话框显示状态
const dialogVisible = ref(false)

// 车次表单数据（id、车次、起始区间、备注）
const form = ref({ id: null, '车次': '', '起始区间': '', '备注': '' })

// 当前分页页码
const page = ref(1)

// 每页显示条数
const pageSize = ref(15)

// 表格刷新 key
const tableKey = ref(0)

// 搜索关键字（车次/起始区间/备注）
const searchKeyword = ref('')

/**
 * 计算模糊过滤后的列表
 * 按车次、起始区间、备注进行模糊匹配
 * 
 * @returns {Array<Object>} 过滤后的车次列表
 */
const filteredList = computed(() => {
  // 获取搜索关键字，去除空格并转小写
  const kw = searchKeyword.value.trim().toLowerCase()
  
  // 若无关键字，返回全部列表
  if (!kw) return list.value
  
  // 按车次、起始区间、备注模糊匹配
  return list.value.filter(item =>
    String(item['车次'] || '').toLowerCase().includes(kw) ||
    String(item['起始区间'] || '').toLowerCase().includes(kw) ||
    String(item['备注'] || '').toLowerCase().includes(kw)
  )
})

/**
 * 计算前端分页后的列表
 * 基于过滤后的列表进行分页
 * 
 * @returns {Array<Object>} 当前页的车次列表
 */
const pagedList = computed(() => 
  filteredList.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
)

/**
 * 搜索时重置分页
 * 避免搜索后分页越界
 * 
 * @returns {void}
 */
const handleSearch = () => { 
  page.value = 1 
}

/**
 * 加载全部车次数据
 * 从后台接口获取车次列表
 * 
 * @async
 * @returns {Promise<void>}
 */
const loadData = async () => {
  // 设置加载状态
  loading.value = true
  try {
    // 调用接口获取车次列表
    const data = await getAllTrainNumber()
    
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
    : { id: null, '车次': '', '起始区间': '', '备注': '' }
  
  // 显示对话框
  dialogVisible.value = true
}

/**
 * 保存车次信息
 * 校验车次不能为空
 * 
 * @async
 * @returns {Promise<void>}
 */
const saveData = async () => {
  // 校验车次不能为空
  if (!form.value['车次']?.trim()) { 
    ElMessage.warning('请输入车次')
    return 
  }
  try {
    const payload = { ...form.value }
    const isEdit = !!payload.id
    if (!payload.id) delete payload.id
    await saveTrainNumber(payload)
    logOperation(isEdit ? '修改车次信息' : '新增车次信息', `${isEdit ? '修改' : '新增'}:${payload['车次']}车次`)
    await loadData()
    ElMessage.success('保存成功')
    dialogVisible.value = false
  } catch (e) { ElMessage.error('保存失败') }
}

/** 删除车次，带确认 */
const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除？', '提示') } catch { return }
  try {
    const trainNumber = list.value.find(item => item.id === id)
    await deleteTrainNumberById(id)
    logOperation('删除车次信息', `删除:${trainNumber?.['车次'] || id}车次`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/** 暴露 loadData 供父组件调用 */
defineExpose({ loadData })
</script>

<template>
  <!-- 车次信息管理页面 - 修改人：王天智 -->
  <div>
    <!-- 操作栏：搜索（左） + 统计/新增（右） -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索车次 / 起始区间 / 备注"
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
    <!-- 车次数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="车次" label="车次" width="150" />
      <el-table-column prop="起始区间" label="起始区间" />
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
      :total="filteredList.length" v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,15,30,50]" />

    <!-- 新增/编辑车次对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑车次信息' : '新增车次信息'" width="500px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="100px">
        <el-form-item label="车次"><el-input v-model="form['车次']" placeholder="请输入车次" /></el-form-item>
        <el-form-item label="起始区间"><el-input v-model="form['起始区间']" placeholder="请输入起始区间" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form['备注']" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ========== 操作栏样式 ========== */
/* 操作栏容器：左右两侧布局 */
.toolbar {
  /* 弹性布局：水平排列 */
  display: flex;
  /* 垂直对齐：居中 */
  align-items: center;
  /* 水平分布：两端对齐 */
  justify-content: space-between;
  /* 子元素间距：12px */
  gap: 12px;
  /* 下边距：14px */
  margin-bottom: 14px;
  /* 内边距：10px 14px */
  padding: 10px 14px;
  /* 背景：淡黄色渐变 */
  background: linear-gradient(90deg, #fdf9e9 0%, #fef9f0 100%);
  /* 边框：淡黄色，1px */
  border: 1px solid #f1e5c4;
  /* 圆角：8px */
  border-radius: 8px;
  /* 阴影：淡黄色微光 */
  box-shadow: 0 1px 3px rgba(146, 64, 14, 0.04);
}

/* 操作栏左右两侧区域 */
.toolbar-left,
.toolbar-right {
  /* 弹性布局：水平排列 */
  display: flex;
  /* 垂直对齐：居中 */
  align-items: center;
  /* 子元素间距：10px */
  gap: 10px;
}

/* ========== 搜索输入框样式 ========== */
/* 搜索输入框容器 */
.search-input {
  /* 宽度：300px */
  width: 300px;
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
  color: #92400e;
  background: #fef3c7;
  padding: 3px 10px;
  border-radius: 10px;
  border: 1px solid #fde68a;
}
.match-hint b {
  color: #b45309;
  font-weight: 700;
}
.total-hint {
  font-size: 12px;
  color: #a16207;
}
</style>
