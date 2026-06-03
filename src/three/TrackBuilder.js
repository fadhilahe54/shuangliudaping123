/**
 * TrackBuilder.js — 股道与车厢 3D 场景构建器
 *
 * 职责：
 *   - 根据后台返回的股道配置数据，动态生成每条股道的完整 3D 场景
 *   - 每条股道包含：铁轨、枕木、缓冲器、站台、安全线、股道号标签、
 *     列车类型文字、控制台（出库/进库按钮）、以及所有车厢模型
 *   - 支持主轨道（普速/动车组两种编组类型）和存车道两种布局模式
 *   - 动态股道长度自动等比例缩放所有元素位置；默认长度时复用共享几何体节省显存
 *
 * 核心导出函数：
 *   - buildTrack()        构建单条主轨道
 *   - buildNTrack()       构建单条存车道
 *   - buildAllTracks()    批量构建所有主轨道
 *   - buildAllNTracks()   批量构建所有存车道
 */
import * as THREE from 'three'
// 共享几何体和材质（铁轨、枕木、缓冲器、站台、安全线、标签盒等）
import {
  railGeo, railMat, sleeperGeo, sleeperMat,
  bufferGeo, bufferMat, platformBodyGeo, platformBodyMat,
  platformEdgeGeo, platformEdgeMat, safetyLineGeo, safetyLineMat,
  labelBoxGeo, labelBoxMat,
} from './SharedGeometries.js'
// 股道控制台 3D 模型（出库/进库按钮）
import { createControlStandModel } from './ControlStandModel.js'
// 普速车厢和动车组车厢 3D 模型生成函数
import { createCarriageModel, createEMUCarriageModel } from './CarriageModel.js'
// Canvas 文字标签生成工具
import { createTextSprite, createFlatTextPlane } from './TextSprite.js'
// 场景布局常量（枕木起始位置、间距、铁轨长度、列车类型标识等）
import {
  SLEEPER_START_Z, SLEEPER_INTERVAL, RAIL_LENGTH, TRAIN_TYPE_EMU,
  CARRIAGE_SPACING, POS1_START_INDEX, TRAIN_POSITION_MIN,
} from '../utils/constants.js'

// 一列位/二列位 接触网分相点（固定值，所有股道统一）
// 锚定在“一位第一节车（POS1_START_INDEX）”前约一节车处，落在两列位的间隙里，
// 既不压在一位车上（避免偏向一列位），又对所有股道一致（不随车组数量漂移）。
const SLOT_BOUNDARY_Z = TRAIN_POSITION_MIN + (POS1_START_INDEX - 0.5) * CARRIAGE_SPACING  // -30 + 9.0×12.2 = 79.8
// 接触网（OCS）模型构建器
import { createCatenary } from './CatenaryBuilder.js'

/* ============================================================
 * 接触网供电状态标牌（有电 / 无电 / 接地 / 故障）
 *
 * - 用法：const label = createPowerStateLabel('powered')
 *         trackGroup.add(label.sprite)
 *         label.setState('grounded')  // 运行时切换
 * - 渲染：Canvas 圆角矩形徽章 + 文字，Sprite 始终面向相机，俯视/侧视都清晰可读
 * - 颜色随状态切换；setState 复用同一 canvas，仅重绘并 needsUpdate
 * ============================================================ */
const _POWER_STATE_STYLE = {
  // bg: 徽章底色；border: 描边色；text: 显示文字
  powered:   { text: '有电', bg: '#dc2626', border: '#fca5a5' }, // 红
  unpowered: { text: '无电', bg: '#64748b', border: '#cbd5e1' }, // 灰
  grounded:  { text: '接地', bg: '#00b894', border: '#55efc4' }, // 青绿
  fault:     { text: '故障', bg: '#fbbf24', border: '#fde68a' }, // 黄
}

function _roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * 创建一块"供电状态"标牌
 * @param {string} initialState - 'powered' | 'unpowered' | 'grounded' | 'fault'
 * @param {Object} [opts]
 *   @param {number} [opts.worldHeight=2.0] - 世界高度（米）
 * @returns {{ sprite: THREE.Sprite, setState: (state: string) => void }}
 */
