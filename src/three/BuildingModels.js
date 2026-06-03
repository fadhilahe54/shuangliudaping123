/**
 * BuildingModels.js — 场景周边建筑 3D 模型生成器
 *
 * 负责生成双流运用车间大屏场景中的所有建筑模型，包括：
 *   - 调度中心（现代玻璃幕墙建筑）
 *   - 检修楼（多层楼体 + 窗户 InstancedMesh）
 *   - 变电站
 *   - 料库
 *   - 围墙和围栏
 *   - 场地地面、道路
 *   - 天空盒 / 环境光照设置
 *
 * 所有建筑使用 BoxGeometry + MeshLambertMaterial 拼接，窗户采用 InstancedMesh
 * 批量渲染以减少 drawcall 数量。
 *
 * 核心导出：
 *   - createAllBuildings(scene)   一次性创建并添加所有建筑到场景
 */
import * as THREE from 'three'
// Canvas 文字工具：createFlatTextPlane 用于固定朝向标牌，createTextSprite 用于悬浮楼名标签
import { createFlatTextPlane, createTextSprite } from './TextSprite.js'

/**
 * 创建楼名悬浮标签（始终面向相机的 Sprite 文字）
 * @param {string} text       - 标签文字内容
 * @param {number[]} position - 标签世界坐标 [x, y, z]
 * @param {number} fontSize   - 基础字号倍数（默认 1.2）
 * @returns {THREE.Sprite}
 */
function createLabel(text, position, fontSize = 1.2) {
  const label = createTextSprite(text, {
    fontSize: Math.round(fontSize * 48),
    color: '#ffffff',
    backgroundColor: 'rgba(10,22,40,0.35)',
    borderColor: 'rgba(148,163,184,0.18)',
    borderWidth: 2,
    borderRadius: 12,
    paddingX: 16,
    paddingY: 8,
    worldHeight: fontSize * 1.25,
    depthTest: false,
  })
  label.position.set(...position)
  return label
}

/**
 * 使用 InstancedMesh 批量创建网格排列的窗户
 * 所有窗户共用一个 drawcall，大幅减少 GPU 渲染开销
 * @param {THREE.Object3D} parent - 父级 3D 对象（窗户实例将添加到其上）
 * @param {Object} config         - 窗户布局配置
 * @param {number} config.cols    - 列数
 * @param {number} config.rows    - 行数
 * @param {number} config.startX  - 第一列中心 X 坐标
 * @param {number} config.startY  - 第一行中心 Y 坐标
 * @param {number} config.z       - 窗户所在墙面的 Z 坐标
 * @param {number} config.width   - 单个窗户宽度
 * @param {number} config.height  - 单个窗户高度
 * @param {number} config.gapX    - 列间距
 * @param {number} config.gapY    - 行间距
 * @param {string} [config.color='#87ceeb'] - 窗户颜色（默认天蓝色）
 */
function createWindows(parent, config) {
  const { cols, rows, startX, startY, z, width, height, gapX, gapY, color = '#87ceeb' } = config
  const winGeo = new THREE.BoxGeometry(width, height, 0.15)
  const winMat = new THREE.MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.15,
  })
  const count = cols * rows
  const inst = new THREE.InstancedMesh(winGeo, winMat, count)
  const m = new THREE.Matrix4()
  let idx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      m.makeTranslation(startX + c * gapX, startY + r * gapY, z)
      inst.setMatrixAt(idx++, m)
    }
  }
  inst.instanceMatrix.needsUpdate = true
  inst.matrixAutoUpdate = false
  parent.add(inst)
}

/**
 * 调度中心 - 改为一层带有大块透明玻璃的现代房
 */
function createDispatchCenter() {
  const group = new THREE.Group()

  // 底部基座
  const baseGeo = new THREE.BoxGeometry(14.5, 0.4, 12.5)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#2c3e50'})
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 0.2, 0)
  base.receiveShadow = true
  group.add(base)

  // 顶部雨棚/平屋顶
  const roofGeo = new THREE.BoxGeometry(14.5, 0.6, 12.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#34495e' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 8.3, 0)
  roof.castShadow = true
  group.add(roof)

  // 四周的承重骨架柱
  const pillarGeo = new THREE.BoxGeometry(0.6, 12.0, 0.6)
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const coords = [[6.9, 5.9], [6.9, -5.9], [-6.9, 5.9], [-6.9, -5.9]]
  coords.forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(px, 2.2, pz)
    pillar.castShadow = true
    group.add(pillar)
  })

  // 正反面细骨架
  const thinPillarGeo = new THREE.BoxGeometry(0.2, 12.0, 0.2)
  const thinCoords = [[2.3, 5.9], [-2.3, 5.9], [2.3, -5.9], [-2.3, -5.9]]
  thinCoords.forEach(([px, pz]) => {
    const thinPillar = new THREE.Mesh(thinPillarGeo, pillarMat)
    thinPillar.position.set(px, 2.2, pz)
    group.add(thinPillar)
  })

  // 透明大玻璃围护结构
  const glassGeo = new THREE.BoxGeometry(14, 12, 12)
  const glassMat = new THREE.MeshLambertMaterial({
    color: '#87ceeb',
    transparent: true,
    opacity: 0.4, // 大透明效果
    side: THREE.DoubleSide
  })
  const glass = new THREE.Mesh(glassGeo, glassMat)
  glass.position.set(0, 2.2, 0)
  group.add(glass)

  // 内部模拟简单设备台
  const innerStandGeo = new THREE.BoxGeometry(6, 1, 4)
  const innerStandMat = new THREE.MeshLambertMaterial({ color: '#2c3e50', emissive: '#1abc9c', emissiveIntensity: 0.2 })
  const innerStand = new THREE.Mesh(innerStandGeo, innerStandMat)
  innerStand.position.set(0, 0.9, 0)
  group.add(innerStand)

  // 保留一个微缩的调度天线
  const antennaGeo = new THREE.CylinderGeometry(0.08, 0.08, 3)
  const antennaMat = new THREE.MeshLambertMaterial({ color: '#cccccc' })
  const antenna = new THREE.Mesh(antennaGeo, antennaMat)
  antenna.position.set(0, 6.1, 0)
  group.add(antenna)

  // 保留天线球
  const radarGeo = new THREE.SphereGeometry(0.8, 12, 8)
  const radarMat = new THREE.MeshLambertMaterial({ color: '#e0e8f0' })
  const radar = new THREE.Mesh(radarGeo, radarMat)
  radar.position.set(0, 7.8, 0)
  group.add(radar)

  // 名称标签
  group.add(createLabel('调度中心', [0, 12, -6.5], 1.5))

  return group
}

/**
 * 宿舍楼 - 6层
 */
function createDormitory() {
  const group = new THREE.Group()

  // 6层主体
  const bodyGeo = new THREE.BoxGeometry(18, 20, 10)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#c05555' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 10, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 底层裙楼
  const baseGeo = new THREE.BoxGeometry(18.5, 3, 10.5)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#8b3a3a' })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 1.5, 0)
  group.add(base)

  // 窗户 - 正反面各 6 层，密集的宿舍窗（模拟阳台感）
  createWindows(group, {
    cols: 7, rows: 6, startX: -7.5, startY: 3.5, z: -5.1,
    width: 0.9, height: 1.5, gapX: 2.5, gapY: 2.8, color: '#ffe4b5',
  })
  createWindows(group, {
    cols: 7, rows: 6, startX: -7.5, startY: 3.5, z: 5.1,
    width: 0.9, height: 1.5, gapX: 2.5, gapY: 2.8, color: '#ffe4b5',
  })

  // 大门
  const doorGeo = new THREE.BoxGeometry(4, 3, 0.3)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#5a2020' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1.5, -5.2)
  group.add(door)

  // 屋顶
  const roofGeo = new THREE.BoxGeometry(18.5, 0.4, 10.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#555555' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 20.2, 0)
  group.add(roof)

  group.add(createLabel('宿舍楼', [0, 15, -5.2], 1.5))

  return group
}

/**
 * 乘务店 - 住宿/休息楼
 */
function createCrewQuarters() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(12, 12, 10)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#c05555' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 6, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 底层
  const baseGeo = new THREE.BoxGeometry(12.5, 3, 10.5)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#8b3a3a' })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 1.5, 0)
  group.add(base)

  // 窗户 - 正面（小窗，宿舍风格）
  createWindows(group, {
    cols: 5, rows: 3, startX: -4.5, startY: 4.5, z: -5.1,
    width: 0.9, height: 1.2, gapX: 2.2, gapY: 2.5, color: '#ffd700',
  })
  // 窗户 - 背面
  createWindows(group, {
    cols: 5, rows: 3, startX: -4.5, startY: 4.5, z: 5.1,
    width: 0.9, height: 1.2, gapX: 2.2, gapY: 2.5, color: '#ffd700',
  })

  // 大门
  const doorGeo = new THREE.BoxGeometry(2.5, 3, 0.3)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#5a2020' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1.5, -5.2)
  group.add(door)

  // 屋顶
  const roofGeo = new THREE.BoxGeometry(13, 0.4, 11)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#555555' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 12.2, 0)
  group.add(roof)

  group.add(createLabel('乘务店', [0, 8, -5.2], 1.3))

  return group
}

/**
 * 小配电房
 */
function createPowerRoom() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(5, 3, 6)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#ecf0f1' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 1.5, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 平屋顶
  const roofGeo = new THREE.BoxGeometry(5.4, 0.3, 6.4)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#7f8c8d' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 3.15, 0)
  roof.castShadow = true
  group.add(roof)

  // 门 (高压危险标志常用铁门)
  const doorGeo = new THREE.BoxGeometry(2, 2.2, 0.1)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#34495e' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1.1, -3.05)
  group.add(door)

  // 墙上的通风百叶窗
  const louverGeo = new THREE.BoxGeometry(1.5, 0.8, 0.1)
  const louverMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const louver1 = new THREE.Mesh(louverGeo, louverMat)
  louver1.position.set(1.5, 2, 3.05)
  group.add(louver1)

  const louver2 = new THREE.Mesh(louverGeo, louverMat)
  louver2.position.set(-1.5, 2, 3.05)
  group.add(louver2)

  // 加上黄色的高压警示牌
  const signGeo = new THREE.BoxGeometry(1, 0.6, 0.15)
  const signMat = new THREE.MeshLambertMaterial({ color: '#f1c40f' })
  const sign = new THREE.Mesh(signGeo, signMat)
  sign.position.set(0, 2.5, -3.05)
  group.add(sign)

  group.add(createLabel('配电房', [0, 4.5, -3.2], 1.2))

  return group
}

/**
 * 设备楼 - 中型技术楼，屋顶有设备
 */
function createEquipmentBuilding() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(14, 12, 10)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#6b7b8d' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 6, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 窗户 - 正面
  createWindows(group, {
    cols: 5, rows: 4, startX: -5.5, startY: 3, z: -5.1,
    width: 1.2, height: 1.4, gapX: 2.6, gapY: 2.5,
  })
  // 窗户 - 背面
  createWindows(group, {
    cols: 5, rows: 4, startX: -5.5, startY: 3, z: 5.1,
    width: 1.2, height: 1.4, gapX: 2.6, gapY: 2.5,
  })

  // 屋顶
  const roofGeo = new THREE.BoxGeometry(14.5, 0.4, 10.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#555' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 12.2, 0)
  group.add(roof)

  // 屋顶空调外机（2个方盒）
  const acGeo = new THREE.BoxGeometry(2.5, 2, 2)
  const acMat = new THREE.MeshLambertMaterial({ color: '#999' })
  const ac1 = new THREE.Mesh(acGeo, acMat)
  ac1.position.set(-4, 13.4, 0)
  group.add(ac1)
  const ac2 = new THREE.Mesh(acGeo, acMat)
  ac2.position.set(4, 13.4, 0)
  group.add(ac2)

  group.add(createLabel('设备楼', [0, 8, -5.2], 1.3))

  return group
}

/**
 * 检修车间 - 大型厂房，拱顶结构
 */
function createMaintenanceWorkshop() {
  const group = new THREE.Group()

  // 主体（宽大低矮厂房）
  const bodyGeo = new THREE.BoxGeometry(30, 8, 16)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#5a7a6a' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 4, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 拱顶（半圆柱模拟）
  const archGeo = new THREE.CylinderGeometry(8.5, 8.5, 30, 12, 1, false, 0, Math.PI)
  const archMat = new THREE.MeshLambertMaterial({ color: '#4a6a5a', side: THREE.DoubleSide })
  const arch = new THREE.Mesh(archGeo, archMat)
  arch.rotation.set(0, 0, Math.PI / 2)
  arch.position.set(0, 8, 0)
  group.add(arch)

  // 卷帘门（3个大门）
  const doorGeo = new THREE.BoxGeometry(5, 5.5, 0.3)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#8a9a8a' })
  for (let i = 0; i < 3; i++) {
    const door = new THREE.Mesh(doorGeo, doorMat)
    door.position.set(-10 + i * 10, 2.75, -8.15)
    group.add(door)
  }

  // 侧面窗（高窗采光）
  createWindows(group, {
    cols: 8, rows: 1, startX: -12, startY: 6, z: -8.15,
    width: 1.8, height: 1.0, gapX: 3.2, gapY: 0,
  })

  // 屋顶通风器
  const ventGeo = new THREE.BoxGeometry(2, 1.5, 16)
  const ventMat = new THREE.MeshLambertMaterial({ color: '#6a8a7a' })
  const vent = new THREE.Mesh(ventGeo, ventMat)
  vent.position.set(0, 9.5, 0)
  group.add(vent)

  group.add(createLabel('检修车间', [0, 6, -8.2], 1.6))

  return group
}

/**
 * 食堂 - 单层宽建筑，有特色屋顶
 */
