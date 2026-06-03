/**
 * 拖拽时边缘自动滚动 composable
 * 当拖拽元素靠近可滚动容器的上/下边缘时，自动触发滚动
 * 用法：
 *   const { onDragOverScroll } = useDragAutoScroll()
 *   在可滚动容器上绑定 @dragover="onDragOverScroll($event, scrollContainerRef)"
 */
import { ref, onBeforeUnmount } from 'vue'

export function useDragAutoScroll(options = {}) {
  const {
    edgeSize = 60,      // 触发自动滚动的边缘区域大小(px)
    speed = 8,          // 每帧滚动速度(px)
    maxSpeed = 24,      // 最大滚动速度(px)
  } = options

  // ---- 内部状态 ----
  let animationId = null        // requestAnimationFrame ID
  let currentContainer = null   // 当前正在滞动的容器元素
  let currentDirection = 0      // 滞动方向：-1 向上 / 1 向下 / 0 停止
  let currentSpeed = 0          // 当前帧滞动速度（px/帧）

  /**
   * 确保滞动动画已启动（如已启动则不重复开始）
   */
  const ensureAutoScroll = () => {
    if (animationId || !currentContainer || !currentDirection || !currentSpeed) return

    const scroll = () => {
      // 滞动条件不满足时停止动画
      if (!currentContainer || !currentDirection || !currentSpeed) {
        animationId = null
        return
      }

      if (currentDirection < 0) {
        // 向上滞动：限制最小不能小于 0
        currentContainer.scrollTop = Math.max(0, currentContainer.scrollTop - currentSpeed)
        // 到顶后停止
        if (currentContainer.scrollTop <= 0) {
          animationId = null
          return
        }
      } else {
        // 向下滞动：限制最大不能超过滞动层上限
        const maxScrollTop = currentContainer.scrollHeight - currentContainer.clientHeight
        currentContainer.scrollTop = Math.min(maxScrollTop, currentContainer.scrollTop + currentSpeed)
        // 到底后停止
        if (currentContainer.scrollTop >= maxScrollTop) {
          animationId = null
          return
        }
      }

      animationId = requestAnimationFrame(scroll)
    }

    animationId = requestAnimationFrame(scroll)
  }

  /** 停止自动滚动 */
  const stopAutoScroll = () => {
    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
    currentContainer = null
    currentDirection = 0
    currentSpeed = 0
  }

  /**
   * 绑定到可滚动容器的 dragover 事件
   * @param {DragEvent} e - dragover 事件
   * @param {HTMLElement|Ref<HTMLElement>} containerElOrRef - 滚动容器元素或 ref
   */
  const onDragOverScroll = (e, containerElOrRef) => {
    // 兼容元素引用的三种形式：组件实例 ($el)、Vue ref (.value)、原始 DOM 元素
    const container = containerElOrRef?.$el || containerElOrRef?.value || containerElOrRef
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mouseY = e.clientY

    // 计算鼠标当前位置到容器上、下边缘的垂直距离
    const distTop = mouseY - rect.top
    const distBottom = rect.bottom - mouseY

    if (distTop < edgeSize && container.scrollTop > 0) {
      // 鼠标在上边缘区域内，且容器还有向上滞动空间
      const ratio = 1 - distTop / edgeSize // 越靠近上边缘比例越高，速度越快
      currentContainer = container
      currentDirection = -1
      currentSpeed = Math.min(maxSpeed, speed + ratio * (maxSpeed - speed))
      ensureAutoScroll()
    } else if (distBottom < edgeSize) {
      // 鼠标在下边缘区域内
      const maxScrollTop = container.scrollHeight - container.clientHeight
      if (container.scrollTop < maxScrollTop) {
        // 容器还有向下滞动空间，启动向下滞动
        const ratio = 1 - distBottom / edgeSize
        currentContainer = container
        currentDirection = 1
        currentSpeed = Math.min(maxSpeed, speed + ratio * (maxSpeed - speed))
        ensureAutoScroll()
      } else {
        // 已滚动到底部，停止滞动
        stopAutoScroll()
      }
    } else {
      // 鼠标不在边缘区域，停止滞动
      stopAutoScroll()
    }
  }

  onBeforeUnmount(() => stopAutoScroll())

  return { onDragOverScroll, stopAutoScroll }
}
