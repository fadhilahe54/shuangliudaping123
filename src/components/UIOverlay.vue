<!--
  UIOverlay.vue -- 首页 HUD 叠加层（UI 总控制器）
  覆盖在 Three.js 3D 场景上方的所有 UI 元素，包括：
    - 顶部工具栏：时钟、视角切换、搜索框、用户菜单（登录/退出/后台）
    - 左侧面板控制：调度信息面板（四个可拖拽子面板）
    - 右侧工具栏：渲染质量切换、场景重置、面板显示/隐藏
    - 底部状态区：轨道状态监控、列车编组面板
    - 浮层面板：车厢底部详情、整列车信息、车厢详细信息（CarriageDetails）
    - 弹窗：登录弹窗、关于系统弹窗

  是首页所有 UI 交互的总入口，通过 store 与 3D 场景通信
  使用方：HomeView.vue
-->
<script setup>
import {ref, onMounted, onBeforeUnmount, computed} from 'vue'
// 路由跳转（跳转到后台管理页）
import {useRouter} from 'vue-router'
// 列车数据 Store（车厢选中、视角模式、筛选等）
import {useTrainStore} from '../stores/trainStore.js'
// 面板显示状态 Store（控制四个调度信息面板的显隐）
import {usePanelStore} from '../stores/panelStore.js'
// 退出登录接口
import {logout} from '../api/dispatchApi.js'
// 操作日志接口
import {myLog, getCurrentLogUser} from '../api/log.js'
// 调度信息面板（四个可拖拽信息面板：今日值班/统计/检修状态/交路）
import DispatchInfoPanel from './DispatchInfoPanel.vue'
// 登录弹窗组件
import LoginDialog from './LoginDialog.vue'
// 车厢搜索栏
import SearchBar from './SearchBar.vue'
import {ElMessage, ElMessageBox} from 'element-plus'
// Three.js 性能档位工具（渲染质量切换）
import {
  getSavedThreePerformanceProfile,
  getThreePerformanceProfile,
  setThreePerformanceProfile
} from '../utils/performanceProfile.js'
// 顶部工具栏图标
import {
  UserFilled, SwitchButton, Cpu,
  OfficeBuilding, Histogram, Tools, Share,
  View, Aim, FullScreen, Lock, Close, Monitor,
  Grid, Fold, Expand, DArrowLeft, DArrowRight, QuestionFilled, InfoFilled,
  Position
} from '@element-plus/icons-vue'
// 关于系统弹窗内容组件
import AboutSystemTab from "@/views/admin/AboutSystemTab.vue";

// 获取路由实例，用于跳转到后台管理页
const router = useRouter()

// 获取列车数据 Store 实例
const store = useTrainStore()

// 获取面板显示状态 Store 实例
const {panelVisibility, togglePanel} = usePanelStore()

// ========== 时间显示逻辑 ==========
// 当前时间（HH:MM 格式）
const currentTime = ref('')

// 当前日期（YYYY-MM-DD 格式）
const currentDate = ref('')

// 当前星期（星期一、星期二等）
const currentDay = ref('')

// 当前秒数（用于时钟秒针动画）
const timeSeconds = ref(0)

// 时间更新定时器 ID
let timeTimer = null

/**
 * 更新当前时间、日期、星期
 * 每秒调用一次，更新顶部时钟显示
 * 
 * @returns {void}
 */
const updateTime = () => {
  // 获取当前时间
  const now = new Date()
  
  // 更新秒数（用于秒针动画）
  timeSeconds.value = now.getSeconds()
  
  // 格式化时间为 HH:MM
  currentTime.value = now.toLocaleTimeString('zh-CN', {hour12: false, hour: '2-digit', minute: '2-digit'})
  
  // 格式化日期为 YYYY-MM-DD
  currentDate.value = now.toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'})
  
  // 获取星期几
  currentDay.value = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()]
}

// ========== 视角控制与拖拽逻辑 ==========
// 视角模式列表（左侧视角、2.5D 视角、俯视角、自由视角、右侧视角）
const viewModes = [
  {mode: 'leftEnd', label: '左侧视角', icon: DArrowLeft},
  {mode: 'default', label: '2.5D 视角', icon: View},
  {mode: 'topDown', label: '俯视角（1）', icon: Aim},
  {mode: 'topDownReverse', label: '俯视角（2）', icon: Position},
  {mode: 'free', label: '自由视角', icon: FullScreen},
  {mode: 'rightEnd', label: '右侧视角', icon: DArrowRight},
]

// 左侧面板是否折叠
const isCollapsed = ref(false)

// 是否正在拖拽左侧面板
const isDragging = ref(false)

// 左侧面板的位置（绝对坐标，从 localStorage 恢复）
const DECK_POS_KEY = 'pzh_deck_pos'
const _loadDeckPos = () => {
  try {
    const raw = localStorage.getItem(DECK_POS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { x: 0, y: 0 }
}
const deckPos = ref(_loadDeckPos())

// 拖拽开始时的鼠标 X 坐标
let startX = 0

// 拖拽开始时的鼠标 Y 坐标
let startY = 0

/**
 * 计算当前激活的视角图标
 * 根据 store 中的 cameraViewMode 查找对应的图标组件
 * 
 * @returns {Component} 当前视角对应的图标组件，默认返回 View 图标
 */
const activeViewIcon = computed(() => {
  const active = viewModes.find(v => v.mode === store.cameraViewMode)
  return active ? active.icon : View
})

/**
 * 切换左侧面板的折叠/展开状态
 * 如果正在拖拽则忽略点击，避免冲突
 * 
 * @returns {void}
 */
const toggleCollapse = () => {
  if (isDragging.value) return
  isCollapsed.value = !isCollapsed.value
}

/**
 * 开始拖拽底部视角控制台
 * 支持鼠标、触摸、触控笔等多种输入方式
 * 拖拽范围限制在视口内，拖拽结束后持久化位置到 localStorage
 * 
 * @param {PointerEvent} e - 指针事件对象
 * @returns {void}
 */
const startDrag = (e) => {
  // 兼容鼠标/触摸/触控笔：鼠标仅接受左键；触摸/笔不带 button 字段
  if (e.pointerType === 'mouse' && e.button !== 0) return
  isDragging.value = false
  startX = e.clientX - deckPos.value.x
  startY = e.clientY - deckPos.value.y

  const deckEl = e.composedPath().find(el => el.classList?.contains('bottom-deck'))
  const deckRect = deckEl?.getBoundingClientRect() || {width: 600, height: 60}

  // 捕获指针，避免触摸快速滑动丢失事件
  try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }

  const onPointerMove = (moveEvent) => {
    isDragging.value = true

    const halfViewport = window.innerWidth / 2
    const minX = -halfViewport + deckRect.width / 2
    const maxX = halfViewport - deckRect.width / 2
    const maxY = 0
    const minY = -(window.innerHeight - deckRect.height - window.innerHeight * 0.03)

    let newX = moveEvent.clientX - startX
    let newY = moveEvent.clientY - startY

    if (newX < minX) newX = minX
    if (newX > maxX) newX = maxX
    if (newY < minY) newY = minY
    if (newY > maxY) newY = maxY

    deckPos.value = {x: newX, y: newY}
  }

  const onPointerUp = () => {
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('pointercancel', onPointerUp)
    // 拖拽结束后持久化位置到 localStorage
    try { localStorage.setItem(DECK_POS_KEY, JSON.stringify(deckPos.value)) } catch { /* ignore */ }
    setTimeout(() => {
      isDragging.value = false
    }, 50)
  }

  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
}

// --- 用户与登录逻辑 ---
const showLoginDialog = ref(false)
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)