function createCanteen() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(14, 6, 10)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#c9a96e' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 3, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 底部裙楼
  const baseGeo = new THREE.BoxGeometry(14.5, 1.5, 10.5)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#8a7a5a' })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 0.75, 0)
  group.add(base)

  // 大窗户（食堂落地窗）
  createWindows(group, {
    cols: 5, rows: 1, startX: -5, startY: 3.5, z: -5.1,
    width: 1.8, height: 2.5, gapX: 2.5, gapY: 0, color: '#ffe4b5',
  })
  createWindows(group, {
    cols: 5, rows: 1, startX: -5, startY: 3.5, z: 5.1,
    width: 1.8, height: 2.5, gapX: 2.5, gapY: 0, color: '#ffe4b5',
  })

  // 大门
  const doorGeo = new THREE.BoxGeometry(3, 3, 0.3)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#6a5a3a' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1.5, -5.15)
  group.add(door)

  // 坡屋顶（两面坡）
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-7.5, 0)
  roofShape.lineTo(0, 2.5)
  roofShape.lineTo(7.5, 0)
  roofShape.lineTo(-7.5, 0)
  const roofExtrudeGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 11, bevelEnabled: false })
  const roofMat = new THREE.MeshLambertMaterial({ color: '#8b4513' })
  const roof = new THREE.Mesh(roofExtrudeGeo, roofMat)
  roof.position.set(0, 6, -5.5)
  group.add(roof)

  group.add(createLabel('食堂', [0, 5, -5.2], 1.3))

  return group
}

/**
 * 办公楼 - 6层（食堂后面）
 */
function createOfficeBuilding() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(18, 20, 12)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#8a9aab'})
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 10, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 窗户 - 正面
  createWindows(group, {
    cols: 7, rows: 6, startX: -7.5, startY: 3.5, z: -6.1,
    width: 1.2, height: 1.8, gapX: 2.5, gapY: 2.8,
  })
  // 窗户 - 背面
  createWindows(group, {
    cols: 7, rows: 6, startX: -7.5, startY: 3.5, z: 6.1,
    width: 1.2, height: 1.8, gapX: 2.5, gapY: 2.8,
  })

  // 大门
  const doorGeo = new THREE.BoxGeometry(4, 3, 0.3)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1.5, -6.15)
  group.add(door)

  // 屋顶
  const roofGeo = new THREE.BoxGeometry(18.5, 0.5, 12.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#4a5568' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 20.25, 0)
  group.add(roof)

  group.add(createLabel('办公楼', [0, 16, -6.2], 1.5))

  return group
}

/**
 * 材料楼 - 6层（基于办公楼改造）
 */
function createMaterialsBuilding() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(18, 20, 12)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#f39c12' }) // 工程黄/橙
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 10, 3)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 底部基座加宽加厚便于卸货
  const baseGeo = new THREE.BoxGeometry(18.5, 2, 12.5)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#555555' })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 1, 3)
  group.add(base)

  // 1楼货运大卷帘门
  const doorGeo = new THREE.BoxGeometry(4, 4, 0.2)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#bdc3c7' })
  const door1 = new THREE.Mesh(doorGeo, doorMat)
  door1.position.set(-4, 2, -3.3)
  group.add(door1)

  const door2 = new THREE.Mesh(doorGeo, doorMat)
  door2.position.set(4, 2, -3.3)
  group.add(door2)

  // 窗户 - 2到6楼
  createWindows(group, {
    cols: 7, rows: 5, startX: -7.5, startY: 6, z: -3.1,
    width: 1.0, height: 1.5, gapX: 2.5, gapY: 2.8,
  })
  createWindows(group, {
    cols: 7, rows: 5, startX: -7.5, startY: 6, z: 3.1,
    width: 1.0, height: 1.5, gapX: 2.5, gapY: 2.8,
  })

  // 屋顶
  const roofGeo = new THREE.BoxGeometry(18.5, 0.4, 12.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#e67e22' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 20.2, 3)
  group.add(roof)

  group.add(createLabel('材料楼', [0, 16, -3.2], 1.5))

  return group
}

//送、加修材料库房
function createMaterialWarehouse() {
  const group = new THREE.Group()

  const W = 14   // 宽度 (X)
  const H = 9    // 高度 (Y)
  const D = 10   // 深度 (Z)

  // === 主体墙面（灰白色波纹钢板效果） ===
  const bodyGeo = new THREE.BoxGeometry(W, H, D)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#b8c4d0' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, H / 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // === 底部基座 ===
  const baseGeo = new THREE.BoxGeometry(W + 0.5, 0.6, D + 0.5)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#4a5a6a' })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 0.3, 0)
  group.add(base)

  // === 蓝色坡屋顶 ===
  const roofShape = new THREE.Shape()
  const roofPeak = 2.0
  const roofOverhang = 0.6
  roofShape.moveTo(-W / 2 - roofOverhang, 0)
  roofShape.lineTo(0, roofPeak)
  roofShape.lineTo(W / 2 + roofOverhang, 0)
  roofShape.closePath()

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: D + roofOverhang * 2, bevelEnabled: false })
  const roofMat = new THREE.MeshLambertMaterial({
    color: '#4a7aab',
    side: THREE.DoubleSide,
  })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, H, -D / 2 - roofOverhang)
  group.add(roof)

  // === 屋脊 ===
  const ridgeGeo = new THREE.BoxGeometry(0.3, 0.2, D + roofOverhang * 2)
  const ridgeMat = new THREE.MeshLambertMaterial({ color: '#5a7a8a' })
  const ridge = new THREE.Mesh(ridgeGeo, ridgeMat)
  ridge.position.set(0, H + roofPeak, 0)
  group.add(ridge)

  // === 卷帘门（正面2个并排） ===
  const doorGeo = new THREE.BoxGeometry(4, 4, 0.2)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#8a9aaa' })
  ;[-3.5, 3.5].forEach(x => {
    const door = new THREE.Mesh(doorGeo, doorMat)
    door.position.set(x, 2, -D / 2 - 0.1)
    group.add(door)
  })

  // === 背面高窗 ===
  createWindows(group, {
    cols: 3, rows: 1, startX: -4, startY: 3.5, z: D / 2 + 0.1,
    width: 1.5, height: 0.8, gapX: 3.5, gapY: 0, color: '#87ceeb',
  })

  // === 侧面通风百叶窗 ===
  createWindows(group, {
    cols: 1, rows: 2, startX: -W / 2 - 0.1, startY: 2, z: -2,
    width: 0.1, height: 0.8, gapX: 0, gapY: 1.5, color: '#5a6a7a',
  })
  createWindows(group, {
    cols: 1, rows: 2, startX: W / 2 + 0.1, startY: 2, z: 2,
    width: 0.1, height: 0.8, gapX: 0, gapY: 1.5, color: '#5a6a7a',
  })

  // === 标签 ===
  group.add(createLabel('送、加修\n材料库房', [0, H + roofPeak + 1.5, -D / 2 - 1], 1.2))

  return group
}

/**
 * 电瓶车充电棚
 */
function createChargingShed() {
  const group = new THREE.Group()

  const length = 12
  const depth = 6
  const height = 3.5

  // 混凝土地面
  const floorGeo = new THREE.BoxGeometry(length, 0.2, depth)
  const floorMat = new THREE.MeshLambertMaterial({ color: '#bdc3c7' })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.position.set(-23, 0.1, -8.5)
  group.add(floor)

  // 4根金属支撑柱
  const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, height)
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const pxs = [-length/2 + 0.5, length/2 - 0.5]
  const pzs = [-depth/2 + 0.5, depth/2 - 0.5]
  pxs.forEach(px => {
    pzs.forEach(pz => {
      const p = new THREE.Mesh(pillarGeo, pillarMat)
      p.position.set(px-23, height/2, pz-8.5)
      group.add(p)
    })
  })

  // 顶棚 (略带倾斜)
  const roofGeo = new THREE.BoxGeometry(length + 1, 0.1, depth + 1.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#2980b9'}) // 蓝色棚顶
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(-23, height+0.3, -8.5)
  roof.rotation.x = Math.PI / 24 // 稍微倾斜，用于排水效果
  group.add(roof)

  // 中间充电隔离墙 / 充电设备板
  const boardGeo = new THREE.BoxGeometry(length - 2, 1.2, 0.2)
  const boardMat = new THREE.MeshLambertMaterial({ color: '#7f8c8d' })
  const board = new THREE.Mesh(boardGeo, boardMat)
  board.position.set(-23, 1, -8.5)
  group.add(board)

  // 简易绿色电瓶车模型方块
  const bikeGeo = new THREE.BoxGeometry(1.5, 0.8, 0.6)
  const bikeMat = new THREE.MeshLambertMaterial({ color: '#27ae60' })
  // 放几辆车在前后
  for(let x = -length/2 + 2; x <= length/2 - 2; x += 2.5) {
    if (Math.random() > 0.3) {
      const b1 = new THREE.Mesh(bikeGeo, bikeMat)
      b1.position.set(x-23, 0.5, -10)
      group.add(b1)
    }
    if (Math.random() > 0.3) {
      const b2 = new THREE.Mesh(bikeGeo, bikeMat)
      b2.position.set(x-23, 0.5, -7)
      group.add(b2)
    }
  }

  group.add(createLabel('电瓶车棚', [-23, height + 1.5, -8.5], 1.2))

  return group
}

/**
 * 厂内机动车棚 - 带顶棚的开放式停车棚
 * @param {string} label - 车棚标签文字
 * @param {number} shedW - 车棚宽度 (X)
 * @param {number} shedD - 车棚深度 (Z)
 */
function createVehicleShed(label, vehicles, shedW, shedD) {
  const group = new THREE.Group()
  const height = 4
  const pillarH = height

  // 混凝土地面
  const floorGeo = new THREE.BoxGeometry(shedW + 1, 0.15, shedD + 1)
  const floorMat = new THREE.MeshLambertMaterial({ color: '#aab5b8' })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.position.set(0, 0.075, 0)
  floor.receiveShadow = true
  group.add(floor)

  // 金属支撑柱（四角+中间）
  const pillarGeo = new THREE.CylinderGeometry(0.12, 0.12, pillarH)
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#3a4a5a' })
  const xPositions = [-shedW / 2 + 0.4, shedW / 2 - 0.4]
  const zPositions = [-shedD / 2 + 0.4, shedD / 2 - 0.4]
  xPositions.forEach(px => {
    zPositions.forEach(pz => {
      const p = new THREE.Mesh(pillarGeo, pillarMat)
      p.position.set(px, pillarH / 2, pz)
      group.add(p)
    })
  })

  // 中间加一排立柱
  if (shedW > 6) {
    const midPillar = new THREE.Mesh(pillarGeo, pillarMat)
    midPillar.position.set(0, pillarH / 2, -shedD / 2 + 0.4)
    group.add(midPillar)
    const midPillar2 = new THREE.Mesh(pillarGeo, pillarMat)
    midPillar2.position.set(0, pillarH / 2, shedD / 2 - 0.4)
    group.add(midPillar2)
  }

  // 三角顶棚（蓝色金属，屋脊沿深度方向延伸）
  const roofPeak = 1.8
  const roofOverhang = 0.6
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-shedW / 2 - roofOverhang, 0)
  roofShape.lineTo(0, roofPeak)
  roofShape.lineTo(shedW / 2 + roofOverhang, 0)
  roofShape.closePath()

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: shedD + roofOverhang * 2, bevelEnabled: false })
  const roofMat = new THREE.MeshLambertMaterial({ color: '#3a7ab5', side: THREE.DoubleSide })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, pillarH, -shedD / 2 - roofOverhang)
  group.add(roof)

  // 屋脊压条
  const ridgeGeo = new THREE.BoxGeometry(0.2, 0.15, shedD + roofOverhang * 2)
  const ridgeMat = new THREE.MeshLambertMaterial({ color: '#2a5a8a' })
  const ridge = new THREE.Mesh(ridgeGeo, ridgeMat)
  ridge.position.set(0, pillarH + roofPeak, 0)
  group.add(ridge)

  // 左右围墙（灰色金属波纹板，前后通透）
  const wallH = 2.5
  const wallMat = new THREE.MeshLambertMaterial({ color: '#8a9aaa' })
  const wallGeo = new THREE.BoxGeometry(0.1, wallH, shedD + 0.4)
  const leftWall = new THREE.Mesh(wallGeo, wallMat)
  leftWall.position.set(-shedW / 2 - 0.2, wallH / 2, 0)
  group.add(leftWall)
  const rightWall = new THREE.Mesh(wallGeo, wallMat)
  rightWall.position.set(shedW / 2 + 0.2, wallH / 2, 0)
  group.add(rightWall)

  group.add(createLabel(label, [0, pillarH + roofPeak + 1, -shedD / 2 - 1], 1.2))

  return group
}

/**
 * 绘制沥青道路（带中心虚线和边沿白线）
 * @param {number} x - 中心X
 * @param {number} z - 中心Z
 * @param {number} w - 路面宽度
 * @param {number} l - 路段长度
 * @param {boolean} isXAxis - 是否横向(沿X轴宽路)
 */
function createRoad(x, z, w, l, isXAxis) {
  const group = new THREE.Group()
  group.position.set(x, 0.015, z) // 微高于地表

  // 沥青路面
  const roadGeo = isXAxis ? new THREE.BoxGeometry(l, 0.02, w) : new THREE.BoxGeometry(w, 0.02, l)
  const roadMat = new THREE.MeshLambertMaterial({ color: '#3b3b3b' })
  const road = new THREE.Mesh(roadGeo, roadMat)
  road.receiveShadow = true
  group.add(road)

  // 黄色虚线 (中心分隔线)
  const lineGeo = isXAxis ? new THREE.BoxGeometry(2, 0.025, 0.2) : new THREE.BoxGeometry(0.2, 0.025, 2)
  const lineMat = new THREE.MeshLambertMaterial({ color: '#f1c40f' })
  const segments = Math.floor(l / 4)
  for(let i=0; i<segments; i++) {
    const offset = -l/2 + 2 + i * 4
    const line = new THREE.Mesh(lineGeo, lineMat)
    if(isXAxis) line.position.set(offset, 0, 0)
    else line.position.set(0, 0, offset)
    group.add(line)
  }

  // 白色实线边线
  const borderGeo = isXAxis ? new THREE.BoxGeometry(l, 0.025, 0.15) : new THREE.BoxGeometry(0.15, 0.025, l)
  const borderMat = new THREE.MeshLambertMaterial({ color: '#ecf0f1' })

  const b1 = new THREE.Mesh(borderGeo, borderMat)
  const b2 = new THREE.Mesh(borderGeo, borderMat)
  if(isXAxis) {
    b1.position.set(0, 0, -w/2 + 0.4)
    b2.position.set(0, 0, w/2 - 0.4)
  } else {
    b1.position.set(-w/2 + 0.4, 0, 0)
    b2.position.set(w/2 - 0.4, 0, 0)
  }
  group.add(b1)
  group.add(b2)

  return group
}

