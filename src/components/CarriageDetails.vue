<!--
  CarriageDetails.vue -- 车厢详细信息浮层面板
  点击单节车厢时在屏幕中央弹出，展示该车厢的完整信息，分 Tab 显示：
    - 概览 Tab：车厢编号、车种、状态、里程、所属车次/轨道
    - 传感器 Tab：电压/气压/振动实时数据（SensorGauge 仪表盘 + 折线图）
    - 检修 Tab：A1~A4 检修记录和阈值配置（可编辑）
  支持鼠标拖拽移位面板位置，切换车厢时自动归位
  使用方：UIOverlay.vue（监听 store.selectedCarriage 变化显示/隐藏）
-->
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
// 列车数据 Store
import { useTrainStore } from '../stores/trainStore.js'
// 各 Tab 区块使用的图标
import {
  InfoFilled, TrendCharts, Odometer, Location, Warning, Close,
  Setting, SetUp, Coin, Lightning,
  Calendar, Guide, Rank,
} from '@element-plus/icons-vue'
// 仪表盘组件（电压/气压/振动三个指标）
import SensorGauge from './SensorGauge.vue'

// 获取列车数据 Store 实例
const store = useTrainStore()

// 当前活跃的 Tab ID（overview/repairs/sensors/maintenance/specs）
const activeTab = ref('overview')

// 是否处于检修阈值编辑模式
const isEditingThresholds = ref(false)

// ========== 拖动功能相关状态 ==========
// 面板 DOM 引用，用于获取初始位置
const panelRef = ref(null)

// 鼠标相对于面板左上角的偏移量
const dragOffset = ref({ x: 0, y: 0 })

// 面板当前位置（绝对坐标）
const panelPos = ref({ x: 0, y: 0 })

// 是否正在拖动
const isDragging = ref(false)

// 是否曾被拖动过（用于首次拖动时获取初始位置）
const hasBeenDragged = ref(false)

/**
 * 监听选中车厢变化，重置面板位置和 Tab
 * 每当选中新车厢时，面板回到中央，Tab 切回总览
 */
watch(() => store.selectedCarriage?.id, (val) => {
  if (val) {
    // 重置拖动状态
    hasBeenDragged.value = false
    // 重置位置到中央
    panelPos.value = { x: 0, y: 0 }
    // 切回总览 Tab
    activeTab.value = 'overview'
  }
})

/**
 * 处理拖动开始事件
 * 记录鼠标相对位置，绑定全局 mousemove 和 mouseup 事件
 * 
 * @param {MouseEvent} e - 鼠标事件
 * @returns {void}
 */
function onDragStart(e) {
  // 兼容鼠标/触摸/触控笔：鼠标仅接受左键；触摸/笔不带 button 字段
  if (e.pointerType === 'mouse' && e.button !== 0) return
  
  // 设置拖动状态
  isDragging.value = true
  
  // 首次拖动时，获取面板初始位置
  if (!hasBeenDragged.value && panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect()
    panelPos.value = { x: rect.left, y: rect.top }
    hasBeenDragged.value = true
  }
  
  // 计算指针相对于面板左上角的偏移
  dragOffset.value = {
    x: e.clientX - panelPos.value.x,
    y: e.clientY - panelPos.value.y,
  }

  // 捕获指针，避免快速滑动时丢失事件
  try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  // 绑定全局 pointer 事件（同时覆盖鼠标与触摸）
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
  document.addEventListener('pointercancel', onDragEnd)
  
  // 阻止默认行为
  e.preventDefault()
}

/**
 * 处理拖动中事件
 * 根据鼠标位置更新面板位置
 * 
 * @param {MouseEvent} e - 鼠标事件
 * @returns {void}
 */
function onDragMove(e) {
  // 若未在拖动状态，直接返回
  if (!isDragging.value) return
  
  // 根据鼠标位置和偏移量计算新位置
  panelPos.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y,
  }
}

/**
 * 处理拖动结束事件
 * 清除拖动状态和全局事件监听
 * 
 * @returns {void}
 */
