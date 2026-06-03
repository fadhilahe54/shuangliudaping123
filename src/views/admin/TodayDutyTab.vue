<!--
  今日值班安排组件（可视化拖拽：岗位-人员关联）
  功能：左侧显示待分配人员列表（按职务分组），右侧显示各岗位槽位，拖拽人员到岗位中完成安排
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAllJobInfo, getAllWorkers, saveJobWorker, deleteJobWorker,
} from '../../api/dispatchApi.js'
import { useDragAutoScroll } from '../../composables/useDragAutoScroll.js'
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
// 岗位信息列表
const jobInfoList = ref([])

// 员工列表
const workerList = ref([])

// 表格加载状态
const loading = ref(false)

// 保存操作加载状态
const allSaving = ref(false)

// 当前拖拽的数据（人员 ID）
const dragData = ref(null)

// 拖拽悬停的目标岗位
const dragOverTarget = ref(null)

// 是否有未保存的修改
const hasChanges = ref(false)

/* ========== 搜索过滤 ========== */
// 员工搜索关键字
const searchWorker = ref('')

/* ========== 右侧自动滚动 ========== */
// 右侧岗位槽位区域 ref
const slotAreaRef = ref(null)

// 拖拽自动滚动 composable
const { onDragOverScroll, stopAutoScroll } = useDragAutoScroll()

// 本地编辑态：{ [岗位id]: [人员id, ...] }
const localBindings = reactive({})

/**
 * 初始化本地绑定数据
 * 从后台数据复制到本地编辑态
 * 
 * @returns {void}
 */
const initBindings = () => {
  // 遍历所有岗位，提取已分配的人员 ID
  jobInfoList.value.forEach(job => {
    localBindings[job.id] = (job['值班人员list'] || []).map(w => w.id)
  })
  
  // 标记无未保存修改
  hasChanges.value = false
}

/**
 * 计算已分配的员工 ID 集合
 * 用于判断哪些员工已被分配到岗位
 * 
 * @returns {Set<number>} 已分配员工 ID 的集合
 */
const assignedWorkerIds = computed(() => {
  // 创建集合，存储所有已分配的员工 ID
  const ids = new Set()
  
  // 遍历所有岗位的人员列表
  Object.values(localBindings).forEach(arr => 
    (arr || []).forEach(id => ids.add(id))
  )
  
  return ids
})

/**
 * 计算未分配的员工列表
 * 
 * @returns {Array<Object>} 未分配的员工数组
 */
const unassignedWorkers = computed(() => 
  workerList.value.filter(w => !assignedWorkerIds.value.has(w.id))
)

/**
 * 计算搜索过滤后的待分配人员
 * 按姓名或职务模糊匹配
 * 
 * @returns {Array<Object>} 过滤后的未分配员工列表
 */
const filteredUnassigned = computed(() => {
  // 获取搜索关键字，去除空格并转小写
  const kw = searchWorker.value.trim().toLowerCase()
  
  // 若无关键字，返回全部未分配员工
  if (!kw) return unassignedWorkers.value
  
  // 按姓名或职务模糊匹配
  return unassignedWorkers.value.filter(w =>
    (w['姓名'] || '').toLowerCase().includes(kw) ||
    (w['职务'] || '').toLowerCase().includes(kw)
  )
})

/**
 * 计算按职务分组的未分配员工
 * 用于左侧面板的分组显示
 * 
 * @returns {Array<Object>} 分组数据，每组包含 label 和 workers
 */
const unassignedGrouped = computed(() => {
  // 按职务分组
  const groups = {}
  unassignedWorkers.value.forEach(w => {
    // 获取职务，默认为"未分配职务"
    const duty = w['职务'] || '未分配职务'
    
    // 初始化该职务的员工数组
    if (!groups[duty]) groups[duty] = []
    
    // 添加员工到对应职务组
    groups[duty].push(w)
  })
  
  // 转换为数组格式 { label, workers }
  return Object.entries(groups).map(([label, workers]) => ({ label, workers }))
})

/**
 * 根据员工 ID 获取员工姓名
 * 
 * @param {number} wid - 员工 ID
 * @returns {string} 员工姓名或 ID
 */
const getWorkerName = (wid) => {
  // 在员工列表中查找
  const w = workerList.value.find(v => v.id === wid)
  
  // 返回姓名或 ID
  return w ? (w['姓名'] || wid) : wid
}

