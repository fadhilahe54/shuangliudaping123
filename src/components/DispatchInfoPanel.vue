<!--
  DispatchInfoPanel.vue -- 调度信息多面板系统
  首页大屏左侧的四个可拖拽、可缩放、可全屏的调度信息面板：

    - 今日值班（org）：当班值班人员的岗位 + 姓名 + 头像网格
    - 统计信息（stat）：上线/备用/整修/扣修数量卡片 + 当日重点信息滚动
    - 检修状态（status）：各检修类型（临修/整修/高级修等）下的车组号列表，超出时自动滚动
    - 交路车组（route）：车次 → 交路 → 车组的对应表格，超出时自动向上滚动

  面板功能特性：
    - 拖拽移位：标题栏可鼠标拖拽
    - 缩放：右下角 resize handle 拖拽调整尺寸
    - 收起/展开：折叠为标题栏
    - 全屏：全屏显示单个面板
    - 弹出：在独立窗口中打开（window.open）
    - 自动滚动：内容超出时自动缓慢上滚，鼠标悬停暂停
    - WebSocket 实时刷新：后端数据变更时自动重新拉取

  使用方：UIOverlay.vue
-->
<script setup>
defineOptions({ inheritAttrs: false })
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
// 默认头像和列车图片
import UserImg from '../public/Images/User.png'
import TrainImg from '../public/Images/TrainRight.png'
// 后台各数据接口
import { getAllSInfo, getAllJobInfo, getAllTrainStatusInfo, getAllTrainNumberRouteInfo } from '../api/dispatchApi.js'
// 后台服务器基础 URL（拼接头像图片路径）
import { serviceBaseURL } from '../api/request.js'
// WebSocket 数据变更监听（后端推送时自动刷新面板数据）
import { useWebSocket } from '../composables/useWebSocket.js'
// 面板显示状态 Store
import { usePanelStore } from '../stores/panelStore.js'
// 科幻边框容器组件
import PanelFrame from './PanelFrame.vue'

/**
 * 解析头像 URL
 * 若为空则返回默认头像，若为相对路径则拼接服务器地址
 * 
 * @param {string} path - 头像路径
 * @returns {string} 完整的头像 URL
 */
const resolveAvatarUrl = (path) => {
  // 若无路径，返回默认头像
  if (!path) return UserImg
  
  // 若为相对路径（/uploads/...），拼接服务器地址
  if (path.startsWith('/uploads/')) return serviceBaseURL + path
  
  // 否则直接返回
  return path
}

// 获取面板显示状态和关闭方法
const { panelVisibility, closePanel } = usePanelStore()

// 四个调度信息面板的 DOM 引用
const refOrg = ref(null)      // 今日值班面板
const refStat = ref(null)     // 统计信息面板
const refStatus = ref(null)   // 检修状态面板
const refRoute = ref(null)    // 交路车组面板

// 面板 ref 映射表，便于通过面板 ID 获取 ref
const PANEL_REF_MAP = {
  org: refOrg,
  stat: refStat,
  status: refStatus,
  route: refRoute,
}

/**
 * 计算面板高度
 * 基于视口高度的比例，并设置最小值
 * 
 * @param {number} vh - 视口高度
 * @param {number} ratio - 占视口的比例（0~1）
 * @param {number} min - 最小高度（px）
 * @returns {number} 计算后的高度
 */
function calcPanelHeight(vh, ratio, min) {
  // 返回比例计算值和最小值中的较大者
  return Math.max(min, Math.round(vh * ratio))
}

/**
 * 获取四个面板的默认高度
 * 根据视口高度动态计算
 * 
 * @returns {Object} 各面板的默认高度
 */
function getDefaultHeights() {
  // 获取视口高度
  const vh = window.innerHeight
  
  // 返回各面板的高度
  return {
    org:    calcPanelHeight(vh, 0.22, 190),  // 今日值班：占 22%，最小 190px
    stat:   calcPanelHeight(vh, 0.24, 200),  // 统计信息：占 24%，最小 200px
    status: calcPanelHeight(vh, 0.22, 190),  // 检修状态：占 22%，最小 190px
    route:  calcPanelHeight(vh, 0.38, 300),  // 交路车组：占 38%，最小 300px
  }
}

// 获取各面板的默认高度
const PANEL_HEIGHT_ORG    = getDefaultHeights().org
const PANEL_HEIGHT_STAT   = getDefaultHeights().stat
const PANEL_HEIGHT_STATUS = getDefaultHeights().status
const PANEL_HEIGHT_ROUTE  = getDefaultHeights().route

// 面板高度映射表
const PANEL_HEIGHT_MAP = {
  org:    PANEL_HEIGHT_ORG,
  stat:   PANEL_HEIGHT_STAT,
  status: PANEL_HEIGHT_STATUS,
  route:  PANEL_HEIGHT_ROUTE,
}

const PANEL_MIN_WIDTH = 260
const PANEL_MIN_HEIGHT = 120
const FULLSCREEN_GAP = 10

const stateOrg    = ref({ left: 0, top: 0,    bottom: null, collapsed: false, fullscreen: false, zIndex: 11, w: 400, h: PANEL_HEIGHT_ORG, baseW: 400, baseH: PANEL_HEIGHT_ORG, _preFullscreen: null })
const stateStat   = ref({ left: 0, top: 0,    bottom: null, collapsed: false, fullscreen: false, zIndex: 12, w: 400, h: PANEL_HEIGHT_STAT, baseW: 400, baseH: PANEL_HEIGHT_STAT, _preFullscreen: null })
const stateStatus = ref({ left: 0, top: 0,    bottom: null, collapsed: false, fullscreen: false, zIndex: 13, w: 400, h: PANEL_HEIGHT_STATUS, baseW: 400, baseH: PANEL_HEIGHT_STATUS, _preFullscreen: null })
const stateRoute  = ref({ left: 0, top: 0,    bottom: null, collapsed: false, fullscreen: false, zIndex: 14, w: 400, h: PANEL_HEIGHT_ROUTE, baseW: 400, baseH: PANEL_HEIGHT_ROUTE, _preFullscreen: null })

const PANEL_STATE_MAP = {
  org:    stateOrg,
  stat:   stateStat,
  status: stateStatus,
  route:  stateRoute,
}

let zIndexSeed = 14

const _drag = { panelId: null, offsetX: 0, offsetY: 0 }
const _resize = { panelId: null, startX: 0, startY: 0, startW: 0, startH: 0 }

const orgData = ref({ row1: [], row2: [] })

const stats = ref([
  { label: '上线', value: 0, color: '#22d3ee' },
  { label: '备用', value: 0, color: '#4ade80' },
  { label: '整修', value: 0, color: '#fbbf24' },
  { label: '扣修', value: 0, color: '#f87171' },
])

const infoList = ref([{ text: '正在加载重点信息...', important: false }])

const statusData = ref({
/*  left: [
    { label: '临修/整修', icon: '', nums: [] },
    { label: '整修', icon: '', nums: [] },
    { label: '异地停放', icon: '', nums: [] },
  ],
  right: [
    { label: '高级修', icon: '', nums: [], dotColor: '#4ade80' },
    { label: '调向/试运', icon: '', nums: [] },
    { label: '备用', icon: '', nums: [] },
  ],*/
})

// 检修状态弹窗相关（支持同时打开多个）
const statusDialogs = ref([])  // 弹窗数组，每项 { id, title, nums, color, pos, size, zIndex }
let _sdZSeed = 10000            // 弹窗层级种子

// 当前正在拖拽/resize 的弹窗 id
const _sdDrag = { id: null, active: false, offsetX: 0, offsetY: 0 }
const _sdResize = { id: null, active: false, startX: 0, startY: 0, startW: 0, startH: 0 }

/** 根据 id 找到弹窗对象 */
const _findDialog = (id) => statusDialogs.value.find(d => d.id === id)

/** 关闭某个弹窗 */
const closeStatusDialog = (id) => {
  statusDialogs.value = statusDialogs.value.filter(d => d.id !== id)
}

/** 点击弹窗时置顶 */
const bringDialogToFront = (id) => {
  const d = _findDialog(id)
  if (d) d.zIndex = ++_sdZSeed
}

/** 弹窗标题栏拖拽开始 */
const onSdDragStart = (id, e) => {
  // 兼容鼠标/触摸/触控笔：鼠标仅接受左键
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const d = _findDialog(id)
  if (!d) return
  bringDialogToFront(id)
  _sdDrag.id = id
  _sdDrag.active = true
  _sdDrag.offsetX = e.clientX - d.pos.left
  _sdDrag.offsetY = e.clientY - d.pos.top
  try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  document.addEventListener('pointermove', onSdDragMove)
  document.addEventListener('pointerup', onSdDragEnd)
  document.addEventListener('pointercancel', onSdDragEnd)
}
const onSdDragMove = (e) => {
  if (!_sdDrag.active) return
  const d = _findDialog(_sdDrag.id)
  if (!d) return
  d.pos = {
    left: Math.max(0, Math.min(e.clientX - _sdDrag.offsetX, window.innerWidth - 100)),
    top: Math.max(0, Math.min(e.clientY - _sdDrag.offsetY, window.innerHeight - 40)),
  }
}
const onSdDragEnd = () => {
  _sdDrag.active = false
  _sdDrag.id = null
  document.removeEventListener('pointermove', onSdDragMove)
  document.removeEventListener('pointerup', onSdDragEnd)
  document.removeEventListener('pointercancel', onSdDragEnd)
}

/** 弹窗右下角 resize 开始 */
const onSdResizeStart = (id, e) => {
  // 兼容鼠标/触摸/触控笔：鼠标仅接受左键
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const d = _findDialog(id)
  if (!d) return
  bringDialogToFront(id)
  _sdResize.id = id
  _sdResize.active = true
  _sdResize.startX = e.clientX
  _sdResize.startY = e.clientY
  _sdResize.startW = d.size.w
  _sdResize.startH = d.size.h
  try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  document.addEventListener('pointermove', onSdResizeMove)
  document.addEventListener('pointerup', onSdResizeEnd)
  document.addEventListener('pointercancel', onSdResizeEnd)
}
const onSdResizeMove = (e) => {
  if (!_sdResize.active) return
  const d = _findDialog(_sdResize.id)
  if (!d) return
  d.size = {
    w: Math.max(240, _sdResize.startW + e.clientX - _sdResize.startX),
    h: Math.max(200, _sdResize.startH + e.clientY - _sdResize.startY),
  }
}
const onSdResizeEnd = () => {
  _sdResize.active = false
  _sdResize.id = null
  document.removeEventListener('pointermove', onSdResizeMove)
  document.removeEventListener('pointerup', onSdResizeEnd)
  document.removeEventListener('pointercancel', onSdResizeEnd)
}

// ========== 弹窗内容自动滚动播放 ==========
// 每个弹窗的滚动控制器：{ raf, paused, dir, waitUntil }
const _sdScrollMap = new Map()

/** 通过 data 属性查找弹窗 body 元素 */
const findSdBody = (id) => {
  // 用 CSS.escape 处理含特殊字符（如 / ）的 id
  const safe = window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"')
  return document.querySelector(`.status-dialog-body[data-sd-id="${safe}"]`)
}

