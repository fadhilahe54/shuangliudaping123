<!--
  CarriageBottomPanels.vue -- 车厢底部详情浮层
  点击 3D 场景中的单节车厢后，从屏幕底部弹出该车厢的详细信息，包括：
    - 基础信息：车号、车种、状态徽章
    - 里程信息：已跑里程 + 进度条（颜色随里程变化：正常/警告/超限）
    - 检修信息：A1~A4 辅修记录
    - 传感器数据：电压/气压/振动（异常时高亮警告）
  使用方：UIOverlay.vue（监听 store.selectedCarriage 变化显示/隐藏）
-->
<script setup>
import { computed } from 'vue'
// 列车数据 Store（获取当前选中车厢数据）
import { useTrainStore } from '../stores/trainStore.js'
// Element Plus 图标（各信息区块的小图标）
import {
  InfoFilled, Guide, Odometer, Lightning, TrendCharts,
  Calendar, SetUp, Coin, Warning, Close, Location, Setting,
} from '@element-plus/icons-vue'

// 获取列车数据 Store 实例
const store = useTrainStore()

/**
 * 当前选中的车厢数据对象
 * 来自 store.selectedCarriage，null 时不显示底部面板
 * @returns {Object|null} 车厢数据对象或 null
 */
const carriage = computed(() => store.selectedCarriage)

// 车厢状态中文标签映射表
const statusMap = { 
  Normal: '正常', 
  Warning: '警告', 
  Maintenance: '维护中' 
}

// 车种中文标签映射表
const typeMap = { 
  yz: '硬座', 
  yw: '硬卧', 
  rw: '软卧', 
  ca: '餐车', 
  fd: '发电车', 
  kw: '客卧' 
}

/**
 * 计算状态徽章的 Tailwind 类名
 * 根据车厢状态返回不同的背景色、文字色和边框色
 * 正常=青色，维护=黄色，警告=红色
 * 
 * @returns {string} Tailwind 类名字符串
 */
const statusBadgeClass = computed(() => {
  // 若无选中车厢，返回空字符串
  if (!carriage.value) return ''
  
  // 获取车厢状态
  const s = carriage.value.status
  
  // 根据状态返回对应的 Tailwind 类名
  if (s === 'Normal')      return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
  if (s === 'Maintenance') return 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
  
  // 默认为警告状态（红色）
  return 'bg-red-500/15 text-red-400 border border-red-500/30'
})

/**
 * 格式化里程显示
 * ≥1 万 km 时转换为"X.X万"，<1 万 km 时保留千位分隔符
 * 
 * @returns {string} 格式化后的里程字符串
 */
const formattedMileage = computed(() => {
  // 若无选中车厢，返回 '0'
  if (!carriage.value) return '0'
  
  // 获取里程数值
  const km = carriage.value.mileage
  
  // 若 ≥1 万 km，转换为"X.X万"格式
  if (km >= 10000) return (km / 10000).toFixed(1) + '万'
  
  // 否则保留千位分隔符
  return km.toLocaleString()
})

/**
 * 计算里程进度条百分比
 * 满量程设为 50 万 km，超出则显示 100%
 * 
 * @returns {number} 0 ~ 100 的百分比值
 */
const mileagePercent = computed(() => {
  // 若无选中车厢，返回 0
  if (!carriage.value) return 0
  
  // 计算百分比：当前里程 / 50 万 km，限制在 0 ~ 100
  return Math.min((carriage.value.mileage / 500000) * 100, 100)
})

/**
 * 计算里程进度条颜色
 * 正常=青色，警告=黄色，超限=红色
 * 阈值：25 万 km 进入警告，40 万 km 进入超限
 * 
 * @returns {string} 颜色值（十六进制）
 */
const mileageBarColor = computed(() => {
  // 若无选中车厢，返回默认青色
  if (!carriage.value) return '#22d3ee'
  
  // 若里程 > 40 万 km，返回红色（超限）
  if (carriage.value.mileage > 400000) return '#f87171'
  
  // 若里程 > 25 万 km，返回黄色（警告）
  if (carriage.value.mileage > 250000) return '#fbbf24'
  
  // 否则返回青色（正常）
  return '#22d3ee'
})

// 检修项目列表，包含 A1~A4 四个辅修项目
// key 对应车厢数据中的字段名，color 用于进度条显示
const repairItems = [
  { key: 'a1Repair', label: 'A1修', color: '#fbbf24', tag: '辅修' },
  { key: 'a2Repair', label: 'A2修', color: '#facc15', tag: '辅修' },
  { key: 'a3Repair', label: 'A3修', color: '#4ade80', tag: '辅修' },
  { key: 'a4Repair', label: 'A4修', color: '#22d3ee', tag: '辅修' },
]