/**
 * 根据员工 ID 获取员工职务
 * 
 * @param {number} wid - 员工 ID
 * @returns {string} 员工职务
 */
const getWorkerDuty = (wid) => {
  // 在员工列表中查找
  const w = workerList.value.find(v => v.id === wid)
  
  // 返回职务
  return w ? (w['职务'] || '') : ''
}

/* ========== 数据加载 ========== */
const loadData = async () => {
  loading.value = true
  try {
    const [jobData, workerData] = await Promise.all([getAllJobInfo(), getAllWorkers()])
    jobInfoList.value = (Array.isArray(jobData) ? [...jobData] : (jobData ? [jobData] : [])).sort((a, b) => a.id - b.id)
    workerList.value = Array.isArray(workerData) ? [...workerData] : (workerData ? [workerData] : [])
    initBindings()
  } catch (e) { console.error(e) }
  loading.value = false
}

/* ========== 拖拽 ========== */
const onDragStart = (e, worker) => {
  dragData.value = { id: worker.id }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(worker.id))
}
const onDragStartFromSlot = (e, wid, jobId) => {
  dragData.value = { id: wid, fromJobId: jobId }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(wid))
}
const onDragOver = (e, jobId) => {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragOverTarget.value = jobId
}
const onDragLeave = (e, jobId) => {
  if (dragOverTarget.value === jobId) dragOverTarget.value = null
}
const onDrop = (e, jobId) => {
  e.preventDefault(); dragOverTarget.value = null
  if (!dragData.value) return
  const wid = dragData.value.id
  if (dragData.value.fromJobId != null) {
    const from = localBindings[dragData.value.fromJobId]
    if (from) { const idx = from.indexOf(wid); if (idx !== -1) from.splice(idx, 1) }
  }
  if (!localBindings[jobId]) localBindings[jobId] = []
  if (!localBindings[jobId].includes(wid)) localBindings[jobId].push(wid)
  hasChanges.value = true; dragData.value = null
}
const onDragEnd = () => { dragData.value = null; dragOverTarget.value = null; stopAutoScroll() }

const removeFromJob = (jobId, wid) => {
  const arr = localBindings[jobId]; if (!arr) return
  const idx = arr.indexOf(wid)
  if (idx !== -1) { arr.splice(idx, 1); hasChanges.value = true }
}

/* ========== 下拉选择备用方案 ========== */
const addWorkerBySelect = (jobId, wid) => {
  if (!wid) return
  if (!localBindings[jobId]) localBindings[jobId] = []
  if (!localBindings[jobId].includes(wid)) {
    localBindings[jobId].push(wid)
    hasChanges.value = true
  }
}

/* ========== 保存 ========== */
const saveAll = async () => {
  allSaving.value = true
  try {
    for (const job of jobInfoList.value) {
      await deleteJobWorker(job.id)
      for (const wid of (localBindings[job.id] || [])) {
        await saveJobWorker({ 岗位id: job.id, 人员id: wid })
      }
    }
    const jobData = await getAllJobInfo()
    jobInfoList.value = (Array.isArray(jobData) ? [...jobData] : (jobData ? [jobData] : [])).sort((a, b) => a.id - b.id)
    initBindings()
    const summary = jobInfoList.value.map(job => `${job['值班岗位']}:${(localBindings[job.id] || []).length}人`).join('；')
    logOperation('保存今日值班安排', `保存今日值班安排:${summary}`)
    ElMessage.success('今日值班安排保存成功')
  } catch (e) { ElMessage.error('保存失败') }
  allSaving.value = false
}

const resetBindings = () => { initBindings(); ElMessage.info('已重置为服务器状态') }

defineExpose({ loadData })
</script>

