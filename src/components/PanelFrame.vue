<script setup>
/**
 * PanelFrame — 自适应科幻 SVG 边框组件
 * 替代 dv-border-box-13，在拖拽缩放时丝滑跟随尺寸变化
 *
 * Props:
 *   color       — [主色, 副色]，默认 ['#1a94bc','#2cf7fe']
 *   bgColor     — 填充背景色，默认 'transparent'
 *   showClose   — 是否显示关闭按钮，默认 false
 */
// Vue 响应式 API
import { ref, onMounted, onBeforeUnmount } from 'vue'
// 关闭按钮图标
import { Close } from '@element-plus/icons-vue'

const props = defineProps({
  // 主色/副色数组，保留字段（SVG 边框颜色，当前简化版本未使用）
  color: {
    type: Array,
    default: () => ['#1a94bc', '#2cf7fe'],
  },
  // 面板背景色（通过 v-bind CSS 变量注入）
  bgColor: {
    type: String,
    default: 'transparent',
  },
  // 是否显示右上角关闭按钮
  showClose: {
    type: Boolean,
    default: false,
  },
})

// close 事件：点击关闭按钮时触发，父组件监听后决定隐藏面板
const emit = defineEmits(['close'])

// 根元素 ref，用于 ResizeObserver 监听尺寸变化和初始尺寸获取
const root = ref(null)

// 当前宽度（响应式，供 SVG 边框跟随缩放，保留扩展能力）
const w = ref(300)

// 当前高度（响应式，供 SVG 边框跟随缩放，保留扩展能力）
const h = ref(200)

// ResizeObserver 实例，用于监听面板尺寸变化
let ro = null

/**
 * ResizeObserver 回调：同步面板尺寸到响应式变量
 * 使用 contentRect 而非 clientWidth/Height，避免触发同步强制 layout 导致性能问题
 * 
 * @param {ResizeObserverEntry[]} entries - ResizeObserver 返回的尺寸变化条目数组
 * @returns {void}
 */
function applyEntries(entries) {
  // 获取第一个条目的内容矩形（包含 width、height 等尺寸信息）
  const rect = entries?.[0]?.contentRect
  
  // 若无有效矩形数据，直接返回
  if (!rect) return
  
  // 更新响应式宽度变量，供 SVG 边框或其他逻辑使用
  w.value = rect.width
  
  // 更新响应式高度变量，供 SVG 边框或其他逻辑使用
  h.value = rect.height
}

/**
 * 组件挂载生命周期钩子
 * 初始化 ResizeObserver，监听面板尺寸变化
 */
onMounted(() => {
  // 检查根元素是否成功挂载
  if (!root.value) return
  
  // 首次用 getBoundingClientRect 立即取值，避免初始渲染空白闪烁
  const rect = root.value.getBoundingClientRect()
  
  // 设置初始宽度
  w.value = rect.width
  
  // 设置初始高度
  h.value = rect.height
  
  // 创建 ResizeObserver 实例，监听后续尺寸变化（性能更好）
  ro = new ResizeObserver(applyEntries)
  
  // 开始观察根元素的尺寸变化
  ro.observe(root.value)
})

/**
 * 组件卸载前生命周期钩子
 * 清理 ResizeObserver，防止内存泄漏
 */
onBeforeUnmount(() => {
  // 断开 ResizeObserver 的观察，释放资源
  ro?.disconnect()
})

/**
 * 点击关闭按钮的处理函数
 * 向父组件发送 close 事件，由父组件决定是否隐藏面板
 * 
 * @function handleClose
 * @returns {void}
 */
function handleClose() {
  // 触发 close 事件，父组件通过 @close 监听
  emit('close')
}
</script>

<template>
  <div ref="root" class="panel-frame">
    <div class="panel-frame-inner"></div>
    <button v-if="showClose" class="panel-close-btn" @click="handleClose">
      <el-icon :size="14"><Close /></el-icon>
    </button>
    <div class="panel-frame-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* ========== 科技面板外层容器 ========== */
.panel-frame {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: v-bind("props.bgColor");
}

/* ========== 内层边框层 ========== */
.panel-frame-inner {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  pointer-events: none;
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
  border: 1px solid rgba(34, 211, 238, 0.08);
  box-shadow: inset 0 0 20px rgba(2, 6, 23, 0.5);
}

.panel-frame:hover .panel-frame-inner {
  border-color: rgba(34, 211, 238, 0.15);
  box-shadow:
    inset 0 0 20px rgba(2, 6, 23, 0.5),
    0 0 15px rgba(34, 211, 238, 0.05);
}

/* ========== 默认插槽内容层 ========== */
/* 保持在边框层之上，承载调用方传入的业务面板内容 */
.panel-frame-content {
  /* 相对定位：作为内部内容的定位上下文 */
  position: relative;
  /* 宽度：100% 撑满面板 */
  width: 100%;
  /* 高度：100% 撑满面板 */
  height: 100%;
  /* 溢出隐藏：防止内容超出面板边界 */
  overflow: hidden;
  /* 圆角：12px，与外层保持视觉一致 */
  border-radius: 12px;
}

/* ========== 关闭按钮 ========== */
/* 固定在右上角，半透明暗色底避免遮挡 HUD 内容，同时保持可见性 */
.panel-close-btn {
  /* 绝对定位：相对于 .panel-frame 定位 */
  position: absolute;
  /* 距顶部：15px，留出适当间距 */
  top: 15px;
  /* 距右侧：8px，贴近右边界 */
  right: 8px;
  /* 宽度：24px，小方形按钮 */
  width: 24px;
  /* 高度：24px，小方形按钮 */
  height: 24px;
  /* 使用 flex 布局，图标居中 */
  display: flex;
  /* 垂直居中 */
  align-items: center;
  /* 水平居中 */
  justify-content: center;
  /* 背景：半透明黑色，50% 透明度 */
  background: rgba(0, 0, 0, 0.5);
  /* 边框：1px 灰色，25% 透明度 */
  border: 1px solid rgba(148, 163, 184, 0.25);
  /* 圆角：8px，使按钮显得柔和 */
  border-radius: 8px;
  /* 图标颜色：低透明度白色，70% 不透明 */
  color: rgba(255, 255, 255, 0.7);
  /* 鼠标光标：pointer 表示可点击 */
  cursor: pointer;
  /* 层级：z-index: 10 确保按钮显示在内容之上 */
  z-index: 10;
  /* 过渡动画：所有属性变化时平滑过渡，时长 0.2s */
  transition: all 0.2s ease;
}

/* 关闭按钮悬停时使用红色危险态，提示点击后将关闭当前浮层 */
.panel-close-btn:hover {
  /* 背景：红色半透明，30% 不透明，表示危险操作 */
  background: rgba(239, 68, 68, 0.3);
  /* 边框：红色，50% 不透明，强调激活状态 */
  border-color: rgba(239, 68, 68, 0.5);
  /* 图标颜色：纯白色，完全不透明，提升可见性 */
  color: #fff;
  /* 缩放：1.05 倍，轻微放大，增强交互反馈 */
  transform: scale(1.05);
}
</style>
