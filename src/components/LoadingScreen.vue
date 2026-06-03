<!--
  LoadingScreen.vue — 科技感等待/加载页面

  设计参考：蓝色赛博朋克风城市 + 六边形 HUD + 旋转光环平台
  视觉元素：
    - 多层旋转光环（不同方向/速度）
    - 中心六边形 logo 脉冲发光
    - 扫描光线 + 网格底盘
    - 漂浮粒子 + 数据流文字
    - 主标题打字机 + 渐显副标题
    - 加载进度条 + 百分比

  使用方式：
    <LoadingScreen v-if="loading" :progress="loadProgress" title="尖端技术 引领未来" />
-->
<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  // 主标题
  title: { type: String, default: '成都车辆段孪生平台' },
  // 副标题（英文）
  subtitle: { type: String, default: 'ChengDu CheLiangDuan Digital Twin Platform' },
  // 加载进度 0-100；不传则显示循环动画
  progress: { type: Number, default: null },
  // 状态文字
  status: { type: String, default: '正在加载场景资源' },
})

// 内部模拟的循环进度（当外部未传 progress 时使用）
const innerProgress = ref(0)
let timer = null

onMounted(() => {
  if (props.progress === null) {
    // 缓动到 90% 模拟真实加载（最后 10% 等真正完成后由外部接管）
    timer = setInterval(() => {
      if (innerProgress.value < 90) {
        innerProgress.value += (90 - innerProgress.value) * 0.04 + 0.2
      }
    }, 80)
  }
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const displayProgress = computed(() => {
  const v = props.progress !== null ? props.progress : innerProgress.value
  return Math.max(0, Math.min(100, v))
})
const progressText = computed(() => Math.floor(displayProgress.value).toString().padStart(2, '0'))

// 数据流文字（科技感装饰）
const dataLines = [
  '> 成都车辆段孪生平台加载中..... ',
  '> 系统启动...... OK',
  '> 加载模型 [股道、车组、建筑]......OK',
  '> 初始化 WEBGL 上下文......OK',
  '> 获取数据......OK',
  '> 合成场景.......',
]

// 二进制代码雨（左右两侧装饰列）
const codeChars = '成都车辆段·信息攻关中心'.split('')
const buildRainColumn = (count = 40) => Array.from({ length: count }, () =>
  codeChars[Math.floor(Math.random() * codeChars.length)]
).join('\n')
const rainColumns = Array.from({ length: 8 }, () => ({
  text: buildRainColumn(40 + Math.floor(Math.random() * 30)),
  duration: 8 + Math.random() * 10,
  delay: -Math.random() * 10,
  opacity: 0.25 + Math.random() * 0.45,
}))
</script>

<template>
  <div class="loading-screen">
    <!-- 蜂巢六边形背景纹理 -->
    <div class="bg-honeycomb"></div>

    <!-- 背景层：星空 + 网格 + 城市轮廓 -->
    <div class="bg-stars"></div>
    <div class="bg-grid"></div>
    <div class="bg-city"></div>

    <!-- 赛博列车（高速穿梭动画） -->
    <div class="cyber-train-wrapper">
      <div class="cyber-track"></div>
      <!-- 第二层轨道（景深感） -->
      <div class="cyber-track-bg"></div>
      
      <div class="cyber-train">
        <!-- 尾部残影/光轨（分层渐变） -->
        <div class="train-trail-core"></div>
        <div class="train-trail-glow"></div>
        <div class="train-trail-particles">
          <span v-for="i in 8" :key="'tp'+i" class="trail-spark" 
                :style="{ animationDelay: (Math.random() * 2) + 's', top: (Math.random() * 40 + 10) + 'px' }"></span>
        </div>

        <!-- 列车主体 SVG (老 GPU 友好版：去掉 feMerge 等复杂滤镜) -->
        <svg viewBox="0 0 1000 70" class="train-svg">
          <defs>
            <linearGradient id="body-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="rgba(5, 15, 30, 0.95)" />
              <stop offset="80%" stop-color="rgba(10, 30, 60, 0.95)" />
              <stop offset="100%" stop-color="rgba(15, 40, 80, 0.9)" />
            </linearGradient>
            <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="rgba(34, 211, 238, 0)" />
              <stop offset="70%" stop-color="rgba(34, 211, 238, 0.7)" />
              <stop offset="100%" stop-color="rgba(103, 232, 249, 1)" />
            </linearGradient>
          </defs>

          <!-- 车身主体 -->
          <rect x="0" y="10" width="900" height="50" fill="url(#body-grad)" />
          <!-- 车厢分隔缝 -->
          <path d="M 200 10 L 200 60 M 400 10 L 400 60 M 600 10 L 600 60 M 800 10 L 800 60" stroke="#0f325a" stroke-width="2"/>

          <!-- 车头流线外壳 -->
          <path d="M 800 10 L 920 10 C 960 10 985 25 995 45 C 998 52 998 55 995 58 L 800 58 Z" fill="url(#body-grad)" stroke="#22d3ee" stroke-width="1.5"/>

          <!-- 底部排障器/能量条（用粗描边 + 半透明叠层模拟发光，无需 SVG filter） -->
          <line x1="0" y1="58" x2="980" y2="58" stroke="url(#accent-grad)" stroke-width="4"/>
          <line x1="0" y1="58" x2="980" y2="58" stroke="rgba(103,232,249,0.4)" stroke-width="8"/>
          <!-- 车顶能量线 -->
          <line x1="0" y1="10" x2="900" y2="10" stroke="#0891b2" stroke-width="1"/>
          <line x1="900" y1="10" x2="950" y2="15" stroke="#22d3ee" stroke-width="2"/>

          <!-- 侧边动态流光线条 -->
          <path d="M 0 35 L 940 35" stroke="rgba(103, 232, 249, 0.8)" stroke-width="1" class="dynamic-line"/>

          <!-- 车窗贯穿底带 -->
          <rect x="0" y="22" width="850" height="10" fill="rgba(10, 20, 40, 0.8)" stroke="#0891b2" stroke-width="0.5"/>

          <!-- 独立发光车窗 -->
          <g fill="#e0f2fe" opacity="0.95">
            <rect v-for="i in 18" :key="'w'+i" :x="10 + (i-1)*45" y="23" width="30" height="8" rx="1" />
          </g>

          <!-- 车窗内侧闪烁 -->
          <g fill="#67e8f9" opacity="0.6">
             <rect v-for="i in [2,5,7,12,15]" :key="'sw'+i" :x="10 + (i-1)*45" y="23" width="30" height="8" rx="1" class="window-flicker"/>
          </g>

          <!-- 车头驾驶室玻璃 -->
          <path d="M 860 20 L 935 20 C 950 20 965 24 972 32 L 850 32 Z" fill="rgba(200, 240, 255, 0.9)"/>
          <path d="M 870 22 L 930 22 C 940 22 950 25 955 30 L 860 30 Z" fill="#fff"/>

          <!-- 车头雷达/传感器细节 -->
          <circle cx="985" cy="50" r="2" fill="#fff"/>
          <circle cx="985" cy="50" r="4" fill="rgba(255,255,255,0.4)"/>
        </svg>

        <!-- 车身悬浮特效罩 -->
        <div class="train-aura"></div>

        <!-- 车头前向探照灯束 (双层叠加大灯) -->
        <div class="train-beam-main"></div>
        <div class="train-beam-core"></div>
      </div>
    </div>

    <div class="bg-scan"></div>

    <!-- 二进制 / 字符代码雨（左右两侧） -->
    <div class="code-rain code-rain-left">
      <pre v-for="(col, i) in rainColumns.slice(0, 4)" :key="'rl-'+i"
        class="rain-col"
        :style="{
          left: (i * 14) + '%',
          animationDuration: col.duration + 's',
          animationDelay: col.delay + 's',
          opacity: col.opacity,
        }">{{ col.text }}</pre>
    </div>
    <div class="code-rain code-rain-right">
      <pre v-for="(col, i) in rainColumns.slice(4)" :key="'rr-'+i"
        class="rain-col"
        :style="{
          right: (i * 14) + '%',
          animationDuration: col.duration + 's',
          animationDelay: col.delay + 's',
          opacity: col.opacity,
        }">{{ col.text }}</pre>
    </div>

    <!-- 漂浮粒子（减少到 12 个，降低合成层开销） -->
    <div class="particles">
      <span v-for="n in 12" :key="n" class="particle" :style="{
        left: (Math.random() * 100) + '%',
        animationDelay: (Math.random() * 8) + 's',
        animationDuration: (8 + Math.random() * 10) + 's',
      }"></span>
    </div>

    <!-- 中心 HUD：光环平台 + 六边形 logo -->
    <div class="hud">
      <!-- 扩散冲击波（减到 2 层） -->
      <div class="shockwave shockwave-1"></div>
      <div class="shockwave shockwave-2"></div>

      <!-- 轨道粒子（减为 2 条轨道，共 5 粒子） -->
      <div class="orbit orbit-a">
        <span v-for="n in 3" :key="'oa-'+n" class="orbit-dot"
          :style="{ transform: `rotate(${n * 120}deg) translateX(220px)` }"></span>
      </div>
      <div class="orbit orbit-b">
        <span v-for="n in 2" :key="'ob-'+n" class="orbit-dot orbit-dot-lg"
          :style="{ transform: `rotate(${n * 180}deg) translateX(160px)` }"></span>
      </div>

      <!-- 外层旋转光环（ring-1 减为 6 个点，去掉 ring-4） -->
      <div class="ring ring-1">
        <div class="ring-dot" v-for="n in 6" :key="'r1-'+n"
          :style="{ transform: `rotate(${n * 60}deg) translateY(-180px)` }"></div>
      </div>
      <div class="ring ring-2"></div>
      <div class="ring ring-3"></div>

      <!-- 平台底盘（减为 18 条线） -->
      <div class="platform">
        <div class="platform-line" v-for="n in 18" :key="'pl-'+n"
          :style="{ transform: `translate(-50%, -50%) rotate(${n * 20}deg)` }"></div>
      </div>

      <!-- 中心六边形 logo（加 hex-glow 类用于静态 box-shadow 发光） -->
      <div class="hexagon hex-glow">
        <svg viewBox="0 0 100 100" class="hex-svg">
          <polygon class="hex-outer" points="50,5 92,28 92,72 50,95 8,72 8,28" />
          <polygon class="hex-inner" points="50,18 80,34 80,66 50,82 20,66 20,34" />
        </svg>
        <div class="hex-core">
          <div class="hex-core-text">成都车辆段</div>
          <div class="hex-core-sub">信息组</div>
        </div>
        <!-- 6 个角的光点 -->
        <span v-for="n in 6" :key="'hp-'+n" class="hex-corner"
          :style="{ transform: `rotate(${n * 60}deg) translateY(-78px)` }"></span>
      </div>

      <!-- 四角 HUD 装饰角 -->
      <div class="corner corner-tl"></div>
      <div class="corner corner-tr"></div>
      <div class="corner corner-bl"></div>
      <div class="corner corner-br"></div>
    </div>

    <!-- 主标题 -->
    <div class="title-area">
      <h1 class="title-zh glitch" :data-text="title">
        <span v-for="(ch, i) in title.split('')" :key="i" class="ch"
          :style="{ animationDelay: (i * 0.06) + 's' }">{{ ch === ' ' ? '\u00A0' : ch }}</span>
      </h1>
      <p class="title-en">{{ subtitle }}</p>
      <div class="title-bars">
        <span></span><span></span><span></span>
      </div>
    </div>

    <!-- 底部：进度条 + 状态 + 数据流 -->
    <div class="footer">
      <div class="data-stream">
        <div v-for="(line, i) in dataLines" :key="i" class="data-line"
          :style="{ animationDelay: (i * 0.4) + 's' }">{{ line }}</div>
      </div>

      <div class="progress-wrap">
        <div class="progress-label">
          <span class="progress-status">{{ status }}</span>
          <span class="progress-percent">{{ progressText }}<small>%</small></span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: displayProgress + '%' }">
            <div class="progress-glow"></div>
          </div>
          <div class="progress-ticks">
            <span v-for="n in 20" :key="'t-'+n"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 主容器 ========== */