<template>
  <div class="drag-layout" v-loading="loading">
    <div class="drag-header">
      <div>
        <div class="text-base font-bold" style="color:#78350f">今日值班安排</div>
        <div class="text-xs" style="color:#92400e">
          拖拽左侧人员到右侧岗位中，保存后大屏实时更新
          <span v-if="hasChanges" style="color:#d97706" class="ml-2">● 有未保存的更改</span>
        </div>
      </div>
      <div class="flex gap-2">
        <el-button v-if="hasChanges" @click="resetBindings" size="default">
          <el-icon class="mr-1"><RefreshLeft /></el-icon>重置
        </el-button>
        <el-button type="success" :loading="allSaving" @click="saveAll" size="default" :disabled="!hasChanges">
          <el-icon class="mr-1"><Check /></el-icon>保存全部
        </el-button>
      </div>
    </div>

    <div class="drag-body">
      <!-- 左侧：待分配人员（紧凑模式 + 搜索） -->
      <div class="item-panel">
        <div class="panel-title">👤 待分配人员 <span class="panel-count">({{ filteredUnassigned.length }})</span></div>
        <el-input v-model="searchWorker" placeholder="搜索人员..." size="small" clearable class="panel-search" />
        <div class="chip-flow">
          <div v-for="w in filteredUnassigned" :key="w.id" class="mini-chip"
            draggable="true" @dragstart="onDragStart($event, w)" @dragend="onDragEnd"
            :title="(w['姓名'] || w.id) + ' ' + (w['职务'] || '')">
            <span class="mini-name">{{ w['姓名'] || w.id }}</span>
          </div>
          <div v-if="!filteredUnassigned.length" class="panel-empty">{{ searchWorker ? '无匹配' : '全部已分配' }}</div>
        </div>
        <div class="panel-divider" v-if="assignedWorkerIds.size"></div>
        <div class="panel-title" v-if="assignedWorkerIds.size">
          已分配 <span class="panel-count">({{ assignedWorkerIds.size }})</span>
        </div>
        <div class="chip-flow dimmed" v-if="assignedWorkerIds.size">
          <div v-for="wid in assignedWorkerIds" :key="'a-'+wid" class="mini-chip dim">
            <span class="mini-name">{{ getWorkerName(wid) }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧：岗位槽位（拖拽时边缘自动滚动） -->
      <div ref="slotAreaRef" class="slot-area"
        @dragover="onDragOverScroll($event, slotAreaRef)">
        <div v-for="job in jobInfoList" :key="job.id"
          class="slot-card" :class="{ 'drag-over': dragOverTarget === job.id }"
          @dragover="onDragOver($event, job.id)"
          @dragleave="onDragLeave($event, job.id)"
          @drop="onDrop($event, job.id)">
          <div class="slot-head">
            <div class="flex items-center gap-2">
              <span class="dot" style="background:#0891b2;box-shadow:0 0 6px rgba(8,145,178,0.4)"></span>
              <span class="slot-title">{{ job['值班岗位'] || '(未命名)' }}</span>
            </div>
            <el-tag :type="(localBindings[job.id] || []).length ? 'success' : 'info'" size="small" effect="dark">
              {{ (localBindings[job.id] || []).length }} 人
            </el-tag>
          </div>
          <div class="slot-items">
            <div v-for="wid in (localBindings[job.id] || [])" :key="wid"
              class="slot-item" draggable="true"
              @dragstart="onDragStartFromSlot($event, wid, job.id)" @dragend="onDragEnd">
              <span class="chip-icon">👤</span>
              <span class="chip-name">{{ getWorkerName(wid) }}</span>
              <span class="chip-sub">{{ getWorkerDuty(wid) }}</span>
              <button class="item-remove" @click="removeFromJob(job.id, wid)">✕</button>
            </div>
          </div>
          <div v-if="!(localBindings[job.id] || []).length" class="slot-empty">拖入人员或下方选择添加</div>
          <!-- 下拉选择人员（备用方案） -->
          <el-select placeholder="选择人员添加" size="small" filterable
            class="select-add" @change="(v) => addWorkerBySelect(job.id, v)" :model-value="null">
            <el-option v-for="w in unassignedWorkers" :key="w.id"
              :label="(w['姓名'] || w.id) + ' ' + (w['职务'] || '')"
              :value="w.id" />
          </el-select>
        </div>
        <div v-if="!jobInfoList.length && !loading" class="area-empty">
          暂无岗位数据，请先在「岗位管理」中新增岗位
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 拖拽分配页面整体布局 ========== */
/* 上方标题/操作区 + 下方左右两栏拖拽区，撑满后台内容区域高度 */
.drag-layout { 
  /* 弹性布局：垂直排列 */
  display: flex; 
  /* 方向：列方向 */
  flex-direction: column; 
  /* 高度：100%，撑满父容器 */
  height: 100%; 
}

/* ========== 顶部栏样式 ========== */
/* 顶部栏：显示页面标题、统计信息和刷新/保存等操作按钮 */
.drag-header {
  /* 弹性布局：水平排列 */
  display: flex; 
  /* 垂直对齐：居中 */
  align-items: center; 
  /* 水平分布：两端对齐 */
  justify-content: space-between;
  /* 下边距：16px */
  margin-bottom: 16px; 
  /* 下内边距：12px */
  padding-bottom: 12px;
  /* 下边框：暖色，1px */
  border-bottom: 1px solid #e8dcc8;
}

/* ========== 主体区域样式 ========== */
/* 主体区域：左侧候选人员面板，右侧岗位槽位面板 */
.drag-body { 
  /* 弹性布局：水平排列 */
  display: flex; 
  /* 子元素间距：16px */
  gap: 16px; 
  /* 弹性：1，占据剩余空间 */
  flex: 1; 
  /* 最小高度：0，允许缩小 */
  min-height: 0; 
  /* 溢出：隐藏 */
  overflow: hidden; 
}

/* ========== 左侧人员池样式 ========== */
/* 左侧人员池：固定宽度滚动列表，用于放置未分配或可拖拽人员 chip */
.item-panel {
  /* 宽度：220px */
  width: 220px; 
  /* 最小宽度：220px */
  min-width: 220px;
  /* 背景：淡黄色 */
  background: #fdf6e9; 
  /* 边框：暖色，1px */
  border: 1px solid #e8dcc8;
  /* 圆角：12px */
  border-radius: 12px; 
  /* 内边距：12px */
  padding: 12px; 
  /* 垂直溢出：自动滚动 */
  overflow-y: auto;
  /* 阴影：暖色微光 */
  box-shadow: 0 2px 8px rgba(120,53,15,0.06);
}

/* ========== 面板标题和数量样式 ========== */
/* 面板标题和数量：突出当前职务/人员池名称，并显示可分配数量 */
.panel-title { 
  /* 字号：13px */
  font-size: 13px; 
  /* 字重：700，加粗 */
  font-weight: 700; 
  /* 文字颜色：深棕色 */
  color: #78350f; 
  /* 下边距：4px */
  margin-bottom: 4px; 
}

/* 面板数量 */
.panel-count { 
  /* 字重：400，正常 */
  font-weight: 400; 
  /* 字号：11px */
  font-size: 11px; 
  /* 文字颜色：深黄色 */
  color: #a16207; 
}

/* 面板搜索 */
.panel-search { 
  /* 下边距：8px */
  margin-bottom: 8px; 
}

/* 搜索输入框穿透 Element Plus 样式，统一为暖色系描边 */
.panel-search :deep(.el-input__wrapper) {
  /* 圆角：6px */
  border-radius: 6px; 
  /* 边框阴影：暖色，1px */
  box-shadow: 0 0 0 1px #e8dcc8;
}

/* 面板分隔线 */
.panel-divider { 
  /* 高度：1px */
  height: 1px; 
  /* 背景：暖色 */
  background: #e8dcc8; 
  /* 外边距：10px 0 */
  margin: 10px 0; 
}

/* 面板空状态提示 */
.panel-empty { 
  /* 字号：12px */
  font-size: 12px; 
  /* 文字颜色：深黄色 */
  color: #a16207; 
  /* 字体样式：斜体 */
  font-style: italic; 
  /* 文字对齐：居中 */
  text-align: center; 
  /* 内边距：10px 0 */
  padding: 10px 0; 
  /* 宽度：100% */
  width: 100%; 
}

/* ========== 紧凑 chip flow 样式 ========== */
/* 紧凑 chip flow */
.chip-flow { 
  /* 弹性布局：水平排列 */
  display: flex; 
  /* 允许换行 */
  flex-wrap: wrap; 
  /* 子元素间距：4px */
  gap: 4px; 
}

/* chip flow 变暗状态 */
.chip-flow.dimmed { 
  /* 透明度：0.5 */
  opacity: 0.5; 
}

/* 迷你 chip 样式 */
.mini-chip {
  /* 弹性布局：水平排列 */
  display: inline-flex; 
  /* 垂直对齐：居中 */
  align-items: center; 
  /* 子元素间距：3px */
  gap: 3px;
  /* 内边距：3px 8px */
  padding: 3px 8px; 
  /* 圆角：6px */
  border-radius: 6px;
  /* 背景：白色 */
  background: #fff; 
  /* 边框：绿色，1px */
  border: 1px solid #bbf7d0; 
  /* 左边框：绿色，3px，突出显示 */
  border-left: 3px solid #22c55e;
  /* 鼠标样式：抓取 */
  cursor: grab; 
  /* 禁止选择文本 */
  user-select: none; 
  /* 过渡动画：0.15s */
  transition: all 0.15s;
  /* 阴影：灰色微光 */
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  /* 禁止换行 */
  white-space: nowrap;
}

/* mini chip 激活状态（拖拽中） */
.mini-chip:active { 
  /* 鼠标样式：抓取中 */
  cursor: grabbing; 
}

/* mini chip 悬停状态 */
.mini-chip:hover {
  /* 边框颜色：绿色 */
  border-color: #86efac; 
  /* 背景：淡绿色 */
  background: #f0fdf4;
  /* 阴影：绿色发光 */
  box-shadow: 0 2px 6px rgba(34,197,94,0.15);
}

/* mini chip 禁用状态 */
.mini-chip.dim {
  /* 鼠标样式：默认 */
  cursor: default; 
  /* 背景：灰色 */
  background: #f5f5f4; 
  /* 边框颜色：灰色 */
  border-color: #d6d3d1; 
  /* 左边框颜色：灰色 */
  border-left-color: #a8a29e;
}

/* mini chip 禁用悬停状态 */
.mini-chip.dim:hover { 
  /* 阴影：无 */
  box-shadow: none; 
  /* 背景：灰色 */
  background: #f5f5f4; 
  /* 边框颜色：灰色 */
  border-color: #d6d3d1; 
}

/* mini chip 名称 */
.mini-name { 
  /* 字号：11px */
  font-size: 11px; 
  /* 字重：600，半粗 */
  font-weight: 600; 
  /* 文字颜色：深灰色 */
  color: #292524; 
}

/* mini chip 禁用状态名称 */
.mini-chip.dim .mini-name { 
  /* 文字颜色：灰色 */
  color: #a8a29e; 
}

/* chip 图标 */
.chip-icon { 
  /* 字号：14px */
  font-size: 14px; 
}

/* chip 名称 */
.chip-name { 
  /* 字号：12px */
  font-size: 12px; 
  /* 字重：600，半粗 */
  font-weight: 600; 
  /* 文字颜色：深灰色 */
  color: #292524; 
  /* 弹性：1，占据剩余空间 */
  flex: 1; 
}

/* chip 副标题 */
.chip-sub { 
  /* 字号：10px */
  font-size: 10px; 
  /* 文字颜色：灰色 */
  color: #78716c; 
}

/* ========== 槽位区域样式 ========== */
/* 槽位区域 */
.slot-area {
  /* 弹性：1，占据剩余空间 */
  flex: 1; 
  /* 垂直溢出：自动滚动 */
  overflow-y: auto;
  /* 网格布局 */
  display: grid; 
  /* 网格列：自动填充，最小 280px */
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  /* 间距：12px */
  gap: 12px; 
  /* 内边距：4px */
  padding: 4px; 
  /* 内容对齐：起始 */
  align-content: start;
}

/* 槽位卡片 */
.slot-card {
  /* 背景：淡黄色 */
  background: #fef9f0; 
  /* 边框：虚线，2px */
  border: 2px dashed #d6c9a8;
  /* 圆角：12px */
  border-radius: 12px; 
  /* 内边距：14px */
  padding: 14px;
  /* 弹性布局：垂直排列 */
  display: flex; 
  /* 方向：列方向 */
  flex-direction: column; 
  /* 子元素间距：8px */
  gap: 8px; 
  /* 过渡动画：0.2s */
  transition: all 0.2s;
  /* 阴影：暖色微光 */
  box-shadow: 0 1px 4px rgba(120,53,15,0.04);
}

/* 槽位卡片拖拽悬停状态 */
.slot-card.drag-over {
  /* 边框颜色：青色 */
  border-color: #0891b2; 
  /* 背景：淡青色 */
  background: #ecfeff;
  /* 双层阴影：内层青色微光 + 外层青色边框 */
  box-shadow: inset 0 0 16px rgba(8,145,178,0.06), 0 0 0 3px rgba(8,145,178,0.1);
}

/* 槽位头部 */
.slot-head { 
  /* 弹性布局：水平排列 */
  display: flex; 
  /* 垂直对齐：居中 */
  align-items: center; 
  /* 水平分布：两端对齐 */
  justify-content: space-between; 
}

/* 槽位圆点 */
.dot { 
  /* 宽度：8px */
  width: 8px; 
  /* 高度：8px */
  height: 8px; 
  /* 圆角：50%，圆形 */
  border-radius: 50%; 
  /* 不收缩：固定宽度 */
  flex-shrink: 0; 
}

/* 槽位标题 */
.slot-title { 
  /* 字号：14px */
  font-size: 14px; 
  /* 字重：700，加粗 */
  font-weight: 700; 
  /* 文字颜色：深青色 */
  color: #155e75; 
}

/* 槽位项容器 */
.slot-items { 
  /* 弹性布局：水平排列 */
  display: flex; 
  /* 允许换行 */
  flex-wrap: wrap; 
  /* 子元素间距：6px */
  gap: 6px; 
  /* 最小高度：32px */
  min-height: 32px; 
}

/* 槽位项 */
.slot-item {
  /* 弹性布局：水平排列 */
  display: flex; 
  /* 垂直对齐：居中 */
  align-items: center; 
  /* 子元素间距：4px */
  gap: 4px;
  /* 内边距：4px 8px */
  padding: 4px 8px; 
  /* 圆角：6px */
  border-radius: 6px;
  /* 背景：白色 */
  background: #fff; 
  /* 边框：青色，1px */
  border: 1px solid #67e8f9;
  /* 鼠标样式：抓取 */
  cursor: grab; 
  /* 禁止选择文本 */
  user-select: none; 
  /* 过渡动画：0.15s */
  transition: all 0.15s;
  /* 阴影：灰色微光 */
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

/* 槽位项悬停状态 */
.slot-item:hover { 
  /* 边框颜色：青色 */
  border-color: #06b6d4; 
  /* 阴影：青色发光 */
  box-shadow: 0 2px 8px rgba(6,182,212,0.15); 
}

/* 槽位项名称 */
.slot-item .chip-name { 
  /* 文字颜色：深青色 */
  color: #164e63; 
}

/* 槽位项副标题 */
.slot-item .chip-sub { 
  /* 文字颜色：灰色 */
  color: #64748b; 
}

/* ========== 移除按钮样式 ========== */
/* 移除按钮 */
.item-remove {
  /* 宽度：16px */
  width: 16px; 
  /* 高度：16px */
  height: 16px; 
  /* 圆角：50%，圆形 */
  border-radius: 50%;
  /* 边框：无 */
  border: none; 
  /* 背景：淡红色 */
  background: #fee2e2;
  /* 文字颜色：红色 */
  color: #ef4444; 
  /* 字号：10px */
  font-size: 10px; 
  /* 鼠标样式：指针 */
  cursor: pointer;
  /* 弹性布局：居中 */
  display: flex; 
  align-items: center; 
  justify-content: center;
  /* 透明度：0，默认隐藏 */
  opacity: 0; 
  /* 过渡动画：0.15s */
  transition: opacity 0.15s; 
  /* 左边距：2px */
  margin-left: 2px;
}

/* 槽位项悬停时显示移除按钮 */
.slot-item:hover .item-remove { 
  /* 透明度：1，显示 */
  opacity: 1; 
}

/* 移除按钮悬停状态 */
.item-remove:hover { 
  /* 背景：红色 */
  background: #fca5a5; 
  /* 文字颜色：深红色 */
  color: #dc2626; 
}

/* 槽位空状态提示 */
.slot-empty { 
  /* 字号：11px */
  font-size: 11px; 
  /* 文字颜色：深黄色 */
  color: #a16207; 
  /* 字体样式：斜体 */
  font-style: italic; 
  /* 文字对齐：居中 */
  text-align: center; 
  /* 内边距：8px 0 */
  padding: 8px 0; 
}
/* 区域空状态提示 */
.area-empty { 
  /* 网格列：跨越所有列 */
  grid-column: 1/-1; 
  /* 文字对齐：居中 */
  text-align: center; 
  /* 文字颜色：深黄色 */
  color: #a16207; 
  /* 内边距：60px 0 */
  padding: 60px 0; 
  /* 字号：13px */
  font-size: 13px; 
}

/* ========== 下拉选择备用方案 ========== */
/* 选择添加容器 */
.select-add { 
  /* 宽度：100% */
  width: 100%; 
  /* 上边距：6px */
  margin-top: 6px; 
}

/* 选择添加包装器（Element Plus 深度选择器） */
.select-add :deep(.el-input__wrapper) {
  /* 圆角：6px */
  border-radius: 6px; 
  /* 边框阴影：淡青色，1px */
  box-shadow: 0 0 0 1px #a5f3fc;
}

/* 上边距工具类 */
.mt-3 { 
  /* 上边距：12px */
  margin-top: 12px; 
}
</style>
