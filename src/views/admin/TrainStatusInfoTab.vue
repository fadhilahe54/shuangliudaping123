<!--
  车组状态分配管理组件（可视化拖拽：状态-车组关联）
  功能：左侧显示待分配车组列表，右侧显示各状态槽位，拖拽车组到状态中完成分配
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAllTrainStatusInfo, getAllTrainGroupBase,
  saveTrainStatusRelation, deleteTrainStatusRelation,
} from '../../api/dispatchApi.js'
import { useDragAutoScroll } from '../../composables/useDragAutoScroll.js'
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])
const trainGroupList = ref([])
const loading = ref(false)
const allSaving = ref(false)
const dragData = ref(null)
const dragOverTarget = ref(null)
const hasChanges = ref(false)

/* ========== 全局车组搜索（跨左侧+右侧高亮） ========== */
const globalSearch = ref('')
const globalSearchKw = computed(() => globalSearch.value.trim().toLowerCase())
const isGroupMatched = (id) => {
  if (!globalSearchKw.value) return false
  const g = trainGroupList.value.find(t => t.id === id)
  if (!g) return false
  return (g['车组号'] || '').toLowerCase().includes(globalSearchKw.value) ||
         (g['车型'] || '').toLowerCase().includes(globalSearchKw.value)
}

/* ========== 搜索过滤 ========== */
const searchGroup = ref('')

/* ========== 右侧自动滚动 ========== */
const slotAreaRef = ref(null)
const { onDragOverScroll, stopAutoScroll } = useDragAutoScroll()

// 本地编辑态 { [状态id]: [车组id, ...] }
const localBindings = reactive({})

const initBindings = () => {
  list.value.forEach(s => {
    localBindings[s.id] = (s['车组信息List'] || []).map(g => g.id)
  })
  hasChanges.value = false
}

const assignedGroupIds = computed(() => {
  const ids = new Set()
  Object.values(localBindings).forEach(arr => (arr || []).forEach(id => ids.add(id)))
  return ids
})

const unassignedGroups = computed(() => trainGroupList.value.filter(g => !assignedGroupIds.value.has(g.id)))

const filteredUnassigned = computed(() => {
  const kw = searchGroup.value.trim().toLowerCase() || globalSearchKw.value
  if (!kw) return unassignedGroups.value
  return unassignedGroups.value.filter(g =>
    (g['车组号'] || '').toLowerCase().includes(kw) ||
    (g['车型'] || '').toLowerCase().includes(kw)
  )
})

const getGroupName = (gid) => {
  const g = trainGroupList.value.find(v => v.id === gid)
  return g ? (g['车组号'] || gid) : gid
}
const getGroupType = (gid) => {
  const g = trainGroupList.value.find(v => v.id === gid)
  return g ? (g['车型'] || '') : ''
}

/* ========== 数据加载 ========== */
const loadData = async () => {
  loading.value = true
  try {
    const [statusData, groupData] = await Promise.all([getAllTrainStatusInfo(), getAllTrainGroupBase()])
    list.value = (Array.isArray(statusData) ? [...statusData] : (statusData ? [statusData] : [])).sort((a, b) => a.id - b.id)
    trainGroupList.value = Array.isArray(groupData) ? [...groupData] : (groupData ? [groupData] : [])
    initBindings()
  } catch (e) { console.error(e) }
  loading.value = false
}

/* ========== 拖拽 ========== */
const onDragStart = (e, group) => {
  dragData.value = { id: group.id }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(group.id))
}
const onDragStartFromSlot = (e, gid, statusId) => {
  dragData.value = { id: gid, fromStatusId: statusId }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(gid))
}
const onDragOver = (e, statusId) => {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragOverTarget.value = statusId
}
const onDragLeave = (e, statusId) => {
  if (dragOverTarget.value === statusId) dragOverTarget.value = null
}
const onDrop = (e, statusId) => {
  e.preventDefault(); dragOverTarget.value = null
  if (!dragData.value) return
  const gid = dragData.value.id
  if (dragData.value.fromStatusId != null) {
    const from = localBindings[dragData.value.fromStatusId]
    if (from) { const idx = from.indexOf(gid); if (idx !== -1) from.splice(idx, 1) }
  }
  if (!localBindings[statusId]) localBindings[statusId] = []
  if (!localBindings[statusId].includes(gid)) localBindings[statusId].push(gid)
  hasChanges.value = true; dragData.value = null
}
const onDragEnd = () => { dragData.value = null; dragOverTarget.value = null; stopAutoScroll() }

