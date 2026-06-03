/**
 * CatenaryBuilder.js — 接触网（OCS）3D 模型构建器
 *
 * 职责：
 *   - 为每条股道顶部生成真实接触网示意模型：
 *     · 承力索（catenary wire，上层钢索）
 *     · 接触线（contact wire，下层与受电弓接触）
 *     · 电杆/支柱（mast，每隔一段一根）
 *     · 腕臂/横担（cantilever，从电杆向轨道中心伸出，承载导线）
 *     · 分相绝缘器（neutral section/isolator）：一列位与二列位的电气分段点
 *   - 按列位（一列位 / 二列位）独立着色，体现"有电/无电/接地/故障"四态
 *   - 提供 setCatenaryPower(slotKey, state) 接口，运行时切换状态
 *
 * 真实参考：
 *   - 电气化铁路 AC 27.5kV 单线接触网（GB/T 标准）
 *   - 站场内典型一条股道分为多个供电段，由分段绝缘器隔开
 *
 * 与 TrackBuilder 的衔接：
 *   - layout.bufferZ ~ layout.bufferZ + layout.len 为股道 Z 轴范围
 *   - 接触网整体偏左/居中位于股道正上方（Y ≈ 5.6），X=0
 *   - 一列位段位于远端（farLabelZ 端）；二列位段位于近端（标牌/缓冲止挡端）
 */
import * as THREE from 'three'

/* ========== 真实电气化铁路尺寸参数（单位：米） ========== */
const CONTACT_WIRE_HEIGHT = 5.3       // 接触线高度（实际 5.3m，标准值）
const MESSENGER_WIRE_HEIGHT = 6.4     // 承力索高度（实际 6.4-7.0m）
const MAST_HEIGHT = 7.5               // 电杆高度
const MAST_SPACING = 90               // 电杆间距（实际 45-100m，大屏俯视取 90 以减少视觉拥挤）
const MAST_OFFSET_X = 2.4             // 电杆离轨道中心 X 偏移（站台一侧）
const WIRE_OFFSET_X = 2          // 接触网导线 X 偏移：从轨道中心偏到车厢边缘附近
const ISOLATOR_LENGTH = 3             // 分相绝缘器长度（大屏视觉压缩，避免两列位接触网断开过远）

/* ========== 状态颜色 ========== */
// 优化：增强发光颜色、亮度和光晕透明度，使接触网在大屏中更显眼
const POWER_COLORS = {
  powered:   { wire: 0xdc2626, emissive: 0xff3333, intensity: 2.2, glowOpacity: 0.45 }, // 带电：红色
  unpowered: { wire: 0x64748b, emissive: 0x000000, intensity: 0.0, glowOpacity: 0.0 }, // 失电：灰色
  grounded:  { wire: 0x00ffcc, emissive: 0x00ffaa, intensity: 2.0, glowOpacity: 0.55, glowRadius: 0.25 }, // 接地：青绿色+强光晕
  fault:     { wire: 0xfbbf24, emissive: 0xffea00, intensity: 2.5, glowOpacity: 0.5 }, // 故障：黄色高亮
}

/* ========== 共享几何体（可复用以节省显存） ========== */
// 优化：适当加粗电杆与导线，使其在远距离相机下不至于细到消失
const mastGeo = new THREE.CylinderGeometry(0.18, 0.22, MAST_HEIGHT, 6)
const mastBaseGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6)
const cantileverGeo = new THREE.BoxGeometry(0.1, 0.1, Math.abs(MAST_OFFSET_X - WIRE_OFFSET_X) + 0.6)
const insulatorGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8)
const isolatorBeamGeo = new THREE.BoxGeometry(0.2, 0.15, ISOLATOR_LENGTH)

// 优化：将电杆材质调亮，防止与深色背景融为一体
const mastMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
const mastBaseMat = new THREE.MeshLambertMaterial({ color: 0x64748b })
const cantileverMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 })
const insulatorMat = new THREE.MeshLambertMaterial({ color: 0x8b5cf6 })  // 紫色绝缘子
const isolatorMat = new THREE.MeshLambertMaterial({ color: 0x334155 })

