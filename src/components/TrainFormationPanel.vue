<!--
  TrainFormationPanel.vue -- 列车编组信息面板
  展示所有主轨道的列车编组摘要，可折叠，支持点击查看详细编组：
    - 列表每行显示：轨道名、车次、编组数、出发时间、运行状态、警告/维护数
    - 点击某条轨道展开，逐节车厢显示车种、车号、状态图标
  使用方：UIOverlay.vue
-->
<script setup>
import { ref, computed } from 'vue'
// 列车数据 Store
import { useTrainStore } from '../stores/trainStore.js'
// 车厢状态图标
import { CircleCheck, Warning, SetUp } from '@element-plus/icons-vue'

// 获取列车数据 Store 实例
const store = useTrainStore()

// 面板是否展开状态，控制面板高度和内容显示
const isOpen = ref(false)

// 当前展开查看详细编组的轨道 ID，null 表示全部收起
const selectedTrackId = ref(null)

// 普速车种中文标签映射表
const typeMap = {
  fd: '发电车', ca: '餐车', rw: '软卧',
  yw: '硬卧',  yz: '硬座', kw: '客卧',
}

// 车种标签对应的 Tailwind 样式类（背景色、文字色、边框色）
const typeColor = {
  fd: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ca: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  rw: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  yw: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  yz: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  kw: 'bg-green-500/20 text-green-400 border-green-500/30',
}

// 车厢状态对应的图标组件（正常/警告/维护）
const statusIcon = { Normal: CircleCheck, Warning: Warning, Maintenance: SetUp }

// 车厢状态对应的文字颜色类
const statusColor = { Normal: 'text-green-400', Warning: 'text-red-400', Maintenance: 'text-yellow-400' }

// 车厢状态中文标签
const statusLabel = { Normal: '正常', Warning: '警告', Maintenance: '维护' }

// 列车运行状态中文标签映射表
const stateLabel = { parked: '停放中', departing: '出库中', out: '已出库', entering: '进库中' }