const showAboutDialog = ref(false)
// --- 画质切换（老电脑友好） ---
const qualityOptions = [
  {name: 'low', label: '流畅'},
  {name: 'medium', label: '均衡'},
  {name: 'high', label: '高清'},
]
const currentQuality = ref(getSavedThreePerformanceProfile() || getThreePerformanceProfile().name)
const currentQualityLabel = computed(() => qualityOptions.find(item => item.name === currentQuality.value)?.label || '自动')

/**
 * 清除 URL 上的 perf/quality 参数
 * 避免刷新后被 URL 参数强制覆盖用户选择的画质设置
 * 同时处理 URL hash 中的参数
 * 
 * @returns {void}
 */
const removeQualityUrlParams = () => {
  const url = new URL(window.location.href)
  url.searchParams.delete('perf')
  url.searchParams.delete('quality')
  if (url.hash.includes('?')) {
    const [hashPath, hashSearch] = url.hash.split('?')
    const hashParams = new URLSearchParams(hashSearch)
    hashParams.delete('perf')
    hashParams.delete('quality')
    const nextHashSearch = hashParams.toString()
    url.hash = nextHashSearch ? `${hashPath}?${nextHashSearch}` : hashPath
  }
  window.history.replaceState(null, '', url.toString())
}

/**
 * 切换 Three.js 渲染画质
 * 支持流畅、均衡、高清三种模式，切换后自动刷新页面
 * 
 * @param {string} name - 画质名称（low/medium/high）
 * @returns {void}
 */
const switchQuality = (name) => {
  if (currentQuality.value === name) return
  if (!setThreePerformanceProfile(name)) return
  currentQuality.value = name
  removeQualityUrlParams()
  ElMessage.success(`已切换为${qualityOptions.find(item => item.name === name)?.label || name}画质，正在重新加载`)
  setTimeout(() => window.location.reload(), 300)
}

/**
 * 跳转到后台管理页面
 * 未登录时显示警告并弹出登录对话框
 * 
 * @returns {void}
 */
const goAdmin = () => {
  if (!isLoggedIn.value) {
    ElMessage.warning('访问受限：进入后台管理系统需要管理员权限识别')
    showLoginDialog.value = true
    return
  }
  router.push('/admin')
}

/**
 * 处理用户登出操作
 * 弹出确认对话框，确认后调用登出接口并记录日志
 * 
 * @returns {Promise<void>}
 */
const handleLogout = () => {
  ElMessageBox.confirm('确认登出？', '安全提示', {
    confirmButtonText: '确定登出',
    cancelButtonText: '取消',
    customClass: 'pzh-dark-dialog'
  }).then(async () => {
    // 登出前记录日志（此时 localStorage 中还有用户信息）
    const logUser = getCurrentLogUser()
    const res = await logout()
    if (res?.data?.code === 0) {
      // 记录登出日志（不阻塞主流程）
      myLog('登录日志', logUser, '用户登出', `${logUser} 退出系统`)
      currentUser.value = null
      localStorage.removeItem('pzh_user')
      ElMessage.success(res.data.message || '已登出')
      router.push('/')
      return
    }
    ElMessage.error(res?.data?.message || '登出失败')
  }).catch((e) => {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e?.response?.data?.message || e?.message || '登出失败')
  })
}

// --- 导航项配置 ---
const navItems = [
  {id: 'org', cn: '今日值班', ic: OfficeBuilding, color: '#30b9d2'},
  {id: 'stat', cn: '当日重点', ic: Histogram, color: '#bda32f'},
  {id: 'status', cn: '检修状态', ic: Tools, color: '#ff9f43'},
  {id: 'route', cn: '交路/车组', ic: Share, color: '#4cb977'}
]

// 底部控制台位置（基于拖拽）
/**
 * 计算底部控制台的样式
 * 根据拖拽位置和拖拽状态动态计算 transform 和 transition
 * 
 * @returns {Object} 包含 transform 和 transition 的样式对象
 */
const deckStyle = computed(() => {
  const transition = isDragging.value ? 'none' : 'transform 0.3s ease'

  return {
    transform: `translate(calc(-50% + ${deckPos.value.x}px), ${deckPos.value.y}px)`,
    transition,
  }
})

/**
 * 打开使用说明文档
 * 在新标签页中打开 PDF 格式的帮助文档
 * 
 * @returns {void}
 */
const openHelp = () => {
  window.open('/img/help.pdf')
}

/**
 * 组件挂载时的初始化操作
 * 启动时间更新定时器，从 localStorage 恢复用户登录状态
 * 
 * @returns {void}
 */
onMounted(() => {
  updateTime()
  timeTimer = setInterval(updateTime, 1000)
  const savedUser = localStorage.getItem('pzh_user')
  if (savedUser) {
    try {
      currentUser.value = JSON.parse(savedUser)
    } catch (e) {
      localStorage.removeItem('pzh_user')
    }
  }
})

/**
 * 组件卸载前的清理操作
 * 清除时间更新定时器，避免内存泄漏
 * 
 * @returns {void}
 */
onBeforeUnmount(() => {
  clearInterval(timeTimer)
})
</script>

