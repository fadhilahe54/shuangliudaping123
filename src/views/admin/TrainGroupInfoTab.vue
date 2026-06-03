<!--
  车组编组管理组件（可视化拖拽：车组-车辆关联，20槽位长条形卡片）
  功能：左侧紧凑chip面板+搜索，右侧20槽位长条形卡片，拖拽车辆到指定槽位完成编组
  每个槽位对应车辆序号1~20，支持一键反转、不连续编号等真实场景
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import TrainGroupSlotCell from '../../components/admin/TrainGroupSlotCell.vue'
import {
  getAllTrainGroupsInfo, getAllTrains,
  saveTrainGroupRelation, deleteTrainGroupRelation,
  saveTrain, batchSaveTrainGroupBindings,
} from '../../api/dispatchApi.js'
import { useDragAutoScroll } from '../../composables/useDragAutoScroll.js'
import { logOperation } from '../../api/log.js'

const SLOT_COUNT = 20

/* ========== 响应式数据 ========== */
const list = ref([])
const trainList = ref([])
const loading = ref(false)
const allSaving = ref(false)
const dragData = ref(null)
const dragOverTarget = ref(null)   // { groupId, slot } | null
const hasChanges = ref(false)

/* ========== 搜索过滤（左侧面板） ========== */
const searchTrain = ref('')

/* ========== 定位搜索（顶部：车号/车组号/车型 → 滚动定位+颜色标记）========== */
const locateKeyword = ref('')                      // 用户输入的定位关键字
const highlightGroupIds = ref(new Set())           // 当前高亮的车组id集合
const highlightTrainIds = ref(new Set())           // 当前高亮的车辆id集合
const groupBarRefs = {}                            // 车组 id → DOM 元素
let _highlightTimer = null                         // 高亮自动清除定时器

/** 注册/移除车组条的 DOM 引用，用于滚动定位 */
const registerGroupBar = (groupId, el) => {
  if (el) groupBarRefs[groupId] = el
  else delete groupBarRefs[groupId]
}

/** 清除高亮 */
const clearHighlight = () => {
  highlightGroupIds.value = new Set()
  highlightTrainIds.value = new Set()
  if (_highlightTimer) { clearTimeout(_highlightTimer); _highlightTimer = null }
}

