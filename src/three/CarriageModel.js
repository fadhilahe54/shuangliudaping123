/**
 * CarriageModel.js — 车厢 3D 模型生成器
 *
 * 提供两种车厢建模函数：
 *   - createCarriageModel()    普速列车车厢（25G/25T型），使用 BoxGeometry 拼接
 *   - createEMUCarriageModel() 动车组车厢（CR200J "绿巨人"），中间节用 Box 拼接，
 *                              头车/尾车优先加载 GLB 模型（200j.glb），缓存后 clone 复用
 *
 * 性能优化设计：
 *   - 所有车厢共用 SharedGeometries 中定义的共享几何体和材质，避免 GPU 显存浪费
 *   - CR200J 头车 GLB 模型异步加载，加载完成后自动填充到已创建的 Group 占位符中
 *   - 预处理 wrapper 缓存（_headWrapperCache/_tailWrapperCache）避免每节车厢重算包围盒
 *   - 车头 Logo 纹理绿化处理（将灰度图像素映射为对应车身颜色）
 *
 * 还提供以下工具函数：
 *   - updateCarriageVisual()   根据状态（正常/检修/报警）更新车厢颜色和材质
 */
import * as THREE from 'three'
// GLB 3D 模型加载器（用于加载 CR200J 头车外壳模型）
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
// Canvas 文字平面（用于车厢号标签）
import { createFlatTextPlane } from './TextSprite.js'
// 车厢间距常量（决定每节车厢的 Z 轴偏移量）
import { CARRIAGE_SPACING } from '../utils/constants.js'
// 共享几何体（车身、车顶、转向架、车轮、车窗、车门等）和材质
import {
  bodyGeo, roofGeo, roofCurveGeo, underGeo, stripeGeo, thinStripeGeo,
  bogieGeo, wheelGeo, windowGeo, doorGeo, gangwayGeo, locoFrontGeo,
  locoWindowGeo, headlightGeo, smallHeadlightGeo, cowcatcherGeo,
  pantographPoleGeo, pantographTopGeo, statusIndicatorGeo, highlightGeo,
  emuDoorGeo,
  emuWindowBandGeo, emuSwooshGeo,
  windowMat, underMat, bogieMat, wheelMat, doorMat, gangwayMat,
  headlightMat, pantographBaseMat, pantographTopMat, cowcatcherMat,
  highlightMat, emuDoorMat, emuWindowBandMat,
} from './SharedGeometries.js'

/* ================================================================
 *  CR200J 整车 GLB 模型
 *  预加载 200j.glb，缓存后 clone 给头车/尾车
 *  头车/尾车整节使用 GLB 模型，保留原始颜色，不再拼接 BoxGeometry
 *  自动探测模型轴向，分轴缩放+精确定位
 * ================================================================ */

// ---- GLB 模型缓存 ----
let _headModelCache = null   // 缓存加载后的原始模型
let _headModelLoading = null // 加载中的 Promise
// ---- 预处理后的头车/尾车 wrapper 缓存（避免每次 _attachHeadModel 重算包围盒）----
let _headWrapperCache = null  // 头车 wrapper（已旋转+缩放+居中）
let _tailWrapperCache = null  // 尾车 wrapper（已旋转+缩放+居中+翻转180°）
let _wrapperCacheBuilding = false  // 防止并发构建

// ---- 整节车厢参考尺寸（用于将 GLB 缩放到场景车厢大小）----
const _BODY_W = 2.8      // 车身宽度 (X)
const _BODY_H = 2.775    // 车身+车顶总高
const _BODY_Y = 0.4875   // Y中心
// 整车 GLB 模式下的 Z 方向目标长度（与 CARRIAGE_SPACING 保持一致，略短留连接器空间）
const _FULL_CAR_Z_LEN = 12.0

const EMU_PLATFORM_ALIGNMENT_Z_OFFSET = 2.5

const _headLogoGeo = new THREE.PlaneGeometry(0.9, 0.9)
let _headLogoTexture = null
let _headLogoLoading = null

function _loadHeadLogoTexture() {
  if (_headLogoTexture) return Promise.resolve(_headLogoTexture)
  if (_headLogoLoading) return _headLogoLoading

  _headLogoLoading = new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const targetColor = new THREE.Color('#00b853')
      const tr = Math.round(targetColor.r * 255)
      const tg = Math.round(targetColor.g * 255)
      const tb = Math.round(targetColor.b * 255)

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        const brightness = (r + g + b) / 3
        if (a === 0 || brightness < 20) {
          data[i + 3] = 0
          continue
        }
        data[i] = tr
        data[i + 1] = tg
        data[i + 2] = tb
      }

      ctx.putImageData(imageData, 0, 0)
      const texture = new THREE.CanvasTexture(canvas)
      if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace
      texture.needsUpdate = true
      _headLogoTexture = texture
      resolve(texture)
    }
    img.onerror = reject
    img.src = '/img/logo阴影.png'
  })

  return _headLogoLoading
}