<template>
  <div class="hud-master-root">
    <header class="hud-header">
      <div class="header-bg-blur"></div>

      <div class="wing left-wing">
        <!-- 时间信息 -->
        <div class="time-block">
          <div class="time-container">
            <span class="digital-clock">{{ currentTime }}</span>
            <span class="time-seconds">:{{ String(timeSeconds).padStart(2, '0') }}</span>
          </div>
          <div class="date-row">
            <span class="day-tag">{{ currentDay }}</span>
            <div class="date-separator"></div>
            <span class="date-tag">{{ currentDate }}</span>
          </div>
          <!-- 时间进度条 -->
          <div class="time-progress">
            <div class="progress-track">
              <div class="progress-ticks">
                <span v-for="n in 60" :key="n" class="tick" :class="{ 'tick-active': n <= timeSeconds }"></span>
              </div>
              <div class="progress-bar" :style="{ width: (timeSeconds / 60 * 100) + '%' }">
                <div class="progress-glow"></div>
                <div class="progress-shimmer"></div>
                <div class="progress-peak"></div>
              </div>
            </div>
            <div class="progress-particles">
              <span v-for="n in 5" :key="n" class="particle" :style="{ animationDelay: (n * 0.4) + 's' }"></span>
            </div>
          </div>
        </div>

        <div class="v-gate gate-pulse"></div>

        <!-- 导航按钮 -->
        <nav class="ops-nav">
          <button v-for="(item, idx) in navItems" :key="idx" class="cyber-btn nav-btn"
                  :class="{ 'is-active': panelVisibility[item.id] }"
                  @click="togglePanel(item.id)"
                  :style="panelVisibility[item.id] ? {'--active-color': item.color} : {}">
            <div class="btn-corners">
              <span class="corner c1"></span><span class="corner c2"></span>
              <span class="corner c3"></span><span class="corner c4"></span>
            </div>
            <div class="btn-glow" :style="{ background: item.color }"></div>
            <el-icon class="btn-icon" :style="{ color: panelVisibility[item.id] ? item.color : '' }">
              <component :is="item.ic"/>
            </el-icon>
            <div class="btn-labels">
              <span class="label-cn">{{ item.cn }}</span>
              <span class="label-en">{{ item.en }}</span>
            </div>
            <div class="active-indicator" v-if="panelVisibility[item.id]"></div>
          </button>
        </nav>
      </div>

      <!-- 标题与Logo -->
      <div class="center-brand">
        <div class="brand-ambient-glow"></div>
        <div class="brand-shell">
          <div class="pzh-logo-container">
            <div class="logo-orbit-ring"></div>
            <div class="logo-pulse-ring"></div>
            <div class="logo-corner-glow"></div>
            <img src="/img/logo.ico" class="main-logo" alt="logo"/>
          </div>
          <div class="title-stack">
            <h1 class="pzh-title-text">
              <span class="title-glow-back"></span>
              <span class="title-content">双流运用车间孪生平台</span>
            </h1>
            <div class="pzh-subtitle">
              <span class="accent-line"></span>
              <span class="subtitle-content">PANZHIHUA LOCOMOTIVE DEPOT DIGITAL TWIN PLATFORM</span>
              <span class="accent-line"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="wing right-wing">
        <div class="search-wrapper">
          <SearchBar/>
        </div>
        <div class="v-gate gate-pulse"></div>
        <div class="action-row">
          <!-- 画质切换按钮：老电脑可选 “流畅” 获得最佳性能 -->
          <el-tooltip :content="`画质：${currentQualityLabel}`" placement="bottom" effect="dark">
            <el-dropdown trigger="click" popper-class="quality-dropdown" @command="switchQuality">
              <button class="heavy-btn icon-btn quality-btn">
                <el-icon>
                  <Monitor/>
                </el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                      v-for="item in qualityOptions"
                      :key="item.name"
                      :command="item.name"
                      :class="{ 'is-quality-active': currentQuality === item.name }"
                  >
                    {{ item.label }} {{ currentQuality === item.name ? '✓' : '' }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-tooltip>

          <button class="heavy-btn admin-btn" @click="goAdmin">
            <div class="btn-glow"></div>
            <el-icon>
              <Cpu/>
            </el-icon>
            <div class="btn-labels">
              <span class="label-cn">后台管理</span>
              <span class="label-en">{{ isLoggedIn ? 'ADMIN' : 'LOCKED' }}</span>
            </div>
          </button>

          <div v-if="isLoggedIn" class="user-profile-card">
            <div class="u-avatar">
              <el-icon>
                <UserFilled/>
              </el-icon>
              <div class="online-dot"></div>
            </div>
            <div class="u-text">
              <span class="u-name">{{ currentUser.username }}</span>
              <span class="u-status">已连接调度网络</span>
            </div>
            <button class="u-exit" @click="handleLogout">
              <el-icon>
                <SwitchButton/>
              </el-icon>
            </button>
          </div>

          <button v-else class="heavy-btn login-btn" @click="showLoginDialog = true">
            <el-icon>
              <Lock/>
            </el-icon>
            <div class="btn-labels">
              <span class="label-cn">系统登录</span>
              <span class="label-en">LOGIN</span>
            </div>
          </button>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <!--    使用说明文档-->
            <button style="display: flex; align-items: center; justify-content: center;" @click="openHelp">
              <el-icon>
                <QuestionFilled/>
              </el-icon>
            </button>
            <!--            关于页面-->
            <button style="display: flex; align-items: center; justify-content: center;"
                    @click="showAboutDialog = true">
              <el-icon>
                <InfoFilled/>
              </el-icon>
            </button>
          </div>

        </div>
      </div>
    </header>


    <div class="bottom-vanishing-line"></div>

    <!-- 视角控制台 -->
    <footer
        class="bottom-deck"
        :class="{ 'is-minimized': isCollapsed }"
        :style="deckStyle"
        @pointerdown="startDrag"
    >
      <div class="deck-base">
        <Transition name="deck-expand" mode="out-in">
          <div v-if="isCollapsed" key="collapsed" class="deck-collapsed-trigger" @click.stop="toggleCollapse">
            <div class="drag-handle-dot"></div>
            <div class="collapsed-halo">
              <el-icon class="pulse-icon">
                <component :is="activeViewIcon"/>
              </el-icon>
            </div>
            <div class="collapsed-label">{{ viewModes.find(v => v.mode === store.cameraViewMode)?.label }}</div>
          </div>

          <div v-else key="expanded" class="deck-expanded-content">
            <div class="deck-drag-handle">
              <el-icon>
                <Grid/>
              </el-icon>
            </div>

            <div class="view-modes-container">
              <button
                  v-for="v in viewModes"
                  :key="v.mode"
                  @pointerdown.stop
                  @click.stop="store.setCameraViewMode(v.mode)"
                  :class="['deck-btn', store.cameraViewMode === v.mode ? 'active' : '']"
              >
                <div class="deck-icon-box">
                  <el-icon>
                    <component :is="v.icon"/>
                  </el-icon>
                  <div class="icon-halo" v-if="store.cameraViewMode === v.mode"></div>
                </div>
                <span class="deck-text">{{ v.label }}</span>
                <span class="deck-shortcut">{{ v.shortcut }}</span>
                <div class="active-bar" v-if="store.cameraViewMode === v.mode"></div>
              </button>
            </div>

            <div class="v-gate-mini"></div>

            <button class="deck-btn collapse-toggle" @pointerdown.stop @click.stop="toggleCollapse">
              <el-icon>
                <Fold/>
              </el-icon>
              <span class="deck-text">收起</span>
            </button>
          </div>
        </Transition>
      </div>
    </footer>
  </div>

  <DispatchInfoPanel class="pzh-info-panel"/>
  <LoginDialog v-model:visible="showLoginDialog" @login-success="u => { currentUser = u; }"/>


  <el-dialog
      v-model="showAboutDialog"
      title="关于"
      class="pzh-digital-twin-about-dialog"
      width="900px"
      draggable
  >
    <about-system-tab/>
  </el-dialog>

</template>

<style scoped>
/* ========== HUD 根容器 ========== */
/* 固定覆盖整个视口，只作为 UI 叠加层，不阻挡底层 Three.js 场景默认交互 */
.hud-master-root {
  /* 定位方式：固定定位，覆盖整个视口 */
  position: fixed;
  /* 位置：覆盖整个视口 */
  inset: 0;
  /* 层级：1，在 Three.js 场景之上 */
  z-index: 1;
  /* 指针事件：无，不阻挡底层 3D 场景交互 */
  pointer-events: none;
  /* 字体：系统字体栈，优先使用系统默认无衬线字体 */
  font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  /* 文字颜色：白色 */
  color: #fff;
  /* 溢出：可见，允许子元素超出边界 */
  overflow: visible;
}

/* --- Header 层级设定 --- */
/* 顶部栏启用 pointer-events，保证按钮、搜索栏、下拉菜单等 HUD 控件可点击 */
.hud-header {
  /* 定位方式：相对定位 */
  position: relative;
  /* 高度：响应式，最小 64px，最大 120px，默认 9vh */
  height: clamp(64px, 9vh, 120px);
  /* 布局：弹性布局 */
  display: flex;
  /* 主轴对齐：两端对齐，左右分布 */
  justify-content: space-between;
  /* 交叉轴对齐：居中 */
  align-items: center;
  /* 内边距：响应式，最小 10px，最大 2vw，默认 1.5vw */
  padding: 0 clamp(10px, 1.5vw, 2vw);
  /* 指针事件：自动，允许交互 */
  pointer-events: auto;
  /* 层级：1 */
  z-index: 1;
}

/* 顶部背景渐隐层：用 mask-image 让顶部工具栏自然融入 3D 场景 */
.header-bg-blur {
  /* 定位方式：绝对定位 */
  position: absolute;
  /* 位置：覆盖整个 header */
  inset: 0;
  /* 背景：从深色半透明渐变到透明，模拟玻璃效果 */
  background: linear-gradient(to bottom, rgba(16, 21, 32, 0.98), rgba(10, 15, 25, 0.4) 75%, transparent);
  /* 遮罩：从黑色渐变到透明，实现底部淡出效果 */
  mask-image: linear-gradient(to bottom, black 60%, transparent);
  /* 层级：-1，在内容下方 */
  z-index: -1;
}

/* --- 左右翼 --- */
/* 左右翼分别承载时间/搜索/按钮区，中间标题通过绝对/居中层保持大屏对称 */
.wing {
  /* 布局：弹性布局 */
  display: flex;
  /* 交叉轴对齐：居中 */
  align-items: center;
  /* 弹性：1，平分剩余空间 */
  flex: 1;
  /* 最小宽度：0，允许 flex 子项缩小 */
  min-width: 0;
  /* 层级：1 */
  z-index: 1;
}

.left-wing {
  /* 主轴对齐：左对齐 */
  justify-content: flex-start;
  /* 间距：响应式，最小 6px，最大 1vw，默认 0.6vw */
  gap: clamp(6px, 0.6vw, 1vw);
}

.right-wing {
  /* 主轴对齐：右对齐 */
  justify-content: flex-end;
}

/* ========== 时间信息 ========== */
.time-block {
  /* 最小宽度：响应式，最小 100px，最大 180px，默认 12vw */
  min-width: clamp(100px, 12vw, 180px);
  /* 弹性收缩：0，不允许缩小 */
  flex-shrink: 0;
  /* 定位方式：相对定位 */
  position: relative;
}

.time-container {
  /* 布局：弹性布局 */
  display: flex;
  /* 交叉轴对齐：基线对齐 */
  align-items: baseline;
  /* 间距：2px */
  gap: 2px;
}

.digital-clock {
  /* 字体：科技感等宽字体，优先使用 Orbitron */
  font-family: 'Orbitron', 'Courier New', monospace;
  /* 字号：响应式，最小 20px，最大 40px，默认 1.8vw */
  font-size: clamp(20px, 1.8vw, 40px);
  /* 字重：700，加粗 */
  font-weight: 700;
  /* 行高：1，紧凑 */
  line-height: 1;
  /* 文字颜色：白色 */
  color: #fff;
  /* 文字阴影：青色发光，营造霓虹灯效果 */
  text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
  /* 字间距：1px */
  letter-spacing: 1px;
}

.time-seconds {
  /* 字体：科技感等宽字体 */
  font-family: 'Orbitron', monospace;
  /* 字号：14px */
  font-size: 14px;
  /* 文字颜色：青色 */
  color: #00d4ff;
  /* 透明度：0.8，半透明 */
  opacity: 0.8;
}

.date-row {
  /* 布局：弹性布局 */
  display: flex;
  /* 间距：6px */
  gap: 6px;
  /* 字号：响应式，最小 11px，最大 16px，默认 1vw */
  font-size: clamp(11px, 1vw, 16px);
  /* 上外边距：1px */
  margin-top: 1px;
  /* 透明度：0.8，半透明 */
  opacity: 0.8;
  /* 文字阴影：青色发光 */
  text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
  /* 交叉轴对齐：居中 */
  align-items: center;
}

.date-separator {
  /* 宽度：4px */
  width: 4px;
  /* 高度：4px */
  height: 4px;
  /* 背景：青色 */
  background: #00d4ff;
  /* 变换：旋转 45 度，形成菱形 */
  transform: rotate(45deg);
  /* 透明度：0.6 */
  opacity: 0.6;
}

.day-tag {
  /* 文字颜色：青色 */
  color: #00d4ff;
  /* 字重：600，半粗 */
  font-weight: 600;
}

/* ========== 时间进度条 ========== */
.time-progress {
  width: 100%;
  margin-top: clamp(2px, 0.5vh, 8px);
  position: relative;
}

.progress-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5),
  0 1px 0 rgba(255, 255, 255, 0.05);
}

