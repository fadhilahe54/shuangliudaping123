<!--
  TrainInfoPanel.vue -- 整列车信息侧边面板
  点击 3D 场景中的某节车厢后，从右侧弹出整列车的详细信息：
    - 顶部：轨道名、车次号、编组信息、出发时间
    - 中部：每节车厢列表（车组分组 + 组内按序号排列），显示车厢号/车种/状态图标
    - 底部：出库/进库操作按钮（触发 3D 动画）
  支持重联（多个车组共用一条股道）时正确分组展示
  使用方：UIOverlay.vue
-->
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
// 列车数据 Store（选中轨道、车厢列表、轨道信息等）
import { useTrainStore } from '../stores/trainStore.js'
// 状态图标
import { CircleCheck, Warning, SetUp, Close, Rank } from '@element-plus/icons-vue'

// 获取列车数据 Store 实例
const store = useTrainStore()

/**
 * 计算当前选中的轨道 ID
 * 
 * @returns {number|string|null} 轨道 ID 或 null
 */
const trackId = computed(() => store.selectedTrainTrackId)

/**
 * “不在库”模式标志：后台搜索命中但当前不在 3D 场景库中的车组/车次/车号
 * - 为 true 时，面板从 store.offlineSearchInfo 读数据（不依赖 trackId）
 * - 为 false 时走原有“在库”流程
 */
const isOffline = computed(() => trackId.value === null && !!store.offlineSearchInfo)

/** 后台车种字符串→前端 type 标识（与 trainStore.mapVehicleType 保持一致的简化版） */
function mapKindToType(kind) {
  if (!kind) return 'yz'
  if (kind.includes('XL') || kind.includes('行李')) return 'fd'
  if (kind.includes('YZ') || kind.includes('硬座')) return 'yz'
  if (kind.includes('YW') || kind.includes('硬卧')) return 'yw'
  if (kind.includes('RW') || kind.includes('软卧')) return 'rw'
  if (kind.includes('CA') || kind.includes('餐车')) return 'ca'
  if (kind.includes('KW') || kind.includes('客卧')) return 'kw'
  return 'yz'
}

/**
 * 计算选中轨道的车厢列表
 * 先按车组分组，再在组内按车辆序号排序
 * 支持重联（多个车组共用一条股道）、以及“不在库”模式（从 offlineSearchInfo 获取）
 * 
 * @returns {Array<Object>} 排序后的车厢数据数组
 */
const selectedCarriages = computed(() => {
  // 不在库模式：从后台车辆信息List 映射为同样结构的虚拟车厢数据
  // 补全 trackId/sensors 等字段，使 CarriageDetails 能直接复用，无需额外分支
  if (isOffline.value) {
    const o = store.offlineSearchInfo
    const vs = o?.vehicles || []
    return vs.map((v, i) => ({
      id: v.车号 || v.id || `车辆-${i + 1}`,
      type: mapKindToType(v.车种),
      status: 'Normal',
      mileage: Number(v.走行km || v.走行公里 || 0),
      // 检修信息：尽量保留后端已有字段，缺失补 ''
      repairs: {
        a1Repair: v.厂修时间 || v.A1修 || '',
        a2Repair: v.A2修 || '',
        a3Repair: v.A3修 || '',
        a4Repair: v.A4修 || '',
      },
      // 传感器字段缺失：给 0 占位，避免 CarriageDetails 中读取 .voltage 等抛 NPE
      sensors: { voltage: 0, pressure: 0, vibration: 0 },
      // 实时运行字段：不在库无实时数据，统一给 0 占位
      speed: 0,
      temperature: 0,
      // 规格参数：从后端字段尝试映射，缺失给 '--' 占位（CarriageDetails 规格参数 Tab 需要）
      specs: {
        weight: v.自重 || v.weight || '--',
        capacity: v.定员 || v.载客量 || v.capacity || '--',
        manufactured: v.出厂日期 || v.制造日期 || v.manufactured || '--',
      },
      // 位置字段：不在库无轨道，trackId 设 null；列位/索引给默认值
      trackId: null,
      _position: 'pos1',
      index: i,
      _vehicleSeq: v.车辆序号 ?? (i + 1),
      _groupIndex: 0,
      _trainGroupNo: o?.groupNo,
      _vehicleModel: v.车型 || o?.vehicleModel || '',
      // 标记：CarriageDetails 可据此显示"档案数据"模式
      _offline: true,
    })).sort((a, b) => (a._vehicleSeq ?? 0) - (b._vehicleSeq ?? 0))
  }

  // 若无选中轨道，返回空数组
  if (trackId.value === null) return []
  
  // 复制并排序车厢列表
  return store.selectedTrainCarriages.slice().sort((a, b) => {
    // 先按车组索引排序（重联时1037在前、1089在后）
    const ga = a._groupIndex ?? 0
    const gb = b._groupIndex ?? 0
    if (ga !== gb) return ga - gb
    
    // 组内按车辆序号排序（无序号排最后）
    const sa = a._vehicleSeq
    const sb = b._vehicleSeq
    if (sa == null && sb == null) return 0
    if (sa == null) return 1
    if (sb == null) return -1
    return sa - sb
  })
})

