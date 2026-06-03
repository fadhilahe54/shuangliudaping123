<!--
  JiaodaWorkDashboard.vue — 交大机电作业看板
  展示作业卡统计、在岗人员、股道作业概况等实时数据。
  使用方：UIOverlay.vue 右下角或底部信息区域
-->
<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useJiaodaStore } from '../stores/jiaodaStore.js'
import PanelFrame from './PanelFrame.vue'

const jd = useJiaodaStore()

onMounted(() => {
  jd.startAutoRefresh(60000)
})

onBeforeUnmount(() => {
  jd.stopAutoRefresh()
})

const statsCards = computed(() => [
  {
    label: '班组作业卡',
    value: jd.registerCardTotal,
    icon: 'card',
    color: '#22d3ee',
    bgGrad: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(34,211,238,0.03))',
  },
  {
    label: '登顶作业卡',
    value: jd.topCardTotal,
    icon: 'top',
    color: '#f59e0b',
    bgGrad: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.03))',
  },
  {
    label: '在岗人员',
    value: jd.activeUserCount,
    icon: 'user',
    color: '#10b981',
    bgGrad: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.03))',
  },
  {
    label: '作业股道',
    value: jd.activeTrackCount,
    icon: 'track',
    color: '#8b5cf6',
    bgGrad: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.03))',
  },
])

const lastUpdateStr = computed(() => {
  if (!jd.lastUpdated) return '--'
  return jd.lastUpdated.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

/** 按部门显示的前6个部门及其人员数 */
const topGroups = computed(() => {
  const entries = Object.entries(jd.usersByGroup)
    .map(([name, members]) => ({ name, count: members.length }))
    .sort((a, b) => b.count - a.count)
  return entries.slice(0, 6)
})
</script>

<template>
  <div class="jd-dashboard">
    <PanelFrame bgColor="rgba(2,6,23,0.85)">
      <div class="jd-inner">
        <!-- 标题栏 -->
        <div class="jd-header">
          <div class="jd-title-row">
            <div class="jd-dot"></div>
            <span class="jd-title">作业监控看板</span>
            <span class="jd-badge">LIVE</span>
          </div>
          <div class="jd-update-time">
            <span class="jd-time-label">更新</span>
            <span class="jd-time-value">{{ lastUpdateStr }}</span>
          </div>
        </div>

        <!-- 统计卡片 -->
        <div class="jd-stats-grid">
          <div
            v-for="(card, idx) in statsCards"
            :key="idx"
            class="jd-stat-card"
            :style="{ background: card.bgGrad, borderColor: card.color + '33' }"
          >
            <div class="stat-icon-ring" :style="{ borderColor: card.color + '44', color: card.color }">
              <svg v-if="card.icon === 'card'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              <svg v-else-if="card.icon === 'top'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="18 15 12 9 6 15"/>
                <line x1="12" y1="9" x2="12" y2="21"/>
                <path d="M4 4h16"/>
              </svg>
              <svg v-else-if="card.icon === 'user'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <rect x="1" y="6" width="22" height="12" rx="2"/>
                <line x1="1" y1="12" x2="23" y2="12"/>
              </svg>
            </div>
            <div class="stat-info">
              <span class="stat-value" :style="{ color: card.color }">{{ card.value }}</span>
              <span class="stat-label">{{ card.label }}</span>
            </div>
          </div>
        </div>

        <!-- 作业人次统计条 -->
        <div class="jd-worker-bar">
          <div class="worker-bar-label">
            <span>现场作业人次</span>
            <span class="worker-count" style="color: #22d3ee;">{{ jd.totalWorkingWorkers }}</span>
          </div>
          <div class="worker-bar-track">
            <div
              class="worker-bar-fill"
              :style="{ width: Math.min(jd.totalWorkingWorkers / Math.max(jd.activeUserCount, 1) * 100, 100) + '%' }"
            ></div>
          </div>
        </div>

        <!-- 部门人员分布 -->
        <div class="jd-group-section" v-if="topGroups.length > 0">
          <div class="jd-section-title">
            <span>部门人员分布</span>
          </div>
          <div class="jd-group-list">
            <div v-for="g in topGroups" :key="g.name" class="jd-group-item">
              <span class="group-name">{{ g.name }}</span>
              <div class="group-bar-track">
                <div
                  class="group-bar-fill"
                  :style="{ width: Math.min(g.count / Math.max(topGroups[0]?.count || 1, 1) * 100, 100) + '%' }"
                ></div>
              </div>
              <span class="group-count">{{ g.count }}</span>
            </div>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="jd.loading" class="jd-loading">
          <div class="jd-spinner"></div>
          <span>数据同步中...</span>
        </div>
      </div>
    </PanelFrame>
  </div>
</template>

<style scoped>
.jd-dashboard {
  width: 100%;
  height: 100%;
}

.jd-inner {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 标题栏 */
.jd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.jd-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jd-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
  animation: jd-pulse 2s ease-in-out infinite;
}

@keyframes jd-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(34, 211, 238, 0.6); }
  50% { opacity: 0.6; box-shadow: 0 0 4px rgba(34, 211, 238, 0.3); }
}

.jd-title {
  font-size: 14px;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.5px;
}

.jd-badge {
  font-size: 10px;
  font-weight: 700;
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 1px;
  animation: jd-pulse 2s ease-in-out infinite;
}

.jd-update-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.jd-time-label {
  color: #64748b;
}

.jd-time-value {
  color: #94a3b8;
  font-family: ui-monospace, monospace;
}

/* 统计卡片网格 */
.jd-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.jd-stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.jd-stat-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.stat-icon-ring {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.2);
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat-value {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
  font-family: ui-monospace, monospace;
}

.stat-label {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

/* 作业人次统计条 */
.jd-worker-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.worker-bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}

.worker-count {
  font-weight: 700;
  font-family: ui-monospace, monospace;
}

.worker-bar-track {
  height: 6px;
  border-radius: 3px;
  background: rgba(30, 41, 59, 0.8);
  overflow: hidden;
}

.worker-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #0891b2, #22d3ee);
  transition: width 0.6s ease;
  position: relative;
}

.worker-bar-fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 20px;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3));
  border-radius: 0 3px 3px 0;
}

/* 部门人员分布 */
.jd-group-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.jd-section-title {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.jd-group-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jd-group-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-name {
  font-size: 11px;
  color: #cbd5e1;
  min-width: 56px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-bar-track {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: rgba(30, 41, 59, 0.6);
  overflow: hidden;
}

.group-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 0.6s ease;
}

.group-count {
  font-size: 11px;
  color: #a78bfa;
  font-weight: 700;
  min-width: 20px;
  text-align: right;
  font-family: ui-monospace, monospace;
}

/* 加载状态 */
.jd-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  color: #64748b;
  font-size: 12px;
}

.jd-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(34, 211, 238, 0.2);
  border-top-color: #22d3ee;
  border-radius: 50%;
  animation: jd-spin 0.8s linear infinite;
}

@keyframes jd-spin {
  to { transform: rotate(360deg); }
}
</style>