/**
 * 创建90°转弯道路（带中心虚线和边沿白线）
 * 支持4轴向共8种方向的90°转弯，与createRoad宽度、颜色、线型完全一致
 * @param {number} cx - 弯道圆心X坐标（位于转弯内侧角点）
 * @param {number} cz - 弹道圆心Z坐标（位于转弯内侧角点）
 * @param {number} w - 路面宽度（与createRoad一致）
 * @param {string} dir - 转弯方向:
 *   'ZtoX'   = 从+Z向+X左转   |  '-ZtoX'  = 从-Z向+X右转
 *   'Zto-X'  = 从+Z向-X右转   |  '-Zto-X' = 从-Z向-X左转
 *   'XtoZ'   = 从+X向+Z右转   |  'Xto-Z'  = 从+X向-Z左转
 *   '-XtoZ'  = 从-X向+Z左转   |  '-Xto-Z' = 从-X向-Z右转
 */
function createTurnedRoad(cx, cz, w, dir) {
  const group = new THREE.Group()
  const turnR = Math.max(w * 0.6, 3)
  const rIn = turnR
  const rOut = turnR + w

  const DIR_MAP = {
    'ZtoX':   { a0: Math.PI / 2, a1: 0,            cw: false },
    'Zto-X':  { a0: Math.PI / 2, a1: Math.PI,      cw: true },
    'XtoZ':   { a0: 0,           a1: Math.PI / 2,  cw: true },
    'Xto-Z':  { a0: 0,           a1: -Math.PI / 2, cw: false },
    '-XtoZ':  { a0: Math.PI,     a1: Math.PI / 2,  cw: false },
    '-Xto-Z': { a0: Math.PI,     a1: -Math.PI / 2, cw: true },
    '-ZtoX':  { a0: -Math.PI / 2,a1: 0,            cw: true },
    '-Zto-X': { a0: -Math.PI / 2,a1: Math.PI,      cw: false },
  }
  const cfg = DIR_MAP[dir] || DIR_MAP['ZtoX']
  const { a0, a1, cw } = cfg

  function arcPt(r, a) {
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  }

  const p0Outer = arcPt(rOut, a0)
  const p1Outer = arcPt(rOut, a1)
  const p1Inner = arcPt(rIn, a1)
  const p0Inner = arcPt(rIn, a0)

  // ========== 路面 ==========
  const roadShape = new THREE.Shape()
  roadShape.moveTo(p0Outer.x, p0Outer.y)
  roadShape.absarc(0, 0, rOut, a0, a1, !cw)
  roadShape.lineTo(p1Inner.x, p1Inner.y)
  roadShape.absarc(0, 0, rIn, a1, a0, cw)
  roadShape.closePath()
  const roadGeo = new THREE.ExtrudeGeometry(roadShape, { depth: 0.02, bevelEnabled: false })
  const roadMat = new THREE.MeshLambertMaterial({ color: '#3b3b3b' })
  const road = new THREE.Mesh(roadGeo, roadMat)
  road.rotation.x = Math.PI / 2
  road.position.y = 0.015
  road.receiveShadow = true
  group.add(road)

  // ========== 关键修复：da 取 a1-a0 的最短路径（归一化到 [-π, π]）==========
  let da = a1 - a0
  if (da > Math.PI) da -= Math.PI * 2
  if (da < -Math.PI) da += Math.PI * 2

  const rCenter = rIn + w / 2
  const arcLen = Math.abs(rCenter * da)
  const segCount = Math.max(Math.floor(arcLen / 4), 3)
  const lineMat = new THREE.MeshLambertMaterial({ color: '#f1c40f' })

  // ========== 黄线：在XY平面画，整体旋转（与路面完全一致）==========
  const yellowLineGroup = new THREE.Group()
  for (let i = 0; i < segCount; i++) {
    const t0 = i / segCount
    const t1 = (i + 0.45) / segCount
    const as_ = a0 + da * t0
    const ae = a0 + da * t1

    const sx1 = rCenter * Math.cos(as_), sy1 = rCenter * Math.sin(as_)
    const sx2 = rCenter * Math.cos(ae), sy2 = rCenter * Math.sin(ae)

    const sdx = sx2 - sx1, sdy = sy2 - sy1
    const len = Math.sqrt(sdx * sdx + sdy * sdy)
    if (len < 0.001) continue

    const dash = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.12, 0.02),
        lineMat
    )
    dash.position.set((sx1 + sx2) / 2, (sy1 + sy2) / 2, 0)
    dash.rotation.z = Math.atan2(sdy, sdx)
    yellowLineGroup.add(dash)
  }
  yellowLineGroup.rotation.x = Math.PI / 2
  yellowLineGroup.position.y = 0.02
  group.add(yellowLineGroup)

  // ========== 白线：同样在XY平面画，整体旋转 ==========
  const borderMat = new THREE.MeshLambertMaterial({ color: '#ecf0f1' })

  function makeArcLineXY(r) {
    const pts = []
    const segments = 48
    for (let i = 0; i <= segments; i++) {
      const a = a0 + da * (i / segments)
      pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0))
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.001)
    return new THREE.TubeGeometry(curve, segments, 0.075, 6, false)
  }

  const whiteLineGroup = new THREE.Group()

  const bOuter = new THREE.Mesh(makeArcLineXY(rOut - 0.4), borderMat)
  bOuter.position.z = 0.025
  whiteLineGroup.add(bOuter)

  const bInner = new THREE.Mesh(makeArcLineXY(rIn + 0.4), borderMat)
  bInner.position.z = 0.025
  whiteLineGroup.add(bInner)

  whiteLineGroup.rotation.x = Math.PI / 2
  group.add(whiteLineGroup)

  group.position.set(cx, 0, cz)
  return group
}

/**
 * 高颜值的 Low-Poly (低面体风格) 树木
 */
function createTree() {
  const group = new THREE.Group()

  // 树干 (上细下粗的圆台)
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.35, 1.8, 6)
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#5d4037' })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = 0.9
  trunk.castShadow = true
  group.add(trunk)

  // 树冠群 (由3个不同大小的错落多面体堆叠而成，更显蓬松茂密)
  const colorBases = ['#2ecc71', '#27ae60', '#229954']
  const leavesMat = new THREE.MeshLambertMaterial({
    color: colorBases[Math.floor(Math.random()*colorBases.length)],
    flatShading: true // 开启平面着色，增强 Low-Poly 的高级切面阴影质感
  })

  // 1. 主树冠
  const geo1 = new THREE.IcosahedronGeometry(1.2, 0)
  const l1 = new THREE.Mesh(geo1, leavesMat)
  l1.position.set(0, 2.5, 0)
  l1.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
  l1.castShadow = true

  // 2. 侧边辅助树冠 A
  const geo2 = new THREE.IcosahedronGeometry(0.8, 0)
  const l2 = new THREE.Mesh(geo2, leavesMat)
  l2.position.set(0.6, 2.0, 0.4)
  l2.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
  l2.castShadow = true

  // 3. 侧边辅助树冠 B
  const geo3 = new THREE.IcosahedronGeometry(0.9, 0)
  const l3 = new THREE.Mesh(geo3, leavesMat)
  l3.position.set(-0.7, 2.1, -0.3)
  l3.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
  l3.castShadow = true

  group.add(l1, l2, l3)

  // 整体基础缩放与随机旋转围绕树干避免死板
  const scale = 0.5 + Math.random() * 0.4
  group.scale.set(scale, scale, scale)
  group.rotation.y = Math.random() * Math.PI * 2

  return group
}

/**
 * 结构更丰富的高光景观花坛 / 绿化带
 * @param {number} length - 绿化带长
 * @param {number} width - 宽
 */
function createFlowerBed(length, width = 2) {
  const group = new THREE.Group()

  // 肥沃的泥土基座
  const soilGeo = new THREE.BoxGeometry(width - 0.1, 0.2, length - 0.1)
  const soilMat = new THREE.MeshLambertMaterial({ color: '#3e2723' })
  const soil = new THREE.Mesh(soilGeo, soilMat)
  soil.position.y = 0.1
  group.add(soil)

  // 大理石质感外沿边框石条
  const borderMat = new THREE.MeshLambertMaterial({ color: '#ecf0f1' })
  const bL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, length), borderMat)
  bL.position.set(-width/2, 0.175, 0)
  group.add(bL)

  const bR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, length), borderMat)
  bR.position.set(width/2, 0.175, 0)
  group.add(bR)

  const bT = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.15), borderMat)
  bT.position.set(0, 0.175, -length/2)
  group.add(bT)

  const bB = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.15), borderMat)
  bB.position.set(0, 0.175, length/2)
  group.add(bB)

  // 灌木与多层次散布点缀
  const bushGeo = new THREE.IcosahedronGeometry(0.35, 0) // 圆润的小灌木多面体
  const flowerCols = ['#ff7675', '#feca57', '#a29bfe', '#fd79a8', '#55efc4', '#ff9f43'] // 高级莫兰迪色系鲜花
  const greens = ['#2ecc71', '#1abc9c', '#27ae60']

  // 极大增加植物的种植密度
  const countZ = Math.floor(length / 0.5)
  const countX = Math.floor(width / 0.5)

  for(let i=0; i<countX; i++) {
    for(let j=0; j<countZ; j++) {
      // 植被生成率高达70%，拒绝稀疏
      if (Math.random() > 0.3) {
        const isFlower = Math.random() > 0.75 // 25%几率为彩色花簇
        const useColor = isFlower
            ? flowerCols[Math.floor(Math.random() * flowerCols.length)]
            : greens[Math.floor(Math.random() * greens.length)]

        const mat = new THREE.MeshLambertMaterial({
          color: useColor,
          flatShading: true,
        })

        const bush = new THREE.Mesh(bushGeo, mat)

        // 均匀网格+随机微调的错落排布
        const posX = -width/2 + 0.3 + i*0.5 + (Math.random()-0.5)*0.3
        const posZ = -length/2 + 0.3 + j*0.5 + (Math.random()-0.5)*0.3

        bush.position.set(posX, 0.3 + Math.random()*0.1, posZ)
        bush.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)

        // 彩色鲜花体型稍微娇小一点，绿色主灌木圆润饱满
        let sc = isFlower ? (0.4 + Math.random()*0.4) : (0.7 + Math.random()*0.5)
        bush.scale.set(sc, sc, sc)
        group.add(bush)

        // 为灌木增加伴生的小“侧芽”或小花蕾，增加细节真实与繁茂感
        if (Math.random() > 0.5) {
          const subBush = bush.clone()
          subBush.position.set(posX + 0.2*Math.sign(Math.random()-0.5), 0.25, posZ + 0.2*Math.sign(Math.random()-0.5))
          subBush.scale.set(sc*0.6, sc*0.6, sc*0.6)
          group.add(subBush)
        }
      }
    }
  }

  return group
}

/**
 * 检修作业顶棚 (超高透不遮挡车顶)
 * w: 跨度(柱到柱的横向距离), d: 纵向长度
 */
function createMaintenanceCanopy(w, d) {
  const group = new THREE.Group()

  const h = 5.5 // 顶棚高度，高于列车

  // 1. 结构立柱 (沿两侧阵列)
  const pillarGeo = new THREE.BoxGeometry(0.3, h, 0.3)
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#2980b9' }) // 蓝色工业柱

  const zInterval = 20
  const zStart = -d/2 + 2
  const zEnd = d/2 - 2

  for (let z = zStart; z <= zEnd; z += zInterval) {
    const pL = new THREE.Mesh(pillarGeo, pillarMat)
    pL.position.set(-w/2, h/2, z)
    group.add(pL)

    const pR = new THREE.Mesh(pillarGeo, pillarMat)
    pR.position.set(w/2, h/2, z)
    group.add(pR)

    // 拱形金属桁架支撑
    const archRadius = w / 2
    const archHeight = 6.0
    const archBeamGeo = new THREE.CylinderGeometry(archRadius, archRadius, 0.3, 16, 1, true, 0, Math.PI)
    const archBeam = new THREE.Mesh(archBeamGeo, pillarMat)
    archBeam.scale.set(1, 1, archHeight / archRadius)
    archBeam.rotation.x = -Math.PI / 2
    archBeam.rotation.y = -Math.PI / 2
    archBeam.position.set(0, h, z)
    archBeam.material = pillarMat.clone()
    archBeam.material.side = THREE.DoubleSide
    group.add(archBeam)
  }

  // 2. 纵向主梁
  const longBeamGeo = new THREE.BoxGeometry(0.3, 0.3, d)
  const beamL = new THREE.Mesh(longBeamGeo, pillarMat)
  beamL.position.set(-w/2, h, 0)
  group.add(beamL)

  const beamR = new THREE.Mesh(longBeamGeo, pillarMat)
  beamR.position.set(w/2, h, 0)
  group.add(beamR)

  // const beamM = new THREE.Mesh(longBeamGeo, pillarMat)
  // beamM.position.set(0, h + 2.0, 0) // 作为拱顶的脊檩
  // group.add(beamM)

  // 3. 登顶作业步道 (马道) - 设于两侧立柱顶与中轴梁上方，完全避开列车正上方视线
  const walkGeo = new THREE.BoxGeometry(1.6, 0.05, d) // 宽1.6米的钢格板步道
  const walkMat = new THREE.MeshLambertMaterial({ color: '#34495e' })

  const walkL = new THREE.Mesh(walkGeo, walkMat)
  walkL.position.set(-w/2, h + 0.15, 0) // 左柱马道
  group.add(walkL)

  const walkR = new THREE.Mesh(walkGeo, walkMat)
  walkR.position.set(w/2, h + 0.15, 0) // 右柱马道
  group.add(walkR)

  const walkM = new THREE.Mesh(walkGeo, walkMat)
  walkM.position.set(0, h + 0.15, 0) // 中轴马道（仍处于桁架下方/基线高度），保证有落脚点
  group.add(walkM)

  // 4. 超高透拱形玻璃顶棚 (流线型拱顶防雨且毫不阻挡视线)
  const glassRadius = w / 2 + 0.1
  const glassHeight = 6.1
  const glassGeo = new THREE.CylinderGeometry(glassRadius, glassRadius, d + 1, 24, 1, true, 0, Math.PI)
  const glassMat = new THREE.MeshLambertMaterial({
    color: '#d6eaf8',
    transparent: true,
    opacity: 0.32, // 确保俯视看下层的车厢毫无障碍
    side: THREE.DoubleSide
  })
  const glass = new THREE.Mesh(glassGeo, glassMat)
  glass.scale.set(1, 1, glassHeight / glassRadius)
  glass.rotation.x = -Math.PI / 2
  glass.rotation.y = -Math.PI / 2
  glass.position.set(0, h, 0)
  group.add(glass)

  // 悬空标识牌 - 挂在脊檩略下位置
  group.add(createLabel('3-4道登顶作业棚', [0, h + 3.0, -d/2 + 20], 1.2))
  group.add(createLabel('3-4道登顶作业棚', [0, h + 3.0, 0], 1.2))
  group.add(createLabel('3-4道登顶作业棚', [0, h + 3.0, d/2 - 20], 1.2))

  // 彻底阻断自身及其所有子组件（玻璃、骨架、标识等）的射线检测响应！
  // 以便在上帝视角/俯视视角能够完美直接穿透玻璃，点选下方的列车和股道信息。
  group.traverse((child) => {
    // 置空射线拾取函数
    child.raycast = function () {}
  })

  return group
}