/* 刻度线 */
.progress-ticks {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 1px;
  z-index: 2;
  pointer-events: none;
}

.tick {
  width: 1px;
  height: 100%;
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

.tick-active {
  background: rgba(0, 212, 255, 0.35);
  box-shadow: 0 0 4px rgba(0, 212, 255, 0.3);
}

/* 进度填充条 */
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff 0%, #00ff88 50%, #00d4ff 100%);
  background-size: 200% 100%;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  border-radius: 3px;
  animation: gradientFlow 3s linear infinite;
}

@keyframes gradientFlow {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

/* 流光扫描效果 */
.progress-shimmer {
  position: absolute;
  top: 0;
  left: -30%;
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: shimmerScan 2s ease-in-out infinite;
  border-radius: 3px;
}

@keyframes shimmerScan {
  0% {
    left: -30%;
  }
  100% {
    left: 130%;
  }
}

/* 发光层 */
.progress-glow {
  position: absolute;
  inset: -2px;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.3), rgba(0, 255, 136, 0.3));
  filter: blur(6px);
  border-radius: 6px;
  opacity: 0.6;
  animation: glowPulse 2s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% {
    opacity: 0.4;
    filter: blur(6px);
  }
  50% {
    opacity: 0.8;
    filter: blur(10px);
  }
}

