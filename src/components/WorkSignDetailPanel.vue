<!--
  WorkSignDetailPanel.vue — 股道作业标牌详情看板（班组作业 / 登顶作业）

  职责：
    - 监听 3D 场景派发的 window 'show-work-sign-detail' 事件
      （点击有车组列位的双侧统计标牌触发，见 three/SceneManager.js）
    - 以科技玻璃拟态浮层展示该列位的完整作业详情：
        · 顶部状态徽标（绿=无作业 / 红=有作业）
        · 统计卡（班组数 / 登顶数 / 班组总人数）
        · 班组作业明细列表（卡号、人数、有电、登记时间）
        · 登顶作业明细列表
    - 数据来源：交大机电聚合（api/jiaodaWork.js），由 store 注入到列位 slotXWork，
      点击时随事件 detail.work 透传，结构含 registerRecords / topRecords。
-->
<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { Close, Rank } from '@element-plus/icons-vue'

// 是否显示面板
const visible = ref(false)
// 当前作业聚合数据
const work = ref(null)
// 列位标识（slot1=一位 / slot2=二位）
const slot = ref('')
// 点击来源：'group'=班组牌 / 'top'=登顶牌（用于高亮对应区块）
const workType = ref('')

/** 列位中文名 */
const slotName = computed(() => (slot.value === 'slot1' ? '一位' : slot.value === 'slot2' ? '二位' : ''))

/** 班组作业明细 */
const registerRecords = computed(() => work.value?.registerRecords || [])
/** 登顶作业明细 */
const topRecords = computed(() => work.value?.topRecords || [])

/** 班组数 */
const groupCount = computed(() => work.value?.groupCount ?? registerRecords.value.length)
/** 登顶数 */
const topCount = computed(() => work.value?.topCount ?? topRecords.value.length)
/** 班组总人数 */
const workerCount = computed(() => work.value?.workerCount ?? 0)
/** 是否有作业（红色高亮） */
const hasWork = computed(() => groupCount.value > 0 || topCount.value > 0)

// ========== 拖动 + 缩放（与车组信息面板一致的交互） ==========
const panelRef = ref(null)
const dragOffset = ref({ x: 0, y: 0 })
const panelPos = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const hasBeenDragged = ref(false)

/**
 * 接收 3D 场景事件，打开看板
 * @param {CustomEvent} e - detail: { trackId, slot, work, hasWork, workType }
 */
function onShow(e) {
  const detail = e.detail || {}
  if (!detail.work) return
  work.value = detail.work
  slot.value = detail.slot || ''
  workType.value = detail.workType || ''
  // 每次打开复位到默认位置（右侧），用户可再次拖动
  hasBeenDragged.value = false
  panelPos.value = { x: 0, y: 0 }
  visible.value = true
}

/** 关闭看板 */
function close() {
  visible.value = false
}

function onDragStart(e) {
  // 鼠标只接受左键；触摸/笔不带 button
  if (e.pointerType === 'mouse' && e.button !== 0) return
  isDragging.value = true
  // 首次拖动：从 right 定位切换到 left 定位，读取当前实际位置
  if (!hasBeenDragged.value && panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect()
    panelPos.value = { x: rect.left, y: rect.top }
    hasBeenDragged.value = true
  }
  dragOffset.value = { x: e.clientX - panelPos.value.x, y: e.clientY - panelPos.value.y }
  try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
  document.addEventListener('pointercancel', onDragEnd)
  e.preventDefault()
}
function onDragMove(e) {
  if (!isDragging.value) return
  panelPos.value = { x: e.clientX - dragOffset.value.x, y: e.clientY - dragOffset.value.y }
}
function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
}

// 监听 3D 场景派发的标牌点击事件
window.addEventListener('show-work-sign-detail', onShow)
onBeforeUnmount(() => {
  window.removeEventListener('show-work-sign-detail', onShow)
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
})
</script>