/**
 * 篮球场
 */
function createBasketballCourt() {
  const group = new THREE.Group()

  // 地面
  const planeGeo = new THREE.BoxGeometry(8, 0.2, 14)
  const planeMat = new THREE.MeshLambertMaterial({ color: '#48824f' }) // 绿色场地
  const plane = new THREE.Mesh(planeGeo, planeMat)
  plane.position.set(0, 0.1, 4)
  plane.receiveShadow = true
  group.add(plane)

  // 罚球区（红色）等可以用材质拼接或者加个小的板子模拟
  const centerGeo = new THREE.BoxGeometry(3, 0.25, 3)
  const centerMat = new THREE.MeshLambertMaterial({ color: '#c24b3a' })
  const center1 = new THREE.Mesh(centerGeo, centerMat)
  center1.position.set(0, 0.1, -1.5)
  group.add(center1)

  const center2 = new THREE.Mesh(centerGeo, centerMat)
  center2.position.set(0, 0.1, 9.5)
  group.add(center2)

  // 篮球架 - 南北两端
  const createHoop = () => {
    const hoopGrp = new THREE.Group()
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.5)
    const poleMat = new THREE.MeshLambertMaterial({ color: '#666' })
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(0, 1.75, 0)
    hoopGrp.add(pole)

    const boardGeo = new THREE.BoxGeometry(1.8, 1.2, 0.1)
    const boardMat = new THREE.MeshLambertMaterial({ color: '#fff' })
    const board = new THREE.Mesh(boardGeo, boardMat)
    board.position.set(0, 3, 0.4)
    hoopGrp.add(board)
    return hoopGrp
  }

  const hoop1 = createHoop()
  hoop1.position.set(0, 0, -2.8)
  group.add(hoop1)

  const hoop2 = createHoop()
  hoop2.position.set(0, 0, 10.8)
  hoop2.rotation.y = Math.PI
  group.add(hoop2)

  // 增加铁丝围网
  const fH = 3.5 // 围栏高度
  const netMat = new THREE.MeshLambertMaterial({
    color: '#7f8c8d',
    transparent: true,
    opacity: 0.35, // 半透明网状效果
    side: THREE.DoubleSide
  })
  const poleMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })

  // 前后网面
  const fNetZ = new THREE.BoxGeometry(8, fH, 0.05)
  const netz1 = new THREE.Mesh(fNetZ, netMat)
  netz1.position.set(0, fH/2, -3)
  group.add(netz1)
  const netz2 = new THREE.Mesh(fNetZ, netMat)
  netz2.position.set(0, fH/2, 11)
  group.add(netz2)

  // 左右网面
  const fNetX = new THREE.BoxGeometry(0.05, fH, 14)
  const netx1 = new THREE.Mesh(fNetX, netMat)
  netx1.position.set(-4, fH/2, 4)
  group.add(netx1)
  const netx2 = new THREE.Mesh(fNetX, netMat)
  netx2.position.set(4, fH/2, 4)
  group.add(netx2)

  // 围栏支撑柱
  const fPoleGeo = new THREE.CylinderGeometry(0.08, 0.08, fH)
  for (let x = -4; x <= 4; x += 4) {
    for(let z = -7; z <= 7; z += 3.5) {
      const fp = new THREE.Mesh(fPoleGeo, poleMat)
      fp.position.set(x, fH/2, z+4)
      group.add(fp)
    }
  }
  for (let z = -7; z <= 7; z += 14) {
    for (let x = -2; x <= 2; x += 2) {
      const fp = new THREE.Mesh(fPoleGeo, poleMat)
      fp.position.set(x, fH/2, z+4)
      group.add(fp)
    }
  }

  group.add(createLabel('篮球场', [0, 5, 4], 1.2))

  return group
}

/**
 * 乒乓球台
 */
function createTableTennisCourt() {
  const group = new THREE.Group()

  // 场地地面
  const planeGeo = new THREE.BoxGeometry(6, 0.1, 8)
  const planeMat = new THREE.MeshLambertMaterial({ color: '#b95147' }) // 红色塑胶地
  const plane = new THREE.Mesh(planeGeo, planeMat)
  plane.position.set(0, 0.05, 0)
  plane.receiveShadow = true
  group.add(plane)

  const createTable = () => {
    const tableGrp = new THREE.Group()

    // 桌面
    const boardGeo = new THREE.BoxGeometry(1.5, 0.05, 2.7)
    const boardMat = new THREE.MeshLambertMaterial({ color: '#135c96' }) // 蓝色桌面
    const board = new THREE.Mesh(boardGeo, boardMat)
    board.position.set(0, 0.76, 0)
    board.castShadow = true
    tableGrp.add(board)

    // 桌腿
    const legGeo = new THREE.BoxGeometry(1.2, 0.76, 0.1)
    const legMat = new THREE.MeshLambertMaterial({ color: '#333' })
    const leg1 = new THREE.Mesh(legGeo, legMat)
    leg1.position.set(0, 0.38, -1.0)
    tableGrp.add(leg1)
    const leg2 = new THREE.Mesh(legGeo, legMat)
    leg2.position.set(0, 0.38, 1.0)
    tableGrp.add(leg2)

    // 球网
    const netGeo = new THREE.BoxGeometry(1.5, 0.15, 0.02)
    const netMat = new THREE.MeshLambertMaterial({ color: '#e0e0e0', transparent: true, opacity: 0.8 })
    const net = new THREE.Mesh(netGeo, netMat)
    net.position.set(0, 0.86, 0)
    tableGrp.add(net)

    return tableGrp
  }

  const table1 = createTable()
  table1.position.set(-1.5, 0, 0)
  group.add(table1)

  const table2 = createTable()
  table2.position.set(1.5, 0, 0)
  group.add(table2)

  group.add(createLabel('乒乓球台', [0, 2, 0], 1.2))

  return group
}

/**
 * 消防泵房
 */
function createFirePumpRoom() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(6, 4, 8)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#7f8c8d' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 红色大门 (双开门，方便设备进出)
  const doorGeo = new THREE.BoxGeometry(3, 2.8, 0.2)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#c0392b' }) // 消防红
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1.4, -4.05)
  group.add(door)

  // 门上的通风百叶窗
  const louverGeo = new THREE.BoxGeometry(2.5, 0.6, 0.25)
  const louverMat = new THREE.MeshLambertMaterial({ color: '#333' })
  const louver = new THREE.Mesh(louverGeo, louverMat)
  louver.position.set(0, 2.2, -4.02)
  group.add(louver)

  // 屋顶室外管道/水箱
  const tankGeo = new THREE.CylinderGeometry(1, 1, 3)
  const tankMat = new THREE.MeshLambertMaterial({ color: '#c0392b' })
  const tank = new THREE.Mesh(tankGeo, tankMat)
  tank.rotation.z = Math.PI / 2
  tank.position.set(0, 4.5, 0)
  group.add(tank)

  // 管道支架
  const supportGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5)
  const supportMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const support1 = new THREE.Mesh(supportGeo, supportMat)
  support1.position.set(-1, 3.5, 0)
  group.add(support1)

  const support2 = new THREE.Mesh(supportGeo, supportMat)
  support2.position.set(1, 3.5, 0)
  group.add(support2)

  group.add(createLabel('消防泵房', [0, 6, -4.2], 1.2))

  return group
}

/**
 * 空压室 - 小型设备房
 */
function createAirCompressorRoom() {
  const group = new THREE.Group()

  const W = 3    // 宽度
  const H = 4    // 高度（与消防泵房一致）
  const D = 4    // 深度

  // 主体
  const bodyGeo = new THREE.BoxGeometry(W, H, D)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#7f8c8d' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, H / 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 平屋顶
  const roofGeo = new THREE.BoxGeometry(W + 0.3, 0.2, D + 0.3)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#546e7a' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, H, 0)
  group.add(roof)

  // 正面小门
  const doorGeo = new THREE.BoxGeometry(1.2, 2, 0.1)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#37474f' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1, -D / 2 - 0.05)
  group.add(door)

  // 侧面通风百叶窗
  const louverGeo = new THREE.BoxGeometry(0.1, 0.6, 0.6)
  const louverMat = new THREE.MeshLambertMaterial({ color: '#455a64' })
  const louver = new THREE.Mesh(louverGeo, louverMat)
  louver.position.set(-W / 2 - 0.05, 1.8, 0)
  group.add(louver)

  const louver2 = new THREE.Mesh(louverGeo, louverMat)
  louver2.position.set(W / 2 + 0.05, 1.8, 0)
  group.add(louver2)

  // 屋顶排气管/小型通风管
  const ventGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8)
  const ventMat = new THREE.MeshLambertMaterial({ color: '#78909c' })
  const vent = new THREE.Mesh(ventGeo, ventMat)
  vent.position.set(0.8, H + 0.5, 0)
  group.add(vent)

  return group
}

/**
 * 380v地面电源箱 - 轨道旁小型配电设备
 */
function createGroundPowerBox() {
  const group = new THREE.Group()

  // 箱体主体
  const boxGeo = new THREE.BoxGeometry(1.8, 1.2, 0.6)
  const boxMat = new THREE.MeshLambertMaterial({ color: '#8a8783' })
  const body = new THREE.Mesh(boxGeo, boxMat)
  body.position.set(0, 0.6, 0)
  body.castShadow = true
  group.add(body)

  // 正面面板（深灰色）
  const panelGeo = new THREE.BoxGeometry(1.65, 0.9, 0.05)
  const panelMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const panel = new THREE.Mesh(panelGeo, panelMat)
  panel.position.set(0, 0.65, -0.32)
  group.add(panel)

  // 顶部散热格栅/帽檐
  const capGeo = new THREE.BoxGeometry(1.9, 0.08, 0.7)
  const capMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.set(0, 1.2, 0)
  group.add(cap)

  // 底座
  const baseGeo = new THREE.BoxGeometry(1.9, 0.1, 0.7)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#34495e' })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 0.05, 0)
  group.add(base)

  // 侧面380V标识（红色小方块）
  const signGeo = new THREE.BoxGeometry(0.02, 0.2, 0.2)
  const signMat = new THREE.MeshLambertMaterial({ color: '#e74c3c', emissive: '#e74c3c', emissiveIntensity: 0.2 })
  const sign = new THREE.Mesh(signGeo, signMat)
  sign.position.set(0.9, 0.7, 0)
  group.add(sign)

  return group
}