/** 定位搜索：匹配车组/车辆 → 滚动到第一个命中的车组卡片，并高亮所有命中项 */
const handleLocate = () => {
  const kw = locateKeyword.value.trim().toLowerCase()
  clearHighlight()
  if (!kw) {
    ElMessage.info('请输入要搜索的车号 / 车组号 / 车型')
    return
  }

  const matchedGroupIds = new Set()
  const matchedTrainIds = new Set()

  // 1、匹配车组（车组号 / 车型）
  list.value.forEach(g => {
    const 车组号 = String(g['车组号'] || '').toLowerCase()
    const 车型 = String(g['车型'] || '').toLowerCase()
    if (车组号.includes(kw) || 车型.includes(kw)) {
      matchedGroupIds.add(g.id)
    }
  })

  // 2、匹配车辆（车号 / 车型 / 车种）——同时记录其所在车组，方便滚动定位
  const 命中车辆ids = new Set()
  trainList.value.forEach(t => {
    const 车号 = String(t['车号'] || '').toLowerCase()
    const 车型 = String(t['车型'] || '').toLowerCase()
    const 车种 = String(t['车种'] || '').toLowerCase()
    if (车号.includes(kw) || 车型.includes(kw) || 车种.includes(kw)) {
      命中车辆ids.add(t.id)
    }
  })
  if (命中车辆ids.size) {
    // 从本地绑定中反查车组id，使卡片和槽位都受影响
    Object.entries(localBindings).forEach(([groupId, slots]) => {
      if (!slots) return
      for (let i = 1; i <= SLOT_COUNT; i++) {
        const tid = slots[i]
        if (tid != null && 命中车辆ids.has(tid)) {
          matchedTrainIds.add(tid)
          matchedGroupIds.add(Number(groupId))
        }
      }
    })
    // 未被编组的命中车辆也高亮（虽然不在右侧，但保留在集合中）
    命中车辆ids.forEach(id => matchedTrainIds.add(id))
  }

  if (!matchedGroupIds.size && !matchedTrainIds.size) {
    ElMessage.warning(`未找到包含“${locateKeyword.value}”的车组或车辆`)
    return
  }

  highlightGroupIds.value = matchedGroupIds
  highlightTrainIds.value = matchedTrainIds

  // 3、滚动到第一个命中的车组（按 list 顺序取第一个）
  const 首个命中 = list.value.find(g => matchedGroupIds.has(g.id))
  if (首个命中) {
    const el = groupBarRefs[首个命中.id]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  ElMessage.success(`命中 ${matchedGroupIds.size} 个车组、${matchedTrainIds.size} 辆车辆`)

  // 4、6秒后自动清除高亮
  if (_highlightTimer) clearTimeout(_highlightTimer)
  _highlightTimer = setTimeout(() => {
    clearHighlight()
  }, 6000)
}
/** 点击已分配车辆 → 定位到右侧对应车组卡片并高亮 */
const locateTrainById = (trainId) => {
  clearHighlight()
  const matchedGroupIds = new Set()
  const matchedTrainIds = new Set([trainId])

  // 从本地绑定中反查车辆所在的车组
  Object.entries(localBindings).forEach(([groupId, slots]) => {
    if (!slots) return
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (slots[i] === trainId) {
        matchedGroupIds.add(Number(groupId))
        break
      }
    }
  })

  if (!matchedGroupIds.size) return

  highlightGroupIds.value = matchedGroupIds
  highlightTrainIds.value = matchedTrainIds

  // 滚动到第一个命中的车组
  const firstGroupId = [...matchedGroupIds][0]
  const el = groupBarRefs[firstGroupId]
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // 6秒后自动清除高亮
  if (_highlightTimer) clearTimeout(_highlightTimer)
  _highlightTimer = setTimeout(() => clearHighlight(), 6000)
}

const filteredTrains = computed(() => {
  const kw = searchTrain.value.trim().toLowerCase()
  if (!kw) return trainList.value
  return trainList.value.filter(t =>
    (t['车号'] || '').toLowerCase().includes(kw) ||
    (t['车型'] || '').toLowerCase().includes(kw) ||
    (t['车种'] || '').toLowerCase().includes(kw)
  )
})
const filteredUnassignedTrains = computed(() => filteredTrains.value.filter(t => !assignedTrainIds.value.has(t.id)))
const filteredAssignedTrains = computed(() => filteredTrains.value.filter(t => assignedTrainIds.value.has(t.id)))

/* ========== 右侧自动滚动 ========== */
const slotAreaRef = ref(null)
const { onDragOverScroll, stopAutoScroll } = useDragAutoScroll()

/* ========== 本地编辑态 ========== */
// { [车组id]: { 1: vehicleId|null, 2: vehicleId|null, ..., 20: null } }
const localBindings = reactive({})

/** 创建空的20槽位对象 */
const createEmptySlots = () => {
  const slots = {}
  for (let i = 1; i <= SLOT_COUNT; i++) slots[i] = null
  return slots
}

/** 序列化某个车组的编组状态（用于 diff） */
const serializeBinding = (slots) => {
  if (!slots) return ''
  const arr = []
  for (let i = 1; i <= SLOT_COUNT; i++) arr.push(slots[i] == null ? '' : slots[i])
  return arr.join(',')
}

/** 保存初始编组快照，用于 saveAll 时对比，只记录变更的车组 */
const bindingSnapshot = reactive({})

