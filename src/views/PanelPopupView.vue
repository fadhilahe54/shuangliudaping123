<!--
  PanelPopupView — 面板独立弹出窗口页面
  通过路由参数 /panel/:id 渲染对应面板内容（org / stat / status / route）
  数据独立从后端加载，与主窗口互不干扰
-->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import UserImg from '../public/Images/User.png'
import TrainImg from '../public/Images/TrainRight.png'
import PanelFrame from '../components/PanelFrame.vue'
import { serviceBaseURL } from '../api/request.js'
import {
  getAllSInfo, getAllJobInfo, getAllTrainStatusInfo, getAllTrainNumberRouteInfo,
} from '../api/dispatchApi.js'

/**
 * 将后台返回的头像路径转换为浏览器可访问的完整 URL
 * - 空值 → 默认头像
 * - /uploads/... → 拼接后端地址（用户上传的真实照片）
 * - http(s):// / 预设相对路径 → 原样返回
 */
const resolveAvatarUrl = (path) => {
  if (!path) return UserImg
  if (path.startsWith('/uploads/')) return serviceBaseURL + path
  return path
}

// 获取当前路由实例
const route = useRoute()

/**
 * 计算当前面板 ID
 * 从路由参数获取，默认为 'org'
 * 
 * @returns {string} 面板 ID（org/stat/status/route）
 */
const panelId = computed(() => route.params.id || 'org')

// 各面板的标题映射表
const PANEL_TITLES = {
  org: '今日值班',
  stat: '统计信息',
  status: '检修状态',
  route: '交路/车组',
}

// 各面板的背景颜色映射表
const PANEL_BG = {
  org: 'rgba(6,26,48,0.35)',      // 青色背景
  stat: 'rgba(20,18,6,0.35)',     // 黄色背景
  status: 'rgba(30,20,6,0.35)',   // 橙色背景
  route: 'rgba(6,30,18,0.35)',    // 绿色背景
}

// 各面板的顶部装饰条颜色类映射表
const PANEL_BAR_CLASS = {
  org: 'bg-cyan-400',      // 青色
  stat: 'bg-cyan-400',     // 青色
  status: 'bg-amber-400',  // 琥珀色
  route: 'bg-green-400',   // 绿色
}

/**
 * 计算当前面板的标题
 * 
 * @returns {string} 面板标题
 */
const title = computed(() => PANEL_TITLES[panelId.value] || '面板')

/**
 * 计算当前面板的背景颜色
 * 
 * @returns {string} 背景颜色值
 */
const bgColor = computed(() => PANEL_BG[panelId.value] || 'rgba(30,41,59,0.4)')

/**
 * 计算当前面板的顶部装饰条颜色类
 * 
 * @returns {string} Tailwind 颜色类
 */
const barClass = computed(() => PANEL_BAR_CLASS[panelId.value] || 'bg-cyan-400')

// ========== 今日值班数据 ==========
// 今日值班数据，分为两行显示
const orgData = ref({ row1: [], row2: [] })

// ========== 统计数据 ==========
// 统计数据卡片（上线、备用、整修、扣修）
const stats = ref([
  { label: '上线', value: 0, color: '#22d3ee' },
  { label: '备用', value: 0, color: '#4ade80' },
  { label: '整修', value: 0, color: '#fbbf24' },
  { label: '扣修', value: 0, color: '#f87171' },
])

// 重点信息列表（滚动显示）
const infoList = ref([{ text: '正在加载重点信息...', important: false }])

// ========== 检修状态数据 ==========
// 检修状态数据，分左右两列显示
const statusData = ref({
  left: [
    { label: '临修/整修', icon: '', nums: [] },
    { label: '整修', icon: '', nums: [] },
    { label: '异地停放', icon: '', nums: [] },
  ],
  right: [
    { label: '高级修', icon: '', nums: [], dotColor: '#4ade80' },
    { label: '调向/试运', icon: '', nums: [] },
    { label: '备用', icon: '', nums: [] },
  ],
})

// ========== 交路/车组数据 ==========
const routeData = ref([])
const routeHeaders = ref([])

function compareDisplayNo(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hans-CN-u-kn-true')
}

function getTrainRouteSortValue(item) {
  return item?.id ?? item?.['车次'] ?? ''
}

function getGroupSortValue(item) {
  return item?.id ?? item?.['车组号'] ?? ''
}

