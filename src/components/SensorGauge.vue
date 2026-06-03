<!--
  SensorGauge.vue — 传感器仪表盘组件

  显示单个传感器指标，包含：
    - 半圆弧形进度条（SVG stroke-dashoffset 动画）
    - 当前数值和单位显示
    - 警报状态（高亮红色边框 + 警告图标闪烁）
    - 迷你历史小折线图（基于当前値加随机扰动模拟）

  使用方：CarriageDetails.vue 等车厢详情面板
-->
<script setup>
/**
 * SensorGauge.vue — 传感器仪表盘组件
 * 
 * 显示单个传感器指标，包含：
 *   - 半圆弧形进度条（SVG stroke-dashoffset 动画）
 *   - 当前数值和单位显示
 *   - 警报状态（高亮红色边框 + 警告图标闪烁）
 *   - 迷你历史小折线图（基于当前值加随机扰动模拟）
 * 
 * 使用方：CarriageDetails.vue 等车厢详情面板
 */

// Vue 响应式 API
import { computed } from 'vue'

// 警告图标（alert 状态时显示）
import { Warning } from '@element-plus/icons-vue'

// 定义组件 Props
const props = defineProps({
  // 当前指标值，用于计算进度条百分比
  value: { type: Number, required: true },
  
  // 最大值，用于计算百分比（value / max）
  max: { type: Number, required: true },
  
  // 指标名称，显示在仪表盘顶部
  label: { type: String, required: true },
  
  // 单位，显示在数值下方（如 ℃、%、V）
  unit: { type: String, required: true },
  
  // Tailwind 文字颜色类，用于数值显示颜色
  colorClass: { type: String, default: 'text-cyan-400' },
  
  // 弧形进度条颜色，SVG stroke 属性值
  strokeColor: { type: String, default: '#06b6d4' },
  
  // 自定义图标组件，显示在标签左侧
  icon: { type: [Object, Function], default: null },
  
  // 是否警报状态，true 时显示红色边框和闪烁警告图标
  alert: { type: Boolean, default: false },
})

// SVG 半圆弧的半径
const radius = 40

// 半圆弧形的展开长度（弧长 = 半圆周长 = πr）
const arcLength = Math.PI * radius

/**
 * 计算 SVG stroke-dashoffset，实现弧形进度条动画
 * stroke-dashoffset = 0 表示进度条充满
 * stroke-dashoffset = arcLength 表示进度条全空
 * 
 * @returns {number} SVG stroke-dashoffset 值
 */
const strokeDashoffset = computed(() => {
  // 限制数值在 [0, max] 范围内，防止超界导致弧形显示异常
  const normalized = Math.min(Math.max(props.value, 0), props.max)
  
  // 计算百分比：0 ~ 1
  const percentage = normalized / props.max
  
  // 计算 offset：从 arcLength（全空）到 0（充满）
  return arcLength - percentage * arcLength
})

/**
 * 生成迷你历史折线图的数据点
 * 以当前值为起点，向过去反推 20 个带随机扰动的模拟历史值
 * 转换为 SVG polyline 的 points 字符串
 * 
 * @returns {string} SVG polyline points 属性值
 */
const historyPoints = computed(() => {
  // 初始化数据数组
  const data = []
  
  // 从当前值开始
  let currentVal = props.value
  
  // 生成 20 个历史数据点
  for (let i = 0; i < 20; i++) {
    // 将当前值插入到数组开头（向过去反推）
    data.unshift(currentVal)
    
    // 生成随机扰动，幅度为 max 的 15%
    const noise = (Math.random() - 0.5) * (props.max * 0.15)
    
    // 更新当前值，并限制在 [0, max] 范围内
    currentVal = Math.max(0, Math.min(props.max, currentVal + noise))
  }
  
  // 找出数据的最小值和最大值，用于归一化
  const minVal = Math.min(...data)
  const maxVal = Math.max(...data)
  
  // 计算数值范围，防止除以零
  const range = maxVal - minVal || 1
  
  // 将数据转换为 SVG 坐标
  return data.map((v, i) => {
    // x 坐标：从 0 到 100，均匀分布
    const x = (i / (data.length - 1)) * 100
    
    // y 坐标：从 30 到 2，SVG 上小下大，需要翻转
    const y = 30 - ((v - minVal) / range) * 28
    
    // 返回坐标字符串
    return `${x},${y}`
  }).join(' ')
})
</script>

<template>
  <div :class="[
    'flex flex-col items-center bg-slate-800/30 p-4 rounded-xl border transition-all duration-300',
    alert ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-slate-700/50'
  ]">
    <div :class="[
      'text-xs uppercase tracking-wider mb-2 flex items-center w-full justify-center',
      alert ? 'text-red-400 font-bold animate-pulse' : 'text-slate-400'
    ]">
      <el-icon v-if="alert" class="mr-1 text-red-400" :size="16"><Warning /></el-icon>
      <el-icon v-else-if="icon" class="mr-1" :size="16"><component :is="icon" /></el-icon>
      {{ label }}
    </div>
    <div class="relative w-32 h-16 mt-2">
      <svg viewBox="0 0 100 55" class="w-full h-full overflow-visible">
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="#1e293b"
          stroke-width="8"
          stroke-linecap="round"
        />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          :stroke="strokeColor"
          stroke-width="8"
          stroke-linecap="round"
          :stroke-dasharray="arcLength"
          :stroke-dashoffset="strokeDashoffset"
          class="transition-all duration-1000 ease-out"
        />
      </svg>
      <div class="absolute bottom-0 left-0 w-full text-center flex flex-col items-center justify-end">
        <span :class="['text-2xl font-mono font-bold leading-none', colorClass]">
          {{ value.toFixed(1) }}
        </span>
        <span class="text-[10px] text-slate-500 font-mono mt-1">{{ unit }}</span>
      </div>
    </div>

    <!-- 迷你历史折线图 -->
    <div class="w-full h-10 mt-3 opacity-80">
      <svg viewBox="0 0 100 32" class="w-full h-full" preserveAspectRatio="none">
        <polyline
          :points="historyPoints"
          fill="none"
          :stroke="strokeColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
</style>
