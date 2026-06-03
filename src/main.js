/**
 * 应用程序入口文件
 * 负责创建 Vue 应用实例，注册全局插件、组件和样式，最终挂载到 #app 节点
 */

// Vue 核心：createApp 用于创建应用实例
import { createApp } from 'vue'
// Pinia 状态管理库
import { createPinia } from 'pinia'
// Element Plus UI 组件库
import ElementPlus from 'element-plus'
// Element Plus 默认样式
import 'element-plus/dist/index.css'
// Element Plus 图标库（全量导入，按需使用）
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// DataV 数据可视化组件库（用于大屏图表）
import DataVVue3 from '@kjgl77/datav-vue3'
// 前端路由
import router from './router'
// 根组件
import App from './App.vue'
// 全局基础样式
import './index.css'
// Element Plus 中文语言包
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
// Three.js 性能档位检测工具（根据设备性能自动选择渲染质量）
import { getThreePerformanceProfile } from './utils/performanceProfile.js'
import initTouchDraggable from './directives/touchDraggable.js'
// 触摸屏 HTML5 拖放兼容垫片：让 draggable/dragstart/dragover/drop 在触摸屏可用
// 用于后台车组编组等使用原生 HTML5 DnD 的页面
import { polyfill as enableTouchDnDPolyfill } from 'mobile-drag-drop'
import 'mobile-drag-drop/default.css'

// 仅在存在 ontouchstart（触摸屏）时启用，避免影响桌面端鼠标拖拽体验
if (typeof window !== 'undefined' && 'ontouchstart' in window) {
  enableTouchDnDPolyfill({
    // 长按手势，避免与页面滚动冲突
    holdToDrag: 300,
    // 允许在拖拽期间滚动（拖到边缘自动滚动）
    dragImageTranslateOverride: undefined,
  })
  // polyfill 需要 touchmove 不被 passive 模式默认 preventDefault 阻止
  window.addEventListener('touchmove', () => {}, { passive: false })
}

initTouchDraggable()

// ========== 画质档位初始化 ==========
// 在 Vue 应用启动前，根据检测到的设备性能档位给 <html> 根节点添加对应类名
// CSS 据此决定是否开启高开销视觉效果（如 backdrop-filter、filter:blur）
// 低/中档设备全部禁用模糊效果，避免大屏每帧执行软件渲染拖垮帧率
{
  const profile = getThreePerformanceProfile()
  const root = document.documentElement
  // 先清除所有旧档位类名，再添加当前档位
  root.classList.remove('quality-low', 'quality-medium', 'quality-high')
  root.classList.add(`quality-${profile.name}`)
}

// ========== 创建 Vue 应用实例 ==========
const app = createApp(App)

// 注册 Pinia 状态管理（用于跨组件共享状态，如面板显示状态、列车数据等）
app.use(createPinia())
// 注册前端路由（管理页面跳转：首页、后台管理、弹出面板等）
app.use(router)
// 注册 Element Plus，并指定中文语言包
app.use(ElementPlus, {
  locale: zhCn,
})
// 注册 DataV 大屏可视化组件库
app.use(DataVVue3)

// 全局注册 Element Plus 所有图标组件，可在任意模板中直接使用 <el-icon> 包裹图标名
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 将应用挂载到 index.html 中的 #app 节点
app.mount('#app')