/* 进度峰值指示 */
.progress-peak {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 14px;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 0 12px #00d4ff, 0 0 24px rgba(0, 212, 255, 0.5);
  animation: peakPulse 1s ease-in-out infinite;
}

@keyframes peakPulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(0.8);
  }
}

/* 底部粒子效果 */
.progress-particles {
  position: absolute;
  bottom: -8px;
  left: 0;
  width: 100%;
  height: 6px;
  overflow: hidden;
  pointer-events: none;
}

.particle {
  position: absolute;
  bottom: 0;
  width: 2px;
  height: 2px;
  background: rgba(0, 212, 255, 0.6);
  border-radius: 50%;
  animation: particleFloat 3s ease-in-out infinite;
  box-shadow: 0 0 4px rgba(0, 212, 255, 0.4);
}

.particle:nth-child(1) {
  left: 10%;
}

.particle:nth-child(2) {
  left: 30%;
}

.particle:nth-child(3) {
  left: 50%;
}

.particle:nth-child(4) {
  left: 70%;
}

.particle:nth-child(5) {
  left: 90%;
}

@keyframes particleFloat {
  0%, 100% {
    transform: translateY(0) scale(1);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 0.3;
  }
  50% {
    transform: translateY(-6px) scale(1.5);
    opacity: 0.8;
  }
}

/* ========== heavy-btn ========== */
.ops-nav {
  display: flex;
  gap: clamp(2px, 0.3vw, 0.5vw);
  flex-shrink: 1;
  min-width: 0;
}

.cyber-btn {
  position: relative;
  background: rgba(0, 20, 40, 0.6);
  border: 1px solid rgba(0, 212, 255, 0.2);
  padding: clamp(4px, 2.8vh, 1.3vh) clamp(6px, 0.5vw, 0.8vw);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: clamp(4px, 0.4vw, 8px);
  color: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  backdrop-filter: blur(12px);
  overflow: hidden;
  border-bottom: 2px solid rgba(34, 211, 238, 0.3);
}

.cyber-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.cyber-btn:hover::before {
  left: 100%;
}

.cyber-btn:hover {
  border-color: rgba(0, 212, 255, 0.6);
  background: rgba(0, 40, 80, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0, 212, 255, 0.15);
}

/* 四角装饰 */
.btn-corners {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 6px;
  height: 6px;
  border-color: rgba(0, 212, 255, 0.6);
  border-style: solid;
  transition: all 0.3s ease;
}

.c1 {
  top: -1px;
  left: -1px;
  border-width: 1px 0 0 1px;
}

.c2 {
  top: -1px;
  right: -1px;
  border-width: 1px 1px 0 0;
}

.c3 {
  bottom: -1px;
  right: -1px;
  border-width: 0 1px 1px 0;
}

.c4 {
  bottom: -1px;
  left: -1px;
  border-width: 0 0 1px 1px;
}

.cyber-btn:hover .corner {
  width: 10px;
  height: 10px;
  border-color: #00d4ff;
}

/* 发光效果 */
.btn-glow {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  opacity: 0;
  transition: opacity 0.3s ease;
  filter: blur(4px);
}

.cyber-btn:hover .btn-glow {
  opacity: 1;
}

.nav-btn.is-active {
  background: rgba(0, 60, 100, 0.4);
  border-color: var(--active-color, #00d4ff);
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.2),
  inset 0 0 20px rgba(0, 212, 255, 0.05);
}

.nav-btn.is-active .btn-glow {
  opacity: 1;
  background: var(--active-color, #00d4ff) !important;
}

.nav-btn:not(.is-active) {
  opacity: 0.7;
}

.btn-icon {
  font-size: 16px;
  transition: all 0.3s ease;
}

.nav-btn.is-active .btn-icon {
  filter: drop-shadow(0 0 8px currentColor);
}

.btn-labels {
  display: flex;
  flex-direction: column;
  text-align: left;
  line-height: 1.2;
}

.label-cn {
  font-size: clamp(11px, 0.75vw, 15px);
  font-weight: 700;
  letter-spacing: clamp(0px, 0.05vw, 1px);
}

.label-en {
  font-size: 12px;
  color: #00d4ff;
  font-family: 'Orbitron', monospace;
  letter-spacing: 1px;
}

.active-indicator {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 6px;
  height: 6px;
  background: #00ff88;
  border-radius: 50%;
  box-shadow: 0 0 8px #00ff88;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

/* ========== 标题与Logo ========== */
.center-brand {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  pointer-events: none;
}

/* 品牌区域环境光 */
.brand-ambient-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  height: 120px;
  background: radial-gradient(ellipse, rgba(0, 212, 255, 0.08) 0%, transparent 70%);
  animation: ambientBreathe 4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes ambientBreathe {
  0%, 100% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.1);
  }
}

.brand-shell {
  display: flex;
  align-items: center;
  gap: 1vw;
  position: relative;
}

/* ===== Logo 容器 ===== */
.pzh-logo-container {
  width: clamp(36px, 6vh, 64px);
  height: clamp(36px, 6vh, 64px);
  border: 2px solid rgba(34, 211, 238, 0.4);
  border-radius: 10px;
  background: rgba(34, 211, 238, 0.1);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: visible;
}

/* Logo 轨道光环 */
.logo-orbit-ring {
  position: absolute;
  inset: -6px;
  border: 1px solid rgba(34, 211, 238, 0.15);
  border-radius: 14px;
  animation: orbitRotate 8s linear infinite;
}

.logo-orbit-ring::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 50%;
  width: 4px;
  height: 4px;
  background: #00d4ff;
  border-radius: 50%;
  box-shadow: 0 0 8px #00d4ff, 0 0 16px rgba(0, 212, 255, 0.5);
  transform: translateX(-50%);
}

@keyframes orbitRotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Logo 脉冲光环 */
.logo-pulse-ring {
  position: absolute;
  inset: -3px;
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 12px;
  animation: pulseRing 2s ease-in-out infinite;
}

