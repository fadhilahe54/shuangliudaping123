<!--
  SearchBar.vue — 大屏首页车厢搜索栏

  支持按车号、车型、车次搜索车厢：
    - 搜索命中后 3D 场景自动飞行到对应车厢并高亮
    - 搜索结果通过 toast 提示用户
    - 搜索框有获焦/失焦动画效果

  使用方：UIOverlay.vue
-->
<script setup>
import { computed, ref, nextTick, onBeforeUnmount } from 'vue'
// 列车数据 Store，提供搜索和清除搜索方法
import { useTrainStore } from '../stores/trainStore.js'

// 获取列车数据 Store 实例，用于搜索和清除搜索状态
const store = useTrainStore()

// 搜索结果卡片状态：null = 不显示；否则为 { type:'success'|'error', message, description }
const resultCard = ref(null)
// 卡片定位样式（fixed 定位，动态跟随搜索框位置）
const cardStyle = ref({ top: '0px', left: '0px', width: '0px' })
// 搜索表单的 ref，用于计算卡片位置
const formRef = ref(null)
// 自动隐藏定时器句柄
let _hideTimer = null
// 卡片自动隐藏时长（毫秒）
const RESULT_CARD_TIMEOUT = 4000

// 卡片固定宽度（以项目顶部大标题为准、屏幕水平居中）
const CARD_WIDTH = 380

/**
 * 计算并更新卡片位置：项目顶部大标题（.title-stack）正下方、屏幕水平居中
 * 使用 fixed + Teleport to="body" 突破侧边面板的 z-index 遮挡
 */
function updateCardPosition() {
  // 在 body 中定位顶部大标题元素
  const titleEl = document.querySelector('.title-stack')
  let topPx
  if (titleEl) {
    const rect = titleEl.getBoundingClientRect()
    topPx = rect.bottom + 12  // 标题下方 12px 间距
  } else {
    // 其他路径渲染不存在标题时的兜底：顶部 90px
    topPx = 90
  }
  // 水平居中：以视口为准取中
  const leftPx = (window.innerWidth - CARD_WIDTH) / 2
  cardStyle.value = {
    top: `${topPx}px`,
    left: `${leftPx}px`,
    width: `${CARD_WIDTH}px`,
  }
}

// 窗口滚动/变化时同步位置
function _onWindowChange() {
  if (resultCard.value) updateCardPosition()
}
window.addEventListener('resize', _onWindowChange)
window.addEventListener('scroll', _onWindowChange, true)
onBeforeUnmount(() => {
  window.removeEventListener('resize', _onWindowChange)
  window.removeEventListener('scroll', _onWindowChange, true)
  if (_hideTimer) clearTimeout(_hideTimer)
})

/**
 * 显示搜索结果卡片，并在 RESULT_CARD_TIMEOUT 后自动关闭
 * @param {{type:string, message:string, description?:string}} payload
 */
function showResultCard(payload) {
  resultCard.value = payload
  // 下一帧等模板渲染完再计算位置
  nextTick(() => updateCardPosition())
  if (_hideTimer) clearTimeout(_hideTimer)
  _hideTimer = setTimeout(() => { resultCard.value = null }, RESULT_CARD_TIMEOUT)
}

/**
 * 手动关闭搜索结果卡片
 */
function closeResultCard() {
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
  resultCard.value = null
}

// 搜索输入框绑定值，用户输入的搜索关键字（车号/车型/车次）
const searchQuery = computed({
  get: () => store.searchQuery,
  set: (value) => {
    store.searchQuery = value
  },
})

// 输入框是否处于聚焦状态，用于切换边框颜色和阴影效果
const isFocused = ref(false)

/**
 * 执行搜索操作
 * 调用 store.searchTrain 匹配车厢，根据结果类型弹出对应的 toast 提示
 * 若搜索框为空则清除应用中现有的匹配状态和高亮
 * 
 * @function handleSearch
 * @returns {void}
 */
