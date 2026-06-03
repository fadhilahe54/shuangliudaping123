<!--
  交路关联管理组件（可视化拖拽：交路-车次-车组三元关联）
  功能：左侧显示车次和车组两个拖拽面板，右侧显示交路槽位
  拖拽车次到交路中创建配对行，再拖拽车组到配对行的空位中完成关联
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAllTrainGroup, getAllTrainNumber, getAllTrainGroupBase,
  getAllRouteBindInfo, saveRouteBind,
  deleteRouteBindByRouteId,
} from '../../api/dispatchApi.js'
import { useDragAutoScroll } from '../../composables/useDragAutoScroll.js'
import RouteRotateTab from './RouteRotateTab.vue'
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const routeList = ref([])
const trainNumberList = ref([])
const trainGroupList = ref([])
const bindList = ref([])
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
const searchTN = ref('')
const searchGroup = ref('')
const filteredTN = computed(() => {
  const kw = searchTN.value.trim().toLowerCase()
  if (!kw) return trainNumberList.value
  return trainNumberList.value.filter(t =>
    (t['车次'] || '').toLowerCase().includes(kw) ||
    (t['起始区间'] || '').toLowerCase().includes(kw)
  )
})
const filteredGroups = computed(() => {
  const kw = searchGroup.value.trim().toLowerCase() || globalSearchKw.value
  if (!kw) return trainGroupList.value
  return trainGroupList.value.filter(g =>
    (g['车组号'] || '').toLowerCase().includes(kw) ||
    (g['车型'] || '').toLowerCase().includes(kw)
  )
})

/* ========== 右侧自动滚动 ========== */
const slotAreaRef = ref(null)
const { onDragOverScroll, stopAutoScroll } = useDragAutoScroll()

// 本地编辑态 { [交路id]: [{ 车次id, 车组ids: [车组id, ...] }, ...] }
const localBindings = reactive({})

const initBindings = () => {
  routeList.value.forEach(route => {
    const binds = bindList.value.filter(b => b['交路id'] === route.id)
    // 合并同一车次的多个车组到一行
    const tnMap = new Map()
    binds.forEach(b => {
      const tnId = b['车次id']
      if (!tnMap.has(tnId)) tnMap.set(tnId, [])
      if (b['车组id']) tnMap.get(tnId).push(b['车组id'])
    })
    localBindings[route.id] = [...tnMap.entries()].map(([tnId, gids]) => ({ 车次id: tnId, 车组ids: gids }))
  })
  hasChanges.value = false
}

const getTrainNumberName = (id) => {
  const t = trainNumberList.value.find(n => n.id === id)
  return t ? (t['车次'] || id) : id
}
const getTrainNumberRoute = (id) => {
  const t = trainNumberList.value.find(n => n.id === id)
  return t ? (t['起始区间'] || '') : ''
}
const getGroupName = (id) => {
  const g = trainGroupList.value.find(t => t.id === id)
  return g ? (g['车组号'] || id) : id
}
const getGroupType = (id) => {
  const g = trainGroupList.value.find(t => t.id === id)
  return g ? (g['车型'] || '') : ''
}

/* ========== 数据加载 ========== */
const loadData = async () => {
  loading.value = true
  try {
    const [routes, numbers, groups, binds] = await Promise.all([
      getAllTrainGroup(), getAllTrainNumber(), getAllTrainGroupBase(), getAllRouteBindInfo()
    ])
    routeList.value = (Array.isArray(routes) ? [...routes] : (routes ? [routes] : [])).sort((a, b) => a.id - b.id)
    trainNumberList.value = Array.isArray(numbers) ? [...numbers] : (numbers ? [numbers] : [])
    trainGroupList.value = Array.isArray(groups) ? [...groups] : (groups ? [groups] : [])
    bindList.value = Array.isArray(binds) ? [...binds] : (binds ? [binds] : [])
    initBindings()
    
    // 加载交路轮转数据
    await nextTick()
    routeRotateRef.value?.loadData()
  } catch (e) { console.error(e) }
  loading.value = false
}

/* ========== 拖拽：车次拖入交路 ========== */
const onDragStartTN = (e, tn) => {
  dragData.value = { type: 'trainNumber', id: tn.id }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(tn.id))
}