// 污水处理中心
function createWaterTreatmentPlant() {
  const group = new THREE.Group()

  // === 主控楼（灰白色） ===
  const officeGeo = new THREE.BoxGeometry(8, 4, 10)
  const officeMat = new THREE.MeshLambertMaterial({ color: '#8b8f91' })
  const office = new THREE.Mesh(officeGeo, officeMat)
  office.position.set(0, 2, -50)
  office.castShadow = true
  office.receiveShadow = true
  group.add(office)

  // 主控楼屋顶
  const officeRoofGeo = new THREE.BoxGeometry(8.5, 0.3, 10.5)
  const officeRoofMat = new THREE.MeshLambertMaterial({ color: '#233d4a' })
  const officeRoof = new THREE.Mesh(officeRoofGeo, officeRoofMat)
  officeRoof.position.set(0, 4.15, -50)
  group.add(officeRoof)

  // === 大型圆形处理池 左前 ===
  const tankGeo = new THREE.CylinderGeometry(3, 3, 4, 16)
  const tankMat = new THREE.MeshLambertMaterial({ color: '#59646a' })
  const tank1 = new THREE.Mesh(tankGeo, tankMat)
  tank1.position.set(-6, 2, -55)
  tank1.castShadow = true
  group.add(tank1)

  // 处理池内壁（浅蓝色水面效果）
  const waterGeo = new THREE.CircleGeometry(2.7, 16)
  const waterMat = new THREE.MeshLambertMaterial({
    color: '#296d8c',
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  })
  const water1 = new THREE.Mesh(waterGeo, waterMat)
  water1.rotation.x = -Math.PI / 2
  water1.position.set(-6, 4.1, -55)
  group.add(water1)

  // === 大型圆形处理池 右前 ===
  const tank2 = new THREE.Mesh(tankGeo, tankMat)
  tank2.position.set(6, 2, -55)
  tank2.castShadow = true
  group.add(tank2)

  const water2 = new THREE.Mesh(waterGeo, waterMat)
  water2.rotation.x = -Math.PI / 2
  water2.position.set(6, 4.1, -55)
  group.add(water2)

  // === 中型圆形处理池 左后 ===
  const tankSmallGeo = new THREE.CylinderGeometry(2, 2, 3.5, 16)
  const tankSmallMat = new THREE.MeshLambertMaterial({ color: '#516067' })
  const tank3 = new THREE.Mesh(tankSmallGeo, tankSmallMat)
  tank3.position.set(-5, 1.75, -45)
  tank3.castShadow = true
  group.add(tank3)

  const waterSmallGeo = new THREE.CircleGeometry(1.7, 16)
  const water3 = new THREE.Mesh(waterSmallGeo, waterMat)
  water3.rotation.x = -Math.PI / 2
  water3.position.set(-5, 3.6, -45)
  group.add(water3)

  // === 中型圆形处理池 右后 ===
  const tank4 = new THREE.Mesh(tankSmallGeo, tankSmallMat)
  tank4.position.set(5, 1.75, -45)
  tank4.castShadow = true
  group.add(tank4)

  const water4 = new THREE.Mesh(waterSmallGeo, waterMat)
  water4.rotation.x = -Math.PI / 2
  water4.position.set(5, 3.6, -45)
  group.add(water4)

  // === 管道连接系统 ===
  const pipeGeo = new THREE.CylinderGeometry(0.25, 0.25, 6, 8)
  const pipeMat = new THREE.MeshLambertMaterial({ color: '#434749' })
  // 主控楼到左前池
  const pipe1 = new THREE.Mesh(pipeGeo, pipeMat)
  pipe1.rotation.z = Math.PI / 2
  pipe1.position.set(-3, 1, -53)
  group.add(pipe1)

  // 主控楼到右前池
  const pipe2 = new THREE.Mesh(pipeGeo, pipeMat)
  pipe2.rotation.z = Math.PI / 2
  pipe2.position.set(3, 1, -53)
  group.add(pipe2)

  // 前后池连接管
  const pipe3 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), pipeMat)
  pipe3.rotation.x = Math.PI / 2
  pipe3.position.set(-6, 1, -50)
  group.add(pipe3)

  const pipe4 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), pipeMat)
  pipe4.rotation.x = Math.PI / 2
  pipe4.position.set(6, 1, -50)
  group.add(pipe4)

  // === 围墙 ===
  const wallMat = new THREE.MeshLambertMaterial({ color: '#636e73' })
  const wallW = 19   // 围墙总宽度 (X方向)
  const wallD = 18   // 围墙总深度 (Z方向)
  const wallH = 2    // 围墙高度
  const wallT = 0.3  // 围墙厚度

  // 前墙
  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallT), wallMat)
  frontWall.position.set(0, wallH / 2, -wallD / 2-50)
  frontWall.receiveShadow = true
  group.add(frontWall)

  // 后墙
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallT), wallMat)
  backWall.position.set(0, wallH / 2, wallD / 2-50)
  backWall.receiveShadow = true
  group.add(backWall)

  // 左墙
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, wallD), wallMat)
  leftWall.position.set(-wallW / 2, wallH / 2, -50)
  leftWall.receiveShadow = true
  group.add(leftWall)

  // 右墙
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, wallD), wallMat)
  rightWall.position.set(wallW / 2, wallH / 2, -50)
  rightWall.receiveShadow = true
  group.add(rightWall)

  // === 标签 ===
  group.add(createLabel('污水处理中心', [0, 6, -50], 1.3))

  return group
}

// 排污中心
function createSewageCenter() {
  const group = new THREE.Group()

  // 主体建筑 (长方形厂房)
  const bodyGeo = new THREE.BoxGeometry(8, 5, 12)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#607d8b' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(14, 2.5, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 屋顶 (略带坡度效果)
  const roofGeo = new THREE.BoxGeometry(8.5, 0.5, 12.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#455a64' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(14, 5.25, 0)
  group.add(roof)

  // 圆形处理罐1
  const tankGeo1 = new THREE.CylinderGeometry(2, 2, 4, 16)
  const tankMat = new THREE.MeshLambertMaterial({ color: '#78909c' })
  const tank1 = new THREE.Mesh(tankGeo1, tankMat)
  tank1.position.set(19, 2, -2)
  tank1.castShadow = true
  group.add(tank1)

  // 圆形处理罐2
  const tank2 = new THREE.Mesh(tankGeo1, tankMat)
  tank2.position.set(19, 2, 3)
  tank2.castShadow = true
  group.add(tank2)

  // 管道连接
  const pipeGeo = new THREE.CylinderGeometry(0.3, 0.3, 5, 8)
  const pipeMat = new THREE.MeshLambertMaterial({ color: '#546e7a' })
  const pipe = new THREE.Mesh(pipeGeo, pipeMat)
  pipe.rotation.x = Math.PI / 2
  pipe.position.set(19, 1, 0.5)
  group.add(pipe)

  // 入口门
  const doorGeo = new THREE.BoxGeometry(2.5, 3, 0.2)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#37474f' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(14, 1.5, -6.1)
  group.add(door)

  group.add(createLabel('排污中心', [14, 7, 0], 1.2))

  return group
}

/**
 * 公共卫生间
 */
function createToilet() {
  const group = new THREE.Group()

  // 主体
  const bodyGeo = new THREE.BoxGeometry(8, 4, 6)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#bdc3c7' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 平屋顶
  const roofGeo = new THREE.BoxGeometry(8.5, 0.4, 6.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#7f8c8d' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 4.2, 0)
  roof.castShadow = true
  group.add(roof)

  // 门 (男左女右)
  const doorGeo = new THREE.BoxGeometry(1.2, 2.5, 0.1)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#34495e' })

  const doorM = new THREE.Mesh(doorGeo, doorMat)
  doorM.position.set(-2, 1.25, -3.05)
  group.add(doorM)

  const doorW = new THREE.Mesh(doorGeo, doorMat)
  doorW.position.set(2, 1.25, -3.05)
  group.add(doorW)

  // 高窗（通风、采光，私密性）
  const winGeo = new THREE.BoxGeometry(1.8, 0.8, 0.1)
  const winMat = new THREE.MeshLambertMaterial({ color: '#3498db' })

  const winM = new THREE.Mesh(winGeo, winMat)
  winM.position.set(-2, 3, 3.05) // 背面高处
  group.add(winM)

  const winW = new THREE.Mesh(winGeo, winMat)
  winW.position.set(2, 3, 3.05)
  group.add(winW)

  group.add(createLabel('公共卫生间', [0, 5, -3.2], 1.2))

  return group
}

/**
 * 创建通用围墙（任意长段）
 */
function createWallSegment(length) {
  const group = new THREE.Group()
  const wallGeo = new THREE.BoxGeometry(0.6, 3.5, length)
  const wallMat = new THREE.MeshLambertMaterial({ color: '#5a6a7a' })
  const wall = new THREE.Mesh(wallGeo, wallMat)
  wall.position.set(0, 1.75, 0)
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)

  const capGeo = new THREE.BoxGeometry(1.0, 0.3, length)
  const capMat = new THREE.MeshLambertMaterial({ color: '#3d4d5d'})
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.set(0, 3.55, 0)
  group.add(cap)

  const pillarCount = Math.floor(length / 8)
  if (length > 2) {
    const pillarGeo = new THREE.BoxGeometry(1.2, 4, 0.8)
    const pillarMat = new THREE.MeshLambertMaterial({ color: '#4a5a6a'})
    for (let i = 0; i <= pillarCount; i++) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat)
      const zPos = -length / 2 + (length * i / Math.max(1, pillarCount))
      pillar.position.set(0, 2, zPos)
      pillar.castShadow = true
      group.add(pillar)
    }
  }
  return group
}

/**
 * 创建大门（带警卫室和伸缩门）(根据实景优化版)
 */
function createGate(length) {
  const group = new THREE.Group()

  // 基础颜色设定
  const whiteMat = new THREE.MeshLambertMaterial({ color: '#f0f2f5' })
  const darkGrayMat = new THREE.MeshLambertMaterial({ color: '#888888' })
  const glassMat = new THREE.MeshLambertMaterial({
    color: '#2980b9', transparent: true, opacity: 0.6
  })

  // --- 1. 左侧主立柱 (宽厚比例调整为碑壁状) ---
  const leftPillarGrp = new THREE.Group()

  // 主碑体 (下宽上窄或直立块)
  const p1BaseGeo = new THREE.BoxGeometry(1.6, 9, 3.8) // X为厚度，Z为宽度
  const p1Base = new THREE.Mesh(p1BaseGeo, whiteMat)
  p1Base.position.set(0, 4.5, 0)
  leftPillarGrp.add(p1Base)

  // 顶部路徽底板
  const p1TopGeo = new THREE.BoxGeometry(1.4, 4.5, 3.4)
  const p1Top = new THREE.Mesh(p1TopGeo, whiteMat)
  p1Top.position.set(0, 11.25, 0)
  leftPillarGrp.add(p1Top)

  // 分隔装饰槽
  const decorGeo = new THREE.BoxGeometry(1.8, 0.3, 4.0)
  const decor = new THREE.Mesh(decorGeo, darkGrayMat)
  decor.position.set(0, 9, 0)
  leftPillarGrp.add(decor)

  // logo 贴图
  const logoTexture = new THREE.TextureLoader().load('/img/luhui.webp')
  logoTexture.colorSpace = THREE.SRGBColorSpace
  const logoPlaneGeo = new THREE.PlaneGeometry(2.8, 2.8)
  const logoPlaneMat = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, side: THREE.FrontSide })

  // 正面 logo
  const logoFront = new THREE.Mesh(logoPlaneGeo, logoPlaneMat)
  logoFront.position.set(0.82, 11.2, 0)
  logoFront.rotation.y = Math.PI / 2
  leftPillarGrp.add(logoFront)

  // 背面 logo
  const logoBackMat = logoPlaneMat.clone()
  const logoBack = new THREE.Mesh(logoPlaneGeo, logoBackMat)
  logoBack.position.set(-0.82, 11.2, 0)
  logoBack.rotation.y = -Math.PI / 2
  leftPillarGrp.add(logoBack)

  // 竖向排布大字（使用 Canvas 本地渲染，避免 troika 请求外网字体）
  const gateTitle = "成都车辆段双流南客整所"
  const startY = 8.4
  const stepY = 0.7
  for (let i = 0; i < gateTitle.length; i++) {
    const char = gateTitle[i]
    // 正面
    const textMesh = createFlatTextPlane(char, {
      fontSize: 96,
      fontWeight: '700',
      color: '#f1b306',
      worldHeight: 0.58,
      depthTest: true,
    })
    textMesh.position.set(0.85, startY - i * stepY, 0)
    textMesh.rotation.y = Math.PI / 2
    leftPillarGrp.add(textMesh)

    // 反面
    const textMeshBack = createFlatTextPlane(char, {
      fontSize: 96,
      fontWeight: '700',
      color: '#f1b306',
      worldHeight: 0.58,
      depthTest: true,
    })
    textMeshBack.position.set(-0.85, startY - i * stepY, 0)
    textMeshBack.rotation.y = -Math.PI / 2
    leftPillarGrp.add(textMeshBack)
  }

  // 放于大门左侧
  leftPillarGrp.position.set(0, 0, length / 2)
  group.add(leftPillarGrp)


  // --- 2. 顶部横梁 (扁平轻薄款) ---
  const beamLength = length + 4.5
  const beamGeo = new THREE.BoxGeometry(6.5, 0.8, beamLength)
  const beam = new THREE.Mesh(beamGeo, whiteMat)
  beam.position.set(0, 9, 0)
  beam.castShadow = true
  group.add(beam)

  // 底部射灯
  const lightGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16)
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  for(let z = -length/2 + 2; z <= length/2 - 2; z += 4) {
    // 双排灯
    const lamp1 = new THREE.Mesh(lightGeo, lightMat)
    lamp1.position.set(1.5, 8.58, z)
    group.add(lamp1)
    const lamp2 = new THREE.Mesh(lightGeo, lightMat)
    lamp2.position.set(-1.5, 8.58, z)
    group.add(lamp2)
  }


  // --- 3. 右侧细立柱和警卫室 ---
  const rightGrp = new THREE.Group()

  // 两根细柱支撑横梁
  const rPillarGeo = new THREE.BoxGeometry(0.8, 9, 0.8)
  const rPillar1 = new THREE.Mesh(rPillarGeo, whiteMat)
  rPillar1.position.set(2, 4.5, -1)
  rightGrp.add(rPillar1)

  const rPillar2 = new THREE.Mesh(rPillarGeo, whiteMat)
  rPillar2.position.set(-2, 4.5, -1)
  rightGrp.add(rPillar2)

  // 警卫室(小白平顶房)
  const guardGeo = new THREE.BoxGeometry(3.5, 3.5, 4.5)
  const guardRoom = new THREE.Mesh(guardGeo, whiteMat)
  guardRoom.position.set(0, 1.75, -4)
  rightGrp.add(guardRoom)

  // 警卫室玻璃窗 (环绕一圈的蓝窗)
  const gWinGeo = new THREE.BoxGeometry(3.6, 1.4, 3.5)
  const gWin = new THREE.Mesh(gWinGeo, glassMat)
  gWin.position.set(0, 2.0, -3.8)
  rightGrp.add(gWin)

  // 警卫室蓝色小挑檐
  const guardRoofGeo = new THREE.BoxGeometry(3.8, 0.2, 4.8)
  const guardRoofMat = new THREE.MeshLambertMaterial({ color: '#1f618d' })
  const guardRoof = new THREE.Mesh(guardRoofGeo, guardRoofMat)
  guardRoof.position.set(0, 3.6, -4)
  rightGrp.add(guardRoof)

  // 放在大门右侧
  rightGrp.position.set(0, 0, -length/2)
  group.add(rightGrp)


  // --- 4. 伸缩大门 (折叠电动门) - 简化网格以防变黑 ---
  const doorGroup = new THREE.Group()
  // 改为带点自发光的材质，避免在阴影下完全变黑
  const doorMat = new THREE.MeshLambertMaterial({ color: '#e0e6ed', emissive: '#222222' })

  const doorLen = length - 5.5
  const segCount = 8 // 减少分段数量
  const step = doorLen / segCount

  // 底部滑轨轨道
  const trackGeo = new THREE.BoxGeometry(0.8, 0.1, length)
  const trackMat = new THREE.MeshLambertMaterial({ color: '#333' })
  const track = new THREE.Mesh(trackGeo, trackMat)
  track.position.set(0, 0.05, -3)
  group.add(track)

  for(let i=0; i<segCount; i++) {
    // 粗竖杠
    const vBarGeo = new THREE.BoxGeometry(0.3, 1.4, 0.2)
    const vBar = new THREE.Mesh(vBarGeo, doorMat)
    vBar.position.set(0, 0.75, i * step)
    doorGroup.add(vBar)

    // 简单的水平交叉杆模拟
    if (i < segCount - 1) {
      const hBarGeo = new THREE.BoxGeometry(0.1, 0.1, step)
      const hBar = new THREE.Mesh(hBarGeo, doorMat)
      hBar.position.set(0, 1.0, i * step + step/2)
      doorGroup.add(hBar)
    }
  }

  // 电动门头部机箱
  const doorHeadGeo = new THREE.BoxGeometry(0.6, 1.5, 0.6)
  const doorHead = new THREE.Mesh(doorHeadGeo, doorMat)
  doorHead.position.set(0, 0.8, doorLen)
  doorGroup.add(doorHead)

  // LED显示屏
  const ledGeo = new THREE.BoxGeometry(0.65, 0.3, 0.4)
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ff0000' })
  const led = new THREE.Mesh(ledGeo, ledMat)
  led.position.set(0, 1.2, doorLen)
  doorGroup.add(led)

  // 伸缩门从左侧柱子旁开始伸出
  doorGroup.position.set(0, 0, -length/2 + 4)
  group.add(doorGroup)

  return group
}

