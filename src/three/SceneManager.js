/**
 * SceneManager.js — Three.js 3D 场景核心管理器
 *
 * 职责：
 *   - 初始化 WebGL 渲染器、场景、相机、灯光、轨道控制器
 *   - 根据后台股道配置调用 TrackBuilder 批量创建股道和车厢 3D 模型
 *   - 调用 BuildingModels 构建场景周边建筑（调度中心、检修楼等）
 *   - 管理渲染循环（requestAnimationFrame + 按需渲染 + 帧率限制）
 *   - 处理鼠标交互：悬停高亮、点击选中车厢/控制台按钮（Raycaster）
 *   - 提供列车出库/进库动画（GSAP tween 驱动 Z 轴位移）
 *   - 提供相机飞行动画（flyToCarriage/flyToCarriages，平滑过渡到目标位置）
 *   - 管理整列/单节车厢高亮、筛选显示、可见性切换
 *   - 低画质下启用 FXAA 后处理替代 MSAA；高画质下升级材质至 Phong
 *   - 监听 WebGL Context Lost/Restored 事件，自动恢复渲染
 *   - 组件卸载时通过 dispose(fullDestroy) 释放所有 GPU 资源
 *
 * 回调（由 useThreeScene 注入）：
 *   - onTrainClick(carriageId)           车厢被点击
 *   - onCarriageMiss()                   点击到空白区域
 *   - onControlClick(trackId, action)    控制台按钮被点击
 */
import * as THREE from 'three'
// 轨道球控制器（支持鼠标拖拽旋转、缩放、平移视角）
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// 股道和存车道 3D 构建函数
import { createTrack, createSidingTrack } from './TrackBuilder.js'
// 接触网电流流动效果 tick（仅 powered 段会驱动该效果）
import { tickCatenaryFlows } from './CatenaryBuilder.js'
// 周边建筑模型（调度中心、检修楼、围墙等）
import { createAllBuildings } from './BuildingModels.js'
// 车厢外观更新（状态颜色、高亮等）
import { updateCarriageVisual } from './CarriageModel.js'
// 控制台按钮悬停效果更新
import { updateButtonHover } from './ControlStandModel.js'
// 高画质材质升级（Lambert → Phong，增加镜面高光）
import { upgradeSceneMaterialsToPhong } from './MaterialUpgrader.js'
// FXAA 后处理管线（低画质下替代 MSAA 的全屏抗锯齿）
import { createFxaaPipeline } from './PostProcessing.js'
// GSAP 动画库（用于相机飞行和列车进出库动画）
import gsap from 'gsap'
// 性能档位检测（决定渲染质量、帧率限制、像素比等）
import { getThreePerformanceProfile } from '../utils/performanceProfile.js'
// 场景布局常量（股道数量/间距、相机配置、列车动画参数等）
import {
  TRACK_COUNT, TRACK_SPACING, TRACK_OFFSET, CARRIAGE_SPACING,
  CARRIAGE_Y, CAMERA_DEFAULT_POSITION, CAMERA_DEFAULT_TARGET,
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, FLY_CAMERA_OFFSET,
  SCENE_BG_COLOR, SCENE_FOG_NEAR, SCENE_FOG_FAR,
  TRAIN_POSITION_MIN, TRAIN_ENTER_START, TRAIN_ENTER_DURATION,
  N_TRACK_COUNT, N_TRACK_SPACING, N_TRACK_START_X,
  TRACK_TRAIN_TYPE, TRAIN_TYPE_EMU,
  calcNTrackStartX,
} from '../utils/constants.js'

/**
 * Three.js 场景管理器
 * 负责场景初始化、渲染循环、交互事件、相机动画
 */
export class SceneManager {
  constructor() {
    this.renderer = null
    this.scene = null
    this.camera = null
    this.controls = null
    this.animationId = null
    this.raycaster = new THREE.Raycaster()
    this.raycaster.far = 300 // 限制射线检测距离，忽略远处物体
    this.mouse = new THREE.Vector2()
    this.container = null

    // 可交互对象缓存（避免每次raycast遍历整个场景）
    this._interactiveObjects = []

    // 轨道和车厢数据映射
    this.trackData = {} // trackId -> { trackGroup, trainGroup, carriageGroups, controlStand }
    this.allCarriageGroups = {} // carriageId -> THREE.Group

    // 当前交互状态
    this.hoveredObject = null
    this.cameraAnimating = false

    // 按需渲染标记
    this._needsRender = true
    this._renderTimeout = null

    // 性能档位与帧率限制（老电脑友好）
    this.performanceProfile = null
    this._frameInterval = 1000 / 30
    this._lastRenderTime = 0
    this._lastPointerMoveTime = 0

    // FXAA 后处理管线（仅低画质启用）：composer 存在则代替 renderer.render
    this._fxaa = null

    // 事件引用（用于正确移除）
    this._boundResize = null
    this._boundPointerMove = null
    this._boundClick = null
    this._boundVisibilityChange = null
    this._boundContextLost = null
    this._boundContextRestored = null

    // 页面可见性状态：不可见时暂停渲染循环，避免后台积压 GSAP/RAF 回调
    this._isPaused = false

    // 回调
    this.onCarriageClick = null
    this.onTrainClick = null
    this.onCarriageMiss = null
    this.onControlClick = null

    // 整列高亮状态
    this._highlightedTrackId = null
    this._highlightedMaterials = []
  }

  /**
   * 初始化场景
   * @param {HTMLElement} container - DOM容器
   * @param {Object[]} carriages - 所有车厢数据
   * @param {Object[]} nCarriages - 存车道车厢数据
   * @param {Object} [trackConfig] - 后台股道配置 { mainTracks, sidingTracks }
   */
  init(container, carriages, nCarriages, trackConfig) {
    this.container = container
    this._nCarriages = nCarriages || []
    this._trackConfig = trackConfig || null

    // 读取性能档位（自动检测设备能力 / 用户手动选择 / URL 参数 ?perf=low）
    this.performanceProfile = getThreePerformanceProfile()
    this._frameInterval = 1000 / this.performanceProfile.targetFps
    gsap.ticker.fps(this.performanceProfile.targetFps)

    const width = container.clientWidth
    const height = container.clientHeight

    // 渲染器（老 CPU/GPU 友好：根据档位动态决定抗锯齿/像素比/阴影）
    // 高画质：开启 MSAA + 放开 pixelRatio，消除颗粒感与锯齿
    // 中/低画质：关闭 MSAA、限制 pixelRatio，保护老 GPU
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.performanceProfile.antialias === true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(this.performanceProfile.pixelRatio)
    this.renderer.shadowMap.enabled = this.performanceProfile.shadowEnabled
    this.renderer.shadowMap.type = this.performanceProfile.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.BasicShadowMap
    // 静态阴影：场景几何与灯光不变，阴影贴图不需要每帧重建（初始化后手动 needsUpdate=true 刷一次）
    // 资源加载、车厂进出、场景重建等场景下会手动重置 needsUpdate
    this.renderer.shadowMap.autoUpdate = false
    container.appendChild(this.renderer.domElement)

    // 场景
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(SCENE_BG_COLOR)
    this.scene.fog = new THREE.Fog(SCENE_BG_COLOR, SCENE_FOG_NEAR, SCENE_FOG_FAR)

    // 相机（从 localStorage 恢复上次视角，没有则用默认值）
    const savedCam = this._loadCameraState()
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR)
    this.camera.position.set(...(savedCam?.pos || CAMERA_DEFAULT_POSITION))