const initBindings = () => {
  list.value.forEach(g => {
    const slots = createEmptySlots()
    const vehicles = g['车辆信息List'] || []
    // 车辆序号直接对应槽位号（序号15 → 第15槽位）
    const unplaced = []
    vehicles.forEach(v => {
      const seq = v['车辆序号']
      if (seq != null && seq >= 1 && seq <= SLOT_COUNT) {
        slots[seq] = v.id
      } else {
        unplaced.push(v.id)
      }
    })
    // 无序号的车辆填入剩余空位
    let nextSlot = 1
    for (const vid of unplaced) {
      while (nextSlot <= SLOT_COUNT && slots[nextSlot] !== null) nextSlot++
      if (nextSlot <= SLOT_COUNT) { slots[nextSlot] = vid; nextSlot++ }
    }
    localBindings[g.id] = slots
  })
  // 重置 diff 快照
  Object.keys(bindingSnapshot).forEach(key => { delete bindingSnapshot[key] })
  list.value.forEach(g => {
    bindingSnapshot[g.id] = serializeBinding(localBindings[g.id])
  })
  hasChanges.value = false
}

/** 已分配的车辆id集合 */
const assignedTrainIds = computed(() => {
  const ids = new Set()
  Object.values(localBindings).forEach(slots => {
    if (!slots) return
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (slots[i] != null) ids.add(slots[i])
    }
  })
  return ids
})

/** 车辆信息索引表，避免模板里频繁 find */
const trainInfoMap = computed(() => {
  const map = new Map()
  trainList.value.forEach(t => map.set(t.id, t))
  return map
})

/** 未分配车辆列表 */
const unassignedTrains = computed(() => trainList.value.filter(t => !assignedTrainIds.value.has(t.id)))

/** 预计算各车组已占用槽位数量，避免模板内重复循环 */
const occupiedCountMap = computed(() => {
  const result = {}
  Object.entries(localBindings).forEach(([groupId, slots]) => {
    let c = 0
    if (slots) {
      for (let i = 1; i <= SLOT_COUNT; i++) {
        if (slots[i] != null) c++
      }
    }
    result[groupId] = c
  })
  return result
})

const getTrainInfo = (tid) => trainInfoMap.value.get(tid)
const getTrainName = (tid) => { const t = getTrainInfo(tid); return t ? (t['车号'] || tid) : tid }
const getTrainType = (tid) => { const t = getTrainInfo(tid); return t ? (t['车型'] || '') : '' }
const getTrainKind = (tid) => { const t = getTrainInfo(tid); return t ? (t['车种'] || '') : '' }
const getTrainKindLabel = (tid) => getTrainKind(tid) || getTrainType(tid)

/** 获取车号简称（最后一段） */
const getTrainShortName = (tid) => {
  const name = String(getTrainName(tid))
  const parts = name.split('-')
  return parts.length > 2 ? parts.slice(-2).join('-') : (parts.length > 1 ? parts[parts.length - 1] : name)
}

/* ========== 数据加载 ========== */
const loadData = async () => {
  loading.value = true
  try {
    const [groupData, trainData] = await Promise.all([getAllTrainGroupsInfo(), getAllTrains()])
    list.value = (Array.isArray(groupData) ? [...groupData] : (groupData ? [groupData] : [])).sort((a, b) => a.id - b.id)
    trainList.value = Array.isArray(trainData) ? [...trainData] : (trainData ? [trainData] : [])
    initBindings()
  } catch (e) { console.error(e) }
  loading.value = false
}

/* ========== 拖拽 ========== */
const onDragStart = (e, train) => {
  dragData.value = { id: train.id }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(train.id))
}
const onDragStartFromSlot = (e, tid, groupId, slot) => {
  dragData.value = { id: tid, fromGroupId: groupId, fromSlot: slot }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(tid))
}
const onDragEnterSlot = (groupId, slot) => {
  const current = dragOverTarget.value
  if (current && current.groupId === groupId && current.slot === slot) return
  dragOverTarget.value = { groupId, slot }
}
const onDragOverSlot = (e, groupId, slot) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}
const onDragLeaveSlot = (e, groupId, slot) => {
  const t = dragOverTarget.value
  if (t && t.groupId === groupId && t.slot === slot) dragOverTarget.value = null
}
const onDropSlot = (e, groupId, slot) => {
  e.preventDefault()
  dragOverTarget.value = null
  if (!dragData.value) return
  const tid = dragData.value.id
  const slots = localBindings[groupId]
  if (!slots) return

  // 目标槽位已被其他车辆占用 → 拒绝
  if (slots[slot] != null && slots[slot] !== tid) {
    ElMessage.warning(`槽位 ${slot} 已被占用，请先移除该位置的车辆`)
    dragData.value = null
    return
  }

  // 从来源槽位移除
  if (dragData.value.fromGroupId != null && dragData.value.fromSlot != null) {
    const fromSlots = localBindings[dragData.value.fromGroupId]
    if (fromSlots && fromSlots[dragData.value.fromSlot] === tid) {
      fromSlots[dragData.value.fromSlot] = null
    }
  }

  // 放入目标槽位
  if (slots[slot] !== tid) {
    slots[slot] = tid
    hasChanges.value = true
  }
  dragData.value = null
}
const onDragEnd = () => { dragData.value = null; dragOverTarget.value = null; stopAutoScroll() }