/** 启动某个弹窗内容的自动滚动（参考交路滚动实现：时间delta + 像素累加器，到底暂停回顶） */
const startSdAutoScroll = (id) => {
  stopSdAutoScroll(id)
  const ctx = { raf: 0, paused: false }
  _sdScrollMap.set(id, ctx)
  const pxPerSecond = 20
  let lastTime = 0
  let accumulator = 0
  let bottomPauseUntil = 0

  const step = (timestamp) => {
    if (!_sdScrollMap.has(id)) return
    const el = findSdBody(id)
    if (!el) {
      ctx.raf = requestAnimationFrame(step)
      return
    }
    if (!lastTime) { lastTime = timestamp; ctx.raf = requestAnimationFrame(step); return }
    const delta = Math.min(timestamp - lastTime, 200)
    lastTime = timestamp

    if (el.scrollHeight <= el.clientHeight + 2) {
      accumulator = 0
      ctx.raf = requestAnimationFrame(step)
      return
    }

    if (!ctx.paused) {
      if (bottomPauseUntil > 0) {
        if (timestamp >= bottomPauseUntil) {
          el.scrollTop = 0
          bottomPauseUntil = 0
        }
      } else {
        accumulator += pxPerSecond * (delta / 1000)
        if (accumulator >= 1) {
          const px = Math.floor(accumulator)
          accumulator -= px
          el.scrollTop += px
          if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
            bottomPauseUntil = timestamp + 2000
          }
        }
      }
    }
    ctx.raf = requestAnimationFrame(step)
  }
  ctx.raf = requestAnimationFrame(step)
}

/** 停止某个弹窗内容的自动滚动 */
const stopSdAutoScroll = (id) => {
  const ctx = _sdScrollMap.get(id)
  if (ctx) {
    cancelAnimationFrame(ctx.raf)
    _sdScrollMap.delete(id)
  }
}

/** 全局 mousemove 监听：根据鼠标下方元素判断悬停的弹窗，暂停对应弹窗滚动 */
const _onSdGlobalMouseMove = (e) => {
  // 通过事件目标向上查找最近的弹窗
  const dialog = e.target?.closest?.('.status-dialog')
  const hoveredId = dialog?.querySelector('[data-sd-id]')?.getAttribute('data-sd-id') || null
  // 更新所有滚动控制器的 paused 状态
  for (const [id, ctx] of _sdScrollMap.entries()) {
    ctx.paused = (id === hoveredId)
  }
}

/** 兼容模板 @mouseenter/@mouseleave 调用（实际由全局 mousemove 接管） */
const pauseSdScroll = (id) => {
  const ctx = _sdScrollMap.get(id)
  if (ctx) ctx.paused = true
}
const resumeSdScroll = (id) => {
  const ctx = _sdScrollMap.get(id)
  if (ctx) ctx.paused = false
}

// 监听弹窗数组变化：新增的弹窗启动滚动，移除的弹窗停止滚动；同时管理全局 hover 监听
watch(() => statusDialogs.value.map(d => d.id).join('|'), (val) => {
  const currentIds = new Set(statusDialogs.value.map(d => d.id))
  for (const id of [..._sdScrollMap.keys()]) {
    if (!currentIds.has(id)) stopSdAutoScroll(id)
  }
  nextTick(() => {
    for (const id of currentIds) {
      if (!_sdScrollMap.has(id)) startSdAutoScroll(id)
    }
  })
  // 有弹窗存在时挂载全局 mousemove；全部关闭则移除
  if (currentIds.size > 0) {
    document.addEventListener('mousemove', _onSdGlobalMouseMove)
  } else {
    document.removeEventListener('mousemove', _onSdGlobalMouseMove)
  }
})

// 预定义的卡片颜色映射（根据检修类型分配颜色）
const STATUS_COLOR_MAP = {
  '临修/整修': '#f59e0b',
  '临修': '#f59e0b',
  '整修': '#fbbf24',
  '异地停放': '#38bdf8',
  '高级修': '#4ade80',
  '调向/试运': '#a78bfa',
  '调向': '#a78bfa',
  '试运': '#818cf8',
  '备用': '#22d3ee',
  '扣修': '#f87171',
  '上线': '#2dd4bf',
}
// 颜色轮盘：当名称不在映射表中时按索引分配
const STATUS_COLOR_PALETTE = ['#f59e0b', '#38bdf8', '#4ade80', '#a78bfa', '#22d3ee', '#f87171', '#fbbf24', '#fb923c', '#818cf8', '#2dd4bf']

/**
 * 将 statusData 的 left/right 扁平化为卡片列表
 * 每个卡片包含 label、count、color 和原始 nums
 * @returns {Array<{label: string, count: number, color: string, nums: string[]}>}
 */
const statusCards = computed(() => {
  // 合并 left/right 后按后台 id 升序排序，确保与后台车组状态 id 顺序一致
  const all = [...(statusData.value.left || []), ...(statusData.value.right || [])]
    .slice()
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  return all.map((item, idx) => ({
    label: item.label,
    count: item.nums.length,
    // 优先级：item 自带颜色 > 名称映射 > 按索引从轮盘取色
    color: item.dotColor || STATUS_COLOR_MAP[item.label] || STATUS_COLOR_PALETTE[idx % STATUS_COLOR_PALETTE.length],
    nums: item.nums,
  }))
})

/**
 * 点击检修状态卡片，打开弹窗显示车组列表（支持多弹窗同时打开）
 * 同类型已打开则置顶，否则新增弹窗
 * @param {Object} card - 卡片数据
 * @param {Event} event - 点击事件（用于获取卡片位置）
 */
const openStatusDialog = (card, event) => {
  // 同类型已打开则关闭（收起）
  const existing = statusDialogs.value.find(d => d.id === card.label)
  if (existing) {
    closeStatusDialog(existing.id)
    return
  }
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  const dialogWidth = 320
  const dialogMaxH = Math.min(400, window.innerHeight * 0.6)
  // 多弹窗自动错开：每多一个偏移 30px
  const offset = statusDialogs.value.length * 30
  let left = rect.right + 10 + offset
  let top = rect.top + offset
  // 右侧空间不足时，显示在卡片左侧
  if (left + dialogWidth > window.innerWidth - 10) {
    left = rect.left - dialogWidth - 10 + offset
  }
  // 底部空间不足时，向上调整
  if (top + dialogMaxH > window.innerHeight - 10) {
    top = Math.max(10, window.innerHeight - dialogMaxH - 10)
  }
  statusDialogs.value.push({
    id: card.label,
    title: card.label,
    nums: card.nums,
    color: card.color,
    pos: { top, left },
    size: { w: 320, h: 360 },
    zIndex: ++_sdZSeed,
  })
}

const routeData = ref([])
const routeHeaders = ref([])

// ========== 交路/车组表格自动滚动 ==========
const routeTableWrapRef = ref(null)
const infoScrollAreaRef = ref(null)
const infoScrollNeeded = ref(false)
let routeScrollRaf = null
let routeScrollPaused = false
const statusScrollWrapRef = ref(null)
let statusScrollRaf = null
let statusScrollPaused = false
let statusChipScrollRaf = null
const statusChipScrollState = new WeakMap()

function startRouteAutoScroll() {
  stopRouteAutoScroll()
  const el = routeTableWrapRef.value
  if (!el) return
  // 内容未溢出则不滚动
  if (el.scrollHeight <= el.clientHeight + 2) return

  const pxPerSecond = 20 // 每秒滚动 20 像素，缓慢舒适
  let lastTime = 0
  let accumulator = 0 // 累加器：攒够 1px 再实际滚动（避免浏览器取整吞掉小数）
  let bottomPauseUntil = 0 // 到底后暂停 2 秒再回顶

  function step(timestamp) {
    if (!routeTableWrapRef.value) return
    if (!lastTime) { lastTime = timestamp; routeScrollRaf = requestAnimationFrame(step); return }
    const delta = Math.min(timestamp - lastTime, 200)
    lastTime = timestamp

    if (!routeScrollPaused) {
      // 到底暂停中
      if (bottomPauseUntil > 0) {
        if (timestamp >= bottomPauseUntil) {
          el.scrollTop = 0
          bottomPauseUntil = 0
        }
      } else {
        accumulator += pxPerSecond * (delta / 1000)
        if (accumulator >= 1) {
          const px = Math.floor(accumulator)
          accumulator -= px
          el.scrollTop += px
          // 滚动到底部后暂停 2 秒再回顶
          if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
            bottomPauseUntil = timestamp + 2000
          }
        }
      }
    }
    routeScrollRaf = requestAnimationFrame(step)
  }
  routeScrollRaf = requestAnimationFrame(step)
}

function stopRouteAutoScroll() {
  if (routeScrollRaf) {
    cancelAnimationFrame(routeScrollRaf)
    routeScrollRaf = null
  }
}

function onRouteWrapEnter() { routeScrollPaused = true }
function onRouteWrapLeave() { routeScrollPaused = false }

function updateInfoScrollNeeded() {
  nextTick(() => {
    const area = infoScrollAreaRef.value
    if (!area) return
    const content = area.querySelector('.info-scroll-content')
    if (!content) return
    infoScrollNeeded.value = content.scrollHeight > area.clientHeight + 2
  })
}

function startStatusAutoScroll() {
  stopStatusAutoScroll()
  const el = statusScrollWrapRef.value
  if (!el) return
  if (el.scrollHeight <= el.clientHeight + 2) return

  const pxPerSecond = 16
  let lastTime = 0
  let accumulator = 0
  let bottomPauseUntil = 0

  function step(timestamp) {
    if (!statusScrollWrapRef.value) return
    if (!lastTime) { lastTime = timestamp; statusScrollRaf = requestAnimationFrame(step); return }
    const delta = Math.min(timestamp - lastTime, 200)
    lastTime = timestamp

    if (!statusScrollPaused) {
      if (bottomPauseUntil > 0) {
        if (timestamp >= bottomPauseUntil) {
          el.scrollTop = 0
          bottomPauseUntil = 0
        }
      } else {
        accumulator += pxPerSecond * (delta / 1000)
        if (accumulator >= 1) {
          const px = Math.floor(accumulator)
          accumulator -= px
          el.scrollTop += px
          if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
            bottomPauseUntil = timestamp + 2000
          }
        }
      }
    }
    statusScrollRaf = requestAnimationFrame(step)
  }
  statusScrollRaf = requestAnimationFrame(step)
}

function stopStatusAutoScroll() {
  if (statusScrollRaf) {
    cancelAnimationFrame(statusScrollRaf)
    statusScrollRaf = null
  }
}

function onStatusWrapEnter() { statusScrollPaused = true }
function onStatusWrapLeave() { statusScrollPaused = false }

function startStatusChipListAutoScroll() {
  stopStatusChipListAutoScroll()
  const wrap = statusScrollWrapRef.value
  if (!wrap) return

  const pxPerSecond = 12
  let lastTime = 0

  function step(timestamp) {
    if (!statusScrollWrapRef.value) return
    if (!lastTime) { lastTime = timestamp; statusChipScrollRaf = requestAnimationFrame(step); return }
    const delta = Math.min(timestamp - lastTime, 200)
    lastTime = timestamp

    const chipLists = statusScrollWrapRef.value.querySelectorAll('.status-chip-list')
    chipLists.forEach((el) => {
      if (el.scrollHeight <= el.clientHeight + 2) return
      if (el.matches(':hover')) return

      const state = statusChipScrollState.get(el) || { accumulator: 0, bottomPauseUntil: 0 }
      if (state.bottomPauseUntil > 0) {
        if (timestamp >= state.bottomPauseUntil) {
          el.scrollTop = 0
          state.bottomPauseUntil = 0
        }
      } else {
        state.accumulator += pxPerSecond * (delta / 1000)
        if (state.accumulator >= 1) {
          const px = Math.floor(state.accumulator)
          state.accumulator -= px
          el.scrollTop += px
          if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
            state.bottomPauseUntil = timestamp + 1600
          }
        }
      }
      statusChipScrollState.set(el, state)
    })

    statusChipScrollRaf = requestAnimationFrame(step)
  }

  statusChipScrollRaf = requestAnimationFrame(step)
}

