/**
 * useThreeScene — Three.js 场景 Vue 组合式函数
 *
 * 职责：
 *   - 将 Three.js SceneManager（3D 渲染核心）与 Vue 响应式系统桥接
 *   - 在组件挂载时从后台拉取股道配置，初始化 3D 场景
 *   - 通过 WebSocket 监听后端数据变更，触发防抖后重新拉取数据并重建场景
 *   - 监听 Pinia trainStore 中的列车状态、出库计数、筛选、选中、搜索等响应式数据，
 *     实时同步到 Three.js SceneManager 执行动画和高亮
 *   - 组件卸载时完整释放 Three.js 资源，防止内存泄漏
 *
 * 使用方：HomeView.vue
 */

// Vue 组合式 API
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
// Pinia storeToRefs：将 store 属性转为响应式 ref，可直接 watch
import { storeToRefs } from 'pinia'
// Three.js 场景管理器（负责所有 3D 对象的创建、更新、销毁）
import { SceneManager } from '../three/SceneManager.js'
// 共享几何体/材质资源的统一释放函数
import { disposeAll } from '../three/SharedGeometries.js'
// 高画质 Phong 材质缓存清理（场景销毁时清空，防止已变色的 Phong 被复用）
import { clearPhongCache } from '../three/MaterialUpgrader.js'
// 列车数据 Pinia Store（含股道配置、车厢信息、列车状态等）
import { useTrainStore } from '../stores/trainStore.js'
// WebSocket 数据变更监听 composable
import { useWebSocket } from './useWebSocket.js'
// 列位级动画编排器
import { useSlotAnimQueue } from './useSlotAnimQueue.js'