// ========== 数据加载 ==========
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
        infoList.value = items.map((text, i) => ({
          text: `${i + 1}. ${text.trim()}`,
          important: i % 2 === 0,
        }))
      }
    }
  } catch (e) {
    console.warn('加载总体信息失败:', e)
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
        const persons = workers.map(w => ({
          name: w['姓名'] || '未知',
          img: resolveAvatarUrl(w['头像路径']),
        }))
        return { role, persons }
      })
      const row1 = [], row2 = []
      allCells.forEach((cell, idx) => {
        if (idx % 2 === 0) row1.push(cell)
        else row2.push(cell)
      })
      orgData.value = { row1, row2 }
    }
  } catch (e) {
    console.warn('加载值班信息失败:', e)
  }
}

const loadTrainData = async () => {
  try {
    const [trainRouteList, statusInfoList] = await Promise.all([
      getAllTrainNumberRouteInfo(),
      getAllTrainStatusInfo(),
    ])

    // 构建交路表格数据（真实数据，动态列数）
    const rawList = (Array.isArray(trainRouteList) ? trainRouteList : (trainRouteList ? [trainRouteList] : []))
      .slice()
      .sort((a, b) => compareDisplayNo(getTrainRouteSortValue(a), getTrainRouteSortValue(b)))
    if (rawList.length > 0) {
      const routeIdMap = new Map()
      rawList.forEach(tn => {
        (tn['交路信息List'] || []).forEach(r => {
          if (r.id != null && !routeIdMap.has(r.id)) {
            routeIdMap.set(r.id, r['交路名称'] || '')
          }
        })
      })
      const sortedRouteIds = [...routeIdMap.keys()].sort((a, b) => a - b)
      const colCount = sortedRouteIds.length
      const routeIdToCol = new Map()
      sortedRouteIds.forEach((rid, idx) => routeIdToCol.set(rid, idx))

      routeHeaders.value = sortedRouteIds.map(rid => {
        const name = routeIdMap.get(rid) || `交路${rid}`
        return `${name}/车组`
      })

      routeData.value = rawList.map(tn => {
        const cols = Array.from({ length: colCount }, () => [])
        ;(tn['交路信息List'] || []).forEach(route => {
          const colIdx = routeIdToCol.get(route.id)
          if (colIdx != null) {
            ;(route['车组信息List'] || [])
              .slice()
              .sort((a, b) => compareDisplayNo(getGroupSortValue(a), getGroupSortValue(b)))
              .forEach(group => {
              if (group['车组号']) {
                cols[colIdx].push({ n: group['车组号'] })
              }
            })
          }
        })
        return {
          id: tn['车次'] || `T${tn.id}`,
          cols,
        }
      })
    }

    // 构建车组状态数据
    const statuses = Array.isArray(statusInfoList) ? statusInfoList : (statusInfoList ? [statusInfoList] : [])
    if (statuses.length > 0) {
      statuses.sort((a, b) => (a.id || 0) - (b.id || 0))
      const left = [], right = []
      statuses.forEach((s, i) => {
        const item = {
          label: s['状态名称'] || '未知状态',
          icon: '',
          nums: (s['车组信息List'] || []).map(g => g['车组号']).filter(Boolean),
        }
        if (i % 2 === 0) left.push(item)
        else right.push(item)
      })
      statusData.value = { left, right }
    }
  } catch (e) {
    console.warn('加载交路/车组数据失败:', e)
  }
}

onMounted(async () => {
  document.title = title.value + ' - 双流运用车间孪生平台'
  // 根据面板类型加载对应数据
  const loaders = {
    org: [loadJobInfo],
    stat: [loadSummaryInfo],
    status: [loadTrainData],
    route: [loadTrainData],
  }
  const tasks = loaders[panelId.value] || [loadSummaryInfo, loadJobInfo, loadTrainData]
  await Promise.all(tasks.map(fn => fn()))
})
</script>