function stopStatusChipListAutoScroll() {
  if (statusChipScrollRaf) {
    cancelAnimationFrame(statusChipScrollRaf)
    statusChipScrollRaf = null
  }
}

// 数据变化后重新检测是否需要滚动
watch([routeData, routeHeaders], () => {
  nextTick(() => startRouteAutoScroll())
})

watch(infoList, () => {
  updateInfoScrollNeeded()
}, { deep: true })

watch(statusData, () => {
  nextTick(() => {
    startStatusAutoScroll()
    startStatusChipListAutoScroll()
  })
}, { deep: true })

function compareDisplayNo(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hans-CN-u-kn-true')
}

function getTrainRouteSortValue(item) { return item?.id ?? item?.['车次'] ?? '' }
function getGroupSortValue(item) { return item?.id ?? item?.['车组号'] ?? '' }

const loadSummaryInfo = async () => {
  try {
    const data = await getAllSInfo()
    const list = Array.isArray(data) ? data : [data]
    if (list.length > 0) {
      const latest = list[list.length - 1]
      stats.value = [
        { label: '上线', value: latest['上线数量'] ?? 0, color: '#22d3ee' },
        { label: '备用', value: latest['备用数量'] ?? 0, color: '#4ade80' },
        { label: '整修', value: latest['整修数量'] ?? 0, color: '#fbbf24' },
        { label: '扣修', value: latest['扣修数量'] ?? 0, color: '#f87171' },
      ]
      const rawInfo = latest['当班重点信息'] || ''
      if (rawInfo) {
        const items = rawInfo.split(/[;；。\n]/).filter(s => s.trim())
        infoList.value = items.map((text, i) => ({ text: `${i + 1}. ${text.trim()}`, important: i % 2 === 0 }))
      }
    }
  } catch (e) {
    console.warn('加载总体信息失败', e)
    stats.value = [
/*      { label: '上线', value: 39, color: '#22d3ee' },
      { label: '备用', value: 11, color: '#4ade80' },
      { label: '整修', value: 2, color: '#fbbf24' },
      { label: '扣修', value: 7, color: '#f87171' },*/
    ]
    infoList.value = [
  /*    { text: '1. 严禁当班饮酒、酒后上岗，严格执行测酒；', important: true },
      { text: '2. 注意各类调度命令及时、准确传达到各级；', important: false },
      { text: '3. 各一体化单位通过平交道时，严格执行手指定呼；', important: true },
      { text: '4. 注意追踪临修故障消缺进度，做好后续计划编制；', important: false },*/
    ]
  }
}

const loadJobInfo = async () => {
  try {
    const data = await getAllJobInfo()
    const jobs = Array.isArray(data) ? data : [data]
    if (jobs.length > 0) {
      jobs.sort((a, b) => (a.id || 0) - (b.id || 0))
      const allCells = jobs.map(job => {
        const role = job['值班岗位'] || ''
        const workers = job['值班人员list'] || []
        const persons = workers.map(w => ({ name: w['姓名'] || '未知', img: resolveAvatarUrl(w['头像路径']) }))
        return { role, persons }
      })
      const row1 = [], row2 = []
      allCells.forEach((cell, idx) => { (idx % 2 === 0 ? row1 : row2).push(cell) })
      orgData.value = { row1, row2 }
    }
  } catch (e) {
    console.warn('加载值班信息失败', e)
    orgData.value = {
  /*    row1: [
        { role: '值班主任', persons: [{ name: '张伟', img: UserImg }] },
        { role: '值班调度', persons: [{ name: '李明', img: UserImg }] },
        { role: '随车机械师', persons: [{ name: '王强', img: UserImg }] },
      ],
      row2: [
        { role: '值班指导', persons: [{ name: '赵刚', img: UserImg }] },
        { role: '值班机务', persons: [{ name: '陈磊', img: UserImg }, { name: '刘洋', img: UserImg }, { name: '周鹏', img: UserImg }, { name: '吴涛', img: UserImg }] },
      ],*/
    }
  }
}

const loadTrainData = async () => {
  try {
    const [trainRouteList, statusInfoList] = await Promise.all([getAllTrainNumberRouteInfo(), getAllTrainStatusInfo()])
    const rawList = (Array.isArray(trainRouteList) ? trainRouteList : (trainRouteList ? [trainRouteList] : []))
        .slice().sort((a, b) => compareDisplayNo(getTrainRouteSortValue(a), getTrainRouteSortValue(b)))
    if (rawList.length > 0) {
      const routeIdMap = new Map()
      rawList.forEach(tn => { (tn['交路信息List'] || []).forEach(r => { if (r.id != null && !routeIdMap.has(r.id)) routeIdMap.set(r.id, r['交路名称'] || '') }) })
      const sortedRouteIds = [...routeIdMap.keys()].sort((a, b) => a - b)
      const colCount = sortedRouteIds.length
      const routeIdToCol = new Map()
      sortedRouteIds.forEach((rid, idx) => routeIdToCol.set(rid, idx))
      routeHeaders.value = sortedRouteIds.map(rid => { const name = routeIdMap.get(rid) || `交路${rid}`; return `${name}/车组` })
      routeData.value = rawList.map(tn => {
        const cols = Array.from({ length: colCount }, () => [])
        ;(tn['交路信息List'] || []).forEach(route => {
          const colIdx = routeIdToCol.get(route.id)
          if (colIdx != null) {
            ;(route['车组信息List'] || []).slice().sort((a, b) => compareDisplayNo(getGroupSortValue(a), getGroupSortValue(b)))
                .forEach(group => { if (group['车组号']) cols[colIdx].push({ n: group['车组号'] }) })
          }
        })
        return { id: tn['车次'] || `T${tn.id}`, cols }
      })
    }
    const statuses = Array.isArray(statusInfoList) ? statusInfoList : (statusInfoList ? [statusInfoList] : [])
    if (statuses.length > 0) {
      statuses.sort((a, b) => (a.id || 0) - (b.id || 0))
      const left = [], right = []
      statuses.forEach((s, i) => {
        const item = { id: s.id ?? i, label: s['状态名称'] || '未知状态', icon: '', nums: (s['车组信息List'] || []).map(g => g['车组号']).filter(Boolean) }
        ;(i % 2 === 0 ? left : right).push(item)
      })
      statusData.value = { left, right }
    }
  } catch (e) {
    console.warn('加载交路/车组数据失败', e)
    routeHeaders.value = []
    routeData.value = []
    statusData.value = {
   /*   left: [{ label: '临修/整修', icon: '', nums: [] }, { label: '整修', icon: '', nums: [] }, { label: '异地停放', icon: '', nums: [] }],
      right: [{ label: '高级修', icon: '', nums: [], dotColor: '#4ade80' }, { label: '调向/试运', icon: '', nums: [] }, { label: '备用', icon: '', nums: [] }],
   */ }
  }
}

const STORAGE_KEY = 'pzh_panel_positions_v2'
function savePanelPositions() {
  try {
    const data = {}
    for (const [id, stateRef] of Object.entries(PANEL_STATE_MAP)) {
      const s = stateRef.value
      data[id] = { left: s.left, top: s.top, bottom: s.bottom, collapsed: s.collapsed, w: s.w, h: s.h, baseW: s.baseW, baseH: s.baseH }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}
function restorePanelPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    for (const [id, stateRef] of Object.entries(PANEL_STATE_MAP)) {
      if (data[id]) {
        const saved = data[id]
        stateRef.value.left = saved.left ?? stateRef.value.left
        stateRef.value.top = saved.top ?? stateRef.value.top
        stateRef.value.bottom = saved.bottom ?? stateRef.value.bottom
        stateRef.value.collapsed = saved.collapsed ?? false
        stateRef.value.w = saved.w ?? stateRef.value.w
        stateRef.value.h = saved.h ?? stateRef.value.h
        stateRef.value.baseW = saved.baseW ?? stateRef.value.baseW
        stateRef.value.baseH = saved.baseH ?? stateRef.value.baseH
      }
    }
    return true
  } catch { return false }
}

const { onDataChange } = useWebSocket()
onDataChange('交路关联', () => loadTrainData())
onDataChange('train-group', () => loadTrainData())
onDataChange('TrainGroupInfo', () => loadTrainData())
onDataChange('车组状态关联', () => loadTrainData())
onDataChange('trainStatusInfo', () => loadTrainData())
onDataChange('车组状态', () => loadTrainData())
onDataChange('jobinfo', () => loadJobInfo())
onDataChange('值班关联', () => loadJobInfo())
onDataChange('交路轮转', () => loadTrainData())
onDataChange('总体信息', () => loadSummaryInfo())
onDataChange('sInfo', () => loadSummaryInfo())

async function reloadAllData() {
  await Promise.all([loadSummaryInfo(), loadJobInfo(), loadTrainData()])
}

defineExpose({ reloadAllData })

onMounted(async () => {
  calcLayout()
  restorePanelPositions()
  window.addEventListener('keydown', onWindowKeydown)
  await reloadAllData()
  nextTick(() => startRouteAutoScroll())
  nextTick(() => updateInfoScrollNeeded())
  nextTick(() => startStatusAutoScroll())
  nextTick(() => startStatusChipListAutoScroll())
})

function calcLayout() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = Math.max(8, Math.round(vw * 0.005))
  const headerH = Math.min(120, Math.max(90, Math.round(vh * 0.11)))
  const topY = headerH + Math.round(vh * 0.01)
  const marginL = Math.max(10, Math.round(vw * 0.006))
  const marginR = marginL
  const heights = getDefaultHeights()
  const usableW = vw - marginL - marginR - gap * 2
  const colW = Math.max(300, Math.floor(usableW * 0.30))

  stateOrg.value.left = marginL; stateOrg.value.top = topY; stateOrg.value.w = colW; stateOrg.value.h = heights.org; stateOrg.value.baseW = colW; stateOrg.value.baseH = heights.org
  stateStat.value.left = Math.floor((vw - colW) / 2); stateStat.value.top = topY; stateStat.value.w = colW; stateStat.value.h = heights.stat; stateStat.value.baseW = colW; stateStat.value.baseH = heights.stat
  const rightLeft = vw - marginR - colW
  stateStatus.value.left = rightLeft; stateStatus.value.top = topY; stateStatus.value.bottom = null; stateStatus.value.w = colW; stateStatus.value.h = heights.status; stateStatus.value.baseW = colW; stateStatus.value.baseH = heights.status
  stateRoute.value.left = rightLeft; stateRoute.value.top = vh - marginR - heights.route; stateRoute.value.bottom = null; stateRoute.value.w = colW; stateRoute.value.h = heights.route; stateRoute.value.baseW = colW; stateRoute.value.baseH = heights.route
}

// ========== 面板样式 ==========
function getPanelStyle(panelId) {
  const s = PANEL_STATE_MAP[panelId].value
  const w = s.w || 400
  const h = s.collapsed ? 40 : (s.h || PANEL_HEIGHT_MAP[panelId])

  const style = {
    position: 'fixed',
    left: s.left + 'px',
    width: w + 'px',
    zIndex: s.zIndex,
  }

  if (!s.collapsed) {
    style.height = (s.h || PANEL_HEIGHT_MAP[panelId]) + 'px'
  }
  if (s.bottom !== null && s.top === null) {
    style.bottom = s.bottom + 'px'
  } else {
    style.top = s.top + 'px'
  }
  return style
}

