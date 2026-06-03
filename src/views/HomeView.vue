<!--
  HomeView.vue -- 首页大屏视图
  应用的主页面，由三层叠加组成：
    1. ThreeCanvas   - 底层：Three.js WebGL 3D 渲染场景（股道、列车、建筑等）
    2. UIOverlay     - 中层：HUD 叠加层（顶部工具栏、调度信息面板、搜索栏等）
    3. TrainInfoPanel / CarriageDetails - 上层：点击交互浮层面板
    4. Toaster       - Toast 全局提示
  路由：/（首页）
-->
<script setup>
import { ref, computed } from 'vue'
// Three.js 3D 渲染容器（全屏铺底）
import ThreeCanvas from '../components/ThreeCanvas.vue'
// UI 叠加层（所有 HUD 控件和交互面板的容器）
import UIOverlay from '../components/UIOverlay.vue'
// 整列车信息侧边面板（点击车厢时从右侧弹出）
import TrainInfoPanel from '../components/TrainInfoPanel.vue'
// 单节车厢详情浮层（点击单节时在中央弹出）
import CarriageDetails from '../components/CarriageDetails.vue'
// 股道作业看板（点击列位作业标记时从右侧弹出）
import WorkInfoPanel from '../components/WorkInfoPanel.vue'
// 股道作业标牌详情（点击有车组列位的班组/登顶统计标牌时从右侧弹出）
import WorkSignDetailPanel from '../components/WorkSignDetailPanel.vue'
// 全局 Toast 通知组件
import { Toaster } from 'vue-sonner'
// 科技感加载页面（3D 场景就绪前覆盖全屏展示）
import LoadingScreen from '../components/LoadingScreen.vue'

// 通过 ref 获取 ThreeCanvas 暴露的加载状态
const threeCanvasRef = ref(null)
// 加载状态计算属性（带 fallback，组件挂载前显示 0）
const sceneReady = computed(() => threeCanvasRef.value?.sceneReady ?? false)
const loadingProgress = computed(() => threeCanvasRef.value?.loadingProgress ?? 0)
const loadingStatus = computed(() => threeCanvasRef.value?.loadingStatus ?? '正在初始化系统')
</script>

<template>
  <!-- 全屏容器，深色背景，所有子组件绝对定位叠加 -->
  <div class="w-full h-screen bg-slate-950 overflow-hidden relative font-sans">

    <!-- 底层：Three.js 3D 场景 -->
    <ThreeCanvas ref="threeCanvasRef" />
    <!-- 中层：HUD UI 叠加层 -->
    <UIOverlay />
    <!-- 上层：点击交互浮层（整列车信息 + 单节车厢详情 + 股道作业看板） -->
    <TrainInfoPanel />
    <CarriageDetails />
    <WorkInfoPanel />
    <WorkSignDetailPanel />
    <!-- 全局 Toast 通知（顶部居中，深色主题） -->
    <Toaster position="top-center" theme="dark" />

    <!-- 顶层：3D 场景加载页（场景就绪后淡出隐藏） -->
    <Transition name="loading-fade">
      <LoadingScreen
        v-if="!sceneReady"
        :progress="loadingProgress"
        :status="loadingStatus"
        title="成都车辆数字段孪生平台"
        subtitle="ChengDu CheLiangDuan Digital Twin Platform"
      />
    </Transition>
  </div>
</template>

<style scoped>
/* 加载页淡出动画：避免直接消失带来的突兀感 */
.loading-fade-leave-active {
  transition: opacity 0.8s ease, filter 0.8s ease;
}
.loading-fade-leave-to {
  opacity: 0;
  filter: blur(8px);
}
</style>
