<!--
  后台管理系统 - 主页面
  功能：侧边栏导航布局，左侧分组可折叠菜单，右侧内容区
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed, onMounted, nextTick, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { logout } from '../api/dispatchApi.js'
import { myLog, getCurrentLogUser } from '../api/log.js'
import { useWebSocket } from '../composables/useWebSocket.js'

/* ========== 子组件导入 ========== */
import SInfoTab from './admin/SInfoTab.vue'
import WorkerTab from './admin/WorkerTab.vue'
import JobTab from './admin/JobTab.vue'
import TrainTab from './admin/TrainTab.vue'
import GroupTab from './admin/GroupTab.vue'
import TodayDutyTab from './admin/TodayDutyTab.vue'
import TrainGroupBaseTab from './admin/TrainGroupBaseTab.vue'
import TrainGroupInfoTab from './admin/TrainGroupInfoTab.vue'
import TrainStatusTab from './admin/TrainStatusTab.vue'
import StockRoadTab from './admin/StockRoadTab.vue'
import TrainNumberTab from './admin/TrainNumberTab.vue'
import TrainStatusInfoTab from './admin/TrainStatusInfoTab.vue'
import StockRoadInfoTab from './admin/StockRoadInfoTab.vue'
import RouteBindTab from './admin/RouteBindTab.vue'
import RouteRotateTab from './admin/RouteRotateTab.vue'
import UserRoleTab from './admin/UserRoleTab.vue'
import RoleManageTab from './admin/RoleManageTab.vue'
import PermissionItemTab from './admin/PermissionItemTab.vue'
import UserTab from './admin/UserTab.vue'
import LogManageTab from './admin/LogManageTab.vue'
import TodayReportTab from './admin/TodayReportTab.vue'
import AboutSystemTab from './admin/AboutSystemTab.vue'
import SearchTab from './admin/SearchTab.vue'

const router = useRouter()
const { onDataChange } = useWebSocket()

/* ========== Tab 配置（统一数据源） ==========
 * 每一项结构：
 *   key        - 唯一标识（activeTab 值，同时作为菜单 index）
 *   title      - 显示标题（菜单项 + 页头面包屑）
 *   component  - 对应 Vue 组件（使用 markRaw 避免被响应式代理）
 *   entities   - 订阅的后端实体名数组，收到 WS 变更推送时自动刷新本 Tab
 *
 * 新增一个 Tab 只需要：
 *   1) 在上方 import 子组件；2) 按分组追加一项到 menuGroups 或 topTabs。
 */
const topTabs = [
  {
    key: 'todayReport',
    title: '今日填报',
    component: markRaw(TodayReportTab),
    icon: 'EditPen',
    entities: ['duty', 'sInfo'],
    menuClass: 'today-report-menu-item',
    titleStyle: 'font-weight:700;color:#d97706',
  },
  {
    key: 'search',
    title: '综合搜索',
    component: markRaw(SearchTab),
    icon: 'Search',
    entities: ['train', 'train-group', 'stock-road'],
    menuClass: 'search-menu-item',
    titleStyle: 'font-weight:700;color:#409eff',
  },
]

const menuGroups = [
  {
    key: 'duty',
    title: '值班管理',
    icon: 'Calendar',
    tabs: [
      { key: 'sInfo',     title: '总体信息', component: markRaw(SInfoTab),     entities: ['sInfo'] },
      { key: 'todayDuty', title: '今日值班', component: markRaw(TodayDutyTab), entities: ['duty'] },
      { key: 'worker',    title: '人员管理', component: markRaw(WorkerTab),    entities: ['worker'] },
      { key: 'job',       title: '岗位管理', component: markRaw(JobTab),       entities: ['job'] },
    ],
  },
  {
    key: 'train',
    title: '车组管理',
    icon: 'SetUp',
    tabs: [
      { key: 'train',           title: '车辆信息', component: markRaw(TrainTab),           entities: ['train'] },
      { key: 'trainGroupBase',  title: '车组管理', component: markRaw(TrainGroupBaseTab),  entities: ['train-group'] },
      { key: 'trainGroupInfo',  title: '车组编组', component: markRaw(TrainGroupInfoTab),  entities: ['train', 'train-group'] },
      { key: 'trainStatus',     title: '车组状态', component: markRaw(TrainStatusTab),     entities: ['车组状态'] },
      { key: 'trainStatusInfo', title: '状态分配', component: markRaw(TrainStatusInfoTab), entities: ['trainStatusInfo', '车组状态'] },
    ],
  },
  {
    key: 'operation',
    title: '运行信息',
    icon: 'DataLine',
    tabs: [
      { key: 'trainNumber',   title: '车次信息', component: markRaw(TrainNumberTab),   entities: [] },
      { key: 'group',         title: '交路信息', component: markRaw(GroupTab),         entities: ['交路关联', '交路轮转'] },
      { key: 'stockRoad',     title: '股道信息', component: markRaw(StockRoadTab),     entities: ['stock-road', 'stock-roadInfo'] },
      { key: 'stockRoadInfo', title: '股道编组', component: markRaw(StockRoadInfoTab), entities: ['stock-road', 'stock-roadInfo', 'train-group'] },
      { key: 'routeBind',     title: '交路关联', component: markRaw(RouteBindTab),     entities: ['交路关联', '交路轮转'] },
      { key: 'routeRotate',   title: '交路轮转', component: markRaw(RouteRotateTab),   entities: ['交路轮转'] },
    ],
  },
  {
    key: 'system',
    title: '系统管理',
    icon: 'Setting',
    tabs: [
      { key: 'user',           title: '用户管理',     component: markRaw(UserTab),           entities: ['user'] },
      { key: 'userRole',       title: '用户角色分配', component: markRaw(UserRoleTab),       entities: ['roles'] },
      { key: 'roleManage',     title: '角色管理',     component: markRaw(RoleManageTab),     entities: ['roles', 'permissions'] },
      { key: 'permissionItem', title: '权限项管理',   component: markRaw(PermissionItemTab), entities: ['permissions'] },
      { key: 'logManage',      title: '日志管理',     component: markRaw(LogManageTab),      entities: ['log'] },
      { key: 'aboutSystem',    title: '关于系统',     component: markRaw(AboutSystemTab),    entities: [] },
    ],
  },
]