/**
 * 创建带大字的加高围墙 (配合大门的白色墙体风格)
 */
function createTallWallWithText(length, text) {
  const group = new THREE.Group()

  // 白色/浅灰墙体，高度统一
  const wallGeo = new THREE.BoxGeometry(0.8, 5, length-5)
  const wallMat = new THREE.MeshLambertMaterial({ color: '#e8ecef' })
  const wall = new THREE.Mesh(wallGeo, wallMat)
  wall.position.set(0, 2.5, +2)
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)

  // 墙顶压条 (深灰色，防积水)
  const capGeo = new THREE.BoxGeometry(1.2, 0.3, length -4.8)
  const capMat = new THREE.MeshLambertMaterial({ color: '#555555' })
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.set(0, 5.15, +2)
  group.add(cap)

  // 墙上的大方柱
  const pillarGeo = new THREE.BoxGeometry(1.4, 5.4, 1.4)
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#d0d3d4' })

  const pillar1 = new THREE.Mesh(pillarGeo, pillarMat)
  pillar1.position.set(0, 2.7, -length/2+1.7)
  group.add(pillar1)

  const pillar2 = new THREE.Mesh(pillarGeo, pillarMat)
  pillar2.position.set(0, 2.7, length/2)
  group.add(pillar2)

  // 这里可以作为留白或者贴一点宣传海报
  const posterGeo = new THREE.BoxGeometry(0.9, 3, length * 0.4)
  const posterMat = new THREE.MeshBasicMaterial({ color: '#e74c3c' }) // 模拟个红底宣传栏
  const poster = new THREE.Mesh(posterGeo, posterMat)
  poster.position.set(0.05, 2.5, +2.5)
  group.add(poster)

  return group
}

//客运洗涤中心
function createLaundryCenter() {
  const group = new THREE.Group()

  const W = 57   // 宽度
  const H = 10   // 高度
  const D = 14   // 深度

  // === 灰色板材墙面主体 ===
  const bodyGeo = new THREE.BoxGeometry(W, H, D)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#c6cdd3' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, H / 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // === 浅蓝色三角形大棚顶 ===
  const roofShape = new THREE.Shape()
  const roofOverhang = 1
  const roofPeak = 3.5
  roofShape.moveTo(-W / 2 - roofOverhang, 0)
  roofShape.lineTo(0, roofPeak)
  roofShape.lineTo(W / 2 + roofOverhang, 0)
  roofShape.closePath()

  const roofExtrudeSettings = { depth: D + roofOverhang * 2, bevelEnabled: false }
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, roofExtrudeSettings)
  const roofMat = new THREE.MeshLambertMaterial({
    color: '#2a7f30',
    side: THREE.DoubleSide,
  })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, H, -D / 2 - roofOverhang)
  group.add(roof)

  // 屋顶屋脊压条
  const ridgeGeo = new THREE.BoxGeometry(0.4, 0.3, D + roofOverhang * 2)
  const ridgeMat = new THREE.MeshLambertMaterial({ color: '#6a7a8a' })
  const ridge = new THREE.Mesh(ridgeGeo, ridgeMat)
  ridge.position.set(0, H + roofPeak, 0)
  group.add(ridge)

  // === 通风管（屋顶上2根平行的圆管）===
  const ventPipeGeo = new THREE.CylinderGeometry(0.5, 0.5, W * 0.6)
  const ventPipeMat = new THREE.MeshLambertMaterial({ color: '#b0b8c0'})
  const pipeZ = [-3, 3]
  pipeZ.forEach(z => {
    const pipe = new THREE.Mesh(ventPipeGeo, ventPipeMat)
    pipe.rotation.z = Math.PI / 2
    pipe.position.set(0, H + roofPeak * 0.5, z)
    group.add(pipe)
  })

  // === 排风扇（屋顶两侧各一组）===
  const fanGeo = new THREE.BoxGeometry(1.2, 0.4, 1.2)
  const fanMat = new THREE.MeshLambertMaterial({ color: '#c8d0d8'})
  const fanDuctGeo = new THREE.CylinderGeometry(0.6, 0.8, 1.5)
  const fanDuctMat = new THREE.MeshLambertMaterial({ color: '#9aa0a8' })

  ;[-5, 5].forEach(x => {
    const fan = new THREE.Mesh(fanGeo, fanMat)
    fan.position.set(x, H + roofPeak * 0.3, 0)
    group.add(fan)

    const duct = new THREE.Mesh(fanDuctGeo, fanDuctMat)
    duct.position.set(x, H + roofPeak * 0.3 - 0.8, 0)
    group.add(duct)
  })

  // 墙面排风扇（正面墙上2个）
  const wallFanGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2)
  const wallFanMat = new THREE.MeshLambertMaterial({ color: '#6a7a8a' })
  ;[-6, 6].forEach(x => {
    const wf = new THREE.Mesh(wallFanGeo, wallFanMat)
    wf.position.set(x, H * 0.6, -D / 2 - 0.1)
    group.add(wf)
  })

  // === 前大门（正面-Z方向）===
  const doorGeo = new THREE.BoxGeometry(5, 5.5, 0.3)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#5a6a7a' })
  const door1 = new THREE.Mesh(doorGeo, doorMat)
  door1.position.set(0, 2.75, -D / 2 - 0.15)
  group.add(door1)

  // 大门两侧的小门
  const sideDoorGeo = new THREE.BoxGeometry(1.5, 3, 0.15)
  const sideDoorMat = new THREE.MeshLambertMaterial({ color: '#4a5a6a' })
  const sideDoorL = new THREE.Mesh(sideDoorGeo, sideDoorMat)
  sideDoorL.position.set(-7.5, 1.5, -D / 2 - 0.15)
  group.add(sideDoorL)
  const sideDoorR = new THREE.Mesh(sideDoorGeo, sideDoorMat)
  sideDoorR.position.set(7.5, 1.5, -D / 2 - 0.15)
  group.add(sideDoorR)

  // === 后大门（背面+Z方向）===
  const door2 = new THREE.Mesh(doorGeo, doorMat)
  door2.position.set(0, 2.75, D / 2 + 0.15)
  group.add(door2)

  // === 标签：距离建筑前方（-Z方向）一点 ===
  group.add(createLabel('客运洗涤中心', [0, H + roofPeak + 1.5, -D / 2 - 1], 1.5))

  return group
}

/**
 * 客运办公楼 - 与宿舍楼同结构，不同配色
 * 6层，白色墙面、蓝色玻璃窗，现代风格
 */
function createPassengerOffice() {
  const group = new THREE.Group()

  // 6层主体
  const bodyGeo = new THREE.BoxGeometry(38, 20, 10)
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#e8eef5' })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 10, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 底层裙楼
  const baseGeo = new THREE.BoxGeometry(38.5, 3, 10.5)
  const baseMat = new THREE.MeshLambertMaterial({ color: '#8a9aaa' })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(0, 1.5, 0)
  group.add(base)

  // 窗户 - 正反面各 6 层（蓝色玻璃）
  createWindows(group, {
    cols: 14, rows: 6, startX: -16.5, startY: 3.5, z: -5.1,
    width: 0.9, height: 1.5, gapX: 2.5, gapY: 2.8, color: '#6ba3d6',
  })
  createWindows(group, {
    cols: 14, rows: 6, startX: -16.5, startY: 3.5, z: 5.1,
    width: 0.9, height: 1.5, gapX: 2.5, gapY: 2.8, color: '#6ba3d6',
  })

  // 大门
  const doorGeo = new THREE.BoxGeometry(4, 3, 0.3)
  const doorMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' })
  const door = new THREE.Mesh(doorGeo, doorMat)
  door.position.set(0, 1.5, -5.2)
  group.add(door)

  // 屋顶
  const roofGeo = new THREE.BoxGeometry(38.5, 0.4, 10.5)
  const roofMat = new THREE.MeshLambertMaterial({ color: '#4a5568' })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 20.2, 0)
  group.add(roof)

  group.add(createLabel('客运办公楼', [0, 15, -5.2], 1.5))

  return group
}

/**
 * 消防沙地
 * 停车场右侧与道路之间的消防沙池，带红色边框、消防桶和铁锹
 */
function createFireSandLot() {
  const group = new THREE.Group()

  const sw = 16    // 沙地宽度 (X)
  const sd = 8   // 沙地深度 (Z)
  const sh = 0.35  // 沙地高度

  // === 沙地底座（粗沙材质） ===
  const sandGeo = new THREE.BoxGeometry(sw, sh, sd)
  const sandMat = new THREE.MeshLambertMaterial({ color: '#aa8d51' })
  const sand = new THREE.Mesh(sandGeo, sandMat)
  sand.position.set(0, sh / 2, 0)
  sand.receiveShadow = true
  group.add(sand)

  // === 边框 ===
  const frameMat = new THREE.MeshLambertMaterial({ color: '#514d4d'})
  const frameSegments = [
    { w: sw + 0.2, h: 0.08, d: 0.15, x: 0, z: -sd / 2 },      // 前边
    { w: sw + 0.2, h: 0.08, d: 0.15, x: 0, z: sd / 2 },       // 后边
    { w: 0.15, h: 0.08, d: sd - 0.2, x: -sw / 2, z: 0 },      // 左边
    { w: 0.15, h: 0.08, d: sd - 0.2, x: sw / 2, z: 0 },       // 右边
  ]
  frameSegments.forEach(({ w, h, d, x, z }) => {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat)
    seg.position.set(x, sh + 0.04, z)
    group.add(seg)
  })

  // === 红色立柱（四角）===
  const postMat = new THREE.MeshLambertMaterial({ color: '#dc2626' })
  const postPositions = [
    [-sw / 2, -sd / 2], [sw / 2, -sd / 2],
    [-sw / 2, sd / 2], [sw / 2, sd / 2],
  ]
  postPositions.forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), postMat)
    post.position.set(x, sh + 0.6, z)
    group.add(post)
  })

  // === 四角之间的红白警示链（用细长方体简化）===
  const chainMat = new THREE.MeshLambertMaterial({ color: '#ef4444' })
  const chainPositions = [
    { w: 0.06, h: 0.6, d: 0.06, x: -sw / 2, z: -sd / 2, rz: 0.2 },   // 前左
    { w: 0.06, h: 0.6, d: 0.06, x: sw / 2, z: -sd / 2, rz: -0.2 },  // 前右
    { w: 0.06, h: 0.6, d: 0.06, x: -sw / 2, z: sd / 2, rz: -0.2 },   // 后左
    { w: 0.06, h: 0.6, d: 0.06, x: sw / 2, z: sd / 2, rz: 0.2 },     // 后右
  ]
  chainPositions.forEach(({ w, h, d, x, z, rz }) => {
    const chain = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chainMat)
    chain.position.set(x, sh + 0.9, z)
    chain.rotation.z = rz
    group.add(chain)
  })

  // === 消防沙标识牌 ===
  const signBoardGeo = new THREE.BoxGeometry(1.5, 0.8, 0.08)
  const signBoardMat = new THREE.MeshLambertMaterial({ color: '#dc2626' })
  const signBoard = new THREE.Mesh(signBoardGeo, signBoardMat)
  signBoard.position.set(0, sh + 1.6, -sd / 2 - 0.5)
  group.add(signBoard)

  // 标识牌上的文字"消防沙"
  group.add(createLabel('消防沙', [0, sh + 1.6, -sd / 2 - 0.6], 0.55))

  // === 消防桶（2个红色锥形桶）===
  const bucketGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.5)
  const bucketMat = new THREE.MeshLambertMaterial({ color: '#ef4444' })
  const bucket2Geo = new THREE.CylinderGeometry(0.25, 0.35, 0.4)
  ;[[-1.2, -sd / 2 - 0.1], [1.2, -sd / 2 - 0.1]].forEach(([x, z]) => {
    const bucket = new THREE.Mesh(bucketGeo, bucketMat)
    bucket.position.set(x, sh + 0.25, z)
    group.add(bucket)

    const bucket2 = new THREE.Mesh(bucket2Geo, bucketMat)
    bucket2.position.set(x, sh + 0.65, z)
    group.add(bucket2)
  })

  // === 铁锹（长条）===
  const shovelMat = new THREE.MeshLambertMaterial({ color: '#8a8a8a' })
  const handleMat = new THREE.MeshLambertMaterial({ color: '#8b6914' })
  const shovel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), handleMat)
  shovel.position.set(-1.5, sh + 0.7, sd / 2 + 0.1)
  shovel.rotation.z = 0.3
  group.add(shovel)

  const shovelHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), shovelMat)
  shovelHead.position.set(-1.5, sh + 0.15, sd / 2 + 0.1)
  shovelHead.rotation.z = 0.3
  group.add(shovelHead)

  return group
}

/**
 * 停车场
 */