function getPanelContentStyle(panelId) {
  const s = PANEL_STATE_MAP[panelId].value
  const baseW = s.baseW || s.w || 400
  const baseH = s.baseH || PANEL_HEIGHT_MAP[panelId]
  const widthRatio = (s.w || baseW) / baseW
  const heightRatio = (s.h || baseH) / baseH
  const panelScale = Math.min(2.1, Math.max(0.9, Math.sqrt(widthRatio * heightRatio)))
  const compactScale = Math.min(1.8, Math.max(0.95, (widthRatio + heightRatio) / 2))

  return {
    '--panel-scale': panelScale.toFixed(3),
    '--panel-compact-scale': compactScale.toFixed(3),
    '--panel-padding': `${Math.max(8, Math.round(8 * panelScale))}px`,
    '--panel-gap': `${Math.max(6, Math.round(6 * compactScale))}px`,
    '--title-font-size': `${Math.max(12, Math.round(12 * compactScale))}px`,
    '--panel-action-font-size': `${Math.max(10, Math.round(10 * compactScale))}px`,
    '--panel-drag-font-size': `${Math.max(10, Math.round(10 * compactScale))}px`,
    '--avatar-size': `${Math.max(26, Math.round(30 * panelScale))}px`,
    '--info-scroll-max-height': `${Math.max(48, Math.round(48 * panelScale))}px`,
    '--route-scroll-max-height': `${Math.max(120, Math.round((s.h || baseH) - 84 * compactScale))}px`,
    '--status-chip-list-max-height': `${Math.max(52, Math.round(((s.h || baseH) - 92 * compactScale) / 3))}px`,
  }
}

// 其余函数保持不变...
function isCollapsed(panelId) { return PANEL_STATE_MAP[panelId].value.collapsed }
function isFullscreen(panelId) { return PANEL_STATE_MAP[panelId].value.fullscreen }
function bringToFront(panelId) { PANEL_STATE_MAP[panelId].value.zIndex = ++zIndexSeed }

function toggleCollapse(panelId) {
  bringToFront(panelId)
  if (isFullscreen(panelId)) return
  PANEL_STATE_MAP[panelId].value.collapsed = !PANEL_STATE_MAP[panelId].value.collapsed
  savePanelPositions()
  nextTick(() => {
    startRouteAutoScroll()
    updateInfoScrollNeeded()
    startStatusAutoScroll()
    startStatusChipListAutoScroll()
  })
}

function onDragStart(panelId, event) {
  // 兼容鼠标/触摸/触控笔：鼠标仅接受左键
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (isFullscreen(panelId)) return
  bringToFront(panelId)
  const s = PANEL_STATE_MAP[panelId].value
  if (s.top === null && s.bottom !== null) {
    const el = PANEL_REF_MAP[panelId].value
    s.top = el ? el.getBoundingClientRect().top : window.innerHeight - s.bottom - 200
    s.bottom = null
  }
  _drag.panelId = panelId
  _drag.offsetX = event.clientX - s.left
  _drag.offsetY = event.clientY - s.top
  try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* ignore */ }
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
  document.addEventListener('pointercancel', onDragEnd)
  event.preventDefault()
}

function onDragMove(event) {
  if (!_drag.panelId) return
  const s = PANEL_STATE_MAP[_drag.panelId].value
  const minX = 0, maxX = window.innerWidth - (s.w || 400)
  const minY = 0, maxY = window.innerHeight - (s.h || 120)
  let newLeft = event.clientX - _drag.offsetX
  let newTop = event.clientY - _drag.offsetY
  if (newLeft < minX) newLeft = minX
  if (newLeft > maxX) newLeft = maxX
  if (newTop < minY) newTop = minY
  if (newTop > maxY) newTop = maxY
  s.left = newLeft; s.top = newTop
}

function onDragEnd() {
  _drag.panelId = null
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
  savePanelPositions()
}

function onResizeStart(panelId, event) {
  // 兼容鼠标/触摸/触控笔：鼠标仅接受左键
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (isFullscreen(panelId)) return
  bringToFront(panelId)
  const s = PANEL_STATE_MAP[panelId].value
  _resize.panelId = panelId
  _resize.startX = event.clientX; _resize.startY = event.clientY
  _resize.startW = s.w || PANEL_HEIGHT_MAP[panelId]
  _resize.startH = s.h || PANEL_HEIGHT_MAP[panelId]
  try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* ignore */ }
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', onResizeEnd)
  document.addEventListener('pointercancel', onResizeEnd)
  event.preventDefault()
}

function onResizeMove(event) {
  if (!_resize.panelId) return
  const s = PANEL_STATE_MAP[_resize.panelId].value
  const maxW = Math.max(PANEL_MIN_WIDTH, window.innerWidth - FULLSCREEN_GAP * 2)
  const maxH = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - FULLSCREEN_GAP * 2)
  s.w = Math.min(maxW, Math.max(PANEL_MIN_WIDTH, _resize.startW + (event.clientX - _resize.startX)))
  s.h = Math.min(maxH, Math.max(PANEL_MIN_HEIGHT, _resize.startH + (event.clientY - _resize.startY)))
}

function onResizeEnd() {
  _resize.panelId = null
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
  document.removeEventListener('pointercancel', onResizeEnd)
  savePanelPositions()
  // 面板尺寸变化后重新检测是否需要滚动
  nextTick(() => {
    startRouteAutoScroll()
    updateInfoScrollNeeded()
    startStatusAutoScroll()
    startStatusChipListAutoScroll()
  })
}

const _popupWindows = {}
function popupPanel(panelId) {
  if (_popupWindows[panelId] && !_popupWindows[panelId].closed) { _popupWindows[panelId].focus(); return }
  const w = Math.min(1200, Math.round(window.screen.availWidth * 0.7))
  const h = Math.min(800, Math.round(window.screen.availHeight * 0.7))
  const left = Math.round((window.screen.availWidth - w) / 2)
  const top = Math.round((window.screen.availHeight - h) / 2)
  const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
  _popupWindows[panelId] = window.open(`${window.location.origin}/panel/${panelId}`, `panel_${panelId}`, features)
}

function toggleFullscreen(panelId) {
  const s = PANEL_STATE_MAP[panelId].value
  if (s.fullscreen) {
    if (s._preFullscreen) {
      s.left = s._preFullscreen.left; s.top = s._preFullscreen.top; s.bottom = s._preFullscreen.bottom
      s.w = s._preFullscreen.w; s.h = s._preFullscreen.h; s.collapsed = s._preFullscreen.collapsed
    }
    s.fullscreen = false; s._preFullscreen = null
    nextTick(() => {
      startRouteAutoScroll()
      updateInfoScrollNeeded()
      startStatusAutoScroll()
      startStatusChipListAutoScroll()
    })
    return
  }
  bringToFront(panelId)
  s._preFullscreen = { left: s.left, top: s.top, bottom: s.bottom, w: s.w, h: s.h, collapsed: s.collapsed }
  s.left = FULLSCREEN_GAP; s.top = FULLSCREEN_GAP; s.bottom = null
  s.w = Math.max(PANEL_MIN_WIDTH, window.innerWidth - FULLSCREEN_GAP * 2)
  s.h = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - FULLSCREEN_GAP * 2)
  s.collapsed = false; s.fullscreen = true
  nextTick(() => {
    startRouteAutoScroll()
    updateInfoScrollNeeded()
    startStatusAutoScroll()
    startStatusChipListAutoScroll()
  })
}

function onWindowKeydown(event) {
  if (event.key !== 'Escape') return
  const activeFullscreen = Object.keys(PANEL_STATE_MAP).find(panelId => isFullscreen(panelId))
  if (activeFullscreen) toggleFullscreen(activeFullscreen)
}

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
  document.removeEventListener('pointercancel', onResizeEnd)
  stopRouteAutoScroll()
  stopStatusAutoScroll()
  stopStatusChipListAutoScroll()
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <!-- 今日值班 -->
  <Transition name="panel-fade-scale">
    <div v-if="panelVisibility.org" ref="refOrg" class="panel-shell pointer-events-auto" :class="{ 'is-fullscreen': isFullscreen('org') }" :style="getPanelStyle('org')" @pointerdown="bringToFront('org')">
      <PanelFrame :bg-color="'rgba(6,26,48,0.35)'" :show-close="true" class="h-full" @close="closePanel('org')">
        <div class="org-panel panel-org p-2 flex flex-col gap-1.5 relative overflow-hidden h-full" :style="{ ...getPanelContentStyle('org'), touchAction: 'none' }" @pointerdown="onDragStart('org', $event)">
          <div class="org-scanline panel-scanline-org"></div>
          <div class="flex items-center justify-between gap-2 cursor-move select-none">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="inline-block w-[3px] h-[14px] rounded-sm bg-cyan-400 org-glow-bar"></span>
              <span class="panel-title-text">今日值班</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="panel-drag-text">{{ isFullscreen('org') ? '全屏中' : '拖动' }}</span>
              <button type="button" class="panel-action-btn panel-popup-btn" @pointerdown.stop @click.stop="popupPanel('org')">↗</button>
              <button type="button" class="panel-action-btn" @pointerdown.stop @click.stop="toggleFullscreen('org')">{{ isFullscreen('org') ? '还原' : '全屏' }}</button>
              <button v-if="!isFullscreen('org')" type="button" class="panel-action-btn" style="margin-right: 32px" @pointerdown.stop @click.stop="toggleCollapse('org')">{{ isCollapsed('org') ? '展开' : '收起' }}</button>
            </div>
          </div>
          <div v-show="!isCollapsed('org')" class="org-grid" :style="{ gridTemplateColumns: `repeat(${Math.max(orgData.row1.length, orgData.row2.length, 1)}, 1fr)` }">
            <template v-for="(cell, cIdx) in orgData.row1" :key="'r1-'+cIdx">
              <div class="org-grid-cell">
                <span v-if="cell.role" class="org-role-badge">{{ cell.role }}</span>
                <div class="org-person-list">
                  <div v-for="(p, pIdx) in cell.persons" :key="p.name + '-' + pIdx" class="org-person">
                    <div class="org-avatar-wrap">
                      <img :src="p.img" :alt="p.name" class="org-avatar" @error="e => e.target.src = UserImg" />
                      <div class="org-avatar-ring"></div>
                    </div>
                    <span class="org-person-name">{{ p.name }}</span>
                  </div>
                </div>
              </div>
            </template>
            <template v-for="(cell, cIdx) in orgData.row2" :key="'r2-'+cIdx">
              <div class="org-grid-cell">
                <span v-if="cell.role" class="org-role-badge">{{ cell.role }}</span>
                <div class="org-person-list">
                  <div v-for="(p, pIdx) in cell.persons" :key="p.name + '-' + pIdx" class="org-person">
                    <div class="org-avatar-wrap">
                      <img :src="p.img" :alt="p.name" class="org-avatar" @error="e => e.target.src = UserImg" />
                      <div class="org-avatar-ring"></div>
                    </div>
                    <span class="org-person-name">{{ p.name }}</span>
                  </div>
                </div>
              </div>
            </template>
            <div v-if="!orgData.row1.length && !orgData.row2.length" class="text-center text-slate-500 text-xs py-4" style="grid-column: 1 / -1">暂无岗位数据</div>
          </div>
          <button v-if="!isFullscreen('org')" type="button" class="panel-resize-handle" @pointerdown.stop="onResizeStart('org', $event)" aria-label="调整今日值班面板大小"></button>
        </div>
      </PanelFrame>
    </div>
  </Transition>

  <!-- 统计信息 -->
  <Transition name="panel-fade-scale">
    <div v-if="panelVisibility.stat" ref="refStat" class="panel-shell pointer-events-auto" :class="{ 'is-fullscreen': isFullscreen('stat') }" :style="getPanelStyle('stat')" @pointerdown="bringToFront('stat')">
      <PanelFrame :bg-color="'rgba(20,18,6,0.35)'" :show-close="true" class="h-full" @close="closePanel('stat')">
        <div class="sci-panel panel-stat p-2 flex flex-col gap-1.5 relative overflow-hidden h-full" :style="{ ...getPanelContentStyle('stat'), touchAction: 'none' }" @pointerdown="onDragStart('stat', $event)">
          <div class="sci-scanline panel-scanline-stat"></div>
          <div class="flex items-center justify-between gap-2 cursor-move select-none">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="inline-block w-[3px] h-[12px] rounded-sm bg-cyan-400 org-glow-bar-neon"></span>
              <span class="panel-title-text">当日重点信息</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="panel-drag-text">{{ isFullscreen('stat') ? '全屏中' : '拖动' }}</span>
              <button type="button" class="panel-action-btn panel-popup-btn" @pointerdown.stop @click.stop="popupPanel('stat')">↗</button>
              <button type="button" class="panel-action-btn" @pointerdown.stop @click.stop="toggleFullscreen('stat')">{{ isFullscreen('stat') ? '还原' : '全屏' }}</button>
              <button v-if="!isFullscreen('stat')" type="button" class="panel-action-btn" style="margin-right: 32px" @pointerdown.stop @click.stop="toggleCollapse('stat')">{{ isCollapsed('stat') ? '展开' : '收起' }}</button>
            </div>
          </div>