/** 所有 Tab 平铺列表，供渲染内容区与查找 */
const allTabs = computed(() => [
  ...topTabs,
  ...menuGroups.flatMap(g => g.tabs),
])

/** 当前 Tab title 映射（页头面包屑用） */
const titleMap = computed(() => {
  const map = {}
  allTabs.value.forEach(t => { map[t.key] = t.title })
  return map
})

/** 后端 entity → 受影响 Tab key 列表（从配置自动生成） */
const entityTabMap = computed(() => {
  const map = {}
  allTabs.value.forEach(tab => {
    (tab.entities || []).forEach(entity => {
      if (!map[entity]) map[entity] = []
      if (!map[entity].includes(tab.key)) map[entity].push(tab.key)
    })
  })
  return map
})

/* ========== 登录状态检查 ========== */
const currentUser = ref(null)

onMounted(() => {
  const saved = localStorage.getItem('pzh_user')
  if (saved) {
    try { currentUser.value = JSON.parse(saved) } catch { /* 解析失败则忽略 */ }
  }
  if (!currentUser.value) {
    ElMessage.warning('请先登录')
    router.push('/')
    return
  }
  loadCurrentTab()
})

/* ========== 侧边栏与菜单 ========== */
const isCollapse = ref(false)
const sidebarWidth = ref(200)  // 侧边栏宽度（px），支持拖动调整
const activeTab = ref('todayReport')

