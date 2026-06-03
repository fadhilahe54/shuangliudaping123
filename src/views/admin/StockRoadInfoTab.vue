<!--
  股道信息管理组件（可视化轨道布局 + 拖拽）
  功能：模拟3D场景俯视图，股道显示为水平轨道，车组为可拖拽卡片
  左侧为待分配车组面板，右侧为股道轨道图，拖入一列位/二列位即可分配
  注意：轨道视觉方向与大屏一致——左侧为二列位，右侧为一列位（通过 .track-body flex-direction: row-reverse 实现）
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, RefreshLeft, Check, Link, Minus } from '@element-plus/icons-vue'
import {
  getAllStockRoadInfo, getAllTrainGroupBase,
  saveStockRoadRelation, deleteStockRoadRelation,
  deleteOneStockRoadRelation, updateLinkStatusById,
  updateStockRoadElectState,
  broadcastStockRoadSlotAnim,
} from '../../api/dispatchApi.js'
import { useDragAutoScroll } from '../../composables/useDragAutoScroll.js'
import { useTrainStore } from '../../stores/trainStore.js'
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])                  // 股道列表（含关联车组）
const trainGroupList = ref([])        // 所有车组基础信息
const loading = ref(false)
const allSaving = ref(false)
const dragData = ref(null)            // 当前拖拽的车组数据 { id, 车组号, 车型 }
const dragOverTarget = ref(null)      // 当前拖拽悬停的目标 'trackId-slot'
const hasChanges = ref(false)         // 是否有未保存的更改

/* ========== 搜索过滤 ========== */
const searchGroup = ref('')

/* ========== 右侧自动滚动 ========== */
const trackYardRef = ref(null)
const { onDragOverScroll, stopAutoScroll } = useDragAutoScroll()
const trainStore = useTrainStore()

// 本地编辑态：{ [股道id]: { slot1: [gid, ...], slot2: [gid, ...] } }
const localBindings = reactive({})
// 重联状态：{ [股道id]: true/false }
const linkedState = reactive({})

/* ========== 接触网供电状态（后端持久化） ==========
 * 参考真实牵引供电 SCADA：
 *   - powered  : 带电（AC 27.5kV）  红色
 *   - unpowered: 失电              灰色
 *   - grounded : 接地检修          青绿色（已挂地线，可作业）
 *   - fault    : 故障跳闸          黄色
 *   - null     : 无接触网          不显示电线和标牌
 *
 * 后端字段：一列位接触网 / 二列位接触网
 * 值域：null/空 = 无接触网，'有电'/'无电'/'接地'/'故障'
 */
// 中文→英文 key 映射
const _CN_TO_EN = { '有电': 'powered', '无电': 'unpowered', '接地': 'grounded', '故障': 'fault' }
// 接触网状态选项（含"无接触网"）
const catenaryOptions = [
  { label: '无接触网', value: '' },
  { label: '有电', value: '有电' },
  { label: '无电', value: '无电' },
  { label: '接地', value: '接地' },
  { label: '故障', value: '故障' },
]

/** 从后端原始值映射到前端英文 key */
const mapCatenaryRaw = (raw) => {
  if (raw == null || raw === '') return null
  return _CN_TO_EN[raw] || 'powered'
}

/** 获取某列位的接触网状态（英文 key） */
const getPower = (trackId, slotKey) => {
  const track = list.value.find(t => t.id === trackId)
  if (!track) return null
  const raw = slotKey === 'slot1' ? track.一列位接触网 : track.二列位接触网
  return mapCatenaryRaw(raw)
}

/** 获取某列位接触网的后端原始中文值（用于下拉选择回显） */
const getPowerRaw = (trackId, slotKey) => {
  const track = list.value.find(t => t.id === trackId)
  if (!track) return ''
  const raw = slotKey === 'slot1' ? track.一列位接触网 : track.二列位接触网
  return raw || ''
}

/** 切换接触网状态（调后端接口持久化 + 实时同步大屏） */
const changePower = async (trackId, slotKey, cnValue) => {
  const track = list.value.find(t => t.id === trackId)
  const slotName = slotKey === 'slot1' ? '一列位' : '二列位'
  const 列位 = slotKey === 'slot1' ? '1' : '2'
  try {
    await updateStockRoadElectState(trackId, 列位, cnValue)
    // 更新本地 list 缓存
    if (track) {
      if (slotKey === 'slot1') track.一列位接触网 = cnValue || null
      else track.二列位接触网 = cnValue || null
    }
    // 映射为英文 key 通知大屏
    const enState = cnValue ? (_CN_TO_EN[cnValue] || 'powered') : null
    window.dispatchEvent(new CustomEvent('catenary-power-change', {
      detail: { dbId: trackId, slotKey, state: enState }
    }))
    const displayText = cnValue || '无接触网'
    ElMessage.success(`${track?.['股道名称'] || trackId}股道·${slotName} → ${displayText}`)
    logOperation('切换接触网供电状态', `${track?.['股道名称'] || trackId}股道·${slotName}:${displayText}`)
  } catch (e) {
    console.error('接触网状态保存失败:', e)
    ElMessage.error('接触网状态保存失败')
  }
}