@keyframes pulseRing {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
    border-color: rgba(34, 211, 238, 0.3);
  }
  50% {
    transform: scale(1.05);
    opacity: 0.2;
    border-color: rgba(34, 211, 238, 0.1);
  }
}

/* Logo 角落流光 */
.logo-corner-glow {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  overflow: hidden;
}

.logo-corner-glow::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: conic-gradient(
      from 0deg,
      transparent 0%,
      transparent 20%,
      rgba(0, 212, 255, 0.4) 40%,
      rgba(0, 255, 136, 0.4) 50%,
      rgba(0, 212, 255, 0.4) 60%,
      transparent 80%,
      transparent 100%
  );
  animation: cornerGlowRotate 4s linear infinite;
  opacity: 0.6;
}

.logo-corner-glow::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: rgba(10, 15, 25, 0.9);
  border-radius: 8px;
}

@keyframes cornerGlowRotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.main-logo {
  width: 80%;
  height: 80%;
  object-fit: contain;
  filter: brightness(1) drop-shadow(0 0 8px rgba(0, 212, 255, 0.3));
  position: relative;
  z-index: 1;
  animation: logoBreathe 3s ease-in-out infinite;
}

@keyframes logoBreathe {
  0%, 100% {
    filter: brightness(1) drop-shadow(0 0 8px rgba(0, 212, 255, 0.3));
  }
  50% {
    filter: brightness(1.15) drop-shadow(0 0 16px rgba(0, 212, 255, 0.5));
  }
}

/* ===== 标题美化 ===== */
.title-stack {
  position: relative;
}

.pzh-title-text {
  font-size: clamp(16px, 1.6vw, 38px);
  font-weight: 950;
  letter-spacing: clamp(2px, 0.3vw, 5px);
  margin: 0;
  white-space: nowrap;
  position: relative;
}

/* 标题霓虹背光 */
.title-glow-back {
  position: absolute;
  inset: -4px -10px;
  background: linear-gradient(180deg, rgba(0, 212, 255, 0.15) 0%, transparent 60%);
  filter: blur(12px);
  animation: titleGlowBreathe 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes titleGlowBreathe {
  0%, 100% {
    opacity: 0.4;
    filter: blur(12px);
  }
  50% {
    opacity: 0.8;
    filter: blur(16px);
  }
}

.title-content {
  background: linear-gradient(180deg, #fff 30%, #92e2ec 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  position: relative;
  display: inline-block;
}

/* 标题文字阴影动画 */
.title-content::after {
  content: '双流运用车间孪生平台';
  position: absolute;
  left: 0;
  top: 0;
  background: linear-gradient(180deg, #fff 30%, #92e2ec 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: blur(8px);
  opacity: 0.5;
  animation: textShadowPulse 2s ease-in-out infinite;
  pointer-events: none;
}

@keyframes textShadowPulse {
  0%, 100% {
    opacity: 0.3;
    filter: blur(6px);
  }
  50% {
    opacity: 0.6;
    filter: blur(10px);
  }
}

.pzh-subtitle {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 10px;
}

.accent-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.5), transparent);
  position: relative;
  overflow: hidden;
}

.accent-line::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.8), transparent);
  animation: lineShimmer 3s ease-in-out infinite;
}

@keyframes lineShimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 200%;
  }
}

.subtitle-content {
  color: rgba(146, 226, 236, 0.7);
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.2);
}

@keyframes subtitleFlicker {
  0%, 90%, 100% {
    opacity: 1;
  }
  92% {
    opacity: 0.3;
  }
  94% {
    opacity: 1;
  }
  96% {
    opacity: 0.5;
  }
}

/* --- 右翼 --- */
.search-wrapper {
  width: clamp(140px, 14vw, 280px);
  flex-shrink: 1;
}

.action-row {
  display: flex;
  align-items: center;
  gap: clamp(4px, 0.5vw, 0.8vw);
  flex-shrink: 0;
}

.heavy-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 2px solid rgba(34, 211, 238, 0.3);
  padding: clamp(4px, 0.8vh, 1.2vh) clamp(6px, 0.5vw, 0.8vw);
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: clamp(4px, 0.4vw, 8px);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  backdrop-filter: blur(8px)
}

.heavy-btn:hover {
  background: rgba(34, 211, 238, 0.15);
  border-color: #31b0c3;
  transform: translateY(-1px);
}

/* 画质切换按钮：纯图标，紧凑样式 */
.heavy-btn.icon-btn {
  width: clamp(36px, 3vw, 48px);
  height: clamp(36px, 3vw, 48px);
  padding: 0;
  justify-content: center;
}

.heavy-btn.icon-btn .el-icon {
  font-size: clamp(16px, 1.4vw, 22px);
  color: #00d4ff;
}

.user-profile-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 6px;
}

.u-avatar {
  width: 28px;
  height: 28px;
  background: #22d3ee;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  position: relative;
}

.online-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: #4ade80;
  border: 2px solid #0a0f19;
  border-radius: 50%;
}

.u-text {
  display: flex;
  flex-direction: column;
}

.u-name {
  font-size: 12px;
  font-weight: bold;
}

.u-status {
  font-size: 8px;
  color: #22d3ee;
}

.u-exit {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
}

.v-gate {
  width: 1px;
  height: clamp(30px, 5vh, 55px);
  background: rgba(255, 255, 255, 0.1);
  margin: 0 clamp(4px, 0.4vw, 0.5vw);
  position: relative;
}

.v-gate.gate-pulse {
  background: rgba(0, 212, 255, 0.15);
  animation: gatePulse 3s ease-in-out infinite;
}

.v-gate.gate-pulse::before,
.v-gate.gate-pulse::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 3px;
  height: 3px;
  background: #00d4ff;
  border-radius: 50%;
}

.v-gate.gate-pulse::before {
  top: 0;
}

.v-gate.gate-pulse::after {
  bottom: 0;
}

@keyframes gatePulse {
  0%, 100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.bottom-vanishing-line {
  position: absolute;
  top: clamp(60px, 8.5vh, 115px);
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.4), transparent);
  animation: peakPulse 4s ease-in-out infinite;
}

/* ========== 视角控制台 ========== */
.bottom-deck {
  position: fixed;
  /* 触摸屏下禁用默认平移/缩放手势 */
  touch-action: none;
  bottom: 3vh;
  left: 50%;
  pointer-events: auto;
  z-index: 9999;
}

.deck-base {
  background: rgba(10, 15, 25, 0.7);
  backdrop-filter: blur(8px);
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(34, 211, 238, 0.1);
  display: flex;
  gap: 4px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
  align-items: center;
}

.deck-expand-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.deck-expand-leave-active {
  transition: all 0.2s ease-in;
}

