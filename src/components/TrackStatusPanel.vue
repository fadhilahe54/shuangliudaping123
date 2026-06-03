<!--
  TrackStatusPanel.vue -- 轨道状态监控面板
  展示所有主轨道和存车道的车厢统计信息，可折叠：
    - 顶部汇总：停放数量/总轨道数
    - 展开后每条轨道一行，显示正常/维护/警告车厢数量
    - 点击某条轨道可展开查看具体车厢状态列表
  使用方：UIOverlay.vue 左下角状态监控区域
-->
<script setup>
import { ref, computed } from 'vue'
// 列车数据 Store（提供车厢列表、轨道状态、轨道配置）
import { useTrainStore } from '../stores/trainStore.js'

// 获取列车数据 Store 实例
const store = useTrainStore()

// 面板是否展开状态，控制面板高度和内容显示
const isStatusOpen = ref(false)

// 当前展开查看详情的轨道 ID，null 表示全部收起（同一时间只展开一条）
const expandedTrack = ref(null)

/**
 * 切换指定轨道的详情展开/收起
 * 若已展开则收起，若收起则展开；同一时间只展开一条轨道
 * 
 * @param {number|string} trackId - 轨道 ID
 * @returns {void}
 */
function toggleTrackDetail(trackId) {
  // 若当前轨道已展开，则收起；否则展开
  expandedTrack.value = expandedTrack.value === trackId ? null : trackId
}

// 列车运行状态中文标签映射表
const stateLabel = {
  parked:    '停放中',
  departing: '出库中',
  out:       '已出库',
  entering:  '进库中',
}

// 列车运行状态对应的 Tailwind 文字颜色类
const stateColor = {
  parked:    'text-green-400',
  departing: 'text-yellow-400',
  out:       'text-slate-500',
  entering:  'text-blue-400',
}

/**
 * 计算主轨道车厢状态统计
 * 按 trackId 索引，返回每条轨道的 { total, warning, maintenance, normal } 计数
 * 用于显示轨道上各状态车厢的数量
 * 
 * @returns {Array<Object>} 轨道统计数据数组
 */
const trackStats = computed(() => {
  // 获取主轨道数量
  const count = store.mainTrackCount || 0
  
  // 初始化统计对象数组，每条轨道一个统计对象
  const stats = Array(count).fill(null).map(() => ({ total: 0, warning: 0, maintenance: 0, normal: 0 }))
  
  // 遍历所有车厢，按轨道 ID 统计
  store.carriages.forEach(c => {
    // 检查轨道 ID 有效性
    if (typeof c.trackId === 'number' && stats[c.trackId]) {
      // 总数加 1
      stats[c.trackId].total++
      
      // 按状态分类统计
      if (c.status === 'Warning') stats[c.trackId].warning++
      else if (c.status === 'Maintenance') stats[c.trackId].maintenance++
      else stats[c.trackId].normal++
    }
  })
  
  return stats
})

/**
 * 计算存车道（n 道）车厢状态统计
 * 以 'n1'、'n2'... 为 key，统计各存车道的车厢数量和状态
 * 
 * @returns {Object} 存车道统计数据对象
 */
const nTrackStats = computed(() => {
  // 初始化统计对象
  const stats = {}
  
  // 获取存车道数量
  const sidingCount = store.sidingTrackCount || 0
  
  // 为每条存车道初始化统计对象
  for (let i = 1; i <= sidingCount; i++) {
    stats[`n${i}`] = { total: 0, warning: 0, maintenance: 0, normal: 0 }
  }
  
  // 遍历所有存车道车厢，按轨道 ID 统计
  store.nCarriages.forEach(c => {
    // 获取轨道 ID
    const key = c.trackId
    
    // 若轨道存在，则统计
    if (stats[key]) {
      // 总数加 1
      stats[key].total++
      
      // 按状态分类统计
      if (c.status === 'Warning') stats[key].warning++
      else if (c.status === 'Maintenance') stats[key].maintenance++
      else stats[key].normal++
    }
  })
  
  return stats
})

// 存车道配置列表，从 Store 动态获取，包含轨道名称等信息
const sidingTrackList = computed(() => store.sidingTrackConfig || [])

/**
 * 计算当前停放中的列车总数
 * 用于顶部汇总显示"X/Y 停放"
 * 
 * @returns {number} 停放中的列车数量
 */
const parkedCount = computed(() => 
  Object.values(store.trainStates).filter(s => s === 'parked').length
)

/**
 * 计算主轨道 + 存车道的总数
 * 用于顶部汇总显示"X/Y 停放"中的 Y
 * 
 * @returns {number} 轨道总数
 */
const totalTracks = computed(() => 
  (store.mainTrackCount || 0) + (store.sidingTrackCount || 0)
)
</script>