const removeFromStatus = (statusId, gid) => {
  const arr = localBindings[statusId]; if (!arr) return
  const idx = arr.indexOf(gid)
  if (idx !== -1) { arr.splice(idx, 1); hasChanges.value = true }
}

/* ========== 下拉选择备用方案 ========== */
const addGroupBySelect = (statusId, gid) => {
  if (!gid) return
  if (!localBindings[statusId]) localBindings[statusId] = []
  if (!localBindings[statusId].includes(gid)) {
    localBindings[statusId].push(gid)
    hasChanges.value = true
  }
}

/* ========== 保存 ========== */
const saveAll = async () => {
  allSaving.value = true
  try {
    for (const status of list.value) {
      await deleteTrainStatusRelation(status.id)
      for (const gid of (localBindings[status.id] || [])) {
        await saveTrainStatusRelation({ 状态id: status.id, 车组id: gid })
      }
    }
    const statusData = await getAllTrainStatusInfo()
    list.value = (Array.isArray(statusData) ? [...statusData] : (statusData ? [statusData] : [])).sort((a, b) => a.id - b.id)
    initBindings()
    const summary = list.value.map(status => `${status['状态名称']}:${(localBindings[status.id] || []).length}组`).join('；')
    logOperation('保存车组状态分配', `保存车组状态分配:${summary}`)
    ElMessage.success('车组状态分配保存成功')
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
        <div class="text-base font-bold" style="color:#78350f">车组状态分配</div>
        <div class="text-xs" style="color:#92400e">
          拖拽左侧车组到右侧状态中，管理车组与状态的对应关系
          <span v-if="hasChanges" style="color:#d97706" class="ml-2">● 有未保存的更改</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <el-input v-model="globalSearch" placeholder="搜索车组号/车型（全局高亮）..." size="default" clearable
          class="global-search" prefix-icon="Search" />
        <div class="flex gap-2">
          <el-button v-if="hasChanges" @click="resetBindings" size="default">
            <el-icon class="mr-1"><RefreshLeft /></el-icon>重置
          </el-button>
          <el-button type="success" :loading="allSaving" @click="saveAll" size="default" :disabled="!hasChanges">
            <el-icon class="mr-1"><Check /></el-icon>保存全部
          </el-button>
        </div>
      </div>
    </div>

    <div class="drag-body">
      <!-- 左侧：待分配车组（紧凑模式 + 搜索） -->
      <div class="item-panel">
        <div class="panel-title">🚆 待分配车组 <span class="panel-count">({{ filteredUnassigned.length }})</span></div>
        <el-input v-model="searchGroup" placeholder="搜索车组..." size="small" clearable class="panel-search" />
        <div class="chip-flow">
          <div v-for="g in filteredUnassigned" :key="g.id" class="mini-chip"
            :class="{ 'global-match': isGroupMatched(g.id) }"
            draggable="true" @dragstart="onDragStart($event, g)" @dragend="onDragEnd"
            :title="(g['车组号'] || g.id) + ' ' + (g['车型'] || '')">
            <span class="mini-name">{{ g['车组号'] || g.id }}</span>
          </div>
          <div v-if="!filteredUnassigned.length" class="panel-empty">{{ searchGroup ? '无匹配' : '全部已分配' }}</div>
        </div>
        <div class="panel-divider" v-if="assignedGroupIds.size"></div>
        <div class="panel-title" v-if="assignedGroupIds.size">
          已分配 <span class="panel-count">({{ assignedGroupIds.size }})</span>
        </div>
        <div class="chip-flow dimmed" v-if="assignedGroupIds.size">
          <div v-for="gid in assignedGroupIds" :key="'a-'+gid" class="mini-chip dim"
            :class="{ 'global-match': isGroupMatched(gid) }">
            <span class="mini-name">{{ getGroupName(gid) }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧：状态槽位（拖拽时边缘自动滚动） -->
      <div ref="slotAreaRef" class="slot-area"
        @dragover="onDragOverScroll($event, slotAreaRef)">
        <div v-for="status in list" :key="status.id"
          class="slot-card" :class="{ 'drag-over': dragOverTarget === status.id }"
          @dragover="onDragOver($event, status.id)"
          @dragleave="onDragLeave($event, status.id)"
          @drop="onDrop($event, status.id)">
          <div class="slot-head">
            <div class="flex items-center gap-2">
              <span class="dot" style="background:#2563eb;box-shadow:0 0 6px rgba(37,99,235,0.4)"></span>
              <span class="slot-title">{{ status['状态名称'] || '(未命名)' }}</span>
            </div>
            <el-tag :type="(localBindings[status.id] || []).length ? 'primary' : 'info'" size="small" effect="dark">
              {{ (localBindings[status.id] || []).length }} 组
            </el-tag>
          </div>
          <div class="slot-items">
            <div v-for="gid in (localBindings[status.id] || [])" :key="gid"
              class="slot-item" :class="{ 'global-match': isGroupMatched(gid) }" draggable="true"
              @dragstart="onDragStartFromSlot($event, gid, status.id)" @dragend="onDragEnd">
              <span class="chip-icon">🚆</span>
              <span class="chip-name">{{ getGroupName(gid) }}</span>
              <span class="chip-sub">{{ getGroupType(gid) }}</span>
              <button class="item-remove" @click="removeFromStatus(status.id, gid)">✕</button>
            </div>
          </div>
          <div v-if="!(localBindings[status.id] || []).length" class="slot-empty">拖入车组或下方选择添加</div>
          <!-- 下拉选择车组（备用方案） -->
          <el-select placeholder="选择车组添加" size="small" filterable
            class="select-add" @change="(v) => addGroupBySelect(status.id, v)" :model-value="null">
            <el-option v-for="g in unassignedGroups" :key="g.id"
              :label="(g['车组号'] || g.id) + ' ' + (g['车型'] || '')"
              :value="g.id" />
          </el-select>
        </div>
        <div v-if="!list.length && !loading" class="area-empty">
          暂无状态数据，请先在「车组状态」中新增状态
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 车组状态拖拽分配页面布局 ========== */
/* 与今日值班拖拽页保持一致：左侧车组池，右侧状态槽位区 */
.drag-layout { display: flex; flex-direction: column; height: 100%; }

/* 顶部操作栏：承载标题、说明、全局搜索、刷新/保存等操作 */
.drag-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 1px solid #e8dcc8;
}

/* 全局搜索框样式 */
.global-search { width: 260px; }
.global-search :deep(.el-input__wrapper) {
  border-radius: 8px; box-shadow: 0 0 0 1px #d6c9a8;
}
.global-search :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #b8a080;
}
.global-search :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #2563eb !important;
}

