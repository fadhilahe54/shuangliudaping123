/**
 * TextSprite.js — Three.js Canvas 文字标签生成器
 *
 * 迟了替代 troika-three-text，避免它的超时和内存问题。
 * 实现方式：将文字绘制到离屏 Canvas，再封装为 Three.js 摄影面或平面标签
 *
 * 提供两种模式：
 *   - createTextSprite：  永远面向相机的 Sprite（THREE.Sprite），适合悬浮标签
 *   - createFlatTextPlane：固定朝向的平面（THREE.Mesh + PlaneGeometry），适合嵌入 3D 展示板、按钟文字
 *
 * Canvas 分辨率跟随性能档位：
 *   - high： dpr=1.75（清晰度最高）
 *   - medium： dpr=1.25
 *   - low：  dpr=1.0（节约显存和 GPU 上传开销）
 */
import * as THREE from 'three'
// 性能档位检测（决定 Canvas 分辨率）
import { getThreePerformanceProfile } from '../utils/performanceProfile.js'

// 中文优先的字体栈，确保 Windows / macOS / Linux 下都能渲染中文
const FONT_STACK = "'Microsoft YaHei','PingFang SC','Noto Sans SC','Helvetica Neue',Arial,sans-serif"

/**
 * 在 Canvas 2D 上下文中绘制圆角矩形路径
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文对象
 * @param {number} x - 矩形左上角的 X 坐标
 * @param {number} y - 矩形左上角的 Y 坐标
 * @param {number} width - 矩形的宽度
 * @param {number} height - 矩形的高度
 * @param {number} radius - 圆角半径，会自动限制在合理范围内（不超过宽度或高度的一半）
 */
function drawRoundRect(ctx, x, y, width, height, radius) {
  // 计算实际使用的圆角半径，确保不超过矩形尺寸的一半且不为负数
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))

  // 开始新的路径绘制
  ctx.beginPath()

  // 移动到上边线的起始点（左侧圆角结束位置）
  ctx.moveTo(x + r, y)

  // 绘制上边线（从左侧圆角结束到右侧圆角开始）
  ctx.lineTo(x + width - r, y)

  // 绘制右上角圆角
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)

  // 绘制右边线（从右上角圆角结束到右下角圆角开始）
  ctx.lineTo(x + width, y + height - r)

  // 绘制右下角圆角
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)

  // 绘制下边线（从右下角圆角结束到左下角圆角开始）
  ctx.lineTo(x + r, y + height)

  // 绘制左下角圆角
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)

  // 绘制左边线（从左下角圆角结束到左上角圆角开始）
  ctx.lineTo(x, y + r)

  // 绘制左上角圆角
  ctx.quadraticCurveTo(x, y, x + r, y)

  // 闭合路径
  ctx.closePath()
}

/**
 * 公共 Canvas 文字渲染器
 * 将文字和样式绘制到离屏 Canvas 上，之后代用 CanvasTexture 封装为三维纹理
 * 为 createTextSprite 和 createFlatTextPlane 共用的内部函数
 * @param canvas  - 预创建好的 HTMLCanvasElement
 * @param ctx     - 对应的 2D 渲染上下文
 * @param nextText - 要显示的文字内容
 * @param options  - 样式参数对象
 * @returns {{width:number, height:number}} 渲染后的逻辑像素宽高（未乘 dpr）
 */