function onDragEnd() {
  // 清除拖动状态
  isDragging.value = false
  
  // 移除全局事件监听
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
}

/**
 * 组件卸载前清理
 * 移除全局事件监听，防止内存泄漏
 */
onBeforeUnmount(() => {
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
})

// 传感器告警阈值配置
const thresholds = ref({
  voltageMin: 200,      // 电压最小值（V）
  voltageMax: 280,      // 电压最大值（V）
  pressureMin: 80,      // 气压最小值（PSI）
  pressureMax: 120,     // 气压最大值（PSI）
  vibrationMax: 3,      // 振动最大值（G）
})

/**
 * 计算当前选中的车厢数据
 * 
 * @returns {Object|null} 车厢数据对象或 null
 */
const carriage = computed(() => store.selectedCarriage)

/**
 * 计算车厢连续编号（1-based）
 * 重联时按整列连续编号，非重联按组内序号
 * 用于显示"第 X 节车厢"
 * 
 * @returns {number} 车厢序号
 */
const carSeq = computed(() => {
  // 若无选中车厢，返回 1
  if (!carriage.value) return 1
  
  // 获取该轨道的所有车厢
  const tid = carriage.value.trackId
  const allCars = [...store.carriages, ...(store.nCarriages || [])]
    .filter(c => c.trackId === tid)
    // 按车组索引和组内序号排序
    .sort((a, b) => {
      const ga = a._groupIndex ?? 0
      const gb = b._groupIndex ?? 0
      if (ga !== gb) return ga - gb
      return (a._indexInGroup ?? a.index) - (b._indexInGroup ?? b.index)
    })
  
  // 查找当前车厢在排序后的位置
  const idx = allCars.findIndex(c => c.id === carriage.value.id)
  
  // 返回 1-based 索引
  return idx >= 0 ? idx + 1 : 1
})

/**
 * 计算列位名称
 * 一列位或二列位
 * 
 * @returns {string} 列位名称
 */
const positionLabel = computed(() => {
  if (!carriage.value) return ''
  return carriage.value._position === 'pos1' ? '一列位' : '二列位'
})

// 车厢状态中文标签映射表
const statusMap = {
  Normal: '正常',
  Warning: '警告',
  Maintenance: '维护中',
}

// 车种中文标签映射表
const typeMap = {
  yz: '硬座',
  yw: '硬卧',
  rw: '软卧',
  ca: '餐车',
  fd: '发电车',
  kw: '客卧',
}

// Tab 页签定义
const tabs = [
  { id: 'overview', label: '总览', icon: InfoFilled },
  { id: 'repairs', label: '检修信息', icon: Calendar },
  { id: 'sensors', label: '传感器', icon: TrendCharts },
  { id: 'maintenance', label: '维护记录', icon: SetUp },
  { id: 'specs', label: '规格参数', icon: Coin },
]

/**
 * 计算状态对应的颜色类
 * 用于面板边框和阴影颜色
 * 
 * @returns {string} Tailwind 类名字符串
 */
const statusColorClass = computed(() => {
  if (!carriage.value) return ''
  const s = carriage.value.status
  if (s === 'Warning') return 'text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
  if (s === 'Maintenance') return 'text-yellow-400 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
  return 'text-cyan-400 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
})

/**
 * 计算状态徽章的背景和文字颜色
 * 
 * @returns {string} Tailwind 类名字符串
 */
const statusBadgeClass = computed(() => {
  if (!carriage.value) return ''
  const s = carriage.value.status
  if (s === 'Normal') return 'bg-cyan-950 text-cyan-400'
  if (s === 'Maintenance') return 'bg-yellow-950 text-yellow-400'
  return 'bg-red-950 text-red-400'
})