async function handleSearch() {
  // 检查输入框是否为空或仅包含空白字符
  if (!searchQuery.value.trim()) {
    // 输入为空，清除高亮状态和搜索结果
    store.clearSearch()
    return
  }

  // 调用 Store 中的搜索方法（异步：在库未命中时会回退到后端全量搜索）
  // 返回搜索结果对象（包含 type、message、description）
  const result = await store.searchTrain(searchQuery.value)

  // 若搜索失败（无匹配结果），直接返回
  if (!result) return

  // 根据搜索结果类型展示卡片提示（在搜索框下方浮出）
  showResultCard({
    type: result.type === 'success' ? 'success' : 'error',
    message: result.message,
    description: result.description,
  })
}

/**
 * 清除搜索状态
 * 重置输入框内容，并清除 Store 中的高亮/搜索匹配状态
 * 
 * @function clearSearch
 * @returns {void}
 */
function clearSearch() {
  // 清空输入框的搜索关键字
  searchQuery.value = ''

  // 调用 Store 方法清除 3D 场景中的高亮和搜索匹配状态
  store.clearSearch()

  // 同步关闭结果卡片
  closeResultCard()
}
</script>

<template>
  <div class="search-bar-root pointer-events-auto">
    <form ref="formRef" @submit.prevent="handleSearch"
      class="flex items-center hud-search-bar"
      :class="{ 'is-focused': isFocused }">
      <el-icon class="search-icon" :size="20"><Search /></el-icon>
      <input
        type="text"
        placeholder="搜索车号/车型/车次"
        v-model="searchQuery"
        @focus="isFocused = true"
        @blur="isFocused = false"
        class="search-input"
      />
      <button
        v-if="searchQuery"
        type="button"
        @click="clearSearch"
        class="clear-btn">
        <el-icon :size="14"><Close /></el-icon>
      </button>
    </form>

    <!-- 搜索结果卡片：使用 Teleport 传送到 body，避免被侧边面板的 z-index 遮挡 -->
    <Teleport to="body">
      <transition name="dt-card">
        <div
          v-if="resultCard"
          class="search-result-card"
          :class="`is-${resultCard.type}`"
          :style="cardStyle">
          <!-- 背景装饰层：扫描线 + 网格 -->
          <div class="dt-grid"></div>
          <div class="dt-scanline"></div>

          <!-- 四角装饰 -->
          <span class="corner corner-tl"></span>
          <span class="corner corner-tr"></span>
          <span class="corner corner-bl"></span>
          <span class="corner corner-br"></span>

          <!-- 主体内容 -->
          <div class="card-content">
            <div class="card-icon-frame">
              <div class="hex-pulse"></div>
              <el-icon class="card-icon" :size="20">
                <CircleCheck v-if="resultCard.type === 'success'" />
                <CircleClose v-else />
              </el-icon>
            </div>
            <div class="card-body">
              <div class="card-tag">
                <span class="tag-dot"></span>
                <span class="tag-text">{{ resultCard.type === 'success' ? 'TARGET LOCKED' : 'NO MATCH' }}</span>
              </div>
              <div class="card-title">{{ resultCard.message }}</div>
              <div v-if="resultCard.description" class="card-desc">{{ resultCard.description }}</div>
            </div>
            <button type="button" class="card-close" @click="closeResultCard">
              <el-icon :size="12"><Close /></el-icon>
            </button>
          </div>

          <!-- 倒计时进度条 -->
          <div class="card-progress"></div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ========== HUD 搜索栏整体容器 ========== */
/* 半透明玻璃态背景 + 青色科技描边，适配大屏暗色 3D 场景 */
.hud-search-bar {
  /* 使用 flex 布局，子元素（图标、输入框、清空按钮）水平排列 */
  display: flex;
  /* 子元素垂直居中对齐 */
  align-items: center;
  /* 背景：极低透明度白色，营造玻璃拟态效果 */
  background: rgba(255, 255, 255, 0.05);
  /* 上下左右边框：青色科技感描边，下边框稍亮以增强立体感 */
  border: 2px solid rgba(34, 211, 238, 0.2);
  border-bottom: 2px solid rgba(34, 211, 238, 0.3);
  /* 圆角：6px 使搜索框显得柔和 */
  border-radius: 6px;
  /* 内边距：左右随宽度自适应（10-18px） */
  padding: 0 clamp(10px, 0.9vw, 18px);
  /* 高度：随视口自适应（38-55px），与顶部工具栏视觉协调 */
  height: clamp(38px, 4.2vh, 55px);
  /* 过渡动画：所有属性变化时平滑过渡，时长 0.3s */
  transition: all 0.3s ease;
  /* 子元素间距：随宽度自适应（4-8px） */
  gap: clamp(4px, 0.5vw, 8px);
  /* 宽度自适应填充父容器；最小宽度 100px 保证可见 */
  width: 100%;
  min-width: 100px;
  box-sizing: border-box;
  /* 毛玻璃效果：模糊背景 4px，增强浮层感 */
  backdrop-filter: blur(4px)
}