function _createEMUHeadLogoMesh(isLeftSide, isTail) {
  if (!_headLogoTexture) return null
  const material = new THREE.MeshBasicMaterial({
    map: _headLogoTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(_headLogoGeo, material)
  const x = isLeftSide ? -1.46 : 1.46
  const y = -0.15
  const z = isTail ? 4.45 : -4.45
  mesh.position.set(x, y, z)
  mesh.rotation.y = isLeftSide ? -Math.PI / 2 : Math.PI / 2
  mesh.renderOrder = 4
  return mesh
}

function _addEMUHeadLogo(group, isTail = false) {
  if (group.userData._emuHeadLogoAttached) return
  if (!_headLogoTexture) {
    _loadHeadLogoTexture().then(() => _addEMUHeadLogo(group, isTail)).catch(() => {})
    return
  }

  group.userData._emuHeadLogoAttached = true
  const leftLogo = _createEMUHeadLogoMesh(true, isTail)
  const rightLogo = _createEMUHeadLogoMesh(false, isTail)
  if (leftLogo) group.add(leftLogo)
  if (rightLogo) group.add(rightLogo)
}

/**
 * 预加载车头 GLB 模型（模块加载时自动开始）
 */
function _loadHeadModel() {
  if (_headModelCache) return Promise.resolve(_headModelCache)
  if (_headModelLoading) return _headModelLoading

  const loader = new GLTFLoader()
  _headModelLoading = new Promise((resolve, reject) => {
    loader.load(
      '/model/200j.glb',
      (gltf) => {
        const model = gltf.scene
        _headModelCache = model
        // 首次加载后立即构建预处理缓存，后续挂载头/尾车只需 clone 缓存
        _buildWrapperCache()
        resolve(model)
      },
      undefined,
      (err) => {
        console.error('[CR200J] 车头模型加载失败:', err)
        _headModelLoading = null
        reject(err)
      }
    )
  })
  return _headModelLoading
}

/**
 * 从原始模型构建预处理后的头车/尾车 wrapper 缓存
 * 只做一次：旋转+缩放+居中+冻结矩阵，后续 _attachHeadModel 直接 clone 缓存
 */
function _buildWrapperCache() {
  if (!_headModelCache || _headWrapperCache) return
  if (_wrapperCacheBuilding) return
  _wrapperCacheBuilding = true

  const t0 = performance.now()

  // ---- 1. clone 并归零中心 ----
  const headClone = _headModelCache.clone()
  headClone.traverse((child) => {
    if (!child.isMesh || !child.material) return
    child.material = child.material.clone()
  })

  const origBox = new THREE.Box3().setFromObject(headClone)
  const origSize = origBox.getSize(new THREE.Vector3())
  const origCenter = origBox.getCenter(new THREE.Vector3())
  headClone.position.sub(origCenter)

  // ---- 2. 确定轴向并旋转 ----
  const axes = [
    { axis: 'x', len: origSize.x },
    { axis: 'y', len: origSize.y },
    { axis: 'z', len: origSize.z },
  ].sort((a, b) => b.len - a.len)

  const longAxis = axes[0].axis   // 最长 → 前后(Z)
  const shortAxis = axes[1].axis  // 次长 → 上下(Y)【保持与原逻辑一致】

  const pivot = new THREE.Group()
  pivot.add(headClone)

  // 旋转使: longAxis→Z, midAxis→X, shortAxis→Y
  if (longAxis === 'x' && shortAxis === 'y') {
    pivot.rotation.y = -Math.PI / 2
  } else if (longAxis === 'x' && shortAxis === 'z') {
    pivot.rotation.set(Math.PI / 2, Math.PI / 2, 0)
  } else if (longAxis === 'y' && shortAxis === 'x') {
    pivot.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
  } else if (longAxis === 'y' && shortAxis === 'z') {
    pivot.rotation.x = -Math.PI / 2
  } else if (longAxis === 'z' && shortAxis === 'x') {
    pivot.rotation.z = Math.PI / 2
  }
  // longAxis === 'z' && shortAxis === 'y' → 已对齐，无需旋转

  // ---- 3. 测量旋转后包围盒并分轴缩放 ----
  pivot.updateMatrixWorld(true)
  const rotBox = new THREE.Box3().setFromObject(pivot)
  const rotSize = rotBox.getSize(new THREE.Vector3())

  const sx = _BODY_W / rotSize.x
  const sy = _BODY_H / rotSize.y
  const sz = _FULL_CAR_Z_LEN / rotSize.z

  const outerWrapper = new THREE.Group()
  outerWrapper.add(pivot)
  outerWrapper.scale.set(sx, sy, sz)

  // ---- 4. 测量最终包围盒并居中 ----
  outerWrapper.updateMatrixWorld(true)
  const finalBox = new THREE.Box3().setFromObject(outerWrapper)
  const finalCenter = finalBox.getCenter(new THREE.Vector3())

  // 头车：居中对齐
  outerWrapper.position.set(
    -finalCenter.x,
    _BODY_Y - finalCenter.y,
    -finalCenter.z
  )
  outerWrapper.updateMatrixWorld(true)

  // 冻结矩阵，避免每帧重新计算
  outerWrapper.traverse((child) => {
    child.matrixAutoUpdate = false
    child.updateMatrix()
  })

  _headWrapperCache = outerWrapper

  // ---- 5. 构建尾车缓存（翻转180°） ----
  const tailOuter = outerWrapper.clone()
  tailOuter.traverse((child) => {
    if (child.isMesh && child.material) child.material = child.material.clone()
  })

  const tailWrapper = new THREE.Group()
  tailWrapper.add(tailOuter)
  tailWrapper.rotation.set(0, Math.PI, 0)

  tailWrapper.updateMatrixWorld(true)
  const tailBox = new THREE.Box3().setFromObject(tailWrapper)
  const tailCenter = tailBox.getCenter(new THREE.Vector3())
  tailWrapper.position.set(
    -tailCenter.x,
    _BODY_Y - tailCenter.y,
    -tailCenter.z
  )
  tailWrapper.updateMatrixWorld(true)

  tailWrapper.traverse((child) => {
    child.matrixAutoUpdate = false
    child.updateMatrix()
  })

  _tailWrapperCache = tailWrapper

  if (import.meta.env.DEV) console.log(`[perf] _buildWrapperCache: ${(performance.now() - t0).toFixed(0)}ms`)
  _wrapperCacheBuilding = false
}

// 模块加载时立即开始预加载
_loadHeadModel()
 _loadHeadLogoTexture()

/**
 * 将 GLB 整车模型 clone + 自动轴向探测 + 分轴缩放 + 精确定位
 * 保留 GLB 模型原始颜色，不做重新着色
 * @param {THREE.Group} group - 车厢组
 * @param {boolean} isTail - 是否为尾车（鼻尖朝 +Z）
 * @param {Function} [onReady] - GLB 挂载完成后的回调（用于通知场景重新渲染）
 */
function _attachHeadModel(group, isTail = false, onReady = null) {
  // 确保 _headMeshes 提前初始化，避免异步期间为 undefined
  if (!group.userData._headMeshes) group.userData._headMeshes = []

  if (!_headModelCache) {
    // 模型还没加载完，等加载完后再挂载
    _loadHeadModel().then(() => _attachHeadModel(group, isTail, onReady)).catch(() => {})
    return
  }

  // 确保预处理缓存已构建
  if (!_headWrapperCache) {
    _buildWrapperCache()
  }

  // 直接 clone 预处理后的缓存，不再重算包围盒
  const sourceWrapper = isTail ? _tailWrapperCache : _headWrapperCache
  if (!sourceWrapper) {
    // 缓存构建失败，跳过挂载（理论上不应发生）
    console.warn('[CR200J] wrapper缓存未就绪，跳过挂载')
    return
  }

  const wrapper = sourceWrapper.clone()
  // clone 材质（避免影响缓存）
  wrapper.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone()
    }
  })

  // 设置阴影 + 收集车头 mesh
  const headMeshes = []
  wrapper.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true
      headMeshes.push({ mesh: child, origMat: child.material })
    }
  })
  group.userData._headMeshes.push(...headMeshes)
  group.add(wrapper)

  // 如果 GLB 异步挂载完成时 group 已处于高亮/选中状态，补上色
  _applyPendingHighlight(group, headMeshes)

  if (onReady) onReady()
}

