/**
 * useSlotAnimQueue — 列位级开进/开出动画编排器
 *
 * 设计目标：
 *   1. 把后台股道编组变更 diff 转换为列位级动画任务；
 *   2. 严格按物理约束串行执行：同一股道先一列位、后二列位；
 *   3. 出库：先播旧场景动画，再拉取新数据重建；
 *   4. 进库：先拉取新数据重建新车组对象，再把目标列位临时放到场外并播放进库；
 *   5. 换车：先出库旧车组，重建为新车组，再进库。
 */
import { computed, nextTick, ref } from 'vue'
import { useTrainStore } from '../stores/trainStore.js'

const SLOT_KEYS = ['pos1', 'pos2']
const FINAL_STATES = new Set(['parked', 'out'])

function normalizeSlotKey(slotKey) {
  if (slotKey === 'slot1' || slotKey === '一列位' || slotKey === 1 || slotKey === '1') return 'pos1'
  if (slotKey === 'slot2' || slotKey === '二列位' || slotKey === 2 || slotKey === '2') return 'pos2'
  return slotKey
}

function firstGroupId(groups = []) {
  const g = groups[0]
  if (!g) return ''
  return String(g.id || g.车组号 || g.车次 || '').trim()
}

function groupChanged(oldGroups = [], newGroups = []) {
  const oldId = firstGroupId(oldGroups)
  const newId = firstGroupId(newGroups)
  if (!oldId && !newId) return null
  if (oldId && !newId) return 'depart'
  if (!oldId && newId) return 'enter'
  return oldId === newId ? null : 'replace'
}

/**
 * 通知 useThreeScene：接下来这些列位是“准备开进”的列位。
 * useThreeScene 会在场景重建后、首帧渲染前把对应 slotGroup 放到远端，
 * 避免新车组先在原停放位闪一下，然后再开进。
 */
function notifyPendingEnterSlots(slots, suppressMs = 20000) {
  if (!Array.isArray(slots) || slots.length === 0) return
  window.dispatchEvent(new CustomEvent('pzh-slot-anim-pending-enter', {
    detail: { slots, suppressMs },
  }))
}

/**
 * 通知 useThreeScene：仅增量重建指定股道的 3D 模型（不整体 rebuild）。
 */
function notifyRebuildTracks(trackIds) {
  if (!Array.isArray(trackIds) || trackIds.length === 0) return
  window.dispatchEvent(new CustomEvent('pzh-slot-rebuild-tracks', {
    detail: { trackIds },
  }))
}