/* ========== 拖拽：车组拖入配对行 ========== */
const onDragStartGroup = (e, g) => {
  dragData.value = { type: 'group', id: g.id }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(g.id))
}

const onDragEnd = () => { dragData.value = null; dragOverTarget.value = null; stopAutoScroll() }

/* 交路卡片级 drop：接受车次，创建新配对行 */
const onDragOverRoute = (e, routeId) => {
  if (dragData.value?.type === 'trainNumber') {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    dragOverTarget.value = `route-${routeId}`
  }
}
const onDragLeaveRoute = (e, routeId) => {
  if (dragOverTarget.value === `route-${routeId}`) dragOverTarget.value = null
}
const onDropRoute = (e, routeId) => {
  e.preventDefault(); dragOverTarget.value = null
  if (!dragData.value || dragData.value.type !== 'trainNumber') return
  if (!localBindings[routeId]) localBindings[routeId] = []
  localBindings[routeId].push({ 车次id: dragData.value.id, 车组ids: [] })
  hasChanges.value = true; dragData.value = null
}

/* 配对行级 drop：接受车组，添加到车组列表 */
const onDragOverPair = (e, routeId, idx) => {
  if (dragData.value?.type === 'group') {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    dragOverTarget.value = `pair-${routeId}-${idx}`
  }
}
const onDragLeavePair = (e, routeId, idx) => {
  if (dragOverTarget.value === `pair-${routeId}-${idx}`) dragOverTarget.value = null
}
const onDropPair = (e, routeId, idx) => {
  e.preventDefault(); dragOverTarget.value = null
  if (!dragData.value || dragData.value.type !== 'group') return
  const row = localBindings[routeId]?.[idx]
  if (row) {
    if (!row['车组ids'].includes(dragData.value.id)) {
      row['车组ids'].push(dragData.value.id)
      hasChanges.value = true
    }
  }
  dragData.value = null
}

/* 移除整个车次配对行 */
const removePair = (routeId, idx) => {
  localBindings[routeId]?.splice(idx, 1)
  hasChanges.value = true
}

/* 移除配对行中的某个车组 */
const removeGroupFromPair = (routeId, idx, gid) => {
  const row = localBindings[routeId]?.[idx]
  if (row) {
    row['车组ids'] = row['车组ids'].filter(id => id !== gid)
    hasChanges.value = true
  }
}

/* ========== 下拉选择备用方案 ========== */
/** 通过下拉框选择车次添加配对行 */
const addPairBySelect = (routeId, tnId) => {
  if (!tnId) return
  if (!localBindings[routeId]) localBindings[routeId] = []
  localBindings[routeId].push({ 车次id: tnId, 车组ids: [] })
  hasChanges.value = true
}

/** 通过下拉框选择车组添加到配对行 */
const addGroupBySelect = (routeId, idx, gid) => {
  if (!gid) return
  const row = localBindings[routeId]?.[idx]
  if (row && !row['车组ids'].includes(gid)) {
    row['车组ids'].push(gid)
    hasChanges.value = true
  }
}

/* ========== 保存 ========== */
const saveAll = async () => {
  allSaving.value = true
  try {
    for (const route of routeList.value) {
      await deleteRouteBindByRouteId(route.id)
      for (const row of (localBindings[route.id] || [])) {
        if (!row['车次id']) continue
        // 每个车组单独保存一条关联记录
        for (const gid of (row['车组ids'] || [])) {
          await saveRouteBind({ 交路id: route.id, 车次id: row['车次id'], 车组id: gid })
        }
      }
    }
    const binds = await getAllRouteBindInfo()
    bindList.value = Array.isArray(binds) ? [...binds] : (binds ? [binds] : [])
    initBindings()
    const summary = routeList.value.map(route => `${route['交路名称']}:${(localBindings[route.id] || []).length}个车次配对`).join('；')
    logOperation('保存交路关联', `保存交路关联:${summary}`)
    ElMessage.success('交路关联保存成功')
  } catch (e) { ElMessage.error('保存失败') }
  allSaving.value = false
}

