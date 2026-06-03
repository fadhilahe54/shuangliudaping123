/**
 * SharedGeometries.js — Three.js 共享几何体和材质单例库
 *
 * 设计思路：
 *   - Three.js 中每个 new BoxGeometry() / new MeshLambertMaterial() 都占用 GPU 显存
 *   - 大屏场景有数百个相同形状的车厢、轨道等，如果每个建模函数内部各自 new，显存山脊极高
 *   - 此文件将所有共享幑样静态几何体和材质定义为模块级单例
 *   - SceneManager 创建多个 Mesh 共用同一几何体/材质，描边命不同位置
 *   - 所有共享资源都标记 _shared=true，供 dispose 逻辑跳过
 *   - 组件完全卸载时才调用 disposeAll 释放所有 GPU 资源
 */
import * as THREE from 'three'

import { RAIL_LENGTH } from '../utils/constants.js'

// ========== 车厢几何体 ==========
// 所有尺寸均为世界坐标单位（约 1 单位 = 1 米）
export const bodyGeo = new THREE.BoxGeometry(2.8, 2.4, 12)
export const roofGeo = new THREE.BoxGeometry(2.85, 0.3, 12.05)
export const roofCurveGeo = new THREE.BoxGeometry(2.0, 0.15, 12.05)
export const underGeo = new THREE.BoxGeometry(2.7, 0.3, 11.8)
export const stripeGeo = new THREE.BoxGeometry(2.82, 0.15, 12.01)
export const thinStripeGeo = new THREE.BoxGeometry(2.82, 0.08, 12.01)
export const bogieGeo = new THREE.BoxGeometry(2.5, 0.5, 2.2)
export const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16)
export const windowGeo = new THREE.BoxGeometry(0.05, 0.9, 1.0)
export const doorGeo = new THREE.BoxGeometry(0.05, 1.8, 0.9)
export const gangwayGeo = new THREE.BoxGeometry(1.6, 2.2, 0.2)
export const locoFrontGeo = new THREE.BoxGeometry(2.8, 2.4, 0.2)
export const locoWindowGeo = new THREE.BoxGeometry(2.2, 0.8, 0.05)
export const headlightGeo = new THREE.CircleGeometry(0.2, 16)
export const smallHeadlightGeo = new THREE.CircleGeometry(0.15, 16)
export const cowcatcherGeo = new THREE.BoxGeometry(2.8, 0.6, 0.2)
export const pantographPoleGeo = new THREE.BoxGeometry(0.05, 0.6, 0.05)
export const pantographTopGeo = new THREE.BoxGeometry(1.2, 0.05, 0.1)
export const statusIndicatorGeo = new THREE.SphereGeometry(0.15, 16, 16)
export const highlightGeo = new THREE.BoxGeometry(2.9, 2.5, 12.1)

// ========== 动车组 CR200J "绿巨人" 专用几何体 ==========
// 流线型车头鼻锥（扁平盒子，3个堆叠+倾斜模拟弧形流线）
export const emuNoseGeo = new THREE.BoxGeometry(2.8, 0.8, 3.5)
// 流线型前窗（大斜面窗）
export const emuWindshieldGeo = new THREE.BoxGeometry(2.0, 0.9, 0.05)
// 动车组驾驶室前窗（更宽）
export const emuCabWindowGeo = new THREE.BoxGeometry(2.3, 0.9, 0.05)
// 动车组车门（滑动门风格，略宽）
export const emuDoorGeo = new THREE.BoxGeometry(0.05, 1.8, 1.1)
// 动车组黑色窗带（整体包裹车身的连续深色窗带）
export const emuWindowBandGeo = new THREE.BoxGeometry(2.82, 1.0, 12.01)
// 动车组侧面装饰线（Swoosh）
export const emuSwooshGeo = new THREE.BoxGeometry(0.05, 0.15, 4.0)

// 轨道几何体（铁轨向二列位方向额外延伸 150，总长 460 + 150 = 610）
export const railGeo = new THREE.BoxGeometry(0.2, 0.1, RAIL_LENGTH + 150)
export const sleeperGeo = new THREE.BoxGeometry(2.5, 0.05, 0.4)
export const bufferGeo = new THREE.BoxGeometry(3, 1, 1)
export const platformBodyGeo = new THREE.BoxGeometry(3.1, 0.95, 340)
export const platformEdgeGeo = new THREE.BoxGeometry(0.1, 0.95, 340)
export const safetyLineGeo = new THREE.BoxGeometry(0.15, 0.02, 340)
export const labelBoxGeo = new THREE.BoxGeometry(3, 1, 0.5)

// 控制台几何体
export const consoleBaseGeo = new THREE.BoxGeometry(2.5, 1, 1.5)
export const consoleButtonGeo = new THREE.BoxGeometry(0.8, 0.2, 0.8)

/**
 * 共享材质 - 静态颜色材质
 */