.deck-expand-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(8px);
}

.deck-expand-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-5px);
}

.deck-expanded-content {
  display: flex;
  align-items: center;
  gap: 4px;
}

.deck-drag-handle {
  padding: 0 8px;
  color: rgba(255, 255, 255, 0.2);
  cursor: move;
  /* 触摸屏下禁用默认手势，保证 pointer 事件连续 */
  touch-action: none;
}

/* 视角模式容器 */
.view-modes-container {
  display: flex;
  gap: 4px;
}

.deck-btn {
  position: relative;
  background: transparent;
  border: 1px solid transparent;
  min-width: 60px;
  padding: 4px 3px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.3s ease;
  border-radius: 10px;
}

.deck-btn:hover:not(.active) {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(0, 212, 255, 0.2);
}

.deck-btn.active {
  color: #00d4ff;
  background: rgba(0, 212, 255, 0.08);
  border-color: rgba(0, 212, 255, 0.4);
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.15),
  inset 0 0 20px rgba(0, 212, 255, 0.05);
}

.deck-icon-box {
  font-size: 16px;
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-halo {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 50%;
  animation: haloPulse 2s ease-in-out infinite;
}

@keyframes haloPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.3;
  }
}

.deck-text {
  font-size: 10px;
  font-weight: 700;
  margin-top: 3px;
  white-space: nowrap;
  letter-spacing: 1px;
}

.deck-shortcut {
  font-size: 8px;
  color: rgba(255, 255, 255, 0.3);
  font-family: 'Orbitron', monospace;
  margin-top: 2px;
}

.active-bar {
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00d4ff, transparent);
  border-radius: 1px;
}

.v-gate-mini {
  width: 2px;
  height: 44px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 3px;
}

/* 收起状态 */
.deck-collapsed-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
}

.drag-handle-dot {
  width: 6px;
  height: 6px;
  background: rgba(0, 212, 255, 0.4);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
}

.collapsed-halo {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 50%;
  background: rgba(0, 212, 255, 0.05);
}

.pulse-icon {
  color: #00d4ff;
  font-size: 20px;
  animation: iconPulse 2s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.7;
  }
}

/* ========== 折叠标签样式 ========== */
/* 左侧面板折叠时的标签 */
.collapsed-label {
  /* 字号：11px，小标签 */
  font-size: 11px;
  /* 文字颜色：白色半透明 */
  color: rgba(255, 255, 255, 0.6);
  /* 字重：600，半粗 */
  font-weight: 600;
  /* 字间距：1px，增加可读性 */
  letter-spacing: 1px;
}

/* ========== 信息面板层级控制 ========== */
/* 调度信息面板的层级控制，确保在其他元素上方 */
:deep(.pzh-info-panel), .pzh-info-panel {
  /* 层级：2000，在其他元素上方 */
  z-index: 2000 !important;
}

/* ========== 分辨率特殊优化（1440px 以下） ========== */
/* 在较小屏幕上隐藏或调整某些元素，优化布局 */
@media (max-width: 1440px) {
  /* 隐藏英文标签 */
  .label-en {
    display: none;
  }

  /* 隐藏副标题内容 */
  .subtitle-content {
    display: none;
  }

  /* 缩小 Logo 容器 */
  .pzh-logo-container {
    /* 宽度：34px */
    width: 34px;
    /* 高度：34px */
    height: 34px;
  }

  /* 调整竖线分隔符 */
  .v-gate {
    /* 外边距：0 4px */
    margin: 0 4px;
    /* 高度：28px */
    height: 28px;
  }

  /* 调整面板按钮 */
  .deck-btn {
    /* 最小宽度：60px */
    min-width: 60px;
  }

  /* 隐藏系统监控信息 */
  .system-monitor {
    display: none;
  }

  /* 隐藏秒数显示 */
  .time-seconds {
    display: none;
  }

  /* 隐藏进度刻度 */
  .progress-ticks {
    display: none;
  }

  /* 隐藏进度粒子 */
  .progress-particles {
    display: none;
  }

  /* 隐藏 Logo 轨道环 */
  .logo-orbit-ring {
    display: none;
  }

  /* 隐藏品牌环境光 */
  .brand-ambient-glow {
    display: none;
  }

  /* 隐藏 Logo 脉冲环 */
  .logo-pulse-ring {
    display: none;
  }

  /* 隐藏 Logo 角落光 */
  .logo-corner-glow {
    display: none;
  }

  /* 隐藏时间进度条 */
  .time-progress {
    display: none;
  }

  /* 调整日期行 */
  .date-row {
    /* 字号：11px */
    font-size: 11px;
    /* 间距：4px */
    gap: 4px;
  }

  /* 调整数字时钟 */
  .digital-clock {
    /* 字号：20px */
    font-size: 20px;
  }

  /* 调整用户资料卡 */
  .user-profile-card {
    /* 内边距：8px */
    padding: 8px 8px;
    /* 间距：6px */
    gap: 6px;
  }

  /* 调整用户头像 */
  .u-avatar {
    /* 宽度：22px */
    width: 22px;
    /* 高度：22px */
    height: 22px;
  }

  /* 调整按钮图标 */
  .btn-icon {
    /* 字号：14px */
    font-size: 14px;
  }

  .pzh-subtitle {
    margin-top: 1px;
  }

  .accent-line {
    display: none;
  }
}

@media (max-width: 1100px) {
  .ops-nav {
    display: none;
  }
}

:global(.pzh-digital-twin-about-dialog.el-dialog),
:global(.pzh-digital-twin-about-dialog .el-dialog) {
  background:
      radial-gradient(circle at 18% 18%, rgb(0 212 255 / 0.07), transparent 30%),
      radial-gradient(circle at 82% 78%, rgba(0, 255, 136, 0.14), transparent 34%),
      linear-gradient(135deg, rgb(4 19 33 / 0.02), rgb(3 32 42 / 0.21));
  border: 1px solid rgba(0, 212, 255, 0.38);
  border-radius: 20px;
  box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.58),
      0 0 42px rgba(0, 212, 255, 0.28),
      inset 0 0 52px rgba(0, 255, 136, 0.07);
  overflow: hidden;
  backdrop-filter: blur(14px);
}

:global(.pzh-digital-twin-about-dialog.el-dialog::before),
:global(.pzh-digital-twin-about-dialog .el-dialog::before) {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
      linear-gradient(90deg, transparent 0, rgba(0, 212, 255, 0.09) 50%, transparent 100%),
      repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px);
  opacity: 0.55;
}

:global(.pzh-digital-twin-about-dialog .el-dialog__header) {
  position: relative;
  margin: 0;
  padding: 20px 28px 16px;
  border-bottom: 1px solid rgba(0, 212, 255, 0.22);
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.10), transparent 68%);
}

