<!--
  ThreeCanvas.vue — Three.js 渲染容器组件

  职责：
    - 提供一个全屏覆盖的 DOM 容器（div），作为 Three.js WebGL 画布的挂载点
    - 通过 useThreeScene composable 完成所有 3D 场景初始化、渲染循环和交互逻辑
    - 本组件故意保持极简，不包含任何业务逻辑，只负责提供容器 ref

  使用方：HomeView.vue
-->
<script setup>
/**
 * ThreeCanvas.vue — Three.js 3D 渲染容器组件
 * 
 * 职责：
 *   - 提供一个全屏覆盖的 DOM 容器（div），作为 Three.js WebGL 画布的挂载点
 *   - 通过 useThreeScene composable 完成所有 3D 场景初始化、渲染循环和交互逻辑
 *   - 本组件故意保持极简，不包含任何业务逻辑，只负责提供容器 ref
 * 
 * 使用方：HomeView.vue
 */

// 导入 Three.js 场景 composable，负责完整的 3D 生命周期管理
import { useThreeScene } from '../composables/useThreeScene.js'

// 从 composable 中解构 containerRef，用于绑定到 DOM 元素
// Three.js WebGL 画布会自动插入到该 ref 指向的元素内
// sceneReady / loadingProgress / loadingStatus 用于外层 LoadingScreen 显示加载进度
const { containerRef, sceneReady, loadingProgress, loadingStatus } = useThreeScene()

// 将加载状态暴露给父组件（HomeView）用于控制加载页显示
defineExpose({ sceneReady, loadingProgress, loadingStatus })
</script>

<template>
  <!-- 全屏覆盖容器，Three.js 渲染器会将 canvas 附加到此元素 -->
  <!-- ref="containerRef" 绑定到 useThreeScene 中的容器引用 -->
  <div ref="containerRef" class="three-container" />
</template>

<style scoped>
/* ========== 3D 渲染容器 ========== */
/* 绝对定位撑满父容器，确保 3D 场景覆盖整个视口 */
.three-container {
  /* 宽度：100%，撑满父容器 */
  width: 100%;
  /* 高度：100%，撑满父容器 */
  height: 100%;
  /* 绝对定位：相对于父容器定位 */
  position: absolute;
  /* 四边对齐：inset: 0 等同于 top: 0; right: 0; bottom: 0; left: 0 */
  inset: 0;
}
</style>