/**
 * 电压传感器异常检测
 * 安全范围：200V ~ 280V，超出范围时返回 true
 * 
 * @returns {boolean} 是否异常
 */
const voltageAlert = computed(() => 
  carriage.value && (carriage.value.sensors.voltage < 200 || carriage.value.sensors.voltage > 280)
)

/**
 * 气压传感器异常检测
 * 安全范围：80 ~ 120，超出范围时返回 true
 * 
 * @returns {boolean} 是否异常
 */
const pressureAlert = computed(() => 
  carriage.value && (carriage.value.sensors.pressure < 80 || carriage.value.sensors.pressure > 120)
)

/**
 * 振动传感器异常检测
 * 安全阈值：≤3，超过 3 时返回 true
 * 
 * @returns {boolean} 是否异常
 */
const vibrationAlert = computed(() => 
  carriage.value && carriage.value.sensors.vibration > 3
)

/**
 * 关闭底部面板
 * 清除 store 中选中的车厢，触发面板隐藏动画
 * 
 * @function close
 * @returns {void}
 */
function close() {
  // 调用 Store 方法清除选中车厢
  store.setSelectedCarriage(null)
}
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="carriage"
      class="absolute bottom-3 left-[335px] right-4 z-20 pointer-events-auto dt-panels"
    >
      <div class="flex gap-2.5 overflow-x-auto pb-1">

        <!-- 模块1：基本信息 -->
        <div class="shrink-0 w-[195px]">
          <dv-border-box-13>
            <div class="p-3 flex flex-col gap-2 min-h-[175px]">
              <div class="flex items-center justify-between">
                <span class="dt-label"><el-icon :size="12"><InfoFilled /></el-icon> 基本信息</span>
                <button @click="close" class="text-slate-500 hover:text-cyan-400 transition-colors">
                  <el-icon :size="14"><Close /></el-icon>
                </button>
              </div>
              <div class="dt-value text-[22px] tracking-[0.15em]">{{ carriage.id }}</div>
              <div class="flex items-center gap-2">
                <span :class="['px-2 py-0.5 rounded text-[10px] font-semibold', statusBadgeClass]">
                  {{ statusMap[carriage.status] || carriage.status }}
                </span>
                <el-icon v-if="carriage.status === 'Warning'" class="text-red-400 animate-pulse" :size="14"><Warning /></el-icon>
              </div>
              <div class="mt-auto flex flex-col gap-1">
                <div class="dt-sub flex items-center gap-1">
                  <el-icon :size="12" class="text-cyan-500"><Location /></el-icon>
                  {{ store.getTrackName(carriage.trackId) }} · 第 {{ carriage.index + 1 }} 位
                </div>
                <div class="dt-sub text-slate-500">{{ typeMap[carriage.type] || carriage.type }}</div>
              </div>
            </div>
          </dv-border-box-13>
        </div>

        <!-- 模块2：走行公里 -->
        <div class="shrink-0 w-[195px]">
          <dv-border-box-13>
            <div class="p-3 flex flex-col gap-2 min-h-[175px]">
              <span class="dt-label"><el-icon :size="12"><Guide /></el-icon> 走行公里</span>
              <div class="dt-value text-[24px]" :style="{ color: mileageBarColor }">
                {{ formattedMileage }}
                <span class="text-[11px] text-slate-500 font-normal">km</span>
              </div>
              <div class="w-full h-[6px] bg-slate-800/80 rounded-full overflow-hidden mt-1">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :style="{ width: `${mileagePercent}%`, background: `linear-gradient(90deg, ${mileageBarColor}88, ${mileageBarColor})` }"
                />
              </div>
              <div class="flex justify-between mt-auto">
                <span class="dt-sub">上限 50万km</span>
                <span class="dt-num text-[13px]" :style="{ color: mileageBarColor }">
                  {{ (100 - carriage.mileage / 5000).toFixed(0) }}%
                  <span class="text-slate-500 text-[10px] font-normal">剩余</span>
                </span>
              </div>
            </div>
          </dv-border-box-13>
        </div>

        <!-- 模块3：实时数据 -->
        <div class="shrink-0 w-[175px]">
          <dv-border-box-13>
            <div class="p-3 flex flex-col gap-2 min-h-[175px]">
              <span class="dt-label"><el-icon :size="12"><Odometer /></el-icon> 实时数据</span>
              <div class="flex-1 flex flex-col justify-center gap-3">
                <div>
                  <div class="dt-sub mb-1">速度</div>
                  <div class="dt-value text-[22px]">
                    {{ carriage.speed }}
                    <span class="text-[10px] text-slate-500 font-normal tracking-normal">km/h</span>
                  </div>
                </div>
                <div class="border-t border-cyan-500/10 pt-2">
                  <div class="dt-sub mb-1">温度</div>
                  <div class="dt-value text-[22px]">
                    {{ carriage.temperature.toFixed(1) }}
                    <span class="text-[10px] text-slate-500 font-normal tracking-normal">°C</span>
                  </div>
                </div>
              </div>
            </div>
          </dv-border-box-13>
        </div>

        <!-- 模块4：传感器 -->
        <div class="shrink-0 w-[215px]">
          <dv-border-box-13>
            <div class="p-3 flex flex-col gap-2 min-h-[175px]">
              <span class="dt-label"><el-icon :size="12"><TrendCharts /></el-icon> 传感器</span>
              <div class="flex-1 flex flex-col justify-center gap-2">
                <!-- 电压 -->
                <div class="flex items-center justify-between">
                  <span class="dt-sub flex items-center gap-1">
                    <el-icon :size="12" :class="voltageAlert ? 'text-red-400' : 'text-yellow-400'"><Lightning /></el-icon>主电压
                  </span>
                  <span :class="['dt-num text-[14px]', voltageAlert ? 'text-red-400 animate-pulse' : 'text-yellow-400']">
                    {{ carriage.sensors.voltage.toFixed(0) }}<span class="text-[9px] text-slate-500 font-normal">V</span>
                  </span>
                </div>
                <!-- 压力 -->
                <div class="flex items-center justify-between border-t border-cyan-500/10 pt-1.5">
                  <span class="dt-sub flex items-center gap-1">
                    <el-icon :size="12" :class="pressureAlert ? 'text-red-400' : 'text-blue-400'"><Odometer /></el-icon>制动压力
                  </span>
                  <span :class="['dt-num text-[14px]', pressureAlert ? 'text-red-400 animate-pulse' : 'text-blue-400']">
                    {{ carriage.sensors.pressure.toFixed(0) }}<span class="text-[9px] text-slate-500 font-normal">PSI</span>
                  </span>
                </div>
                <!-- 振动 -->
                <div class="flex items-center justify-between border-t border-cyan-500/10 pt-1.5">
                  <span class="dt-sub flex items-center gap-1">
                    <el-icon :size="12" :class="vibrationAlert ? 'text-red-400' : 'text-green-400'"><TrendCharts /></el-icon>底盘振动
                  </span>
                  <span :class="['dt-num text-[14px]', vibrationAlert ? 'text-red-400 animate-pulse' : 'text-green-400']">
                    {{ carriage.sensors.vibration.toFixed(2) }}<span class="text-[9px] text-slate-500 font-normal">G</span>
                  </span>
                </div>
              </div>
            </div>
          </dv-border-box-13>
        </div>

        <!-- 模块5：检修信息 -->
        <div class="shrink-0 w-[215px]">
          <dv-border-box-13>
            <div class="p-3 flex flex-col gap-2 min-h-[175px]">
              <span class="dt-label"><el-icon :size="12"><Calendar /></el-icon> 检修信息</span>
              <div class="flex-1 flex flex-col justify-center gap-[5px]" v-if="carriage.repairs">
                <div
                  v-for="item in repairItems"
                  :key="item.key"
                  class="flex items-center justify-between"
                >
                  <span class="flex items-center gap-1.5">
                    <span class="inline-block w-[6px] h-[6px] rounded-full" :style="{ background: item.color }" />
                    <span class="text-[11px] font-semibold" :style="{ color: item.color }">{{ item.label }}</span>
                  </span>
                  <span class="dt-num text-[11px] text-slate-300">{{ carriage.repairs[item.key] }}</span>
                </div>
              </div>
            </div>
          </dv-border-box-13>
        </div>

        <!-- 模块6：维护记录 -->
        <div class="shrink-0 w-[215px]">
          <dv-border-box-13>
            <div class="p-3 flex flex-col gap-2 min-h-[175px]">
              <span class="dt-label"><el-icon :size="12"><SetUp /></el-icon> 维护记录</span>
              <div class="flex-1 flex flex-col justify-center gap-2">
                <div
                  v-for="(log, i) in carriage.history"
                  :key="i"
                  class="relative pl-3 flex flex-col gap-0.5"
                >
                  <div class="absolute left-0 top-0 bottom-0 w-[2px] rounded" style="background: linear-gradient(180deg, #22d3ee, #0ea5e9)" />
                  <span class="text-[12px] text-slate-200 font-medium">{{ log.action }}</span>
                  <div class="flex items-center justify-between">
                    <span class="dt-sub flex items-center gap-1">
                      <el-icon :size="10"><Setting /></el-icon>{{ log.technician }}
                    </span>
                    <span class="dt-num text-[10px] text-slate-500">{{ log.date }}</span>
                  </div>
                </div>
              </div>
            </div>
          </dv-border-box-13>
        </div>

        <!-- 模块7：规格参数 -->
        <div class="shrink-0 w-[175px]">
          <dv-border-box-13>
            <div class="p-3 flex flex-col gap-2 min-h-[175px]">
              <span class="dt-label"><el-icon :size="12"><Coin /></el-icon> 规格参数</span>
              <div class="flex-1 flex flex-col justify-center gap-2.5">
                <div>
                  <div class="dt-sub">重量</div>
                  <div class="dt-value text-[16px]">{{ carriage.specs.weight }}</div>
                </div>
                <div class="border-t border-cyan-500/10 pt-2">
                  <div class="dt-sub">载客量</div>
                  <div class="dt-value text-[16px]">{{ carriage.specs.capacity }}</div>
                </div>
                <div class="border-t border-cyan-500/10 pt-2">
                  <div class="dt-sub">制造日期</div>
                  <div class="dt-value text-[16px]">{{ carriage.specs.manufactured }}</div>
                </div>
              </div>
            </div>
          </dv-border-box-13>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ========== 数字孪生面板全局样式 ========== */