<!--          <div v-show="!isCollapsed('stat')" class="flex gap-1.5">
            <div v-for="s in stats" :key="s.label" class="stat-card flex-1" :style="{ '&#45;&#45;card-color': s.color }">
              <span class="stat-label-text">{{ s.label }}</span>
              <span class="dt-num stat-value-text">{{ s.value }}</span>
            </div>
          </div>-->
          <div v-show="!isCollapsed('stat')" class="flex flex-col gap-0.5 flex-1 min-h-0">
<!--            <div class="flex items-center gap-1.5">
              <span class="inline-block w-[3px] h-[14px] rounded-sm bg-cyan-400 org-glow-bar-neon"></span>
              <span class="panel-title-text">当日重点信息</span>
            </div>-->
            <div ref="infoScrollAreaRef" class="info-scroll-area overflow-hidden flex-1 min-h-0" :class="{ 'is-scrolling': infoScrollNeeded }">
              <div class="info-scroll-track">
                <div class="info-scroll-content">
                  <div v-for="(info, i) in infoList" :key="'a'+i" class="info-scroll-text font-bold leading-[1.7] pl-1 text-yellow-300">{{ info.text }}</div>
                </div>
                <div v-if="infoScrollNeeded" class="info-scroll-content" aria-hidden="true">
                  <div v-for="(info, i) in infoList" :key="'b'+i" class="info-scroll-text font-bold leading-[1.7] pl-1 text-yellow-300">{{ info.text }}</div>
                </div>
              </div>
            </div>
          </div>
          <button v-if="!isFullscreen('stat')" type="button" class="panel-resize-handle" @pointerdown.stop="onResizeStart('stat', $event)" aria-label="调整统计信息面板大小"></button>
        </div>
      </PanelFrame>
    </div>
  </Transition>

  <!-- 检修状态 -->
  <Transition name="panel-fade-scale">
    <div v-if="panelVisibility.status" ref="refStatus" class="panel-shell pointer-events-auto" :class="{ 'is-fullscreen': isFullscreen('status') }" :style="getPanelStyle('status')" @pointerdown="bringToFront('status')">
      <PanelFrame :bg-color="'rgba(30,20,6,0.35)'" :show-close="true" class="h-full" @close="closePanel('status')">
        <div class="sci-panel panel-status p-2.5 flex flex-col gap-1.5 relative overflow-hidden h-full" :style="{ ...getPanelContentStyle('status'), touchAction: 'none' }" @pointerdown="onDragStart('status', $event)">
          <div class="sci-scanline panel-scanline-status"></div>
          <div class="flex items-center justify-between gap-2 shrink-0 cursor-move select-none">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="inline-block w-[3px] h-[14px] rounded-sm bg-amber-400 sci-glow-bar-amber"></span>
              <span class="panel-title-text">检修状态</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="panel-drag-text">{{ isFullscreen('status') ? '全屏中' : '拖动' }}</span>
              <button type="button" class="panel-action-btn panel-popup-btn" @pointerdown.stop @click.stop="popupPanel('status')">↗</button>
              <button type="button" class="panel-action-btn" @pointerdown.stop @click.stop="toggleFullscreen('status')">{{ isFullscreen('status') ? '还原' : '全屏' }}</button>
              <button v-if="!isFullscreen('status')" type="button" class="panel-action-btn" style="margin-right: 32px" @pointerdown.stop @click.stop="toggleCollapse('status')">{{ isCollapsed('status') ? '展开' : '收起' }}</button>
            </div>
          </div>
          <!-- 检修状态卡片网格：非全屏只显示数量(点击弹窗)，全屏时直接显示车组号列表 -->
          <div v-show="!isCollapsed('status')" class="status-card-grid" :class="{ 'is-fullscreen-grid': isFullscreen('status') }">
            <div v-for="card in statusCards" :key="card.label"
              class="stat-card status-stat-card"
              :class="{ 'status-stat-card-expanded': isFullscreen('status'), 'status-stat-card-active': statusDialogs.some(d => d.id === card.label) }"
              :style="{ '--card-color': card.color }"
              @pointerdown.stop
              @click="!isFullscreen('status') && openStatusDialog(card, $event)">
              <!-- 卡片头部：标签 + 数量 -->
              <div class="status-card-head">
                <span class="stat-label-text">{{ card.label }}</span>
                <span class="dt-num stat-value-text">{{ card.count }}</span>
              </div>
              <!-- 全屏模式下展示车组号列表 -->
              <div v-if="isFullscreen('status')" class="status-card-nums" @click.stop>
                <span v-if="card.nums.length === 0" class="status-card-empty">暂无车组</span>
                <span v-for="num in card.nums" :key="num" class="dt-num status-card-chip">{{ num }}</span>
              </div>
            </div>
          </div>
          <button v-if="!isFullscreen('status')" type="button" class="panel-resize-handle" @pointerdown.stop="onResizeStart('status', $event)" aria-label="调整检修状态面板大小"></button>
        </div>
      </PanelFrame>
    </div>
  </Transition>

  <!-- 交路/车组 -->
  <Transition name="panel-fade-scale">
    <div v-if="panelVisibility.route" ref="refRoute" class="panel-shell pointer-events-auto" :class="{ 'is-fullscreen': isFullscreen('route') }" :style="getPanelStyle('route')" @pointerdown="bringToFront('route')">
      <PanelFrame :bg-color="'rgba(6,30,18,0.35)'" :show-close="true" class="h-full" @close="closePanel('route')">
        <div class="sci-panel panel-route p-2.5 flex flex-col gap-1.5 relative h-full" :style="{ ...getPanelContentStyle('route'), overflow: 'hidden', touchAction: 'none' }" @pointerdown="onDragStart('route', $event)">
          <div class="sci-scanline panel-scanline-route"></div>
          <div class="flex items-center justify-between gap-2 shrink-0 cursor-move select-none">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="inline-block w-[3px] h-[14px] rounded-sm bg-green-400 sci-glow-bar-green"></span>
              <span class="panel-title-text">交路/车组</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="panel-drag-text">{{ isFullscreen('route') ? '全屏中' : '拖动' }}</span>
              <button type="button" class="panel-action-btn panel-popup-btn" @pointerdown.stop @click.stop="popupPanel('route')">↗</button>
              <button type="button" class="panel-action-btn" @pointerdown.stop @click.stop="toggleFullscreen('route')">{{ isFullscreen('route') ? '还原' : '全屏' }}</button>
              <button v-if="!isFullscreen('route')" type="button" class="panel-action-btn" style="margin-right: 32px" @pointerdown.stop @click.stop="toggleCollapse('route')">{{ isCollapsed('route') ? '展开' : '收起' }}</button>
            </div>
          </div>
          <div v-show="!isCollapsed('route')" ref="routeTableWrapRef" class="min-h-0 route-table-wrap" style="overflow: auto; flex: 1;" @mouseenter="onRouteWrapEnter" @mouseleave="onRouteWrapLeave">
            <table class="route-unified-table w-full">
              <colgroup>
                <col style="width: calc(80px * var(--panel-compact-scale, 1));" />
                <col v-for="(h, i) in routeHeaders" :key="'col-' + i" />
              </colgroup>
              <thead class="route-sticky-head">
              <tr>
                <th class="route-th route-th-first">车次</th>
                <th v-for="h in routeHeaders" :key="h" class="route-th">{{ h }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="row in routeData" :key="row.id" class="route-row">
                <td class="route-td route-td-id">{{ row.id }}</td>
                <td v-for="(col, cIdx) in row.cols" :key="cIdx" class="route-td">
                  <div class="route-cell-content">
                    <div v-for="car in col" :key="car.n" class="route-car-item">
                      <div class="flex items-center gap-[3px]">
                        <span v-if="car.dot" class="inline-block w-[6px] h-[6px] rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.7)]"></span>
                        <span class="dt-num route-cell-text">{{ car.n }}</span>
                      </div>
                      <img :src="TrainImg" alt="" class="route-train-icon h-auto opacity-75" />
                    </div>
                  </div>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
          <button v-if="!isFullscreen('route')" type="button" class="panel-resize-handle" @pointerdown.stop="onResizeStart('route', $event)" aria-label="调整交路车组面板大小"></button>
        </div>
      </PanelFrame>
    </div>
  </Transition>

  <!-- 检修状态详情弹窗（支持同时打开多个） -->
  <TransitionGroup name="status-dialog" tag="div" class="status-dialogs-layer">
    <div v-for="dlg in statusDialogs" :key="dlg.id"
      class="status-dialog" :style="{
        '--dialog-color': dlg.color,
        top: dlg.pos.top + 'px',
        left: dlg.pos.left + 'px',
        width: dlg.size.w + 'px',
        height: dlg.size.h + 'px',
        zIndex: dlg.zIndex,
      }"
      @pointerdown="bringDialogToFront(dlg.id)"
      @mouseenter="pauseSdScroll(dlg.id)" @mouseleave="resumeSdScroll(dlg.id)">
      <!-- 可拖拽的头部 -->
      <div class="status-dialog-header" @pointerdown="onSdDragStart(dlg.id, $event)">
        <span class="status-dialog-title">{{ dlg.title }}</span>
        <span class="status-dialog-count">共 {{ dlg.nums.length }} 组</span>
        <button class="status-dialog-close" @pointerdown.stop @click="closeStatusDialog(dlg.id)">✕</button>
      </div>
      <!-- 可滚动的内容区：超出高度时自动滚动播放 -->
      <div class="status-dialog-body" :data-sd-id="dlg.id"
        @mouseenter="pauseSdScroll(dlg.id)" @mouseleave="resumeSdScroll(dlg.id)">
        <div v-if="dlg.nums.length === 0" class="status-dialog-empty">暂无车组数据</div>
        <div v-else class="status-dialog-list">
          <div v-for="num in dlg.nums" :key="num" class="status-dialog-item">
            <span class="status-dialog-train-icon">🚃</span>
            <span class="dt-num status-dialog-train-num">{{ num }}</span>
          </div>
        </div>
      </div>
      <!-- 右下角 resize 拖拽手柄 -->
      <div class="status-dialog-resize" @pointerdown="onSdResizeStart(dlg.id, $event)"></div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