/* 鼠标悬停时提高背景和描边亮度，提示搜索框可交互 */
.hud-search-bar:hover {
  /* 背景亮度提升：从 0.05 增加到 0.08，让用户感知到交互性 */
  background: rgba(34, 211, 238, 0.08);
  /* 边框颜色加深：从 0.2 增加到 0.4，强调可点击状态 */
  border-color: rgba(34, 211, 238, 0.4);
}

/* 输入框聚焦状态：增加青色外发光，强调当前输入焦点 */
.hud-search-bar.is-focused {
  /* 背景进一步亮化：0.1 透明度，表示当前处于活跃状态 */
  background: rgba(34, 211, 238, 0.1);
  /* 边框颜色变为纯青色：#22d3ee，完全激活状态 */
  border-color: #22d3ee;
  /* 双层阴影：外层 20px 青色发光 + 内层 10px 内凹效果，营造立体感 */
  box-shadow: 0 0 20px rgba(34, 211, 238, 0.2), 
              inset 0 0 10px rgba(34, 211, 238, 0.05);
}

/* 左侧搜索图标：默认弱化显示，避免抢占输入内容视觉焦点 */
.search-icon {
  /* 图标颜色：低透明度青色，表示非活跃状态 */
  color: rgba(34, 211, 238, 0.6);
  /* 过渡动画：颜色变化时平滑过渡 */
  transition: color 0.3s ease;
  /* 防止图标被压缩：flex-shrink: 0 保证图标大小固定 */
  flex-shrink: 0;
}

/* 聚焦时图标同步高亮，形成完整的搜索激活反馈 */
.hud-search-bar.is-focused .search-icon {
  /* 图标颜色变为纯青色，与搜索框聚焦状态视觉统一 */
  color: #22d3ee;
}

/* 搜索输入框本体：透明背景，继承外层 HUD 容器的边框和背景 */
.search-input {
  /* 占据剩余空间：flex: 1 让输入框自动扩展填充可用宽度 */
  flex: 1;
  /* 背景透明：输入框内容直接显示在外层容器背景上 */
  background: transparent;
  /* 无边框：输入框本身不绘制边框，由外层容器提供 */
  border: none;
  /* 无轮廓：移除浏览器默认的聚焦轮廓 */
  outline: none;
  /* 文字颜色：白色，在深色背景上清晰可见 */
  color: #fff;
  /* 字号：随视口宽度自适应（11-14px），与大屏 HUD 整体字号协调 */
  font-size: clamp(11px, 1vw, 14px);
  /* 字重：500（中等），提升可读性 */
  font-weight: 500;
  /* 字间距：0.5px，增加科技感 */
  letter-spacing: 0.5px;
  /* 最小宽度：0，允许输入框在空间不足时收缩 */
  min-width: 0;
}

/* 占位提示文字使用低透明度，提示用途但不干扰正式输入内容 */
.search-input::placeholder {
  /* 占位符颜色：低透明度白色，表示非正式内容 */
  color: rgba(255, 255, 255, 0.4);
  /* 占位符字重：400（常规），与输入内容形成对比 */
  font-weight: 400;
}

/* 聚焦后进一步降低占位文字对比度，让用户输入内容更突出 */
.search-input:focus::placeholder {
  /* 聚焦时占位符透明度进一步降低：0.3，让输入内容更加突出 */
  color: rgba(255, 255, 255, 0.3);
}