/**
 * 获取车厢的连续编号（1-based）
 * 基于排序后的位置，用于显示"第 X 节车厢"
 * 
 * @param {Object} car - 车厢数据对象
 * @returns {number} 车厢序号（1 开始）
 */
function getCarSeq(car) {
  // 在排序后的列表中查找车厢位置
  const idx = selectedCarriages.value.findIndex(c => c.id === car.id)
  // 返回 1-based 索引
  return idx >= 0 ? idx + 1 : 1
}

/**
 * 计算选中轨道的列车信息
 * 支持主轨道和存车道（n 道）
 * 
 * @returns {Object|null} 列车信息对象或 null
 */
const trainInfo = computed(() => {
  // 不在库模式：造一个同结构的信息对象（未知字段以 -- 占位）
  if (isOffline.value) {
    const o = store.offlineSearchInfo
    return {
      trainNo: o?.groupNo || '',
      trainNumber: o?.trainNo || '',
      vehicleModel: o?.vehicleModel || '',
      formation: o?.formation ? `${o.formation}辆编组` : '',
      direction: o?.direction || '',
      arriveTime: '',
      departTime: '',
      task: '',
      crew: '',
      remark: '',
    }
  }
  // 若无选中轨道，返回 null
  if (trackId.value === null) return null
  
  // 若为存车道（n1、n2 等），从 nTrackInfo 获取
  if (typeof trackId.value === 'string' && trackId.value.startsWith('n')) {
    return store.nTrackInfo[trackId.value] || null
  }
  
  // 否则从 trackTrainInfo 获取
  return store.trackTrainInfo[trackId.value] || null
})

/**
 * 计算非重联时选中车组的车组号
 * 
 * @returns {string|null} 车组号或 null
 */
const groupTrainNo = computed(() => {
  // 获取选中的车组索引
  const gIdx = store.selectedGroupIndex
  if (gIdx === null) return null
  
  // 从车厢数据中提取车组号
  const cars = selectedCarriages.value
  if (cars.length > 0 && cars[0]._trainGroupNo) return cars[0]._trainGroupNo
  return null
})

/**
 * 计算显示用的车次号
 * 非重联用车组号，重联用轨道车次，都没有则用轨道名
 * 
 * @returns {string} 显示用的车次号
 */
const displayTrainNo = computed(() => {
  // 不在库模式：优先显示车组号
  if (isOffline.value) return store.offlineSearchInfo?.groupNo || ''
  return groupTrainNo.value || trainInfo.value?.trainNo || trackName.value
})

/**
 * 计算显示用的编组信息
 * 基于实际选中的车厢数
 * 
 * @returns {string} 编组信息字符串
 */
const displayFormation = computed(() => {
  return selectedCarriages.value.length + '辆编组'
})

/**
 * 计算轨道显示名称
 * 从后台股道数据获取真实名称
 * 
 * @returns {string} 轨道名称
 */
const trackName = computed(() => {
  // 不在库模式：没有轨道概念，用“车型”占位顶部位置
  if (isOffline.value) return store.offlineSearchInfo?.vehicleModel || ''
  if (trackId.value === null) return ''
  return store.getTrackName(trackId.value)
})

// 车种中文标签映射表
const typeMap = {
  fd: '发电车', ca: '餐车', rw: '软卧', yw: '硬卧', yz: '硬座', kw: '客卧',
}

// 车种标签对应的 Tailwind 样式类
const typeColor = {
  fd: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ca: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  rw: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  yw: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  yz: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  kw: 'bg-green-500/20 text-green-400 border-green-500/30',
}

// 车厢状态对应的图标组件
const statusIcon = { Normal: CircleCheck, Warning: Warning, Maintenance: SetUp }

// 车厢状态对应的文字颜色类
const statusColor = { Normal: 'text-green-400', Warning: 'text-red-400', Maintenance: 'text-yellow-400' }

// 车厢状态中文标签
const statusLabel = { Normal: '正常', Warning: '警告', Maintenance: '维护' }

// 列车运行状态中文标签映射表
const stateLabel = { parked: '停放中', departing: '出库中', out: '已出库', entering: '进库中' }