// 检修项定义（A1~A4 修程）
const repairItems = [
  { key: 'a1Repair', label: 'A1修', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { key: 'a2Repair', label: 'A2修', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  { key: 'a3Repair', label: 'A3修', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  { key: 'a4Repair', label: 'A4修', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
]

// 走行公里格式化
const formattedMileage = computed(() => {
  if (!carriage.value) return '0'
  const km = carriage.value.mileage
  if (km >= 10000) return (km / 10000).toFixed(1) + ' 万'
  return km.toLocaleString()
})

// 传感器阈值报警判断
const voltageAlert = computed(() => {
  if (!carriage.value) return false
  const v = carriage.value.sensors.voltage
  return v < thresholds.value.voltageMin || v > thresholds.value.voltageMax
})

const pressureAlert = computed(() => {
  if (!carriage.value) return false
  const p = carriage.value.sensors.pressure
  return p < thresholds.value.pressureMin || p > thresholds.value.pressureMax
})

const vibrationAlert = computed(() => {
  if (!carriage.value) return false
  return carriage.value.sensors.vibration > thresholds.value.vibrationMax
})

function close() {
  store.setSelectedCarriage(null)
  store.clearSearch()
}
</script>

<template>
  <Transition name="carriage-slide">
    <div
      v-if="carriage"
      ref="panelRef"
      class="fixed z-50 pointer-events-auto flex flex-col overflow-hidden sci-panel"
      :class="{ 'is-offline': carriage._offline }"
      :style="{
        top: hasBeenDragged ? `${panelPos.y}px` : '72px',
        left: hasBeenDragged ? `${panelPos.x}px` : '16px',
        right: 'auto',
        height: 'calc(100vh - 88px)',
        width: '420px',
      }"
    >
      <!-- 背景装饰层：网格 -->
      <div class="dt-grid"></div>
      <!-- 扫描线动画层 -->
      <div class="dt-scanline"></div>

      <!-- 四角 L 形装饰 -->
      <span class="corner corner-tl"></span>
      <span class="corner corner-tr"></span>
      <span class="corner corner-bl"></span>
      <span class="corner corner-br"></span>

          <!-- Header（可拖动区域） -->
          <div class="cd-header" @pointerdown="onDragStart">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span :class="['px-2 py-0.5 rounded text-[10px] font-bold tracking-wider', statusBadgeClass]">
                  {{ statusMap[carriage.status] || carriage.status }}
                </span>
                <span class="text-[10px] text-slate-500 font-mono">{{ typeMap[carriage.type] || carriage.type }}</span>
              </div>
              <div class="text-2xl font-mono font-bold tracking-widest text-white">{{ carriage.id }}</div>
              <div class="flex items-center gap-3 mt-2 text-xs text-slate-400">
                <span class="flex items-center">
                  <el-icon class="mr-1" :size="14"><Location /></el-icon>
                  <!-- 不在库车辆：显示所属车组号；在库车辆：显示真实轨道名 -->
                  <template v-if="carriage._offline">{{ carriage._trainGroupNo || '档案数据' }}</template>
                  <template v-else>{{ store.getTrackName(carriage.trackId) }}</template>
                </span>
                <span>{{ positionLabel }}</span>
                <span>第 {{ carSeq }} 车</span>
                <span class="flex items-center text-cyan-400 font-mono"><el-icon class="mr-1" :size="14"><Guide /></el-icon>{{ formattedMileage }} km</span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <el-icon class="text-slate-500" :size="14"><Rank /></el-icon>
              <el-icon v-if="carriage.status === 'Warning'" class="text-red-400 animate-pulse" :size="20"><Warning /></el-icon>
              <button @pointerdown.stop @click.stop="close" class="text-slate-400 p-1 hover:text-cyan-400 transition-colors">
                <el-icon :size="18"><Close /></el-icon>
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="cd-tabs">
            <button
              v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
              :class="['cd-tab-btn',
                activeTab === tab.id ? 'cd-tab-active' : '']"
            >
              <el-icon :size="16"><component :is="tab.icon" /></el-icon>
              <span class="text-[9px] tracking-wider font-semibold">{{ tab.label }}</span>
            </button>
          </div>

          <!-- Content Area（唯一可滚动区域） -->
          <div class="cd-content flex-1 overflow-y-auto p-4 min-h-0">
            <!-- 总览 Tab -->
            <div v-if="activeTab === 'overview'" class="flex flex-col gap-3">
              <div class="bg-gradient-to-r from-cyan-950/50 to-slate-800/50 p-4 rounded-lg border border-cyan-500/20">
                <div class="flex items-center justify-between mb-2">
                  <div class="text-slate-400 text-xs tracking-wider flex items-center gap-2">
                    <el-icon class="text-cyan-400" :size="16"><Guide /></el-icon> 总走行公里
                  </div>
                  <div class="text-[10px] text-slate-500">上限 50万km</div>
                </div>
                <div class="text-3xl font-mono font-bold text-white">{{ formattedMileage }} <span class="text-sm text-slate-500">km</span></div>
                <div class="w-full bg-slate-900 h-2 mt-3 rounded-full overflow-hidden">
                  <div :class="['h-full rounded-full transition-all duration-300', carriage.mileage > 400000 ? 'bg-red-500' : carriage.mileage > 250000 ? 'bg-amber-500' : 'bg-cyan-500']"
                    :style="{ width: `${Math.min((carriage.mileage / 500000) * 100, 100)}%` }" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  <div class="text-slate-400 text-[10px] tracking-wider mb-1 flex items-center gap-1.5"><el-icon :size="14"><Odometer /></el-icon> 速度</div>
                  <div class="text-xl font-mono text-white">{{ carriage.speed }} <span class="text-xs text-slate-500">km/h</span></div>
                </div>
                <div class="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  <div class="text-slate-400 text-[10px] tracking-wider mb-1 flex items-center gap-1.5"><el-icon :size="14"><Odometer /></el-icon> 温度</div>
                  <div class="text-xl font-mono text-white">{{ carriage.temperature.toFixed(1) }} <span class="text-xs text-slate-500">°C</span></div>
                </div>
              </div>
              <div class="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                <div class="text-[10px] text-slate-500 tracking-wider mb-2 flex items-center gap-1.5"><el-icon :size="14"><Calendar /></el-icon> 最近检修</div>
                <div class="grid grid-cols-3 gap-2" v-if="carriage.repairs">
                  <div v-for="item in repairItems.slice(0, 3)" :key="item.key" class="text-center">
                    <div :class="['text-[9px] font-bold mb-0.5', item.color]">{{ item.label }}</div>
                    <div class="text-[10px] font-mono text-slate-300">{{ carriage.repairs[item.key]?.slice(5) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 检修信息 Tab -->
            <div v-if="activeTab === 'repairs'" class="flex flex-col gap-3">
              <div class="text-xs text-slate-500 tracking-wider mb-1">各级检修时间</div>
              <div v-for="item in repairItems" :key="item.key" :class="['p-3 rounded-lg border flex items-center justify-between', item.bg]">
                <div class="flex items-center gap-3">
                  <div :class="['w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border', item.bg, item.color]">{{ item.label.slice(0, 2) }}</div>
                  <div>
                    <div :class="['text-sm font-bold', item.color]">{{ item.label }}</div>
                    <div class="text-[10px] text-slate-500">辅助修程 · 运用所</div>
                  </div>
                </div>
                <div class="text-right" v-if="carriage.repairs">
                  <div class="text-sm font-mono text-slate-200">{{ carriage.repairs[item.key] }}</div>
                  <div class="text-[10px] text-slate-500">完成日期</div>
                </div>
              </div>
              <div class="bg-gradient-to-r from-cyan-950/50 to-slate-800/50 p-4 rounded-lg border border-cyan-500/20 mt-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <el-icon class="text-cyan-400" :size="20"><Guide /></el-icon>
                    <div>
                      <div class="text-xs text-slate-400">总走行公里</div>
                      <div class="text-2xl font-mono font-bold text-white mt-0.5">{{ formattedMileage }} <span class="text-sm text-slate-500">km</span></div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div :class="['text-lg font-bold font-mono', carriage.mileage > 400000 ? 'text-red-400' : carriage.mileage > 250000 ? 'text-yellow-400' : 'text-green-400']">{{ (100 - carriage.mileage / 5000).toFixed(0) }}%</div>
                    <div class="text-[10px] text-slate-500">剩余寿命</div>
                  </div>
                </div>
                <div class="w-full bg-slate-900 h-2 mt-3 rounded-full overflow-hidden">
                  <div :class="['h-full rounded-full transition-all duration-300', carriage.mileage > 400000 ? 'bg-red-500' : carriage.mileage > 250000 ? 'bg-amber-500' : 'bg-cyan-500']"
                    :style="{ width: `${Math.min((carriage.mileage / 500000) * 100, 100)}%` }" />
                </div>
              </div>
            </div>

            <!-- 传感器 Tab -->
            <div v-if="activeTab === 'sensors'" class="flex flex-col gap-4">
              <div class="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50">
                <span class="text-xs text-slate-400 font-bold tracking-wider flex items-center gap-1"><el-icon :size="12"><Setting /></el-icon> 阈值设置</span>
                <button @click="isEditingThresholds = !isEditingThresholds"
                  :class="['text-xs px-2 py-1 rounded transition-all', isEditingThresholds ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-cyan-400 hover:bg-slate-600']">
                  {{ isEditingThresholds ? '完成' : '编辑' }}
                </button>
              </div>
              <div v-if="isEditingThresholds" class="bg-slate-800/80 p-3 rounded border border-cyan-500/30">
                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div class="flex flex-col gap-1"><label class="text-slate-400">电压下限 (V)</label><input type="number" v-model.number="thresholds.voltageMin" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500 transition-colors" /></div>
                  <div class="flex flex-col gap-1"><label class="text-slate-400">电压上限 (V)</label><input type="number" v-model.number="thresholds.voltageMax" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500 transition-colors" /></div>
                  <div class="flex flex-col gap-1"><label class="text-slate-400">压力下限 (PSI)</label><input type="number" v-model.number="thresholds.pressureMin" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500 transition-colors" /></div>
                  <div class="flex flex-col gap-1"><label class="text-slate-400">压力上限 (PSI)</label><input type="number" v-model.number="thresholds.pressureMax" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500 transition-colors" /></div>
                  <div class="flex flex-col gap-1 col-span-2"><label class="text-slate-400">振动上限 (G)</label><input type="number" v-model.number="thresholds.vibrationMax" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500 transition-colors" /></div>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <SensorGauge label="主电压" :value="carriage.sensors.voltage" :max="300" unit="V" :colorClass="voltageAlert ? 'text-red-400' : 'text-yellow-400'" :strokeColor="voltageAlert ? '#f87171' : '#facc15'" :icon="Lightning" :alert="voltageAlert" />
                <SensorGauge label="制动压力" :value="carriage.sensors.pressure" :max="150" unit="PSI" :colorClass="pressureAlert ? 'text-red-400' : 'text-blue-400'" :strokeColor="pressureAlert ? '#f87171' : '#60a5fa'" :icon="TrendCharts" :alert="pressureAlert" />
                <SensorGauge class="col-span-2" label="底盘振动" :value="carriage.sensors.vibration" :max="5" unit="G" :colorClass="vibrationAlert ? 'text-red-400' : 'text-green-400'" :strokeColor="vibrationAlert ? '#f87171' : '#4ade80'" :icon="TrendCharts" :alert="vibrationAlert" />
              </div>
            </div>

            <!-- 维护记录 Tab -->
            <div v-if="activeTab === 'maintenance'" class="flex flex-col gap-3">
              <div v-for="(log, i) in carriage.history" :key="i" class="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 relative overflow-hidden flex items-start gap-3">
                <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-500/50" />
                <div class="mt-0.5 bg-slate-900/50 p-1.5 rounded-full border border-slate-700/50 shrink-0"><el-icon class="text-cyan-400" :size="14"><SetUp /></el-icon></div>
                <div class="flex-1">
                  <div class="flex justify-between items-start mb-0.5">
                    <span class="text-sm font-semibold text-slate-200">{{ log.action }}</span>
                    <span class="text-[10px] font-mono text-slate-500">{{ log.date }}</span>
                  </div>
                  <div class="text-xs text-slate-400 flex items-center gap-1"><el-icon :size="12"><Setting /></el-icon> {{ log.technician }}</div>
                </div>
              </div>
            </div>

            <!-- 规格参数 Tab -->
            <div v-if="activeTab === 'specs'" class="flex flex-col gap-3">
              <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                  <div class="text-[10px] text-slate-500 tracking-wider mb-1">重量</div>
                  <div class="font-mono text-lg text-slate-200">{{ carriage.specs.weight }}</div>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                  <div class="text-[10px] text-slate-500 tracking-wider mb-1">载客量</div>
                  <div class="font-mono text-lg text-slate-200">{{ carriage.specs.capacity }}</div>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                  <div class="text-[10px] text-slate-500 tracking-wider mb-1">制造日期</div>
                  <div class="font-mono text-lg text-slate-200">{{ carriage.specs.manufactured }}</div>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                  <div class="text-[10px] text-slate-500 tracking-wider mb-1">车型</div>
                  <div class="font-mono text-lg text-slate-200">{{ typeMap[carriage.type] || carriage.type }}</div>
                </div>
              </div>
            </div>
          </div><!-- Content Area 结束 -->

          <!-- Footer -->
          <div class="cd-footer">
            <div class="flex items-center gap-2 text-[10px]">
              <span class="text-slate-500">走行:</span>
              <span :class="['font-mono font-bold', carriage.mileage > 400000 ? 'text-red-400' : carriage.mileage > 250000 ? 'text-yellow-400' : 'text-cyan-400']">{{ formattedMileage }} km</span>
            </div>
            <div class="text-[10px] font-mono text-slate-500 flex items-center">
              <div class="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
              连接正常
            </div>
          </div>

    </div>
  </Transition>
</template>

<style scoped>
/* ========== 车厢详情科技面板 ========== */
/* 深蓝底色 + 内外发光，模拟数字孪生驾驶舱中的浮层卡片 */
.sci-panel {
  position: relative;
  /* 背景：深蓝色，营造深空感 */
  background: linear-gradient(135deg, rgba(4, 18, 32, 0.96) 0%, rgba(8, 30, 52, 0.92) 50%, rgba(4, 18, 32, 0.96) 100%);
  /* 边框：青色细线 */
  border: 1px solid rgba(34, 211, 238, 0.35);
  /* 孪生大屏硬切角效果（左上、右下切角，与右侧面板形成镜像对称） */
  clip-path: polygon(
    0 16px,
    16px 0,
    100% 0,
    100% calc(100% - 16px),
    calc(100% - 16px) 100%,
    0 100%
  );
  /* 双层阴影 */
  box-shadow:
    0 0 40px rgba(34, 211, 238, 0.12),
    inset 0 0 24px rgba(34, 211, 238, 0.05);
  /* 字体平滑：使用亚像素渲染，提升文字清晰度 */
  -webkit-font-smoothing: antialiased;
  /* Firefox 字体平滑 */
  -moz-osx-font-smoothing: grayscale;
  /* 文字渲染优化：优先考虑可读性 */
  text-rendering: optimizeLegibility;
}

/* 离线状态（不在库）时切换为橙色大屏主题风格 */
.sci-panel.is-offline {
  border-color: rgba(251, 146, 60, 0.4);
  box-shadow:
    0 0 40px rgba(251, 146, 60, 0.12),
    inset 0 0 24px rgba(251, 146, 60, 0.05);
}

/* 点阵背景网格 */
.dt-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(34, 211, 238, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 211, 238, 0.05) 1px, transparent 1px);
  background-size: 20px 20px;
  mask-image: radial-gradient(ellipse at center, #000 60%, transparent 95%);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 60%, transparent 95%);
  pointer-events: none;
  opacity: 0.7;
}
.sci-panel.is-offline .dt-grid {
  background-image:
    linear-gradient(rgba(251, 146, 60, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(251, 146, 60, 0.05) 1px, transparent 1px);
}

/* L 形定位四角 */
.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid #22d3ee;
  pointer-events: none;
  filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.5));
  z-index: 10;
}
.corner-tl { top: 4px; left: 4px; border-right: none; border-bottom: none; }
.corner-tr { top: 4px; right: 4px; border-left: none; border-bottom: none; }
.corner-bl { bottom: 4px; left: 4px; border-right: none; border-top: none; }
.corner-br { bottom: 4px; right: 4px; border-left: none; border-top: none; }

.sci-panel.is-offline .corner {
  border-color: #fb923c;
  filter: drop-shadow(0 0 3px rgba(251, 146, 60, 0.5));
}

/* ========== 扫描线动画 ========== */
.dt-scanline {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.5) 50%, transparent 100%);
  animation: scanline 4s linear infinite;
  z-index: 399;
  pointer-events: none;
}
.sci-panel.is-offline .dt-scanline {
  background: linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.5) 50%, transparent 100%);
}