/* 清空按钮：仅在有输入内容时出现，用于快速重置搜索条件 */
.clear-btn {
  /* 使用 flex 布局，图标居中显示 */
  display: flex;
  /* 垂直居中 */
  align-items: center;
  /* 水平居中 */
  justify-content: center;
  /* 背景透明：按钮本身不可见，仅显示图标 */
  background: transparent;
  /* 无边框：按钮不绘制边框 */
  border: none;
  /* 图标颜色：低透明度白色，表示可点击但非强调状态 */
  color: rgba(255, 255, 255, 0.4);
  /* 鼠标光标：pointer 表示可点击 */
  cursor: pointer;
  /* 内边距：4px，保证点击区域足够大 */
  padding: 4px;
  /* 圆角：4px，与搜索框风格协调 */
  border-radius: 4px;
  /* 过渡动画：所有属性变化时平滑过渡 */
  transition: all 0.2s ease;
  /* 防止按钮被压缩：flex-shrink: 0 保证按钮大小固定 */
  flex-shrink: 0;
}

/* 清空按钮悬停状态：增加浅色背景，提示点击可清空当前关键字 */
.clear-btn:hover {
  /* 图标颜色变为纯白：#fff，强调可交互状态 */
  color: #fff;
  /* 背景变为浅色：rgba(255, 255, 255, 0.1)，提示按钮被激活 */
  background: rgba(255, 255, 255, 0.1);
}

/* 根容器 relative，使 search bar 能被接下来的定位计算到 */
.search-bar-root {
  position: relative;
  width: 100%;
}
</style>

<!-- 卡片样式不能走 scoped（因为已 Teleport 到 body，scoped 属性选择器在外部不生效） -->
<style>
/* ========== 搜索结果数字孪生风格卡片（Teleport 到 body）========== */
.search-result-card {
  position: fixed;
  z-index: 9999;             /* 超过侧边面板的 z-index:2000 */
  pointer-events: auto;
  padding: 14px 14px 16px;
  padding-right: 36px;
  font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #e6f6ff;
  background:
    linear-gradient(135deg, rgba(4, 18, 32, 0.92) 0%, rgba(8, 30, 50, 0.88) 50%, rgba(4, 18, 32, 0.92) 100%);
  border: 1px solid rgba(34, 211, 238, 0.45);
  /* 切角多边形：右上 + 左下切角，营造 HUD 面板感 */
  clip-path: polygon(
    0 0,
    calc(100% - 14px) 0,
    100% 14px,
    100% 100%,
    14px 100%,
    0 calc(100% - 14px)
  );
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.55),
    0 0 24px rgba(34, 211, 238, 0.25),
    inset 0 0 28px rgba(34, 211, 238, 0.08);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

/* 背景点阵网格 */
.search-result-card .dt-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(34, 211, 238, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 211, 238, 0.08) 1px, transparent 1px);
  background-size: 16px 16px;
  mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%);
  pointer-events: none;
  opacity: 0.55;
}

/* 循环扫描线 */
.search-result-card .dt-scanline {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  top: 0;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.7), transparent);
  filter: blur(0.6px);
  animation: dt-scan 2.4s linear infinite;
  pointer-events: none;
}
@keyframes dt-scan {
  0%   { top: 0%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

/* 四角 L 形装饰 */
.search-result-card .corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #22d3ee;
  pointer-events: none;
  filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.65));
}
.search-result-card .corner-tl { top: 4px;    left: 4px;    border-right: none; border-bottom: none; }
.search-result-card .corner-tr { top: 4px;    right: 4px;   border-left:  none; border-bottom: none; }
.search-result-card .corner-bl { bottom: 4px; left: 4px;    border-right: none; border-top:    none; }
.search-result-card .corner-br { bottom: 4px; right: 4px;   border-left:  none; border-top:    none; }

/* 主体布局 */
.search-result-card .card-content {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  z-index: 1;
}

/* 六边形图标框 */
.search-result-card .card-icon-frame {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.18), rgba(34, 211, 238, 0.04));
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  border: 1px solid rgba(34, 211, 238, 0.5);
}
.search-result-card .hex-pulse {
  position: absolute;
  inset: -4px;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  border: 1px solid rgba(34, 211, 238, 0.6);
  animation: hex-pulse 1.8s ease-out infinite;
  pointer-events: none;
}
@keyframes hex-pulse {
  0%   { transform: scale(0.85); opacity: 0.9; }
  100% { transform: scale(1.35); opacity: 0;   }
}
.search-result-card .card-icon {
  color: #22d3ee;
  filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.8));
}

/* 主体文字 */
.search-result-card .card-body {
  flex: 1;
  min-width: 0;
}