// 列车运行状态标签对应的 Tailwind 样式类
const stateTagColor = {
  parked: 'bg-green-500/15 text-green-400 border-green-500/30',
  departing: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  out: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  entering: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

// 点击车厢行 → 该车厢3D变蓝 + CarriageDetails面板显示（不关闭本面板）
function selectCarriage(car) {
  store.setSelectedCarriage(car, true)
}

function close() {
  // 不在库模式：清空详情面板及搜索框（clearSearch 会同时清空 offlineSearchInfo 和 searchQuery）
  if (isOffline.value) {
    store.clearSearch()
    return
  }
  store.setSelectedCarriage(null)
  store.setSelectedTrain(null)
  store.clearSearch()
}

// ========== 拖动功能 ==========
const panelRef = ref(null)
const dragOffset = ref({ x: 0, y: 0 })
const panelPos = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const hasBeenDragged = ref(false)

// 面板打开时重置位置（同时监听两种打开来源）
watch([trackId, isOffline], ([tid, off]) => {
  if (tid !== null || off) {
    hasBeenDragged.value = false
    panelPos.value = { x: 0, y: 0 }
  }
})

function onDragStart(e) {
  // 兼容鼠标/触摸/触控笔：鼠标只接受左键；触摸/笔不带 button 字段
  if (e.pointerType === 'mouse' && e.button !== 0) return
  isDragging.value = true

  // 首次拖动：从right定位切换到left定位，需要读取当前实际位置
  if (!hasBeenDragged.value && panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect()
    panelPos.value = { x: rect.left, y: rect.top }
    hasBeenDragged.value = true
  }

  dragOffset.value = {
    x: e.clientX - panelPos.value.x,
    y: e.clientY - panelPos.value.y,
  }
  // 捕获指针，避免快速滑动时丢失事件
  try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
  document.addEventListener('pointercancel', onDragEnd)
  e.preventDefault()
}
function onDragMove(e) {
  if (!isDragging.value) return
  panelPos.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y,
  }
}
function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
}

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
})
</script>

<template>
  <Transition name="train-slide">
    <div
      v-if="trackId !== null || isOffline"
      ref="panelRef"
      class="fixed z-50 pointer-events-auto"
      :style="{
        top: hasBeenDragged ? `${panelPos.y}px` : '72px',
        right: hasBeenDragged ? 'auto' : '16px',
        left: hasBeenDragged ? `${panelPos.x}px` : 'auto',
        maxHeight: 'calc(100vh - 88px)',
      }"
    >
      <div class="dt-hud-panel" :class="{ 'is-offline': isOffline }">
        <!-- 背景装饰层：网格 -->
        <div class="dt-grid"></div>
        <!-- 扫描线动画层 -->
        <div class="dt-scanline"></div>

        <!-- 四角 L 形装饰 -->
        <span class="corner corner-tl"></span>
        <span class="corner corner-tr"></span>
        <span class="corner corner-bl"></span>
        <span class="corner corner-br"></span>

        <div class="flex flex-col overflow-hidden" style="max-height: calc(100vh - 88px); width: 520px;">

          <!-- 头部（可拖动区域） -->
          <div class="dt-header" @pointerdown="onDragStart">
            <div class="flex-1">
              <div class="flex items-center gap-3">
                <span class="dt-train-id">{{ displayTrainNo }}</span>
                <span class="dt-track-name">{{ trackName }}</span>
                <!-- 在库：列车运行状态徽章 -->
                <span
                  v-if="!isOffline"
                  :class="['dt-state-tag', stateTagColor[store.trainStates[trackId]] || stateTagColor.parked]">
                  {{ stateLabel[store.trainStates[trackId]] || '停放中' }}
                </span>
                <!-- 不在库：橙色警示徽章 -->
                <span v-else class="dt-state-tag dt-state-offline">不在库</span>
              </div>
              <div class="dt-sub mt-1.5">
                {{ displayFormation }}<template v-if="trainInfo?.trainNumber"> · 车次 {{ trainInfo.trainNumber }}</template><template v-if="trainInfo?.vehicleModel"> · {{ trainInfo.vehicleModel }}</template><template v-if="trainInfo?.direction"> · {{ trainInfo.direction }}</template>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <el-icon class="text-slate-500/60" :size="14"><Rank /></el-icon>
              <button @pointerdown.stop @click.stop="close" class="dt-close-btn">
                <el-icon :size="16"><Close /></el-icon>
              </button>
            </div>
          </div>

          <!-- 编组示意图 -->
          <div class="dt-formation-section">
            <div class="dt-section-label">编组示意图 <span class="dt-section-hint">（← 车头）</span></div>
            <div class="flex gap-1 overflow-x-auto pb-1.5">
              <div
                v-for="car in selectedCarriages"
                :key="car.id"
                :class="[
                  'dt-car-block',
                  store.selectedCarriage?.id === car.id
                    ? 'dt-car-active'
                    : (typeColor[car.type] || 'bg-slate-700/50 text-slate-400 border-slate-600/50')
                ]"
                :title="`${car.id} - ${typeMap[car.type]} - ${statusLabel[car.status]}`"
                @click="selectCarriage(car)"
              >
                {{ getCarSeq(car) }}
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <span v-for="(label, key) in typeMap" :key="key" :class="['dt-legend-item', typeColor[key]]">
                {{ label }}
              </span>
            </div>
          </div>

          <!-- 车次详细信息 -->
          <div v-if="trainInfo" class="dt-info-grid">
            <div class="dt-info-cell">
              <span class="dt-info-label">车次</span>
              <div class="dt-info-value dt-info-highlight">{{ trainInfo.trainNumber || '--' }}</div>
            </div>
            <div class="dt-info-cell">
              <span class="dt-info-label">车型</span>
              <div class="dt-info-value">{{ trainInfo.vehicleModel || '--' }}</div>
            </div>
            <div class="dt-info-cell">
              <span class="dt-info-label">区间</span>
              <div class="dt-info-value">{{ trainInfo.direction || '--' }}</div>
            </div>
            <div class="dt-info-cell">
              <span class="dt-info-label">编组</span>
              <div class="dt-info-value">{{ displayFormation }}</div>
            </div>
          </div>

          <!-- 车厢列表 -->
          <div class="flex-1 overflow-y-auto dt-car-list">
            <!-- 表头 -->
            <div class="dt-list-header">
              <span class="dt-col-id">编号</span>
              <span class="dt-col-seq">车号</span>
              <span class="dt-col-type">类型</span>
              <span class="dt-col-status">状态</span>
              <span class="dt-col-km">走行km</span>
              <span class="dt-col-repair">厂修</span>
            </div>

            <!-- 车厢行 -->
            <div
              v-for="(car, idx) in selectedCarriages"
              :key="car.id"
              :class="[
                'dt-list-row',
                store.selectedCarriage?.id === car.id ? 'dt-row-active' : '',
                idx % 2 === 0 ? 'dt-row-even' : ''
              ]"
              @click="selectCarriage(car)"
            >
              <span class="dt-col-id">
                <span class="dt-seq-badge">{{ getCarSeq(car) }}</span>
              </span>
              <span :class="['dt-col-seq dt-num', store.selectedCarriage?.id === car.id ? 'text-cyan-300' : 'text-slate-200']">{{ car.id }}</span>
              <span :class="['dt-col-type dt-type-tag', typeColor[car.type]]">
                {{ typeMap[car.type] }}
              </span>
              <div class="dt-col-status flex items-center gap-1">
                <component :is="statusIcon[car.status]" :class="['w-3.5 h-3.5', statusColor[car.status]]" />
                <span :class="['text-[10px] font-semibold', statusColor[car.status]]">{{ statusLabel[car.status] }}</span>
              </div>
              <span :class="['dt-col-km dt-num', car.mileage > 400000 ? 'text-red-400' : car.mileage > 250000 ? 'text-yellow-400' : 'text-slate-400']">
                {{ car.mileage >= 10000 ? (car.mileage / 10000).toFixed(1) + '万' : car.mileage }}
              </span>
              <span class="dt-col-repair dt-num text-slate-500">{{ car.repairs?.a1Repair?.slice(5) || '-' }}</span>
            </div>
          </div>

          <!-- 底部统计 -->
          <div class="dt-footer">
            <div class="flex gap-2">
              <span class="dt-stat-badge dt-stat-normal">
                正常 {{ selectedCarriages.filter(c => c.status === 'Normal').length }}
              </span>
              <span class="dt-stat-badge dt-stat-warn">
                警告 {{ selectedCarriages.filter(c => c.status === 'Warning').length }}
              </span>
              <span class="dt-stat-badge dt-stat-maint">
                维护 {{ selectedCarriages.filter(c => c.status === 'Maintenance').length }}
              </span>
            </div>
            <span class="dt-sub">共 {{ selectedCarriages.length }} 节车厢</span>
          </div>

        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ========== 数字孪生 HUD 面板 ========== */
