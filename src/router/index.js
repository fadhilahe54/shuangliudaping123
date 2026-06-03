/**
 * 前端路由配置
 * 管理整个应用的页面跳转，包括首页大屏、后台管理和面板弹出页
 */
// Vue Router 核心 API
import { createRouter, createWebHistory } from 'vue-router'
// 匿名访问日志接口（不需登录即可记录日志）
import {anonymousSaveLog} from "@/api/log.js";

// ========== 路由表配置 ==========
const routes = [
  {
    // 首页大屏：3D 数字孪生场景 + 调度信息面板
    path: '/',
    name: 'Home',
    // 路由懒加载，减小首屏加载体积
    component: () => import('../views/HomeView.vue'),
    meta: { title: '双流运用车间孪生平台' },
  },
  {
    // 后台管理页：车组、股道、交路、值班信息等数据管理
    path: '/admin',
    name: 'Admin',
    component: () => import('../views/AdminView.vue'),
    meta: { title: '后台管理 - 双流运用车间孪生平台' },
  },
  {
    // 面板弹出页：支持将任意面板弹出为独立窗口显示，:id 对应面板标识（org/stat/status/route）
    path: '/panel/:id',
    name: 'PanelPopup',
    component: () => import('../views/PanelPopupView.vue'),
    meta: { title: '面板 - 双流运用车间孪生平台' },
  },
]

// ========== 创建路由实例 ==========
const router = createRouter({
  // 使用 HTML5 History 模式（URL 中不包含 #）
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// ========== 全局前置路由守卫 ==========
// 每次路由跳转前执行，用于：1.设置页面标题  2.记录访问日志
router.beforeEach((to, from, next) => {
  // 根据目标路由的 meta.title 动态设置浏览器标签页标题
  document.title = to.meta.title || '铁路3D大屏'

  // 访问首页时异步写入访问日志（不阻塞导航，错误不影响页面加载）
  if (to.path === '/') {
    anonymousSaveLog('访问', '访客', '访问', '访客访问了首页')
        .catch(error => console.error('首页访问日志保存失败:', error))
  }

  // 放行导航
  next()
})

export default router