export function useThreeScene() {
  const containerRef = ref(null)
  const store = useTrainStore()
  const slotAnimQueue = useSlotAnimQueue()
  const { trainStates, slotStates, departCounts } = storeToRefs(store)
  const { onDataChange, wsConnected } = useWebSocket()
  let manager = null

  // ========== 加载状态（供外部 LoadingScreen 使用） ==========
  const sceneReady = ref(false)     // 3D 场景是否就绪
  const loadingProgress = ref(0)    // 加载进度 0-100
  const loadingStatus = ref('正在初始化系统')  // 加载阶段文字

  // 保存所有 watcher 的 stop 函数，用于重建时清理
  let watcherStops = []

  // dataVersion watcher 独立保存（全生命周期存活，不参与 rebuild 时的清理）
  let dataVersionWatcherStop = null

  // 防抖定时器（提升到外层，便于 onBeforeUnmount 清理）
  let debounceTimer = null
  const DEBOUNCE_DELAY = 1500 // 毫秒
  // 交大机电股道作业数据轮询定时器（班组作业/登顶作业）
  let workRefreshTimer = null
  const WORK_REFRESH_INTERVAL = 30000 // 30 秒轮询一次
  // 列位动画期间抑制普通 stock-road/stock-roadInfo 刷新，避免动画前普通重建造成闪现/消失
  let suppressStockRoadRefreshUntil = 0
  // 准备进库的列位：场景重建后、首帧渲染前立即放到远端，避免新车组先在原位闪一下
  const pendingEnterSlots = new Set()

  const getPendingSlotKey = (trackId, slotKey) => `${trackId}:${slotKey}`

  function applyPendingEnterSlots() {
    if (!manager || pendingEnterSlots.size === 0) return
    pendingEnterSlots.forEach(key => {
      const [trackId, slotKey] = key.split(':')
      manager.parkSlotAtRemote(trackId, slotKey)
    })
  }

  function handlePendingEnterSlots(event) {
    const slots = event?.detail?.slots || []
    slots.forEach(({ trackId, slotKey }) => {
      if (trackId !== undefined && trackId !== null && slotKey) {
        pendingEnterSlots.add(getPendingSlotKey(trackId, slotKey))
      }
    })
    // 从收到动画意图开始，短时间内忽略普通股道刷新，由动画队列接管刷新/重建节奏
    suppressStockRoadRefreshUntil = Date.now() + (event?.detail?.suppressMs || 20000)
    applyPendingEnterSlots()
  }

  /**
   * 增量重建指定股道的 3D 模型（不整体 rebuild）。
   * 由 useSlotAnimQueue 通过 CustomEvent 'pzh-slot-rebuild-tracks' 触发。
   */
  function handleRebuildTracks(event) {
    const trackIds = event?.detail?.trackIds || []
    if (!manager || trackIds.length === 0) return
    const mainTracks = store.mainTrackConfig || []
    const sidingTracks = store.sidingTrackConfig || []
    trackIds.forEach(trackId => {
      const mainCfg = mainTracks.find(t => String(t.id) === String(trackId))
      const sidingCfg = sidingTracks.find(t => String(t.id) === String(trackId))
      const cfg = mainCfg || sidingCfg
      if (!cfg) return
      const isMain = !!mainCfg
      const trackCarriages = isMain
        ? (store.carriages || []).filter(c => c.trackId === cfg.id)
        : (store.nCarriages || []).filter(c => c.trackId === cfg.id)
      // 存车道需要 sidingIndex（用于 displayIndex 参数）
      const sidingIndex = !isMain ? sidingTracks.indexOf(sidingCfg) + 1 : undefined
      const allGroups = [...(cfg.pos2Groups || []), ...(cfg.pos1Groups || [])]
      const trainNo = allGroups.map(g => g.车组号 || '').filter(Boolean).join(' / ') || cfg.name
      manager.rebuildSingleTrack(trackId, trackCarriages, cfg, isMain, { sidingIndex, trainNo })
    })
    // 对 pending enter slots 应用远端定位
    applyPendingEnterSlots()
  }

  /**
   * 停止所有已注册的 watcher，防止场景重建时叠加
   */
  function stopAllWatchers() {
    watcherStops.forEach(stop => { if (typeof stop === 'function') stop() })
    watcherStops = []
  }

  /**
   * 初始化3D场景（在数据加载完成后调用）
   */
  function initScene() {
    if (!containerRef.value) return

    // 构建后台股道配置传递给SceneManager
    const trackConfig = {
      mainTracks: store.mainTrackConfig || [],
      sidingTracks: store.sidingTrackConfig || [],
      trackTrainInfo: store.trackTrainInfo || {},
      nTrackInfo: store.nTrackInfo || {},
    }

    manager = new SceneManager()
    try {
      manager.init(containerRef.value, store.carriages, store.nCarriages, trackConfig)
    } catch (e) {
      console.error('3D场景初始化失败:', e)
      manager = null
      return
    }

    // 初始化列车位置
    manager.updateTrainPositions({ ...store.trainPositions })
    manager.updateDepartLabels({ ...departCounts.value }, { ...trainStates.value })
    // 应用当前视角模式（如果是俯视角2，需要同步反转重联车号标签）
    manager.switchView(store.cameraViewMode || 'default')
    // 必须在 setupCallbacksAndWatchers 前、首帧渲染前执行，避免待进库车组先以 parked 状态闪现
    applyPendingEnterSlots()
    setupCallbacksAndWatchers()
  }

  /**
   * 销毁当前3D场景（保留容器DOM）
   * @param {boolean} fullDestroy - 是否完整销毁（包括共享资源），仅在组件卸载时为 true
   */
  function destroyScene(fullDestroy = false) {
    // 先停止所有 watcher，防止重建时叠加
    stopAllWatchers()
    if (manager) {
      manager.dispose(fullDestroy)
      manager = null
    }
    // 仅在组件彻底卸载时释放共享几何体/材质，重建时不释放（避免渲染崩溃）
    if (fullDestroy) {
      disposeAll()
    }
  }

  /**
   * 重建3D场景（数据变化时调用）
   * 不释放共享几何体/材质，避免重建后渲染崩溃
   */
  function rebuildScene() {
    destroyScene(false)
    initScene()
    console.log('3D场景已根据最新数据重建')
  }

  onMounted(async () => {
    if (!containerRef.value) return

    window.addEventListener('pzh-slot-anim-pending-enter', handlePendingEnterSlots)
    window.addEventListener('pzh-slot-rebuild-tracks', handleRebuildTracks)

    // ★ 防御性清空：组件挂载时清空 store 中可能残留的搜索/选中状态
    // 场景：从 /admin 返回 / 时，Pinia store 是全局单例，旧状态可能残留
    // 虽然根本原因已在 CarriageModel.js 修复（Phong 材质比较 bug），
    // 但清空 store 状态可以确保 3D 场景初始化时不会因为残留的搜索 ID
    // 触发 updateSelection watcher 导致意外高亮
    store.clearSearch()
    store.setSelectedCarriage(null)
    store.setSelectedTrain(null)

    // 加载阶段 1：初始化
    loadingProgress.value = 10
    loadingStatus.value = '正在连接调度数据中心'

    // 先从后台加载股道数据（强制刷新，因为场景卸载期间可能错过了 WS 推送的数据变更）
    try {
      loadingProgress.value = 25
      loadingStatus.value = '正在拉取股道配置'
      await store.loadStockRoadData(true)
      loadingProgress.value = 60
      loadingStatus.value = '股道数据加载完成'
    } catch (e) {
      console.warn('股道数据加载失败，使用默认配置:', e)
    }

    // 加载阶段 2：构建 3D 场景
    loadingProgress.value = 70
    loadingStatus.value = '正在构建3D场景'
    initScene()

    // ★ 显式同步当前 store 状态到 3D 场景高亮
    // initScene 后 setupCallbacksAndWatchers 注册了 watcher，
    // 但 watcher 只在值变化时触发，不会对当前已有值执行回调
    // 所以需要手动调用一次 updateSelection，确保视觉状态与 store 一致
    if (manager) {
      manager.updateSelection(
        store.selectedCarriage?.id ?? null,
        store.searchedCarriageId,
        store.searchedCarriageIds || []
      )
    }

    // 加载阶段 3：完成
    loadingProgress.value = 100
    loadingStatus.value = '场景渲染就绪'
    // 留一点点时间让进度条动画走完，再隐藏 LoadingScreen
    setTimeout(() => { sceneReady.value = true }, 500)

    // 交大机电股道作业数据：首次拉取 + 定时轮询（刷新标牌班组/登顶统计与颜色）
    // refreshWorkData 内部会重新注入配置并递增 dataVersion，触发上面的重建 watcher
    store.refreshWorkData()
    workRefreshTimer = setInterval(() => {
      store.refreshWorkData()
    }, WORK_REFRESH_INTERVAL)

    // 监听 dataVersion 变化（包括重联状态切换、WS数据刷新等）统一重建场景
    // 关键：不放入 watcherStops，避免 rebuildScene → destroyScene → stopAllWatchers 时停掉自己
    let lastRebuiltVersion = store.dataVersion
    dataVersionWatcherStop = watch(
      () => store.dataVersion,
      (newV) => {
        if (newV > lastRebuiltVersion && manager) {
          console.log(`[dataVersion] 版本变更 v${newV}，重建3D场景`)
          lastRebuiltVersion = newV
          rebuildScene()
        }
      }
    )

    // 通过 WebSocket 监听后端数据变更，收到通知后重新拉取数据
    // 只监听与3D场景相关的实体（股道、车组、交路），避免面板数据变更触发不必要的重建
    // loadStockRoadData 内部会递增 dataVersion，上面的 watcher 统一触发重建
    const SCENE_ENTITIES = [
      'stock-road',       // 股道数据
      'stock-roadInfo',   // 股道信息
      'TrainGroupInfo',   // 车组信息
      'train-group',      // 车组
      /*'交路关联',          // 交路关联（影响车组在股道上的分配）
      '交路轮转', */         // 交路轮转（影响车组位置）
    ]

    const sceneDataChangeHandler = (data) => {
      console.log(`[WS·3D] 收到场景数据变更: ${data.entity} / ${data.action}`)
      if ((data.entity === 'stock-road' || data.entity === 'stock-roadInfo') && Date.now() < suppressStockRoadRefreshUntil) {
        console.log('[WS·3D] 列位动画期间忽略普通股道刷新，避免动画前闪烁')
        return
      }
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        console.log('[WS·3D] 防抖结束，重新加载股道数据（强制刷新）...')
        store.loadStockRoadData(true).catch(e => {
          console.warn('[WS·3D] 重新加载股道数据失败:', e)
        })
      }, DEBOUNCE_DELAY)
    }

    SCENE_ENTITIES.forEach(entity => onDataChange(entity, sceneDataChangeHandler))

    // 列位级动画事件：由后台股道编组管理页广播，首页按列位精准播放开进/开出/换车
    onDataChange('stock-road-anim', (data) => {
      console.log(`[WS·3D] 收到列位动画事件: ${data.action} / ${data.id} / ${data.slotKey}`)
      // 如果前面 stock-roadInfo 普通数据变更已安排防抖刷新，这里取消，交给动画队列按“先动画后重建/先重建后动画”处理
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      suppressStockRoadRefreshUntil = Date.now() + 20000
      if (data.action === 'linked') {
        store.loadStockRoadData(true).catch(e => {
          console.warn('[WS·3D] 重联状态同步失败:', e)
        })
        return
      }
      slotAnimQueue.enqueue({
        type: data.action,
        trackId: data.id,
        slotKey: data.slotKey,
        groupId: data.groupId,
      })
    })
  })

  /**
   * 设置回调和watchers（从原onMounted中抽取）
   */
  function setupCallbacksAndWatchers() {
    if (!manager) return

    // 点击车厢 → 选中火车（非重联时只选中当前车组，重联时选中整列）
    manager.onTrainClick = (carriageId) => {
      const carriage = store.carriages.find(c => c.id === carriageId)
        || store.nCarriages.find(c => c.id === carriageId)
      if (!carriage) return

      const trackId = carriage.trackId
      const isLinked = store.trackLinkedState[trackId] !== false

      if (isLinked) {
        // 重联：选中整列
        store.setSelectedTrain(trackId, null)
        const allCars = [...store.carriages, ...store.nCarriages].filter(c => c.trackId === trackId)
        const carriageIds = allCars.map(c => c.id)
        manager.highlightTrain(trackId, carriageIds)
      } else {
        // 非重联：只选中点击车厢所属的车组
        const clickedGroupIndex = carriage._groupIndex
        const allCars = [...store.carriages, ...store.nCarriages].filter(c => c.trackId === trackId)
        const groupCars = allCars.filter(c => c._groupIndex === clickedGroupIndex)
        const carriageIds = groupCars.map(c => c.id)
        store.setSelectedTrain(trackId, clickedGroupIndex)
        manager.highlightTrain(trackId, carriageIds)
      }
    }

    // 点击空白/地板回调 → 有搜索结果时不做任何操作（避免误触），无搜索时清除选中
    manager.onCarriageMiss = () => {
      if (store.searchedCarriageId || store.searchedCarriageIds?.length > 0) {
        // 搜索高亮存在时，点击空白不做任何操作
        return
      }
      store.setSelectedCarriage(null)
      store.setSelectedTrain(null)
      if (manager) {
        manager.highlightTrain(null, [])
      }
    }

    // 控制台按钮点击回调
    manager.onControlClick = (trackId, action) => {
      if (action === 'depart') {
        store.trainDepart(trackId)
      } else if (action === 'enter') {
        store.trainEnter(trackId)
      }
    }

    // 监听列车状态变化（出库动画 / 进库动画 + 更新标签）
    watcherStops.push(watch(
      trainStates,
      (states) => {
        if (!manager) return
        manager.updateTrainVisibility(states)
        manager.updateDepartLabels({ ...departCounts.value }, { ...states })

        Object.entries(states).forEach(([trackId, state]) => {
          const tid = Number(trackId)
          if (state === 'departing') {
            manager.animateTrainDepart(tid, () => {
              store.trainDepartComplete(tid)
            })
          } else if (state === 'entering') {
            manager.animateTrainEnter(tid, () => {
              store.trainEnterComplete(tid)
            })
          }
        })
      },
      { deep: true, immediate: true }
    ))

    // 监听列位级状态变化（单列位出库/进库动画）
    const runningSlotAnimations = new Set()
    watcherStops.push(watch(
      slotStates,
      (states) => {
        if (!manager) return
        Object.entries(states || {}).forEach(([trackId, slots]) => {
          ;['pos1', 'pos2'].forEach(slotKey => {
            const state = slots?.[slotKey]
            const baseKey = `${trackId}:${slotKey}`

            if (state === 'departing') {
              if (runningSlotAnimations.has(baseKey)) return
              runningSlotAnimations.add(baseKey)
              manager.animateSlotDepart(trackId, slotKey, () => {
                runningSlotAnimations.delete(baseKey)
                store.slotDepartComplete(trackId, slotKey)
              })
            } else if (state === 'entering') {
              if (runningSlotAnimations.has(baseKey)) return
              runningSlotAnimations.add(baseKey)
              manager.animateSlotEnter(trackId, slotKey, () => {
                runningSlotAnimations.delete(baseKey)
                pendingEnterSlots.delete(getPendingSlotKey(trackId, slotKey))
                store.slotEnterComplete(trackId, slotKey)
              })
            } else {
              runningSlotAnimations.delete(baseKey)
            }
          })
        })
      },
      { deep: true, immediate: true }
    ))

    // 监听出库计数变化 -> 更新3D标签
    watcherStops.push(watch(
      departCounts,
      (counts) => {
        if (manager) manager.updateDepartLabels({ ...counts }, { ...trainStates.value })
      },
      { deep: true, immediate: true }
    ))

    // 监听筛选变化
    watcherStops.push(watch(
      () => store.filterType,
      (filterType) => {
        if (manager) manager.updateFilter(filterType, store.carriages)
      }
    ))

    // 监听选中/搜索状态变化（蓝色高亮，支持单节+多节车厢）
    // 用 searchedCarriageIds.length 作为触发器，避免数组引用检测问题
    watcherStops.push(watch(
      () => [store.selectedCarriage?.id, store.searchedCarriageId, (store.searchedCarriageIds || []).join('|')],
      () => {
        if (manager) manager.updateSelection(
          store.selectedCarriage?.id ?? null,
          store.searchedCarriageId,
          store.searchedCarriageIds || []
        )
      }
    ))

    // 监听整列选中状态变化（面板关闭时清除黄色高亮）
    watcherStops.push(watch(
      () => store.selectedTrainTrackId,
      (trackId) => {
        if (!manager) return
        if (trackId === null) {
          manager.highlightTrain(null, [])
        }
      }
    ))

    // 监听搜索飞行（单节车厢搜索 + 整列车搜索共用）
    // 注：当匹配到多节车厢（车次/车型/车组号），由下方的 searchedCarriageIds watcher 统一处理视角
    //     避免与 flyToCarriages 冲突，这里只处理「单节车厢精确匹配」的飞行
    // 已根据需求注释掉视角切换，搜索时只变颜色高亮，不再飞行到对应车厢
    // watcherStops.push(watch(
    //   () => store.searchedCarriageId,
    //   (carriageId) => {
    //     if (!carriageId || !manager) return
    //     // 如果是多节匹配（车次/车型/车组），交给 searchedCarriageIds watcher 处理
    //     if (store.searchedCarriageIds && store.searchedCarriageIds.length > 1) return
    //     const carriage = store.carriages.find(c => c.id === carriageId)
    //       || store.nCarriages.find(c => c.id === carriageId)
    //     if (carriage) {
    //       manager.flyToCarriage(carriage, store.trainPositions)
    //     }
    //   }
    // ))

    // 搜索整列车的高亮已由上方 updateSelection watcher 统一处理（蓝色）
    // 不再使用 highlightTrain（金色），避免颜色冲突
    // watcherStops.push(watch(
    //   () => [store.searchedTrackId, store.searchedCarriageIds],
    //   ([trackId, carriageIds]) => {
    //     if (!manager) return
    //     if (trackId !== null && carriageIds && carriageIds.length > 0) {
    //       manager.highlightTrain(trackId, carriageIds)
    //     } else {
    //       manager.highlightTrain(null, [])
    //     }
    //   }
    // ))

    // 监听重置视角
    watcherStops.push(watch(
      () => store.shouldResetView,
      (val) => {
        if (val && manager) {
          manager.resetView()
          store.setShouldResetView(false)
        }
      }
    ))

    // 监听视角模式切换
    watcherStops.push(watch(
      () => store.cameraViewMode,
      (mode) => {
        if (manager && mode) {
          manager.switchView(mode)
        }
      }
    ))
  }

  /* ========== 接触网供电状态实时同步 ==========
   * 监听管理页派发的 catenary-power-change 事件（由 StockRoadInfoTab 调后端成功后触发），
   * 找到对应前端 trackId 并调用 SceneManager.setCatenaryPower 实时变色/显隐（不重建场景）
   * state: 'powered'|'unpowered'|'grounded'|'fault' | null（无接触网，隐藏电线和标牌）
   */
  const onCatenaryPowerChange = (dbId, slotKey, state) => {
    if (!manager || dbId == null || !slotKey) return
    const mainCfg = store.mainTrackConfig.find(c => c.dbId === dbId)
    const sidingCfg = store.sidingTrackConfig.find(c => c.dbId === dbId)
    const frontendId = mainCfg ? mainCfg.id : (sidingCfg ? sidingCfg.id : null)
    if (frontendId == null) return
    const cfg = mainCfg || sidingCfg
    const oldState = cfg ? (slotKey === 'slot1' ? cfg.slot1Power : cfg.slot2Power) : undefined
    if (cfg) {
      if (slotKey === 'slot1') cfg.slot1Power = state
      else if (slotKey === 'slot2') cfg.slot2Power = state
    }
    manager.setCatenaryPower(frontendId, slotKey, state)
    if (oldState == null || state == null) {
      handleRebuildTracks({ detail: { trackIds: [frontendId] } })
    }
  }
  const onCustomEvent = (e) => {
    const { dbId, slotKey, state } = e.detail || {}
    onCatenaryPowerChange(dbId, slotKey, state)
  }
  window.addEventListener('catenary-power-change', onCustomEvent)

  onBeforeUnmount(() => {
    // 离开大屏（销毁场景）前，清空 store 的搜索和选中状态，避免切后台回来由于 Pinia 残留导致满场蓝色高亮
    store.clearSearch()
    store.setSelectedCarriage(null)
    store.setSelectedTrain(null)

    // 组件卸载时完整销毁（包括共享资源）
    destroyScene(true)
    // ★ 清空 Phong 材质升级缓存
    // 高画质模式下 upgradeSceneMaterialsToPhong 会把 Lambert 替换为 Phong 并缓存
    // 如果旧版 bug 曾直接修改共享 Phong 颜色，缓存会持续返回已变色的 Phong
    // 清空后下次 initScene 会从原始 Lambert 重新创建干净的 Phong
    clearPhongCache()
    // 停掉 dataVersion watcher（它不在 watcherStops 里）
    if (dataVersionWatcherStop) {
      dataVersionWatcherStop()
      dataVersionWatcherStop = null
    }
    // 清理防抖定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    // 清理交大机电作业数据轮询定时器
    if (workRefreshTimer) {
      clearInterval(workRefreshTimer)
      workRefreshTimer = null
    }
    pendingEnterSlots.clear()
    window.removeEventListener('pzh-slot-anim-pending-enter', handlePendingEnterSlots)
    window.removeEventListener('pzh-slot-rebuild-tracks', handleRebuildTracks)
    // 卸载接触网状态事件监听
    window.removeEventListener('catenary-power-change', onCustomEvent)
  })

  return {
    containerRef,
    sceneReady,
    loadingProgress,
    loadingStatus,
  }
}
