/**
 * 面板显示状态全局存储器
 *
 * 管理首页大屏上四个信息面板（今日值班/统计信息/检修状态/交路车组）的显隐状态
 * 采用模块级单例模式（非 Pinia），所有调用处共享同一个 panelVisibility 对象
 */
import { ref } from 'vue'

// ========== 全局单例状态 ==========
// 各面板的显隐状态，key 为面板 ID
// - org:    值班今日值班面板
// - stat:   统计信息面板
// - status: 检修状态面板
// - route:  交路车组面板
const panelVisibility = ref({
  org: true,    // 今日值班面板默认显示
  stat: true,   // 统计信息面板默认显示
  status: true, // 检修状态面板默认显示
  route: true,  // 交路车组面板默认显示
})

/**
 * 面板存储器 composable
 * 返回面板显隐状态和操作方法
 * 用法：
 *   const { panelVisibility, togglePanel, closePanel, openPanel } = usePanelStore()
 */
export function usePanelStore() {
  /**
   * 切换面板显隐状态（显示 → 隐藏 / 隐藏 → 显示）
   * @param {string} panelId - 面板 ID（org/stat/status/route）
   */
  const togglePanel = (panelId) => {
    panelVisibility.value[panelId] = !panelVisibility.value[panelId]
  }

  /**
   * 查询面板是否当前可见
   * @param {string} panelId - 面板 ID
   * @returns {boolean}
   */
  const isPanelVisible = (panelId) => {
    return panelVisibility.value[panelId]
  }

  /**
   * 关闭面板（设为不可见）
   * @param {string} panelId - 面板 ID
   */
  const closePanel = (panelId) => {
    panelVisibility.value[panelId] = false
  }

  /**
   * 打开面板（设为可见）
   * @param {string} panelId - 面板 ID
   */
  const openPanel = (panelId) => {
    panelVisibility.value[panelId] = true
  }

  return {
    panelVisibility, // 响应式面板显隐状态对象
    togglePanel,     // 切换显隐状态
    isPanelVisible,  // 查询是否可见
    closePanel,      // 关闭面板
    openPanel,       // 打开面板
  }
}