const removeFromSlot = (groupId, slot) => {
  const slots = localBindings[groupId]
  if (!slots || slots[slot] == null) return
  slots[slot] = null
  hasChanges.value = true
}

/** 判断槽位是否处于拖拽悬停态 */
const isSlotDragOver = (groupId, slot) => {
  const t = dragOverTarget.value
  return t && t.groupId === groupId && t.slot === slot
}

/* ========== 一键反转 ========== */
const reverseGroup = (groupId) => {
  const slots = localBindings[groupId]
  if (!slots) return
  const occupied = []
  for (let i = 1; i <= SLOT_COUNT; i++) {
    if (slots[i] != null) occupied.push({ slot: i, vid: slots[i] })
  }
  if (occupied.length < 2) return
  const vids = occupied.map(o => o.vid).reverse()
  occupied.forEach((o, idx) => { slots[o.slot] = vids[idx] })
  hasChanges.value = true
  const group = list.value.find(item => item.id === groupId)
  logOperation('反转车组编组', `反转:${group?.['车组号'] || groupId}车组编组顺序`)
  ElMessage.success('编组顺序已反转')
}

/* ========== 下拉选择备用方案 ========== */
const addTrainBySelect = (groupId, tid) => {
  if (!tid) return
  const slots = localBindings[groupId]
  if (!slots) return
  for (let i = 1; i <= SLOT_COUNT; i++) {
    if (slots[i] === null) {
      slots[i] = tid
      hasChanges.value = true
      return
    }
  }
  ElMessage.warning('所有槽位已满')
}

/* ========== 保存 ========== */
const saveAll = async () => {
  allSaving.value = true
  try {
    // 计算变更：对比保存前的本地编组与上一次快照，只记录变更的车组
    const changedGroups = list.value.filter(g => {
      return serializeBinding(localBindings[g.id]) !== (bindingSnapshot[g.id] || '')
    })

    // 构建批量保存请求体：每个车组的槽位绑定列表
    const batchList = list.value.map(group => {
      const slots = localBindings[group.id] || {}
      const bindings = []
      for (let i = 1; i <= SLOT_COUNT; i++) {
        const tid = slots[i]
        if (tid != null) {
          bindings.push({ 车辆id: tid, 序号: i })
        }
      }
      return { 车组id: group.id, bindings }
    })

    // 一次请求完成所有车组的关联更新 + 车辆序号更新
    await batchSaveTrainGroupBindings(batchList)

    // 被移除的车辆，车辆序号置null（批量接口已处理在绑车辆的序号，这里处理被解绑的）
    const newAssigned = new Set()
    batchList.forEach(item => item.bindings.forEach(b => newAssigned.add(b.车辆id)))
    const oldAssigned = new Set()
    list.value.forEach(g => {
      ;(g['车辆信息List'] || []).forEach(v => oldAssigned.add(v.id))
    })
    // 并发清除被解绑车辆的序号
    const clearPromises = []
    oldAssigned.forEach(vid => {
      if (!newAssigned.has(vid)) {
        const train = trainList.value.find(t => t.id === vid)
        if (train && train['车辆序号'] != null) {
          clearPromises.push(saveTrain({ ...train, 车辆序号: null }))
        }
      }
    })
    if (clearPromises.length > 0) await Promise.all(clearPromises)

    // 重新加载
    const [groupData, trainData] = await Promise.all([getAllTrainGroupsInfo(), getAllTrains()])
    list.value = (Array.isArray(groupData) ? [...groupData] : (groupData ? [groupData] : [])).sort((a, b) => a.id - b.id)
    trainList.value = Array.isArray(trainData) ? [...trainData] : (trainData ? [trainData] : [])
    initBindings()
    if (changedGroups.length > 0) {
      const changedNames = changedGroups.map(group => group['车组号'] || group.id).join('、')
      logOperation('保存车组编组', `保存车组编组(${changedGroups.length}个):${changedNames}`)
    } else {
      logOperation('保存车组编组', '保存车组编组(无变更)')
    }
    ElMessage.success('车组编组保存成功')
  } catch (e) { console.error(e); ElMessage.error('保存失败') }
  allSaving.value = false
}