/* ========== 电流流动效果（powered 状态专用） ========== */
// 在接触线外套一层透明叠加圆柱，带明暗条纹贴图，逐帧滚动 offset.y 营造走马灯式的能量流动。
// 为了遵守场景“按需渲染”，在有 powered 段时 SceneManager 才会每帧 markDirty。
function _makeFlowTextureCanvas() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 64
  const ctx = c.getContext('2d')
  // 背景透明
  ctx.clearRect(0, 0, c.width, c.height)
  // 4 个明亮窄带（之前 2 个偏弱，加色混合叠在黄色接触线上几乎看不见）
  // 收窄亮带（half/2.2 而不是 half）+ 提高峰值亮度，让滚动时形成清晰的"脉冲"
  const bandCount = 4
  for (let i = 0; i < bandCount; i++) {
    const yc = (i + 0.5) * (c.height / bandCount)
    const half = c.height / bandCount / 2.2
    const grad = ctx.createLinearGradient(0, yc - half, 0, yc + half)
    // 白色峰值，加色混合叠在黄色接触线上呈现近乎全白的高亮点
    grad.addColorStop(0,    'rgba(255, 255, 255, 0)')
    grad.addColorStop(0.5,  'rgba(255, 255, 255, 1)')
    grad.addColorStop(1,    'rgba(255, 255, 255, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, yc - half, c.width, half * 2)
  }
  return c
}
const _flowCanvas = (typeof document !== 'undefined') ? _makeFlowTextureCanvas() : null

// 全局活跃电流纹理集合（仅 powered 段会加入）
const _activeFlowTextures = new Set()

/**
 * 驱动所有 powered 接触网段的电流流动动画（由 SceneManager._animate 调用）
 * @param {number} time - performance.now()传入的时间（毫秒）
 * @returns {boolean} 是否有活跃的流动段（true 时调用方需 markDirty）
 */
export function tickCatenaryFlows(time) {
  if (_activeFlowTextures.size === 0) return false
  // 有电流动动画减速：避免脉冲过快闪烁，保持更平稳的通电感
  const off = -((time * 0.0003) % 1)
  _activeFlowTextures.forEach((tex) => {
    tex.offset.y = off
  })
  return true
}

/**
 * 为某一段接触线创建电流流动 mesh
 * @param {number} length - 段长度（米）
 * @param {number} centerZ - 段中点 Z
 * @returns {THREE.Mesh}
 */
