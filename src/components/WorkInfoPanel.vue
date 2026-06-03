<!--
  WorkInfoPanel.vue — 股道作业看板（作业班组 / 登顶作业）

  职责：
    - 监听 3D 场景派发的 window 'show-work-info' 事件（点击列位作业标记触发）
    - 以科技玻璃拟态浮层展示该列位的作业详情：班组、人数、卡号、部门、
      作业类型（地面/登顶）、有电无电、防溜状态、登记时间、作业人员名单
    - 登顶作业用红色高危主题强调

  数据来源：当前为 mock（mock/workMock.js），真实「交大机电」接口接入后由
  store 聚合的 workByTrack 提供，事件 detail.work 结构保持一致即可无缝切换。
-->
<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
// 统一科技面板边框容器
import PanelFrame from './PanelFrame.vue'

// 是否显示面板
const visible = ref(false)
// 当前作业数据
const work = ref(null)
// 列位标识（slot1=一位 / slot2=二位）
const slot = ref('')

/**
 * 列位中文名
 */
const slotName = computed(() => (slot.value === 'slot1' ? '一位' : slot.value === 'slot2' ? '二位' : ''))

/**
 * 是否登顶作业（高危主题）
 */
const isTop = computed(() => !!work.value?.isTop)

/**
 * 有电/无电文案
 */
const electText = computed(() => (work.value?.isElectrified ? '有电' : '无电'))

/**
 * 防溜文案
 */
const antiSlipText = computed(() => (work.value?.antiSlip ? '已防溜' : '未防溜'))

/**
 * 作业人员名单
 */
const workers = computed(() => work.value?.workers || [])

/**
 * 接收 3D 场景事件，打开看板
 * @param {CustomEvent} e - detail: { trackId, slot, work }
 */
function onShow(e) {
  const detail = e.detail || {}
  if (!detail.work) return
  work.value = detail.work
  slot.value = detail.slot || ''
  visible.value = true
}

/**
 * 关闭看板
 */
function close() {
  visible.value = false
}

// 监听 3D 场景派发的作业点击事件
window.addEventListener('show-work-info', onShow)
onBeforeUnmount(() => window.removeEventListener('show-work-info', onShow))
</script>

<template>
  <Transition name="work-panel-fade">
    <div v-if="visible && work" class="work-panel-wrap">
      <PanelFrame bg-color="rgba(8,17,32,0.92)" :show-close="true" @close="close">
        <div class="work-panel" :class="{ 'is-top': isTop }">
          <!-- 头部：作业类型徽标 + 标题 -->
          <header class="wp-header">
            <span class="wp-badge" :class="isTop ? 'badge-top' : 'badge-ground'">
              {{ isTop ? '登顶作业' : '地面作业' }}
            </span>
            <div class="wp-title">
              <h3>作业信息看板</h3>
              <p>{{ work.trainNo || '--' }} · {{ slotName }}</p>
            </div>
          </header>

          <!-- 核心信息卡 -->
          <section class="wp-grid">
            <div class="wp-cell">
              <label>作业班组</label>
              <span class="strong">{{ work.crew || '--' }}</span>
            </div>
            <div class="wp-cell">
              <label>作业人数</label>
              <span class="strong accent">{{ work.workerCount ?? '--' }} 人</span>
            </div>
            <div class="wp-cell">
              <label>作业卡号</label>
              <span>{{ work.cardNo || '--' }}</span>
            </div>
            <div class="wp-cell">
              <label>所属部门</label>
              <span>{{ work.dept || '--' }}</span>
            </div>
          </section>

          <!-- 状态标签 -->
          <section class="wp-chips">
            <span class="chip" :class="work.isElectrified ? 'chip-on' : 'chip-off'">{{ electText }}</span>
            <span class="chip" :class="work.antiSlip ? 'chip-on' : 'chip-warn'">{{ antiSlipText }}</span>
            <span v-if="isTop" class="chip chip-danger">高危 · 禁止送电</span>
          </section>

          <!-- 登记时间 -->
          <div class="wp-time">
            <label>登记时间</label>
            <span>{{ work.registerTime || '--' }}</span>
          </div>

          <!-- 作业人员名单 -->
          <section v-if="workers.length" class="wp-workers">
            <div class="wp-workers-title">作业人员（{{ workers.length }}）</div>
            <ul>
              <li v-for="(w, i) in workers" :key="i">
                <span class="avatar">{{ (w.name || '?').slice(0, 1) }}</span>
                <span class="name">{{ w.name }}</span>
                <span class="group">{{ w.group }}</span>
              </li>
            </ul>
          </section>
        </div>
      </PanelFrame>
    </div>
  </Transition>