/* 列车信息侧边面板的主容器 */
.dt-hud-panel {
  position: relative;
  /* 背景：深蓝色渐变，营造深空感 */
  background: linear-gradient(135deg, rgba(4, 18, 32, 0.96) 0%, rgba(8, 30, 52, 0.92) 50%, rgba(4, 18, 32, 0.96) 100%);
  /* 边框：青色，1px 细线 */
  border: 1px solid rgba(34, 211, 238, 0.35);
  /* 孪生大屏硬切角效果 */
  clip-path: polygon(
    0 0,
    calc(100% - 16px) 0,
    100% 16px,
    100% 100%,
    16px 100%,
    0 calc(100% - 16px)
  );
  /* 双层阴影：外层 30px 青色发光 + 内层 1px 上边框高光 */
  box-shadow:
    0 0 40px rgba(34, 211, 238, 0.12),
    inset 0 0 24px rgba(34, 211, 238, 0.05);
  /* 隐藏溢出内容 */
  overflow: hidden;
  /* 字体平滑：使用亚像素渲染，提升文字清晰度 */
  -webkit-font-smoothing: antialiased;
  /* 文字渲染优化：优先考虑可读性 */
  text-rendering: optimizeLegibility;
  isolation: isolate;
}

.dt-hud-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(34, 211, 238, 0.08), transparent 16%, transparent 84%, rgba(34, 211, 238, 0.08)),
    linear-gradient(180deg, rgba(34, 211, 238, 0.06), transparent 18%, transparent 82%, rgba(34, 211, 238, 0.04));
  mix-blend-mode: screen;
}

.dt-hud-panel > .flex {
  position: relative;
  z-index: 2;
}

/* 离线状态（不在库）时切换为橙色大屏主题风格 */
.dt-hud-panel.is-offline {
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

.dt-hud-panel.is-offline .dt-grid {
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

.dt-hud-panel.is-offline .corner {
  border-color: #fb923c;
  filter: drop-shadow(0 0 3px rgba(251, 146, 60, 0.5));
}

/* ========== 扫描线动画 ========== */
/* CRT 屏幕扫描线效果，增强科技感 */
.dt-scanline {
  /* 绝对定位，覆盖整个面板 */
  position: absolute;
  /* 顶部对齐 */
  top: 0; left: 0; right: 0;
  /* 高度：2px，细线 */
  height: 2px;
  /* 背景：青色渐变，中间最亮 */
  background: linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.5) 50%, transparent 100%);
  /* 动画：3s 循环，从上到下扫描 */
  animation: scanline 4s linear infinite;
  /* 层级：在内容上方 */
  z-index: 399;
  /* 不响应鼠标事件 */
  pointer-events: none;
}