@keyframes scanline {
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

/* 窄版科幻滚动条 */
.flex-1 {
  scrollbar-width: thin;
}
.flex-1::-webkit-scrollbar {
  width: 5px;
}
.flex-1::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.flex-1::-webkit-scrollbar-thumb {
  background: rgba(34, 211, 238, 0.2);
  border-radius: 3px;
}
.flex-1::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.45);
}
.sci-panel.is-offline .flex-1::-webkit-scrollbar-thumb {
  background: rgba(251, 146, 60, 0.2);
}
.sci-panel.is-offline .flex-1::-webkit-scrollbar-thumb:hover {
  background: rgba(251, 146, 60, 0.45);
}

/* ========== 内容区 HUD 单元格统一风格 ========== */
.cd-content {
  background:
    linear-gradient(180deg, rgba(2, 8, 20, 0.36), rgba(2, 8, 20, 0.22)),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(34, 211, 238, 0.022) 31px 32px);
}

.sci-panel.is-offline .cd-content {
  background:
    linear-gradient(180deg, rgba(24, 14, 6, 0.22), rgba(2, 8, 20, 0.2)),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(251, 146, 60, 0.022) 31px 32px);
}

.cd-content :deep(.rounded-lg),
.cd-content :deep(.rounded) {
  border-radius: 2px;
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
}