const resetBindings = () => { initBindings(); ElMessage.info('已重置为服务器状态') }

const routeRotateRef = ref()

defineExpose({ loadData })
</script>

<template>
  <div class="drag-layout" v-loading="loading">
    <div class="drag-header">
      <div>
        <div class="text-base font-bold" style="color:#78350f">交路关联管理</div>
        <div class="text-xs" style="color:#92400e">
          ① 拖拽车次到交路中创建配对 ② 拖拽车组到配对行完成关联
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
      <!-- 左侧：车次 + 车组紧凑面板 -->
      <div class="item-panel">
        <!-- 车次面板 -->
        <div class="panel-title">🚂 车次列表 <span class="panel-count">({{ filteredTN.length }})</span></div>
        <el-input v-model="searchTN" placeholder="搜索车次..." size="small" clearable class="panel-search" />
        <div class="chip-flow">
          <div v-for="tn in filteredTN" :key="tn.id" class="mini-chip tn-chip"
            draggable="true" @dragstart="onDragStartTN($event, tn)" @dragend="onDragEnd"
            :title="(tn['车次'] || tn.id) + ' ' + (tn['起始区间'] || '')">
            <span class="mini-name">{{ tn['车次'] || tn.id }}</span>
          </div>
          <div v-if="!filteredTN.length" class="panel-empty">{{ searchTN ? '无匹配' : '暂无车次' }}</div>
        </div>

        <div class="panel-divider"></div>

        <!-- 车组面板 -->
        <div class="panel-title">🚆 车组列表 <span class="panel-count">({{ filteredGroups.length }})</span></div>
        <el-input v-model="searchGroup" placeholder="搜索车组..." size="small" clearable class="panel-search" />
        <div class="chip-flow">
          <div v-for="g in filteredGroups" :key="g.id" class="mini-chip grp-chip"
            :class="{ 'global-match': isGroupMatched(g.id) }"
            draggable="true" @dragstart="onDragStartGroup($event, g)" @dragend="onDragEnd"
            :title="(g['车组号'] || g.id) + ' ' + (g['车型'] || '')">
            <span class="mini-name">{{ g['车组号'] || g.id }}</span>
          </div>
          <div v-if="!filteredGroups.length" class="panel-empty">{{ searchGroup ? '无匹配' : '暂无车组' }}</div>
        </div>
      </div>

      <!-- 右侧：交路槽位（拖拽时边缘自动滚动） -->
      <div ref="slotAreaRef" class="slot-area"
        @dragover="onDragOverScroll($event, slotAreaRef)">
        <!-- 交路卡片网格 -->
        <div class="route-cards-grid">
          <div v-for="route in routeList" :key="route.id"
            class="slot-card" :class="{ 'drag-over': dragOverTarget === `route-${route.id}` }"
            @dragover="onDragOverRoute($event, route.id)"
            @dragleave="onDragLeaveRoute($event, route.id)"
            @drop="onDropRoute($event, route.id)">
            <!-- 交路头部 -->
            <div class="slot-head">
              <div class="flex items-center gap-2">
                <span class="dot" style="background:#7c3aed;box-shadow:0 0 6px rgba(124,58,237,0.4)"></span>
                <span class="slot-title">{{ route['交路名称'] || '(未命名)' }}</span>
              </div>
              <el-tag :type="(localBindings[route.id] || []).length ? 'primary' : 'info'" size="small" effect="dark">
                {{ (localBindings[route.id] || []).reduce((sum, r) => sum + (r['车组ids'] || []).length, 0) }} 条
              </el-tag>
            </div>

            <!-- 配对行列表 -->
            <div class="pair-list">
              <div v-for="(row, idx) in (localBindings[route.id] || [])" :key="idx"
                class="pair-row" :class="{ 'pair-over': dragOverTarget === `pair-${route.id}-${idx}` }"
                @dragover="onDragOverPair($event, route.id, idx)"
                @dragleave="onDragLeavePair($event, route.id, idx)"
                @drop.stop="onDropPair($event, route.id, idx)">
                <!-- 车次部分 -->
                <div class="pair-tn">
                  <span class="pair-icon">🚂</span>
                  <span class="pair-name">{{ getTrainNumberName(row['车次id']) }}</span>
                </div>
                <span class="pair-arrow">→</span>
                <!-- 车组部分（支持多个车组） -->
                <div class="pair-grp-area">
                  <div v-for="gid in row['车组ids']" :key="gid" class="pair-grp-tag"
                    :class="{ 'global-match': isGroupMatched(gid) }">
                    <span class="pair-icon">🚆</span>
                    <span class="pair-name">{{ getGroupName(gid) }}</span>
                    <span class="pair-type">{{ getGroupType(gid) }}</span>
                    <button class="pair-clear-inline" @click="removeGroupFromPair(route.id, idx, gid)" title="移除此车组">✕</button>
                  </div>
                  <el-select placeholder="+ 添加车组" size="small" filterable
                    class="pair-select-add" @change="(v) => addGroupBySelect(route.id, idx, v)" :model-value="null">
                    <el-option v-for="g in trainGroupList" :key="g.id"
                      :label="(g['车组号'] || g.id) + ' ' + (g['车型'] || '')"
                      :value="g.id" />
                  </el-select>
                </div>
                <!-- 删除整个车次行 -->
                <button class="pair-remove" @click="removePair(route.id, idx)" title="删除此车次行">✕</button>
              </div>
            </div>
            <div v-if="!(localBindings[route.id] || []).length" class="slot-empty">拖入车次或下方选择添加</div>
            <!-- 下拉选择车次添加配对（备用方案） -->
            <div class="select-add-row">
              <el-select placeholder="选择车次添加配对" size="small" filterable
                class="select-add" @change="(v) => addPairBySelect(route.id, v)" :model-value="null">
                <el-option v-for="tn in trainNumberList" :key="tn.id"
                  :label="(tn['车次'] || tn.id) + ' ' + (tn['起始区间'] || '')"
                  :value="tn.id" />
              </el-select>
            </div>
          </div>
        </div>

        <div v-if="!routeList.length && !loading" class="area-empty">
          暂无交路数据，请先在「交路信息」中新增交路
        </div>

        <!-- 交路轮转卡片区域（交路卡片组下方） -->
        <div v-if="routeList.length" class="route-rotate-section">
          <div class="rotate-card-header">
            <el-icon class="rotate-icon"><RefreshRight /></el-icon>
            <span class="rotate-title">交路轮转配置</span>
            <span class="rotate-desc">配置各车次交路轮转顺序，支持预览和立即执行</span>
          </div>
          <div class="rotate-card-body">
            <RouteRotateTab ref="routeRotateRef" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 交路关联拖拽页面整体布局 ========== */