/* 底部浮层面板的全局字体优化和渲染设置 */
.dt-panels {
  /* 字体平滑：使用亚像素渲染，提升文字清晰度 */
  -webkit-font-smoothing: antialiased;
  /* Firefox 字体平滑 */
  -moz-osx-font-smoothing: grayscale;
  /* 文字渲染优化：优先考虑可读性 */
  text-rendering: optimizeLegibility;
}

/* ========== 模块标题样式 ========== */
/* 各信息模块的顶部标题（如"基本信息"、"里程信息"等） */
.dt-label {
  /* 使用 flex 布局，图标和文字水平排列 */
  display: flex;
  /* 垂直居中 */
  align-items: center;
  /* 图标和文字间距：4px */
  gap: 4px;
  /* 字号：11px，小标题 */
  font-size: 11px;
  /* 字重：600（半粗），强调 */
  font-weight: 600;
  /* 字间距：0.08em，增加科技感 */
  letter-spacing: 0.08em;
  /* 文字颜色：青色 */
  color: #67e8f9;
  /* 文字阴影：8px 青色发光，营造霓虹灯效果 */
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
}

/* ========== 主数据值样式 ========== */
/* 大屏显示的主要数据值（如里程、温度等） */
.dt-value {
  /* 字体：等宽字体，便于数字对齐 */
  font-family: 'Courier New', 'JetBrains Mono', 'Consolas', monospace;
  /* 字重：700（加粗），突出数据 */
  font-weight: 700;
  /* 文字颜色：浅蓝色，高对比度 */
  color: #f0f9ff;
  /* 字间距：0.05em，增加可读性 */
  letter-spacing: 0.05em;
  /* 文字阴影：12px 青色发光，强调重要数据 */
  text-shadow: 0 0 12px rgba(34, 211, 238, 0.25);
}