function renderCanvasText(canvas, ctx, nextText, options) {
  const {
    fontSize,
    fontWeight,
    color,
    backgroundColor,
    borderColor,
    borderWidth,
    borderRadius,
    paddingX,
    paddingY,
    lineHeight,
    outlineColor,
    outlineWidth,
    shadowColor,
    shadowBlur,
  } = options

  const text = String(nextText ?? '--')
  // 支持多行文字（\n 分隔）
  const lines = text.split('\n')
  // Canvas 分辨率跟随性能档位：low=1 / medium=1.25 / high=1.75
  // 老电脑会生成更小的 Canvas，减少显存和 GPU 上传开销
  const dpr = getThreePerformanceProfile().pixelRatio

  // 先用临时字体设置测量最底文字宽度
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_STACK}`
  const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width), 1)
  const linePixelHeight = fontSize * lineHeight
  // 计算布局尺寸（包含内边距、边框宽度、描边宽度）
  const width = Math.ceil(textWidth + paddingX * 2 + borderWidth * 2 + outlineWidth * 2)
  const height = Math.ceil(lines.length * linePixelHeight + paddingY * 2 + borderWidth * 2 + outlineWidth * 2)

  // 设置实际 Canvas 像素尺寸（dpr 倍）
  canvas.width = Math.max(2, Math.ceil(width * dpr))
  canvas.height = Math.max(2, Math.ceil(height * dpr))

  // 应用 dpr 开始渲染
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'

  // 绘制背景和边框
  if (backgroundColor !== 'rgba(0,0,0,0)' || borderWidth > 0) {
    drawRoundRect(ctx, borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth, borderRadius)
    if (backgroundColor !== 'rgba(0,0,0,0)') {
      ctx.fillStyle = backgroundColor
      ctx.fill()
    }
    if (borderWidth > 0) {
      ctx.lineWidth = borderWidth
      ctx.strokeStyle = borderColor
      ctx.stroke()
    }
  }

  // 文字阴影（用于发光效果）
  ctx.shadowColor = shadowColor
  ctx.shadowBlur = shadowBlur
  lines.forEach((line, index) => {
    const y = paddingY + borderWidth + outlineWidth + linePixelHeight * (index + 0.5)
    // 文字描边（先描边后填充，模拟 troika 的 outlineWidth 效果）
    if (outlineWidth > 0) {
      ctx.lineWidth = outlineWidth * 2
      ctx.strokeStyle = outlineColor
      ctx.strokeText(line, width / 2, y)
    }
    ctx.fillStyle = color
    ctx.fillText(line, width / 2, y)
  })
  // 关闭阴影，避免影响后续绘制
  ctx.shadowColor = 'rgba(0,0,0,0)'
  ctx.shadowBlur = 0

  return { width, height }
}

/**
 * 创建始终面向相机的 Canvas 文字 Sprite
 * 适合悬浮在 3D 场景中的标签（如股道号、车组号等悬浮标签）
 * THREE.Sprite 会自动追踪相机方向，无需手动更新旋转
 *
 * @param {string} initialText - 初始显示文字
 * @param {Object} options     - 样式参数（详见下方解构）
 * @returns {THREE.Sprite}     sprite.userData.setText(text) 可更新文字
 */
export function createTextSprite(initialText, options = {}) {
  const {
    fontSize = 64,
    fontWeight = '700',
    color = '#ffffff',
    backgroundColor = 'rgba(0,0,0,0)',
    borderColor = 'rgba(0,0,0,0)',
    borderWidth = 0,
    borderRadius = 0,
    paddingX = 24,
    paddingY = 12,
    lineHeight = 1.2,
    worldHeight = 2,
    opacity = 1,
    depthTest = false,
    outlineColor = 'rgba(0,0,0,0)',
    outlineWidth = 0,
    shadowColor = 'rgba(0,0,0,0)',
    shadowBlur = 0,
  } = options

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
    depthTest,
    opacity,
  })

  const sprite = new THREE.Sprite(material)

  /**
   * 更新 Sprite 显示文字
   * @param {string} nextText - 新的文字内容
   */
  const setText = (nextText) => {
    const { width, height } = renderCanvasText(canvas, ctx, nextText, {
      fontSize, fontWeight, color, backgroundColor, borderColor,
      borderWidth, borderRadius, paddingX, paddingY, lineHeight,
      outlineColor, outlineWidth, shadowColor, shadowBlur,
    })
    // 通知 Three.js 重新上传 Canvas 纹理到 GPU
    texture.needsUpdate = true
    // 根据 Canvas 宝高比调整 Sprite 的世界坐标尺寸
    const aspect = width / height
    sprite.scale.set(worldHeight * aspect, worldHeight, 1)
  }

  // 将 setText 挂载到 userData，供外部动态更新文字内容
  sprite.userData.setText = setText
  setText(initialText)
  return sprite
}

/**
 * 创建固定朝向的 Canvas 文字平面（PlaneGeometry Mesh）
 * 适合嵌入 3D 展示板、跟随物体旋转的内嵌文字（如控制台按钟标签、轨道名称等）
 * 与 createTextSprite 的区别：Mesh 不会自动追踪相机，需要手动设置旋转
 *
 * @param {string} initialText - 初始文字
 * @param {Object} options     - 样式参数
 * @returns {THREE.Mesh}       mesh.userData.setText(text) 可动态更新文字
 */
export function createFlatTextPlane(initialText, options = {}) {
  const {
    fontSize = 64,
    fontWeight = '700',
    color = '#ffffff',
    backgroundColor = 'rgba(0,0,0,0)',
    borderColor = 'rgba(0,0,0,0)',
    borderWidth = 0,
    borderRadius = 0,
    paddingX = 24,
    paddingY = 12,
    lineHeight = 1.2,
    worldHeight = 2,
    opacity = 1,
    depthTest = true,
    outlineColor = 'rgba(0,0,0,0)',
    outlineWidth = 0,
    shadowColor = 'rgba(0,0,0,0)',
    shadowBlur = 0,
    side = THREE.DoubleSide,
  } = options

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest,
    opacity,
    side,
  })

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)

  const setText = (nextText) => {
    const { width, height } = renderCanvasText(canvas, ctx, nextText, {
      fontSize, fontWeight, color, backgroundColor, borderColor,
      borderWidth, borderRadius, paddingX, paddingY, lineHeight,
      outlineColor, outlineWidth, shadowColor, shadowBlur,
    })
    texture.needsUpdate = true
    const aspect = width / height
    mesh.scale.set(worldHeight * aspect, worldHeight, 1)
  }

  mesh.userData.setText = setText
  setText(initialText)
  return mesh
}