/**
 * GLB 挂载完成后，检查 group 是否有未完成的高亮/选中标记，自动补色
 */
function _applyPendingHighlight(group, newMeshes) {
  const highlightColor = group.userData._activeHighlightColor
  if (highlightColor && newMeshes.length > 0) {
    newMeshes.forEach(({ mesh, origMat }) => {
      mesh.material = origMat.clone()
      mesh.material.color.set(highlightColor)
      if (mesh.material.emissive) {
        mesh.material.emissive.set('#fbbf24')
        mesh.material.emissiveIntensity = 0.3
      }
    })
  }
}

/* ================================================================
 *  共享材质 —— 普速列车（深绿色经典涂装）
 * ================================================================ */
const sharedBodyMat = new THREE.MeshLambertMaterial({ color: '#004d26' })
const sharedRoofMat = new THREE.MeshLambertMaterial({ color: '#148178' })
const sharedStripeMat = new THREE.MeshLambertMaterial({ color: '#facc15' })
const sharedLocoBodyMat = new THREE.MeshLambertMaterial({ color: '#004d26' })

/* ================================================================
 *  共享材质 —— 动车组 CR200J "绿巨人"（荧光绿涂装）
 * ================================================================ */
const sharedEMUBodyMat = new THREE.MeshLambertMaterial({ color: '#3ba431' })
const sharedEMURoofMat = new THREE.MeshLambertMaterial({ color: '#26b305' })
// Mc 动力车专用车顶材质（深银灰色，与拖车/控制车的浅绿色车顶区分）
const sharedEMUMcRoofMat = new THREE.MeshLambertMaterial({ color: '#6b7280' })
const sharedEMUStripeMat = new THREE.MeshLambertMaterial({ color: '#fdd835' })
const sharedEMULocoBodyMat = sharedEMUBodyMat

/* ================================================================
 *  材质查找表（按 trainType 获取正确的共享材质集）
 * ================================================================ */
const MATERIAL_SETS = {
  conventional: {
    body: sharedBodyMat,
    roof: sharedRoofMat,
    stripe: sharedStripeMat,
    locoBody: sharedLocoBodyMat,
  },
  emu: {
    body: sharedEMUBodyMat,
    roof: sharedEMURoofMat,
    stripe: sharedEMUStripeMat,
    locoBody: sharedEMULocoBodyMat,
  },
}

// （头/尾车专用 BoxGeometry 已移除，头车/尾车整节使用 GLB 模型）