/** 拖动调整侧边栏宽度 */
const startDrag = (e) => {
  e.preventDefault()
  const startX = e.clientX
  const startW = sidebarWidth.value
  const onMove = (ev) => {
    const w = Math.min(400, Math.max(120, startW + ev.clientX - startX))
    sidebarWidth.value = w
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

/* ========== 子组件动态引用 ==========
 * 通过函数式 ref 将挂载后的组件实例存入 tabRefs.value[key]，
 * 统一由 loadCurrentTab 按 activeTab 调用对应实例的 loadData()。
 */
const tabRefs = ref({})
const setTabRef = (key) => (el) => {
  if (el) tabRefs.value[key] = el
  else delete tabRefs.value[key]
}

/** 加载当前激活 Tab 的数据 */
const loadCurrentTab = () => {
  tabRefs.value[activeTab.value]?.loadData?.()
}

/** 菜单项点击切换 */
const handleMenuSelect = (key) => {
  activeTab.value = key
  nextTick(() => loadCurrentTab())
}

/* ========== WebSocket 数据变更自动刷新 ========== */
let _wsDebounceTimer = null
const WS_DEBOUNCE_MS = 800

onDataChange('*', (data) => {
  const entity = data.entity || ''
  const affectedTabs = entityTabMap.value[entity] || []
  // 如果当前激活的 Tab 在受影响列表中，防抖后自动刷新
  if (affectedTabs.includes(activeTab.value)) {
    if (_wsDebounceTimer) clearTimeout(_wsDebounceTimer)
    _wsDebounceTimer = setTimeout(() => {
      _wsDebounceTimer = null
      console.log(`[WS-Admin] 数据变更(${entity})，刷新当前Tab: ${activeTab.value}`)
      loadCurrentTab()
    }, WS_DEBOUNCE_MS)
  }
})

/** 返回大屏首页 */
const goBack = () => router.push('/')

/** 退出登录 */
const handleLogout = async () => {
  // 登出前记录用户名（此时 localStorage 中还有用户信息）
  const logUser = getCurrentLogUser()
  try {
    const res = await logout()
    if (res?.data?.code === 0) {
      // 记录登出日志（不阻塞主流程）
      myLog('登录日志', logUser, '用户登出', `${logUser} 退出系统`)
      localStorage.removeItem('pzh_user')
      currentUser.value = null
      ElMessage.success(res.data.message || '已登出')
      router.push('/')
      return
    }
    ElMessage.error(res?.data?.message || '登出失败')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '登出失败')
  }
}
</script>

<template>
  <!-- 后台管理 - 侧边栏布局 - 修改人：王天智 -->
  <el-container class="admin-layout">

    <!-- ========== 顶部导航 ========== -->
    <el-header class="admin-header">
      <div class="header-left">
        <el-icon class="collapse-icon" @click="isCollapse = !isCollapse">
          <Fold v-if="!isCollapse" /><Expand v-else />
        </el-icon>
        <span class="header-title">后台管理系统</span>
        <span class="breadcrumb">/ {{ titleMap[activeTab] }}</span>
      </div>
      <div class="header-right">
        <el-icon class="mr-1"><UserFilled /></el-icon>
        <span class="username">{{ currentUser?.username }}</span>
        <el-divider direction="vertical" />
        <el-button link type="primary" @click="goBack">
          <el-icon class="mr-1"><Back /></el-icon>返回大屏
        </el-button>
        <el-button link type="danger" @click="handleLogout">退出登录</el-button>
      </div>
    </el-header>

    <el-container class="admin-body">

      <!-- ========== 左侧菜单 ========== -->
      <el-aside :width="isCollapse ? '64px' : sidebarWidth + 'px'" class="admin-aside">
        <!-- 拖动手柄 -->
        <div v-if="!isCollapse" class="drag-handle" @mousedown="startDrag"></div>
        <el-menu
          :default-active="activeTab"
          :collapse="isCollapse"
          :collapse-transition="false"
          :default-openeds="menuGroups.map(g => g.key)"
          @select="handleMenuSelect"
          class="aside-menu"
        >
          <!-- 顶部直达入口（配置驱动，支持多项） -->
          <el-menu-item
            v-for="tab in topTabs"
            :key="tab.key"
            :index="tab.key"
            :class="tab.menuClass"
          >
            <el-icon><component :is="tab.icon" /></el-icon>
            <template #title>
              <span :style="tab.titleStyle">{{ tab.title }}</span>
            </template>
          </el-menu-item>

          <!-- 分组菜单（配置驱动） -->
          <el-sub-menu
            v-for="group in menuGroups"
            :key="group.key"
            :index="group.key"
          >
            <template #title>
              <el-icon><component :is="group.icon" /></el-icon>
              <span>{{ group.title }}</span>
            </template>
            <el-menu-item
              v-for="tab in group.tabs"
              :key="tab.key"
              :index="tab.key"
            >
              {{ tab.title }}
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-aside>

      <!-- ========== 右侧内容区 ========== -->
      <el-main class="admin-main">
        <!-- 页面标题栏（今日填报页已内置标题，不重复显示） -->
        <div v-if="activeTab !== 'todayReport'" class="page-title-bar">
          <span class="page-title">{{ titleMap[activeTab] }}</span>
        </div>
        <!-- 内容面板：用 v-show 保持组件挂载状态，避免切换时重新渲染 -->
        <div class="content-panel">
          <component
            v-for="tab in allTabs"
            :key="tab.key"
            :is="tab.component"
            :ref="setTabRef(tab.key)"
            v-show="activeTab === tab.key"
          />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
/* 整体布局 */
.admin-layout {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

/* 顶部导航 */
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #1a5f7a 0%, #2d8faf 100%);
  color: #fff;
  padding: 0 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  height: 56px;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.collapse-icon {
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}
.collapse-icon:hover { background: rgba(255,255,255,0.15); }
.header-title {
  font-size: 18px;
  font-weight: 600;
}
.breadcrumb {
  font-size: 14px;
  opacity: 0.75;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}
.username { font-size: 14px; }
.header-right .el-button { color: #fff !important; }
.header-right .el-button:hover { opacity: 0.85; }

/* 主体容器 */
.admin-body {
  height: calc(100vh - 56px);
  overflow: hidden;
}

/* 侧边栏 */
.admin-aside {
  background: #fff;
  border-right: 1px solid #e4e7ed;
  transition: width 0.25s;
  overflow: hidden;
  overflow-y: auto;
  position: relative;
}
/* 拖动手柄：竖条，位于 aside 右边缘 */
.drag-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
}
.drag-handle:hover {
  background: rgba(64, 158, 255, 0.25);
}
.aside-menu {
  border-right: none;
  height: 100%;
}

/* 内容区 */
.admin-main {
  background: #f5f7fa;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.page-title-bar {
  padding: 14px 24px 10px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.content-panel {
  padding: 10px 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