// 列车运行状态标签对应的 Tailwind 样式类
const stateTagColor = {
  parked:    'bg-green-500/15 text-green-400 border-green-500/30',
  departing: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  out:       'bg-slate-500/15 text-slate-400 border-slate-500/30',
  entering:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

/**
 * 计算每条主轨道的编组摘要列表
 * 包含车次、编组数、状态、警告计数等信息
 * 动态根据 store.mainTrackCount 决定轨道数量
 * 
 * @returns {Array<Object>} 编组摘要数据数组
 */
const formationList = computed(() => {
  // 初始化列表
  const list = []
  
  // 获取主轨道数量
  const trackCount = store.mainTrackCount || 0
  
  // 遍历每条轨道
  for (let i = 0; i < trackCount; i++) {
    // 获取轨道的列车信息
    const info = store.trackTrainInfo[i]
    
    // 若无列车信息，跳过
    if (!info) continue
    
    // 获取该轨道上的所有车厢
    const trackCarriages = store.carriages.filter(c => c.trackId === i)
    
    // 统计警告车厢数
    const warnCount = trackCarriages.filter(c => c.status === 'Warning').length
    
    // 统计维护车厢数
    const maintCount = trackCarriages.filter(c => c.status === 'Maintenance').length
    
    // 构建编组摘要对象
    list.push({
      trackId: i,
      trackName: store.getTrackName(i),
      trainNo: info.trainNo,
      formation: info.formation,
      direction: info.direction,
      departTime: info.departTime,
      state: store.trainStates[i],
      totalCars: trackCarriages.length,
      warnCount,
      maintCount,
    })
  }
  
  return list
})

/**
 * 计算选中轨道的车厢列表
 * 按组内序号排序，用于展开详情时显示
 * 
 * @returns {Array<Object>} 车厢数据数组
 */
const selectedCarriages = computed(() => {
  // 若未选中轨道，返回空数组
  if (selectedTrackId.value === null) return []
  
  // 获取该轨道的所有车厢，按序号排序
  return store.carriages
    .filter(c => c.trackId === selectedTrackId.value)
    .sort((a, b) => (a._indexInGroup ?? a.index) - (b._indexInGroup ?? b.index))
})

/**
 * 获取车厢编组内序号（1-based）
 * 用于显示"第 X 节车厢"
 * 
 * @param {Object} car - 车厢数据对象
 * @returns {number} 序号（1 开始）
 */
function getCarSeq(car) {
  // 优先使用 _indexInGroup，其次使用 index，加 1 转换为 1-based
  return (car._indexInGroup ?? car.index) + 1
}

/**
 * 计算选中轨道的列车信息
 * 用于展开详情时显示列车基本信息
 * 
 * @returns {Object|null} 列车信息对象或 null
 */
const selectedTrainInfo = computed(() => {
  // 若未选中轨道，返回 null
  if (selectedTrackId.value === null) return null
  
  // 返回该轨道的列车信息
  return store.trackTrainInfo[selectedTrackId.value]
})

/**
 * 打开编组详情
 * 设置选中轨道 ID，触发详情展开
 * 
 * @param {number} trackId - 轨道 ID
 * @returns {void}
 */
function openDetail(trackId) {
  // 设置选中轨道
  selectedTrackId.value = trackId
}

/**
 * 关闭编组详情
 * 清除选中轨道，触发详情收起
 * 
 * @returns {void}
 */
function closeDetail() {
  // 清除选中轨道
  selectedTrackId.value = null
}
</script>

<template>
  <div class="w-full pointer-events-auto dt-panel">
    <dv-border-box-13>
      <div class="flex flex-col overflow-hidden transition-all duration-300"
           :style="{ maxHeight: isOpen ? '40vh' : '42px' }">
        <!-- 标题栏 -->
        <div
          class="px-3 py-2.5 flex justify-between items-center cursor-pointer hover:bg-cyan-500/5 transition-colors shrink-0 relative z-10 bg-[#0a1628]"
          @click="isOpen = !isOpen"
        >
          <h2 class="dt-title flex items-center gap-2">
            <el-icon :size="14"><Van /></el-icon>车次编组信息
          </h2>
          <div class="flex items-center gap-2">
            <span class="dt-num text-[11px] text-cyan-400">{{ formationList.length }}<span class="text-slate-500 font-normal"> 列</span></span>
            <el-icon :class="isOpen ? 'rotate-180' : ''" class="text-cyan-400 transition-transform duration-300" :size="14"><ArrowDown /></el-icon>
          </div>
        </div>

        <!-- 表格内容 -->
        <div class="flex-1 overflow-y-auto">
          <!-- 表头 -->
          <div class="grid grid-cols-[42px_52px_1fr_50px_36px] gap-1 px-3 py-1.5 text-[10px] text-cyan-600 uppercase tracking-wider bg-blue-950/40 border-y border-cyan-500/10 sticky top-0">
            <span>股道</span>
            <span>车次</span>
            <span>编组</span>
            <span>出库</span>
            <span>状态</span>
          </div>

          <!-- 数据行 -->
          <div
            v-for="item in formationList"
            :key="item.trackId"
            class="grid grid-cols-[42px_52px_1fr_50px_36px] gap-1 px-3 py-1.5 items-center border-b border-cyan-500/5 cursor-pointer hover:bg-cyan-500/5 transition-colors"
            @click="openDetail(item.trackId)"
          >
            <span class="dt-num text-[11px] text-cyan-400">{{ item.trackName }}</span>
            <span class="dt-num text-[11px] text-amber-400">{{ item.trainNo }}</span>
            <div class="flex items-center gap-1">
              <span class="text-[11px] text-slate-300">{{ item.formation }}</span>
              <span v-if="item.warnCount > 0" class="text-[9px] text-red-400 bg-red-500/10 px-1 rounded border border-red-500/20">{{ item.warnCount }}</span>
              <span v-if="item.maintCount > 0" class="text-[9px] text-yellow-400 bg-yellow-500/10 px-1 rounded border border-yellow-500/20">{{ item.maintCount }}</span>
            </div>
            <span class="dt-num text-[10px] text-slate-400">{{ item.departTime }}</span>
            <span :class="['text-[9px] px-1 py-0.5 rounded text-center border', stateTagColor[item.state]]">
              {{ stateLabel[item.state]?.slice(0, 2) }}
            </span>
          </div>
        </div>
      </div>
    </dv-border-box-13>
  </div>

  <!-- 编组详情弹窗 -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="selectedTrackId !== null" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
        <!-- 遮罩 -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeDetail" />

        <!-- 弹窗内容 -->
        <div class="relative w-[520px] max-h-[70vh] flex flex-col overflow-hidden">
          <dv-border-box-13>
            <div class="flex flex-col max-h-[70vh] overflow-hidden dt-panel">
              <!-- 弹窗头部 -->
              <div class="px-4 py-3 flex justify-between items-center shrink-0 border-b border-cyan-500/15">
                <div>
                  <div class="flex items-center gap-3">
                    <span class="dt-num text-lg text-amber-400">{{ selectedTrainInfo?.trainNo }}</span>
                    <span class="dt-num text-sm text-cyan-400">{{ store.getTrackName(selectedTrackId) }}</span>
                    <span :class="['text-[10px] px-2 py-0.5 rounded border', stateTagColor[store.trainStates[selectedTrackId]]]">
                      {{ stateLabel[store.trainStates[selectedTrackId]] }}
                    </span>
                  </div>
                  <div class="dt-sub mt-1">
                    {{ selectedTrainInfo?.formation }} · {{ selectedTrainInfo?.direction }} · 计划出库 {{ selectedTrainInfo?.departTime }}
                  </div>
                </div>
                <button @click="closeDetail" class="text-slate-400 p-1 hover:text-cyan-400 transition-colors">
                  <el-icon :size="18"><Close /></el-icon>
                </button>
              </div>

              <!-- 编组示意图 -->
              <div class="px-4 py-2.5 border-b border-cyan-500/10 shrink-0">
                <div class="text-[10px] text-cyan-600 mb-2 tracking-wider">编组示意图（← 车头）</div>
                <div class="flex gap-0.5 overflow-x-auto pb-1">
                  <div
                    v-for="car in selectedCarriages"
                    :key="car.id"
                    :class="['shrink-0 w-6 h-8 rounded-sm border flex items-center justify-center text-[8px] font-bold cursor-pointer hover:scale-110 transition-transform', typeColor[car.type] || 'bg-slate-700/50 text-slate-400 border-slate-600/50']"
                    :title="`${car.id} - ${typeMap[car.type]} - ${statusLabel[car.status]}`"
                    @click="store.setSelectedCarriage(car); closeDetail()"
                  >
                    {{ getCarSeq(car) }}
                  </div>
                </div>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span v-for="(label, key) in typeMap" :key="key" :class="['text-[9px] px-1.5 py-0.5 rounded border', typeColor[key]]">
                    {{ label }}
                  </span>
                </div>
              </div>

              <!-- 车厢列表 -->
              <div class="flex-1 overflow-y-auto">
                <!-- 表头 -->
                <div class="grid grid-cols-[55px_30px_55px_55px_65px_55px] gap-1 px-4 py-1.5 text-[10px] text-cyan-600 tracking-wider bg-blue-950/40 sticky top-0 border-b border-cyan-500/10">
                  <span>编号</span>
                  <span>车号</span>
                  <span>类型</span>
                  <span>状态</span>
                  <span>走行km</span>
                  <span>厂修</span>
                </div>

                <!-- 车厢行 -->
                <div
                  v-for="car in selectedCarriages"
                  :key="car.id"
                  class="grid grid-cols-[55px_30px_55px_55px_65px_55px] gap-1 px-4 py-1.5 items-center border-b border-cyan-500/5 cursor-pointer hover:bg-cyan-500/5 transition-colors"
                  @click="store.setSelectedCarriage(car); closeDetail()"
                >
                  <span class="dt-num text-[10px] text-slate-200">{{ car.id }}</span>
                  <span class="text-[10px] text-slate-400 text-center">{{ getCarSeq(car) }}</span>
                  <span :class="['text-[9px] px-1 py-0.5 rounded border text-center', typeColor[car.type]]">
                    {{ typeMap[car.type] }}
                  </span>
                  <div class="flex items-center gap-0.5">
                    <component :is="statusIcon[car.status]" :class="['w-3 h-3', statusColor[car.status]]" />
                    <span :class="['text-[9px]', statusColor[car.status]]">{{ statusLabel[car.status] }}</span>
                  </div>
                  <span :class="['dt-num text-[10px] text-slate-400', car.mileage > 400000 ? 'text-red-400' : car.mileage > 250000 ? 'text-yellow-400' : '']">
                    {{ car.mileage >= 10000 ? (car.mileage / 10000).toFixed(1) + '万' : car.mileage }}
                  </span>
                  <span class="dt-num text-[9px] text-slate-500">{{ car.repairs?.a1Repair?.slice(5) || '-' }}</span>
                </div>
              </div>

              <!-- 底部统计 -->
              <div class="px-4 py-2 border-t border-cyan-500/15 flex justify-between items-center shrink-0 bg-blue-950/30">
                <div class="flex gap-2">
                  <span class="text-[10px] px-2 py-0.5 rounded text-cyan-400 bg-cyan-500/10 border border-cyan-500/20">
                    正常 {{ selectedCarriages.filter(c => c.status === 'Normal').length }}
                  </span>
                  <span class="text-[10px] px-2 py-0.5 rounded text-red-400 bg-red-500/10 border border-red-500/20">
                    警告 {{ selectedCarriages.filter(c => c.status === 'Warning').length }}
                  </span>
                  <span class="text-[10px] px-2 py-0.5 rounded text-yellow-400 bg-yellow-500/10 border border-yellow-500/20">
                    维护 {{ selectedCarriages.filter(c => c.status === 'Maintenance').length }}
                  </span>
                </div>
                <span class="dt-sub">共 {{ selectedCarriages.length }} 节车厢</span>
              </div>
            </div>
          </dv-border-box-13>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ========== 列车编组面板基础字体优化 ========== */
/* 统一深色 HUD 面板的抗锯齿策略，提升小字号文本可读性 */
.dt-panel {
  /* 字体平滑：使用亚像素渲染，提升文字清晰度 */
  -webkit-font-smoothing: antialiased;
  /* Firefox 字体平滑 */
  -moz-osx-font-smoothing: grayscale;
  /* 文字渲染优化：优先考虑可读性 */
  text-rendering: optimizeLegibility;
}

/* ========== 标题文本样式 ========== */
/* 青色发光风格，和其它数字孪生面板视觉统一 */
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
/* 编组编号、数量等关键数字使用等宽字体，保持列对齐和读数稳定 */
.dt-num {
  /* 字体：等宽字体，便于数字对齐 */
  font-family: 'Courier New', 'Consolas', monospace;
  /* 字重：700（加粗），突出数字 */
  font-weight: 700;
  /* 字间距：0.02em，轻微增加 */
  letter-spacing: 0.02em;
}

/* ========== 辅助说明文字样式 ========== */
/* 用于描述车组类型、编组状态等次要信息 */
.dt-sub {
  /* 字号：11px，较小 */
  font-size: 11px;
  /* 文字颜色：灰色，表示辅助信息 */
  color: #94a3b8;
  /* 字间距：0.03em，轻微增加 */
  letter-spacing: 0.03em;
}

/* ========== 详情弹窗过渡动画 ========== */
/* 进入/离开统一使用缩放淡入淡出，减少突然出现带来的视觉跳变 */
.modal-enter-active,
.modal-leave-active {
  /* 过渡动画：所有属性变化时平滑过渡，时长 0.3s */
  transition: all 0.3s ease;
}

/* 弹窗初始和离开状态：轻微缩小并透明 */
.modal-enter-from,
.modal-leave-to {
  /* 透明度：0，完全透明 */
  opacity: 0;
  /* 缩放：0.95 倍，轻微缩小 */
  transform: scale(0.95);
}
</style>