// 状态指示灯共享材质
const statusIndicatorMats = {
  Normal: new THREE.MeshLambertMaterial({ color: '#06b6d4', emissive: '#06b6d4', emissiveIntensity: 2 }),
  Warning: new THREE.MeshLambertMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 2 }),
  Maintenance: new THREE.MeshLambertMaterial({ color: '#eab308', emissive: '#eab308', emissiveIntensity: 2 }),
}

function getStatusMaterial(status) {
  return statusIndicatorMats[status] || statusIndicatorMats.Normal
}

/* ================================================================
 *  公共部件构建函数
 * ================================================================ */

function _buildBogiesAndWheelsAt(group, bogieZPositions) {
  // 转向架使用 InstancedMesh，每节车不再占用 2 个 DrawCall
  const bogieInstanced = new THREE.InstancedMesh(bogieGeo, bogieMat, bogieZPositions.length)
  const bogieMatrix = new THREE.Matrix4()
  bogieZPositions.forEach((z, i) => {
    bogieMatrix.makeTranslation(0, -1.4, z)
    bogieInstanced.setMatrixAt(i, bogieMatrix)
  })
  bogieInstanced.instanceMatrix.needsUpdate = true
  group.add(bogieInstanced)

  const wheelPositions = []
  ;bogieZPositions.forEach(z => {
    ;[-0.6, 0.6].forEach(wz => {
      wheelPositions.push([-0.8, -1.4 - 0.15, z + wz])
      wheelPositions.push([0.8, -1.4 - 0.15, z + wz])
    })
  })
  const wheelInstanced = new THREE.InstancedMesh(wheelGeo, wheelMat, wheelPositions.length)
  const wheelMatrix = new THREE.Matrix4()
  const wheelQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))
  wheelPositions.forEach(([x, y, z], i) => {
    wheelMatrix.compose(new THREE.Vector3(x, y, z), wheelQuat, new THREE.Vector3(1, 1, 1))
    wheelInstanced.setMatrixAt(i, wheelMatrix)
  })
  wheelInstanced.instanceMatrix.needsUpdate = true
  group.add(wheelInstanced)
}

/** 创建转向架 + 车轮 */
function _buildBogiesAndWheels(group) {
  // 转向架使用 InstancedMesh，每节车只产生 1 个 DrawCall
  const bogieZ = [-4, 4]
  const bogieInstanced = new THREE.InstancedMesh(bogieGeo, bogieMat, bogieZ.length)
  const bogieMatrix = new THREE.Matrix4()
  bogieZ.forEach((z, i) => {
    bogieMatrix.makeTranslation(0, -1.4, z)
    bogieInstanced.setMatrixAt(i, bogieMatrix)
  })
  bogieInstanced.instanceMatrix.needsUpdate = true
  group.add(bogieInstanced)

  const wheelPositions = []
  ;[-4, 4].forEach(z => {
    ;[-0.6, 0.6].forEach(wz => {
      wheelPositions.push([-0.8, -1.4 - 0.15, z + wz])
      wheelPositions.push([0.8, -1.4 - 0.15, z + wz])
    })
  })
  const wheelInstanced = new THREE.InstancedMesh(wheelGeo, wheelMat, wheelPositions.length)
  const wheelMatrix = new THREE.Matrix4()
  const wheelQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))
  wheelPositions.forEach(([x, y, z], i) => {
    wheelMatrix.compose(new THREE.Vector3(x, y, z), wheelQuat, new THREE.Vector3(1, 1, 1))
    wheelInstanced.setMatrixAt(i, wheelMatrix)
  })
  wheelInstanced.instanceMatrix.needsUpdate = true
  group.add(wheelInstanced)
}

/** 创建客车窗户（InstancedMesh） */
function _buildPassengerWindows(group) {
  const winZPositions = []
  for (let i = -4.2; i <= 4.2; i += 1.4) winZPositions.push(i)
  const winCount = winZPositions.length

  const winInstancedL = new THREE.InstancedMesh(windowGeo, windowMat, winCount)
  const winInstancedR = new THREE.InstancedMesh(windowGeo, windowMat, winCount)
  const winMatrix = new THREE.Matrix4()
  winZPositions.forEach((z, i) => {
    winMatrix.makeTranslation(1.41, 0.4, z)
    winInstancedL.setMatrixAt(i, winMatrix)
    winMatrix.makeTranslation(-1.41, 0.4, z)
    winInstancedR.setMatrixAt(i, winMatrix)
  })
  winInstancedL.instanceMatrix.needsUpdate = true
  winInstancedR.instanceMatrix.needsUpdate = true
  group.add(winInstancedL)
  group.add(winInstancedR)
}

/** 创建车门（普速列车门） */
function _buildConventionalDoors(group) {
  const doorInstancedL = new THREE.InstancedMesh(doorGeo, doorMat, 2)
  const doorInstancedR = new THREE.InstancedMesh(doorGeo, doorMat, 2)
  const doorMatrix = new THREE.Matrix4()
  ;[-5.2, 5.2].forEach((dz, i) => {
    doorMatrix.makeTranslation(1.41, 0.1, dz)
    doorInstancedL.setMatrixAt(i, doorMatrix)
    doorMatrix.makeTranslation(-1.41, 0.1, dz)
    doorInstancedR.setMatrixAt(i, doorMatrix)
  })
  doorInstancedL.instanceMatrix.needsUpdate = true
  doorInstancedR.instanceMatrix.needsUpdate = true
  group.add(doorInstancedL)
  group.add(doorInstancedR)
}

