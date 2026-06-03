/**
 * ControlStandModel.js — 股道控制台 3D 模型
 *
 * 为每个股道创建一个可交互的 3D 控制台模型，包含：
 *   - 控制台底座（蓝色发光盒子）
 *   - 出库按钟（红色）：点击触发列车驶出动画并消失
 *   - 进库按钟（蓝色）：点击触发列车从远方驶入动画
 *   - 按钟悬停高亮效果（通过 updateButtonHover 控制）
 *
 * 与 SceneManager 交互：
 *   - 按钟 userData 包含 { type: 'controlButton', action: 'depart'|'enter', trackId }
 *   - SceneManager 的 raycaster 检测到按钟点击时调用 onControlClick 回调
 */
import * as THREE from 'three'
// 平面文字平面生成工具（用于创建 3D 宣染文字标签）
import { createFlatTextPlane } from './TextSprite.js'
// 共享几何体：控制台底座和按钟（避免重复创建）
import { consoleBaseGeo, consoleButtonGeo } from './SharedGeometries.js'

/**
 * 创建指定股道的控制台 3D 组对象
 * @param {number} trackId    - 股道 ID，用于按钟 userData 和回调标识
 * @param {number[]} position - 模型世界坐标 [x, y, z]
 * @returns {THREE.Group}     包含底座、按钟、文字的组对象
 */
export function createControlStandModel(trackId, position) {
  const group = new THREE.Group()
  group.position.set(...position)

  // 控制台底座：深蓝底色 + 蓝色轻微发光，表现科技感
  const base = new THREE.Mesh(consoleBaseGeo, new THREE.MeshLambertMaterial({
    color: '#0f172a',
    emissive: '#3b82f6',
    emissiveIntensity: 0.5,
  }))
  base.position.set(0, 0.5, 0)
  group.add(base)

  // 出库按钮（红色）- 一键驶出消失
  const departBtn = new THREE.Mesh(consoleButtonGeo, new THREE.MeshLambertMaterial({
    color: '#7f1d1d',
    emissive: '#ef4444',
    emissiveIntensity: 0.2,
  }))
  departBtn.position.set(-0.7, 1.1, 0)
  departBtn.userData = { type: 'controlButton', action: 'depart', trackId }
  group.add(departBtn)

  // 出库文字
  const departText = createFlatTextPlane('出库', {
    fontSize: 44,
    fontWeight: '700',
    color: '#ffffff',
    worldHeight: 0.22,
    depthTest: true,
  })
  departText.position.set(-0.7, 1.25, 0)
  departText.rotation.set(-Math.PI / 2, 0, 0)
  group.add(departText)

  // 进库按钮（蓝色）- 一键从远方驶入
  const enterBtn = new THREE.Mesh(consoleButtonGeo, new THREE.MeshLambertMaterial({
    color: '#1e3a8a',
    emissive: '#3b82f6',
    emissiveIntensity: 0.2,
  }))
  enterBtn.position.set(0.7, 1.1, 0)
  enterBtn.userData = { type: 'controlButton', action: 'enter', trackId }
  group.add(enterBtn)

  // 进库文字
  const enterText = createFlatTextPlane('进库', {
    fontSize: 44,
    fontWeight: '700',
    color: '#ffffff',
    worldHeight: 0.22,
    depthTest: true,
  })
  enterText.position.set(0.7, 1.25, 0)
  enterText.rotation.set(-Math.PI / 2, 0, 0)
  group.add(enterText)

  // 存储控制台元数据和按钟引用，供 SceneManager raycaster 操作
  group.userData = { type: 'controlStand', trackId, departBtn, enterBtn }

  return group
}

/**
 * 更新按钮悬停状态
 */
export function updateButtonHover(btn, hovered) {
  if (!btn || !btn.material) return
  const { action } = btn.userData
  if (action === 'depart') {
    btn.material.color.set(hovered ? '#ef4444' : '#7f1d1d')
    btn.material.emissiveIntensity = hovered ? 1 : 0.2
  } else if (action === 'enter') {
    btn.material.color.set(hovered ? '#3b82f6' : '#1e3a8a')
    btn.material.emissiveIntensity = hovered ? 1 : 0.2
  }
}