.loading-screen {
  position: absolute;
  inset: 0;
  z-index: 100;
  overflow: hidden;
  background:
    radial-gradient(ellipse at center bottom, #0a2547 0%, #051226 50%, #020816 100%);
  color: #e0f2fe;
  font-family: 'Microsoft YaHei', system-ui, sans-serif;
  user-select: none;
  animation: screenFadeIn 0.6s ease-out;
  /* 提前告知浏览器此容器内会有大量 transform/opacity 动画 */
  will-change: opacity;
  contain: layout style;
}
@keyframes screenFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ========== 背景：星空 ========== */
.bg-stars {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 20% 30%, #fff 50%, transparent),
    radial-gradient(1px 1px at 60% 70%, rgba(255,255,255,0.7) 50%, transparent),
    radial-gradient(2px 2px at 80% 10%, #67e8f9 50%, transparent),
    radial-gradient(1px 1px at 30% 80%, rgba(255,255,255,0.5) 50%, transparent),
    radial-gradient(1px 1px at 90% 50%, #fff 50%, transparent),
    radial-gradient(1.5px 1.5px at 10% 60%, rgba(103,232,249,0.8) 50%, transparent);
  background-size: 400px 400px, 300px 300px, 500px 500px, 350px 350px, 450px 450px, 250px 250px;
  opacity: 0.7;
  animation: starsTwinkle 4s ease-in-out infinite;
}
@keyframes starsTwinkle {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.9; }
}

/* ========== 背景：透视网格 ========== */
.bg-grid {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 200%;
  height: 60%;
  transform: translateX(-50%) perspective(600px) rotateX(60deg);
  background-image:
    linear-gradient(rgba(34, 211, 238, 0.3) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 211, 238, 0.3) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
  animation: gridMove 8s linear infinite;
}
@keyframes gridMove {
  from { background-position: 0 0; }
  to { background-position: 0 60px; }
}

/* ========== 背景：城市轮廓（用 box-shadow 模拟剪影） ========== */
.bg-city {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 35%;
  background:
    linear-gradient(to top, rgba(34, 211, 238, 0.15), transparent 70%),
    repeating-linear-gradient(90deg,
      transparent 0,
      transparent 30px,
      rgba(15, 30, 60, 0.95) 30px,
      rgba(15, 30, 60, 0.95) 35px,
      transparent 35px,
      transparent 60px,
      rgba(20, 40, 80, 0.9) 60px,
      rgba(20, 40, 80, 0.9) 90px,
      transparent 90px,
      transparent 110px,
      rgba(10, 25, 55, 0.95) 110px,
      rgba(10, 25, 55, 0.95) 140px);
  mask-image: linear-gradient(to top, #000 30%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, #000 30%, transparent 100%);
  opacity: 0.6;
  pointer-events: none;
}
.bg-city::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(2px 2px at 5% 60%, #22d3ee 50%, transparent),
    radial-gradient(2px 2px at 15% 80%, #67e8f9 50%, transparent),
    radial-gradient(2px 2px at 25% 50%, #22d3ee 50%, transparent),
    radial-gradient(2px 2px at 38% 75%, #67e8f9 50%, transparent),
    radial-gradient(2px 2px at 52% 55%, #22d3ee 50%, transparent),
    radial-gradient(2px 2px at 65% 80%, #67e8f9 50%, transparent),
    radial-gradient(2px 2px at 78% 50%, #22d3ee 50%, transparent),
    radial-gradient(2px 2px at 92% 70%, #67e8f9 50%, transparent);
  animation: cityLights 3s ease-in-out infinite;
}
@keyframes cityLights {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ========== 背景：扫描光带 ========== */
.bg-scan {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(34, 211, 238, 0.08) 49%,
    rgba(34, 211, 238, 0.15) 50%,
    rgba(34, 211, 238, 0.08) 51%,
    transparent 100%);
  background-size: 100% 200%;
  animation: scanMove 6s linear infinite;
  pointer-events: none;
  /* 去掉 mix-blend-mode:screen，避免强制独立合成层 + 混合计算 */
}
@keyframes scanMove {
  from { background-position: 0 -100%; }
  to { background-position: 0 200%; }
}

/* ========== 粒子 ========== */
.particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.particle {
  position: absolute;
  bottom: -10px;
  width: 3px;
  height: 3px;
  background: #67e8f9;
  border-radius: 50%;
  box-shadow: 0 0 8px #22d3ee, 0 0 16px rgba(34, 211, 238, 0.6);
  animation: particleRise linear infinite;
  opacity: 0;
}
@keyframes particleRise {
  0% { transform: translateY(0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-100vh); opacity: 0; }
}

/* ========== 中央 HUD ========== */
.hud {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 400px;
  height: 400px;
  transform: translate(-50%, -50%);
  will-change: transform;
  contain: layout style;
}

/* 旋转光环 */
.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}
.ring-1 {
  border: 1px dashed rgba(34, 211, 238, 0.5);
  animation: ringSpin 20s linear infinite;
}
.ring-2 {
  inset: 30px;
  border: 2px solid rgba(34, 211, 238, 0.3);
  border-top-color: #22d3ee;
  border-right-color: rgba(103, 232, 249, 0.7);
  box-shadow: 0 0 30px rgba(34, 211, 238, 0.3), inset 0 0 30px rgba(34, 211, 238, 0.2);
  animation: ringSpin 8s linear infinite reverse;
}
.ring-3 {
  inset: 70px;
  border: 1px solid rgba(34, 211, 238, 0.4);
  border-left-color: transparent;
  border-bottom-color: transparent;
  animation: ringSpin 12s linear infinite;
}
.ring-4 {
  inset: 110px;
  border: 1px dashed rgba(103, 232, 249, 0.6);
  animation: ringSpin 15s linear infinite reverse;
}
@keyframes ringSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.ring-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  background: #22d3ee;
  border-radius: 50%;
  box-shadow: 0 0 8px #22d3ee, 0 0 16px rgba(34, 211, 238, 0.7);
  transform-origin: 3px 3px;
}

/* 平台底盘 */
.platform {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 320px;
  height: 320px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(34, 211, 238, 0.15) 0%, rgba(34, 211, 238, 0.05) 60%, transparent 80%);
  border: 1px solid rgba(34, 211, 238, 0.3);
  animation: platformPulse 3s ease-in-out infinite;
}
@keyframes platformPulse {
  0%, 100% { box-shadow: 0 0 40px rgba(34, 211, 238, 0.3), inset 0 0 30px rgba(34, 211, 238, 0.2); }
  50% { box-shadow: 0 0 80px rgba(34, 211, 238, 0.6), inset 0 0 50px rgba(34, 211, 238, 0.35); }
}
.platform-line {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1px;
  height: 160px;
  margin: -160px 0 0 0;
  background: linear-gradient(to top, rgba(34, 211, 238, 0.6), transparent 80%);
  transform-origin: bottom center;
}

/* 中心六边形 */
.hexagon {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 160px;
  height: 160px;
  transform: translate(-50%, -50%);
  animation: hexFloat 3s ease-in-out infinite;
}

@keyframes hexFloat {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50% { transform: translate(-50%, -50%) translateY(-6px); }
}
.hex-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* 用 box-shadow 替代 drop-shadow，避免每帧 GPU 卷积 */
  filter: none;
}
.hex-outer {
  fill: rgba(15, 50, 90, 0.6);
  stroke: #22d3ee;
  stroke-width: 1.5;
  /* hexPulse 动画每帧改 filter:drop-shadow → 每帧全量重绘，极度卡顿 */
  /* 改用 opacity 动画模拟脉冲，只触发合成层重绘，GPU 开销趋零 */
  animation: hexPulse 2s ease-in-out infinite;
}
.hex-inner {
  fill: rgba(34, 211, 238, 0.08);
  stroke: rgba(103, 232, 249, 0.7);
  stroke-width: 0.5;
  stroke-dasharray: 4 2;
  animation: hexInnerSpin 20s linear infinite;
  transform-origin: 50px 50px;
}
@keyframes hexPulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}
@keyframes hexInnerSpin {
  from { transform: rotate(0deg); transform-origin: 50px 50px; }
  to { transform: rotate(360deg); transform-origin: 50px 50px; }
}
.hex-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 2;
}
.hex-core-text {
  width: 199px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 4px;
  color: #67e8f9;
  text-shadow: 0 0 10px #22d3ee, 0 0 20px rgba(34, 211, 238, 0.8);
  font-family: 'Consolas', 'Courier New', 'Microsoft YaHei', sans-serif;
}
.hex-core-sub {
  font-size: 12px;
  letter-spacing: 3px;
  color: rgba(103, 232, 249, 0.8);
  margin-top: 2px;
}
.hex-corner {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  background: #22d3ee;
  border-radius: 50%;
  box-shadow: 0 0 8px #22d3ee, 0 0 16px rgba(34, 211, 238, 0.9);
  transform-origin: 4px 4px;
  animation: cornerPulse 1.5s ease-in-out infinite;
}
@keyframes cornerPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* ========== 标题区 ========== */
.title-area {
  position: absolute;
  top: 8%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  width: 100%;
}
.title-zh {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: 12px;
  margin: 0;
  background: linear-gradient(180deg, #f0f9ff 0%, #67e8f9 50%, #22d3ee 100%);
  -webkit-background-clip: text;
  background-clip: text;
  text-shadow: 0 0 30px rgba(34, 211, 238, 0.5);
  /* 去掉 drop-shadow，text-shadow 已足够提供发光效果 */
}
.title-zh .ch {
  display: inline-block;
  opacity: 0;
  transform: translateY(20px);
  animation: charDrop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes charDrop {
  to { opacity: 1; transform: translateY(0); }
}
.title-en {
  font-size: 14px;
  letter-spacing: 6px;
  color: rgba(103, 232, 249, 0.7);
  margin: 12px 0 0;
  font-family: 'Consolas', 'Courier New', monospace;
  animation: fadeUp 1s 0.8s both;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.title-bars {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 14px;
}
.title-bars span {
  display: block;
  height: 2px;
  background: linear-gradient(90deg, transparent, #22d3ee, transparent);
  animation: barExpand 1s ease-out forwards;
  transform: scaleX(0);
}
.title-bars span:nth-child(1) { width: 40px; animation-delay: 1.2s; }
.title-bars span:nth-child(2) { width: 80px; animation-delay: 1.3s; }
.title-bars span:nth-child(3) { width: 40px; animation-delay: 1.4s; }
@keyframes barExpand {
  to { transform: scaleX(1); }
}

/* ========== 底部：数据流 + 进度条 ========== */
.footer {
  position: absolute;
  left: 50%;
  bottom: 5%;
  transform: translateX(-50%);
  width: min(680px, 90vw);
}

.data-stream {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: rgba(103, 232, 249, 0.7);
  height: 110px;
  overflow: hidden;
  margin-bottom: 16px;
  text-align: left;
  padding-left: 16px;
  border-left: 1px solid rgba(34, 211, 238, 0.3);
}
.data-line {
  opacity: 0;
  transform: translateX(-10px);
  animation: dataIn 0.4s ease-out forwards;
  line-height: 1.6;
}
.data-line::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #22d3ee;
  border-radius: 50%;
  margin-right: 8px;
  box-shadow: 0 0 6px #22d3ee;
  vertical-align: middle;
}
@keyframes dataIn {
  to { opacity: 1; transform: translateX(0); }
}

.progress-wrap {
  position: relative;
}
.progress-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 13px;
  letter-spacing: 2px;
  color: #67e8f9;
}
.progress-status::before {
  content: '◆ ';
  color: #22d3ee;
  animation: blinkDot 1s ease-in-out infinite;
}
@keyframes blinkDot {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
.progress-percent {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 26px;
  font-weight: 700;
  color: #67e8f9;
  text-shadow: 0 0 10px rgba(34, 211, 238, 0.8);
}
.progress-percent small {
  font-size: 14px;
  margin-left: 2px;
  color: rgba(103, 232, 249, 0.7);
}

.progress-bar {
  position: relative;
  height: 10px;
  background: rgba(34, 211, 238, 0.08);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  position: relative;
  height: 100%;
  background: linear-gradient(90deg, #0891b2 0%, #22d3ee 50%, #67e8f9 100%);
  box-shadow: 0 0 12px #22d3ee, inset 0 0 4px rgba(255,255,255,0.4);
  transition: width 0.3s ease-out;
}
.progress-glow {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
  animation: progressGlow 1.5s ease-in-out infinite;
}
@keyframes progressGlow {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(40px); }
}
.progress-ticks {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.progress-ticks span {
  width: 1px;
  background: rgba(2, 8, 22, 0.4);
}

/* ========== 赛博列车穿梭动画 ========== */
.cyber-train-wrapper {
  position: absolute;
  bottom: 25%; /* 位于城市剪影偏上方 */
  left: 0;
  width: 100%;
  height: 80px;
  z-index: 2;
  pointer-events: none;
  /* 去掉 perspective，老 GPU 兼容 */
}

/* 前景主轨道 */
.cyber-track {
  position: absolute;
  bottom: 5px;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.8), transparent);
  box-shadow: 0 0 15px #22d3ee, 0 0 5px #fff;
}

/* 背景远景轨道（去掉 translateZ 兼容老 GPU） */
.cyber-track-bg {
  position: absolute;
  bottom: 20px;
  left: 0;
  width: 100%;
  height: 1px;
  background: rgba(34, 211, 238, 0.2);
  opacity: 0.6;
}

.cyber-train {
  position: absolute;
  bottom: 0;
  left: -1200px;
  width: 1000px;
  height: 70px;
  display: flex;
  align-items: flex-end;
  /* 更平滑的飞驰动画，稍微带点倾斜表现极速感 */
  animation: trainDrive 5.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  transform-origin: bottom center;
  will-change: transform;
}

/* SVG 本体阴影（轻量化） */
.train-svg {
  width: 100%;
  height: 100%;
  /* 老 GPU 上 drop-shadow 也较慢，改为轻微的 box-shadow（在父元素上） */
  position: relative;
  z-index: 10;
}

/* 车身动态流光线动画 */
.dynamic-line {
  stroke-dasharray: 200 400;
  animation: flowLine 2s linear infinite;
}
@keyframes flowLine {
  to { stroke-dashoffset: -600; }
}

/* 车窗内闪烁动画 */
.window-flicker {
  animation: flicker 1.5s steps(2, start) infinite;
}
@keyframes flicker {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.1; }
}

/* 列车悬浮包裹光晕（去掉 mix-blend-mode，避免老浏览器整层不显示） */
.train-aura {
  position: absolute;
  inset: 5px 0;
  border-radius: 40px;
  box-shadow: inset 0 0 20px rgba(34, 211, 238, 0.3), 0 0 30px rgba(34, 211, 238, 0.2);
  pointer-events: none;
}

/* 探照灯主光束 (大范围泛光，去掉 mix-blend-mode + 减小 blur) */
.train-beam-main {
  position: absolute;
  right: -600px;
  bottom: 0px;
  width: 650px;
  height: 60px;
  background: linear-gradient(90deg, rgba(200,240,255,0.5), transparent);
  clip-path: polygon(0 40%, 100% 0%, 100% 100%, 0 80%);
  /* 去掉 blur，用渐变本身的柔和过渡模拟散焦效果 */
  z-index: 5;
}

/* 探照灯核心光束 (高亮穿透) */
.train-beam-core {
  position: absolute;
  right: -300px;
  bottom: 15px;
  width: 350px;
  height: 25px;
  background: linear-gradient(90deg, rgba(255,255,255,0.9), rgba(103,232,249,0.3), transparent);
  clip-path: polygon(0 30%, 100% 20%, 100% 80%, 0 70%);
  /* 去掉 blur(1px)，渐变过渡已够柔和 */
  z-index: 6;
}

/* 尾部核心光轨 */
.train-trail-core {
  position: absolute;
  left: -600px;
  bottom: 8px;
  width: 600px;
  height: 3px;
  background: linear-gradient(90deg, transparent, #fff);
  box-shadow: 0 0 8px #fff;
  z-index: 5;
}

/* 尾部泛光扩散（减小 blur） */
.train-trail-glow {
  position: absolute;
  left: -800px;
  bottom: 2px;
  width: 800px;
  height: 15px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.4));
  /* 去掉 blur，用更大的 height + 更低的 opacity 模拟泛光扩散 */
  z-index: 4;
}

/* 尾部飘散的火花/等离子体 */
.train-trail-particles {
  position: absolute;
  left: -400px;
  bottom: 0;
  width: 400px;
  height: 60px;
  z-index: 3;
}
.trail-spark {
  position: absolute;
  right: 0;
  width: 15px;
  height: 2px;
  background: #67e8f9;
  border-radius: 2px;
  box-shadow: 0 0 6px #22d3ee;
  opacity: 0;
  animation: sparkFly 0.6s linear infinite;
}
@keyframes sparkFly {
  0% { transform: translateX(0) scaleX(1); opacity: 1; }
  100% { transform: translateX(-300px) scaleX(3); opacity: 0; }
}

@keyframes trainDrive {
  0%   { transform: translateX(0); }
  55%  { transform: translateX(calc(100vw + 2400px)); }
  100% { transform: translateX(calc(100vw + 2400px)); }
}

/* ========== 蜂巢六边形背景纹理 ========== */
.bg-honeycomb {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 50% 0, transparent 19px, rgba(34,211,238,0.15) 20px, rgba(34,211,238,0.15) 22px, transparent 23px),
    radial-gradient(circle at 0 50%, transparent 19px, rgba(34,211,238,0.15) 20px, rgba(34,211,238,0.15) 22px, transparent 23px);
  background-size: 60px 100px;
  background-position: 0 0, 30px 50px;
  opacity: 0.3;
  animation: honeycombShift 30s linear infinite;
  mask-image: radial-gradient(ellipse at center, transparent 30%, #000 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, transparent 30%, #000 80%);
}
@keyframes honeycombShift {
  from { background-position: 0 0, 30px 50px; }
  to   { background-position: 60px 100px, 90px 150px; }
}

/* ========== 代码雨 ========== */
.code-rain {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 25vw;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
  mask-image: linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent);
}
.code-rain-left { left: 0; }
.code-rain-right { right: 0; }
.rain-col {
  position: absolute;
  top: -100%;
  margin: 0;
  padding: 0;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.2;
  color: #22d3ee;
  text-shadow: 0 0 6px #22d3ee;
  animation: rainFall linear infinite;
  white-space: pre;
  writing-mode: vertical-rl;
  /* 让首字符更亮，模拟"头"高亮 */
  background: linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(34,211,238,0.6) 8%, transparent 50%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
@keyframes rainFall {
  from { transform: translateY(0); }
  to   { transform: translateY(220vh); }
}

/* ========== 扩散冲击波 ========== */
.shockwave {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100px;
  height: 100px;
  margin: -50px 0 0 -50px;
  border: 2px solid #22d3ee;
  border-radius: 50%;
  opacity: 0;
  animation: shockwave 3s ease-out infinite;
  pointer-events: none;
}
.shockwave-1 { animation-delay: 0s; }
.shockwave-2 { animation-delay: 1s; }
.shockwave-3 { animation-delay: 2s; }
@keyframes shockwave {
  0%   { transform: scale(0.3); opacity: 0; border-width: 4px; }
  20%  { opacity: 0.9; }
  100% { transform: scale(6); opacity: 0; border-width: 1px; }
}

/* ========== 轨道粒子 ========== */
.orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
}
.orbit-a { animation: orbitSpin 12s linear infinite; }
.orbit-b { animation: orbitSpin 8s linear infinite reverse; }
.orbit-c { animation: orbitSpin 5s linear infinite; }
@keyframes orbitSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.orbit-dot {
  position: absolute;
  top: 0;
  left: 0;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  background: #67e8f9;
  border-radius: 50%;
  box-shadow: 0 0 10px #22d3ee, 0 0 20px rgba(34, 211, 238, 0.8);
}
.orbit-dot.orbit-dot-lg {
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  background: #fff;
  box-shadow: 0 0 14px #22d3ee, 0 0 28px #67e8f9, 0 0 50px rgba(103, 232, 249, 0.6);
}

/* ========== 毛刺/故障标题（RGB 错位） ========== */
.glitch {
  position: relative;
}
.glitch::before,
.glitch::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  letter-spacing: inherit;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  pointer-events: none;
  opacity: 0.85;
  /* 去掉 mix-blend-mode:screen，用 opacity 替代混合效果 */
}

.glitch::after {
  background: linear-gradient(180deg, #00f0ff, #22d3ee);
  text-shadow: none;
  animation: glitchShift2 3.5s steps(1) infinite;
  clip-path: inset(0 0 0 0);
}
@keyframes glitchShift1 {
  0%, 92%, 100% { transform: translate(0, 0); clip-path: inset(0 0 0 0); opacity: 0; }
  93%  { transform: translate(-3px, 1px);  clip-path: inset(20% 0 60% 0); opacity: 0.8; }
  94%  { transform: translate(2px, -2px);  clip-path: inset(50% 0 30% 0); opacity: 0.8; }
  95%  { transform: translate(-2px, 0);    clip-path: inset(70% 0 10% 0); opacity: 0.8; }
  96%  { transform: translate(3px, 2px);   clip-path: inset(10% 0 75% 0); opacity: 0.8; }
}
@keyframes glitchShift2 {
  0%, 92%, 100% { transform: translate(0, 0); clip-path: inset(0 0 0 0); opacity: 0; }
  93%  { transform: translate(3px, -1px);  clip-path: inset(30% 0 50% 0); opacity: 0.8; }
  94%  { transform: translate(-2px, 2px);  clip-path: inset(60% 0 20% 0); opacity: 0.8; }
  95%  { transform: translate(2px, 0);     clip-path: inset(15% 0 70% 0); opacity: 0.8; }
  96%  { transform: translate(-3px, -2px); clip-path: inset(80% 0 5% 0);  opacity: 0.8; }
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .title-zh { font-size: 28px; letter-spacing: 6px; }
  .title-en { font-size: 11px; letter-spacing: 3px; }
  .hud { width: 320px; height: 320px; }
  .hexagon { width: 110px; height: 110px; }
  .hex-core-text { font-size: 20px; }
  .platform { width: 220px; height: 220px; }
  .data-stream { font-size: 10px; height: 80px; }
}
</style>