const resetBindings = () => { initBindings(); ElMessage.info('已重置为服务器状态') }

defineExpose({ loadData })
</script>

<template>
  <div class="drag-layout" v-loading="loading">
    <!-- 顶部 -->
    <div class="drag-header">
      <div>
        <div class="text-base font-bold" style="color:#78350f">车组编组管理</div>
        <div class="text-xs" style="color:#92400e">
          拖拽左侧车辆到右侧槽位中，每个槽位对应车辆序号（1~20）
          <span v-if="hasChanges" style="color:#d97706" class="ml-2">● 有未保存的更改</span>
        </div>
      </div>
      <div class="flex gap-2 items-center">
        <!-- 定位搜索：输入车号/车组号/车型 → 自动滚动+高亮 -->
        <el-input
          v-model="locateKeyword"
          placeholder="定位车号/车组号/车型"
          clearable
          size="default"
          style="width: 240px"
          @keyup.enter="handleLocate"
          @clear="clearHighlight"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="handleLocate">
          <el-icon class="mr-1"><Search /></el-icon>定位
        </el-button>
        <el-button v-if="hasChanges" @click="resetBindings" size="default">
          <el-icon class="mr-1"><RefreshLeft /></el-icon>重置
        </el-button>
        <el-button type="success" :loading="allSaving" @click="saveAll" size="default" :disabled="!hasChanges">
          <el-icon class="mr-1"><Check /></el-icon>保存全部
        </el-button>
      </div>
    </div>

    <div class="drag-body">
      <!-- 左侧：车辆紧凑面板 -->
      <div class="item-panel">
        <div class="panel-title">🚋 车辆列表 <span class="panel-count">({{ filteredTrains.length }})</span></div>
        <el-input v-model="searchTrain" placeholder="搜索车号/车型..." size="small" clearable class="panel-search" />
        <div class="panel-section-title">
          未分配 <span class="panel-count">({{ filteredUnassignedTrains.length }})</span>
        </div>
        <div class="chip-flow">
          <div v-for="t in filteredUnassignedTrains" :key="t.id"
            class="mini-chip train-chip"
            draggable="true"
            @dragstart="onDragStart($event, t)"
            @dragend="onDragEnd"
            :title="(t['车号'] || t.id) + ' ' + (t['车种'] || t['车型'] || '')">
            <span class="mini-name">{{ t['车号'] || t.id }}</span>
            <span class="mini-sub" v-if="t['车种'] || t['车型']">{{ t['车种'] || t['车型'] }}</span>
          </div>
          <div v-if="!filteredUnassignedTrains.length" class="panel-empty">{{ searchTrain ? '无匹配未分配车辆' : '暂无未分配车辆' }}</div>
        </div>
        <div class="panel-divider"></div>
        <div class="panel-section-title">
          已分配 <span class="panel-count">({{ filteredAssignedTrains.length }})</span>
        </div>
        <div class="chip-flow">
          <div v-for="t in filteredAssignedTrains" :key="'assigned-' + t.id"
            class="mini-chip train-chip-assigned"
            style="cursor:pointer"
            :title="(t['车号'] || t.id) + ' ' + (t['车种'] || t['车型'] || '') + '（点击定位）'"
            @click="locateTrainById(t.id)">
            <span class="mini-name">{{ t['车号'] || t.id }}</span>
            <span class="mini-sub" v-if="t['车种'] || t['车型']">{{ t['车种'] || t['车型'] }}</span>
          </div>
          <div v-if="!filteredAssignedTrains.length" class="panel-empty">{{ searchTrain ? '无匹配已分配车辆' : '暂无已分配车辆' }}</div>
        </div>
      </div>

      <!-- 右侧：20槽位长条形卡片（纵向列表） -->
      <div ref="slotAreaRef" class="slot-area"
        @dragover="onDragOverScroll($event, slotAreaRef)">
        <div v-for="group in list" :key="group.id"
          class="slot-bar"
          :class="{ 'slot-bar-highlight': highlightGroupIds.has(group.id) }"
          :ref="el => registerGroupBar(group.id, el)">
          <!-- 车组头部 -->
          <div class="bar-head">
            <div class="flex items-center gap-2">
              <span class="dot" style="background:#f59e0b;box-shadow:0 0 6px rgba(245,158,11,0.4)"></span>
              <span class="bar-title">{{ group['车组号'] || '(未命名)' }}</span>
              <span class="bar-model">{{ group['车型'] || '' }}</span>
              <el-tag :type="(occupiedCountMap[group.id] || 0) ? 'warning' : 'info'" size="small" effect="dark">
                {{ occupiedCountMap[group.id] || 0 }}/{{ group['编组'] || '?' }} 辆
              </el-tag>
            </div>
            <div class="flex items-center gap-2">
              <el-button size="small" @click="reverseGroup(group.id)"
                :disabled="(occupiedCountMap[group.id] || 0) < 2" title="一键反转编组顺序">
                🔄 反转
              </el-button>
              <el-select placeholder="选择添加" size="small" filterable
                class="bar-select" @change="(v) => addTrainBySelect(group.id, v)" :model-value="null">
                <el-option v-for="t in unassignedTrains" :key="t.id"
                  :label="(t['车号'] || t.id) + (t['车种'] ? ' · ' + t['车种'] : '')"
                  :value="t.id" />
              </el-select>
            </div>
          </div>
          <!-- 20槽位横向排列 -->
          <div class="bar-slots">
            <TrainGroupSlotCell
              v-for="slot in SLOT_COUNT"
              :key="slot"
              :slot="slot"
              :group-id="group.id"
              :train-id="localBindings[group.id] ? localBindings[group.id][slot] : null"
              :drag-over="isSlotDragOver(group.id, slot)"
              :highlight="localBindings[group.id] && localBindings[group.id][slot] != null && highlightTrainIds.has(localBindings[group.id][slot])"
              :train-name="localBindings[group.id] && localBindings[group.id][slot] != null ? getTrainName(localBindings[group.id][slot]) : ''"
              :train-short-name="localBindings[group.id] && localBindings[group.id][slot] != null ? getTrainShortName(localBindings[group.id][slot]) : ''"
              :train-kind-label="localBindings[group.id] && localBindings[group.id][slot] != null ? getTrainKindLabel(localBindings[group.id][slot]) : ''"
              @drag-enter="onDragEnterSlot"
              @drag-over="onDragOverSlot"
              @drag-leave="onDragLeaveSlot"
              @drop="onDropSlot"
              @drag-start-from-slot="onDragStartFromSlot"
              @drag-end="onDragEnd"
              @remove="removeFromSlot"
            />
          </div>
        </div>
        <div v-if="!list.length && !loading" class="area-empty">
          暂无车组数据，请先在「车组管理」中新增车组
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 车组编组拖拽页面整体布局 ========== */
/* 页面采用上方操作栏 + 下方左右两栏：左侧车辆池，右侧 20 槽位车组编组卡片 */
.drag-layout { display: flex; flex-direction: column; height: 100%; }