.cd-content :deep(.border-slate-700\/50),
.cd-content :deep(.border-slate-700\/30),
.cd-content :deep(.border-cyan-500\/20),
.cd-content :deep(.border-cyan-500\/30) {
  border-color: rgba(34, 211, 238, 0.16);
}

.cd-content :deep(.bg-slate-800\/50),
.cd-content :deep(.bg-slate-800\/40),
.cd-content :deep(.bg-slate-800\/30),
.cd-content :deep(.bg-slate-800\/80),
.cd-content :deep(.from-cyan-950\/50) {
  background:
    linear-gradient(135deg, rgba(8, 47, 73, 0.32), rgba(15, 23, 42, 0.44)) !important;
  box-shadow: inset 0 0 14px rgba(34, 211, 238, 0.035);
}

.sci-panel.is-offline .cd-content :deep(.border-slate-700\/50),
.sci-panel.is-offline .cd-content :deep(.border-slate-700\/30),
.sci-panel.is-offline .cd-content :deep(.border-cyan-500\/20),
.sci-panel.is-offline .cd-content :deep(.border-cyan-500\/30) {
  border-color: rgba(251, 146, 60, 0.16);
}

.sci-panel.is-offline .cd-content :deep(.bg-slate-800\/50),
.sci-panel.is-offline .cd-content :deep(.bg-slate-800\/40),
.sci-panel.is-offline .cd-content :deep(.bg-slate-800\/30),
.sci-panel.is-offline .cd-content :deep(.bg-slate-800\/80),
.sci-panel.is-offline .cd-content :deep(.from-cyan-950\/50) {
  background:
    linear-gradient(135deg, rgba(67, 35, 12, 0.28), rgba(15, 23, 42, 0.42)) !important;
  box-shadow: inset 0 0 14px rgba(251, 146, 60, 0.035);
}