    // 控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(...(savedCam?.target || CAMERA_DEFAULT_TARGET))
    // 关闭阻尼，省去每帧 update 开销（老电脑友好）
    this.controls.enableDamping = false
    this.controls.minPolarAngle = 0
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05
    this.controls.minDistance = 10
    this.controls.maxDistance = 500
    this._saveCameraTimer = null
    this.controls.addEventListener('change', () => {
      this._needsRender = true
      // 节流保存相机状态
      if (this._saveCameraTimer) clearTimeout(this._saveCameraTimer)
      this._saveCameraTimer = setTimeout(() => this._saveCameraState(), 500)
    })
    this.controls.update()

    // 灯光
    this._setupLights()

    // 地面和网格
    this._setupGround()

    // 构建轨道
    this._buildTracks(carriages)

    // 构建n道停放线路
    if (this._nCarriages) {
      this._buildSidingTracks(this._nCarriages)
    }

    // 构建建筑物
    this._buildBuildings()

    // 事件
    this._bindEvents()

    // 为所有 InstancedMesh 计算 boundingSphere/Box，使 frustum culling 真正生效
    // （InstancedMesh 默认不计算实例并集包围体，导致摄像机看不到时仍走渲染管线）
    this.scene.traverse((obj) => {
      if (obj.isInstancedMesh) {
        if (typeof obj.computeBoundingSphere === 'function') obj.computeBoundingSphere()
        if (typeof obj.computeBoundingBox === 'function') obj.computeBoundingBox()
      }
    })

    // 高画质：把基础 Lambert 升级为带高光的 Phong，恢复以前的金属/光泽质感
    // 中/低画质保持 Lambert，节省 GPU 着色器开销
    if (this.performanceProfile?.name === 'high') {
      upgradeSceneMaterialsToPhong(this.scene)
    }

    // 低画质：不开 MSAA（兼容老 GPU），用 FXAA 后处理柔化锯齿（开销 ~1-3% GPU）
    if (this.performanceProfile?.useFxaa === true) {
      this._fxaa = createFxaaPipeline(this.renderer, this.scene, this.camera)
    }

    // 初始场景构建完成：手动刷一次静态阴影贴图
    this.renderer.shadowMap.needsUpdate = true