/* 顶部工具栏：包含搜索、保存、反转等编组操作，使用暖色卡片背景统一后台风格 */
.drag-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding: 10px 14px;
  background: linear-gradient(90deg, #fdf9e9 0%, #fef9f0 100%);
  border: 1px solid #f1e5c4;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(146, 64, 14, 0.04);
}
/* 顶部定位搜索输入框：聚焦金色高亮，贴合暖色系风格 */
.drag-header :deep(.el-input__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #f1e5c4;
  transition: box-shadow 0.2s;
}
.drag-header :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #fbbf24;
}
.drag-header :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #d97706;
}
/* 主体容器：左侧车辆列表固定宽度，右侧编组区域自适应并内部滚动 */
.drag-body { display: flex; gap: 16px; flex: 1; min-height: 0; overflow: hidden; }

/* ===== 左侧面板 ===== */
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
.panel-section-title { font-size: 12px; font-weight: 700; color: #92400e; margin-bottom: 6px; }
.panel-divider { height: 1px; background: #e8dcc8; margin: 10px 0; }
.panel-empty { font-size: 12px; color: #a16207; font-style: italic; text-align: center; padding: 10px 0; width: 100%; }

/* 紧凑 chip flow */
.chip-flow { display: flex; flex-wrap: wrap; gap: 4px; }
.mini-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 7px; border-radius: 6px;
  background: #fff; user-select: none; transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  white-space: nowrap; max-width: 100%;
}
.train-chip {
  border: 1px solid #bbf7d0; border-left: 3px solid #22c55e;
  cursor: grab;
  /* mobile-drag-drop polyfill 要求触摸屏 draggable 禁用默认手势 */
  touch-action: none;
  -webkit-user-drag: element;
}
.train-chip:hover { border-color: #86efac; background: #f0fdf4; box-shadow: 0 2px 6px rgba(34,197,94,0.15); }
.train-chip:active { cursor: grabbing; }
.train-chip-assigned {
  border: 1px solid #d6d3d1; border-left: 3px solid #a8a29e;
  cursor: default; opacity: 0.55;
}
.mini-name { font-size: 11px; font-weight: 600; color: #292524; }
.mini-sub { font-size: 9px; color: #78716c; }
.train-chip-assigned .mini-name { color: #a8a29e; }

/* ===== 右侧：20槽位长条形卡片列表 ===== */
.slot-area {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 8px; padding: 4px; align-content: start;
}

/* 长条形车组卡片 */
.slot-bar {
  background: #fef9f0; border: 1px solid #e8dcc8;
  border-radius: 8px; padding: 6px 10px;
  display: flex; flex-direction: column; gap: 4px;
  box-shadow: 0 1px 4px rgba(120,53,15,0.04);
  flex-shrink: 0;
  transition: all 0.3s ease;
}
/* 搜索命中车组：整条卡片绿色高亮 + 脉动 */
.slot-bar.slot-bar-highlight {
  background: #f0fdf4;
  border-color: #22c55e;
  box-shadow: 0 0 0 3px rgba(34,197,94,0.3), 0 4px 12px rgba(34,197,94,0.15);
  animation: bar-pulse 1.6s ease-in-out infinite;
}
@keyframes bar-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.3), 0 4px 12px rgba(34,197,94,0.15); }
  50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0.15), 0 4px 20px rgba(34,197,94,0.08); }
}
.bar-head {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 6px;
}
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.bar-title { font-size: 13px; font-weight: 700; color: #92400e; }
.bar-model { font-size: 11px; color: #a16207; }
.bar-select { width: 160px; }
.bar-select :deep(.el-input__wrapper) {
  border-radius: 6px; box-shadow: 0 0 0 1px #fbbf24;
}

/* 20槽位横向排列 */
.bar-slots {
  display: flex; gap: 2px;
  overflow-x: auto; padding: 2px 0;
}
.bar-slots::-webkit-scrollbar { height: 5px; }
.bar-slots::-webkit-scrollbar-thumb { background: #d6c9a8; border-radius: 3px; }
.bar-slots::-webkit-scrollbar-track { background: transparent; }

.area-empty { text-align: center; color: #a16207; padding: 60px 0; font-size: 13px; }
</style>