function createParkingLot(label = 'P1停车场', includeGround = true) {
  const group = new THREE.Group()

  // 停车场铺装层
  const w = 24
  const d = 60 // 跨越充分长度
  const planeGeo = new THREE.BoxGeometry(w, 0.1, d)
  const planeMat = new THREE.MeshLambertMaterial({ color: '#555' }) // 柏油路面
  const plane = new THREE.Mesh(planeGeo, planeMat)
  plane.position.set(-1, 0.05, 0)
  plane.receiveShadow = true
  group.add(plane)

  // 停车位白线
  const lineGeo = new THREE.BoxGeometry(4, 0.15, 0.1)
  const lineMat = new THREE.MeshLambertMaterial({ color: '#fff' })

  for(let z = -d/2 + 2; z <= d/2 - 2; z += 3) {
    // 左侧车位线
    const l1 = new THREE.Mesh(lineGeo, lineMat)
    l1.position.set(-w/2 + 1, 0.1, z)
    group.add(l1)

    // 右侧车位线
    const l2 = new THREE.Mesh(lineGeo, lineMat)
    l2.position.set(w/2 - 3, 0.1, z)
    group.add(l2)
  }

  // 停几辆车 (简单方块模型)
  const carConfigs = [
    { z: -8.5, x: -w/2 + 1, color: '#da8c25' },
    { z: -5.5, x: w/2 - 3, color: '#3477db' },
    { z: 6.5, x: -w/2 + 1, color: '#0b5a2e' },
    { z: 12.5, x: w/2 - 3, color: '#302727' },
    { z: 24, x: -w/2 + 1, color: '#9b59b6' },
  ]

  carConfigs.forEach(cfg => {
    const carGrp = new THREE.Group()

    const carBodyGeo = new THREE.BoxGeometry(3.5, 1, 1.8)
    const carBodyMat = new THREE.MeshLambertMaterial({ color: cfg.color })
    const carBody = new THREE.Mesh(carBodyGeo, carBodyMat)
    carBody.position.set(0, 0.5, 0)
    carBody.castShadow = true
    carGrp.add(carBody)

    const carTopGeo = new THREE.BoxGeometry(2, 0.8, 1.6)
    const carTopMat = new THREE.MeshLambertMaterial({ color: '#ecf0f1' })
    const carTop = new THREE.Mesh(carTopGeo, carTopMat)
    carTop.position.set(-0.2, 1.4, 0)
    carTop.castShadow = true
    carGrp.add(carTop)

    carGrp.position.set(cfg.x, 0, cfg.z)

    group.add(carGrp)
  })

  group.add(createLabel(label, [0, 4, 0], 1.5))

  // 地面层仅随 P1 添加一次，避免重复
  if (includeGround) {

    // 轨道地面railplane
    const railw = 82
    const raild = 530 // 原380，向二列位(负Z)延伸150：380+150=530
    const railGeo = new THREE.BoxGeometry(railw, 0.05, raild)
    const railMat = new THREE.MeshLambertMaterial({ color: '#5a5a5a' }) // 柏油路面
    const railplane = new THREE.Mesh(railGeo, railMat)
    railplane.position.set(82, -0.05, -30) // 原45，中心向负Z偏移75：45-75=-30
    railplane.receiveShadow = true
    group.add(railplane)
  }

  return group
}

/**
 * 创建围墙（沿轨道方向延伸的长墙）
 * @param {number} length - 围墙长度（Z方向）
 */
function createBoundaryWall(length) {
  const group = new THREE.Group()

  // 墙体主体
  const wallGeo = new THREE.BoxGeometry(0.6, 3.5, length)
  const wallMat = new THREE.MeshLambertMaterial({ color: '#5a6a7a' })
  const wall = new THREE.Mesh(wallGeo, wallMat)
  wall.position.set(6, 1.75, length / 2 - 40)
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)

  // 墙顶檐口（深色压顶）
  const capGeo = new THREE.BoxGeometry(1.0, 0.3, length)
  const capMat = new THREE.MeshLambertMaterial({ color: '#3d4d5d' })
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.set(6, 3.55, length / 2 - 40)
  group.add(cap)

  // 墙柱（每隔8米一根）
  const pillarCount = Math.floor(length / 8)
  const pillarGeo = new THREE.BoxGeometry(1.2, 4, 0.8)
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#4a5a6a' })
  for (let i = 0; i <= pillarCount; i++) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(6, 2, -40 + i * 8)
    pillar.castShadow = true
    group.add(pillar)
  }

  // 围墙标签
  group.add(createLabel('围墙', [6, 5, length / 2 -180], 1.2))

  return group
}

/**
 * 创建所有建筑物并添加到场景
 * @param {THREE.Scene} scene
 * @param {number} track1X - 1道的X坐标
 * @param {number} nLastX - n4道的X坐标
 */