.dt-hud-panel.is-offline .dt-scanline {
  background: linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.5) 50%, transparent 100%);
}

/* 扫描线动画关键帧 */
@keyframes scanline {
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

/* ========== 头部样式 ========== */
/* 面板顶部，包含车次号、轨道名、状态标签、关闭按钮 */
.dt-header {
  position: relative;
  /* 触摸屏下禁止浏览器默认的平移/缩放手势，确保 pointer 事件能持续收到 */
  touch-action: none;
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: none;
  /* 背景：深蓝渐变叠加微光边框 */
  background: linear-gradient(180deg, rgba(34, 211, 238, 0.08) 0%, rgba(6, 22, 44, 0.4) 100%);
  cursor: move; user-select: none;
}

/* 头部底部数据总线光条（水平流动的光线，模拟数据传输） */
.dt-header::after {
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

.is-offline .dt-header::after {
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

/* ========== 车次号样式 ========== */
/* 大号车次号，黄色发光 */
.dt-train-id {
  /* 字体：等宽字体，科技感 */
  font-family: 'DIN Alternate', 'Orbitron', 'Consolas', monospace;
  /* 字号：20px，大标题 */
  font-size: 20px; font-weight: 800; color: #fbbf24;
  /* 文字阴影：双层黄色发光，营造霓虹灯效果 */
  text-shadow: 0 0 12px rgba(251,191,36,0.4), 0 0 24px rgba(251,191,36,0.15);
  /* 字间距：0.04em，轻微增加 */
  letter-spacing: 0.04em;
}

/* ========== 轨道名样式 ========== */
/* 轨道名称，青色发光 */
.dt-track-name {
  /* 字体：等宽字体，科技感 */
  font-family: 'DIN Alternate', 'Consolas', monospace;
  /* 字号：14px，中等标题 */
  font-size: 14px; font-weight: 700; color: #22d3ee;
  /* 文字阴影：8px 青色发光 */
  text-shadow: 0 0 8px rgba(34,211,238,0.4);
}

/* ========== 状态标签样式 ========== */
/* 列车运行状态标签（停放中/出库中等） */
.dt-state-tag {
  /* 字号：10px，小标签 */
  font-size: 10px; font-weight: 700; padding: 2px 8px;
  /* 圆角：3px，现代感 */
  border-radius: 3px; border-width: 1px; letter-spacing: 0.06em;
}

/* "不在库"状态徽章：橙色警示色，与在库蓝青色区分 */
.dt-state-offline {
  background: rgba(251,146,60,0.18);
  color: #fdba74;
  border: 1px solid rgba(251,146,60,0.5);
  box-shadow: 0 0 8px rgba(251,146,60,0.25);
}

/* ========== 关闭按钮样式 ========== */
/* 头部右侧关闭按钮 */
.dt-close-btn {
  /* 文字颜色：灰色 */
  color: #64748b; padding: 4px; border-radius: 4px;
  /* 过渡动画：0.2s */
  transition: all 0.2s;
}

/* 关闭按钮悬停状态 */
.dt-close-btn:hover { 
  /* 文字颜色：青色 */
  color: #22d3ee; 
  /* 背景：青色微光 */
  background: rgba(6,182,212,0.1); 
}

/* ========== 编组示意图区域 ========== */
/* 显示车厢编组的可视化区域 */
.dt-formation-section {
  /* 内边距 */
  padding: 10px 16px 8px;
  /* 下边框：青色，1px 细线 */
  border-bottom: 1px solid rgba(6,182,212,0.08);
  /* 背景：青色微光 */
  position: relative;
  background:
    linear-gradient(90deg, rgba(34, 211, 238, 0.04), transparent 45%),
    rgba(6,182,212,0.02);
}

.dt-formation-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  width: 64px;
  height: 1px;
  background: linear-gradient(90deg, #22d3ee, transparent);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.45);
}

.is-offline .dt-formation-section {
  background:
    linear-gradient(90deg, rgba(251, 146, 60, 0.04), transparent 45%),
    rgba(251, 146, 60, 0.02);
  border-bottom-color: rgba(251, 146, 60, 0.1);
}

.is-offline .dt-formation-section::before {
  background: linear-gradient(90deg, #fb923c, transparent);
  box-shadow: 0 0 8px rgba(251, 146, 60, 0.45);
}
/* ========== 编组示意图区域 ========== */
/* 编组示意图区域的标签 */
.dt-section-label {
  /* 字号：10px，小标签 */
  font-size: 10px; 
  /* 字重：700，加粗 */
  font-weight: 700; 
  /* 文字颜色：青色 */
  color: #0891b2;
  /* 字间距：0.12em，增加字间距 */
  letter-spacing: 0.12em; 
  /* 文字转换：大写 */
  text-transform: uppercase; 
  /* 下边距：6px */
  margin-bottom: 6px;
}

/* 编组示意图区域的辅助说明文字 */
.dt-section-hint { 
  /* 字重：400，正常 */
  font-weight: 400; 
  /* 文字颜色：灰色 */
  color: #475569; 
}

/* ========== 车厢编组块样式 ========== */
/* 单个车厢编组块 */
.dt-car-block {
  flex-shrink: 0;
  width: 28px;
  height: 36px;
  border-radius: 2px;
  border-width: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'DIN Alternate', 'Consolas', monospace;
  clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px));
}

/* 车厢编组块悬停状态 */
.dt-car-block:hover { 
  /* 缩放：1.12 倍 */
  transform: scale(1.12); 
  /* 阴影：8px 青色发光 */
  box-shadow: 0 0 10px rgba(6,182,212,0.35), inset 0 0 8px rgba(6,182,212,0.12); 
}

/* ========== 选中车厢样式 ========== */
/* 选中的车厢编组块 */
.dt-car-active {
  /* 背景：蓝色半透明 */
  background: rgba(59,130,246,0.3); 
  /* 文字颜色：浅蓝色 */
  color: #93c5fd;
  /* 边框颜色：蓝色 */
  border-color: #3b82f6; 
  /* 阴影：蓝色发光 */
  box-shadow: 0 0 12px rgba(59,130,246,0.4);
  /* 动画：脉冲蓝色，1.5s 循环 */
  animation: pulse-blue 1.5s ease-in-out infinite;
}

/* 蓝色脉冲动画关键帧 */
@keyframes pulse-blue {
  /* 起始和结束：8px 发光 */
  0%, 100% { box-shadow: 0 0 8px rgba(59,130,246,0.3); }
  /* 中间：16px 发光，更亮 */
  50% { box-shadow: 0 0 16px rgba(59,130,246,0.6); }
}

/* ========== 图例项样式 ========== */
/* 图例项（车种/状态标签） */
.dt-legend-item {
  /* 字号：9px，小标签 */
  font-size: 9px; 
  /* 内边距：2px 6px */
  padding: 2px 6px; 
  /* 圆角：3px */
  border-radius: 3px; 
  /* 边框宽度：1px */
  border-width: 1px;
  /* 字重：600，半粗 */
  font-weight: 600;
}

/* ========== 车次详细信息区域 ========== */
/* 车次信息网格 */
.dt-info-grid {
  /* 网格布局：4 列等宽 */
  display: grid; 
  grid-template-columns: repeat(4, 1fr); 
  /* 列间距：0 */
  gap: 0;
  /* 下边框：青色，1px 细线 */
  border-bottom: 1px solid rgba(6,182,212,0.08);
  background:
    linear-gradient(180deg, rgba(4, 18, 32, 0.35), rgba(4, 18, 32, 0.12)),
    repeating-linear-gradient(90deg, transparent 0 23px, rgba(34, 211, 238, 0.025) 23px 24px);
}

.is-offline .dt-info-grid {
  border-bottom-color: rgba(251, 146, 60, 0.08);
  background:
    linear-gradient(180deg, rgba(32, 20, 8, 0.26), rgba(4, 18, 32, 0.12)),
    repeating-linear-gradient(90deg, transparent 0 23px, rgba(251, 146, 60, 0.025) 23px 24px);
}

/* 车次信息单元格 */
.dt-info-cell {
  /* 内边距：8px 12px */
  padding: 8px 12px;
  /* 右边框：青色，1px 细线 */
  border-right: 1px solid rgba(6,182,212,0.06);
  position: relative;
}

.dt-info-cell::after {
  content: '';
  position: absolute;
  left: 12px;
  bottom: 5px;
  width: 18px;
  height: 1px;
  background: rgba(34, 211, 238, 0.35);
}

.is-offline .dt-info-cell {
  border-right-color: rgba(251, 146, 60, 0.06);
}

.is-offline .dt-info-cell::after {
  background: rgba(251, 146, 60, 0.35);
}

/* 最后一个单元格无右边框 */
.dt-info-cell:last-child { 
  border-right: none; 
}

/* 车次信息标签（轨道、车次等） */
.dt-info-label {
  /* 字号：9px，小标签 */
  font-size: 9px; 
  /* 文字颜色：灰色 */
  color: #475569; 
  /* 字间距：0.08em */
  letter-spacing: 0.08em;
  /* 文字转换：大写 */
  text-transform: uppercase; 
  /* 字重：600，半粗 */
  font-weight: 600;
}

/* 车次信息数值 */
.dt-info-value {
  /* 字体：等宽字体，科技感 */
  font-family: 'DIN Alternate', 'Consolas', monospace;
  /* 字号：13px，中等 */
  font-size: 13px; 
  /* 字重：700，加粗 */
  font-weight: 700; 
  /* 文字颜色：浅灰色 */
  color: #e2e8f0; 
  /* 上边距：2px */
  margin-top: 2px;
}

/* 高亮数值（重要信息） */
.dt-info-highlight { 
  /* 文字颜色：黄色 */
  color: #fbbf24; 
  /* 文字阴影：6px 黄色发光 */
  text-shadow: 0 0 6px rgba(251,191,36,0.3); 
}

/* ========== 车厢列表区域 ========== */
/* 车厢列表容器 */
.dt-car-list { 
  /* 背景：深蓝色微光 */
  background:
    linear-gradient(180deg, rgba(2, 8, 20, 0.42), rgba(2, 8, 20, 0.28)),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(34, 211, 238, 0.025) 31px 32px);
}

/* 窄版科幻滚动条 */
.dt-car-list::-webkit-scrollbar {
  width: 5px;
}
.dt-car-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.dt-car-list::-webkit-scrollbar-thumb {
  background: rgba(34, 211, 238, 0.2);
  border-radius: 3px;
}
.dt-car-list::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.45);
}