/* ========== 面板进入/离开动画 ========== */
/* 用缩放 + 位移 + 模糊组合，营造大屏浮层弹出的科技感 */
.panel-fade-scale-enter-active { animation: panelFadeIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
.panel-fade-scale-leave-active { animation: panelFadeOut 0.25s ease-in forwards; }
@keyframes panelFadeIn {
  0% { opacity: 0; transform: scale(0.85) translateY(-10px); filter: blur(4px); }
  100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
}
@keyframes panelFadeOut {
  0% { opacity: 1; transform: scale(1); filter: blur(0); }
  100% { opacity: 0; transform: scale(0.9) translateY(-8px); filter: blur(3px); }
}

/* 数字类文本统一使用等宽字体，保证统计数字、车次编号对齐稳定 */
.dt-num {
  font-family: 'Courier New', 'JetBrains Mono', 'Consolas', monospace;
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* ========== 面板外壳 ========== */
/* 玻璃拟态底座：半透明背景、轻微模糊、内外阴影，用于组织/统计/状态/交路四类面板 */
.panel-shell {
  overflow: hidden;
  border-radius: 16px;
  background:
      linear-gradient(135deg, rgba(255, 255, 255, 0) 0%, transparent 40%, rgba(56, 189, 248, 0.02) 100%),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.04), transparent 50%),
      rgba(10, 15, 30, 0.12);
  backdrop-filter: blur(3px) saturate(1.4) brightness(1.02);
  -webkit-backdrop-filter: blur(5px) saturate(1) brightness(1.02);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
      0 0 0 0.5px rgba(255, 255, 255, 0.04),
      0 8px 32px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      inset 0 -1px 0 rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.4s ease, border-color 0.4s ease; /* 移除 transform 过渡，改用内联控制 */
}

/* 顶部细高光线，增强面板玻璃边缘质感 */
.panel-shell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.4s ease;
}

/* 鼠标悬停时提高边框和阴影层级，提示面板可拖拽/可操作 */
.panel-shell:hover {
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow:
      0 0 0 0.5px rgba(255, 255, 255, 0.1),
      0 12px 48px rgba(0, 0, 0, 0.3),
      0 4px 20px rgba(56, 189, 248, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      inset 0 -1px 0 rgba(0, 0, 0, 0.06);
}

.panel-shell:hover::before { opacity: 1; }

.org-panel, .sci-panel { padding: var(--panel-padding, 12px) !important; gap: var(--panel-gap, 8px) !important; }

.panel-org { border-top: 3px solid rgba(34, 211, 238, 0.7); box-shadow: inset 0 0 40px rgba(34, 211, 238, 0.06), inset 0 -1px 0 rgba(34, 211, 238, 0.08); }
.panel-scanline-org { display: block!important; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(34, 211, 238, 0.1) 0%, transparent 40%); pointer-events: none; z-index: 0; }
.panel-stat { border-top: 3px solid rgba(234, 179, 8, 0.7); box-shadow: inset 0 0 40px rgba(234, 179, 8, 0.06), inset 0 -1px 0 rgba(234, 179, 8, 0.08); }
.panel-scanline-stat { display: block!important; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(234, 179, 8, 0.1) 0%, transparent 40%); pointer-events: none; z-index: 0; }
.panel-status { border-top: 3px solid rgba(251, 146, 36, 0.7); box-shadow: inset 0 0 40px rgba(251, 146, 36, 0.06), inset 0 -1px 0 rgba(251, 146, 36, 0.08); }
.panel-scanline-status { display: block!important; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(251, 146, 36, 0.1) 0%, transparent 40%); pointer-events: none; z-index: 0; }
.panel-route { border-top: 3px solid rgba(74, 222, 128, 0.7); box-shadow: inset 0 0 40px rgba(74, 222, 128, 0.06), inset 0 -1px 0 rgba(74, 222, 128, 0.08); }
.panel-scanline-route { display: block!important; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(74, 222, 128, 0.1) 0%, transparent 40%); pointer-events: none; z-index: 0; }

.panel-shell.is-fullscreen { z-index: 1000; }
.panel-shell.is-fullscreen .org-panel,
.panel-shell.is-fullscreen .sci-panel { overflow: auto; }
.panel-shell.is-fullscreen .org-grid,
.panel-shell.is-fullscreen .info-scroll-area,
.panel-shell.is-fullscreen .bottom-scroll-area,
.panel-shell.is-fullscreen .route-table-wrap { flex: 1; min-height: 0; }