</template>

<style scoped>
/* ========== 浮层定位容器 ========== */
.work-panel-wrap {
  /* 固定在视口右侧中部，避免遮挡左侧列车信息面板 */
  position: fixed;
  top: 50%;
  right: 32px;
  transform: translateY(-50%);
  width: 360px;
  max-height: 78vh;
  z-index: 60;
}

/* ========== 面板内容 ========== */
.work-panel {
  /* 内边距 + 纵向布局 */
  padding: 18px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #e2e8f0;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  /* 顶部一道青色光条强调科技感 */
  border-top: 2px solid rgba(44, 247, 254, 0.55);
  box-shadow: inset 0 0 30px rgba(44, 247, 254, 0.06);
  height: 100%;
  overflow-y: auto;
}
/* 登顶作业：整体切换红色高危主题 */
.work-panel.is-top {
  border-top-color: rgba(248, 113, 113, 0.7);
  box-shadow: inset 0 0 30px rgba(239, 68, 68, 0.1);
}

/* ========== 头部 ========== */
.wp-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wp-badge {
  /* 作业类型徽标 */
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
}
.badge-ground {
  background: rgba(217, 119, 6, 0.18);
  border: 1px solid rgba(245, 158, 11, 0.6);
  color: #fbbf24;
}
.badge-top {
  background: rgba(220, 38, 38, 0.2);
  border: 1px solid rgba(248, 113, 113, 0.7);
  color: #fca5a5;
  /* 高危呼吸动画 */
  animation: badge-pulse 1.6s ease-in-out infinite;
}
@keyframes badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  50% { box-shadow: 0 0 12px 2px rgba(239, 68, 68, 0.55); }
}
.wp-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
}
.wp-title p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

/* ========== 信息网格 ========== */
.wp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.wp-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 8px;
}
.wp-cell label {
  font-size: 11px;
  color: #94a3b8;
}
.wp-cell span {
  font-size: 14px;
  color: #e2e8f0;
}
.wp-cell .strong {
  font-weight: 700;
  font-size: 15px;
}
.wp-cell .accent {
  color: #2cf7fe;
}

/* ========== 状态标签 ========== */
.wp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
}
.chip-on {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.5);
  color: #6ee7b7;
}
.chip-off {
  background: rgba(100, 116, 139, 0.18);
  border-color: rgba(100, 116, 139, 0.5);
  color: #cbd5e1;
}
.chip-warn {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.5);
  color: #fcd34d;
}
.chip-danger {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(248, 113, 113, 0.6);
  color: #fca5a5;
}

/* ========== 登记时间 ========== */
.wp-time {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
  font-size: 13px;
}
.wp-time label {
  color: #94a3b8;
}

/* ========== 人员名单 ========== */
.wp-workers-title {
  font-size: 13px;
  font-weight: 700;
  color: #cbd5e1;
  margin-bottom: 8px;
}
.wp-workers ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wp-workers li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: rgba(30, 41, 59, 0.4);
  border-radius: 8px;
}
.wp-workers .avatar {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #0b1120;
  background: linear-gradient(135deg, #2cf7fe, #1a94bc);
}
.wp-workers .name {
  font-size: 13px;
  color: #e2e8f0;
}
.wp-workers .group {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}

/* ========== 进出场动画 ========== */
.work-panel-fade-enter-active,
.work-panel-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.work-panel-fade-enter-from,
.work-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(20px);
}
</style>