function createPowerStateLabel(initialState, opts = {}) {
  const worldHeight = opts.worldHeight != null ? opts.worldHeight : 2.0
  // 可选固定世界宽度（米）：用于把标牌拉成与股道同宽的横向长条，文字仍居中不拉伸
  const worldWidth = opts.worldWidth != null ? opts.worldWidth : null
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,  // 始终可见，不被车厢/电线遮挡
  })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 100 // 确保状态标牌盖在其他文字之上

  const FONT_SIZE = 76
  const PAD_X = 30
  const PAD_Y = 14
  const BORDER_W = 5
  const RADIUS = 22

  /** 重绘 canvas 并按比例调整 sprite scale */
  function draw(state) {
    const s = _POWER_STATE_STYLE[state] || _POWER_STATE_STYLE.powered
    // 先用一个临时 font 量出文字宽度，再设置 canvas 尺寸
    ctx.font = `700 ${FONT_SIZE}px "Microsoft YaHei", "PingFang SC", sans-serif`
    const textW = Math.ceil(ctx.measureText(s.text).width)
    const h = FONT_SIZE + PAD_Y * 2 + BORDER_W * 2
    // 文字自适应宽度（兜底）
    const contentW = textW + PAD_X * 2 + BORDER_W * 2
    // 若指定 worldWidth，则把画布按目标宽高比拉宽成长条（文字居中、不拉伸）
    const targetAspect = worldWidth != null ? worldWidth / worldHeight : null
    const w = targetAspect != null ? Math.max(contentW, Math.ceil(h * targetAspect)) : contentW
    canvas.width = w
    canvas.height = h

    // 重新设置 font（resize canvas 后 ctx 会被重置）
    ctx.clearRect(0, 0, w, h)
    // 圆角矩形底（铺满整条，形成与股道同宽的横向长条）
    ctx.fillStyle = s.bg
    ctx.strokeStyle = s.border
    ctx.lineWidth = BORDER_W
    _roundRectPath(ctx, BORDER_W / 2, BORDER_W / 2, w - BORDER_W, h - BORDER_W, RADIUS)
    ctx.fill()
    ctx.stroke()
    // 文字
    ctx.font = `700 ${FONT_SIZE}px "Microsoft YaHei", "PingFang SC", sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 1
    ctx.fillText(s.text, w / 2, h / 2 + 2)
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    texture.needsUpdate = true
    // 指定 worldWidth 时用固定宽度；否则维持 Canvas 原比例避免文字被拉伸
    if (worldWidth != null) {
      sprite.scale.set(worldWidth, worldHeight, 1)
    } else {
      sprite.scale.set(worldHeight * (w / h), worldHeight, 1)
    }
  }

  draw(initialState || 'powered')
  sprite.userData.setState = (state) => draw(state || 'powered')

  return {
    sprite,
    setState: (state) => draw(state || 'powered'),
  }
}

/**
 * 创建一块"作业状态"可点击标记（作业班组 / 登顶作业）
 * 复用 createTextSprite 的圆角画布牌风格，登顶作业用红色高危警示。
 * 点击交互由 SceneManager 通过 userData.type==='workInfo' 识别并弹出作业看板。
 *
 * 样式区分：
 *   - 登顶作业：红色高危 + 描边发光 + 醒目标记（renderOrder=110，盖在供电标牌之上）
 *   - 地面作业：橙色醒目 + 描边（renderOrder=96，Z 错开避免被供电标牌遮挡）
 *
 * @param {Object} work - 作业对象（见 mock/workMock.js 结构）
 * @param {Object} [opts]
 *   @param {number} [opts.worldHeight=1.7] - 世界高度（米）
 * @returns {THREE.Sprite}
 */
function createWorkMarker(work, opts = {}) {
  const worldHeight = opts.worldHeight != null ? opts.worldHeight : 1.7
  const isTop = !!work.isTop
  // 第一行：作业类型；第二行：班组 + 人数（登顶则显示班组/卡号）
  const line1 = isTop ? '⚠ 登顶作业' : '● 地面作业'
  const line2 = isTop
    ? (work.crew || work.cardNo || '')
    : `${work.crew || ''}${work.workerCount ? ' ' + work.workerCount + '人' : ''}`.trim()
  const text = line2 ? `${line1}\n${line2}` : line1
  // 登顶作业：强烈发光 + 白色描边，模拟警示灯效果
  // 地面作业：柔和发光 + 描边，强调信息感
  const sprite = createTextSprite(text, {
    fontSize: isTop ? 60 : 54,
    fontWeight: '800',
    color: '#ffffff',
    // 登顶=深红高危；地面作业=深橙
    backgroundColor: isTop
      ? 'rgba(185,28,28,0.97)'
      : 'rgba(180,83,9,0.96)',
    // 边框色：登顶=亮红描边；地面=亮橙描边
    borderColor: isTop ? '#fecaca' : '#fed7aa',
    borderWidth: isTop ? 6 : 5,
    borderRadius: isTop ? 18 : 16,
    paddingX: isTop ? 26 : 22,
    paddingY: isTop ? 14 : 12,
    lineHeight: 1.25,
    // 文字描边：增强可读性
    outlineColor: isTop ? 'rgba(127,29,29,0.95)' : 'rgba(120,53,15,0.9)',
    outlineWidth: isTop ? 3 : 2,
    // 阴影发光：登顶用红色发光，地面用橙色发光
    shadowColor: isTop ? 'rgba(248,113,113,0.9)' : 'rgba(251,146,60,0.85)',
    shadowBlur: isTop ? 16 : 10,
    worldHeight,
    depthTest: false, // 始终可见，不被车厢/电线遮挡
  })
  // 登顶作业渲染层级最高（110）盖在供电标牌(100)之上
  // 地面作业在供电标牌之下(96)，配合 Z 偏移避免被遮挡
  sprite.renderOrder = isTop ? 110 : 96
  return sprite
}

/**
 * 读取作业聚合对象的「班组数 / 登顶数」统计
 * 兼容两种来源：
 *   - 交大机电聚合（jiaodaWork.js）：直接有 groupCount / topCount
 *   - 旧版 mock 结构：按 isTop / working / workerCount 推导
 * @param {Object} work 作业聚合对象
 * @returns {{groupCount:number, topCount:number}}
 */
function readWorkCounts(work) {
  if (work && (work.groupCount != null || work.topCount != null)) {
    return {
      groupCount: Number(work.groupCount) || 0,
      topCount: Number(work.topCount) || 0,
    }
  }
  // 旧版 mock 兼容：单条作业，登顶或地面二选一
  const isTop = !!(work && work.isTop)
  const working = !!(work && work.working)
  return {
    groupCount: !isTop && working ? 1 : 0,
    topCount: isTop && working ? 1 : 0,
  }
}

/**
 * 创建新型双侧作业标牌（有车组时使用）
 * 显示班组作业、登顶作业的统计数量，点击可查看详细信息
 * 绿色 = 无作业（无人登顶、无班组作业）；红色 = 有作业（有人登顶或有班组作业）
 *
 * @param {Object} work - 作业聚合对象（见 api/jiaodaWork.js 的 WorkAggregate 结构）
 * @param {string} slot - 'slot1' | 'slot2'
 * @param {Object} [opts]
 *   @param {number} [opts.worldHeight=2.0] - 世界高度（米）
 * @returns {THREE.Sprite}
 */
function createDualWorkSign(work, slot, opts = {}) {
  // 标牌世界高度：放大以保证俯视大屏下文字清晰可读
  const worldHeight = opts.worldHeight != null ? opts.worldHeight : 4.6
  const { groupCount, topCount } = readWorkCounts(work)
  const hasWork = groupCount > 0 || topCount > 0

  // 根据是否有作业决定颜色：红色=有作业，绿色=无作业（提高不透明度增强对比）
  const bgColor = hasWork ? 'rgba(220, 38, 38, 0.95)' : 'rgba(22, 163, 74, 0.95)'
  const borderColor = hasWork ? '#fecaca' : '#bbf7d0'
  const textColor = '#ffffff'

  // 标牌文本：上行=班组作业数，下行=登顶数（与大屏图例一致）
  const line1 = `班组 ${groupCount}`
  const line2 = `登顶 ${topCount}`
  const text = `${line1}\n${line2}`

  const sprite = createTextSprite(text, {
    // 提高 Canvas 字号→纹理更清晰；加深色描边→在亮绿色车顶背景上也清楚
    fontSize: 64,
    fontWeight: '800',
    color: textColor,
    backgroundColor: bgColor,
    borderColor: borderColor,
    borderWidth: 6,
    borderRadius: 20,
    paddingX: 34,
    paddingY: 22,
    lineHeight: 1.32,
    // 文字深色描边，增强在彩色背景上的可读性
    outlineColor: hasWork ? 'rgba(127,29,29,0.95)' : 'rgba(20,83,45,0.95)',
    outlineWidth: 3,
    // 整体柔和发光，俯视时更醒目
    shadowColor: hasWork ? 'rgba(248,113,113,0.85)' : 'rgba(74,222,128,0.8)',
    shadowBlur: 10,
    worldHeight,
    depthTest: false,
  })

  // 有作业标牌层级更高，确保盖在供电标牌等之上
  sprite.renderOrder = hasWork ? 112 : 108

  return sprite
}

/**
 * 创建单项作业统计标牌（班组 或 登顶，二者独立成牌）
 * 绿色 = 该项为 0（无作业）；红色 = 该项 > 0（有作业）
 *
 * @param {'group'|'top'} kind - 'group'=班组作业, 'top'=登顶作业
 * @param {number} count - 数量
 * @param {Object} [opts]
 *   @param {number} [opts.worldHeight=3.2] - 世界高度（米）
 * @returns {THREE.Sprite}
 */
function createWorkStatSign(kind, count, opts = {}) {
  const worldHeight = opts.worldHeight != null ? opts.worldHeight : 3.2
  const has = (Number(count) || 0) > 0
  const label = kind === 'top' ? '登顶' : '班组'
  const bgColor = has ? 'rgba(220, 38, 38, 0.95)' : 'rgba(22, 163, 74, 0.95)'
  const borderColor = has ? '#fecaca' : '#bbf7d0'

  const sprite = createTextSprite(`${label} ${Number(count) || 0}`, {
    fontSize: 64,
    fontWeight: '800',
    color: '#ffffff',
    backgroundColor: bgColor,
    borderColor,
    borderWidth: 6,
    borderRadius: 18,
    paddingX: 30,
    paddingY: 18,
    lineHeight: 1.1,
    outlineColor: has ? 'rgba(127,29,29,0.95)' : 'rgba(20,83,45,0.95)',
    outlineWidth: 3,
    shadowColor: has ? 'rgba(248,113,113,0.85)' : 'rgba(74,222,128,0.8)',
    shadowBlur: 10,
    worldHeight,
    depthTest: false,
  })
  sprite.renderOrder = has ? 112 : 108
  return sprite
}

/**
 * 在某个列位上添加“班组 + 登顶”两块独立标牌，并登记到可点击列表
 * 两牌同 Y、相邻 Z（俯视分行不重叠；斜视高于供电牌、不挡股道号）
 *
 * @param {THREE.Group} trackGroup - 轨道组
 * @param {Array} workMarkers - 可点击标记收集数组
 * @param {Object} work - 作业聚合对象
 * @param {string} slot - 'slot1' | 'slot2'
 * @param {number|string} trackId - 轨道ID
 * @param {Object} pos - { y, zGroup, zTop, worldHeight }
 */
function addWorkSigns(trackGroup, workMarkers, work, slot, trackId, pos) {
  const { groupCount, topCount } = readWorkCounts(work)
  // 班组 + 登顶 合并为一张卡片（双行）
  const sign = createDualWorkSign(work, slot, { worldHeight: pos.worldHeight })
  sign.position.set(0, pos.y, pos.zGroup)
  sign.userData.type = 'workSign'
  sign.userData.trackId = trackId
  sign.userData.slot = slot
  sign.userData.work = work
  sign.userData.hasWork = (groupCount + topCount) > 0
  trackGroup.add(sign)
  workMarkers.push(sign)
}

// ========== 默认轨道布局常量 ==========
const DEFAULT_TRACK_LENGTH = 460                  // 股道逻辑长度
const DEFAULT_BUFFER_Z = -36.5                    // 缓冲器Z位置（也是接触网近端起点）
const DEFAULT_PLATFORM_LENGTH = 340               // 站台长度
const DEFAULT_PLATFORM_CENTER_Z = 130             // 站台中心Z
const DEFAULT_LABEL_Z = -38                       // 标签盒Z
const DEFAULT_FAR_LABEL_Z = 222                   // 远端标号Z
const DEFAULT_NEAR_LABEL_Z = -48                  // 近端标号Z
const DEFAULT_CONTROL_STAND_Z = -30               // 控制台Z
const DEFAULT_TYPE_TEXT_Z = 22                    // 列车类型标识Z
const TRACK_BACK_EXTENSION = 150                  // 铁轨向二列位方向额外延伸的长度

/**
 * 根据股道长度计算布局参数（所有Z方向尺寸和位置按比例缩放）
 * @param {number|null} trackLength 股道长度，null时使用默认值460
 * @returns {Object} 布局参数
 */
function calcTrackLayout(trackLength) {
  const len = (trackLength != null && trackLength > 0) ? trackLength : DEFAULT_TRACK_LENGTH
  const ratio = len / DEFAULT_TRACK_LENGTH

  // 铁轨（向二列位方向额外延伸 TRACK_BACK_EXTENSION = 50）
  const railLength = len + TRACK_BACK_EXTENSION
  const railCenterZ = DEFAULT_BUFFER_Z - TRACK_BACK_EXTENSION + railLength / 2

  // 枕木
  const sleeperCount = Math.max(1, Math.ceil(railLength / SLEEPER_INTERVAL))
  const sleeperStartZ = DEFAULT_BUFFER_Z - TRACK_BACK_EXTENSION + 0.5

  // 站台（等比例缩放）
  const platformLength = DEFAULT_PLATFORM_LENGTH * ratio
  const platformCenterZ = DEFAULT_BUFFER_Z + len * ((DEFAULT_PLATFORM_CENTER_Z - DEFAULT_BUFFER_Z) / DEFAULT_TRACK_LENGTH)

  // 近端固定元素位置（不随长度缩放，始终在轨道起始端附近）
  const bufferZ = DEFAULT_BUFFER_Z
  const labelZ = DEFAULT_LABEL_Z
  const nearLabelZ = DEFAULT_NEAR_LABEL_Z
  const controlStandZ = DEFAULT_CONTROL_STAND_Z
  // 远端和中间元素位置（随股道长度等比例调整）
  const farLabelZ = DEFAULT_BUFFER_Z + len * ((DEFAULT_FAR_LABEL_Z - DEFAULT_BUFFER_Z) / DEFAULT_TRACK_LENGTH)
  const typeTextZ = DEFAULT_BUFFER_Z + len * ((DEFAULT_TYPE_TEXT_Z - DEFAULT_BUFFER_Z) / DEFAULT_TRACK_LENGTH)

  return {
    len, ratio, isCustom: len !== DEFAULT_TRACK_LENGTH,
    railLength, railCenterZ,
    sleeperCount, sleeperStartZ,
    platformLength, platformCenterZ,
    bufferZ, labelZ, farLabelZ, nearLabelZ,
    controlStandZ, typeTextZ,
  }
}

/**
 * 根据布局参数创建轨道相关几何体（长度与默认不同时动态创建，否则复用共享几何体）
 * @param {Object} layout calcTrackLayout返回的布局参数
 * @returns {Object} 包含 rail/platform/edge/safety 几何体
 */
function createTrackGeometries(layout) {
  if (!layout.isCustom) {
    // 长度与默认相同，复用共享几何体
    return {
      rail: railGeo,
      platformBody: platformBodyGeo,
      platformEdge: platformEdgeGeo,
      safetyLine: safetyLineGeo,
    }
  }
  // 动态创建与股道长度匹配的几何体
  return {
    rail: new THREE.BoxGeometry(0.2, 0.1, layout.railLength),
    platformBody: new THREE.BoxGeometry(3.1, 0.95, layout.platformLength),
    platformEdge: new THREE.BoxGeometry(0.1, 0.95, layout.platformLength),
    safetyLine: new THREE.BoxGeometry(0.15, 0.02, layout.platformLength),
  }
}

/**
 * 创建贴地面的股道文字平面（替代 troika Text）
 * @param {*} _ - 预留参数，保持与历史调用一致签名
 * @returns {THREE.Mesh}
 */
function applyGroundTextStyle(_, {
  text,
  fontSize,
  color,
  position,
  rotationZ = -Math.PI / 2,
  fillOpacity = 0.92,
  shadowColor = null,
  shadowBlur = 0,
}) {
  const plane = createFlatTextPlane(text, {
    fontSize: Math.max(96, Math.round(fontSize * 56)),
    fontWeight: '700',
    color,
    worldHeight: fontSize,
    opacity: fillOpacity,
    depthTest: true,
    shadowColor: shadowColor || 'rgba(0,0,0,0)',
    shadowBlur: shadowBlur > 0 ? Math.max(6, Math.round(shadowBlur * 18)) : 0,
  })
  plane.position.copy(position)
  plane.rotation.set(-Math.PI / 2, 0, rotationZ)
  // 标记为地面文字标签（用于俯视角2 切换时翻转 180°，避免文字倒置）
  plane.userData.isGroundLabel = true
  plane.userData._baseRotationZ = rotationZ
  return plane
}

function reverseSlashLabel(text) {
  const parts = String(text || '').split(' / ').filter(Boolean)
  return parts.length > 1 ? parts.reverse().join(' / ') : text
}

/**
 * 创建单条轨道及其上的所有对象
 * @param {number} id - 轨道索引 (0-based)
 * @param {number} positionX - X坐标
 * @param {Object[]} carriagesData - 该轨道的车厢数据
 * @param {string} trainType - 列车类型 'emu' | 'conventional'
 * @param {string} [trackName] - 股道名称（如"1道"、"7道"），为空时使用默认编号
 * @param {string} [trainNo] - 车次
 * @param {Object} [cfg] - 后台股道配置（含 pos1Groups、pos2Groups 等）
 * @returns {Object} { trackGroup, trainGroup, carriageGroups }
 */
export function createTrack(id, positionX, carriagesData, trainType, trackName, trainNo, cfg, onModelReady = null) {
  const isEMU = trainType === TRAIN_TYPE_EMU
  const displayName = trackName || `${id + 1}道`
  const displayTrainNo = trainNo || displayName
  // 股道偏移量（起始位置）：移动整个轨道组（含站台、标牌、缓冲器等）
  const zOffset = (cfg && cfg.trackOffset != null) ? cfg.trackOffset : 0
  // 根据股道长度计算布局参数和动态几何体
  const layout = calcTrackLayout(cfg && cfg.trackLength)
  const geos = createTrackGeometries(layout)
  const trackGroup = new THREE.Group()
  trackGroup.position.set(positionX, 0, zOffset)

  // 轨道ID标号（Sprite 始终面向相机，任意视角可见）
  const trackColor = isEMU ? '#00e676' : '#0ea5e9'
  // 远端股道标号（位置随股道长度调整）
  const groundTextFar = createTextSprite(`${displayName}\n一位`, {
    fontSize: 72,
    fontWeight: '700',
    color: trackColor,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingX: 20,
    paddingY: 10,
    worldHeight: 3.8,
    depthTest: true,
  })
  groundTextFar.position.set(0, 5.0, layout.farLabelZ)
  trackGroup.add(groundTextFar)

  // ====== 接触网供电状态标牌（有电/无电/接地/故障）======
  const _slot1Power = cfg && cfg.slot1Power !== undefined ? cfg.slot1Power : undefined
  const _slot2Power = cfg && cfg.slot2Power !== undefined ? cfg.slot2Power : undefined
  let slot1PowerLabel = null
  if (_slot1Power != null) {
    slot1PowerLabel = createPowerStateLabel(_slot1Power, { worldHeight: 2.8 })
    slot1PowerLabel.sprite.position.set(0, 8.6, layout.farLabelZ - 10)
    trackGroup.add(slot1PowerLabel.sprite)
  }

  // 近端股道标号（改为与一列位相同的悬浮标牌）
  const groundTextNear = createTextSprite(`${displayName}\n二位`, {
    fontSize: 72,
    fontWeight: '700',
    color: trackColor,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingX: 20,
    paddingY: 10,
    worldHeight: 3.8,
    depthTest: false,
  })
  groundTextNear.renderOrder = 90 // 确保在普通物体上方，但在状态标牌下方
  groundTextNear.position.set(0, 5.0, layout.nearLabelZ-2)
  trackGroup.add(groundTextNear)

  // 二位列位供电状态标牌
  let slot2PowerLabel = null
  if (_slot2Power != null) {
    slot2PowerLabel = createPowerStateLabel(_slot2Power, { worldHeight: 2.8 })
    slot2PowerLabel.sprite.position.set(0, 8.6, layout.nearLabelZ + 6)
    trackGroup.add(slot2PowerLabel.sprite)
  }

  // ====== 作业状态标记（作业班组 / 登顶作业，可点击弹出作业看板）======
  // 仅有车组的列位显示双侧标牌：绿色=无作业，红色=有作业（显示统计数量）
  const workMarkers = []
  const _slot1Work = cfg && cfg.slot1Work ? cfg.slot1Work : null
  const _slot2Work = cfg && cfg.slot2Work ? cfg.slot2Work : null
  const _hasTrain = carriagesData && carriagesData.length > 0

  if (_hasTrain) {
    // 班组 + 登顶 合并为一张卡片；沿用“股道号→供电牌”层叠关系再上一级
    if (_slot1Work) {
      addWorkSigns(trackGroup, workMarkers, _slot1Work, 'slot1', id, {
        y: 12.5, zGroup: layout.farLabelZ - 22, worldHeight: 4.2,
      })
    }
    if (_slot2Work) {
      addWorkSigns(trackGroup, workMarkers, _slot2Work, 'slot2', id, {
        y: 12.5, zGroup: layout.nearLabelZ + 16, worldHeight: 4.2,
      })
    }
  }
  // 无车组的列位不显示任何作业标牌（已移除旧版小标记）

  // 轨道标签盒（根据需求隐藏）
  // const labelGroup = new THREE.Group()
  // labelGroup.position.set(0, 0.5, layout.labelZ)

  // const labelBox = new THREE.Mesh(labelBoxGeo, labelBoxMat)
  // labelGroup.add(labelBox)

  // const labelText = createFlatTextPlane(displayName, {
  //   fontSize: 96,
  //   fontWeight: '700',
  //   color: '#f8fdff',
  //   worldHeight: 1.05,
  //   depthTest: false,
  // })
  // labelText.position.set(0, 0, -0.34)
  // labelText.rotation.set(0, Math.PI, 0)
  // labelGroup.add(labelText)

  // 标签盒上方 - 状态文字（白色，动态更新）
  // 注：隐藏股道左端"停放中"状态文字
  // const departLabel = new Text()
  // ...
  const departLabel = null

  // trackGroup.add(labelGroup)

  // 铁轨（根据股道长度动态创建）
  const railL = new THREE.Mesh(geos.rail, railMat)
  railL.position.set(-0.8, 0.05, layout.railCenterZ)
  railL.matrixAutoUpdate = false
  railL.updateMatrix()
  trackGroup.add(railL)

  const railR = new THREE.Mesh(geos.rail, railMat)
  railR.position.set(0.8, 0.05, layout.railCenterZ)
  railR.matrixAutoUpdate = false
  railR.updateMatrix()
  trackGroup.add(railR)

  // 枕木 - 使用 InstancedMesh 批量渲染（数量随股道长度变化）
  const sleeperInstanced = new THREE.InstancedMesh(sleeperGeo, sleeperMat, layout.sleeperCount)
  const sleeperMatrix = new THREE.Matrix4()
  for (let i = 0; i < layout.sleeperCount; i++) {
    sleeperMatrix.makeTranslation(0, 0.02, layout.sleeperStartZ + i * SLEEPER_INTERVAL)
    sleeperInstanced.setMatrixAt(i, sleeperMatrix)
  }
  sleeperInstanced.instanceMatrix.needsUpdate = true
  trackGroup.add(sleeperInstanced)

  // 缓冲止挡（根据需求隐藏）
  // const buffer = new THREE.Mesh(bufferGeo, bufferMat)
  // buffer.position.set(0, 0.5, layout.bufferZ)
  // buffer.matrixAutoUpdate = false
  // buffer.updateMatrix()
  // trackGroup.add(buffer)

  // 接触网（OCS）：股道上方接触导线 + 电杆 + 分相绝缘器
  // 供电状态由 cfg.slot1Power / cfg.slot2Power 传入，默认带电
  // slotBoundaryZ 采用与车厢占位一致的真实一/二列位分界点
  // slot1EndZ：以"一位"标号位置 farLabelZ 为兜底；若一列位有车且车尾超过 farLabelZ，
  //   则取车尾位置 + 6m，确保电线既不穿到道岔尾部，又能覆盖到最后一节一位车
  const _pos1Idxs = (carriagesData || []).filter(c => c._position === 'pos1').map(c => c.index)
  const _carEndZ = _pos1Idxs.length
    ? TRAIN_POSITION_MIN + Math.max(..._pos1Idxs) * CARRIAGE_SPACING + CARRIAGE_SPACING / 2 + 6
    : null
  const _slot1EndZ = _carEndZ != null
    ? Math.max(_carEndZ, layout.farLabelZ)
    : layout.farLabelZ
  // ====== 接触网（电线+电杆+分相绝缘器）======
  // 分相点统一使用固定的 SLOT_BOUNDARY_Z（所有股道一致，不随车组数量漂移）
  const catenary = createCatenary(layout, {
    slot1Power: _slot1Power,
    slot2Power: _slot2Power,
    slotBoundaryZ: SLOT_BOUNDARY_Z,
    slot1EndZ: _slot1EndZ,
  })
  trackGroup.add(catenary.group)

  // 站台（根据股道长度动态调整长度和位置）
  const platformGroup = new THREE.Group()
  platformGroup.position.set(3.0, 0, layout.platformCenterZ)

  const platformBody = new THREE.Mesh(geos.platformBody, platformBodyMat)
  platformBody.position.set(0, 0.475, 0)
  platformBody.receiveShadow = true
  platformBody.matrixAutoUpdate = false
  platformBody.updateMatrix()
  platformGroup.add(platformBody)

  // 站台边缘 - 左
  const edgeL = new THREE.Mesh(geos.platformEdge, platformEdgeMat)
  edgeL.position.set(-1.5, 0.475, 0)
  edgeL.matrixAutoUpdate = false
  edgeL.updateMatrix()
  platformGroup.add(edgeL)

  // 安全线 - 左
  const safetyL = new THREE.Mesh(geos.safetyLine, safetyLineMat)
  safetyL.position.set(-1.3, 0.96, 0)
  safetyL.matrixAutoUpdate = false
  safetyL.updateMatrix()
  platformGroup.add(safetyL)

  // 站台边缘 - 右
  const edgeR = new THREE.Mesh(geos.platformEdge, platformEdgeMat)
  edgeR.position.set(1.5, 0.475, 0)
  edgeR.matrixAutoUpdate = false
  edgeR.updateMatrix()
  platformGroup.add(edgeR)

  // 安全线 - 右
  const safetyR = new THREE.Mesh(geos.safetyLine, safetyLineMat)
  safetyR.position.set(1.3, 0.96, 0)
  safetyR.matrixAutoUpdate = false
  safetyR.updateMatrix()
  platformGroup.add(safetyR)

  trackGroup.add(platformGroup)

  // 控制台（位置随股道长度调整）
  // 暂时关闭二列位的开车/回库按钮台子，按需可恢复
  // const controlStand = createControlStandModel(id, [3.0, 0.95, layout.controlStandZ])
  // trackGroup.add(controlStand)
  const controlStand = null

  // 列车组（支持同一股道多组车，如2道双动车）
  const trainGroup = new THREE.Group()
  const carriageGroups = {}
  const interGroupJointMat = new THREE.MeshLambertMaterial({ color: '#1f2937' })

  // ============ 列位级动画支持：按列位拆 slotGroup ============
  // slotGroupPos1 / slotGroupPos2：分别承载一列位 / 二列位的车厢（及非重联时各自的车号标签）
  // jointGroup：承载重联时的连接件，重联整列动画走 trainGroup 整体平移，连接件随之移动
  // slotGroup 初始位置 (0,0,0)，所以车厢相对 Z 不变，视觉与改造前完全一致
  const slotGroupPos1 = new THREE.Group()
  slotGroupPos1.userData = { type: 'slotGroup', trackId: id, slotKey: 'pos1' }
  trainGroup.add(slotGroupPos1)

  const slotGroupPos2 = new THREE.Group()
  slotGroupPos2.userData = { type: 'slotGroup', trackId: id, slotKey: 'pos2' }
  trainGroup.add(slotGroupPos2)

  const jointGroup = new THREE.Group()
  jointGroup.userData = { type: 'jointGroup', trackId: id }
  trainGroup.add(jointGroup)

  // 根据车厢的 _position 字段决定挂到哪个 slotGroup（'pos2' / 'pos1'，缺省走 pos2）
  const pickSlotGroup = (positionStr) => positionStr === 'pos1' ? slotGroupPos1 : slotGroupPos2

  // 重联状态：影响组间间距、连接器渲染、车号标签
  const isLinked = cfg ? (cfg.linked !== false) : true
  const GROUP_GAP_LINKED = -5.6          // 重联时两组车车头紧密对接（负值拉近距离）
  const GROUP_GAP_UNLINKED = 0            // 非重联时不再额外后移，列位初始位置已完成预留
  const GROUP_GAP = isLinked ? GROUP_GAP_LINKED : GROUP_GAP_UNLINKED

  let groupGapAccum = 0  // 累计间距偏移
  let prevCarriageModel = null
  // 用于记录每组车的第一节和最后一节车厢的位置（供非重联时分别显示车号）
  const groupRanges = {}  // { groupIndex: { first: carriageModel, last: carriageModel, trainGroupNo: string } }

  carriagesData.forEach((info, i) => {
    const isTrainFirst = i === 0
    const isTrainLast = i === carriagesData.length - 1
    const groupIndex = typeof info._groupIndex === 'number' ? info._groupIndex : 0
    const isGroupFirst = typeof info._isGroupFirst === 'boolean' ? info._isGroupFirst : isTrainFirst
    const isGroupLast = typeof info._isGroupLast === 'boolean' ? info._isGroupLast : isTrainLast

    // 当进入新的车组（非第一组的第一节）时，累加间距
    if (isGroupFirst && groupIndex > 0) {
      groupGapAccum += GROUP_GAP
    }

    // 判断本节车在所属车组内的角色
    // 组尾也不显示连接器（下一节属于另一组）
    const showGangway = !isTrainLast && !isGroupLast

    // 按每节车厢的 trainType 判断，支持同股道一位/二位混停不同车型
    const carIsEMU = info.trainType === TRAIN_TYPE_EMU
    let carriageModel
    if (carIsEMU) {
      carriageModel = createEMUCarriageModel(info, !showGangway, isGroupLast, isGroupFirst, onModelReady)
    } else {
      carriageModel = createCarriageModel(info, !showGangway, isGroupFirst)
    }

    // 应用组间间距偏移
    if (groupGapAccum !== 0) {
      carriageModel.position.z += groupGapAccum
    }

    // 重联时才渲染组间连接器（仅 EMU 相邻重联时绘制）
    // 连接件统一加入 jointGroup；重联时 trainGroup 整体动画，连接件随之移动
    if (isLinked && carIsEMU && isGroupFirst && groupIndex > 0 && prevCarriageModel) {
      const prevZ = prevCarriageModel.position.z
      const currZ = carriageModel.position.z
      const midZ = (prevZ + currZ) / 2

      const jointCover = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.08, 0.9), interGroupJointMat)
      jointCover.position.set(0, 0.76, midZ)
      jointGroup.add(jointCover)

      const jointLower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 1.45), interGroupJointMat)
      jointLower.position.set(0, -0.52, midZ)
      jointGroup.add(jointLower)

      const jointPlateL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.58), interGroupJointMat)
      jointPlateL.position.set(1.02, 0.35, midZ)
      jointGroup.add(jointPlateL)

      const jointPlateR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.58), interGroupJointMat)
      jointPlateR.position.set(-1.02, 0.35, midZ)
      jointGroup.add(jointPlateR)
    }

    // 记录每组车厢的第一节和最后一节
    if (!groupRanges[groupIndex]) {
      groupRanges[groupIndex] = { first: carriageModel, last: carriageModel, trainGroupNo: info._trainGroupNo || '', position: info._position || 'pos2' }
    } else {
      groupRanges[groupIndex].last = carriageModel
    }

    // 在车厢 userData 中记录车组信息（供点击识别车组使用）
    carriageModel.userData._groupIndex = groupIndex
    carriageModel.userData._trainGroupNo = info._trainGroupNo || ''
    carriageModel.userData._position = info._position || ''

    // 按列位加到对应 slotGroup（取代原来直接加到 trainGroup）
    pickSlotGroup(info._position).add(carriageModel)
    carriageGroups[info.id] = carriageModel
    prevCarriageModel = carriageModel
  })

  // 车号标签：重联时显示一个统一标签，非重联时每组车单独显示标签
  const trainNoLabels = []
  const groupKeys = Object.keys(groupRanges).sort((a, b) => Number(a) - Number(b))

  if (isLinked || groupKeys.length <= 1) {
    // 重联 或 只有一组车：显示一个统一标签
    const firstCarriage = carriagesData.length > 0 ? carriageGroups[carriagesData[0].id] : null
    const lastCarriage = carriagesData.length > 0 ? carriageGroups[carriagesData[carriagesData.length - 1].id] : null
    const trainNoLabel = createTextSprite(displayTrainNo, {
      fontSize: 72,
      color: '#fbbf24',
      backgroundColor: 'rgba(10,22,40,0.52)',
      borderColor: 'rgba(251,191,36,0.45)',
      borderWidth: 4,
      borderRadius: 20,
      paddingX: 24,
      paddingY: 12,
      worldHeight: 2.4,
      depthTest: false,
    })
    trainNoLabel.userData.isReverseViewLabel = true
    trainNoLabel.userData._normalText = displayTrainNo
    trainNoLabel.userData._reverseText = reverseSlashLabel(displayTrainNo)
    const labelCenterZ = firstCarriage && lastCarriage ? (firstCarriage.position.z + lastCarriage.position.z) / 2 : 36
    trainNoLabel.position.set(0, 8.6, labelCenterZ)
    // 重联模式：标签横跨两列位，加到 trainGroup（跟随整体动画走）
    // 单车组非重联模式：标签按其所属列位加到对应 slotGroup（列位级动画时标签跟随）
    if (isLinked) {
      trainGroup.add(trainNoLabel)
    } else {
      const onlyGroupRange = groupKeys.length === 1 ? groupRanges[groupKeys[0]] : null
      const ownerSlot = onlyGroupRange ? pickSlotGroup(onlyGroupRange.position) : trainGroup
      ownerSlot.add(trainNoLabel)
    }
    trainNoLabels.push(trainNoLabel)
  } else {
    // 非重联：每组车单独显示车号标签，按其所属列位加到对应 slotGroup
    groupKeys.forEach(gk => {
      const range = groupRanges[gk]
      const labelText = range.trainGroupNo || displayTrainNo
      const label = createTextSprite(labelText, {
        fontSize: 64,
        color: '#fbbf24',
        backgroundColor: 'rgba(10,22,40,0.52)',
        borderColor: 'rgba(251,191,36,0.45)',
        borderWidth: 3,
        borderRadius: 16,
        paddingX: 20,
        paddingY: 10,
        worldHeight: 2.0,
        depthTest: false,
      })
      const centerZ = (range.first.position.z + range.last.position.z) / 2
      label.position.set(0, 8.6, centerZ)
      // 该车组属于哪个列位就加到哪个 slotGroup，列位动画时标签跟随车组走
      pickSlotGroup(range.position).add(label)
      trainNoLabels.push(label)
    })
  }

  trackGroup.add(trainGroup)

  return {
    trackGroup, trainGroup, carriageGroups, controlStand, departLabel,
    trainNoLabel: trainNoLabels[0] || null, trainNoLabels,
    // 列位级动画用：两个 slotGroup 与 jointGroup 的直接引用
    slotGroupPos1, slotGroupPos2, jointGroup,
    catenary,  // 接触网控制器，提供 setSlotPower(slotKey, state)
    // 一位/二位 供电状态标牌：与接触网状态同步，由 SceneManager.setCatenaryPower 调用 setState
    powerLabels: { slot1: slot1PowerLabel, slot2: slot2PowerLabel },
    // 作业状态标记（可点击）：供 SceneManager 纳入 raycast 交互
    workMarkers,
  }
}

/**
 * 创建停放线路（无站台、无控制台、无状态标签）
 * @param {string} nId - 线路标识，如 'n1'
 * @param {number} displayIndex - 显示序号 (1-4)
 * @param {number} positionX - X坐标
 * @param {Object[]} carriagesData - 该线路的车厢数据
 * @param {string} [trackName] - 股道名称（如"n1道"），为空时使用默认编号
 * @param {string} [trainNo] - 车次
 * @param {Object} [cfg] - 后台股道配置（含 linked 等）
 * @param {Function} [onModelReady] - 车厢模型创建完成回调
 * @returns {Object} { trackGroup, trainGroup, carriageGroups }
 */
export function createSidingTrack(nId, displayIndex, positionX, carriagesData, trackName, trainNo, cfg, onModelReady = null) {
  const displayName = trackName || `n${displayIndex}道`
  const displayTrainNo = trainNo || displayName
  // 股道偏移量（起始位置）：移动整个轨道组
  const zOffset = (cfg && cfg.trackOffset != null) ? cfg.trackOffset : 0
  // 根据股道长度计算布局参数和动态几何体
  const layout = calcTrackLayout(cfg && cfg.trackLength)
  const geos = createTrackGeometries(layout)
  const trackGroup = new THREE.Group()
  trackGroup.position.set(positionX, 0, zOffset)

  // 股道标号（Sprite 始终面向相机，任意视角可见）
  // 远端股道标号（位置随股道长度调整）
  const groundTextFar = createTextSprite(`${displayName}\n一位`, {
    fontSize: 64,
    fontWeight: '700',
    color: '#f59e0b',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingX: 18,
    paddingY: 8,
    worldHeight: 3.2,
    depthTest: true,
  })
  groundTextFar.position.set(0, 5.0, layout.farLabelZ)
  trackGroup.add(groundTextFar)

  // ====== 接触网供电状态标牌 ======
  const _slot1Power = cfg && cfg.slot1Power !== undefined ? cfg.slot1Power : undefined
  const _slot2Power = cfg && cfg.slot2Power !== undefined ? cfg.slot2Power : undefined
  let slot1PowerLabel = null
  if (_slot1Power != null) {
    slot1PowerLabel = createPowerStateLabel(_slot1Power, { worldHeight: 2.6 })
    slot1PowerLabel.sprite.position.set(0, 8.4, layout.farLabelZ - 10)
    trackGroup.add(slot1PowerLabel.sprite)
  }

  // 近端股道标号（改为与一列位相同的悬浮标牌）
  const groundTextNear = createTextSprite(`${displayName}\n二位`, {
    fontSize: 64,
    fontWeight: '700',
    color: '#f59e0b',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingX: 18,
    paddingY: 8,
    worldHeight: 3.2,
    depthTest: false,
  })
  groundTextNear.renderOrder = 90 // 确保在普通物体上方，但在状态标牌下方
  groundTextNear.position.set(0, 5.0, layout.nearLabelZ-2)
  trackGroup.add(groundTextNear)

  // 二位列位供电状态标牌
  let slot2PowerLabel = null
  if (_slot2Power != null) {
    slot2PowerLabel = createPowerStateLabel(_slot2Power, { worldHeight: 2.6 })
    slot2PowerLabel.sprite.position.set(0, 8.4, layout.nearLabelZ + 6)
    trackGroup.add(slot2PowerLabel.sprite)
  }

  // ====== 作业状态标记（作业班组 / 登顶作业，可点击弹出作业看板）======
  // 存车道：仅有车组的列位显示双侧标牌（绿=无作业 / 红=有作业）
  const workMarkers = []
  const _slot1Work = cfg && cfg.slot1Work ? cfg.slot1Work : null
  const _slot2Work = cfg && cfg.slot2Work ? cfg.slot2Work : null
  const _hasTrain = carriagesData && carriagesData.length > 0

  if (_hasTrain) {
    // 班组 + 登顶 合并为一张卡片（与主轨道一致）
    if (_slot1Work) {
      addWorkSigns(trackGroup, workMarkers, _slot1Work, 'slot1', nId, {
        y: 12.0, zGroup: layout.farLabelZ - 22, worldHeight: 4.0,
      })
    }
    if (_slot2Work) {
      addWorkSigns(trackGroup, workMarkers, _slot2Work, 'slot2', nId, {
        y: 12.0, zGroup: layout.nearLabelZ + 16, worldHeight: 4.0,
      })
    }
  }
  // 无车组的列位不显示任何作业标牌（已移除旧版小标记）

  // 标签盒（根据需求隐藏）
  // const labelGroup = new THREE.Group()
  // labelGroup.position.set(0, 0.5, layout.labelZ)

  // const labelBox = new THREE.Mesh(labelBoxGeo, labelBoxMat)
  // labelGroup.add(labelBox)

  // const labelText = createFlatTextPlane(displayName, {
  //   fontSize: 90,
  //   fontWeight: '700',
  //   color: '#f8fdff',
  //   worldHeight: 1,
  //   depthTest: false,
  // })
  // labelText.position.set(0, 0, -0.34)
  // labelText.rotation.set(0, Math.PI, 0)
  // labelGroup.add(labelText)

  // 标签上方 - 停放中状态
  // 注：隐藏存车线左端"停放中"状态文字
  // const statusText = new Text()
  // ...
  const statusText = null

  // trackGroup.add(labelGroup)

  // 铁轨（根据股道长度动态创建）
  const railL = new THREE.Mesh(geos.rail, railMat)
  railL.position.set(-0.8, 0.05, layout.railCenterZ)
  railL.matrixAutoUpdate = false
  railL.updateMatrix()
  trackGroup.add(railL)

  const railR = new THREE.Mesh(geos.rail, railMat)
  railR.position.set(0.8, 0.05, layout.railCenterZ)
  railR.matrixAutoUpdate = false
  railR.updateMatrix()
  trackGroup.add(railR)

  // 枕木（数量随股道长度变化）
  const sleeperInstanced = new THREE.InstancedMesh(sleeperGeo, sleeperMat, layout.sleeperCount)
  const sleeperMatrix = new THREE.Matrix4()
  for (let i = 0; i < layout.sleeperCount; i++) {
    sleeperMatrix.makeTranslation(0, 0.02, layout.sleeperStartZ + i * SLEEPER_INTERVAL)
    sleeperInstanced.setMatrixAt(i, sleeperMatrix)
  }
  sleeperInstanced.instanceMatrix.needsUpdate = true
  trackGroup.add(sleeperInstanced)

  // 缓冲止挡（根据需求隐藏）
  // const buffer = new THREE.Mesh(bufferGeo, bufferMat)
  // buffer.position.set(0, 0.5, layout.bufferZ)
  // buffer.matrixAutoUpdate = false
  // buffer.updateMatrix()
  // trackGroup.add(buffer)

  // 接触网（OCS）：存车道上方接触导线 + 电杆 + 分相绝缘器
  // 存车道车组位于 trainGroup.position.z = -30 偏移处，与主轨道一致
  // slot1EndZ：以"一位"标号位置 farLabelZ 为兜底；若一列位有车且车尾超过 farLabelZ，则取车尾 + 6m
  const _pos1Idxs = (carriagesData || []).filter(c => c._position === 'pos1').map(c => c.index)
  const _carEndZ = _pos1Idxs.length
    ? TRAIN_POSITION_MIN + Math.max(..._pos1Idxs) * CARRIAGE_SPACING + CARRIAGE_SPACING / 2 + 6
    : null
  const _slot1EndZ = _carEndZ != null
    ? Math.max(_carEndZ, layout.farLabelZ)
    : layout.farLabelZ
  // ====== 接触网（存车道上方电线）======
  // 分相点统一使用固定的 SLOT_BOUNDARY_Z（所有股道一致，不随车组数量漂移）
  const catenary = createCatenary(layout, {
    slot1Power: _slot1Power,
    slot2Power: _slot2Power,
    slotBoundaryZ: SLOT_BOUNDARY_Z,
    slot1EndZ: _slot1EndZ,
  })
  trackGroup.add(catenary.group)

  // 列车组（支持多组车 + 重联/非重联）
  const trainGroup = new THREE.Group()
  const carriageGroups = {}
  const interGroupJointMat = new THREE.MeshLambertMaterial({ color: '#1f2937' })

  // ============ 列位级动画支持：按列位拆 slotGroup（与 createTrack 一致） ============
  const slotGroupPos1 = new THREE.Group()
  slotGroupPos1.userData = { type: 'slotGroup', trackId: nId, slotKey: 'pos1' }
  trainGroup.add(slotGroupPos1)

  const slotGroupPos2 = new THREE.Group()
  slotGroupPos2.userData = { type: 'slotGroup', trackId: nId, slotKey: 'pos2' }
  trainGroup.add(slotGroupPos2)

  const jointGroup = new THREE.Group()
  jointGroup.userData = { type: 'jointGroup', trackId: nId }
  trainGroup.add(jointGroup)

  const pickSlotGroup = (positionStr) => positionStr === 'pos1' ? slotGroupPos1 : slotGroupPos2

  const isLinked = cfg ? (cfg.linked !== false) : true
  const GROUP_GAP = isLinked ? -5.6 : 0
  let groupGapAccum = 0
  let prevCarriageModel = null
  const groupRanges = {}

  carriagesData.forEach((info, i) => {
    const isTrainFirst = i === 0
    const isTrainLast = i === carriagesData.length - 1
    const groupIndex = typeof info._groupIndex === 'number' ? info._groupIndex : 0
    const isGroupFirst = typeof info._isGroupFirst === 'boolean' ? info._isGroupFirst : isTrainFirst
    const isGroupLast = typeof info._isGroupLast === 'boolean' ? info._isGroupLast : isTrainLast

    if (isGroupFirst && groupIndex > 0) {
      groupGapAccum += GROUP_GAP
    }

    const showGangway = !isTrainLast && !isGroupLast
    // 根据车厢 trainType 判断动车组/普速，选择对应模型
    const isEMU = info.trainType === TRAIN_TYPE_EMU
    let carriageModel
    if (isEMU) {
      carriageModel = createEMUCarriageModel(info, !showGangway, isGroupLast, isGroupFirst, onModelReady)
    } else {
      carriageModel = createCarriageModel(info, !showGangway, isGroupFirst)
    }

    if (groupGapAccum !== 0) {
      carriageModel.position.z += groupGapAccum
    }

    // 重联时渲染组间连接器（与主轨道逻辑一致，连接件入 jointGroup）
    if (isLinked && isEMU && isGroupFirst && groupIndex > 0 && prevCarriageModel) {
      const prevZ = prevCarriageModel.position.z
      const currZ = carriageModel.position.z
      const midZ = (prevZ + currZ) / 2

      const jointCover = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.08, 0.9), interGroupJointMat)
      jointCover.position.set(0, 0.76, midZ)
      jointGroup.add(jointCover)

      const jointLower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 1.45), interGroupJointMat)
      jointLower.position.set(0, -0.52, midZ)
      jointGroup.add(jointLower)

      const jointPlateL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.58), interGroupJointMat)
      jointPlateL.position.set(1.02, 0.35, midZ)
      jointGroup.add(jointPlateL)

      const jointPlateR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.58), interGroupJointMat)
      jointPlateR.position.set(-1.02, 0.35, midZ)
      jointGroup.add(jointPlateR)
    }

    if (!groupRanges[groupIndex]) {
      groupRanges[groupIndex] = { first: carriageModel, last: carriageModel, trainGroupNo: info._trainGroupNo || '', position: info._position || 'pos2' }
    } else {
      groupRanges[groupIndex].last = carriageModel
    }

    carriageModel.userData._groupIndex = groupIndex
    carriageModel.userData._trainGroupNo = info._trainGroupNo || ''
    carriageModel.userData._position = info._position || ''

    // 按列位加到对应 slotGroup
    pickSlotGroup(info._position).add(carriageModel)
    carriageGroups[info.id] = carriageModel
    prevCarriageModel = carriageModel
  })

  // 车号标签
  const trainNoLabels = []
  const groupKeys = Object.keys(groupRanges).sort((a, b) => Number(a) - Number(b))

  if (isLinked || groupKeys.length <= 1) {
    const firstCarriage = carriagesData.length > 0 ? carriageGroups[carriagesData[0].id] : null
    const lastCarriage = carriagesData.length > 0 ? carriageGroups[carriagesData[carriagesData.length - 1].id] : null
    const trainNoLabel = createTextSprite(displayTrainNo, {
      fontSize: 68,
      color: '#f59e0b',
      backgroundColor: 'rgba(10,22,40,0.52)',
      borderColor: 'rgba(245,158,11,0.45)',
      borderWidth: 4,
      borderRadius: 20,
      paddingX: 22,
      paddingY: 12,
      worldHeight: 2.1,
      depthTest: false,
    })
    trainNoLabel.userData.isReverseViewLabel = true
    trainNoLabel.userData._normalText = displayTrainNo
    trainNoLabel.userData._reverseText = reverseSlashLabel(displayTrainNo)
    const labelCenterZ = firstCarriage && lastCarriage ? (firstCarriage.position.z + lastCarriage.position.z) / 2 : 28
    trainNoLabel.position.set(0, 7.8, labelCenterZ)
    // 重联加到 trainGroup；单车组非重联按列位加到 slotGroup
    if (isLinked) {
      trainGroup.add(trainNoLabel)
    } else {
      const onlyGroupRange = groupKeys.length === 1 ? groupRanges[groupKeys[0]] : null
      const ownerSlot = onlyGroupRange ? pickSlotGroup(onlyGroupRange.position) : trainGroup
      ownerSlot.add(trainNoLabel)
    }
    trainNoLabels.push(trainNoLabel)
  } else {
    // 非重联：每组车单独显示车号标签，按其所属列位加到对应 slotGroup
    groupKeys.forEach(gk => {
      const range = groupRanges[gk]
      const labelText = range.trainGroupNo || displayTrainNo
      const label = createTextSprite(labelText, {
        fontSize: 58,
        color: '#f59e0b',
        backgroundColor: 'rgba(10,22,40,0.52)',
        borderColor: 'rgba(245,158,11,0.45)',
        borderWidth: 3,
        borderRadius: 16,
        paddingX: 18,
        paddingY: 10,
        worldHeight: 1.8,
        depthTest: false,
      })
      const centerZ = (range.first.position.z + range.last.position.z) / 2
      label.position.set(0, 7.8, centerZ)
      pickSlotGroup(range.position).add(label)
      trainNoLabels.push(label)
    })
  }

  // 停放线路列车固定位置
  trainGroup.position.z = -30
  trackGroup.add(trainGroup)

  return {
    trackGroup, trainGroup, carriageGroups,
    departLabel: statusText,
    trainNoLabel: trainNoLabels[0] || null, trainNoLabels,
    // 列位级动画用的 slotGroup 与 jointGroup 引用
    slotGroupPos1, slotGroupPos2, jointGroup,
    catenary,  // 接触网控制器
    // 一位/二位 供电状态标牌：与接触网状态同步
    powerLabels: { slot1: slot1PowerLabel, slot2: slot2PowerLabel },
    // 作业状态标记（可点击）：供 SceneManager 纳入 raycast 交互
    workMarkers,
  }
}