/* ========== 关于系统对话框样式 ========== */
/* 对话框标题样式 */
:global(.pzh-digital-twin-about-dialog .el-dialog__title) {
  /* 文字颜色：浅青色 */
  color: #b9f4ff;
  /* 字号：22px，大标题 */
  font-size: 22px;
  /* 字重：700，加粗 */
  font-weight: 700;
  /* 字间距：0.18em，增加科技感 */
  letter-spacing: 0.18em;
  /* 文字阴影：14px 青色发光，营造霓虹灯效果 */
  text-shadow: 0 0 14px rgba(0, 212, 255, 0.65);
}

/* 对话框关闭按钮 */
:global(.pzh-digital-twin-about-dialog .el-dialog__headerbtn .el-dialog__close) {
  /* 文字颜色：浅青色 */
  color: #7ee7ff;
  /* 过渡动画：0.2s */
  transition: color 0.2s ease, transform 0.2s ease;
}

/* 对话框关闭按钮悬停状态 */
:global(.pzh-digital-twin-about-dialog .el-dialog__headerbtn:hover .el-dialog__close) {
  /* 文字颜色：白色 */
  color: #ffffff;
  /* 旋转：90 度 */
  transform: rotate(90deg);
}

/* 对话框主体 */
:global(.pzh-digital-twin-about-dialog .el-dialog__body) {
  /* 相对定位 */
  position: relative;
  /* 内边距：0 */
  padding: 0;
  /* 文字颜色：浅青色 */
  color: #dffaff;
}

/* 关于容器 */
:global(.pzh-digital-twin-about-dialog .about-container) {
  /* 背景：透明 */
  background: transparent !important;
}

/* 关于内容包装器 */
:global(.pzh-digital-twin-about-dialog .about-content-wrapper) {
  /* 内边距：26px 30px 30px */
  padding: 26px 30px 30px;
}

/* 关于卡片 */
:global(.pzh-digital-twin-about-dialog .about-card) {
  /* 背景：深蓝色半透明 */
  background: rgba(3, 20, 35, 0.42) !important;
  /* 边框：青色，1px */
  border: 1px solid rgba(0, 212, 255, 0.24) !important;
  /* 圆角：18px */
  border-radius: 18px;
  /* 双层阴影：内层青色微光 + 外层绿色微光 */
  box-shadow:
      inset 0 0 24px rgba(0, 212, 255, 0.08),
      0 0 18px rgba(0, 255, 136, 0.08);
}

/* 卡片内容 */
:global(.pzh-digital-twin-about-dialog .about-card .el-card__body) {
  /* 内边距：0 */
  padding: 0;
}

/* 关于内容 */
:global(.pzh-digital-twin-about-dialog .about-content) {
  /* 间距：38px */
  gap: 38px;
  /* 内边距：28px 32px 30px */
  padding: 28px 32px 30px;
}

/* Logo 卡片 */
:global(.pzh-digital-twin-about-dialog .logo-card) {
  /* 背景：青色和绿色渐变 */
  background:
      linear-gradient(145deg, rgba(0, 212, 255, 0.14), rgba(0, 255, 136, 0.06)) !important;
  /* 边框：青色，1px */
  border: 1px solid rgba(0, 212, 255, 0.35) !important;
  /* 双层阴影：内层青色微光 + 外层青色发光 */
  box-shadow:
      inset 0 0 28px rgba(0, 212, 255, 0.10),
      0 0 22px rgba(0, 212, 255, 0.12);
  /* 宽度：300px */
  width: 300px;
  /* 最小高度：430px */
  min-height: 430px;
  /* 弹性布局：居中 */
  justify-content: center;
}

/* Logo 图标 */
:global(.pzh-digital-twin-about-dialog .logo-icon) {
  /* 圆角：50%，圆形 */
  border-radius: 50%;
  /* 背景：径向渐变，青色到透明 */
  background: radial-gradient(circle, rgba(0, 212, 255, 0.18), transparent 68%);
  /* 滤镜：18px 青色投影 */
  filter: drop-shadow(0 0 18px rgba(0, 212, 255, 0.45));
}

/* 系统名称和分区标题 */
:global(.pzh-digital-twin-about-dialog .sys-name),
:global(.pzh-digital-twin-about-dialog .section-title) {
  /* 文字颜色：浅青色 */
  color: #dffaff;
  /* 文字阴影：12px 青色发光 */
  text-shadow: 0 0 12px rgba(0, 212, 255, 0.35);
}

/* 系统名称 */
:global(.pzh-digital-twin-about-dialog .sys-name) {
  /* 字号：19px */
  font-size: 19px;
  /* 字间距：0.04em */
  letter-spacing: 0.04em;
}

:global(.pzh-digital-twin-about-dialog .version),
:global(.pzh-digital-twin-about-dialog .build-date),
:global(.pzh-digital-twin-about-dialog .copyright),
:global(.pzh-digital-twin-about-dialog .info-label) {
  color: rgba(185, 244, 255, 0.72);
}

:global(.pzh-digital-twin-about-dialog .info-section) {
  padding-top: 4px;
}

:global(.pzh-digital-twin-about-dialog .section-title) {
  margin-bottom: 14px;
  font-size: 16px;
}

:global(.pzh-digital-twin-about-dialog .info-list) {
  gap: 12px;
}

:global(.pzh-digital-twin-about-dialog .info-row) {
  display: grid;
  grid-template-columns: 98px minmax(0, 1fr);
  align-items: start;
  column-gap: 12px;
  line-height: 1.65;
  font-size: 14px;
}

:global(.pzh-digital-twin-about-dialog .info-label) {
  min-width: 0;
}

:global(.pzh-digital-twin-about-dialog .info-value) {
  color: #ffffff;
  font-weight: 600;
  word-break: normal;
  overflow-wrap: anywhere;
}

:global(.pzh-digital-twin-about-dialog .divider-vertical) {
  background: linear-gradient(180deg, transparent, rgba(0, 212, 255, 0.45), rgba(0, 255, 136, 0.28), transparent);
}

:global(.pzh-digital-twin-about-dialog .section-title::before) {
  background: linear-gradient(180deg, #00d4ff, #00ff88);
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
}

@keyframes aboutCardRotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  :global(.pzh-digital-twin-about-dialog.el-dialog),
  :global(.pzh-digital-twin-about-dialog .el-dialog) {
    width: calc(100vw - 32px) !important;
  }

  :global(.pzh-digital-twin-about-dialog .about-content) {
    flex-direction: column;
  }

  :global(.pzh-digital-twin-about-dialog .logo-card) {
    width: auto;
    min-height: 260px;
  }

  :global(.pzh-digital-twin-about-dialog .divider-vertical) {
    width: 100%;
    height: 1px;
  }
}
 
</style>