.is-offline .dt-car-list::-webkit-scrollbar-thumb {
  background: rgba(251, 146, 60, 0.2);
}
.is-offline .dt-car-list::-webkit-scrollbar-thumb:hover {
  background: rgba(251, 146, 60, 0.45);
}

/* 车厢列表表头 */
.dt-list-header {
  /* 网格布局：6 列，宽度分别为 36px、1fr、50px、64px、60px、50px */
  display: grid;
  grid-template-columns: 36px 1fr 50px 64px 60px 50px;
  /* 列间距：4px */
  gap: 4px; 
  /* 内边距：6px 16px */
  padding: 6px 16px;
  /* 字号：9px，小标签 */
  font-size: 9px; 
  /* 字重：700，加粗 */
  font-weight: 700; 
  /* 文字颜色：青色 */
  color: #0891b2;
  /* 字间距：0.1em */
  letter-spacing: 0.1em; 
  /* 文字转换：大写 */
  text-transform: uppercase;
  /* 背景：深蓝色渐变 */
  background: linear-gradient(180deg, rgba(8,47,73,0.6) 0%, rgba(6,22,44,0.4) 100%);
  /* 下边框：青色，1px 细线 */
  border-bottom: 1px solid rgba(6,182,212,0.15);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  /* 粘性定位：滚动时固定在顶部 */
  position: sticky; 
  top: 0; 
  /* 层级：在列表上方 */
  z-index: 3999;
}