const powerInfo = (state) => {
  switch (state) {
    case 'powered':   return { text: '有电', voltage: 'AC 27.5kV', icon: '⚡', cls: 'pw-on' }
    case 'unpowered': return { text: '无电', voltage: '── kV',     icon: '⊘', cls: 'pw-off' }
    case 'grounded':  return { text: '接地', voltage: '已挂地线',   icon: '⏚', cls: 'pw-gnd' }
    case 'fault':     return { text: '故障', voltage: '越级跳闸',   icon: '⚠', cls: 'pw-flt' }
    default:          return { text: '无接触网', voltage: '──',     icon: '✕', cls: 'pw-none' }
  }
}

/** 序列化某个股道的编组状态（用于 diff） */
const serializeTrackBinding = (bind) => {
  if (!bind) return ''
  const s1 = (bind.slot1 || []).join(',')
  const s2 = (bind.slot2 || []).join(',')
  return `${s1}|${s2}`
}

/** 获取列位首个车组ID（当前股道列位级动画按一个列位一个车组控制） */
const getFirstGroupId = (ids = []) => {
  const id = ids.find(v => v !== null && v !== undefined && v !== '')
  return id === undefined ? '' : String(id)
}

/** 根据保存前后列位车组变化推导动画动作 */
const resolveSlotAnimAction = (oldIds = [], newIds = []) => {
  const oldId = getFirstGroupId(oldIds)
  const newId = getFirstGroupId(newIds)
  if (!oldId && !newId) return null
  if (oldId && !newId) return 'depart'
  if (!oldId && newId) return 'enter'
  return oldId === newId ? null : 'replace'
}

/** 构建本次保存需要广播的列位级动画任务 */
const buildSlotAnimTasks = () => {
  const tasks = []
  list.value.forEach(track => {
    const bind = localBindings[track.id] || { slot1: [], slot2: [] }
    const oldSlot1 = (track['一列位车组信息List'] || []).map(g => g.id)
    const oldSlot2 = (track['二列位车组信息List'] || []).map(g => g.id)
    const slots = [
      { slot: 'slot1', slotKey: 'pos1', oldIds: oldSlot1, newIds: bind.slot1 || [] },
      { slot: 'slot2', slotKey: 'pos2', oldIds: oldSlot2, newIds: bind.slot2 || [] },
    ]

    slots.forEach(item => {
      const action = resolveSlotAnimAction(item.oldIds, item.newIds)
      if (!action) return
      tasks.push({
        action,
        trackId: track.id,
        slotKey: item.slotKey,
        groupId: getFirstGroupId(item.newIds) || getFirstGroupId(item.oldIds),
      })
    })
  })
  // 同一股道内保证一列位任务先广播、二列位任务后广播，符合物理通道顺序
  return tasks.sort((a, b) => {
    if (a.trackId !== b.trackId) return String(a.trackId).localeCompare(String(b.trackId), 'zh-CN', { numeric: true })
    return a.slotKey === b.slotKey ? 0 : (a.slotKey === 'pos1' ? -1 : 1)
  })
}

/** 保存初始股道快照，用于 saveAll 时对比 */
const trackBindingSnapshot = reactive({})

/** 从后端数据初始化本地编辑态 */
const initBindings = () => {
  list.value.forEach(track => {
    localBindings[track.id] = {
      slot1: (track['一列位车组信息List'] || []).map(g => g.id),
      slot2: (track['二列位车组信息List'] || []).map(g => g.id),
    }
    // 从后台 重联状态 字段读取（'重联'→true, '非重联'→false, null→默认逻辑）
    const raw = track.重联状态
    if (raw === '重联') {
      linkedState[track.id] = true
    } else if (raw === '非重联') {
      linkedState[track.id] = false
    } else {
      const s1 = localBindings[track.id].slot1
      const s2 = localBindings[track.id].slot2
      linkedState[track.id] = (s1.length > 0 && s2.length > 0)
    }
  })
  // 重置 diff 快照
  Object.keys(trackBindingSnapshot).forEach(key => { delete trackBindingSnapshot[key] })
  list.value.forEach(track => {
    trackBindingSnapshot[track.id] = serializeTrackBinding(localBindings[track.id])
  })
  hasChanges.value = false
}