<template>
  <Transition name="ws-panel-fade">
    <div
      v-if="visible && work"
      ref="panelRef"
      class="ws-panel-wrap"
      :style="{
        top: hasBeenDragged ? `${panelPos.y}px` : '50%',
        right: hasBeenDragged ? 'auto' : '32px',
        left: hasBeenDragged ? `${panelPos.x}px` : 'auto',
        transform: hasBeenDragged ? 'none' : 'translateY(-50%)',
      }"
    >
      <!-- 可拖动 + 可缩放容器（resize: both） -->
      <div class="ws-panel" :class="{ 'has-work': hasWork }">
        <!-- 头部（拖动手柄）：状态徽标 + 标题 + 关闭 -->
        <header class="ws-header" @pointerdown="onDragStart">
          <span class="ws-badge" :class="hasWork ? 'badge-on' : 'badge-off'">
            {{ hasWork ? '作业中' : '无作业' }}
          </span>
          <div class="ws-title">
            <h3>{{ work.trackName || '--' }} · {{ slotName }}</h3>
            <p>{{ work.trainNo || '--' }}</p>
          </div>
          <div class="ws-header-tools">
            <el-icon class="ws-move-hint"><Rank /></el-icon>
            <button class="ws-close-btn" @pointerdown.stop @click.stop="close">
              <el-icon :size="16"><Close /></el-icon>
            </button>
          </div>
        </header>

        <!-- 可滚动内容区 -->
        <div class="ws-body">
          <!-- 统计卡 -->
          <section class="ws-stats">
            <div class="ws-stat" :class="{ 'is-focus': workType === 'group' }">
              <div class="num">{{ groupCount }}</div>
              <div class="lbl">班组作业</div>
            </div>
            <div class="ws-stat danger" :class="{ 'is-focus': workType === 'top' }">
              <div class="num">{{ topCount }}</div>
              <div class="lbl">登顶作业</div>
            </div>
            <div class="ws-stat">
              <div class="num accent">{{ workerCount }}</div>
              <div class="lbl">班组人数</div>
            </div>
          </section>

          <!-- 班组作业明细 -->
          <section class="ws-section" :class="{ 'is-focus': workType === 'group' }">
            <div class="ws-section-title">
              <span class="dot dot-group"></span>班组作业（{{ registerRecords.length }}）
            </div>
            <ul v-if="registerRecords.length" class="ws-list">
              <li v-for="(r, i) in registerRecords" :key="'r' + i" class="ws-item">
                <div class="ws-item-main">
                  <span class="card-no">{{ r.cardNo || '作业卡' }}</span>
                  <span class="worker">{{ r.workerCount ?? '--' }} 人</span>
                </div>
                <div class="ws-item-sub">
                  <span class="chip" :class="r.isElectrified ? 'chip-on' : 'chip-off'">
                    {{ r.isElectrified ? '有电' : '无电' }}
                  </span>
                  <span class="time">{{ r.registerTimeStr || r.createTimeStr || '' }}</span>
                </div>
              </li>
            </ul>
            <div v-else class="ws-empty">当前无班组作业</div>
          </section>

          <!-- 登顶作业明细 -->
          <section class="ws-section" :class="{ 'is-focus': workType === 'top' }">
            <div class="ws-section-title danger">
              <span class="dot dot-top"></span>登顶作业（{{ topRecords.length }}）
            </div>
            <ul v-if="topRecords.length" class="ws-list">
              <li v-for="(r, i) in topRecords" :key="'t' + i" class="ws-item is-top">
                <div class="ws-item-main">
                  <span class="card-no">{{ r.cardNo || r.name || '登顶记录' }}</span>
                  <span v-if="r.workerCount != null" class="worker">{{ r.workerCount }} 人</span>
                </div>
                <div class="ws-item-sub">
                  <span class="time">{{ r.registerTimeStr || r.createTimeStr || '' }}</span>
                </div>
              </li>
            </ul>
            <div v-else class="ws-empty">当前无人登顶</div>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ========== 浮层定位容器（仅负责定位，尺寸交给 .ws-panel） ========== */
.ws-panel-wrap {
  position: fixed;
  z-index: 60;
  pointer-events: auto;
}