.is-offline .dt-list-header {
  color: #fb923c;
  background: linear-gradient(180deg, rgba(67, 35, 12, 0.55) 0%, rgba(28, 18, 12, 0.42) 100%);
  border-bottom-color: rgba(251, 146, 60, 0.18);
}

/* 车厢列表行 */
.dt-list-row {
  /* 网格布局：6 列，宽度与表头相同 */
  display: grid;
  grid-template-columns: 36px 1fr 50px 64px 60px 50px;
  /* 列间距：4px */
  gap: 4px; 
  /* 内边距：7px 16px */
  padding: 7px 16px; 
  /* 垂直对齐：居中 */
  align-items: center;
  /* 下边框：青色，1px 极细线 */
  border-bottom: 1px solid rgba(6,182,212,0.04);
  /* 鼠标样式：指针 */
  cursor: pointer; 
  /* 过渡动画：0.15s */
  transition: all 0.15s;
  position: relative;
}

.dt-list-row::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 10px;
  width: 3px;
  height: 3px;
  background: rgba(34, 211, 238, 0.35);
  box-shadow: 0 0 5px rgba(34, 211, 238, 0.5);
}

.is-offline .dt-list-row::after {
  background: rgba(251, 146, 60, 0.35);
  box-shadow: 0 0 5px rgba(251, 146, 60, 0.5);
}

/* 车厢列表行悬停状态：左侧扫描光标 + 背景微光 */
.dt-list-row:hover { 
  background: linear-gradient(90deg, rgba(34, 211, 238, 0.12) 0%, rgba(34, 211, 238, 0.03) 30%, transparent 100%);
  box-shadow: inset 3px 0 8px rgba(34, 211, 238, 0.15);
}

.is-offline .dt-list-row:hover {
  background: linear-gradient(90deg, rgba(251, 146, 60, 0.12) 0%, rgba(251, 146, 60, 0.03) 30%, transparent 100%);
  box-shadow: inset 3px 0 8px rgba(251, 146, 60, 0.15);
}

/* 偶数行背景 */
.dt-row-even { 
  background: rgba(6,182,212,0.02); 
}

.is-offline .dt-row-even {
  background: rgba(251, 146, 60, 0.018);
}

/* 选中行样式：脉冲发光边框 */
.dt-row-active {
  background: rgba(59,130,246,0.1) !important;
  border-left: 2px solid #60a5fa;
  box-shadow: inset 3px 0 12px rgba(96, 165, 250, 0.15), 0 0 8px rgba(96, 165, 250, 0.08);
  animation: rowPulse 2s ease-in-out infinite;
  outline: 1px solid rgba(96, 165, 250, 0.18);
  outline-offset: -1px;
}

.is-offline .dt-row-active {
  background: rgba(251, 146, 60, 0.1) !important;
  border-left-color: #fb923c;
  box-shadow: inset 3px 0 12px rgba(251, 146, 60, 0.14), 0 0 8px rgba(251, 146, 60, 0.08);
  outline-color: rgba(251, 146, 60, 0.18);
}