/** 创建车门（动车组塞拉门，稍宽） */
function _buildEMUDoors(group) {
  const doorInstancedL = new THREE.InstancedMesh(emuDoorGeo, emuDoorMat, 2)
  const doorInstancedR = new THREE.InstancedMesh(emuDoorGeo, emuDoorMat, 2)
  const doorMatrix = new THREE.Matrix4()
  ;[-5.0, 5.0].forEach((dz, i) => {
    doorMatrix.makeTranslation(1.41, 0.1, dz)
    doorInstancedL.setMatrixAt(i, doorMatrix)
    doorMatrix.makeTranslation(-1.41, 0.1, dz)
    doorInstancedR.setMatrixAt(i, doorMatrix)
  })
  doorInstancedL.instanceMatrix.needsUpdate = true
  doorInstancedR.instanceMatrix.needsUpdate = true
  group.add(doorInstancedL)
  group.add(doorInstancedR)
}

/** 创建受电弓 */
function _buildPantograph(group, zPos = 2) {
  const pantoGroup = new THREE.Group()
  pantoGroup.position.set(0, 2.0, zPos)

  const pole1 = new THREE.Mesh(pantographPoleGeo, pantographBaseMat)
  pole1.position.set(0, 0.2, 0)
  pole1.rotation.set(0, 0, Math.PI / 4)
  pantoGroup.add(pole1)

  const pole2 = new THREE.Mesh(pantographPoleGeo, pantographBaseMat)
  pole2.position.set(0, 0.2, 0)
  pole2.rotation.set(0, 0, -Math.PI / 4)
  pantoGroup.add(pole2)

  const pantoTop = new THREE.Mesh(pantographTopGeo, pantographTopMat)
  pantoTop.position.set(0, 0.4, 0)
  pantoGroup.add(pantoTop)

  group.add(pantoGroup)
}

/** 创建动车组红色受电弓（CR200J 特征） */
function _buildEMUPantograph(group, zPos = 2) {
  const pantoGroup = new THREE.Group()
  pantoGroup.position.set(0, 2.0, zPos)

  // CR200J 标志性红色受电弓
  const pantoRedMat = new THREE.MeshLambertMaterial({ color: '#cc2222' })

  const pole1 = new THREE.Mesh(pantographPoleGeo, pantoRedMat)
  pole1.position.set(0, 0.2, 0)
  pole1.rotation.set(0, 0, Math.PI / 4)
  pantoGroup.add(pole1)

  const pole2 = new THREE.Mesh(pantographPoleGeo, pantoRedMat)
  pole2.position.set(0, 0.2, 0)
  pole2.rotation.set(0, 0, -Math.PI / 4)
  pantoGroup.add(pole2)

  const pantoTop = new THREE.Mesh(pantographTopGeo, pantoRedMat)
  pantoTop.position.set(0, 0.4, 0)
  pantoGroup.add(pantoTop)

  group.add(pantoGroup)
}

/** 创建 "CR" 标志文字 */
function _buildCRLogo(group, z, color = '#facc15', rotX = 0) {
  const crText = createFlatTextPlane('CR', {
    fontSize: 56,
    fontWeight: '700',
    color,
    worldHeight: 0.5,
    depthTest: true,
    outlineColor: '#000000',
    outlineWidth: 4,
  })
  crText.position.set(0, 0.3, z)
  crText.rotation.set(rotX, Math.PI, 0)
  group.add(crText)
}

/** 创建车厢号文字（左右两侧） */
function _buildCarriageLabels(group, id) {
  const textRight = createFlatTextPlane(id, {
    fontSize: 44,
    fontWeight: '700',
    color: '#ffffff',
    worldHeight: 0.4,
    depthTest: true,
    outlineColor: '#000000',
    outlineWidth: 3,
  })
  textRight.position.set(1.43, -0.15, 0)
  textRight.rotation.set(0, Math.PI / 2, 0)
  group.add(textRight)

  const textLeft = createFlatTextPlane(id, {
    fontSize: 44,
    fontWeight: '700',
    color: '#ffffff',
    worldHeight: 0.4,
    depthTest: true,
    outlineColor: '#000000',
    outlineWidth: 3,
  })
  textLeft.position.set(-1.43, -0.15, 0)
  textLeft.rotation.set(0, -Math.PI / 2, 0)
  group.add(textLeft)
}

/* ================================================================
 *  普速列车机车头（方正 HXD 风格）
 * ================================================================ */
function _buildConventionalHead(group) {
  // 方正机车前端
  const locoFront = new THREE.Mesh(locoFrontGeo, sharedLocoBodyMat)
  locoFront.position.set(0, 0.3, -6.1)
  group.add(locoFront)

  // 前窗（大方窗）
  const locoWindow = new THREE.Mesh(locoWindowGeo, windowMat)
  locoWindow.position.set(0, 0.8, -6.21)
  group.add(locoWindow)

  // 车头灯
  const mainLight = new THREE.Mesh(headlightGeo, headlightMat)
  mainLight.position.set(0, -0.1, -6.21)
  group.add(mainLight)

  const leftLight = new THREE.Mesh(smallHeadlightGeo, headlightMat)
  leftLight.position.set(-0.8, -0.5, -6.21)
  group.add(leftLight)

  const rightLight = new THREE.Mesh(smallHeadlightGeo, headlightMat)
  rightLight.position.set(0.8, -0.5, -6.21)
  group.add(rightLight)

  // 排障器
  const cowcatcher = new THREE.Mesh(cowcatcherGeo, cowcatcherMat)
  cowcatcher.position.set(0, -1.1, -6.15)
  cowcatcher.rotation.set(0.2, 0, 0)
  group.add(cowcatcher)

  // 受电弓
  _buildPantograph(group, 2)
}