/* ========== Header 数字孪生样式 ========== */
.cd-header {
  position: relative;
  /* 触摸屏下禁止浏览器默认手势，保证 pointer 事件连续 */
  touch-action: none;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 16px 12px;
  flex-shrink: 0;
  cursor: move;
  user-select: none;
  background: linear-gradient(180deg, rgba(34, 211, 238, 0.08) 0%, rgba(6, 22, 44, 0.4) 100%);
}

/* Header 底部数据总线光条 */
.cd-header::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(34, 211, 238, 0.1) 15%,
    rgba(34, 211, 238, 0.6) 50%,
    rgba(34, 211, 238, 0.1) 85%,
    transparent 100%);
  animation: databus 3s ease-in-out infinite;
}

.sci-panel.is-offline .cd-header::after {
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(251, 146, 60, 0.1) 15%,
    rgba(251, 146, 60, 0.6) 50%,
    rgba(251, 146, 60, 0.1) 85%,
    transparent 100%);
}

@keyframes databus {
  0%, 100% { opacity: 0.5; transform: scaleX(0.6); }
  50% { opacity: 1; transform: scaleX(1); }
}

/* ========== Tabs 数字孪生样式 ========== */
.cd-tabs {
  display: flex;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(8, 30, 52, 0.7) 0%, rgba(4, 18, 32, 0.8) 100%);
  border-bottom: 1px solid rgba(34, 211, 238, 0.1);
}