/* ========== 辅助说明文字样式 ========== */
/* 数据单位、说明等辅助文字 */
.dt-sub {
  /* 字号：11px，较小 */
  font-size: 11px;
  /* 文字颜色：灰色，表示辅助信息 */
  color: #94a3b8;
  /* 字间距：0.03em，轻微增加 */
  letter-spacing: 0.03em;
}

/* ========== 数字高亮样式 ========== */
/* 传感器数值、进度条百分比等数字显示 */
.dt-num {
  /* 字体：等宽字体，便于数字对齐 */
  font-family: 'Courier New', 'JetBrains Mono', 'Consolas', monospace;
  /* 字重：700（加粗），突出数字 */
  font-weight: 700;
  /* 字间距：0.02em，轻微增加 */
  letter-spacing: 0.02em;
}

/* ========== 入场/离场动画 ========== */
/* 底部面板从屏幕下方滑入/滑出的动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  /* 过渡动画：所有属性变化时平滑过渡，时长 0.4s，缓动函数为 cubic-bezier */
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 入场起始状态和离场结束状态 */
.slide-up-enter-from,
.slide-up-leave-to {
  /* 透明度：0，完全透明 */
  opacity: 0;
  /* 位移：向下 30px，从屏幕下方进入 */
  transform: translateY(30px);
}
</style>