<template>
  <div class="popup-root">
    <PanelFrame :bg-color="bgColor" class="h-full">
      <div class="popup-panel">
        <!-- 标题栏 -->
        <div class="popup-header">
          <div class="flex items-center gap-2">
            <span class="inline-block w-[4px] h-[18px] rounded-sm" :class="barClass"></span>
            <span class="popup-title">{{ title }}</span>
          </div>
        </div>

        <!-- 今日值班 -->
        <div v-if="panelId === 'org'" class="popup-content">
          <div class="org-grid" :style="{ gridTemplateColumns: `repeat(${Math.max(orgData.row1.length, orgData.row2.length, 1)}, 1fr)` }">
            <template v-for="(cell, cIdx) in orgData.row1" :key="'r1-'+cIdx">
              <div class="org-grid-cell flex items-center gap-2">
                <span v-if="cell.role" class="org-role-text">{{ cell.role }}</span>
                <div class="flex gap-3 flex-wrap">
                  <div v-for="(p, pIdx) in cell.persons" :key="p.name + '-' + pIdx" class="org-person flex flex-col items-center gap-1">
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
              <div class="org-grid-cell flex items-center gap-2">
                <span v-if="cell.role" class="org-role-text">{{ cell.role }}</span>
                <div class="flex gap-3 flex-wrap">
                  <div v-for="(p, pIdx) in cell.persons" :key="p.name + '-' + pIdx" class="org-person flex flex-col items-center gap-1">
                    <div class="org-avatar-wrap">
                      <img :src="p.img" :alt="p.name" class="org-avatar" @error="e => e.target.src = UserImg" />
                      <div class="org-avatar-ring"></div>
                    </div>
                    <span class="org-person-name">{{ p.name }}</span>
                  </div>
                </div>
              </div>
            </template>
            <div v-if="!orgData.row1.length && !orgData.row2.length" class="text-center text-slate-500 text-sm py-8" style="grid-column: 1 / -1">暂无岗位数据</div>
          </div>
        </div>

        <!-- 统计信息 -->
        <div v-else-if="panelId === 'stat'" class="popup-content">
          <div class="flex gap-3 mb-4">
            <div v-for="s in stats" :key="s.label"
              class="stat-card flex-1 flex flex-col items-center gap-1 py-3 rounded-lg bg-slate-800/50 border border-cyan-500/10">
              <span class="text-sm font-bold" :style="{ color: s.color }">{{ s.label }}</span>
              <span class="dt-num text-3xl font-black" :style="{ color: s.color, textShadow: `0 0 14px ${s.color}44` }">{{ s.value }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 mb-2">
            <span class="inline-block w-[3px] h-[16px] rounded-sm bg-cyan-400"></span>
            <span class="text-sm font-bold text-cyan-300">当日重点信息</span>
          </div>
          <div class="flex flex-col gap-1">
            <div v-for="(info, i) in infoList" :key="i"
              class="text-sm font-bold leading-relaxed pl-2 text-yellow-300">
              {{ info.text }}
            </div>
          </div>
        </div>

        <!-- 检修状态 -->
        <div v-else-if="panelId === 'status'" class="popup-content">
          <div class="flex gap-8">
            <div class="flex-1 flex flex-col gap-3">
              <div v-for="(item, idx) in statusData.left" :key="idx"
                class="flex items-center gap-3 py-3 px-3 rounded"
                :class="idx % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-800/20'">
                <span class="status-label-text">{{ item.icon }} {{ item.label }}</span>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="num in item.nums" :key="num" class="dt-num status-chip status-chip-amber">{{ num }}</span>
                </div>
              </div>
            </div>
            <div class="flex-1 flex flex-col gap-3">
              <div v-for="(item, idx) in statusData.right" :key="idx"
                class="flex items-center gap-3 py-3 px-3 rounded"
                :class="idx % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-800/20'">
                <span class="status-label-text">{{ item.label }}</span>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="num in item.nums" :key="num"
                    class="dt-num status-chip"
                    :style="{
                      color: item.dotColor || '#fbbf24',
                      borderColor: (item.dotColor || '#fbbf24') + '33',
                      backgroundColor: (item.dotColor || '#fbbf24') + '15',
                    }">{{ num }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 交路/车组 -->
        <div v-else-if="panelId === 'route'" class="popup-content">
          <table class="route-unified-table w-full text-sm">
            <colgroup>
              <col style="width: 90px;" />
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
                      <div class="flex items-center gap-1">
                        <span v-if="car.dot" class="inline-block w-[8px] h-[8px] rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]"></span>
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
      </div>
    </PanelFrame>
  </div>
</template>

<style scoped>
/* ========== 独立弹窗页面根容器 ========== */
/* 占满浏览器窗口，使用深蓝背景承接从主大屏弹出的独立面板内容 */
.popup-root {
  width: 100vw;
  height: 100vh;
  background: #0a1628;
  overflow: auto;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}

/* 面板主体：提供统一内边距和纵向间距，保证各类面板独立打开后仍有完整布局 */
.popup-panel {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100vh;
}