export const windowMat = new THREE.MeshLambertMaterial({ color: '#0f172a' })
export const underMat = new THREE.MeshLambertMaterial({ color: '#1e293b' })
export const bogieMat = new THREE.MeshLambertMaterial({ color: '#0f172a' })
export const wheelMat = new THREE.MeshLambertMaterial({ color: '#334155' })
export const doorMat = new THREE.MeshLambertMaterial({ color: '#003311' })
export const gangwayMat = new THREE.MeshLambertMaterial({ color: '#111111' })
export const headlightMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2 })
export const pantographBaseMat = new THREE.MeshLambertMaterial({ color: '#94a3b8' })
export const pantographTopMat = new THREE.MeshLambertMaterial({ color: '#cbd5e1' })
export const cowcatcherMat = new THREE.MeshLambertMaterial({ color: '#111111' })
export const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true })

// ========== 动车组材质（CR200J 亓色系） ==========
/**
 * 动车组材质集合
 *   - emuDoorMat：动车组车门材质（深绿）
 *   - emuWindowBandMat：动车组连续窗带材质（深角）
 */
export const emuDoorMat = new THREE.MeshLambertMaterial({ color: '#1a5c1a' })        // 动车组车门（深绿）
export const emuWindowBandMat = new THREE.MeshLambertMaterial({ color: '#0f172a' })  // 动车组连续窗带（深角）

// ========== 轨道材质 ==========
/**
 * 轨道材质集合
 *   - railMat：轨道材质
 *   - sleeperMat：枕木材质
 *   - bufferMat：缓冲器材质
 *   - platformBodyMat：站台主体材质
 *   - platformEdgeMat：站台边缘材质
 *   - safetyLineMat：安全线材质
 *   - labelBoxMat：标签盒材质
 */
export const railMat = new THREE.MeshLambertMaterial({ color: '#334155' })
export const sleeperMat = new THREE.MeshLambertMaterial({ color: '#1e293b' })
export const bufferMat = new THREE.MeshLambertMaterial({ color: '#ef4444' })
export const platformBodyMat = new THREE.MeshLambertMaterial({ color: '#475569' })
export const platformEdgeMat = new THREE.MeshLambertMaterial({ color: '#334155' })
export const safetyLineMat = new THREE.MeshLambertMaterial({ color: '#eab308' })
export const labelBoxMat = new THREE.MeshLambertMaterial({ color: '#0ea5e9' })

/**
 * 标记所有共享资源（给每个对象添加 _shared=true）
 * SceneManager.dispose 时检查此标记，跳过共享资源不释放，避免多个 Mesh 使用同一几何体时发生渲染崩溃
 */
function markShared() {
  const allExports = [
    bodyGeo, roofGeo, roofCurveGeo, underGeo, stripeGeo, thinStripeGeo,
    bogieGeo, wheelGeo, windowGeo, doorGeo, gangwayGeo, locoFrontGeo,
    locoWindowGeo, headlightGeo, smallHeadlightGeo, cowcatcherGeo,
    pantographPoleGeo, pantographTopGeo, statusIndicatorGeo, highlightGeo,
    emuNoseGeo, emuWindshieldGeo, emuCabWindowGeo, emuDoorGeo,
    emuWindowBandGeo, emuSwooshGeo,
    railGeo, sleeperGeo, bufferGeo, platformBodyGeo, platformEdgeGeo,
    safetyLineGeo, labelBoxGeo, consoleBaseGeo, consoleButtonGeo,
    windowMat, underMat, bogieMat, wheelMat, doorMat, gangwayMat,
    headlightMat, pantographBaseMat, pantographTopMat, cowcatcherMat,
    highlightMat, emuDoorMat, emuWindowBandMat, railMat, sleeperMat,
    bufferMat, platformBodyMat, platformEdgeMat, safetyLineMat, labelBoxMat,
  ]
  allExports.forEach(item => {
    if (item) item._shared = true
  })
}

// 模块加载时立即标记
markShared()

/**
 * 释放所有共享的几何体和材质的 GPU 资源
 * 仅在组件完全卸载时调用（即 useThreeScene.onBeforeUnmount 中 fullDestroy=true 时）
 * 重建场景时不调用此函数，避免共享资源被释放后备用的 Mesh 渲染异常
 */
export function disposeAll() {
  const allExports = [
    bodyGeo, roofGeo, roofCurveGeo, underGeo, stripeGeo, thinStripeGeo,
    bogieGeo, wheelGeo, windowGeo, doorGeo, gangwayGeo, locoFrontGeo,
    locoWindowGeo, headlightGeo, smallHeadlightGeo, cowcatcherGeo,
    pantographPoleGeo, pantographTopGeo, statusIndicatorGeo, highlightGeo,
    emuNoseGeo, emuWindshieldGeo, emuCabWindowGeo, emuDoorGeo,
    emuWindowBandGeo, emuSwooshGeo,
    railGeo, sleeperGeo, bufferGeo, platformBodyGeo, platformEdgeGeo,
    safetyLineGeo, labelBoxGeo, consoleBaseGeo, consoleButtonGeo,
    windowMat, underMat, bogieMat, wheelMat, doorMat, gangwayMat,
    headlightMat, pantographBaseMat, pantographTopMat, cowcatcherMat,
    highlightMat, emuDoorMat, emuWindowBandMat, railMat, sleeperMat,
    bufferMat, platformBodyMat, platformEdgeMat, safetyLineMat, labelBoxMat,
  ]
  allExports.forEach(item => {
    if (item && typeof item.dispose === 'function') {
      item.dispose()
    }
  })
}