/* 顶部状态标签 */
.search-result-card .card-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  margin-bottom: 6px;
  background: rgba(34, 211, 238, 0.12);
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 2px;
}
.search-result-card .tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 6px #22d3ee;
  animation: dot-blink 1.2s ease-in-out infinite;
}
@keyframes dot-blink {
  0%, 100% { opacity: 1;   }
  50%      { opacity: 0.3; }
}
.search-result-card .tag-text {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #67e8f9;
  font-family: 'Consolas', 'Monaco', monospace;
}

/* 主标题 */
.search-result-card .card-title {
  font-size: clamp(13px, 0.95vw, 15px);
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.45;
  color: #ffffff;
  word-break: break-all;
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.45);
}

/* 副描述 */
.search-result-card .card-desc {
  margin-top: 4px;
  font-size: clamp(10px, 0.8vw, 12px);
  font-weight: 400;
  line-height: 1.5;
  color: rgba(184, 220, 240, 0.78);
  word-break: break-all;
}

/* 关闭按钮 */
.search-result-card .card-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(34, 211, 238, 0.08);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 2px;
  color: rgba(178, 224, 240, 0.7);
  cursor: pointer;
  z-index: 2;
  transition: all 0.2s ease;
}
.search-result-card .card-close:hover {
  color: #ffffff;
  background: rgba(34, 211, 238, 0.2);
  border-color: #22d3ee;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
}

/* 底部进度条（倒计时） */
.search-result-card .card-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  transform-origin: left center;
  animation: card-progress-shrink 4s linear forwards;
  background: linear-gradient(90deg, #22d3ee, #67e8f9, #22d3ee);
  box-shadow: 0 0 6px rgba(34, 211, 238, 0.7);
  z-index: 2;
}
@keyframes card-progress-shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* ========== 失败状态：橙红色调 ========== */
.search-result-card.is-error {
  border-color: rgba(251, 146, 60, 0.5);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.55),
    0 0 24px rgba(251, 146, 60, 0.28),
    inset 0 0 28px rgba(251, 146, 60, 0.08);
}
.search-result-card.is-error .corner { border-color: #fb923c; filter: drop-shadow(0 0 4px rgba(251, 146, 60, 0.7)); }
.search-result-card.is-error .dt-grid {
  background-image:
    linear-gradient(rgba(251, 146, 60, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(251, 146, 60, 0.08) 1px, transparent 1px);
}
.search-result-card.is-error .dt-scanline {
  background: linear-gradient(90deg, transparent, rgba(251, 146, 60, 0.75), transparent);
}
.search-result-card.is-error .card-icon-frame {
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.2), rgba(251, 146, 60, 0.04));
  border-color: rgba(251, 146, 60, 0.55);
}
.search-result-card.is-error .hex-pulse { border-color: rgba(251, 146, 60, 0.65); }
.search-result-card.is-error .card-icon { color: #fb923c; filter: drop-shadow(0 0 6px rgba(251, 146, 60, 0.85)); }
.search-result-card.is-error .card-tag {
  background: rgba(251, 146, 60, 0.14);
  border-color: rgba(251, 146, 60, 0.4);
}
.search-result-card.is-error .tag-dot { background: #fb923c; box-shadow: 0 0 6px #fb923c; }
.search-result-card.is-error .tag-text { color: #fdba74; }
.search-result-card.is-error .card-title { text-shadow: 0 0 8px rgba(251, 146, 60, 0.5); }
.search-result-card.is-error .card-progress { background: linear-gradient(90deg, #fb923c, #fdba74, #fb923c); box-shadow: 0 0 6px rgba(251, 146, 60, 0.7); }
.search-result-card.is-error .card-close {
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.35);
}
.search-result-card.is-error .card-close:hover {
  background: rgba(251, 146, 60, 0.22);
  border-color: #fb923c;
  box-shadow: 0 0 8px rgba(251, 146, 60, 0.55);
}

/* 进入 / 离开动画 */
.dt-card-enter-active,
.dt-card-leave-active {
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease, filter 0.32s ease;
}
.dt-card-enter-from,
.dt-card-leave-to {
  transform: translateY(-10px) scale(0.96);
  opacity: 0;
  filter: blur(2px);
}
.dt-card-enter-to,
.dt-card-leave-from {
  transform: translateY(0) scale(1);
  opacity: 1;
  filter: blur(0);
}
</style>