.cd-tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 4px;
  color: #64748b;
  transition: all 0.2s;
  position: relative;
  border: none;
  background: transparent;
  cursor: pointer;
}

.cd-tab-btn:hover {
  color: #94a3b8;
  background: rgba(34, 211, 238, 0.04);
}

.cd-tab-active {
  color: #22d3ee !important;
  background: rgba(34, 211, 238, 0.08) !important;
}

/* 激活 Tab 底部指示灯效果 */
.cd-tab-active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 20%; right: 20%;
  height: 2px;
  background: #22d3ee;
  border-radius: 2px;
  box-shadow: 0 0 6px rgba(34, 211, 238, 0.6);
}

.sci-panel.is-offline .cd-tab-active {
  color: #fb923c !important;
  background: rgba(251, 146, 60, 0.08) !important;
}
.sci-panel.is-offline .cd-tab-active::after {
  background: #fb923c;
  box-shadow: 0 0 6px rgba(251, 146, 60, 0.6);
}

/* ========== Footer 数字孪生样式 ========== */
.cd-footer {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(4, 18, 32, 0.5) 0%, rgba(8, 30, 52, 0.6) 100%);
}

/* Footer 顶部数据总线光条 */
.cd-footer::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(34, 211, 238, 0.4) 30%,
    rgba(34, 211, 238, 0.1) 70%,
    transparent 100%);
}