.panel-drag-text { font-size: var(--panel-drag-font-size, 11px); color: #94a3b8; letter-spacing: 0.04em; }
.panel-action-btn { padding: 5px 14px; font-size: var(--panel-action-font-size, 12px); font-weight: 500; letter-spacing: 0.02em; color: #e2e8f0; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px; transition: all 0.2s ease; }
.panel-action-btn:hover { background: rgba(51, 65, 85, 0.9); border-color: rgba(148, 163, 184, 0.4); color: #f8fafc; }
.panel-shell.is-fullscreen .panel-action-btn:last-child { margin-right: 32px; }
.panel-popup-btn { padding: 3px 8px; font-size: 14px;  cursor: pointer; }
.panel-resize-handle { position: absolute; right: 8px; bottom: 8px; width: 16px; height: 16px; border: 0; padding: 0; cursor: nwse-resize; background: rgba(148, 163, 184, 0.2); border-radius: 4px; opacity: 0.6; transition: opacity 0.2s; touch-action: none; }
.panel-resize-handle:hover { opacity: 1; background: rgba(148, 163, 184, 0.35); }
.panel-title-text { font-size: var(--title-font-size, 14px); font-weight: 600; letter-spacing: 0.02em; color: #f1f5f9; -webkit-font-smoothing: antialiased; }

.org-grid { display: grid; row-gap: calc(5px * var(--panel-compact-scale, 1)); column-gap: calc(5px * var(--panel-compact-scale, 1)); overflow-y: auto; min-height: 0; flex: 1; }

/* ===== 6色循环：卡片主题色 ===== */
.org-grid-cell:nth-child(6n+1) { --cell-color: 34, 211, 238; }
.org-grid-cell:nth-child(6n+2) { --cell-color: 74, 222, 128; }
.org-grid-cell:nth-child(6n+3) { --cell-color: 251, 191, 36; }
.org-grid-cell:nth-child(6n+4) { --cell-color: 244, 114, 182; }
.org-grid-cell:nth-child(6n+5) { --cell-color: 168, 85, 247; }
.org-grid-cell:nth-child(6n+6) { --cell-color: 56, 189, 248; }

/* ===== 科技感卡片单元格 ===== */
.org-grid-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 5px;
  background: linear-gradient(180deg, rgba(var(--cell-color, 34,211,238), 0.06) 0%, rgba(15, 32, 58, 0.35) 100%);
  border: 1px solid rgba(var(--cell-color, 34,211,238), 0.12);
  border-radius: 10px;
  transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
}
.org-grid-cell:hover {
  border-color: rgba(var(--cell-color, 34,211,238), 0.35);
  box-shadow: 0 0 12px rgba(var(--cell-color, 34,211,238), 0.12);
  background: linear-gradient(180deg, rgba(var(--cell-color, 34,211,238), 0.1) 0%, rgba(15, 32, 58, 0.4) 100%);
}

/* ===== 角色胶囊徽章 ===== */
.org-role-badge {
  display: inline-block;
  padding: 2px 10px;
  font-size: calc(10px * var(--panel-compact-scale, 1));
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.04em;
  color: #e0f2fe;
  background: linear-gradient(135deg, rgba(var(--cell-color, 34,211,238), 0.35), rgba(var(--cell-color, 34,211,238), 0.15));
  border: 1px solid rgba(var(--cell-color, 34,211,238), 0.4);
  border-radius: 10px;
  white-space: nowrap;
  text-shadow: 0 0 6px rgba(var(--cell-color, 34,211,238), 0.4);
  box-shadow: inset 0 0 8px rgba(var(--cell-color, 34,211,238), 0.08);
  transition: all 0.25s ease;
}
.org-grid-cell:hover .org-role-badge {
  border-color: rgba(var(--cell-color, 34,211,238), 0.65);
  box-shadow: inset 0 0 12px rgba(var(--cell-color, 34,211,238), 0.15), 0 0 8px rgba(var(--cell-color, 34,211,238), 0.15);
}

/* ===== 人员 ===== */
.org-person {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

/* ===== 人员列表居中换行 ===== */
.org-person-list {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 5px;
}

/* ===== 头像容器 ===== */
.org-avatar-wrap {
  position: relative;
  width: var(--avatar-size, 30px);
  height: var(--avatar-size, 30px);
}

/* ===== 头像 ===== */
.org-avatar {
  width: var(--avatar-size, 30px);
  height: var(--avatar-size, 30px);
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(var(--cell-color, 34,211,238), 0.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.org-person:hover .org-avatar {
  transform: scale(1.08);
  border-color: rgba(var(--cell-color, 34,211,238), 0.7);
  box-shadow: 0 4px 16px rgba(var(--cell-color, 34,211,238), 0.25);
}

/* ===== 光圈 ===== */
.org-avatar-ring {
  display: block;
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid rgba(var(--cell-color, 34,211,238), 0.35);
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: none;
  mask-image: radial-gradient(circle, transparent 70%, black 71%, black 100%);
  -webkit-mask-image: radial-gradient(circle, transparent 70%, black 71%, black 100%);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  background: linear-gradient(135deg, rgba(var(--cell-color, 34,211,238), 0.6), rgba(var(--cell-color, 34,211,238), 0.2));
}
.org-person:hover .org-avatar-ring {
  opacity: 1;
  transform: scale(1.08);
  border-color: rgba(var(--cell-color, 34,211,238), 0.7);
  box-shadow: 0 0 16px rgba(var(--cell-color, 34,211,238), 0.6), inset 0 0 8px rgba(var(--cell-color, 34,211,238), 0.15);
}

/* ===== 人员姓名 ===== */
.org-person-name {
  font-size: calc(10px * var(--panel-compact-scale, 1));
  font-weight: 500;
  line-height: 1.2;
  color: #cbd5e1;
  transition: color 0.2s ease;
  text-align: center;
}
.org-person:hover .org-person-name {
  color: #e0f2fe;
}

.org-glow-bar { background: linear-gradient(180deg, #38bdf8, #0ea5e9); box-shadow: 0 0 8px rgba(56, 189, 248, 0.6); }
.org-glow-bar-neon { background: linear-gradient(180deg, #d9f105, #e8ed55); box-shadow: 0 0 8px rgba(155, 182, 60, 0.6); }
.org-scanline, .sci-scanline { display: contents; }
.sci-glow-bar-amber { background: linear-gradient(180deg, #fbbf24, #f59e0b); box-shadow: 0 0 8px rgba(251, 191, 36, 0.6); }
.sci-glow-bar-green { background: linear-gradient(180deg, #4ade80, #22c55e); box-shadow: 0 0 8px rgba(74, 222, 128, 0.6); }
.stat-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 10px 20px 12px;
  border-radius: 10px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--card-color, #38bdf8) 14%, transparent) 0%, rgba(15, 32, 58, 0.55) 70%);
  border: 1px solid color-mix(in srgb, var(--card-color, #38bdf8) 28%, transparent);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--card-color, #38bdf8), transparent);
  box-shadow: 0 0 8px var(--card-color, #38bdf8);
  opacity: 0.9;
}
.stat-card::after {
  content: '';
  position: absolute;
  inset: -50% -50% auto auto;
  width: 90%;
  height: 90%;
  background: radial-gradient(circle, color-mix(in srgb, var(--card-color, #38bdf8) 22%, transparent) 0%, transparent 60%);
  pointer-events: none;
}
.stat-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--card-color, #38bdf8) 55%, transparent);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35), 0 0 18px color-mix(in srgb, var(--card-color, #38bdf8) 30%, transparent);
}
.status-row {
  --row-color: #fbbf24;
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 14px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(15, 32, 58, 0.55) 0%, rgba(15, 32, 58, 0.35) 100%);
  border: 1px solid rgba(var(--row-color-rgb, 251, 191, 36), 0.18);
  transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
  overflow: hidden;
}
.status-row::before {
  content: '';
  position: absolute;
  left: 0; top: 6px; bottom: 6px;
  width: 3px;
  border-radius: 2px;
  background: var(--row-color);
  box-shadow: 0 0 8px var(--row-color);
  opacity: 0.85;
}
.status-row:hover {
  transform: translateX(2px);
  border-color: rgba(var(--row-color-rgb, 251, 191, 36), 0.45);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), 0 0 12px rgba(var(--row-color-rgb, 251, 191, 36), 0.12);
}
.status-row-amber { --row-color: #f59e0b; --row-color-rgb: 245, 158, 11; }
.status-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  flex: 1;
  max-height: var(--status-chip-list-max-height, calc(52px * var(--panel-compact-scale, 1)));
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(to bottom, black 0%, black 78%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 78%, transparent 100%);
}
.status-chip-list::-webkit-scrollbar { display: none; }
.panel-shell.is-fullscreen .status-chip-list {
  max-height: none;
}
.stat-num { animation: none; }
.stat-label-text {
  position: relative;
  z-index: 1;
  font-size: calc(11px * var(--panel-compact-scale, 1));
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--card-color, #94a3b8);
  opacity: 0.95;
  -webkit-font-smoothing: antialiased;
}
.stat-value-text {
  position: relative;
  z-index: 1;
  font-size: calc(26px * var(--panel-scale, 1));
  font-weight: 800;
  line-height: 1;
  color: var(--card-color, #f1f5f9);
  text-shadow: 0 0 12px color-mix(in srgb, var(--card-color, #38bdf8) 45%, transparent), 0 1px 2px rgba(0, 0, 0, 0.5);
  -webkit-font-smoothing: antialiased;
}
.info-scroll-area {
  min-height: var(--info-scroll-max-height, 48px);
  height: 100%;
  padding: 20px 8px;
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(234, 179, 8, 0.05), rgba(15, 32, 58, 0.3));
  border: 1px solid rgba(234, 179, 8, 0.18);
  mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
}
/* ========== 信息滚动文字样式 ========== */
/* 重点信息滚动文字 */
.info-scroll-text { 
  /* 字号：12px，根据面板缩放比例调整 */
  font-size: calc(12px * var(--panel-compact-scale, 1)); 
  /* 字重：500，中等 */
  font-weight: 500; 
  /* 字间距：0.02em */
  letter-spacing: 0.02em; 
}

/* 滚动轨道 */
.info-scroll-track { 
  /* 初始位置：Y 轴 0 */
  transform: translateY(0); 
}

/* 滚动中的轨道动画 */
.info-scroll-area.is-scrolling .info-scroll-track { 
  /* 动画：向上滚动，12s 循环 */
  animation: scroll-up 12s linear infinite; 
}

/* 向上滚动动画关键帧 */
@keyframes scroll-up { 
  /* 起始：Y 轴 0 */
  0% { transform: translateY(0); } 
  /* 结束：Y 轴 -50%，滚动一个周期 */
  100% { transform: translateY(-50%); } 
}

/* 滚动区域悬停时暂停动画 */
.info-scroll-area.is-scrolling:hover .info-scroll-track { 
  /* 动画暂停 */
  animation-play-state: paused; 
}

/* ========== 状态标签文字样式 ========== */
/* 检修状态标签文字 */
.status-label-text {
  /* 最小宽度：56px */
  min-width: 56px;
  /* 字号：11px，根据面板缩放比例调整 */
  font-size: calc(11px * var(--panel-compact-scale, 1));
  /* 字重：700，加粗 */
  font-weight: 700;
  /* 行高：1.2 */
  line-height: 1.2;
  /* 字间距：0.04em */
  letter-spacing: 0.04em;
  /* 文字颜色：浅灰色 */
  color: #e2e8f0;
  /* 禁止换行 */
  white-space: nowrap;
  /* 文字阴影：根据行颜色动态设置 */
  text-shadow: 0 0 6px rgba(var(--row-color-rgb, 251, 191, 36), 0.25);
  /* 字体平滑 */
  -webkit-font-smoothing: antialiased;
}

/* 短标签文字 */
.status-label-text-short { 
  /* 最小宽度：48px */
  min-width: 48px; 
}

/* ========== 状态芯片样式 ========== */
/* 检修状态芯片 */
.status-chip {
  /* 内边距：根据面板缩放比例调整 */
  padding: calc(1px * var(--panel-compact-scale, 1)) calc(5px * var(--panel-compact-scale, 1));
  /* 字号：9px，根据面板缩放比例调整 */
  font-size: calc(9px * var(--panel-compact-scale, 1));
  /* 字重：700，加粗 */
  font-weight: 700;
  /* 行高：1.1 */
  line-height: 1.1;
  /* 圆角：5px */
  border-radius: 5px;
  /* 字间距：0.02em */
  letter-spacing: 0.02em;
  /* 字体平滑 */
  -webkit-font-smoothing: antialiased;
  /* 过渡动画：0.2s */
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

/* 状态芯片悬停状态 */
.status-chip:hover { 
  /* 向上移动 1px */
  transform: translateY(-1px); 
}

/* ========== 琥珀色状态芯片 ========== */
/* 琥珀色状态芯片（整修等） */
.status-chip-amber {
  /* 文字颜色：浅黄色 */
  color: #fde68a;
  /* 背景：琥珀色渐变 */
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(245, 158, 11, 0.08));
  /* 边框：琥珀色，1px */
  border: 1px solid rgba(245, 158, 11, 0.45);
  /* 阴影：琥珀色发光 */
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.1);
}
.bottom-scroll-area::-webkit-scrollbar { width: 6px; height: 6px; }
.bottom-scroll-area::-webkit-scrollbar-track { background: rgba(15, 32, 58, 0.5); border-radius: 3px; }
.bottom-scroll-area::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.35); border-radius: 3px; }
.bottom-scroll-area::-webkit-scrollbar-thumb:hover { background: rgba(56, 189, 248, 0.5); }
.status-auto-scroll-area { scrollbar-width: none; -ms-overflow-style: none; }
.status-auto-scroll-area::-webkit-scrollbar { display: none; }
.route-table-wrap { overflow: auto; border-radius: 8px; scrollbar-width: none; -ms-overflow-style: none; }
.route-table-wrap::-webkit-scrollbar { display: none; }
/* ===== 交路/车组表格 ===== */
.route-unified-table {
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid rgba(74, 222, 128, 0.22);
  border-radius: 10px;
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.06), inset 0 0 30px rgba(15, 32, 58, 0.4);
}
.route-sticky-head {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: linear-gradient(180deg, rgba(15, 40, 30, 0.98) 0%, rgba(20, 50, 35, 0.95) 100%);
}
.route-th {
  padding: calc(9px * var(--panel-compact-scale, 1)) calc(6px * var(--panel-compact-scale, 1));
  font-size: calc(12px * var(--panel-compact-scale, 1));
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
  color: #86efac;
  background: linear-gradient(180deg, rgba(15, 50, 35, 0.85), rgba(15, 32, 58, 0.85));
  border-bottom: 1px solid rgba(74, 222, 128, 0.4);
  border-right: 1px solid rgba(74, 222, 128, 0.12);
  text-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
}
.route-th:last-child { border-right: none; }
.route-th-first {
  color: #fcd34d;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
}
.route-row { transition: background 0.25s ease, box-shadow 0.25s ease; }
.route-row:nth-child(even) { background: rgba(74, 222, 128, 0.025); }
.route-row:hover {
  background: linear-gradient(90deg, rgba(74, 222, 128, 0.12) 0%, rgba(74, 222, 128, 0.04) 100%);
  box-shadow: inset 3px 0 0 rgba(74, 222, 128, 0.7), inset 0 0 20px rgba(74, 222, 128, 0.06);
}
.route-td {
  border-bottom: 1px solid rgba(74, 222, 128, 0.1);
  border-right: 1px solid rgba(74, 222, 128, 0.06);
  padding: calc(7px * var(--panel-compact-scale, 1)) calc(5px * var(--panel-compact-scale, 1));
  vertical-align: middle;
  overflow: hidden;
}
.route-td:last-child { border-right: none; }
.route-row:last-child .route-td { border-bottom: none; }
.route-td-id {
  font-size: calc(13px * var(--panel-compact-scale, 1));
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0; /* 配合 colgroup 固定列宽实现省略号截断 */
  color: #fcd34d;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.5), 0 1px 1px rgba(0,0,0,0.7);
  text-align: center;
  letter-spacing: 0.06em;
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.1), transparent 80%);
}
.route-cell-content { display: flex; gap: calc(6px * var(--panel-compact-scale, 1)); flex-wrap: wrap; justify-content: center; align-items: center; }
.route-car-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(2px * var(--panel-compact-scale, 1));
  padding: calc(2px * var(--panel-compact-scale, 1)) calc(4px * var(--panel-compact-scale, 1));
  border-radius: 6px;
  transition: background 0.2s ease;
}
.route-car-item:hover { background: rgba(74, 222, 128, 0.08); }
.route-cell-text {
  font-size: calc(11px * var(--panel-compact-scale, 1));
  font-weight: 800;
  color: #d1fae5;
  white-space: nowrap;
  text-shadow: 0 0 4px rgba(74, 222, 128, 0.4), 0 1px 1px rgba(0,0,0,0.6);
}
.route-train-icon {
  width: calc(34px * var(--panel-compact-scale, 1));
  transition: all 0.3s;
  filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.3));
  opacity: 0.8;
}
.route-car-item:hover .route-train-icon {
  opacity: 1;
  filter: drop-shadow(0 0 8px rgba(74, 222, 128, 0.7));
  transform: translateX(2px);
}

/* ===== 1K 屏幕适配：缩小今日值班卡片 ===== */
@media (max-width: 1400px) {
  .org-grid { row-gap: 3px; column-gap: 3px; }
  .org-grid-cell { gap: 2px; padding: 4px 3px; border-radius: 6px; }
  .org-role-badge { padding: 1px 6px; font-size: 9px; border-radius: 6px; }
  .org-person-list { gap: 3px; }
  .org-avatar-wrap, .org-avatar { width: 24px; height: 24px; }
  .org-avatar { border-width: 1.5px; }
  .org-avatar-ring { inset: -2px; border-width: 1.5px; }
  .org-person-name { font-size: 9px; }
}

/* 2K 适配 */
@media (min-width: 2500px) {
  .panel-title-text { font-size: calc(var(--title-font-size, 14px) * 1.25); }
  .panel-action-btn { padding: 6px 18px; font-size: calc(var(--panel-action-font-size, 12px) * 1.2); }
  .panel-drag-text { font-size: calc(var(--panel-drag-font-size, 11px) * 1.2); }
  .stat-label-text { font-size: calc(13px * var(--panel-compact-scale, 1)); }
  .stat-value-text { font-size: calc(28px * var(--panel-scale, 1)); }
  .org-role-badge { font-size: calc(13px * var(--panel-compact-scale, 1)); }
  .org-person-name { font-size: calc(13px * var(--panel-compact-scale, 1)); }
  .status-label-text { font-size: calc(12px * var(--panel-compact-scale, 1)); }
  .status-chip { font-size: calc(10px * var(--panel-compact-scale, 1)); }
  .route-th { padding: calc(12px * var(--panel-compact-scale, 1)) calc(10px * var(--panel-compact-scale, 1)); font-size: calc(14px * var(--panel-compact-scale, 1)); }
  .route-td { padding: calc(10px * var(--panel-compact-scale, 1)) calc(8px * var(--panel-compact-scale, 1)); }
  .route-td-id { font-size: calc(15px * var(--panel-compact-scale, 1)); }
  .route-cell-text { font-size: calc(13px * var(--panel-compact-scale, 1)); }
  .route-train-icon { width: calc(44px * var(--panel-compact-scale, 1)); }
  .info-scroll-text { font-size: calc(14px * var(--panel-compact-scale, 1)); }
}

/* 4K 适配 */
@media (min-width: 3800px) {
  .panel-title-text { font-size: calc(var(--title-font-size, 14px) * 1.6); }
  .panel-action-btn { padding: 8px 22px; font-size: calc(var(--panel-action-font-size, 12px) * 1.5); }
  .panel-drag-text { font-size: calc(var(--panel-drag-font-size, 11px) * 1.5); }
  .stat-label-text { font-size: calc(16px * var(--panel-compact-scale, 1)); }
  .stat-value-text { font-size: calc(36px * var(--panel-scale, 1)); }
  .org-role-badge { font-size: calc(16px * var(--panel-compact-scale, 1)); }
  .org-person-name { font-size: calc(15px * var(--panel-compact-scale, 1)); }
  .org-avatar { border-width: 3px; }
  .status-label-text { font-size: calc(14px * var(--panel-compact-scale, 1)); min-width: 64px; }
  .status-chip { font-size: calc(11px * var(--panel-compact-scale, 1)); padding: calc(2px * var(--panel-compact-scale, 1)) calc(5px * var(--panel-compact-scale, 1)); }
  .route-th { padding: calc(14px * var(--panel-compact-scale, 1)) calc(12px * var(--panel-compact-scale, 1)); font-size: calc(16px * var(--panel-compact-scale, 1)); }
  .route-td { padding: calc(12px * var(--panel-compact-scale, 1)) calc(10px * var(--panel-compact-scale, 1)); }
  .route-td-id { font-size: calc(18px * var(--panel-compact-scale, 1)); }
  .route-cell-text { font-size: calc(15px * var(--panel-compact-scale, 1)); }
  .route-train-icon { width: calc(56px * var(--panel-compact-scale, 1)); }
  .info-scroll-text { font-size: calc(16px * var(--panel-compact-scale, 1)); }
  .panel-resize-handle { width: 22px; height: 22px; }
}

/* ========== 检修状态卡片网格 ========== */
/* 卡片网格容器：自适应换行，每行最多 3 列 */
.status-card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
}

/* 检修状态卡片：标准方形外观，覆盖 stat-card 的弧度/光晕效果 */
.status-stat-card {
  cursor: pointer;
  border-radius: 6px; /* 圆角减小，更接近标准长方形 */
  /* 均匀的渐变背景：从上到下，避免对角线视觉弧度 */
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--card-color, #38bdf8) 16%, rgba(15, 32, 58, 0.5)) 0%,
    rgba(15, 32, 58, 0.55) 100%);
}
/* 去掉右上角的径向光晕（::after 弧形发光） */
.status-stat-card::after {
  display: none;
}

/* 弹窗已打开时卡片的激活状态：边框高亮 + 微上浮 + 呼吸脉冲 */
.status-stat-card-active {
  border-color: color-mix(in srgb, var(--card-color, #fbbf24) 60%, transparent);
  box-shadow:
    0 0 12px color-mix(in srgb, var(--card-color, #fbbf24) 25%, transparent),
    inset 0 0 16px color-mix(in srgb, var(--card-color, #fbbf24) 8%, transparent);
  transform: translateY(-2px);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--card-color, #fbbf24) 24%, rgba(15, 32, 58, 0.5)) 0%,
    rgba(15, 32, 58, 0.55) 100%);
  animation: statusCardPulse 2s ease-in-out infinite;
}
@keyframes statusCardPulse {
  0%, 100% { box-shadow: 0 0 12px color-mix(in srgb, var(--card-color, #fbbf24) 25%, transparent), inset 0 0 16px color-mix(in srgb, var(--card-color, #fbbf24) 8%, transparent); }
  50% { box-shadow: 0 0 20px color-mix(in srgb, var(--card-color, #fbbf24) 35%, transparent), inset 0 0 20px color-mix(in srgb, var(--card-color, #fbbf24) 12%, transparent); }
}

/* 卡片头部：标签 + 数量（全屏与非全屏都用） */
.status-card-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 3px;
  width: 100%;
}

/* 全屏模式：固定 3 列，避免单行过于紧凑 */
.status-card-grid.is-fullscreen-grid {
  grid-template-columns: repeat(3, 1fr);
  align-content: start;
  gap: 16px;
  padding: 8px;
}
/* 中等屏幕降为 2 列 */
@media (max-width: 1280px) {
  .status-card-grid.is-fullscreen-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
/* 小屏单列 */
@media (max-width: 768px) {
  .status-card-grid.is-fullscreen-grid {
    grid-template-columns: 1fr;
  }
}

/* 全屏展开卡片：纵向布局，可显示车组列表 */
.status-stat-card-expanded {
  cursor: default;
  flex-direction: column;
  align-items: stretch;
  padding: 18px 20px;
  min-height: 200px;
}
.status-stat-card-expanded:hover {
  transform: none;
}
.status-stat-card-expanded .status-card-head {
  padding-bottom: 10px;
  border-bottom: 1px dashed color-mix(in srgb, var(--card-color, #fbbf24) 25%, transparent);
  margin-bottom: 10px;
  flex-direction: row;
  justify-content: space-between;
}
.status-stat-card-expanded .stat-value-text {
  font-size: 22px;
}

/* 全屏模式下卡片内的车组号列表 */
.status-card-nums {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  cursor: default;
  max-height: 100%;
  overflow-y: auto;
  padding-right: 2px;
}
.status-card-nums::-webkit-scrollbar { width: 4px; }
.status-card-nums::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

/* 卡片内单个车组号芯片 */
.status-card-chip {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  color: var(--card-color, #fbbf24);
  background: color-mix(in srgb, var(--card-color, #fbbf24) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--card-color, #fbbf24) 35%, transparent);
  letter-spacing: 0.3px;
}

/* 空状态提示 */
.status-card-empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
}

/* ========== 检修状态详情弹窗（多弹窗） ========== */
/* 多弹窗容器层：不阻挡底层交互 */
.status-dialogs-layer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
}

/* 弹窗容器：半透明毛玻璃效果，恢复鼠标事件 */
.status-dialog {
  position: fixed;
  pointer-events: auto;
  background: linear-gradient(160deg, rgba(10, 20, 45, 0.72) 0%, rgba(8, 15, 35, 0.78) 100%);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid color-mix(in srgb, var(--dialog-color, #fbbf24) 30%, rgba(255,255,255,0.08));
  border-radius: 14px;
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.45),
    0 0 24px color-mix(in srgb, var(--dialog-color, #fbbf24) 10%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 0 30px rgba(255, 255, 255, 0.02);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 弹窗顶部装饰线 */
.status-dialog::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent 5%, var(--dialog-color, #fbbf24) 50%, transparent 95%);
  box-shadow: 0 0 16px var(--dialog-color, #fbbf24);
  opacity: 0.85;
}
/* 弹窗顶部微光晕 */
.status-dialog::after {
  content: '';
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 80px;
  background: radial-gradient(ellipse, color-mix(in srgb, var(--dialog-color, #fbbf24) 15%, transparent) 0%, transparent 70%);
  pointer-events: none;
}

/* 弹窗头部：可拖拽，半透明底色 */
.status-dialog-header {
  /* 触摸屏下禁止默认手势，保证 pointer 事件连续 */
  touch-action: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px 11px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%);
  position: relative;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}

/* 弹窗标题 */
.status-dialog-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--dialog-color, #fbbf24);
  text-shadow: 0 0 12px color-mix(in srgb, var(--dialog-color, #fbbf24) 35%, transparent);
  letter-spacing: 0.5px;
}

/* 弹窗数量统计 */
.status-dialog-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: auto;
  margin-right: 32px;
}

/* 弹窗关闭按钮 */
.status-dialog-close {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(4px);
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s;
}
.status-dialog-close:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.45);
  color: #f87171;
  transform: rotate(90deg);
}

/* 弹窗主体：可滚动 */
.status-dialog-body {
  padding: 12px 16px 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
/* 弹窗主体滚动条 */
.status-dialog-body::-webkit-scrollbar { width: 5px; }
.status-dialog-body::-webkit-scrollbar-track { background: transparent; }
.status-dialog-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
.status-dialog-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

/* 空状态提示 */
.status-dialog-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  padding: 30px 0;
}

/* 车组列表网格：按宽度自适应列数（最小列宽 110px） */
.status-dialog-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}

/* 车组列表项：卡片式设计 */
.status-dialog-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 8px;
  background: linear-gradient(145deg,
    color-mix(in srgb, var(--dialog-color, #fbbf24) 10%, rgba(255, 255, 255, 0.03)) 0%,
    rgba(0, 0, 0, 0.15) 100%);
  border: 1px solid color-mix(in srgb, var(--dialog-color, #fbbf24) 22%, rgba(255,255,255,0.06));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.2);
  transition: all 0.25s;
  overflow: hidden;
}
/* 左侧装饰条 */
.status-dialog-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--dialog-color, #fbbf24);
  box-shadow: 0 0 6px var(--dialog-color, #fbbf24);
  opacity: 0.8;
}
.status-dialog-item:hover {
  background: linear-gradient(145deg,
    color-mix(in srgb, var(--dialog-color, #fbbf24) 22%, rgba(255, 255, 255, 0.05)) 0%,
    rgba(0, 0, 0, 0.1) 100%);
  border-color: color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent);
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 4px 12px color-mix(in srgb, var(--dialog-color, #fbbf24) 20%, transparent);
}

/* 车组图标 */
.status-dialog-train-icon {
  font-size: 15px;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent));
}

/* 车组号 */
.status-dialog-train-num {
  font-size: 15px;
  font-weight: 600;
  color: var(--dialog-color, #fbbf24);
  text-shadow: 0 0 8px color-mix(in srgb, var(--dialog-color, #fbbf24) 35%, transparent);
  letter-spacing: 0.5px;
}

/* 右下角 resize 手柄 */
.status-dialog-resize {
  /* 触摸屏下禁止默认手势 */
  touch-action: none;
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  opacity: 0.35;
  transition: opacity 0.25s;
  /* 三条斜线表示 resize */
  background:
    linear-gradient(135deg, transparent 30%, color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent) 30%, color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent) 35%, transparent 35%),
    linear-gradient(135deg, transparent 50%, color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent) 50%, color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent) 55%, transparent 55%),
    linear-gradient(135deg, transparent 70%, color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent) 70%, color-mix(in srgb, var(--dialog-color, #fbbf24) 50%, transparent) 75%, transparent 75%);
}
.status-dialog-resize:hover {
  opacity: 0.8;
}

/* 弹窗进入/离开动画 */
.status-dialog-enter-active {
  animation: statusDialogIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
.status-dialog-leave-active {
  animation: statusDialogOut 0.2s ease-in forwards;
}
@keyframes statusDialogIn {
  0% { opacity: 0; transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes statusDialogOut {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.9); }
}
</style>