/** 切换重联状态（调用后端接口持久化 + 同步到trainStore供3D场景使用） */
const toggleLinked = async (trackId) => {
  const newVal = !linkedState[trackId]
  linkedState[trackId] = newVal
  // 数据库ID → 前端轨道ID映射（mainTrackConfig用数字索引，sidingTrackConfig用'n1'等）
  const mainCfg = trainStore.mainTrackConfig.find(c => c.dbId === trackId)
  const sidingCfg = trainStore.sidingTrackConfig.find(c => c.dbId === trackId)
  const frontendTrackId = mainCfg ? mainCfg.id : (sidingCfg ? sidingCfg.id : trackId)
  trainStore.setTrackLinked(frontendTrackId, newVal)
  // 调用后端接口持久化（即时保存，无需点"保存"按钮）
  try {
    await updateLinkStatusById(trackId, newVal ? '重联' : '非重联')
    await broadcastStockRoadSlotAnim({
      action: 'linked',
      trackId,
      slotKey: 'pos1',
      groupId: newVal ? '重联' : '非重联',
    })
    const track = list.value.find(item => item.id === trackId)
    logOperation('切换股道重联状态', `${newVal ? '设为重联' : '设为非重联'}:${track?.['股道名称'] || trackId}股道`)
    ElMessage.success(newVal ? '已设为重联' : '已设为非重联')
  } catch (e) {
    console.error('重联状态保存失败:', e)
    ElMessage.error('重联状态保存失败')
    // 回滚前端状态
    linkedState[trackId] = !newVal
    trainStore.setTrackLinked(frontendTrackId, !newVal)
  }
}

/** 计算已分配的车组id集合（用于左侧面板标灰） */
const assignedGroupIds = computed(() => {
  const ids = new Set()
  Object.values(localBindings).forEach(b => {
    ;(b.slot1 || []).forEach(id => ids.add(id))
    ;(b.slot2 || []).forEach(id => ids.add(id))
  })
  return ids
})

/** 未分配的车组列表 */
const unassignedGroups = computed(() => {
  return trainGroupList.value.filter(g => !assignedGroupIds.value.has(g.id))
})

const filteredUnassigned = computed(() => {
  const kw = searchGroup.value.trim().toLowerCase()
  if (!kw) return unassignedGroups.value
  return unassignedGroups.value.filter(g =>
    (g['车组号'] || '').toLowerCase().includes(kw) ||
    (g['车型'] || '').toLowerCase().includes(kw)
  )
})

/** 获取车组信息对象 */
const getGroup = (gid) => trainGroupList.value.find(g => g.id === gid)
const getGroupName = (gid) => {
  const g = getGroup(gid)
  return g ? (g['车组号'] || gid) : gid
}
const getGroupType = (gid) => {
  const g = getGroup(gid)
  return g ? (g['车型'] || '') : ''
}

/** 判断是否为动车组 */
const isEMU = (gid) => {
  const t = getGroupType(gid)
  return t && (t.startsWith('CRH') || t.startsWith('CR'))
}

/* ========== 数据加载 ========== */
const loadData = async () => {
  loading.value = true
  try {
    const [trackData, groupData] = await Promise.all([getAllStockRoadInfo(), getAllTrainGroupBase()])
    list.value = (Array.isArray(trackData) ? [...trackData] : (trackData ? [trackData] : [])).sort((a, b) => a.id - b.id)
    trainGroupList.value = Array.isArray(groupData) ? [...groupData] : (groupData ? [groupData] : [])
    initBindings()
  } catch (e) { console.error(e) }
  loading.value = false
}

/* ========== 拖拽处理 ========== */
const onDragStart = (e, group) => {
  dragData.value = { id: group.id, 车组号: group['车组号'], 车型: group['车型'] }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(group.id))
}

const onDragStartFromSlot = (e, group, trackId, slotKey) => {
  dragData.value = {
    id: group.id || group, 车组号: getGroupName(group.id || group),
    车型: getGroupType(group.id || group),
    fromTrackId: trackId, fromSlot: slotKey,
  }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(group.id || group))
}

const onDragOver = (e, trackId, slotKey) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOverTarget.value = `${trackId}-${slotKey}`
}

const onDragLeave = (e, trackId, slotKey) => {
  if (dragOverTarget.value === `${trackId}-${slotKey}`) {
    dragOverTarget.value = null
  }
}

const onDrop = (e, trackId, slotKey) => {
  e.preventDefault()
  dragOverTarget.value = null
  if (!dragData.value) return
  const gid = dragData.value.id

  // 如果从另一个槽位拖来，先从原位置移除
  if (dragData.value.fromTrackId != null) {
    const fromBind = localBindings[dragData.value.fromTrackId]
    if (fromBind) {
      const fromSlot = fromBind[dragData.value.fromSlot]
      const idx = fromSlot.indexOf(gid)
      if (idx !== -1) fromSlot.splice(idx, 1)
    }
  }

  // 添加到目标槽位（去重）
  if (!localBindings[trackId]) localBindings[trackId] = { slot1: [], slot2: [] }
  const targetSlot = localBindings[trackId][slotKey]
  if (!targetSlot.includes(gid)) {
    targetSlot.push(gid)
  }
  hasChanges.value = true
  dragData.value = null
}

const onDragEnd = () => {
  dragData.value = null
  dragOverTarget.value = null
  stopAutoScroll()
}

/* ========== 移除车组 ========== */
const removeFromSlot = (trackId, slotKey, gid) => {
  const slot = localBindings[trackId]?.[slotKey]
  if (!slot) return
  const idx = slot.indexOf(gid)
  if (idx !== -1) {
    slot.splice(idx, 1)
    hasChanges.value = true
  }
}