/* ================================================================
 *  创建普速列车车厢 3D 对象
 * ================================================================ */
export function createCarriageModel(info, isLast = false, isGroupFirst = false) {
  const group = new THREE.Group()
  group.position.set(0, 1.75, info.index * CARRIAGE_SPACING)

  group.userData = {
    carriageId: info.id,
    type: 'carriage',
    trainType: 'conventional',
  }

  // 头车判断：整列第一节 或 本组第一节（多组车场景）
  const isLocomotive = info.index === 0 || isGroupFirst
  const matSet = MATERIAL_SETS.conventional

  // 车身
  const bodyMesh = new THREE.Mesh(bodyGeo, matSet.body)
  bodyMesh.position.set(0, 0.3, 0)
  bodyMesh.castShadow = true
  bodyMesh.receiveShadow = true
  group.add(bodyMesh)

  // 车顶
  const roofMesh = new THREE.Mesh(roofGeo, matSet.roof)
  roofMesh.position.set(0, 1.6, 0)
  roofMesh.castShadow = true
  group.add(roofMesh)

  const roofCurveMesh = new THREE.Mesh(roofCurveGeo, matSet.roof)
  roofCurveMesh.position.set(0, 1.8, 0)
  group.add(roofCurveMesh)

  // 底架
  const underMesh = new THREE.Mesh(underGeo, underMat)
  underMesh.position.set(0, -1.05, 0)
  group.add(underMesh)

  // 黄色条纹
  const stripeMesh = new THREE.Mesh(stripeGeo, matSet.stripe)
  stripeMesh.position.set(0, -0.4, 0)
  group.add(stripeMesh)

  const thinStripeMesh = new THREE.Mesh(thinStripeGeo, matSet.stripe)
  thinStripeMesh.position.set(0, 0.95, 0)
  group.add(thinStripeMesh)

  // 转向架 + 车轮
  _buildBogiesAndWheels(group)

  if (isLocomotive) {
    _buildConventionalHead(group)
  } else {
    _buildPassengerWindows(group)
    _buildConventionalDoors(group)
  }

  // 连接器
  if (!isLast) {
    const gangway = new THREE.Mesh(gangwayGeo, gangwayMat)
    gangway.position.set(0, 0.1, 6.1)
    group.add(gangway)
  }

  // 状态指示灯
  const statusMesh = new THREE.Mesh(statusIndicatorGeo, getStatusMaterial(info.status))
  statusMesh.position.set(0, 2.0, 0)
  group.add(statusMesh)

  // 车厢号文字
  _buildCarriageLabels(group, info.id)

  // 存储可变材质引用
  group.userData.bodyMesh = bodyMesh
  group.userData.roofMesh = roofMesh
  group.userData.roofCurveMesh = roofCurveMesh
  group.userData.stripeMesh = stripeMesh
  group.userData.thinStripeMesh = thinStripeMesh
  group.userData.highlightMesh = null

  return group
}

/* ================================================================
 *  创建动车组 CR200J "绿巨人" 车厢 3D 对象
 *  头车/尾车整节使用 GLB 模型（不再拼接 BoxGeometry）
 *  中间车仍使用 BoxGeometry 构建
 * ================================================================ */