/* 全局搜索匹配高亮（左侧车组 chip + 右侧状态车组 tag） */
.global-match {
  outline: 2px solid #f59e0b !important;
  background: #fef3c7 !important;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.35) !important;
  animation: matchPulse 1.5s ease-in-out infinite;
}
@keyframes matchPulse {
  0%, 100% { outline-color: #f59e0b; box-shadow: 0 0 8px rgba(245, 158, 11, 0.35); }
  50% { outline-color: #f97316; box-shadow: 0 0 14px rgba(249, 115, 22, 0.5); }
}

/* 主体区域：左右两栏并排，内部滚动，避免撑破后台布局 */
.drag-body { display: flex; gap: 16px; flex: 1; min-height: 0; overflow: hidden; }

/* 左侧车组池：展示待分配状态的车组 chip，固定宽度便于右侧槽位自适应 */
.item-panel {
  width: 220px; min-width: 220px;
  background: #fdf6e9; border: 1px solid #e8dcc8;
  border-radius: 12px; padding: 12px; overflow-y: auto;
  box-shadow: 0 2px 8px rgba(120,53,15,0.06);
}

/* 左侧面板标题、数量与筛选输入框样式 */
.panel-title { font-size: 13px; font-weight: 700; color: #78350f; margin-bottom: 4px; }
.panel-count { font-weight: 400; font-size: 11px; color: #a16207; }
.panel-search { margin-bottom: 8px; }
.panel-search :deep(.el-input__wrapper) {
  border-radius: 6px; box-shadow: 0 0 0 1px #e8dcc8;
}
.panel-divider { height: 1px; background: #e8dcc8; margin: 10px 0; }
.panel-empty { font-size: 12px; color: #a16207; font-style: italic; text-align: center; padding: 10px 0; width: 100%; }

/* 紧凑 chip flow */
.chip-flow { display: flex; flex-wrap: wrap; gap: 4px; }
.chip-flow.dimmed { opacity: 0.5; }
.mini-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 6px;
  background: #fff; border: 1px solid #bbf7d0; border-left: 3px solid #22c55e;
  cursor: grab; user-select: none; transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  white-space: nowrap;
}
.mini-chip:active { cursor: grabbing; }
.mini-chip:hover {
  border-color: #86efac; background: #f0fdf4;
  box-shadow: 0 2px 6px rgba(34,197,94,0.15);
}
.mini-chip.dim {
  cursor: default; background: #f5f5f4; border-color: #d6d3d1; border-left-color: #a8a29e;
}
.mini-chip.dim:hover { box-shadow: none; background: #f5f5f4; border-color: #d6d3d1; }
.mini-name { font-size: 11px; font-weight: 600; color: #292524; }
.mini-chip.dim .mini-name { color: #a8a29e; }
.chip-icon { font-size: 14px; }
.chip-name { font-size: 12px; font-weight: 600; color: #292524; flex: 1; }
.chip-sub { font-size: 10px; color: #78716c; }
.slot-area {
  flex: 1; overflow-y: auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px; padding: 4px; align-content: start;
}
.slot-card {
  background: #fef9f0; border: 2px dashed #d6c9a8;
  border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px; transition: all 0.2s;
  box-shadow: 0 1px 4px rgba(120,53,15,0.04);
}
.slot-card.drag-over {
  border-color: #3b82f6; background: #eff6ff;
  box-shadow: inset 0 0 16px rgba(59,130,246,0.06), 0 0 0 3px rgba(59,130,246,0.1);
}
.slot-head { display: flex; align-items: center; justify-content: space-between; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.slot-title { font-size: 14px; font-weight: 700; color: #1e40af; }
.slot-items { display: flex; flex-wrap: wrap; gap: 6px; min-height: 32px; }
.slot-item {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 6px;
  background: #fff; border: 1px solid #93c5fd;
  cursor: grab; user-select: none; transition: all 0.15s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.slot-item:hover { border-color: #3b82f6; box-shadow: 0 2px 8px rgba(59,130,246,0.15); }
.slot-item .chip-name { color: #1e3a5f; }
.slot-item .chip-sub { color: #64748b; }
.item-remove {
  width: 16px; height: 16px; border-radius: 50%;
  border: none; background: #fee2e2;
  color: #ef4444; font-size: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s; margin-left: 2px;
}
.slot-item:hover .item-remove { opacity: 1; }
.item-remove:hover { background: #fca5a5; color: #dc2626; }
.slot-empty { font-size: 11px; color: #a16207; font-style: italic; text-align: center; padding: 8px 0; }
.area-empty { grid-column: 1/-1; text-align: center; color: #a16207; padding: 60px 0; font-size: 13px; }

/* 下拉选择备用方案 */
.select-add { width: 100%; margin-top: 6px; }
.select-add :deep(.el-input__wrapper) {
  border-radius: 6px; box-shadow: 0 0 0 1px #93c5fd;
}
.mt-3 { margin-top: 12px; }
</style>