/* ========== 下拉选择备用方案 ========== */
const addGroupBySelect = (trackId, slotKey, gid) => {
  if (!gid) return
  if (!localBindings[trackId]) localBindings[trackId] = { slot1: [], slot2: [] }
  const targetSlot = localBindings[trackId][slotKey]
  if (!targetSlot.includes(gid)) {
    targetSlot.push(gid)
    hasChanges.value = true
  }
}

/* ========== 保存逻辑 ========== */
const saveAll = async () => {
  allSaving.value = true
  try {
    // 计算变更：对比保存前的本地编组与上一次快照，只记录变更的股道
    const changedTracks = list.value.filter(track => {
      return serializeTrackBinding(localBindings[track.id]) !== (trackBindingSnapshot[track.id] || '')
    })
    const animTasks = buildSlotAnimTasks()

    for (const track of list.value) {
      const bind = localBindings[track.id]
      if (!bind) continue
      // 一列位：先删后建
      await deleteStockRoadRelation(track['一列位'])
      for (const gid of (bind.slot1 || [])) {
        await saveStockRoadRelation({ 列位id: track['一列位'], 车组id: gid })
      }
      // 二列位：先删后建
      await deleteStockRoadRelation(track['二列位'])
      for (const gid of (bind.slot2 || [])) {
        await saveStockRoadRelation({ 列位id: track['二列位'], 车组id: gid })
      }
    }
    const trackData = await getAllStockRoadInfo()
    list.value = (Array.isArray(trackData) ? [...trackData] : (trackData ? [trackData] : [])).sort((a, b) => a.id - b.id)
    initBindings()
    await Promise.all(animTasks.map(task => broadcastStockRoadSlotAnim(task)))
    if (changedTracks.length > 0) {
      const changedNames = changedTracks.map(track => track['股道名称'] || track.id).join('、')
      logOperation('保存股道关联', `保存股道关联(${changedTracks.length}个):${changedNames}`)
    } else {
      logOperation('保存股道关联', '保存股道关联(无变更)')
    }
    ElMessage.success('股道关联保存成功')
  } catch (e) { ElMessage.error('保存失败') }
  allSaving.value = false
}

/** 重置为服务器状态 */
const resetBindings = () => {
  initBindings()
  ElMessage.info('已重置为服务器状态')
}

defineExpose({ loadData })
</script>