export function createEMUCarriageModel(info, isLast = false, isHead = false, isGroupFirst = false, onModelReady = null) {
  const group = new THREE.Group()
  group.position.set(0, 1.75, info.index * CARRIAGE_SPACING + EMU_PLATFORM_ALIGNMENT_Z_OFFSET)

  group.userData = {
    carriageId: info.id,
    type: 'carriage',
    trainType: 'emu',
  }

  // 头车判断：整列第一节 或 本组第一节（多组车场景）
  const isLocomotive = info.index === 0 || isGroupFirst
  const isTailHead = isHead && isLast
  const isEndCar = isLocomotive || isTailHead

  if (isEndCar) {
    // ============================================================
    //  头车 / 尾车 —— 整节使用 GLB 模型，不创建 BoxGeometry 部件
    // ============================================================
    group.userData._isFullGLBCar = true

    // 转向架 + 车轮（仍然保留几何体构建，GLB 模型不一定包含转向架）
    if (isLocomotive) _buildBogiesAndWheelsAt(group, [0.4, 4.2])
    else _buildBogiesAndWheelsAt(group, [-4.2, -0.4])

    // 挂载整车 GLB 模型（异步加载完成后通过 onModelReady 通知场景重渲）
    if (isLocomotive) {
      _attachHeadModel(group, false, onModelReady)
      // 只有 Mc 动力车才有受电弓
      if (info.type === 'mc') _buildEMUPantograph(group, 2)
    } else {
      // 尾车（镜像）
      _attachHeadModel(group, true, onModelReady)
    }

    // 连接器
    if (!isLast) {
      const gangway = new THREE.Mesh(gangwayGeo, gangwayMat)
      gangway.position.set(0, 0.1, 6.1)
      group.add(gangway)
    }

    // 状态指示灯
    const statusMesh = new THREE.Mesh(statusIndicatorGeo, getStatusMaterial(info.status))
    statusMesh.position.set(0, 2.0, 0)
    group.add(statusMesh)

    // 车厢号文字
    _buildCarriageLabels(group, info.id)

    // 整车 GLB 模式下没有 bodyMesh 等引用，设为 null
    group.userData.bodyMesh = null
    group.userData.roofMesh = null
    group.userData.roofCurveMesh = null
    group.userData.stripeMesh = null
    group.userData.thinStripeMesh = null
    group.userData.windowBandMesh = null
    group.userData.highlightMesh = null

    return group
  }

  // ============================================================
  //  中间车 —— 仍使用 BoxGeometry 构建
  // ============================================================
  const matSet = MATERIAL_SETS.emu

  // 车身（荧光绿）
  const bodyMesh = new THREE.Mesh(bodyGeo, matSet.body)
  bodyMesh.position.set(0, 0.3, 0)
  bodyMesh.castShadow = true
  bodyMesh.receiveShadow = true
  group.add(bodyMesh)

  // 动车组黑色窗带
  const windowBandMesh = new THREE.Mesh(emuWindowBandGeo, emuWindowBandMat)
  windowBandMesh.position.set(0, 0.4, 0)
  group.add(windowBandMesh)

  // 车顶（Mc 动力车使用深银灰色，拖车/控制车使用浅绿色）
  const roofMat = info.type === 'mc' ? sharedEMUMcRoofMat : matSet.roof
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.position.set(0, 1.6, 0)
  roofMesh.castShadow = true
  group.add(roofMesh)

  const roofCurveMesh = new THREE.Mesh(roofCurveGeo, roofMat)
  roofCurveMesh.position.set(0, 1.8, 0)
  group.add(roofCurveMesh)

  // 底架
  const underMesh = new THREE.Mesh(underGeo, underMat)
  underMesh.position.set(0, -1.05, 0)
  group.add(underMesh)

  // 黄色色带
  const stripeMesh = new THREE.Mesh(stripeGeo, matSet.stripe)
  stripeMesh.position.set(0, -0.4, 0)
  group.add(stripeMesh)

  // 动车组侧面装饰线（Swoosh）
  const swooshL = new THREE.Mesh(emuSwooshGeo, sharedEMUStripeMat)
  swooshL.position.set(1.41, 0.2, -3.5)
  swooshL.rotation.set(0, 0, 0.2)
  group.add(swooshL)

  const swooshR = new THREE.Mesh(emuSwooshGeo, sharedEMUStripeMat)
  swooshR.position.set(-1.41, 0.2, -3.5)
  swooshR.rotation.set(0, 0, -0.2)
  group.add(swooshR)

  // 转向架 + 车轮
  _buildBogiesAndWheels(group)

  // 中间客车
  _buildPassengerWindows(group)
  _buildEMUDoors(group)

  // 只有 Mc 动力车才设置受电弓
  if (info.type === 'mc') {
    _buildEMUPantograph(group, 0)
  }

  // 连接器
  if (!isLast) {
    const gangway = new THREE.Mesh(gangwayGeo, gangwayMat)
    gangway.position.set(0, 0.1, 6.1)
    group.add(gangway)
  }

  // 状态指示灯
  const statusMesh = new THREE.Mesh(statusIndicatorGeo, getStatusMaterial(info.status))
  statusMesh.position.set(0, 2.0, 0)
  group.add(statusMesh)

  // 车厢号文字
  _buildCarriageLabels(group, info.id)

  // 存储可变材质引用
  group.userData.bodyMesh = bodyMesh
  group.userData.roofMesh = roofMesh
  group.userData.roofCurveMesh = roofCurveMesh
  group.userData.stripeMesh = stripeMesh
  group.userData.thinStripeMesh = null
  group.userData.windowBandMesh = windowBandMesh
  group.userData.highlightMesh = null

  return group
}

/* ================================================================
 *  更新车厢视觉状态（选中 / 搜索 / 默认）
 *  支持普速、动车组中间车（BoxGeometry）、动车组头/尾车（整车 GLB）三种模式
 * ================================================================ */