.sci-panel.is-offline .cd-footer::before {
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(251, 146, 60, 0.4) 30%,
    rgba(251, 146, 60, 0.1) 70%,
    transparent 100%);
}

/* ========== 车厢详情弹出动画 ========== */
/* 进入时从左侧滑入并淡入，强调"选中车厢后弹出详情"的空间关系 */
.carriage-slide-enter-active {
  /* 过渡动画：所有属性变化时平滑过渡，时长 0.35s，缓动函数为 cubic-bezier */
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ========== 车厢详情关闭动画 ========== */
/* 关闭时使用更短的缓动，保证用户点击关闭后的反馈足够轻快 */
.carriage-slide-leave-active {
  /* 过渡动画：所有属性变化时平滑过渡，时长 0.25s，缓动函数为 ease-in */
  transition: all 0.25s ease-in;
}

/* ========== 进入初始状态 ========== */
/* 初始进入位置：向左偏移并完全透明 */
.carriage-slide-enter-from {
  /* 透明度：0，完全透明 */
  opacity: 0;
  /* 位移：向左 60px，从屏幕左侧进入 */
  transform: translateX(-60px);
}

/* ========== 离开终态 ========== */
/* 离开终态：向左滑出并透明，和进入方向保持一致 */
.carriage-slide-leave-to {
  /* 透明度：0，完全透明 */
  opacity: 0;
  /* 位移：向左 60px，滑出屏幕左侧 */
  transform: translateX(-60px);
}
</style>