    // 启动渲染循环
    this._animate()
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.2)
    this.scene.add(ambient)

    const directional = new THREE.DirectionalLight(0xffffff, 1.5)
    directional.position.set(50, 100, 50)
    directional.castShadow = this.performanceProfile?.shadowEnabled !== false
    const shadowMapSize = this.performanceProfile?.shadowMapSize || 512
    directional.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    // 阴影正交相机范围收紧，只覆盖股道+车厢+站台区域，shadow map 像素利用率提高
    directional.shadow.camera.left = -80
    directional.shadow.camera.right = 80
    directional.shadow.camera.top = 80
    directional.shadow.camera.bottom = -80
    directional.shadow.camera.near = 20
    directional.shadow.camera.far = 220
    directional.shadow.bias = -0.0005
    directional.shadow.normalBias = 0.02
    this.scene.add(directional)

    const point = new THREE.PointLight('#ffffff', 0.5)
    point.position.set(-10, 20, -10)
    this.scene.add(point)
  }

  _setupGround() {
    // 地面（水泥/沥青色，Lambert 材质替代 Standard，降低 GPU 着色器开销）
    const floorGeo = new THREE.PlaneGeometry(1000, 1000)
    const floorMat = new THREE.MeshLambertMaterial({ color: '#bdc3c7' })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -0.05, 80)
    floor.receiveShadow = false
    floor.matrixAutoUpdate = false
    floor.updateMatrix()
    this.scene.add(floor)

    // 网格线
    const gridHelper = new THREE.GridHelper(600, 300, '#9A9A96', '#7e7e7b')
    gridHelper.position.set(0, -0.01, 80)
    gridHelper.material.opacity = 0.15
    gridHelper.material.transparent = true
    gridHelper.matrixAutoUpdate = false
    gridHelper.updateMatrix()
    this.scene.add(gridHelper)

    // 大间距网格线
    const gridHelper2 = new THREE.GridHelper(600, 60, '#a8a49c', '#2e2d2c')
    gridHelper2.position.set(0, 0.0, 80)
    gridHelper2.material.opacity = 0.1
    gridHelper2.material.transparent = true
    gridHelper2.matrixAutoUpdate = false
    gridHelper2.updateMatrix()
    this.scene.add(gridHelper2)
  }

  _buildTracks(carriages) {
    const mainTracks = this._trackConfig?.mainTracks || []
    const trackTrainInfo = this._trackConfig?.trackTrainInfo || {}
    const trackCount = mainTracks.length > 0 ? mainTracks.length : TRACK_COUNT
    // 记录实际主轨道数量，供存车道和建筑物计算位置
    this._mainTrackCount = trackCount

    for (let trackId = 0; trackId < trackCount; trackId++) {
      const positionX = (trackId - TRACK_OFFSET) * TRACK_SPACING
      const trackCarriages = carriages.filter(c => c.trackId === trackId)

      // 从后台配置获取股道名称和列车类型
      const cfg = mainTracks[trackId]
      const trackName = cfg ? cfg.name : undefined
      const trainNo = trackTrainInfo[trackId]?.trainNo || trackName
      const trainType = cfg ? (cfg.trainType || TRAIN_TYPE_EMU) : (TRACK_TRAIN_TYPE[trackId] || 'conventional')

      const result = createTrack(trackId, positionX, trackCarriages, trainType, trackName, trainNo, cfg, () => this.markDirty())
      this.trackData[trackId] = result
      this.scene.add(result.trackGroup)

      // 建立全局车厢ID索引
      Object.entries(result.carriageGroups).forEach(([id, group]) => {
        this.allCarriageGroups[id] = group
      })
    }

    // 构建可交互对象缓存（仅收集车厢和控制按钮的mesh用于raycast）
    this._buildInteractiveCache()
  }

  _buildSidingTracks(nCarriages) {
    const sidingTracks = this._trackConfig?.sidingTracks || []
    const nTrackInfo = this._trackConfig?.nTrackInfo || {}
    const sidingCount = sidingTracks.length > 0 ? sidingTracks.length : N_TRACK_COUNT
    // 根据实际主轨道数量计算存车道起始X坐标
    const nTrackStartX = calcNTrackStartX(this._mainTrackCount || TRACK_COUNT)
    this._sidingTrackCount = sidingCount
    this._nTrackStartX = nTrackStartX

    for (let nIdx = 0; nIdx < sidingCount; nIdx++) {
      const cfg = sidingTracks[nIdx]
      const nId = cfg ? cfg.id : `n${nIdx + 1}`
      const positionX = nTrackStartX + nIdx * N_TRACK_SPACING
      const trackCars = nCarriages.filter(c => c.trackId === nId)
      const trackName = cfg ? cfg.name : undefined
      const trainNo = nTrackInfo[nId]?.trainNo || trackName

      const result = createSidingTrack(nId, nIdx + 1, positionX, trackCars, trackName, trainNo, cfg, () => this.markDirty())
      this.trackData[nId] = result
      this.scene.add(result.trackGroup)

      Object.entries(result.carriageGroups).forEach(([id, group]) => {
        this.allCarriageGroups[id] = group
      })
    }

    // 重建交互缓存（包含新增的n道车厢）
    this._buildInteractiveCache()
  }

  _buildBuildings() {
    // 1道 X坐标
    const track1X = (0 - TRACK_OFFSET) * TRACK_SPACING
    // 最后一条存车道 X坐标（动态计算）
    const nStartX = this._nTrackStartX || N_TRACK_START_X
    const nCount = this._sidingTrackCount || N_TRACK_COUNT
    const nLastX = nStartX + (nCount - 1) * N_TRACK_SPACING
    this._buildings = createAllBuildings(this.scene, track1X, nLastX)

    // 收集建筑物mesh到交互缓存
    this._buildingMeshes = []
    this._buildings.forEach(b => {
      b.traverse(child => {
        if (child.isMesh) this._buildingMeshes.push(child)
      })
    })
    this._interactiveObjects.push(...this._buildingMeshes)
    this._needsRender = true
  }

  _buildInteractiveCache() {
    this._interactiveObjects = []
    // 收集所有车厢Group下的mesh
    Object.values(this.allCarriageGroups).forEach(group => {
      group.traverse(child => {
        if (child.isMesh) this._interactiveObjects.push(child)
      })
    })
    // 收集所有控制台按钮
    Object.values(this.trackData).forEach(data => {
      if (data.controlStand) {
        data.controlStand.traverse(child => {
          if (child.isMesh) this._interactiveObjects.push(child)
        })
      }
      // 收集作业状态标记（Sprite，可点击弹出作业看板）
      if (Array.isArray(data.workMarkers)) {
        data.workMarkers.forEach(marker => this._interactiveObjects.push(marker))
      }
    })
  }

  _bindEvents() {
    const canvas = this.renderer.domElement

    // pointermove 时间节流：根据性能档位决定最小间隔（low=90ms / medium=50ms / high=16ms）
    // 老电脑鼠标移动时会降低 raycast 频率，避免卡顿
    this._boundPointerMove = (e) => {
      const now = performance.now()
      const interval = this.performanceProfile?.pointerMoveInterval || 50
      if (now - this._lastPointerMoveTime < interval) return
      this._lastPointerMoveTime = now
      this._onPointerMove(e)
    }
    this._boundClick = (e) => this._onClick(e)
    canvas.addEventListener('pointermove', this._boundPointerMove)
    canvas.addEventListener('click', this._boundClick)
    this._boundResize = () => this._onResize()
    window.addEventListener('resize', this._boundResize)

    // 页面可见性：tab 切走/最小化时暂停，回来时恢复
    // 防止后台积压动画回调、也避免老电脑不可见时 GPU 仍跑渲染
    this._boundVisibilityChange = () => this._onVisibilityChange()
    document.addEventListener('visibilitychange', this._boundVisibilityChange)

    // WebGL 上下文丢失/恢复：老 GPU（如老 Intel 集显 + 老 Chrome）长时间运行可能丢失上下文，默认会黑屏
    this._boundContextLost = (e) => {
      e.preventDefault()
      this._isPaused = true
      console.warn('[SceneManager] WebGL 上下文丢失，等待恢复中...')
    }
    this._boundContextRestored = () => {
      console.info('[SceneManager] WebGL 上下文已恢复，重新刷阴影贴图')
      this._isPaused = false
      // 上下文恢复后需重建阴影贴图，并强制重渲
      if (this.renderer) this.renderer.shadowMap.needsUpdate = true
      this._needsRender = true
    }
    canvas.addEventListener('webglcontextlost', this._boundContextLost, false)
    canvas.addEventListener('webglcontextrestored', this._boundContextRestored, false)
  }

  /**
   * 页面可见性变更处理
   * - 隐藏时：暂停 GSAP ticker（后台不计算动画）、跳过渲染
   * - 显示时：重启 GSAP、强制重渲一帧以避免上下文黑屏
   */
  _onVisibilityChange() {
    if (document.hidden) {
      this._isPaused = true
      gsap.ticker.sleep()
    } else {
      this._isPaused = false
      gsap.ticker.wake()
      this._lastRenderTime = 0  // 重置帧间隔计时，接下来一帧立即渲染
      this._needsRender = true
    }
  }

  _updateMouse(e) {
    if (!this.renderer) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  /**
   * 从 Mesh 向上查找带 userData.type 的 Group
   */
  _findInteractiveParent(object) {
    let current = object
    while (current) {
      if (current.userData && current.userData.type === 'carriage') return current
      if (current.userData && current.userData.type === 'controlButton') return current
      if (current.userData && current.userData.type === 'building') return current
      if (current.userData && current.userData.type === 'workInfo') return current
      if (current.userData && current.userData.type === 'workSign') return current
      current = current.parent
    }
    return null
  }

  _onPointerMove(e) {
    if (!this.renderer) return
    this._updateMouse(e)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const intersects = this.raycaster.intersectObjects(this._interactiveObjects, false)

    // 恢复之前悬停的对象
    if (this.hoveredObject) {
      if (this.hoveredObject.userData.type === 'controlButton') {
        updateButtonHover(this.hoveredObject, false)
      }
      this.hoveredObject = null
      document.body.style.cursor = 'auto'
    }

    if (intersects.length > 0) {
      const target = this._findInteractiveParent(intersects[0].object)
      if (target) {
        this.hoveredObject = target
        document.body.style.cursor = 'pointer'
        this._needsRender = true

        if (target.userData.type === 'controlButton') {
          updateButtonHover(target, true)
        }
        // 建筑物悬停也显示指针
      }
    }
  }

  _onClick(e) {
    if (!this.renderer) return
    this._updateMouse(e)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const intersects = this.raycaster.intersectObjects(this._interactiveObjects, false)

    if (intersects.length > 0) {
      const target = this._findInteractiveParent(intersects[0].object)
      if (target) {
        if (target.userData.type === 'carriage') {
          // 优先触发整列火车选中回调
          if (this.onTrainClick) {
            this.onTrainClick(target.userData.carriageId)
            return
          }
          if (this.onCarriageClick) {
            this.onCarriageClick(target.userData.carriageId)
            return
          }
        }
        if (target.userData.type === 'controlButton' && this.onControlClick) {
          this.onControlClick(target.userData.trackId, target.userData.action)
          return
        }
        if (target.userData.type === 'building') {
          // 不切换视角
          return
        }
        if (target.userData.type === 'workInfo') {
          // 点击旧版作业标记：派发事件，由 WorkInfoPanel 弹出作业看板
          window.dispatchEvent(new CustomEvent('show-work-info', {
            detail: {
              trackId: target.userData.trackId,
              slot: target.userData.slot,
              work: target.userData.work,
            },
          }))
          return
        }
        if (target.userData.type === 'workSign') {
          // 点击新型作业标牌（有车组时显示）：派发事件，由 WorkDetailDialog 弹窗显示详细信息
          window.dispatchEvent(new CustomEvent('show-work-sign-detail', {
            detail: {
              trackId: target.userData.trackId,
              slot: target.userData.slot,
              work: target.userData.work,
              hasWork: target.userData.hasWork,
              workType: target.userData.workType, // 'group' | 'top'：点击的是班组牌还是登顶牌
            },
          }))
          return
        }
      }
    }

    // 点击空白
    if (this.onCarriageMiss) {
      this.onCarriageMiss()
    }
  }

  _onResize() {
    if (!this.container) return
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    // 同步 FXAA composer 的 RenderTarget 尺寸 + 着色器分辨率 uniform
    if (this._fxaa) this._fxaa.updateSize(width, height)
    this._needsRender = true
  }

  /**
   * 标记场景需要重新渲染（且阴影贴图需重新计算）
   * 适用于：车厢进出库、GLB 模型异步加载完成、场景重建等几何变化
   */
  markDirty() {
    this._needsRender = true
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true
  }

  /**
   * 运行时切换某条股道某列位的接触网供电状态（实时变色，不重建场景）
   * @param {number|string} trackId - 前端轨道ID（主轨道用数字索引，存车道用 'n1' 等）
   * @param {string} slotKey - 'slot1' | 'slot2'
   * @param {string|null} state - 'powered'|'unpowered'|'grounded'|'fault' 或 null（隐藏该列位接触网和标牌）
   */
  setCatenaryPower(trackId, slotKey, state) {
    const data = this.trackData[trackId]
    if (!data) return
    let changed = false
    // 1. 接触网导线/光晕/电流流动随状态变色（null → 隐藏整段）
    if (data.catenary && typeof data.catenary.setSlotPower === 'function') {
      data.catenary.setSlotPower(slotKey, state)
      changed = true
    }
    // 2. 股道一位/二位 标牌：null → 隐藏，非 null → 显示并更新文字与底色
    if (data.powerLabels && data.powerLabels[slotKey]) {
      const label = data.powerLabels[slotKey]
      if (state == null) {
        // 无接触网 → 隐藏标牌
        if (label.sprite) label.sprite.visible = false
      } else {
        if (label.sprite) label.sprite.visible = true
        if (typeof label.setState === 'function') label.setState(state)
      }
      changed = true
    }
    if (changed) this.markDirty()
  }

  _animate(time = 0) {
    this.animationId = requestAnimationFrame((nextTime) => this._animate(nextTime))

    // 页面不可见 / WebGL 上下文丢失 期间跳过渲染，节省 GPU 占用
    if (this._isPaused) return

    // 帧率锁定：低档位 24fps、中档 30fps、高档 60fps
    if (time - this._lastRenderTime < this._frameInterval) return

    // 接触网电流流动：有任何 powered 段时驱动纹理偏移并标记 dirty
    if (tickCatenaryFlows(time)) {
      this._needsRender = true
    }

    // 按需渲染：仅在场景变化或动画进行时渲染
    if (this._needsRender || this.cameraAnimating) {
      this._lastRenderTime = time
      this.controls.update()
      // FXAA 启用时走 composer（一次 RenderPass + 一次 FXAA ShaderPass）
      // 否则直接渲染，省掉一次纹理拷贝
      if (this._fxaa) {
        this._fxaa.composer.render()
      } else {
        this.renderer.render(this.scene, this.camera)
      }
      this._needsRender = false
    }
  }

  /**
   * 更新列车位置（响应 store 变化）
   * @param {Object} positions - { trackId: zOffset }
   */
  updateTrainPositions(positions) {
    Object.entries(positions).forEach(([trackId, zPos]) => {
      const data = this.trackData[trackId]
      if (data && data.trainGroup) {
        gsap.to(data.trainGroup.position, {
          z: zPos,
          duration: 0.5,
          ease: 'power2.out',
          onUpdate: () => this.markDirty(),
        })
      }
    })
  }

  /**
   * 更新列车可见性（出库后隐藏）
   * @param {Object} states - { trackId: 'parked'|'departing'|'out'|'entering' }
   */
  updateTrainVisibility(states) {
    Object.entries(states).forEach(([trackId, state]) => {
      const data = this.trackData[trackId]
      if (data && data.trainGroup) {
        data.trainGroup.visible = (state !== 'out')
      }
    })
    this._needsRender = true
  }

  /**
   * 出库动画：列车自动驶出直到消失
   * @param {number} trackId
   * @param {Function} onComplete - 动画完成回调
   */
  animateTrainDepart(trackId, onComplete) {
    const data = this.trackData[trackId]
    if (!data || !data.trainGroup) return

    data.trainGroup.visible = true
    this._needsRender = true

    gsap.to(data.trainGroup.position, {
      z: TRAIN_ENTER_START,
      duration: TRAIN_ENTER_DURATION,
      ease: 'power2.in',
      onUpdate: () => this.markDirty(),
      onComplete: () => {
        data.trainGroup.visible = false
        this.markDirty()
        if (onComplete) onComplete()
      },
    })
  }

  /**
   * 进库动画：列车从远方驶入停放
   * @param {number} trackId
   * @param {Function} onComplete - 动画完成回调
   */
  animateTrainEnter(trackId, onComplete) {
    const data = this.trackData[trackId]
    if (!data || !data.trainGroup) return

    // 先将列车放到远方起始位置
    data.trainGroup.position.z = TRAIN_ENTER_START
    data.trainGroup.visible = true
    this._needsRender = true

    gsap.to(data.trainGroup.position, {
      z: TRAIN_POSITION_MIN,
      duration: TRAIN_ENTER_DURATION,
      ease: 'power2.out',
      onUpdate: () => this.markDirty(),
      onComplete: () => {
        this.markDirty()
        if (onComplete) onComplete()
      },
    })
  }

  /**
   * 取出某条股道、某个列位的 slotGroup
   * @param {number|string} trackId
   * @param {'pos1'|'pos2'} slotKey
   * @returns {THREE.Group|null}
   */
  _getSlotGroup(trackId, slotKey) {
    const data = this.trackData[trackId]
    if (!data) return null
    if (slotKey === 'pos1') return data.slotGroupPos1 || null
    if (slotKey === 'pos2') return data.slotGroupPos2 || null
    return null
  }

  /**
   * 列位级出库动画：单独让某列位的车组朝远端方向开出
   *
   * 重要：slotGroup 是 trainGroup 的子节点，slotGroup.position 是相对 trainGroup 的偏移。
   * trainGroup.position.z 在停放时是 TRAIN_POSITION_MIN（-30），所以列位级动画的目标位置
   * 必须是"从相对 0 出发，朝相对 +DELTA 方向移动"，DELTA 与整列动画时 trainGroup 移动的 Δz 一致。
   *
   * @param {number|string} trackId
   * @param {'pos1'|'pos2'} slotKey
   * @param {Function} onComplete
   */
  animateSlotDepart(trackId, slotKey, onComplete) {
    const slotGroup = this._getSlotGroup(trackId, slotKey)
    if (!slotGroup) {
      if (onComplete) onComplete()
      return
    }
    // 整列动画的位移量：从 TRAIN_POSITION_MIN 走到 TRAIN_ENTER_START
    const DELTA = TRAIN_ENTER_START - TRAIN_POSITION_MIN
    slotGroup.visible = true
    this._needsRender = true

    gsap.to(slotGroup.position, {
      z: DELTA,
      duration: TRAIN_ENTER_DURATION,
      ease: 'power2.in',
      onUpdate: () => this.markDirty(),
      onComplete: () => {
        slotGroup.visible = false
        this.markDirty()
        if (onComplete) onComplete()
      },
    })
  }

  /**
   * 列位级进库动画：单独让某列位的车组从远端驶入停放位
   * @param {number|string} trackId
   * @param {'pos1'|'pos2'} slotKey
   * @param {Function} onComplete
   */
  animateSlotEnter(trackId, slotKey, onComplete) {
    const slotGroup = this._getSlotGroup(trackId, slotKey)
    if (!slotGroup) {
      if (onComplete) onComplete()
      return
    }
    const DELTA = TRAIN_ENTER_START - TRAIN_POSITION_MIN
    // 先把 slotGroup 放到远端起点
    slotGroup.position.z = DELTA
    slotGroup.visible = true
    this._needsRender = true

    gsap.to(slotGroup.position, {
      z: 0,
      duration: TRAIN_ENTER_DURATION,
      ease: 'power2.out',
      onUpdate: () => this.markDirty(),
      onComplete: () => {
        this.markDirty()
        if (onComplete) onComplete()
      },
    })
  }

  /**
   * 把某列位的 slotGroup 立即放到远端起点（用于 enter 动画前的瞬时定位）
   * @param {number|string} trackId
   * @param {'pos1'|'pos2'} slotKey
   */
  parkSlotAtRemote(trackId, slotKey) {
    const slotGroup = this._getSlotGroup(trackId, slotKey)
    if (!slotGroup) return
    slotGroup.position.z = TRAIN_ENTER_START - TRAIN_POSITION_MIN
    slotGroup.visible = true
    this.markDirty()
  }

  /**
   * 立即把某列位 slotGroup 隐藏（用于 depart 完成后立即"消失"）
   * @param {number|string} trackId
   * @param {'pos1'|'pos2'} slotKey
   */
  hideSlot(trackId, slotKey) {
    const slotGroup = this._getSlotGroup(trackId, slotKey)
    if (!slotGroup) return
    slotGroup.visible = false
    this.markDirty()
  }

  /**
   * 增量重建单条股道的 3D 模型（不影响其他股道和建筑）
   * 用于动画编排器获取最新数据后，仅刷新受影响的股道，避免整体 rebuild 闪烁。
   *
   * @param {number|string} trackId
   * @param {Array} carriagesData - 该股道的车厢数组（已由 store 按最新配置生成）
   * @param {Object} cfg - 该股道的 trackConfig 对象（含 name, trainType, linked, pos1Groups 等）
   * @param {boolean} isMain - 是否主轨道（决定调用 createTrack 还是 createSidingTrack）
   * @param {Object} [extra] - 额外参数 { positionX, sidingIndex, trainNo }
   */
  rebuildSingleTrack(trackId, carriagesData, cfg, isMain, extra = {}) {
    const oldData = this.trackData[trackId]
    if (!oldData) return

    // 1. 记住旧 trackGroup 的世界位置
    const positionX = extra.positionX ?? oldData.trackGroup.position.x

    // 2. 从场景中移除旧 trackGroup
    this.scene.remove(oldData.trackGroup)

    // 3. 从全局车厢索引中移除旧条目
    if (oldData.carriageGroups) {
      Object.keys(oldData.carriageGroups).forEach(id => {
        delete this.allCarriageGroups[id]
      })
    }

    // 4. 用最新数据重新创建该股道
    const trackName = cfg?.name
    const trainNo = extra.trainNo || trackName
    const trainType = cfg?.trainType || TRAIN_TYPE_EMU
    let result
    if (isMain) {
      result = createTrack(trackId, positionX, carriagesData, trainType, trackName, trainNo, cfg, () => this.markDirty())
    } else {
      const sidingIndex = extra.sidingIndex ?? 1
      result = createSidingTrack(trackId, sidingIndex, positionX, carriagesData, trackName, trainNo, cfg, () => this.markDirty())
    }

    // 5. 确保 trainGroup 停放位置正确（主轨道的 createTrack 不设 trainGroup.position.z，
    //    依赖外部 updateTrainPositions；增量重建后必须立即补上，否则车组会偏移）
    if (result.trainGroup) {
      result.trainGroup.position.z = TRAIN_POSITION_MIN
    }

    // 6. 加入场景、更新索引
    this.trackData[trackId] = result
    this.scene.add(result.trackGroup)
    Object.entries(result.carriageGroups).forEach(([id, group]) => {
      this.allCarriageGroups[id] = group
    })

    // 7. 重建可交互对象缓存
    this._buildInteractiveCache()
    this.markDirty()
  }

  /**
   * 更新站台状态标签（车次+状态）
   * @param {Object} counts - { trackId: count }
   * @param {Object} states - { trackId: 'parked'|'departing'|'out'|'entering' }
   */
  updateDepartLabels(counts, states) {
    Object.keys(this.trackData).forEach(trackId => {
      const data = this.trackData[trackId]
      if (!data || !data.departLabel) return

      const tid = Number(trackId)
      const state = states[trackId] || 'parked'
      const count = counts[trackId] || 0
      let status = '停放中'

      if (state === 'departing') {
        status = `第 ${count} 组 出库中...`
      } else if (state === 'out') {
        status = `第 ${count} 组 已出库`
      } else if (state === 'entering') {
        status = `第 ${count + 1} 组 进库中...`
      } else if (count > 0) {
        status = `第 ${count + 1} 组 停放中`
      }

      if (typeof data.departLabel.userData?.setText === 'function') {
        data.departLabel.userData.setText(status)
      } else {
        data.departLabel.text = status
        data.departLabel.sync()
      }
    })
    this._needsRender = true
  }

  /**
   * 更新车厢可见性（响应筛选变化）
   * @param {string} filterType - 筛选类型
   * @param {Object[]} carriages - 所有车厢数据
   */
  updateFilter(filterType, carriages) {
    carriages.forEach(c => {
      const group = this.allCarriageGroups[c.id]
      if (group) {
        group.visible = (filterType === 'all' || c.type === filterType)
      }
    })
    this._needsRender = true
  }

  /**
   * 更新选中/搜索状态的视觉效果
   * @param {string|null} selectedId - 单节选中车厢ID
   * @param {string|null} searchedId - 单节搜索命中车厢ID
   * @param {string[]} searchedIds - 多节搜索命中车厢ID列表（车组/车次搜索）
   */
  updateSelection(selectedId, searchedId, searchedIds = []) {
    const searchedSet = searchedIds.length > 0 ? new Set(searchedIds) : null
    Object.entries(this.allCarriageGroups).forEach(([id, group]) => {
      const isSearched = id === searchedId || (searchedSet !== null && searchedSet.has(id))
      updateCarriageVisual(group, id === selectedId, isSearched)
    })
    this._needsRender = true
  }

  /**
   * 高亮整列火车（黄色）
   * @param {string|number|null} trackId - 轨道ID，null则清除高亮
   * @param {string[]} carriageIds - 该轨道上所有车厢ID
   */
  highlightTrain(trackId, carriageIds) {
    // 先恢复之前高亮的材质
    this._restoreHighlightedTrain()

    if (trackId === null || !carriageIds || carriageIds.length === 0) {
      this._highlightedTrackId = null
      this._needsRender = true
      return
    }

    this._highlightedTrackId = trackId
    this._highlightedMaterials = []

    carriageIds.forEach(cid => {
      const group = this.allCarriageGroups[cid]
      if (!group) return
      const { bodyMesh, roofMesh, roofCurveMesh, stripeMesh, thinStripeMesh } = group.userData
      const isFullGLB = group.userData._isFullGLBCar === true
      const headMeshes = group.userData._headMeshes || []

      // 标记当前高亮色，供 GLB 异步挂载完成后补上色
      group.userData._activeHighlightColor = '#b8860b'

      if (isFullGLB) {
        // ---- 整车 GLB 模式（头车/尾车）：只通过 headMeshes 高亮 ----
        const headMeshBackup = headMeshes.map(({ mesh, origMat }) => ({ mesh, origMat }))
        this._highlightedMaterials.push({
          bodyMesh: null, roofMesh: null, roofCurveMesh: null, stripeMesh: null, thinStripeMesh: null,
          origBody: null, origRoof: null, origRoofCurve: null, origStripe: null, origThinStripe: null,
          headMeshBackup,
          isFullGLB: true,
        })

        headMeshes.forEach(({ mesh, origMat }) => {
          mesh.material = origMat.clone()
          mesh.material.color.set('#b8860b')
          if (mesh.material.emissive) {
            mesh.material.emissive.set('#fbbf24')
            mesh.material.emissiveIntensity = 0.3
          }
        })
        return
      }

      // ---- BoxGeometry 模式（中间车 / 普速车）----
      if (!bodyMesh) return

      // 保存原始材质引用（含车头 mesh）
      const headMeshBackup = headMeshes.map(({ mesh, origMat }) => ({ mesh, origMat }))
      this._highlightedMaterials.push({
        bodyMesh, roofMesh, roofCurveMesh, stripeMesh, thinStripeMesh,
        origBody: bodyMesh.material,
        origRoof: roofMesh.material,
        origRoofCurve: roofCurveMesh.material,
        origStripe: stripeMesh.material,
        origThinStripe: thinStripeMesh ? thinStripeMesh.material : null,
        headMeshBackup,
      })

      // clone并设置黄色
      bodyMesh.material = bodyMesh.material.clone()
      bodyMesh.material.color.set('#b8860b')
      bodyMesh.material.emissive = new THREE.Color('#fbbf24')
      bodyMesh.material.emissiveIntensity = 0.3

      roofMesh.material = roofMesh.material.clone()
      roofMesh.material.color.set('#d4a017')

      roofCurveMesh.material = roofCurveMesh.material.clone()
      roofCurveMesh.material.color.set('#d4a017')

      stripeMesh.material = stripeMesh.material.clone()
      stripeMesh.material.color.set('#ffffff')

      if (thinStripeMesh) {
        thinStripeMesh.material = thinStripeMesh.material.clone()
        thinStripeMesh.material.color.set('#ffffff')
      }

      // 车头 GLB mesh 跟随高亮
      headMeshes.forEach(({ mesh, origMat }) => {
        mesh.material = origMat.clone()
        mesh.material.color.set('#b8860b')
        if (mesh.material.emissive) {
          mesh.material.emissive.set('#fbbf24')
          mesh.material.emissiveIntensity = 0.3
        }
      })
    })

    this._needsRender = true
  }

  /**
   * 恢复之前高亮的火车材质
   */
  _restoreHighlightedTrain() {
    this._highlightedMaterials.forEach(({ bodyMesh, roofMesh, roofCurveMesh, stripeMesh, thinStripeMesh, origBody, origRoof, origRoofCurve, origStripe, origThinStripe, headMeshBackup, isFullGLB }) => {
      // BoxGeometry 部件恢复（整车 GLB 模式下这些为 null，跳过）
      if (bodyMesh && origBody) {
        if (bodyMesh.material !== origBody) bodyMesh.material.dispose()
        bodyMesh.material = origBody
      }
      if (roofMesh && origRoof) {
        if (roofMesh.material !== origRoof) roofMesh.material.dispose()
        roofMesh.material = origRoof
      }
      if (roofCurveMesh && origRoofCurve) {
        if (roofCurveMesh.material !== origRoofCurve) roofCurveMesh.material.dispose()
        roofCurveMesh.material = origRoofCurve
      }
      if (stripeMesh && origStripe) {
        if (stripeMesh.material !== origStripe) stripeMesh.material.dispose()
        stripeMesh.material = origStripe
      }
      if (thinStripeMesh && origThinStripe) {
        if (thinStripeMesh.material !== origThinStripe) thinStripeMesh.material.dispose()
        thinStripeMesh.material = origThinStripe
      }
      // 恢复车头 GLB mesh
      if (headMeshBackup) {
        headMeshBackup.forEach(({ mesh, origMat }) => {
          if (mesh.material !== origMat) mesh.material.dispose()
          mesh.material = origMat
        })
      }
    })
    this._highlightedMaterials = []

    // 清除所有车厢的高亮标记
    Object.values(this.allCarriageGroups).forEach(group => {
      if (group.userData._activeHighlightColor) {
        delete group.userData._activeHighlightColor
      }
    })
  }

  /**
   * 飞行到整列火车（视角移到列车中间位置）
   * @param {string|number} trackId - 轨道ID
   * @param {Object} positions - 列车位置
   * @param {number} carriageCount - 车厢数量
   */
  flyToTrain(trackId, positions, carriageCount) {
    let trackX, trainZ
    if (typeof trackId === 'string' && trackId.startsWith('n')) {
      const nIdx = parseInt(trackId.slice(1)) - 1
      const nStartX = this._nTrackStartX || N_TRACK_START_X
      trackX = nStartX + nIdx * N_TRACK_SPACING
      trainZ = -30
    } else {
      trackX = (trackId - TRACK_OFFSET) * TRACK_SPACING
      trainZ = positions[trackId] || 0
    }
    // 视角对准列车中间位置
    const midIndex = Math.floor((carriageCount || 9) / 2)
    const carriageZ = trainZ + midIndex * CARRIAGE_SPACING

    const targetPos = new THREE.Vector3(trackX, CARRIAGE_Y + 2, carriageZ)
    const cameraPos = new THREE.Vector3(
      trackX + 25,
      18,
      carriageZ + 15
    )

    this.cameraAnimating = true
    gsap.to(this.camera.position, {
      x: cameraPos.x,
      y: cameraPos.y,
      z: cameraPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => { this._needsRender = true },
      onComplete: () => { this.cameraAnimating = false },
    })
    gsap.to(this.controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
    })
  }

  /**
   * 飞行到指定车厢
   * @param {Object} carriage - 车厢数据
   * @param {Object} positions - 列车位置
   */
  flyToCarriage(carriage, positions) {
    if (!carriage) return
    let trackX, trainZ
    if (typeof carriage.trackId === 'string' && carriage.trackId.startsWith('n')) {
      // n道停放线路
      const nIdx = parseInt(carriage.trackId.slice(1)) - 1
      const nStartX = this._nTrackStartX || N_TRACK_START_X
      trackX = nStartX + nIdx * N_TRACK_SPACING
      trainZ = -30
    } else {
      trackX = (carriage.trackId - TRACK_OFFSET) * TRACK_SPACING
      trainZ = positions[carriage.trackId] || 0
    }
    const carriageZ = trainZ + carriage.index * CARRIAGE_SPACING

    const targetPos = new THREE.Vector3(trackX, CARRIAGE_Y, carriageZ)
    const cameraPos = new THREE.Vector3(
      trackX + FLY_CAMERA_OFFSET[0],
      FLY_CAMERA_OFFSET[1],
      carriageZ + FLY_CAMERA_OFFSET[2]
    )

    this.cameraAnimating = true
    gsap.to(this.camera.position, {
      x: cameraPos.x,
      y: cameraPos.y,
      z: cameraPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => { this._needsRender = true },
      onComplete: () => { this.cameraAnimating = false },
    })
    gsap.to(this.controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
    })
  }

  /**
   * 飞行到一组车厢（取车组中心位置，相机距离随车组长度自适应）
   * 用于搜索车次/车型/车组号时精确定位到匹配车组，而非第一节
   * @param {Object[]} carriageList - 匹配的车厢数据数组
   * @param {Object} positions - 列车位置
   */
  flyToCarriages(carriageList, positions) {
    if (!carriageList || carriageList.length === 0) return
    if (carriageList.length === 1) {
      this.flyToCarriage(carriageList[0], positions)
      return
    }

    // 以首节车厢所在股道作为参照（同一组车一定在同一股道）
    const firstCar = carriageList[0]
    let trackX, trainZ
    if (typeof firstCar.trackId === 'string' && firstCar.trackId.startsWith('n')) {
      const nIdx = parseInt(firstCar.trackId.slice(1)) - 1
      const nStartX = this._nTrackStartX || N_TRACK_START_X
      trackX = nStartX + nIdx * N_TRACK_SPACING
      trainZ = -30
    } else {
      trackX = (firstCar.trackId - TRACK_OFFSET) * TRACK_SPACING
      trainZ = positions[firstCar.trackId] || 0
    }

    // 计算该组车的 Z 范围（按 index 最小与最大）
    let minIdx = Infinity
    let maxIdx = -Infinity
    carriageList.forEach(c => {
      if (c.index < minIdx) minIdx = c.index
      if (c.index > maxIdx) maxIdx = c.index
    })
    const centerIdx = (minIdx + maxIdx) / 2
    const carriageZ = trainZ + centerIdx * CARRIAGE_SPACING

    // 相机距离：随车组长度增加，保证整组车在视野中
    const groupLength = (maxIdx - minIdx + 1) * CARRIAGE_SPACING
    const zoomOut = Math.max(1, Math.min(2.2, groupLength / 24))

    const targetPos = new THREE.Vector3(trackX, CARRIAGE_Y, carriageZ)
    const cameraPos = new THREE.Vector3(
      trackX + FLY_CAMERA_OFFSET[0] * zoomOut,
      FLY_CAMERA_OFFSET[1] * zoomOut,
      carriageZ + FLY_CAMERA_OFFSET[2] * zoomOut
    )

    this.cameraAnimating = true
    gsap.to(this.camera.position, {
      x: cameraPos.x,
      y: cameraPos.y,
      z: cameraPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => { this._needsRender = true },
      onComplete: () => { this.cameraAnimating = false },
    })
    gsap.to(this.controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
    })
  }

  /**
   * 飞行到指定建筑物
   * @param {THREE.Group} building - 建筑物Group（带userData.name, userData.height）
   */
  flyToBuilding(building) {
    if (!building) return
    const pos = building.position
    const h = building.userData.height || 10

    // 相机从建筑正面偏前方观察
    const targetPos = new THREE.Vector3(pos.x, h * 0.5, pos.z)
    const cameraPos = new THREE.Vector3(pos.x, h * 0.8 + 5, pos.z - 30)

    this.cameraAnimating = true
    gsap.to(this.camera.position, {
      x: cameraPos.x,
      y: cameraPos.y,
      z: cameraPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => { this._needsRender = true },
      onComplete: () => { this.cameraAnimating = false },
    })
    gsap.to(this.controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
    })
  }

  /**
   * 重置视角
   */
  resetView() {
    const cameraPos = new THREE.Vector3(...CAMERA_DEFAULT_POSITION)
    const targetPos = new THREE.Vector3(...CAMERA_DEFAULT_TARGET)

    this.cameraAnimating = true
    gsap.to(this.camera.position, {
      x: cameraPos.x,
      y: cameraPos.y,
      z: cameraPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => { this._needsRender = true },
      onComplete: () => { this.cameraAnimating = false },
    })
    gsap.to(this.controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
    })
  }

  /**
   * 切换预设视角
   * @param {'default'|'topDown'|'topDownReverse'|'leftEnd'|'rightEnd'|'free'} mode
   */
  switchView(mode) {
    // 自由视角：解除角度限制，不移动相机
    if (mode === 'free') {
      this.controls.minPolarAngle = 0
      this.controls.maxPolarAngle = Math.PI
      this.controls.minDistance = 5
      this.controls.maxDistance = 800
      this._needsRender = true
      return
    }

    // 非自由视角：恢复角度限制
    this.controls.minPolarAngle = 0
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05
    this.controls.minDistance = 10
    this.controls.maxDistance = 500

    // 切换视角时同步地面文字朝向：俯视角2（topDownReverse）下相机的"上方向"反了，
    // 地面贴图文字（X道/二位 等）会显示成倒置，需要绕本地 Z 轴额外翻转 180°
    const flipGroundLabel = (mode === 'topDownReverse')
    if (this.scene) {
      this.scene.traverse((obj) => {
        // 地面文字翻转，避免倒置
        if (obj.userData && obj.userData.isGroundLabel) {
          const base = obj.userData._baseRotationZ != null ? obj.userData._baseRotationZ : (-Math.PI / 2)
          obj.rotation.z = flipGroundLabel ? base + Math.PI : base
        }
        // 重联车号标签反转显示顺序（俯视角2下视觉位置反转，文字顺序同步反转）
        if (obj.userData && obj.userData.isReverseViewLabel && typeof obj.userData.setText === 'function') {
          obj.userData.setText(flipGroundLabel ? obj.userData._reverseText : obj.userData._normalText)
        }
      })
      this._needsRender = true
    }

    let cameraPos, targetPos
    switch (mode) {
      case 'topDown':
        // 俯视角（从侧上方俯视，股道横向排列）
        cameraPos = new THREE.Vector3(10, 200, 85)
        targetPos = new THREE.Vector3(20, 50, 85)
        break
      case 'topDownReverse':
        // 反向俯视（相机与俯视角关于注视点对称，从对侧高位斜下看）
        // 注视点 Y 降到地面（0），让股道在画面中往上抬，避免整体偏下
        cameraPos = new THREE.Vector3(50, 200, 85)
        targetPos = new THREE.Vector3(-20, 0, 85)
        break
      case 'leftEnd':
        // 左端视角（正面看车头，适当缩小）
        cameraPos = new THREE.Vector3(15, 25, -120)
        targetPos = new THREE.Vector3(15, 0, 80)
        break
      case 'rightEnd':
        // 右端视角（图3：从右端看，视角偏上）
        cameraPos = new THREE.Vector3(-20, 35, 320)
        targetPos = new THREE.Vector3(10, 0, 80)
        break
      default:
        // 2.5D 视角（图1：从围墙方向斜俯视看过去）
        cameraPos = new THREE.Vector3(...CAMERA_DEFAULT_POSITION)
        targetPos = new THREE.Vector3(...CAMERA_DEFAULT_TARGET)
        break
    }

    this.cameraAnimating = true
    gsap.to(this.camera.position, {
      x: cameraPos.x,
      y: cameraPos.y,
      z: cameraPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => { this._needsRender = true },
      onComplete: () => { this.cameraAnimating = false },
    })
    gsap.to(this.controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
    })
  }

  /**
   * 从 localStorage 加载相机状态
   */
  _loadCameraState() {
    try {
      const raw = localStorage.getItem('pzh_camera_state')
      if (!raw) return null
      const data = JSON.parse(raw)
      if (data && data.pos && data.target) return data
    } catch { /* 忽略 */ }
    return null
  }

  /**
   * 保存相机状态到 localStorage
   */
  _saveCameraState() {
    if (!this.camera || !this.controls) return
    const p = this.camera.position
    const t = this.controls.target
    const data = {
      pos: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
    }
    try { localStorage.setItem('pzh_camera_state', JSON.stringify(data)) } catch { /* 忽略 */ }
  }

  /**
   * 销毁场景
   * @param {boolean} disposeSharedGeometries - 是否同时释放共享几何体/材质（仅在组件卸载时传 true，重建时传 false）
   */
  dispose(disposeSharedGeometries = false) {
    // 停止 gsap 动画（杀掉所有正在运行的相机动画）
    gsap.killTweensOf(this.camera?.position)
    gsap.killTweensOf(this.controls?.target)

    // 清理相机状态保存定时器
    if (this._saveCameraTimer) {
      clearTimeout(this._saveCameraTimer)
      this._saveCameraTimer = null
    }

    // 保存最终相机状态
    this._saveCameraState()

    // 停止渲染循环
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }

    // 清理渲染延迟定时器
    if (this._renderTimeout) {
      clearTimeout(this._renderTimeout)
      this._renderTimeout = null
    }

    // 移除 canvas 事件监听器
    if (this.renderer?.domElement) {
      const canvas = this.renderer.domElement
      if (this._boundPointerMove) canvas.removeEventListener('pointermove', this._boundPointerMove)
      if (this._boundClick) canvas.removeEventListener('click', this._boundClick)
      if (this._boundContextLost) canvas.removeEventListener('webglcontextlost', this._boundContextLost)
      if (this._boundContextRestored) canvas.removeEventListener('webglcontextrestored', this._boundContextRestored)
    }

    // 移除窗口 resize / visibilitychange 监听器
    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize)
    }
    if (this._boundVisibilityChange) {
      document.removeEventListener('visibilitychange', this._boundVisibilityChange)
    }

    // 遍历场景释放所有 Geometry / Material / Texture（防止 GPU 显存泄漏）
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.isMesh || object.isLine || object.isPoints) {
          if (object.geometry && !object.geometry._shared) {
            object.geometry.dispose()
          }
          if (object.material) {
            // 材质可能是数组
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            materials.forEach((mat) => {
              if (mat._shared) return // 跳过共享材质
              // 释放材质关联的纹理
              if (mat.map) mat.map.dispose()
              if (mat.normalMap) mat.normalMap.dispose()
              if (mat.roughnessMap) mat.roughnessMap.dispose()
              if (mat.metalnessMap) mat.metalnessMap.dispose()
              if (mat.emissiveMap) mat.emissiveMap.dispose()
              mat.dispose()
            })
          }
        }
      })
      // 清空场景
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0])
      }
    }

    // 释放控制器
    if (this.controls) {
      this.controls.dispose()
      this.controls = null
    }

    // 释放 FXAA composer 的 RenderTarget（GPU 显存）
    if (this._fxaa) {
      this._fxaa.dispose()
      this._fxaa = null
    }

    // 释放渲染器
    if (this.renderer) {
      this.renderer.dispose()
      // 从 DOM 中移除 canvas
      if (this.container && this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement)
      }
      this.renderer = null
    }

    // 清理交互对象缓存
    this._interactiveObjects = []
    this.trackData = {}
    this.allCarriageGroups = {}
    this.scene = null
    this.camera = null
  }
}