export function updateCarriageVisual(group, isSelected, isSearched) {
  const { bodyMesh, roofMesh, roofCurveMesh, stripeMesh, thinStripeMesh, trainType } = group.userData
  const isFullGLB = group.userData._isFullGLBCar === true
  const needsCustom = isSelected || isSearched
  const targetScale = needsCustom ? 1.05 : 1

  // 车头 GLB mesh 列表
  const headMeshes = group.userData._headMeshes || []

  // 设置/清除高亮标记（供 GLB 异步挂载后补色用）
  if (needsCustom) {
    group.userData._activeHighlightColor = '#2563eb'
  } else {
    delete group.userData._activeHighlightColor
  }

  if (isFullGLB) {
    // ---- 整车 GLB 模式：只通过 headMeshes 控制高亮 ----
    // GLB 模式通过 headMeshes[i].origMat 追踪原始材质，天然兼容 Phong 升级，无需改动
    if (needsCustom) {
      const bodyColor = '#2563eb'
      headMeshes.forEach(({ mesh, origMat }) => {
        if (mesh.material === origMat) {
          mesh.material = origMat.clone()
        }
        mesh.material.color.set(bodyColor)
        if (mesh.material.emissive) {
          mesh.material.emissive.set(0, 0, 0)
          mesh.material.emissiveIntensity = 0
        }
      })
    } else {
      // 恢复 GLB 原始材质
      headMeshes.forEach(({ mesh, origMat }) => {
        if (mesh.material !== origMat) {
          mesh.material.dispose()
          mesh.material = origMat
        }
      })
    }
  } else {
    // ---- BoxGeometry 模式（普速 + 动车中间车）----
    if (!bodyMesh) return

    // ★ 关键修复：不再用 matSet.body（Lambert）做比较
    // 高画质模式下 upgradeSceneMaterialsToPhong 会把 Lambert 替换为 Phong，
    // 导致 bodyMesh.material === matSet.body 永远为 false，跳过 clone 直接改共享材质颜色
    // 改用 userData._origXxxMat 保存"首次高亮时 mesh 实际持有的材质"（Lambert 或 Phong 均可），
    // 确保高亮时一定 clone，取消高亮时恢复到正确的原始材质
    if (needsCustom) {
      // 首次进入高亮：保存当前材质作为"原始材质"基准
      if (!group.userData._origBodyMat) {
        group.userData._origBodyMat = bodyMesh.material
        group.userData._origRoofMat = roofMesh.material
        group.userData._origRoofCurveMat = roofCurveMesh.material
        group.userData._origStripeMat = stripeMesh.material
        if (thinStripeMesh) group.userData._origThinStripeMat = thinStripeMesh.material
      }
      // 若 mesh 仍在使用原始材质（未被 clone），则 clone 一份独立副本
      const origBody = group.userData._origBodyMat
      if (bodyMesh.material === origBody) {
        bodyMesh.material = origBody.clone()
        roofMesh.material = group.userData._origRoofMat.clone()
        roofCurveMesh.material = group.userData._origRoofCurveMat.clone()
        stripeMesh.material = group.userData._origStripeMat.clone()
        if (thinStripeMesh) thinStripeMesh.material = group.userData._origThinStripeMat.clone()
      }
      const bodyColor = '#2563eb'
      const stripeColor = '#ffffff'
      const roofColor = '#1d4ed8'
      bodyMesh.material.color.set(bodyColor)
      roofMesh.material.color.set(roofColor)
      roofCurveMesh.material.color.set(roofColor)
      stripeMesh.material.color.set(stripeColor)
      if (thinStripeMesh) thinStripeMesh.material.color.set(stripeColor)

      // 车头 mesh 跟随变色（老模式下仍可能存在附加的 GLB 鼻头）
      headMeshes.forEach(({ mesh, origMat }) => {
        if (mesh.material === origMat) {
          mesh.material = origMat.clone()
        }
        mesh.material.color.set(bodyColor)
        if (mesh.material.emissive) {
          mesh.material.emissive.set(0, 0, 0)
          mesh.material.emissiveIntensity = 0
        }
      })
    } else {
      // 取消高亮：恢复原始材质
      if (group.userData._origBodyMat) {
        // 有保存的原始材质引用 → 优先使用（兼容 Lambert / Phong 升级后的场景）
        if (bodyMesh.material !== group.userData._origBodyMat) {
          bodyMesh.material.dispose()
          roofMesh.material.dispose()
          roofCurveMesh.material.dispose()
          stripeMesh.material.dispose()
          if (thinStripeMesh) thinStripeMesh.material.dispose()
          bodyMesh.material = group.userData._origBodyMat
          roofMesh.material = group.userData._origRoofMat
          roofCurveMesh.material = group.userData._origRoofCurveMat
          stripeMesh.material = group.userData._origStripeMat
          if (thinStripeMesh) thinStripeMesh.material = group.userData._origThinStripeMat
        }
        // 清除保存的原始材质引用，下次高亮时重新捕获
        delete group.userData._origBodyMat
        delete group.userData._origRoofMat
        delete group.userData._origRoofCurveMat
        delete group.userData._origStripeMat
        delete group.userData._origThinStripeMat
      }
      // 注意：如果没有 _origBodyMat，说明这节车厢从未被高亮过，
      // 其材质已经是正确的原始状态（无论是 Lambert 还是升级后的 Phong），
      // 不需要任何操作。
      // ★ 旧代码在此处有"兜底 matSet 比较"逻辑，已移除！
      // 该逻辑在高画质模式下会错误地 dispose 共享 Phong 并降回 Lambert，
      // 导致其他车厢引用的共享 Phong 被破坏。

      // 恢复车头 mesh 原始材质
      headMeshes.forEach(({ mesh, origMat }) => {
        if (mesh.material !== origMat) {
          mesh.material.dispose()
          mesh.material = origMat
        }
      })
    }
  }

  // 平滑缩放
  group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15)

  // 选中高亮线框
  if (isSelected && !group.userData.highlightMesh) {
    const hl = new THREE.Mesh(highlightGeo, highlightMat)
    hl.position.set(0, 0.3, 0)
    group.add(hl)
    group.userData.highlightMesh = hl
  } else if (!isSelected && group.userData.highlightMesh) {
    group.remove(group.userData.highlightMesh)
    group.userData.highlightMesh = null
  }
}