/* ========== 面板内容（可缩放：resize: both） ========== */
.ws-panel {
  /* 默认尺寸（偏小）+ 缩放约束，用户可拖拽右下角放大 */
  width: 320px;
  height: 400px;
  min-width: 280px;
  min-height: 220px;
  max-width: 90vw;
  max-height: 90vh;
  /* 原生缩放手柄（右下角拖拽改变大小） */
  resize: both;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #e2e8f0;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  /* 自带背景/边框（移除 PanelFrame 后需要） */
  background: linear-gradient(135deg, rgba(4, 18, 32, 0.96) 0%, rgba(8, 30, 52, 0.92) 50%, rgba(4, 18, 32, 0.96) 100%);
  border: 1px solid rgba(44, 247, 254, 0.4);
  border-top: 2px solid rgba(44, 247, 254, 0.6);
  border-radius: 10px;
  box-shadow: 0 0 40px rgba(44, 247, 254, 0.12), inset 0 0 24px rgba(44, 247, 254, 0.05);
}
/* 有作业：切换红色高亮主题 */
.ws-panel.has-work {
  border-color: rgba(248, 113, 113, 0.45);
  border-top-color: rgba(248, 113, 113, 0.8);
  box-shadow: 0 0 40px rgba(239, 68, 68, 0.14), inset 0 0 24px rgba(239, 68, 68, 0.08);
}

/* ========== 头部（拖动手柄） ========== */
.ws-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(44, 247, 254, 0.12);
  cursor: move;
  user-select: none;
  /* 触摸屏禁止默认手势，确保 pointer 事件连续 */
  touch-action: none;
}
.ws-header-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ws-move-hint { color: rgba(148, 163, 184, 0.5); font-size: 14px; }
.ws-close-btn {
  color: #64748b;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
  cursor: pointer;
}
.ws-close-btn:hover { color: #22d3ee; background: rgba(6, 182, 212, 0.12); }

/* ========== 可滚动内容区 ========== */
.ws-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 点击来源高亮：对应区块描边脉冲 */
.is-focus { outline: 1px solid rgba(34, 211, 238, 0.55); outline-offset: 2px; }
.ws-section.is-focus { border-radius: 8px; }
.ws-badge {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
}
.badge-off {
  background: rgba(34, 197, 94, 0.18);
  border: 1px solid rgba(34, 197, 94, 0.6);
  color: #86efac;
}
.badge-on {
  background: rgba(220, 38, 38, 0.2);
  border: 1px solid rgba(248, 113, 113, 0.7);
  color: #fca5a5;
  /* 作业中呼吸动画 */
  animation: ws-pulse 1.6s ease-in-out infinite;
}
@keyframes ws-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  50% { box-shadow: 0 0 12px 2px rgba(239, 68, 68, 0.55); }
}
.ws-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
}
.ws-title p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

/* ========== 统计卡 ========== */
.ws-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.ws-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 8px;
}
.ws-stat.danger {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(127, 29, 29, 0.18);
}
.ws-stat .num {
  font-size: 24px;
  font-weight: 800;
  color: #f1f5f9;
  line-height: 1;
}
.ws-stat .num.accent { color: #2cf7fe; }
.ws-stat.danger .num { color: #fca5a5; }
.ws-stat .lbl {
  font-size: 11px;
  color: #94a3b8;
}

/* ========== 明细区块 ========== */
.ws-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #cbd5e1;
  margin-bottom: 8px;
}
.ws-section-title.danger { color: #fca5a5; }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-group { background: #2cf7fe; }
.dot-top { background: #f87171; }

.ws-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ws-item {
  padding: 8px 10px;
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(71, 85, 105, 0.35);
  border-radius: 8px;
}
.ws-item.is-top {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(127, 29, 29, 0.14);
}
.ws-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ws-item-main .card-no {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}
.ws-item-main .worker {
  font-size: 13px;
  font-weight: 700;
  color: #2cf7fe;
}
.ws-item-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}
.ws-item-sub .time {
  font-size: 11px;
  color: #94a3b8;
}
.chip {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}
.chip-on {
  background: rgba(220, 38, 38, 0.18);
  border-color: rgba(248, 113, 113, 0.5);
  color: #fca5a5;
}
.chip-off {
  background: rgba(100, 116, 139, 0.18);
  border-color: rgba(100, 116, 139, 0.5);
  color: #cbd5e1;
}
.ws-empty {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: #64748b;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 8px;
}

/* ========== 进出场动画（仅淡入淡出，避免与拖动定位的 transform 冲突） ========== */
.ws-panel-fade-enter-active,
.ws-panel-fade-leave-active {
  transition: opacity 0.22s ease;
}
.ws-panel-fade-enter-from,
.ws-panel-fade-leave-to {
  opacity: 0;
}
</style>