/* 上方操作说明区 + 下方三元关联拖拽区：车次/车组拖入交路卡片形成绑定关系 */
.drag-layout { display: flex; flex-direction: column; height: 100%; }

/* 顶部栏：展示页面标题、全局搜索、保存/刷新等操作，底部分隔线区分内容区 */
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
  box-shadow: 0 0 0 1px #8b5cf6 !important;
}

/* 全局搜索匹配高亮（左侧车组 chip + 右侧配对车组 tag） */
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

/* 主体区域：左侧两个候选池，右侧交路卡片网格，内部滚动避免外层页面溢出 */
.drag-body { display: flex; gap: 16px; flex: 1; min-height: 0; overflow: hidden; }

/* 左侧面板：固定宽度展示可拖拽车次和车组 chip */
.item-panel {
  width: 220px; min-width: 220px;
  background: #fdf6e9; border: 1px solid #e8dcc8;
  border-radius: 12px; padding: 12px; overflow-y: auto;
  box-shadow: 0 2px 8px rgba(120,53,15,0.06);
}
.panel-title { font-size: 13px; font-weight: 700; color: #78350f; margin-bottom: 4px; }
.panel-count { font-weight: 400; font-size: 11px; color: #a16207; }
.panel-search { margin-bottom: 8px; }
.panel-search :deep(.el-input__wrapper) {
  border-radius: 6px; box-shadow: 0 0 0 1px #e8dcc8;
}
.panel-divider { height: 1px; background: #e8dcc8; margin: 10px 0; }
.panel-empty { font-size: 12px; color: #a16207; font-style: italic; text-align: center; padding: 10px 0; width: 100%; }

/* 紧凑 chip flow 横向排列 */
.chip-flow {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.mini-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 6px;
  background: #fff; cursor: grab; user-select: none; transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  white-space: nowrap;
}
.mini-chip:active { cursor: grabbing; }
.mini-name { font-size: 11px; font-weight: 600; color: #292524; }
/* 车次紫色调 */
.tn-chip { border: 1px solid #ddd6fe; border-left: 3px solid #8b5cf6; }
.tn-chip:hover { border-color: #c4b5fd; background: #f5f3ff; box-shadow: 0 2px 6px rgba(139,92,246,0.15); }
/* 车组绿色调 */
.grp-chip { border: 1px solid #bbf7d0; border-left: 3px solid #22c55e; }
.grp-chip:hover { border-color: #86efac; background: #f0fdf4; box-shadow: 0 2px 6px rgba(34,197,94,0.15); }

/* 右侧槽位 */
.slot-area {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px; padding: 4px; align-content: start;
}

/* 交路卡片网格 */
.route-cards-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}

.slot-card {
  background: #fef9f0; border: 2px dashed #d6c9a8;
  border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px; transition: all 0.2s;
  box-shadow: 0 1px 4px rgba(120,53,15,0.04);
}
.slot-card.drag-over {
  border-color: #8b5cf6; background: #faf5ff;
  box-shadow: inset 0 0 16px rgba(139,92,246,0.06), 0 0 0 3px rgba(139,92,246,0.1);
}
.slot-head { display: flex; align-items: center; justify-content: space-between; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.slot-title { font-size: 14px; font-weight: 700; color: #5b21b6; }

/* 配对行 */
.pair-list { display: flex; flex-direction: column; gap: 6px; }
.pair-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 8px;
  background: #fff; border: 1px solid #e8e5e0;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.pair-row.pair-over {
  border-color: #22c55e; background: #f0fdf4;
  box-shadow: 0 0 0 2px rgba(34,197,94,0.15);
}
.pair-tn {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 5px;
  background: #f5f3ff; border: 1px solid #ddd6fe;
}
.pair-arrow { color: #a8a29e; font-size: 12px; flex-shrink: 0; }
.pair-grp-area {
  display: flex; align-items: center; gap: 4px; flex: 1;
  flex-wrap: wrap; min-height: 26px;
}
.pair-grp-tag {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: 5px;
  background: #f0fdf4; border: 1px solid #bbf7d0;
  position: relative;
}
/* 配对车组标签悬停状态 */
.pair-grp-tag:hover { 
  /* 边框颜色：绿色 */
  border-color: #86efac; 
  /* 背景：淡绿色 */
  background: #dcfce7; 
}

/* 配对图标 */
.pair-icon { 
  /* 字号：12px */
  font-size: 12px; 
}

/* 配对名称 */
.pair-name { 
  /* 字号：11px */
  font-size: 11px; 
  /* 字重：600，半粗 */
  font-weight: 600; 
  /* 文字颜色：深灰色 */
  color: #292524; 
}

/* 配对类型 */
.pair-type { 
  /* 字号：9px */
  font-size: 9px; 
  /* 文字颜色：灰色 */
  color: #78716c; 
}

/* ========== 配对清除按钮（内联） ========== */
/* 内联配对清除按钮 */
.pair-clear-inline {
  /* 宽度：14px */
  width: 14px; 
  /* 高度：14px */
  height: 14px; 
  /* 圆角：50%，圆形 */
  border-radius: 50%;
  /* 边框：无 */
  border: none; 
  /* 背景：淡红色 */
  background: #fee2e2;
  /* 文字颜色：红色 */
  color: #ef4444; 
  /* 字号：9px */
  font-size: 9px; 
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

/* 车组标签悬停时显示清除按钮 */
.pair-grp-tag:hover .pair-clear-inline { 
  /* 透明度：1，显示 */
  opacity: 1; 
}

/* 清除按钮悬停状态 */
.pair-clear-inline:hover { 
  /* 背景：红色 */
  background: #fca5a5; 
  /* 文字颜色：深红色 */
  color: #dc2626; 
}

/* 配对选择器（添加） */
.pair-select-add { 
  /* 宽度：120px */
  width: 120px; 
}

/* 配对选择器包装器（Element Plus 深度选择器） */
.pair-select-add :deep(.el-input__wrapper) {
  /* 边框阴影：灰色，1px */
  box-shadow: 0 0 0 1px #d6d3d1; 
  /* 圆角：4px */
  border-radius: 4px; 
  /* 高度：22px */
  height: 22px;
}

/* 配对选择器输入框（Element Plus 深度选择器） */
.pair-select-add :deep(.el-input__inner) { 
  /* 字号：11px */
  font-size: 11px; 
}

/* ========== 配对移除按钮 ========== */
/* 配对移除按钮 */
.pair-remove {
  /* 宽度：18px */
  width: 18px; 
  /* 高度：18px */
  height: 18px; 
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
  /* 不收缩：固定宽度 */
  flex-shrink: 0;
}

/* 配对行悬停时显示移除按钮 */
.pair-row:hover .pair-remove { 
  /* 透明度：1，显示 */
  opacity: 1; 
}

/* 移除按钮悬停状态 */
.pair-remove:hover { 
  /* 背景：红色 */
  background: #fca5a5; 
  /* 文字颜色：深红色 */
  color: #dc2626; 
}

/* 空槽位提示 */
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
/* 选择添加行 */
.select-add-row { 
  /* 上边距：6px */
  padding-top: 6px; 
}

/* 选择添加容器 */
.select-add { 
  /* 宽度：100% */
  width: 100%; 
}

/* 选择添加包装器（Element Plus 深度选择器） */
.select-add :deep(.el-input__wrapper) {
  /* 圆角：6px */
  border-radius: 6px; 
  /* 边框阴影：淡紫色，1px */
  box-shadow: 0 0 0 1px #ddd6fe;
}

/* ========== 交路轮转区域 ========== */
/* 交路轮转区域：按内容自然展开，外层 .slot-area 统一处理滚动 */
.route-rotate-section {
  /* 网格列：跨越所有列 */
  grid-column: 1 / -1;
  /* 背景：白色 */
  background: #fff;
  /* 边框：灰色，1px */
  border: 1px solid #e5e7eb;
  /* 圆角：8px */
  border-radius: 8px;
  /* 阴影：灰色微光 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  /* 上边距：8px */
  margin-top: 8px;
  /* 保证子元素圆角裁剪效果的同时不截断高度，改用 clip-path 可选；此处移除 overflow:hidden 防止下方内容被截断 */
}

/* 轮转卡片头部 */
.rotate-card-header {
  /* 弹性布局：水平排列 */
  display: flex;
  /* 垂直对齐：居中 */
  align-items: center;
  /* 子元素间距：8px */
  gap: 8px;
  /* 内边距：14px 20px */
  padding: 14px 20px;
  /* 背景：淡黄色渐变 */
  background: linear-gradient(90deg, #fdf9e9 0%, #fdf9e9 100%);
  /* 下边框：灰色，1px */
  border-bottom: 1px solid #e5e7eb;
  /* 不收缩：固定宽度 */
  flex-shrink: 0;
}

/* 轮转图标 */
.rotate-icon {
  /* 字号：18px */
  font-size: 18px;
  /* 文字颜色：深棕色 */
  color: #77350f;
}

/* 轮转标题 */
.rotate-title {
  /* 字号：15px */
  font-size: 15px;
  /* 字重：600，半粗 */
  font-weight: 600;
  /* 文字颜色：深棕色 */
  color: #77350f;
}

/* 轮转描述 */
.rotate-desc {
  /* 字号：12px */
  font-size: 12px;
  /* 文字颜色：棕色 */
  color: #60420b;
  /* 左边距：8px */
  margin-left: 8px;
}

/* 轮转卡片主体 */
.rotate-card-body {
  /* 内边距：20px */
  padding: 20px;
  /* 不再独立滚动，外层 .slot-area 统一滚动，避免在高度未知时内容被截断 */
}
</style>