@keyframes rowPulse {
  0%, 100% { border-left-color: rgba(96, 165, 250, 0.6); }
  50% { border-left-color: rgba(96, 165, 250, 1); }
}

/* ========== 序号徽章样式 ========== */
/* 车厢序号徽章 */
.dt-seq-badge {
  /* 弹性布局：居中 */
  display: inline-flex; 
  align-items: center; 
  justify-content: center;
  /* 宽度：22px */
  width: 22px; 
  /* 高度：22px */
  height: 22px; 
  /* 圆角：4px */
  border-radius: 4px;
  /* 字体：等宽字体，科技感 */
  font-family: 'DIN Alternate', 'Consolas', monospace;
  /* 字号：11px */
  font-size: 11px; 
  /* 字重：800，极粗 */
  font-weight: 800;
  /* 背景：青色微光 */
  background: rgba(6,182,212,0.12); 
  /* 文字颜色：青色 */
  color: #22d3ee;
  /* 边框：青色，1px */
  border: 1px solid rgba(6,182,212,0.2);
}

/* 选中行的序号徽章 */
.dt-row-active .dt-seq-badge {
  /* 背景：蓝色微光 */
  background: rgba(59,130,246,0.2); 
  /* 文字颜色：浅蓝色 */
  color: #93c5fd;
  /* 边框颜色：蓝色 */
  border-color: rgba(59,130,246,0.3);
}

/* ========== 车种标签样式 ========== */
/* 车种标签 */
.dt-type-tag {
  /* 字号：9px，小标签 */
  font-size: 9px; 
  /* 内边距：2px 4px */
  padding: 2px 4px; 
  /* 圆角：3px */
  border-radius: 3px;
  /* 边框宽度：1px */
  border-width: 1px; 
  /* 文字对齐：居中 */
  text-align: center; 
  /* 字重：600，半粗 */
  font-weight: 600;
}

/* ========== 底部统计区域 ========== */
/* 底部统计容器 */
.dt-footer {
  position: relative;
  padding: 8px 16px; 
  display: flex; 
  align-items: center; 
  justify-content: space-between;
  border-top: none;
  background: linear-gradient(180deg, rgba(4, 18, 32, 0.5) 0%, rgba(8, 30, 52, 0.6) 100%);
}

/* 底部顶部数据总线光条 */
.dt-footer::before {
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

.is-offline .dt-footer::before {
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(251, 146, 60, 0.4) 30%,
    rgba(251, 146, 60, 0.1) 70%,
    transparent 100%);
}

/* 统计徽章 */
.dt-stat-badge {
  /* 字号：10px */
  font-size: 10px; 
  /* 字重：700，加粗 */
  font-weight: 700; 
  /* 内边距：2px 8px */
  padding: 2px 8px;
  /* 圆角：3px */
  border-radius: 3px; 
  /* 边框：1px */
  border: 1px solid;
  /* 字体：等宽字体，科技感 */
  font-family: 'DIN Alternate', 'Consolas', monospace;
}

/* 正常状态徽章（青色） */
.dt-stat-normal { 
  /* 文字颜色：青色 */
  color: #22d3ee; 
  /* 背景：青色微光 */
  background: rgba(6,182,212,0.1); 
  /* 边框颜色：青色 */
  border-color: rgba(6,182,212,0.2); 
}

/* 警告状态徽章（红色） */
.dt-stat-warn { 
  /* 文字颜色：红色 */
  color: #f87171; 
  /* 背景：红色微光 */
  background: rgba(239,68,68,0.1); 
  /* 边框颜色：红色 */
  border-color: rgba(239,68,68,0.2); 
}

/* 维护状态徽章（黄色） */
.dt-stat-maint { 
  /* 文字颜色：黄色 */
  color: #fbbf24; 
  /* 背景：黄色微光 */
  background: rgba(251,191,36,0.1); 
  /* 边框颜色：黄色 */
  border-color: rgba(251,191,36,0.2); 
}

/* ========== 通用样式 ========== */
/* 数字样式 */
.dt-num {
  /* 字体：等宽字体，科技感 */
  font-family: 'DIN Alternate', 'Consolas', monospace;
  /* 字重：700，加粗 */
  font-weight: 700; 
  /* 字间距：0.02em，轻微增加 */
  letter-spacing: 0.02em;
}

/* 副标题/说明文字 */
.dt-sub {
  /* 字号：11px */
  font-size: 11px; 
  /* 文字颜色：灰色 */
  color: #64748b; 
  /* 字间距：0.03em */
  letter-spacing: 0.03em;
}

/* ========== 过渡动画 ========== */
/* 面板进入动画（活跃状态） */
.train-slide-enter-active {
  /* 过渡：0.35s，缓动曲线为自定义贝塞尔曲线 */
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.train-slide-leave-active {
  transition: all 0.25s ease-in;
}
.train-slide-enter-from {
  opacity: 0; transform: translateX(60px);
}
.train-slide-leave-to {
  opacity: 0; transform: translateX(60px);
}
</style>