<template>
  <div class="stock-road-visual" v-loading="loading">
    <!-- 顶部信息栏（整合所有提示信息） -->
    <div class="visual-header">
      <div class="header-info">
        <div class="header-row1">
          <span class="header-title">股道编组管理（3D场景控制）</span>
          <span class="header-badge">今日填报</span>
        </div>
        <div class="header-row2">以下内容每日开班前填写/拖拽完成，实时同步到大屏显示</div>
        <div class="header-row3">拖拽左侧车组到右侧股道的列位中，直接控制 3D 大屏中股道上显示的列车</div>
        <span v-if="hasChanges" class="header-changes">● 有未保存的更改</span>
      </div>
      <div class="header-actions">
        <el-button v-if="hasChanges" @click="resetBindings" size="small">
          <el-icon class="mr-1"><RefreshLeft /></el-icon>重置
        </el-button>
        <el-button type="success" :loading="allSaving" @click="saveAll" size="small"
          :disabled="!hasChanges">
          <el-icon class="mr-1"><Check /></el-icon>保存
        </el-button>
      </div>
    </div>

    <div class="visual-body">
      <!-- ===== 左侧：待分配车组面板（紧凑模式 + 搜索） ===== -->
      <div class="group-panel">
        <div class="panel-title">🚃 待分配车组 <span class="panel-count">({{ filteredUnassigned.length }})</span></div>
        <el-input v-model="searchGroup" placeholder="搜索车组..." size="small" clearable class="panel-search" />
        <div class="chip-flow">
          <div v-for="g in filteredUnassigned" :key="g.id"
            class="mini-chip" :class="{ 'is-emu': isEMU(g.id) }"
            draggable="true"
            @dragstart="onDragStart($event, g)"
            @dragend="onDragEnd"
            :title="(g['车组号'] || g.id) + ' ' + (g['车型'] || '')">
            <span class="mini-icon">{{ isEMU(g.id) ? '🚄' : '🚃' }}</span>
            <span class="mini-name">{{ g['车组号'] || g.id }}</span>
          </div>
          <div v-if="!filteredUnassigned.length" class="panel-empty">
            {{ searchGroup ? '无匹配' : '全部已分配' }}
          </div>
        </div>
        <div class="panel-divider" v-if="assignedGroupIds.size"></div>
        <div class="panel-title" v-if="assignedGroupIds.size">
          已分配 <span class="panel-count">({{ assignedGroupIds.size }})</span>
        </div>
        <div class="chip-flow dimmed" v-if="assignedGroupIds.size">
          <div v-for="gid in assignedGroupIds" :key="'a-'+gid" class="mini-chip dim">
            <span class="mini-icon">{{ isEMU(gid) ? '🚄' : '🚃' }}</span>
            <span class="mini-name">{{ getGroupName(gid) }}</span>
          </div>
        </div>
      </div>

      <!-- ===== 右侧：轨道俯视图（拖拽时边缘自动滚动） ===== -->
      <div ref="trackYardRef" class="track-yard"
        @dragover="onDragOverScroll($event, trackYardRef)">
        <div v-for="track in list" :key="track.id" class="track-row">
          <!-- 股道名称标签 -->
          <div class="track-label">
            <div class="track-name">{{ track['股道名称'] || '?' }}</div>
          </div>

          <!-- 轨道主体 -->
          <div class="track-body">
            <!-- 一列位 drop zone -->
            <div class="track-slot slot-1"
              :class="[powerInfo(getPower(track.id, 'slot1')).cls, {
                'drag-over': dragOverTarget === `${track.id}-slot1`,
                'has-trains': (localBindings[track.id]?.slot1 || []).length > 0
              }]"
              @dragover="onDragOver($event, track.id, 'slot1')"
              @dragleave="onDragLeave($event, track.id, 'slot1')"
              @drop="onDrop($event, track.id, 'slot1')">
              <!-- 接触网示意 + 供电状态选择 -->
              <div class="catenary-line" v-if="getPower(track.id,'slot1') != null"></div>
              <div class="feeder-drop" v-if="getPower(track.id,'slot1') != null"></div>
              <div class="slot-header">
                <span class="slot-name">一列位</span>
                <el-select :model-value="getPowerRaw(track.id, 'slot1')"
                  @change="(v) => changePower(track.id, 'slot1', v)"
                  size="small" class="power-select"
                  :class="powerInfo(getPower(track.id,'slot1')).cls">
                  <el-option v-for="opt in catenaryOptions" :key="opt.value"
                    :label="opt.label" :value="opt.value" />
                </el-select>
              </div>
              <div class="slot-trains">
                <div v-for="gid in (localBindings[track.id]?.slot1 || [])" :key="'s1-'+gid"
                  class="train-block" :class="{ 'emu': isEMU(gid) }"
                  draggable="true"
                  @dragstart="onDragStartFromSlot($event, { id: gid }, track.id, 'slot1')"
                  @dragend="onDragEnd">
                  <span class="train-icon">{{ isEMU(gid) ? '🚄' : '🚃' }}</span>
                  <span class="train-name">{{ getGroupName(gid) }}</span>
                  <span class="train-type">{{ getGroupType(gid) }}</span>
                  <button class="train-remove" @click="removeFromSlot(track.id, 'slot1', gid)"
                    title="移除">✕</button>
                </div>
              </div>
              <div v-if="!(localBindings[track.id]?.slot1 || []).length" class="slot-empty">
                拖入车组
              </div>
              <el-popover trigger="click" :width="200" placement="bottom">
                <template #reference>
                  <el-button class="slot-add-btn" :icon="Plus" circle size="small" />
                </template>
                <el-select placeholder="选择车组" size="small" filterable
                  style="width:100%" @change="(v) => addGroupBySelect(track.id, 'slot1', v)" :model-value="null">
                  <el-option v-for="g in unassignedGroups" :key="g.id"
                    :label="(g['车组号'] || g.id) + ' ' + (g['车型'] || '')"
                    :value="g.id" />
                </el-select>
              </el-popover>
            </div>

            <!-- 轨道连接区域（含重联按钮） -->
            <div class="rail-center">
              <!-- 分段开关示意 -->
              <div class="catenary-section">
                <span class="section-switch" :title="'接触网分段开关'">⊟</span>
              </div>
              <div class="rail-lines-v">
                <div class="rail"></div>
                <div class="rail"></div>
              </div>
              <el-tooltip :content="linkedState[track.id] ? '当前：重联（点击解除）' : '当前：非重联（点击重联）'" placement="top">
                <button class="link-btn" :class="{ linked: linkedState[track.id] }"
                  @click="toggleLinked(track.id)">
                  <el-icon :size="12"><Link v-if="linkedState[track.id]" /><Minus v-else /></el-icon>
                </button>
              </el-tooltip>
              <div class="rail-lines-v">
                <div class="rail"></div>
                <div class="rail"></div>
              </div>
            </div>

            <!-- 二列位 drop zone -->
            <div class="track-slot slot-2"
              :class="[powerInfo(getPower(track.id, 'slot2')).cls, {
                'drag-over': dragOverTarget === `${track.id}-slot2`,
                'has-trains': (localBindings[track.id]?.slot2 || []).length > 0
              }]"
              @dragover="onDragOver($event, track.id, 'slot2')"
              @dragleave="onDragLeave($event, track.id, 'slot2')"
              @drop="onDrop($event, track.id, 'slot2')">
              <!-- 接触网示意 + 供电状态选择 -->
              <div class="catenary-line" v-if="getPower(track.id,'slot2') != null"></div>
              <div class="feeder-drop" v-if="getPower(track.id,'slot2') != null"></div>
              <div class="slot-header">
                <span class="slot-name">二列位</span>
                <el-select :model-value="getPowerRaw(track.id, 'slot2')"
                  @change="(v) => changePower(track.id, 'slot2', v)"
                  size="small" class="power-select"
                  :class="powerInfo(getPower(track.id,'slot2')).cls">
                  <el-option v-for="opt in catenaryOptions" :key="opt.value"
                    :label="opt.label" :value="opt.value" />
                </el-select>
              </div>
              <div class="slot-trains">
                <div v-for="gid in (localBindings[track.id]?.slot2 || [])" :key="'s2-'+gid"
                  class="train-block" :class="{ 'emu': isEMU(gid) }"
                  draggable="true"
                  @dragstart="onDragStartFromSlot($event, { id: gid }, track.id, 'slot2')"
                  @dragend="onDragEnd">
                  <span class="train-icon">{{ isEMU(gid) ? '🚄' : '🚃' }}</span>
                  <span class="train-name">{{ getGroupName(gid) }}</span>
                  <span class="train-type">{{ getGroupType(gid) }}</span>
                  <button class="train-remove" @click="removeFromSlot(track.id, 'slot2', gid)"
                    title="移除">✕</button>
                </div>
              </div>
              <div v-if="!(localBindings[track.id]?.slot2 || []).length" class="slot-empty">
                拖入车组
              </div>
              <el-popover trigger="click" :width="200" placement="bottom">
                <template #reference>
                  <el-button class="slot-add-btn" :icon="Plus" circle size="small" />
                </template>
                <el-select placeholder="选择车组" size="small" filterable
                  style="width:100%" @change="(v) => addGroupBySelect(track.id, 'slot2', v)" :model-value="null">
                  <el-option v-for="g in unassignedGroups" :key="g.id"
                    :label="(g['车组号'] || g.id) + ' ' + (g['车型'] || '')"
                    :value="g.id" />
                </el-select>
              </el-popover>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="!list.length && !loading" class="yard-empty">
          暂无股道数据，请先在「股道信息」中新增股道
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 整体布局 ========== */
.stock-road-visual { display: flex; flex-direction: column; height: 100%; }
.visual-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 4px; padding: 4px 10px;
  background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px;
  flex-shrink: 0;
}
.header-info { flex: 1; }
.header-row1 { display: flex; align-items: center; gap: 8px; }
.header-title { font-size: 14px; font-weight: 700; color: #78350f; }
.header-badge {
  font-size: 10px; font-weight: 700; color: #d97706;
  background: #fef3c7; border: 1px solid #fde68a;
  padding: 1px 8px; border-radius: 10px;
}
.header-row2 { font-size: 10px; color: #d97706; margin-top: 1px; font-weight: 600; }
.header-row3 { font-size: 10px; color: #92400e; }
.header-changes { font-size: 11px; color: #d97706; font-weight: 600; }
.header-actions { display: flex; gap: 6px; flex-shrink: 0; }
.visual-body {
  display: flex; gap: 8px; flex: 1; min-height: 0; overflow: hidden;
}

/* ========== 左侧车组面板 ========== */
.group-panel {
  width: 220px; min-width: 220px;
  background: #fdf6e9;
  border: 1px solid #e8dcc8;
  border-radius: 8px;
  padding: 8px; overflow-y: auto;
  box-shadow: 0 2px 8px rgba(120,53,15,0.06);
}
.panel-title {
  font-size: 13px; font-weight: 700; color: #78350f;
  margin-bottom: 4px;
}
.panel-count { font-weight: 400; font-size: 11px; color: #a16207; }
.panel-search { margin-bottom: 8px; }
.panel-search :deep(.el-input__wrapper) {
  border-radius: 6px; box-shadow: 0 0 0 1px #e8dcc8;
}
.panel-divider { height: 1px; background: #e8dcc8; margin: 10px 0; }
.panel-empty {
  font-size: 12px; color: #a16207; font-style: italic;
  text-align: center; padding: 10px 0; width: 100%;
}

/* 紧凑 chip flow */
.chip-flow { display: flex; flex-wrap: wrap; gap: 4px; }
.chip-flow.dimmed { opacity: 0.5; }
.mini-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 6px;
  background: #fff;
  border: 1px solid #bbf7d0; border-left: 3px solid #22c55e;
  cursor: grab; user-select: none;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  white-space: nowrap;
}
.mini-chip:active { cursor: grabbing; }
.mini-chip:hover {
  border-color: #86efac; background: #f0fdf4;
  box-shadow: 0 2px 6px rgba(34,197,94,0.15);
}
.mini-chip.is-emu { border-left-color: #16a34a; border-color: #86efac; }
.mini-chip.is-emu:hover { border-color: #4ade80; box-shadow: 0 2px 6px rgba(34,197,94,0.18); }
.mini-chip.dim {
  cursor: default; background: #f5f5f4;
  border-color: #d6d3d1; border-left-color: #a8a29e;
}
.mini-chip.dim:hover { box-shadow: none; background: #f5f5f4; border-color: #d6d3d1; }
.mini-icon { font-size: 12px; }
.mini-name { font-size: 11px; font-weight: 600; color: #292524; }
.mini-chip.dim .mini-name { color: #a8a29e; }

/* ========== 右侧轨道俯视图（显示全部，不滚动） ========== */
.track-yard {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column; gap: 5px;
  padding: 6px;
  background: #fef9f0;
  border: 1px solid #e8dcc8;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(120,53,15,0.04);
}

/* 单行轨道（紧凑布局） */
.track-row {
  display: flex; align-items: stretch; gap: 0;
  min-height: 58px;             /* 容纳顶部接触网示意条 */
  flex-shrink: 0;
  padding-top: 8px;             /* 留出接触网线 + 馈线空间 */
}

/* 股道名称 */
.track-label {
  width: 36px; min-width: 36px;
  display: flex; align-items: center; justify-content: center;
  padding: 1px;
}
.track-name {
  font-size: 11px; font-weight: 700; color: #92400e;
  text-align: center; line-height: 1.1;
}

/* 轨道主体区域 */
.track-body {
  flex: 1; display: flex; align-items: stretch;
  position: relative;
  /* 反向排列：左侧二列位，右侧一列位，与大屏方向一致 */
  flex-direction: row-reverse;
}

/* 列位 drop zone */
.track-slot {
  flex: 2; min-height: 28px;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px dashed #d6c9a8;
  background: #fffdf7;
  transition: all 0.2s;
  display: flex; flex-direction: column; gap: 1px;
  position: relative;
}
.track-slot.drag-over {
  border-color: #f59e0b;
  background: #fffbeb;
  box-shadow: inset 0 0 16px rgba(245,158,11,0.08), 0 0 0 2px rgba(245,158,11,0.1);
}
.track-slot.has-trains {
  border-style: solid;
  border-color: #e8dcc8;
}
.slot-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 4px;
  font-size: 9px; color: #92400e; font-weight: 600;
  letter-spacing: 0.05em;
  padding: 0 2px;
}
.slot-name { flex-shrink: 0; }

/* ========== 接触网拓扑示意（方案 D：SCADA 风格） ========== */
/* 顶部接触网汇流线（每个 slot 顶部一段） */
.catenary-line {
  position: absolute;
  top: -7px; left: 4px; right: 4px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(90deg, #fde68a, #facc15, #fde68a);
  box-shadow: 0 0 6px rgba(250, 204, 21, 0.55);
  pointer-events: none;
  transition: all 0.3s ease;
}
/* 馈线（顶部接触网下垂到列位的竖向引出线） */
.feeder-drop {
  position: absolute;
  top: -6px; left: 50%;
  width: 1.5px; height: 8px;
  background: #facc15;
  transform: translateX(-50%);
  pointer-events: none;
  box-shadow: 0 0 4px rgba(250, 204, 21, 0.5);
  transition: all 0.3s ease;
}
/* 失电态：接触网灰色虚线 + 馈线灰色 */
.track-slot.pw-off .catenary-line {
  background: repeating-linear-gradient(90deg, #94a3b8 0 4px, transparent 4px 7px);
  box-shadow: none;
}
.track-slot.pw-off .feeder-drop {
  background: #94a3b8;
  box-shadow: none;
}
/* 接地态：接触网灰色虚线，馈线带接地符号绿色 */
.track-slot.pw-gnd .catenary-line {
  background: repeating-linear-gradient(90deg, #94a3b8 0 4px, transparent 4px 7px);
  box-shadow: none;
}
.track-slot.pw-gnd .feeder-drop {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
}
/* 故障态：接触网红色闪烁 */
.track-slot.pw-flt .catenary-line {
  background: linear-gradient(90deg, #fca5a5, #ef4444, #fca5a5);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.7);
  animation: catenary-fault 1s ease-in-out infinite;
}
.track-slot.pw-flt .feeder-drop {
  background: #ef4444;
  animation: catenary-fault 1s ease-in-out infinite;
}
@keyframes catenary-fault {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 列位整体色调：根据供电状态微调底色与边框 */
.track-slot.pw-on.has-trains {
  border-color: #fcd34d;
  background: linear-gradient(180deg, #fffbeb 0%, #fffdf7 60%);
}
.track-slot.pw-off {
  filter: grayscale(0.35);
}
.track-slot.pw-off.has-trains {
  border-color: #cbd5e1;
  background: #f8fafc;
}
.track-slot.pw-gnd.has-trains {
  border-color: #86efac;
  background: linear-gradient(180deg, #f0fdf4 0%, #fffdf7 60%);
}
.track-slot.pw-flt.has-trains {
  border-color: #fca5a5;
  background: linear-gradient(180deg, #fef2f2 0%, #fffdf7 60%);
}

/* 供电状态下拉选择 */
.power-select { width: 90px; }
.power-select :deep(.el-input__wrapper) {
  border-radius: 7px; padding: 0 4px; height: 18px;
  font-size: 9px; font-weight: 700;
  box-shadow: 0 0 4px rgba(0,0,0,0.06);
  transition: all 0.2s ease;
}
.power-select :deep(.el-input__inner) { font-size: 9px; font-weight: 700; }
/* 有电：红色 */
.power-select.pw-on :deep(.el-input__wrapper) {
  background: linear-gradient(180deg, #fef9c3, #fde68a);
  border-color: #dc2626;
  box-shadow: 0 0 6px rgba(220, 38, 38, 0.4);
}
.power-select.pw-on :deep(.el-input__inner) { color: #92400e; }
/* 失电：灰色 */
.power-select.pw-off :deep(.el-input__wrapper) {
  background: linear-gradient(180deg, #f1f5f9, #e2e8f0);
  border-color: #94a3b8;
}
.power-select.pw-off :deep(.el-input__inner) { color: #475569; }
/* 接地：青绿色 */
.power-select.pw-gnd :deep(.el-input__wrapper) {
  background: linear-gradient(180deg, #dcfce7, #bbf7d0);
  border-color: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}
.power-select.pw-gnd :deep(.el-input__inner) { color: #166534; }
/* 故障：黄色 */
.power-select.pw-flt :deep(.el-input__wrapper) {
  background: linear-gradient(180deg, #fef3c7, #fde68a);
  border-color: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}
.power-select.pw-flt :deep(.el-input__inner) { color: #92400e; }
/* 无接触网 */
.power-select.pw-none :deep(.el-input__wrapper) {
  background: #f5f5f4; border-color: #d6d3d1;
}
.power-select.pw-none :deep(.el-input__inner) { color: #a8a29e; }
/* 列位无接触网时整体淡化 */
.track-slot.pw-none { filter: grayscale(0.2); opacity: 0.85; }

/* 接触网中段（rail-center 内）：分段开关示意 */
.catenary-section {
  position: absolute;
  top: -7px; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, #facc15, #fde68a 50%, #facc15);
  box-shadow: 0 0 6px rgba(250, 204, 21, 0.5);
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.section-switch {
  position: absolute;
  top: -13px; left: 50%;
  transform: translateX(-50%);
  font-size: 10px; line-height: 1;
  color: #a16207;
  background: #fffbeb;
  padding: 1px 2px;
  border-radius: 2px;
  border: 1px solid #fcd34d;
  pointer-events: auto;
  cursor: help;
}

/* 轨道连接区域 */
.rail-center {
  width: 60px; min-width: 60px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 0; padding: 2px 0;
  position: relative;             /* 锚定 .catenary-section / .section-switch */
}
.rail-lines-v {
  display: flex; flex-direction: column; justify-content: center;
  gap: 3px; flex: 1; width: 100%;
}
.rail {
  height: 2px; border-radius: 1px;
  background: linear-gradient(90deg, #d6c9a8 0%, #c4b393 50%, #d6c9a8 100%);
}
.link-btn {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1.5px solid #d6c9a8; background: #fff;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; flex-shrink: 0;
  color: #a8a29e;
}
.link-btn:hover { border-color: #f59e0b; color: #f59e0b; background: #fffbeb; }
.link-btn.linked {
  border-color: #22c55e; color: #22c55e; background: #f0fdf4;
}
.link-btn.linked:hover { border-color: #16a34a; color: #16a34a; }

/* 列位中的车组 */
.slot-trains { display: flex; flex-wrap: wrap; gap: 2px; }
.train-block {
  display: flex; align-items: center; gap: 2px;
  padding: 1px 6px; border-radius: 4px;
  background: #fff;
  border: 1px solid #fbbf24;
  cursor: grab; user-select: none;
  transition: all 0.15s;
  position: relative;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.train-block:hover {
  border-color: #f59e0b;
  box-shadow: 0 2px 8px rgba(245,158,11,0.15);
}
.train-block.emu {
  border-color: #86efac;
  background: #f0fdf4;
}
.train-block.emu:hover {
  border-color: #22c55e;
  box-shadow: 0 2px 8px rgba(34,197,94,0.15);
}
.train-icon { font-size: 10px; }
.train-name { font-size: 10px; font-weight: 600; color: #78350f; }
.train-type { font-size: 8px; color: #a16207; }
.train-remove {
  width: 16px; height: 16px; border-radius: 50%;
  border: none; background: #fee2e2;
  color: #ef4444; font-size: 10px; line-height: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s;
  margin-left: 2px;
}
.train-block:hover .train-remove { opacity: 1; }
.train-remove:hover { background: #fca5a5; color: #dc2626; }

.slot-empty {
  font-size: 10px; color: #a16207; font-style: italic;
  text-align: center; padding: 2px 0;
}

.yard-empty {
  text-align: center; color: #a16207; padding: 60px 0;
  font-size: 14px;
}

/* 加号按钮 */
.slot-add-btn {
  position: absolute; right: 1px; top: 1px;
  width: 16px !important; height: 16px !important;
  font-size: 8px;
}

/* mt辅助 */
.mt-3 { margin-top: 12px; }
</style>