export function createAllBuildings(scene, track1X, nLastX) {
  const buildings = []

  // === 右侧建筑（1道旁边，X更小的方向，一排沿Z轴排列，朝向铁路） ===
  const rightBaseX = track1X - 16
  const buildingGap = 8  // 建筑间距

  // 1. 调度大楼（玻璃单层平房，旋转90°朝向铁路）
  const dispatch = createDispatchCenter()
  const z1 = 35 // 向右（Z正向）移动，原来是20，腾出15个单位的空间给厕所
  dispatch.position.set(rightBaseX, 0, z1)
  dispatch.rotation.set(0, -Math.PI / 2, 0)
  dispatch.userData = { type: 'building', name: '调度大楼', height: 4.5 }
  scene.add(dispatch)
  buildings.push(dispatch)

  // 2. 宿舍楼（替代了以前的运用车间）
  const dormitory = createDormitory()
  const z2 = z1 + 30 + buildingGap
  dormitory.position.set(rightBaseX, 0, z2)
  dormitory.rotation.set(0, -Math.PI / 2, 0)
  dormitory.userData = { type: 'building', name: '宿舍楼', height: 20 }
  scene.add(dormitory)
  buildings.push(dormitory)

  // 3. 6层办公楼（替代了以前的健身房）
  const office2 = createOfficeBuilding()
  const z3 = z2 + 28 + buildingGap
  office2.position.set(rightBaseX, 0, z3)
  office2.rotation.set(0, -Math.PI / 2, 0)
  office2.userData = { type: 'building', name: '办公楼', height: 20 }
  scene.add(office2)
  buildings.push(office2)

  // 新增：小配电房（夹在宿舍楼和新的6层办公楼之间）
  const powerRoom = createPowerRoom()
  powerRoom.position.set(rightBaseX, 0, (z2 + z3) / 2)
  powerRoom.rotation.set(0, -Math.PI / 2, 0)
  powerRoom.userData = { type: 'building', name: '配电房', height: 3 }
  scene.add(powerRoom)
  buildings.push(powerRoom)

  // 8.1 新增：P1停车场
  const parkingLot = createParkingLot()
  const zParking = (z2 + z3) / 2
  parkingLot.position.set(rightBaseX - 30, 0, zParking)
  parkingLot.rotation.set(0, 0, 0) // 横向平行于建筑群
  parkingLot.userData = { type: 'building', name: '停车场', height: 0.1 }
  scene.add(parkingLot)
  buildings.push(parkingLot)

  // 新增：P3停车场（在P1停车场左侧）
  const parkingLot2 = createParkingLot('P3停车场', false)
  parkingLot2.position.set(rightBaseX - 30, 0, zParking + 71)
  parkingLot2.rotation.set(0, 0, 0)
  parkingLot2.userData = { type: 'building', name: 'P3停车场', height: 0.1 }
  scene.add(parkingLot2)
  buildings.push(parkingLot2)

  // 新增：消防沙地（在停车场右侧与道路之间）
  const fireSandLot = createFireSandLot()
  fireSandLot.position.set(rightBaseX - 28.5, -0.3, zParking-37)
  fireSandLot.userData = { type: 'building', name: '消防沙地', height: 0.3 }
  scene.add(fireSandLot)
  buildings.push(fireSandLot)

  // 新增：客运洗涤中心（在停车场后方）
  const laundryCenter = createLaundryCenter()
  laundryCenter.position.set(rightBaseX - 53, 0, zParking-0)
  laundryCenter.rotation.set(0, -Math.PI / 2, 0)
  laundryCenter.userData = { type: 'building', name: '客运洗涤中心', height: 14 }
  scene.add(laundryCenter)
  buildings.push(laundryCenter)

  // 新增：污水处理中心（在洗涤中心后方的马路后）
  const waterTreatmentPlant = createWaterTreatmentPlant()
  waterTreatmentPlant.position.set(-130, 0, zParking)
  waterTreatmentPlant.rotation.set(0, 0, 0)
  waterTreatmentPlant.userData = { type: 'building', name: '污水处理中心', height: 6 }
  scene.add(waterTreatmentPlant)
  buildings.push(waterTreatmentPlant)

  // 新增：客运办公楼（在洗涤中心左侧）
  const passengerOffice = createPassengerOffice()
  passengerOffice.position.set(rightBaseX - 53, 0, zParking + 60)
  passengerOffice.rotation.set(0, -Math.PI / 2, 0)
  passengerOffice.userData = { type: 'building', name: '客运办公楼', height: 20 }
  scene.add(passengerOffice)
  buildings.push(passengerOffice)

  // 4. 食堂（旋转90°朝向铁路）
  const canteen = createCanteen()
  const z4 = z3 + 24 + buildingGap
  canteen.position.set(rightBaseX, 0, z4)
  canteen.rotation.set(0, -Math.PI / 2, 0)
  canteen.userData = { type: 'building', name: '食堂', height: 6 }
  scene.add(canteen)
  buildings.push(canteen)

  // 5. 篮球场和乒乓球台 (保持原有的绝对世界坐标，调整相对z1的偏移使布局稳定)
  const basketballCourt = createBasketballCourt()
  basketballCourt.position.set(rightBaseX, 0, z1 - 57) // 35 - 57 = -22
  basketballCourt.userData = { type: 'building', name: '篮球场', height: 0.1 }
  scene.add(basketballCourt)
  buildings.push(basketballCourt)

  // 篮球场Z轴负方向：排污中心
  const sewageCenter = createSewageCenter()
  sewageCenter.position.set(rightBaseX, 0, z1 - 85) // 35 - 85 = -50
  sewageCenter.rotation.set(0, -Math.PI / 2, 0)
  sewageCenter.userData = { type: 'building', name: '排污中心', height: 5 }
  scene.add(sewageCenter)
  buildings.push(sewageCenter)

  const tableTennis = createTableTennisCourt()
  tableTennis.position.set(rightBaseX, 0, z1 - 40) // 35 - 40 = -5
  tableTennis.userData = { type: 'building', name: '乒乓球台', height: 1 }
  scene.add(tableTennis)
  buildings.push(tableTennis)

  // 新增：消防泵房 (恰好夹在乒乓球台(z=-5)和公共卫生间(z=15)的正中间，z=5)
  const firePumpRoom = createFirePumpRoom()
  firePumpRoom.position.set(rightBaseX, 0, z1 - 30) // 35 - 30 = 5
  firePumpRoom.rotation.set(0, -Math.PI / 2, 0)
  firePumpRoom.userData = { type: 'building', name: '消防泵房', height: 4.5 }
  scene.add(firePumpRoom)
  buildings.push(firePumpRoom)

  // 6. 公共卫生间 (位于消防泵房和调度大楼之间)
  const toilet = createToilet()
  toilet.position.set(rightBaseX, 0, z1 - 20) // 35 - 20 = 15，刚好在 -5 和 35 之间
  toilet.rotation.set(0, -Math.PI / 2, 0) // 朝向铁路
  toilet.userData = { type: 'building', name: '公共卫生间', height: 4.5 }
  scene.add(toilet)
  buildings.push(toilet)

  // 7. 6层材料楼
  const materialsBldg = createMaterialsBuilding()
  const z5 = z4 + 20 + buildingGap
  materialsBldg.position.set(rightBaseX, 0, z5)
  materialsBldg.rotation.set(0, -Math.PI / 2, 0)
  materialsBldg.userData = { type: 'building', name: '材料楼', height: 20 }
  scene.add(materialsBldg)
  buildings.push(materialsBldg)

  // 8. 送、加修材料库房
  const materialWarehouse = createMaterialWarehouse()
  const zWarehouse = z5 + 10
  materialWarehouse.position.set(rightBaseX, 0, zWarehouse+10)
  materialWarehouse.rotation.set(0, -Math.PI / 2, 0)
  materialWarehouse.userData = { type: 'building', name: '送加修材料库房', height: 7 }
  scene.add(materialWarehouse)
  buildings.push(materialWarehouse)

  // 9. 电瓶车充电棚 (位于材料楼的右侧，Z值更大)
  const chargingShed = createChargingShed()
  const zShed = z5 + 15 + buildingGap
  chargingShed.position.set(rightBaseX, 0, zShed)
  chargingShed.rotation.set(0, -Math.PI / 2, 0)
  chargingShed.userData = { type: 'building', name: '电瓶车棚', height: 3.5 }
  scene.add(chargingShed)
  buildings.push(chargingShed)

  // 10. 厂内机动车棚1
  const shed1 = createVehicleShed('厂内机动车棚', [
    { color: '#da8c25', x: -3, z: -3.5, w: 1.6, h: 1.0, d: 3.0, type: 'tricycle' },
    { color: '#27ae60', x: 3, z: -3.5, w: 1.6, h: 1.0, d: 3.0, type: 'tricycle' },
    { color: '#3477db', x: -3, z: 3.5, w: 1.8, h: 1.0, d: 3.0, type: 'tricycle' },
    { color: '#c0392b', x: 0, z: 0, w: 2.2, h: 1.5, d: 4.5, type: 'truck' },
  ], 10, 10)
  shed1.position.set(rightBaseX, 0, zShed + 16)
  shed1.rotation.set(0, -Math.PI / 2, 0)
  shed1.userData = { type: 'building', name: '机动车棚1', height: 5 }
  scene.add(shed1)
  buildings.push(shed1)

  // 11. 厂内机动车棚2
  const shed2 = createVehicleShed('厂内机动车棚', [
    { color: '#ecf0f1', x: -3.5, z: -3, w: 2.0, h: 1.6, d: 4.5, type: 'van' },
    { color: '#f1c40f', x: 3.5, z: -3, w: 2.0, h: 1.6, d: 4.5, type: 'van' },
    { color: '#e67e22', x: -3.5, z: 3, w: 2.0, h: 1.6, d: 4.5, type: 'van' },
    { color: '#9b59b6', x: 0, z: 0, w: 2.4, h: 1.8, d: 5.5, type: 'bus' },
    { color: '#2c3e50', x: 3.5, z: 3, w: 2.0, h: 1.6, d: 4.5, type: 'bus' },
  ], 12, 10)
  shed2.position.set(rightBaseX, 0, zShed + 30)
  shed2.rotation.set(0, -Math.PI / 2, 0)
  shed2.userData = { type: 'building', name: '机动车棚2', height: 5 }
  scene.add(shed2)
  buildings.push(shed2)

  // 空压室
  const airComp2 = createAirCompressorRoom()
  airComp2.position.set(track1X + 9, 0, -42)
  airComp2.rotation.set(0, Math.PI / 2, 0)
  airComp2.userData = { type: 'building', name: '空压室', height: 4 }
  scene.add(airComp2)
  buildings.push(airComp2)

  // 12. 新增：3/4道 登顶作业顶棚
  // 1道对应的坐标为 track1X, 轨距固定通常为 TRACK_SPACING=6
  // 3道为 track1X + 2*6 = track1X + 12
  // 4道为 track1X + 3*6 = track1X + 18
  // 顶棚跨度从3道左侧站台(通常离心-3)到4道右侧站台(+3)，总跨度12。将处于track1X + 15处
  const TRACK_SP_CONST = 6 // 硬编码与 TRACK_SPACING 值一致
  const track3X = track1X + 2 * TRACK_SP_CONST
  const track4X = track1X + 3 * TRACK_SP_CONST
  const canopyCenterX = (track3X + track4X) / 2

  // 顶棚起点在横向主干道之后 (约Z=-38)，终点在材料楼所在中轴 (z5)
  const canopyZStart = -38
  const canopyZEnd = z5 + 30
  const canopyLen = canopyZEnd - canopyZStart
  const canopyZ = (canopyZStart + canopyZEnd) / 2

  const canopy = createMaintenanceCanopy(12, canopyLen) // 跨度12
  canopy.position.set(canopyCenterX, 0, canopyZ)
  canopy.userData = { type: 'building', name: '检修天棚', height: 6.5 }
  scene.add(canopy)
  buildings.push(canopy)

  // 380v地面电源箱1
  const powerBox = createGroundPowerBox()
  powerBox.position.set(track1X + 14, 0, -62.5)
  powerBox.rotation.set(0, 0, 0)
  powerBox.userData = { type: 'building', name: '380v电源箱', height: 1.2 }
  scene.add(powerBox)
  buildings.push(powerBox)

  // 380v地面电源箱2
  const powerBox2 = createGroundPowerBox()
  powerBox2.position.set(track1X + 18, 0, -62.5)
  powerBox2.rotation.set(0, 0, 0)
  powerBox2.userData = { type: 'building', name: '380v电源箱2', height: 1.2 }
  scene.add(powerBox2)
  buildings.push(powerBox2)

  //围墙
  // === n4道右侧围墙 ===
  const wallX = nLastX + 5
  const boundaryWall = createBoundaryWall(565)
  boundaryWall.position.set(wallX, 0, -80)
  boundaryWall.userData = { type: 'building', name: '围墙', height: 4 }
  scene.add(boundaryWall)
  buildings.push(boundaryWall)

  // === 左侧封闭围墙及大门 ===
  const zWall = -55 // 红线的 Z 坐标

  // 1. 横向短墙：连接右侧围墙顶部 (Z=-40) 向左延伸至 Z=-55
  const wall1 = createWallSegment(15)
  // 中心在 (-40 + (-55)) / 2 = -47.5
  wall1.position.set(nLastX + 11, 0, -47.5)
  scene.add(wall1)
  buildings.push(wall1)

  // 2. 纵向长墙：大门上方的墙体 (加高并带有大字)
  const topX = nLastX + 5
  const gateTopX = nLastX - 2
  const len2A = topX - gateTopX+6
  if (len2A > 0) {
    const wall2A = createTallWallWithText(len2A, '双流运用车间')
    wall2A.rotation.y = Math.PI / 2
    wall2A.position.set(gateTopX + len2A / 2, 0, zWall-65)
    scene.add(wall2A)
    buildings.push(wall2A)
  }

  // 3. 大门 (门宽20)
  const gateBotX = nLastX - 22
  const gate = createGate(20)
  gate.rotation.y = Math.PI / 2
  gate.position.set((gateTopX + gateBotX) / 2+4, 0, zWall-65)
  gate.userData = { type: 'building', name: '大门', height: 3 }
  scene.add(gate)
  buildings.push(gate)

  // 4. 进门长墙：连接大门的墙体
  const bottomX = rightBaseX - 3
  const len2B = gateBotX - bottomX + 29
  if (len2B > 0) {
    const wall2B = createWallSegment(len2B)
    wall2B.rotation.y = -Math.PI / 3.8
    wall2B.position.set(bottomX + len2B / 2-19, 0, zWall-32)
    scene.add(wall2B)
    buildings.push(wall2B)
  }

  // 5. 排污后侧围墙
  const backX = rightBaseX
  const len2C = gateBotX - backX -3
  if (len2C > 0) {
    const wall2C = createWallSegment(len2C)
    wall2C.rotation.y = Math.PI
    wall2C.position.set(backX + len2C / 2-39, 0, zWall+29)
    scene.add(wall2C)
    buildings.push(wall2C)
  }

  // 6. 卫生间后侧倾斜围墙
  const toiletX = rightBaseX
  const len2D = gateBotX - toiletX +25
  if (len2D > 0) {
    const wall2D = createWallSegment(len2D)
    wall2D.rotation.y = -Math.PI/2.5
    wall2D.position.set(toiletX + len2D / 2-94, 0, zWall+71.5)
    scene.add(wall2D)
    buildings.push(wall2D)
  }

  // 7. 污水后侧围墙
  const waterX = rightBaseX
  const len2E = gateBotX - toiletX +75
  if (len2E > 0) {
    const wall2E = createWallSegment(len2E)
    wall2E.rotation.y = Math.PI
    wall2E.position.set(waterX + len2E / 2-160, 0, zWall+153)
    scene.add(wall2E)
    buildings.push(wall2E)
  }

  // 8. 客运办公楼后侧围墙
  const guestX = rightBaseX
  const len2F = gateBotX - toiletX +30
  if (len2F > 0) {
    const wall2F = createWallSegment(len2F)
    wall2F.rotation.y = Math.PI/4
    wall2F.position.set(guestX + len2F / 2-105.5, 0, zWall+253)
    scene.add(wall2F)
    buildings.push(wall2F)
  }

  // 9. 机动车棚围墙
  const backendX = rightBaseX
  const len2G = 40
  if (len2F > 0) {
    const wall2G = createWallSegment(len2G)
    wall2G.rotation.y = Math.PI
    wall2G.position.set(backendX + len2G / 2-48, 0, zWall+305)
    scene.add(wall2G)
    buildings.push(wall2G)
  }

  // 10. 机动车棚倾斜围墙
  const backendX2 = rightBaseX
  const len2G2 = 30
  if (len2G2 > 0) {
    const wall2G2 = createWallSegment(len2G2)
    wall2G2.rotation.y = Math.PI/4
    wall2G2.position.set(backendX2 + len2G2 / 2-32, 0, zWall+336)
    scene.add(wall2G2)
    buildings.push(wall2G2)
  }

  // 11. 末端围墙
  const endX = rightBaseX
  const len2H = 60
  if (len2H > 0) {
    const wall2H = createWallSegment(len2H)
    wall2H.rotation.y = Math.PI
    wall2H.position.set(endX + len2H  / 2-36, 0, zWall+376)
    scene.add(wall2H)
    buildings.push(wall2H)
  }

  // === 规划马路体系（从进门一直到建筑队伍结束） ===
  const bldgAveX = rightBaseX + 15
  const gateCenterX = (gateTopX + gateBotX) / 2

  // 1. 厂外引道 (进门外的一小截马路)
  const entryRoad = createRoad(gateCenterX+6, zWall - 70, 8, 10, false)
  scene.add(entryRoad)
  buildings.push(entryRoad)

  // 2. 迎宾大道 (穿过大门内部到横向主干道)
  const crossRoadZ = -48
  const entryAvenueLen = Math.abs(zWall - crossRoadZ)+52
  const entryAvenue = createRoad(gateCenterX+6, (zWall + crossRoadZ) / 2-40, 8, entryAvenueLen, false)
  scene.add(entryAvenue)
  buildings.push(entryAvenue)

  // 3. 厂区横向主干道
  const crossWidth = Math.abs(gateCenterX - bldgAveX) - 16.5
  const crossMidX = (gateCenterX + bldgAveX) / 2+0.5
  const crossRoad = createRoad(crossMidX+9, crossRoadZ-10, 8, crossWidth+18, true)
  scene.add(crossRoad)
  buildings.push(crossRoad)

  // 4. 建筑群纵向主干道 (分为前段、横穿段、后段，穿过调度大楼和宿舍楼中间)
  const midZ = (z1 + z2) / 2 // 穿过调度中心与宿舍楼中间的Z坐标
  const backAveX = rightBaseX - 15 // 建筑物后方的马路X坐标

  // (1) 前段主干道：从厂区横向主干道延伸到横穿点
  const frontLen = midZ - crossRoadZ-7
  const frontZ = crossRoadZ + frontLen / 2
  const frontRoad = createRoad(bldgAveX, frontZ-1.3, 8, frontLen, false)
  scene.add(frontRoad)
  buildings.push(frontRoad)

  // (2) 横穿段主干道：从楼前拐入楼后
  const crossLen = Math.abs(bldgAveX - backAveX)  // +8 覆盖宽度交接处
  const crossMidX2 = (bldgAveX + backAveX) / 2
  const middleRoad = createRoad(crossMidX2-2, midZ, 8, crossLen-12, true)
  scene.add(middleRoad)
  buildings.push(middleRoad)

  // (3) 后段主干道：从横穿点沿建筑物后方直达电瓶车棚后部
  const bldgAveLen = 310 // 加长以覆盖到最后的电瓶车棚
  const endZ = crossRoadZ + bldgAveLen
  const backLen = endZ - midZ
  const backZ = midZ + backLen / 2
  const backRoad = createRoad(backAveX, backZ-8, 8, backLen-8, false)
  scene.add(backRoad)
  buildings.push(backRoad)

  // 5. n道外侧主干道
  const frontRoad1 = createRoad(40, 145, 8, 389, false)
  scene.add(frontRoad1)
  buildings.push(frontRoad1)

  // 6. 调度后路
  const crossLen1 = 45
  const crossMidX3 = (bldgAveX + backAveX) / 2
  const middleRoad1 = createRoad(crossMidX3 - 39.8, midZ-12.6, 8, crossLen1-12, true)
  scene.add(middleRoad1)
  buildings.push(middleRoad1)

  //7. 洗涤中心后路
  const washRoad = createRoad(-114.1, 90, 8, 80, false)
  scene.add(washRoad)
  buildings.push(washRoad)

  //8.1进门右转弯道
  const leftTurnRoad = createTurnedRoad(-25.2, -49.2, 8, '-Zto-X')
  scene.add(leftTurnRoad)
  buildings.push(leftTurnRoad)

  //8.2进门左转弯道
  const rightTurnRoad = createTurnedRoad(31.2, -49.2, 8, '-ZtoX')
  scene.add(rightTurnRoad)
  buildings.push(rightTurnRoad)

  //8.3调度右转弯道
  const guideturnRoad = createTurnedRoad(-42.8, 45.2, 8, 'ZtoX')
  scene.add(guideturnRoad)
  buildings.push(guideturnRoad)

  //8.4停车场后左转弯道
  const parkingTurnRoad = createTurnedRoad(-72.8, 50.2, 8, '-ZtoX')
  scene.add(parkingTurnRoad)
  buildings.push(parkingTurnRoad)

  //8.5洗涤后左转弯道
  const washTurnRoad = createTurnedRoad(-105.3, 50.2, 8, '-Zto-X')
  scene.add(washTurnRoad)
  buildings.push(washTurnRoad)

  //9.平交道
  const crossrailRoad = createRoad(-10, 258.8, 8, 92, false)
  crossrailRoad.rotation.y = Math.PI / 2
  scene.add(crossrailRoad)
  buildings.push(crossrailRoad)

  //9.1 平交道转弯
  const crossrailTurnRoad = createTurnedRoad(-55.2, 250, 8, 'Zto-X')
  scene.add(crossrailTurnRoad)
  buildings.push(crossrailTurnRoad)

  // === 添加绿化景观 (树木与花草花坛) ===
  // 1. 建筑路边绿化带
  // 调度大楼前方小花坛 (路仍在楼前)
  const flowerBed1 = createFlowerBed(10, 2)
  flowerBed1.position.set(rightBaseX + 9, 0, z1)
  scene.add(flowerBed1)
  buildings.push(flowerBed1)

  // 宿舍楼后方长花坛 (路已转至楼后)
  const flowerBed2 = createFlowerBed(26, 2)
  flowerBed2.position.set(rightBaseX - 9, 0, z2)
  scene.add(flowerBed2)
  buildings.push(flowerBed2)


  // 2. 靠右侧(N道外)长围墙外部的树木绿化带
  const rightWallFlowerBed = createFlowerBed(160, 1.5)
  rightWallFlowerBed.position.set(wallX + 8, 0, 95)
  scene.add(rightWallFlowerBed)
  buildings.push(rightWallFlowerBed)

  for(let zT = -30; zT <= 200; zT += 12) {
    const tree = createTree()
    tree.position.set(wallX + 10, 0, zT)
    scene.add(tree)
    buildings.push(tree)
  }

  // 冻结所有建筑的矩阵
  buildings.forEach(b => {
    b.traverse(child => {
      if (child.isMesh) {
        child.matrixAutoUpdate = false
        child.updateMatrix()
      }
    })
  })

  return buildings
}