<template>
  <div class="w-full pointer-events-auto dt-panel">
    <dv-border-box-13>
      <div class="flex flex-col overflow-hidden transition-all duration-300"
           :style="{ maxHeight: isStatusOpen ? '35vh' : '42px' }">
        <!-- 标题栏 -->
        <div
          class="px-3 py-2.5 flex justify-between items-center cursor-pointer hover:bg-cyan-500/5 transition-colors shrink-0 relative z-10 bg-[#0a1628]"
          @click="isStatusOpen = !isStatusOpen"
        >
          <h2 class="dt-title flex items-center gap-2">
            <el-icon :size="14"><TrendCharts /></el-icon>轨道状态监控
          </h2>
          <div class="flex items-center gap-2">
            <span class="dt-num text-[11px] text-cyan-400">{{ parkedCount }}<span class="text-slate-500 font-normal">/{{ totalTracks }} 停放</span></span>
            <el-icon :class="isStatusOpen ? 'rotate-180' : ''" class="text-cyan-400 transition-transform duration-300" :size="14"><ArrowDown /></el-icon>
          </div>
        </div>

        <!-- 轨道列表 -->
        <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          <!-- 主轨道 T-1 ~ T-22 -->
          <template v-for="(stat, i) in trackStats" :key="'t' + i">
            <div v-if="stat.total > 0" class="rounded border border-cyan-500/10 overflow-hidden bg-blue-950/30">
              <div
                class="px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:bg-cyan-500/5 transition-colors"
                @click="toggleTrackDetail(i)"
              >
                <div class="flex items-center gap-2">
                  <span class="dt-num text-[12px] text-cyan-400 w-7">{{ store.getTrackName(i) }}</span>
                  <span class="dt-num text-[12px] text-amber-400">{{ store.trackTrainInfo[i]?.trainNo }}</span>
                  <span :class="['text-[10px] font-medium', stateColor[store.trainStates[i]] || 'text-slate-400']">
                    {{ stateLabel[store.trainStates[i]] || '未知' }}
                  </span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span v-if="stat.warning > 0" class="flex items-center text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                    <el-icon :size="10" class="mr-0.5"><Warning /></el-icon>{{ stat.warning }}
                  </span>
                  <span v-if="stat.maintenance > 0" class="flex items-center text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">
                    <el-icon :size="10" class="mr-0.5"><SetUp /></el-icon>{{ stat.maintenance }}
                  </span>
                  <el-icon :class="expandedTrack === i ? 'rotate-180' : ''" class="text-slate-500 transition-transform duration-200" :size="12"><ArrowDown /></el-icon>
                </div>
              </div>

              <div v-if="expandedTrack === i && store.trackTrainInfo[i]" class="px-2.5 py-2 bg-blue-950/40 border-t border-cyan-500/10 space-y-1.5">
                <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-cyan-500"><Van /></el-icon>编组</div>
                  <div class="text-slate-200 text-right">{{ store.trackTrainInfo[i].formation }}</div>

                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-green-500"><Timer /></el-icon>进库时间</div>
                  <div class="dt-num text-[11px] text-green-400 text-right">{{ store.trackTrainInfo[i].arriveTime }}</div>

                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-amber-500"><Timer /></el-icon>计划出库</div>
                  <div class="dt-num text-[11px] text-amber-400 text-right">{{ store.trackTrainInfo[i].departTime }}</div>

                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-blue-500"><Aim /></el-icon>运行方向</div>
                  <div class="text-blue-300 text-right text-[11px]">{{ store.trackTrainInfo[i].direction }}</div>

                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-purple-500"><Document /></el-icon>作业内容</div>
                  <div class="text-purple-300 text-right text-[11px]">{{ store.trackTrainInfo[i].task }}</div>

                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-pink-500"><User /></el-icon>乘务人员</div>
                  <div class="text-pink-300 text-right text-[11px]">{{ store.trackTrainInfo[i].crew }}</div>
                </div>

                <div class="flex items-center gap-1 pt-1 border-t border-cyan-500/10">
                  <span class="text-[10px] text-slate-500 mr-0.5">车厢:</span>
                  <span class="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">正常 {{ stat.normal }}</span>
                  <span v-if="stat.warning > 0" class="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">警告 {{ stat.warning }}</span>
                  <span v-if="stat.maintenance > 0" class="text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">维护 {{ stat.maintenance }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- n道停放线路分隔线 -->
          <div v-if="sidingTrackList.length > 0" class="flex items-center gap-2 py-1 px-1">
            <div class="flex-1 h-px bg-amber-500/20"></div>
            <span class="text-[10px] text-amber-400 font-semibold tracking-wider">停放线路</span>
            <div class="flex-1 h-px bg-amber-500/20"></div>
          </div>

          <!-- n道停放线路（动态数量） -->
          <template v-for="(cfg, nIdx) in sidingTrackList" :key="cfg.id">
            <div class="rounded border border-amber-500/10 overflow-hidden bg-blue-950/30">
              <div
                class="px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:bg-amber-500/5 transition-colors"
                @click="toggleTrackDetail(cfg.id)"
              >
                <div class="flex items-center gap-2">
                  <span class="dt-num text-[12px] text-amber-400 w-7">{{ cfg.name }}</span>
                  <span class="dt-num text-[12px] text-slate-400">{{ store.nTrackInfo[cfg.id]?.trainNo || '--' }}</span>
                  <span class="text-[10px] font-medium text-green-400">停放中</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span v-if="nTrackStats[cfg.id]?.warning > 0" class="flex items-center text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                    <el-icon :size="10" class="mr-0.5"><Warning /></el-icon>{{ nTrackStats[cfg.id].warning }}
                  </span>
                  <span v-if="nTrackStats[cfg.id]?.maintenance > 0" class="flex items-center text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">
                    <el-icon :size="10" class="mr-0.5"><SetUp /></el-icon>{{ nTrackStats[cfg.id].maintenance }}
                  </span>
                  <el-icon :class="expandedTrack === cfg.id ? 'rotate-180' : ''" class="text-slate-500 transition-transform duration-200" :size="12"><ArrowDown /></el-icon>
                </div>
              </div>

              <!-- n道展开详情 -->
              <div v-if="expandedTrack === cfg.id && store.nTrackInfo[cfg.id]" class="px-2.5 py-2 bg-blue-950/40 border-t border-amber-500/10 space-y-1.5">
                <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-cyan-500"><Van /></el-icon>编组</div>
                  <div class="text-slate-200 text-right">{{ store.nTrackInfo[cfg.id].formation }}</div>

                  <div class="dt-sub flex items-center gap-1"><el-icon :size="11" class="text-purple-500"><Document /></el-icon>作业状态</div>
                  <div class="text-purple-300 text-right text-[11px]">{{ store.nTrackInfo[cfg.id].task }}</div>
                </div>

                <div class="flex items-center gap-1 pt-1 border-t border-amber-500/10">
                  <span class="text-[10px] text-slate-500 mr-0.5">车厢:</span>
                  <span class="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">正常 {{ nTrackStats[cfg.id]?.normal || 0 }}</span>
                  <span v-if="nTrackStats[cfg.id]?.warning > 0" class="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">警告 {{ nTrackStats[cfg.id].warning }}</span>
                  <span v-if="nTrackStats[cfg.id]?.maintenance > 0" class="text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">维护 {{ nTrackStats[cfg.id].maintenance }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </dv-border-box-13>
  </div>
</template>

<style scoped>
/* ========== 轨道状态面板基础字体优化 ========== */
/* 让数字孪生面板中的小字号文字在深色背景上保持清晰锐利 */
.dt-panel {
  /* 字体平滑：使用亚像素渲染，提升文字清晰度 */
  -webkit-font-smoothing: antialiased;
  /* Firefox 字体平滑 */
  -moz-osx-font-smoothing: grayscale;
  /* 文字渲染优化：优先考虑可读性 */
  text-rendering: optimizeLegibility;
}

/* ========== 面板标题样式 ========== */
/* 使用青色发光强调当前区块为运行状态监控信息 */
.dt-title {
  /* 字号：13px，小标题 */
  font-size: 13px;
  /* 字重：700（加粗），强调 */
  font-weight: 700;
  /* 字间距：0.1em，增加科技感 */
  letter-spacing: 0.1em;
  /* 文字颜色：青色 */
  color: #67e8f9;
  /* 文字阴影：8px 青色发光，营造霓虹灯效果 */
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.35);
}

/* ========== 数字值样式 ========== */
/* 使用等宽字体，便于状态数量变化时保持视觉稳定 */
.dt-num {
  /* 字体：等宽字体，便于数字对齐 */
  font-family: 'Courier New', 'Consolas', monospace;
  /* 字重：700（加粗），突出数字 */
  font-weight: 700;
  /* 字间距：0.02em，轻微增加 */
  letter-spacing: 0.02em;
}

/* ========== 辅助说明文字样式 ========== */
/* 弱化显示，用于补充统计项含义 */
.dt-sub {
  /* 字号：11px，较小 */
  font-size: 11px;
  /* 文字颜色：灰色，表示辅助信息 */
  color: #94a3b8;
  /* 字间距：0.03em，轻微增加 */
  letter-spacing: 0.03em;
}
</style>