export function useSlotAnimQueue() {
  const store = useTrainStore()
  const queue = ref([])
  const running = ref(false)
  let drainTimer = null

  const busy = computed(() => running.value || queue.value.length > 0)

  function resolveTrackId(trackLike) {
    if (trackLike === undefined || trackLike === null) return null
    const all = [...(store.mainTrackConfig || []), ...(store.sidingTrackConfig || [])]
    const direct = all.find(t => String(t.id) === String(trackLike))
    if (direct) return direct.id
    const byDbId = all.find(t => String(t.dbId) === String(trackLike))
    return byDbId ? byDbId.id : trackLike
  }

  function assertPhysicalConstraint(trackId, slotKey, action) {
    // 用户已确认取消物理约束：二列位开进/开出不再要求一列位为空。
    // 保留该函数作为统一入口，后续如果需要恢复约束只需在此处调整。
    return true
  }

  function waitSlotFinal(trackId, slotKey, timeoutMs = 15000) {
    const started = Date.now()
    return new Promise((resolve) => {
      const timer = window.setInterval(() => {
        const state = store.slotStates?.[trackId]?.[slotKey]
        if (FINAL_STATES.has(state) || Date.now() - started > timeoutMs) {
          window.clearInterval(timer)
          resolve(state)
        }
      }, 80)
    })
  }

  async function runDepart(trackId, slotKey) {
    if (!assertPhysicalConstraint(trackId, slotKey, 'depart')) return false
    const accepted = store.slotDepart(trackId, slotKey)
    if (!accepted) return false
    await waitSlotFinal(trackId, slotKey)
    return true
  }

  async function runEnter(trackId, slotKey) {
    if (!assertPhysicalConstraint(trackId, slotKey, 'enter')) return false
    // 进库前场景已重建为新车组，先把状态临时置为 out，避免 watcher 把 parked 当静态车处理。
    store.setSlotState(trackId, slotKey, 'out')
    await new Promise(resolve => window.setTimeout(resolve, 80))
    const accepted = store.slotEnter(trackId, slotKey)
    if (!accepted) return false
    await waitSlotFinal(trackId, slotKey)
    return true
  }

  function normalizeTask(task) {
    const trackId = resolveTrackId(task.trackId ?? task.dbId ?? task.stockRoadId)
    const slotKey = normalizeSlotKey(task.slotKey ?? task.slot ?? task.position)
    if (trackId === null || trackId === undefined || trackId === '' || !SLOT_KEYS.includes(slotKey)) return null
    return { ...task, trackId, slotKey, type: task.type || task.action }
  }

  async function runTask(task) {
    const normalized = normalizeTask(task)
    if (!normalized) return false
    const { trackId, slotKey, type } = normalized

    if (type === 'depart') {
      const ok = await runDepart(trackId, slotKey)
      await store.loadStockRoadData(true, { suppressRebuild: true })
      notifyRebuildTracks([trackId])
      return ok
    }

    if (type === 'enter') {
      notifyPendingEnterSlots([{ trackId, slotKey }])
      await store.loadStockRoadData(true, { suppressRebuild: true })
      notifyRebuildTracks([trackId])
      await nextTick()
      return await runEnter(trackId, slotKey)
    }

    if (type === 'replace') {
      await runDepart(trackId, slotKey)
      notifyPendingEnterSlots([{ trackId, slotKey }])
      await store.loadStockRoadData(true, { suppressRebuild: true })
      notifyRebuildTracks([trackId])
      await nextTick()
      return await runEnter(trackId, slotKey)
    }

    return false
  }

  async function runBatch(tasks) {
    const normalized = tasks.map(normalizeTask).filter(Boolean)
    if (normalized.length === 0) return

    const byTrack = new Map()
    normalized.forEach(task => {
      const key = String(task.trackId)
      if (!byTrack.has(key)) byTrack.set(key, [])
      byTrack.get(key).push(task)
    })

    // 跨股道汇总 depart / enter 列表（保留每股道内部物理顺序）
    const departByTrack = new Map() // trackId -> [{slotKey,...}]
    const enterByTrack = new Map()  // trackId -> [{slotKey,...}]
    const allEnters = []            // [{trackId, slotKey}]
    for (const trackTasks of byTrack.values()) {
      const trackId = trackTasks[0].trackId
      // 出库：一列位先出，再二列位出
      const departTasks = trackTasks
        .filter(t => t.type === 'depart' || t.type === 'replace')
        .sort((a, b) => SLOT_KEYS.indexOf(a.slotKey) - SLOT_KEYS.indexOf(b.slotKey))
      // 进库：二列位先进，再一列位进
      const enterTasks = trackTasks
        .filter(t => t.type === 'enter' || t.type === 'replace')
        .sort((a, b) => SLOT_KEYS.indexOf(b.slotKey) - SLOT_KEYS.indexOf(a.slotKey))
      if (departTasks.length > 0) departByTrack.set(trackId, departTasks)
      if (enterTasks.length > 0) {
        enterByTrack.set(trackId, enterTasks)
        enterTasks.forEach(t => allEnters.push({ trackId, slotKey: t.slotKey }))
      }
    }

    // 阶段一：所有股道的 depart 并发执行（每股道内部仍按列位顺序串行）
    if (departByTrack.size > 0) {
      await Promise.all(Array.from(departByTrack.entries()).map(async ([trackId, list]) => {
        for (const t of list) {
          await runDepart(trackId, t.slotKey)
        }
      }))
    }

    // 阶段二：整个 batch 只 reload 一次（suppressRebuild 避免整体场景销毁重建）。
    // 一次性通知所有待进库列位，局部重建后 useThreeScene 一次性 park 远端。
    if (departByTrack.size > 0 || enterByTrack.size > 0) {
      notifyPendingEnterSlots(allEnters)
      await store.loadStockRoadData(true, { suppressRebuild: true })
      // 仅增量重建受影响的股道（不会触发其他股道闪烁）
      const affectedTrackIds = [...new Set([...departByTrack.keys(), ...enterByTrack.keys()])]
      notifyRebuildTracks(affectedTrackIds)
      await nextTick()
    }

    // 阶段三：所有股道的 enter 并发执行（每股道内部仍按列位顺序串行）
    if (enterByTrack.size > 0) {
      // 重建后新车组 slotState 默认是 'parked'，统一改成 'out' 才能触发进库动画
      allEnters.forEach(({ trackId, slotKey }) => store.setSlotState(trackId, slotKey, 'out'))
      await new Promise(resolve => window.setTimeout(resolve, 80))
      await Promise.all(Array.from(enterByTrack.entries()).map(async ([trackId, list]) => {
        for (const t of list) {
          await runEnter(trackId, t.slotKey)
        }
      }))
    }
  }

  async function drain() {
    if (running.value) return
    running.value = true
    try {
      while (queue.value.length > 0) {
        const batch = queue.value.splice(0, queue.value.length)
        await runBatch(batch)
      }
    } finally {
      running.value = false
    }
  }

  function enqueue(tasks) {
    const list = Array.isArray(tasks) ? tasks : [tasks]
    const normalized = list.filter(Boolean).map(t => ({ ...t, slotKey: normalizeSlotKey(t.slotKey ?? t.slot ?? t.position) }))
    // 同一批任务按列位物理顺序执行：一列位先于二列位。
    normalized.sort((a, b) => SLOT_KEYS.indexOf(a.slotKey) - SLOT_KEYS.indexOf(b.slotKey))
    queue.value.push(...normalized)
    // WebSocket 会逐条到达，这里短暂收集同一次保存产生的多个列位事件，再按批次执行物理编排。
    if (drainTimer) window.clearTimeout(drainTimer)
    drainTimer = window.setTimeout(() => {
      drainTimer = null
      drain()
    }, 300)
  }

  function buildTasksFromTrackDiff(oldTrack, newTrack) {
    const trackId = resolveTrackId(newTrack?.id ?? newTrack?.dbId ?? oldTrack?.id ?? oldTrack?.dbId)
    if (trackId === null || trackId === undefined) return []

    return SLOT_KEYS.flatMap(slotKey => {
      const oldGroups = oldTrack?.[`${slotKey}Groups`] || []
      const newGroups = newTrack?.[`${slotKey}Groups`] || []
      const type = groupChanged(oldGroups, newGroups)
      return type ? [{ type, trackId, slotKey }] : []
    })
  }

  function enqueueByTrackDiff(oldTrack, newTrack) {
    enqueue(buildTasksFromTrackDiff(oldTrack, newTrack))
  }

  return {
    queue,
    running,
    busy,
    enqueue,
    enqueueByTrackDiff,
    buildTasksFromTrackDiff,
    normalizeSlotKey,
  }
}