function _createFlowMesh(length, centerZ) {
  if (!_flowCanvas) return null
  const tex = new THREE.CanvasTexture(_flowCanvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  // 每 18m 重复一次（之前 12m 太密，亮带连成一片反而看不出滚动）
  tex.repeat.set(1, Math.max(1, length / 18))
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    // 纯白色：在黄色接触线上加色混合呈现近乎纯白的脉冲，对比度最大
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  // 电流外层半径减半：0.32 → 0.16，避免电流效果过粗压住车顶
  const geo = new THREE.CylinderGeometry(0.08, 0.08, length, 10, 1, true)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(WIRE_OFFSET_X, CONTACT_WIRE_HEIGHT, centerZ)
  mesh.userData.flowTex = tex
  return mesh
}

/**
 * 创建单段接触网导线 Mesh（包含承力索 + 接触线 + 立柱 + 腕臂）
 *
 * @param {Object} segment - 段配置
 *   @param {number} segment.zStart - 起始 Z
 *   @param {number} segment.zEnd - 结束 Z
 *   @param {string} segment.power - 'powered'|'unpowered'|'grounded'|'fault'
 *   @param {string} segment.label - 'slot1' | 'slot2'（便于状态切换查找）
 * @returns {Object} { group, setPower(state) }
 */
function createCatenarySegment(segment) {
  const { zStart, zEnd, power, label } = segment
  const length = zEnd - zStart
  const centerZ = (zStart + zEnd) / 2

  const group = new THREE.Group()
  group.userData.slotKey = label

  // 颜色配置
  const color = POWER_COLORS[power] || POWER_COLORS.powered

  // 1. 承力索（messenger wire）—— 上层钢索（加粗）
  const messengerMat = new THREE.MeshBasicMaterial({
    color: color.wire,
    transparent: color.intensity < 0.3,
    opacity: color.intensity < 0.3 ? 0.6 : 1.0,
  })
  const messengerGeo = new THREE.CylinderGeometry(0.03, 0.03, length, 6)
  const messenger = new THREE.Mesh(messengerGeo, messengerMat)
  messenger.rotation.x = Math.PI / 2  // 沿 Z 轴
  messenger.position.set(WIRE_OFFSET_X, MESSENGER_WIRE_HEIGHT, centerZ)
  group.add(messenger)

  // 2. 接触线（contact wire）—— 下层与受电弓接触（加粗并使用 Basic材质保持常亮，不受环境光影响）
  const contactMat = new THREE.MeshBasicMaterial({
    color: color.emissive || color.wire,
    transparent: color.intensity < 0.3,
    opacity: color.intensity < 0.3 ? 0.55 : 1.0,
  })
  const contactGeo = new THREE.CylinderGeometry(0.035, 0.035, length, 6)
  const contact = new THREE.Mesh(contactGeo, contactMat)
  contact.rotation.x = Math.PI / 2
  contact.position.set(WIRE_OFFSET_X, CONTACT_WIRE_HEIGHT, centerZ)
  group.add(contact)

  // 2.5 接触线光晕（Glow halo）—— 用外层透明发光圆柱体模拟 Bloom
  // glowRadius 允许不同状态有不同光晕范围（接地状态需要更大光晕以区分车体色）
  const _glowR = color.glowRadius || 0.08
  const glowGeo = new THREE.CylinderGeometry(_glowR, _glowR, length, 6)
  const glowMat = new THREE.MeshBasicMaterial({
    color: color.emissive,
    transparent: true,
    opacity: color.glowOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.rotation.x = Math.PI / 2
  glow.position.set(WIRE_OFFSET_X, CONTACT_WIRE_HEIGHT, centerZ)
  group.add(glow)

  // 2.6 电流流动效果（仅 powered 状态可见）
  const flowMesh = _createFlowMesh(length, centerZ)
  if (flowMesh) {
    group.add(flowMesh)
    if (power === 'powered') {
      flowMesh.visible = true
      _activeFlowTextures.add(flowMesh.userData.flowTex)
    } else {
      flowMesh.visible = false
    }
  }

  // 3. 吊弦（dropper）—— 承力索 → 接触线之间的细短杆（加粗）
  const dropperSpacing = 8
  const dropperCount = Math.max(1, Math.floor(length / dropperSpacing))
  const dropperGeo = new THREE.CylinderGeometry(0.02, 0.02, MESSENGER_WIRE_HEIGHT - CONTACT_WIRE_HEIGHT, 4)
  const dropperMat = new THREE.MeshBasicMaterial({ color: 0x64748b })
  for (let i = 0; i < dropperCount; i++) {
    const dropper = new THREE.Mesh(dropperGeo, dropperMat)
    dropper.position.set(
      WIRE_OFFSET_X,
      (CONTACT_WIRE_HEIGHT + MESSENGER_WIRE_HEIGHT) / 2,
      zStart + (i + 0.5) * (length / dropperCount)
    )
    group.add(dropper)
  }

  // 4. 电杆（mast）+ 腕臂（cantilever）+ 绝缘子
  // skipBoundaryPole: 'start' | 'end' | null —— 跳过靠近分相绝缘器（两列车之间）那一端的电杆
  //   seg1 传 'start'（zStart 紧贴 boundary），seg2 传 'end'（zEnd 紧贴 boundary）
  const skipBoundaryPole = segment.skipBoundaryPole || null
  const mastCount = Math.max(2, Math.floor(length / MAST_SPACING) + 1)
  for (let i = 0; i < mastCount; i++) {
    // 跳过 boundary 端的端部电杆，避免两列车中间冒出 1~2 根电杆
    if (skipBoundaryPole === 'start' && i === 0) continue
    if (skipBoundaryPole === 'end' && i === mastCount - 1) continue
    const ratio = mastCount === 1 ? 0.5 : i / (mastCount - 1)
    const mz = zStart + ratio * length

    // 电杆基座
    const base = new THREE.Mesh(mastBaseGeo, mastBaseMat)
    base.position.set(MAST_OFFSET_X, 0.15, mz)
    group.add(base)

    // 电杆本体
    const mast = new THREE.Mesh(mastGeo, mastMat)
    mast.position.set(MAST_OFFSET_X, MAST_HEIGHT / 2, mz)
    group.add(mast)

    // 腕臂（cantilever）：从电杆顶部向轨道中心伸出
    const arm = new THREE.Mesh(cantileverGeo, cantileverMat)
    arm.position.set((MAST_OFFSET_X + WIRE_OFFSET_X) / 2, CONTACT_WIRE_HEIGHT + 0.5, mz)
    arm.rotation.y = Math.PI / 2
    group.add(arm)

    // 绝缘子（insulator）：电杆与腕臂之间紫色短柱
    const insulator = new THREE.Mesh(insulatorGeo, insulatorMat)
    insulator.position.set(MAST_OFFSET_X - 0.15, CONTACT_WIRE_HEIGHT + 0.5, mz)
    insulator.rotation.z = Math.PI / 2
    group.add(insulator)
  }

  /**
   * 切换该段接触网的供电状态（运行时调用）
   * @param {string} newPower - 新状态
   */
  function setPower(newPower) {
    const c = POWER_COLORS[newPower] || POWER_COLORS.powered
    // 更新承力索
    messenger.material.color.setHex(c.wire)
    messenger.material.opacity = c.intensity < 0.3 ? 0.6 : 1.0
    messenger.material.transparent = c.intensity < 0.3
    messenger.material.needsUpdate = true
    // 更新接触线 (使用 BasicMaterial, color = emissive)
    contact.material.color.setHex(c.emissive || c.wire)
    contact.material.opacity = c.intensity < 0.3 ? 0.55 : 1.0
    contact.material.transparent = c.intensity < 0.3
    contact.material.needsUpdate = true
    // 更新光晕
    glow.material.color.setHex(c.emissive)
    glow.material.opacity = Math.min(c.glowOpacity, 0.25)
    glow.material.needsUpdate = true
    // 电流流动：仅 powered 可见并加入全局 tick 集合
    if (flowMesh) {
      if (newPower === 'powered') {
        flowMesh.visible = true
        _activeFlowTextures.add(flowMesh.userData.flowTex)
      } else {
        flowMesh.visible = false
        _activeFlowTextures.delete(flowMesh.userData.flowTex)
      }
    }
  }

  return { group, setPower }
}

/**
 * 创建分相绝缘器（neutral section）—— 两段接触网之间的电气分隔
 * 真实场景：一列位与二列位通过 8-15m 的绝缘段隔开，确保两段可独立分断
 *
 * @param {number} zCenter - 绝缘器中心 Z 坐标
 * @returns {THREE.Group}
 */
function createNeutralSection(zCenter) {
  const group = new THREE.Group()

  // 绝缘梁（深色横向，与导线齐平）
  const beam = new THREE.Mesh(isolatorBeamGeo, isolatorMat)
  beam.position.set(WIRE_OFFSET_X, CONTACT_WIRE_HEIGHT, zCenter)
  group.add(beam)

  // 两端紫色绝缘子（拉锥形象征绝缘隔离）
  for (let i = -1; i <= 1; i += 2) {
    const insulator = new THREE.Mesh(insulatorGeo, insulatorMat)
    insulator.position.set(WIRE_OFFSET_X, CONTACT_WIRE_HEIGHT, zCenter + i * ISOLATOR_LENGTH / 2)
    group.add(insulator)
  }

  return group
}

/**
 * 为单条股道创建完整接触网（包含两段 + 中间绝缘段）
 *
 * @param {Object} layout - calcTrackLayout 的返回值（含 bufferZ, len 等）
 * @param {Object} [opts] - 可选项
 *   @param {string} [opts.slot1Power='powered'] - 一列位初始状态
 *   @param {string} [opts.slot2Power='powered'] - 二列位初始状态
 *   @param {number} [opts.slotBoundaryZ] - 一列位与二列位的分界 Z 坐标（相对 trackGroup）。
 *     默认为股道几何中点；实际应由 TrackBuilder 按车厢占位计算后传入：
 *     slotBoundaryZ = TRAIN_POSITION_MIN + POS1_START_INDEX * CARRIAGE_SPACING
 *   @param {number} [opts.slot1EndZ] - 一列位段在远端的截止 Z（trackGroup-local）。
 *     若不传则一直延伸到 zEnd（轨道远端），但这样电线会穿过整条轨道直到道岔尾部，
 *     视觉上很怪。建议由 TrackBuilder 按一列位最后一节车厢位置 + 余量计算后传入。
 *   @param {number} [opts.slot2StartZ] - 二列位段在近端的起始 Z（trackGroup-local）。
 *     默认 zStart（缓冲止挡端）。
 * @returns {Object} { group, setSlotPower(slotKey, state) }
 *
 * 注：约定一列位段位于远端（高 Z 值，远离标牌），二列位段位于近端（低 Z 值，靠近缓冲止挡）。
 *     与 TrackBuilder 中"远端=一位、近端=二位"的标号一致。
 */
export function createCatenary(layout, opts = {}) {
  // slot1Power / slot2Power 为 null 表示该列位无接触网，不创建对应段
  const slot1Power = opts.slot1Power === undefined ? 'powered' : opts.slot1Power
  const slot2Power = opts.slot2Power === undefined ? 'powered' : opts.slot2Power

  // 两侧都无接触网 → 返回空壳
  const hasSlot1 = slot1Power != null
  const hasSlot2 = slot2Power != null
  if (!hasSlot1 && !hasSlot2) {
    const emptyGroup = new THREE.Group()
    emptyGroup.name = 'CatenaryGroup'
    return { group: emptyGroup, setSlotPower: () => {}, hasSlot1: false, hasSlot2: false }
  }

  const group = new THREE.Group()
  group.name = 'CatenaryGroup'

  // 股道全程 Z 范围：[bufferZ, bufferZ + len]
  const zStart = layout.bufferZ
  const zEnd = layout.bufferZ + layout.len

  // 列位分界：默认股道中点；如外部传入则使用真实车厢边界（与一/二列位实际占位对齐）
  const zBoundary = (opts.slotBoundaryZ != null)
    ? Math.max(zStart + ISOLATOR_LENGTH / 2 + 5, Math.min(zEnd - ISOLATOR_LENGTH / 2 - 5, opts.slotBoundaryZ))
    : (zStart + zEnd) / 2

  let seg1 = null
  let seg2 = null

  // 二列位段
  if (hasSlot2) {
    const seg2StartZ = (opts.slot2StartZ != null)
      ? Math.max(zStart, Math.min(zBoundary - ISOLATOR_LENGTH / 2 - 1, opts.slot2StartZ))
      : zStart
    seg2 = createCatenarySegment({
      zStart: seg2StartZ,
      zEnd: zBoundary - ISOLATOR_LENGTH / 2,
      power: slot2Power,
      label: 'slot2',
      skipBoundaryPole: hasSlot1 ? 'end' : null, // 仅单侧有接触网时不跳过电杆
    })
    group.add(seg2.group)
  }

  // 分相绝缘器：仅在两侧都有接触网时才显示
  if (hasSlot1 && hasSlot2) {
    const neutralSection = createNeutralSection(zBoundary)
    group.add(neutralSection)
  }

  // 一列位段
  if (hasSlot1) {
    const seg1EndZ = (opts.slot1EndZ != null)
      ? Math.max(zBoundary + ISOLATOR_LENGTH / 2 + 1, Math.min(zEnd, opts.slot1EndZ))
      : zEnd
    seg1 = createCatenarySegment({
      zStart: zBoundary + ISOLATOR_LENGTH / 2,
      zEnd: seg1EndZ,
      power: slot1Power,
      label: 'slot1',
      skipBoundaryPole: hasSlot2 ? 'start' : null,
    })
    group.add(seg1.group)
  }

  /**
   * 运行时切换某列位段的供电状态
   * @param {string} slotKey - 'slot1' 或 'slot2'
   * @param {string|null} state - 'powered'|'unpowered'|'grounded'|'fault' 或 null（隐藏该段）
   */
  function setSlotPower(slotKey, state) {
    const seg = slotKey === 'slot1' ? seg1 : (slotKey === 'slot2' ? seg2 : null)
    if (!seg) return
    if (state == null) {
      // null → 隐藏整段接触网
      seg.group.visible = false
    } else {
      seg.group.visible = true
      seg.setPower(state)
    }
  }

  return { group, setSlotPower, hasSlot1, hasSlot2 }
}