/* 顶部标题栏：左侧显示面板名称，右侧可放置关闭/返回等操作 */
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(6, 182, 212, 0.15);
}

/* 弹窗标题：高权重发光文字，用于区分当前独立窗口承载的业务面板 */
.popup-title {
  font-size: 18px;
  font-weight: 800;
  color: #e2e8f0;
  letter-spacing: 0.05em;
  text-shadow: 0 0 8px rgba(6, 182, 212, 0.4);
}

/* 内容容器：占据剩余空间，内部根据不同面板类型渲染组织/统计/状态/交路内容 */
.popup-content {
  flex: 1;
}

/* ===== 今日值班 ===== */
.org-grid {
  display: grid;
  gap: 16px 12px;
}
.org-grid-cell {
  padding: 8px;
}
.org-role-text {
  font-size: 14px;
  font-weight: 800;
  color: #67e8f9;
  white-space: nowrap;
  text-shadow: 0 0 6px rgba(6, 182, 212, 0.5);
}
.org-avatar-wrap {
  position: relative;
  width: 52px;
  height: 52px;
}
.org-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(6, 182, 212, 0.4);
}
.org-avatar-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1px solid rgba(34, 211, 238, 0.25);
  animation: ring-pulse 2.5s ease-in-out infinite;
}
@keyframes ring-pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.06); }
}
.org-person-name {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
  text-align: center;
}

/* ===== 统计 ===== */
.dt-num {
  font-family: 'DIN Alternate', 'Orbitron', 'Rajdhani', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

/* ===== 检修状态 ===== */
.status-label-text {
  min-width: 70px;
  font-size: 14px;
  font-weight: 700;
  color: #67e8f9;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(15, 23, 42, 0.95);
}
.status-chip {
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  border-radius: 6px;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.85);
}
.status-chip-amber {
  color: #fde68a;
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(245, 158, 11, 0.24);
}

/* ===== 交路表格（科幻风） ===== */
.route-unified-table {
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid rgba(6, 182, 212, 0.35);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 0 14px rgba(6, 182, 212, 0.08), inset 0 0 20px rgba(6, 182, 212, 0.03);
}
.route-sticky-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(8, 47, 73, 0.98) 0%, rgba(15, 23, 42, 0.95) 100%);
}
.route-th {
  padding: 9px 8px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
  color: #67e8f9;
  text-shadow: 0 0 6px rgba(6, 182, 212, 0.6), 0 1px 1px rgba(0,0,0,0.8);
  border-bottom: 1px solid rgba(6, 182, 212, 0.4);
  border-right: 1px solid rgba(6, 182, 212, 0.2);
}
.route-th:last-child { border-right: none; }
.route-th-first { text-align: center; }
.route-row {
  transition: background-color 0.25s, box-shadow 0.25s;
}
.route-row:nth-child(even) {
  background: rgba(6, 182, 212, 0.03);
}
.route-row:hover {
  background: linear-gradient(90deg, rgba(6, 182, 212, 0.08) 0%, rgba(6, 182, 212, 0.04) 50%, rgba(6, 182, 212, 0.08) 100%);
  box-shadow: inset 0 0 16px rgba(6, 182, 212, 0.06);
}
.route-td {
  border-bottom: 1px solid rgba(6, 182, 212, 0.18);
  border-right: 1px solid rgba(6, 182, 212, 0.12);
  padding: 6px 8px;
  vertical-align: middle;
  overflow: hidden;
}
.route-td:last-child { border-right: none; }
.route-row:last-child .route-td { border-bottom: none; }
.route-td-id {
  font-size: 15px;
  font-weight: 800;
  white-space: nowrap;
  color: #67e8f9;
  text-shadow: 0 0 8px rgba(6, 182, 212, 0.4), 0 1px 1px rgba(0,0,0,0.7);
  text-align: center;
  letter-spacing: 0.04em;
}
.route-cell-content {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
}
.route-car-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.route-cell-text {
  font-size: 13px;
  font-weight: 800;
  color: #bae6fd;
  white-space: nowrap;
  text-shadow: 0 0 4px rgba(6, 182, 212, 0.3), 0 1px 1px rgba(0,0,0,0.6);
}
.route-train-icon {
  width: 44px;
  transition: all 0.3s;
  filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.35));
  opacity: 0.8;
}
.route-row:hover .route-train-icon {
  opacity: 1;
  filter: drop-shadow(0 0 8px rgba(6, 182, 212, 0.6));
}
</style>
