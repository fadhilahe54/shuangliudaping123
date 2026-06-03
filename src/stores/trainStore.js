/**
 * trainStore.js — 列车与股道数据全局状态管理（Pinia Store）
 *
 * 职责：
 *   - 从后台拉取股道聚合数据（股道→车组→车辆），解析并转换为 Three.js 场景所需的数据结构
 *   - 管理所有列车状态：空闲/出库动画中/进库动画中/已出库
 *   - 维护相机视角、搜索、筛选等 UI 交互状态
 *   - 通过数据指纹（fingerprint）检测后台数据是否真正变化，避免无意义的场景重建
 *   - 提供出库/进库操作动作，驱动 Three.js SceneManager 执行列车进出动画
 *
 * 主要数据结构：
 *   - carriages[]         主轨道所有车厢的扁平化列表（含位置、车型、状态等）
 *   - nCarriages[]        存车道所有车厢的扁平化列表
 *   - trainPositions      { trackId: offsetZ } 各股道列车的 Z 方向偏移量
 *   - trainStates         { trackId: 'idle'|'departing'|'entering'|'departed' }
 *   - mainTrackConfig[]   主轨道布局配置（从后台解析）
 *   - sidingTrackConfig[] 存车道布局配置
 *   - trackTrainInfo      { trackName: { trainType, groupCount } }
 *   - dataVersion         数据版本号，变化时通知 useThreeScene 重建场景
 */
import { defineStore } from 'pinia'
// Vue 响应式 API：ref 用于深层响应式，shallowRef 用于大型对象（避免深度遍历性能问题）
import { ref, shallowRef, computed } from 'vue'
// 常量：列车起始/结束位置、列车类型标识
import {
  TRAIN_POSITION_MIN, TRAIN_ENTER_START,
  TRAIN_TYPE_EMU, TRAIN_TYPE_CONV,
} from '../utils/constants.js'
// 后台接口：获取股道聚合数据（含关联车组和车辆）
import {
  getAllStockRoadInfo,
  getAllTrainNumber,
  unifiedSearch,
  getGroupVehiclesUnified,
} from '../api/dispatchApi.js'
// 交大机电「股道作业」数据聚合（班组作业 / 登顶作业），按股道名称索引
import { fetchWorkByTrackName, emptyWorkAggregate } from '../api/jiaodaWork.js'

/**
 * 根据车辆信息DTO生成车厢类型标识
 * @param {Object} vehicle 后台车辆信息DTO
 * @returns {string} 车厢类型标识
 */
function mapVehicleType(vehicle) {
  const kind = vehicle.车种 || ''
  // 动车组车种
  if (kind.includes('Mc') || kind.includes('动力车')) return 'mc'
  if (kind.includes('M(') || kind.includes('M（')) return 'mc'
  if (kind.includes('T(') || kind.includes('T（') || kind.includes('拖车')) return 'ze'
  if (kind.includes('C(') || kind.includes('C（') || kind.includes('控制')) return 'kc'// 控制车
  // 普速车种
  if (kind.includes('XL') || kind.includes('行李')) return 'fd'  // 行李车 → fd(发电车)外观
  if (kind.includes('YZ') || kind.includes('硬座')) return 'yz'
  if (kind.includes('YW') || kind.includes('硬卧')) return 'yw'
  if (kind.includes('RW') || kind.includes('软卧')) return 'rw'
  if (kind.includes('CA') || kind.includes('餐车')) return 'ca'
  if (kind.includes('KW') || kind.includes('客卧')) return 'kw'
  return 'yz'
}

/**
 * 根据车组车型判断列车类型（动车/普速）
 * @param {string} model 车组车型（如'CRH6A','25G','25T'）
 * @returns {string} TRAIN_TYPE_EMU | TRAIN_TYPE_CONV
 */
function mapTrainType(model) {
  if (!model) return TRAIN_TYPE_CONV
  if (model.startsWith('CRH') || model.startsWith('CR')) return TRAIN_TYPE_EMU
  return TRAIN_TYPE_CONV
}

/**
 * 根据车辆状态映射前端状态
 */
function mapVehicleStatus(status) {
  if (!status) return 'Normal'
  if (status === '正常') return 'Normal'
  if (status === '临修' || status === '整修') return 'Maintenance'
  return 'Warning'
}

/**
 * 判断股道名称是否为存车道
 * 存车道命名规则：兼容“存车”前缀和“n1道~n4道”命名
 */
function isSidingTrack(trackName) {
  return !!trackName && (trackName.startsWith('存车') || /^n\d+道$/i.test(trackName))
}

function resolveTrainNo(trainGroup, fallback) {
  if (!trainGroup) return fallback
  return trainGroup.车次 || trainGroup.trainNo || trainGroup.车次号 || trainGroup.列车号 || trainGroup.车组号 || fallback
}

// 上一次数据指纹（存 sessionStorage，避免 HMR 热更新重置）
function _getLastFingerprint() {
  try { return sessionStorage.getItem('pzh_data_fp') || '' } catch { return '' }
}
function _setLastFingerprint(fp) {
  try { sessionStorage.setItem('pzh_data_fp', fp) } catch { /* 忽略 */ }
}

function buildStockRoadFingerprint(data) {
  const normalizeVehicleNos = (groups) => {
    return (groups || [])
      .map(group => ({
        key: String(group?.id ?? group?.车组号 ?? group?.车次 ?? ''),
        vehicles: (group?.车辆信息List || [])
          .map(v => `${v?.车号 ?? v?.id ?? ''}#${v?.车辆序号 ?? ''}`)
          .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
      }))
      .sort((a, b) => a.key.localeCompare(b.key, 'zh-Hans-CN'))
      .map(group => `${group.key}[${group.vehicles.join(',')}]`)
      .join(';')
  }

  return (data || [])
    .map(track => ({
      name: String(track?.股道名称 ?? ''),
      len: String(track?.股道长度 ?? ''),
      offset: String(track?.股道偏移量 ?? ''),
      linked: String(track?.重联状态 ?? ''),
      cat1: String(track?.一列位接触网 ?? ''),
      cat2: String(track?.二列位接触网 ?? ''),
      pos1: normalizeVehicleNos(track?.一列位车组信息List),
      pos2: normalizeVehicleNos(track?.二列位车组信息List),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map(track => `${track.name}:${track.len}:${track.offset}:${track.linked}:${track.cat1}:${track.cat2}|${track.pos1}|${track.pos2}`)
    .join('||')
}

/**
 * 从后台股道数据构建主轨道列表和存车道列表
 * @param {Array} stockRoadList 后台返回的股道信息列表
 * @returns {{ mainTracks: Array, sidingTracks: Array }}
 */
function classifyTracks(stockRoadList) {
  const mainTracks = []
  const sidingTracks = []
  stockRoadList.forEach(track => {
    if (isSidingTrack(track.股道名称)) {
      sidingTracks.push(track)
    } else {
      mainTracks.push(track)
    }
  })
  // 按id排序保证顺序一致
  mainTracks.sort((a, b) => a.id - b.id)
  sidingTracks.sort((a, b) => a.id - b.id)
  return { mainTracks, sidingTracks }
}

/**
 * 根据后台车组信息生成车厢数据
 * @param {number} trackId 前端轨道索引
 * @param {Array} trainGroupList 车组信息列表（含车辆）
 * @param {string} position 列位位置 'pos1' | 'pos2'
 * @returns {Array} 车厢数据数组
 */
const POS1_START_INDEX = 9.5
const POS2_START_INDEX = 0

function buildCarriagesFromTrainGroup(trackId, trainGroupList, position) {
  const arr = []
  if (!trainGroupList || trainGroupList.length === 0) return arr
  const baseIndex = position === 'pos2' ? POS2_START_INDEX : POS1_START_INDEX

  trainGroupList.forEach((trainGroup, groupIdx) => {
    const vehicles = trainGroup.车辆信息List || []
    const trainType = mapTrainType(trainGroup.车型)
    const groupStartIndex = baseIndex + arr.length
    vehicles.forEach((v, i) => {
      arr.push({
        id: `${v.车号 || `V${v.id}`}`,
        trackId,
        index: groupStartIndex + i,
        status: mapVehicleStatus(v.状态),
        trainType,
        type: mapVehicleType(v),
        temperature: 20 + Math.random() * 15,
        mileage: v.走行公里 || 0,
        speed: 0,
        sensors: {
          voltage: 200 + Math.random() * 50,
          pressure: 80 + Math.random() * 40,
          vibration: Math.random() * 5,
        },
        repairs: {
          a1Repair: v.A1D1修日期 || '--',
          a2Repair: v.A2D2修日期 || '--',
          a3Repair: v.A3D3修日期 || '--',
          a4Repair: v.A4D4修日期 || '--',
        },
        history: [],
        specs: {
          weight: '--',
          capacity: '--',
          manufactured: '--',
        },
        // 后台原始数据引用
        _vehicleId: v.id,
        _trainGroupId: trainGroup.id,
        _trainGroupNo: trainGroup.车组号,
        _vehicleModel: v.车型,
        _vehicleKind: v.车种,
        _vehicleSeq: v.车辆序号 ?? null ,
        _position: position,
        // 车组边界标记（用于3D渲染时识别多组车的车头车尾）
        _groupIndex: groupIdx,                    // 第几组车（0开始）
        _isGroupFirst: i === 0,                    // 本组第一节
        _isGroupLast: i === vehicles.length - 1,   // 本组最后一节
        _groupSize: vehicles.length,               // 本组车厢数
        _indexInGroup: i,                          // 在本组内的序号
      })
    })
  })

  return arr
}

/**
 * 生成空轨道的占位车厢数据（无后台数据时显示空轨道）
 */
function buildEmptyTrackCarriages() {
  return []
}

/**
 * 将交大机电聚合的作业数据按股道名称注入到股道配置上（挂 slot1Work / slot2Work）
 *
 * 规则：
 *   - 仅对「有车组」的列位注入（一列位有车→slot1，二列位有车→slot2）
 *   - 命中作业数据 → 用真实聚合；未命中 → 用空聚合（渲染绿色标牌，表示无作业）
 *   这样有车组的列位标牌恒显示：绿色=无作业，红色=有班组作业或有人登顶。
 *
 * @param {Array} mainCfg 主轨道配置数组
 * @param {Array} sidingCfg 存车道配置数组
 * @param {Object} workMap fetchWorkByTrackName 的返回值（按股道名称索引）
 */
function injectWorkFromMap(mainCfg, sidingCfg, workMap) {
  const map = workMap || {}
  const inject = (cfgList) => {
    if (!Array.isArray(cfgList)) return
    cfgList.forEach((cfg) => {
      const byTrack = map[cfg.name] || {}
      // 一列位有车组 → slot1（一位）
      if ((cfg.pos1Groups || []).length > 0) {
        cfg.slot1Work = byTrack.slot1 || emptyWorkAggregate(cfg.name, 'slot1', cfg.name)
      }
      // 二列位有车组 → slot2（二位）
      if ((cfg.pos2Groups || []).length > 0) {
        cfg.slot2Work = byTrack.slot2 || emptyWorkAggregate(cfg.name, 'slot2', cfg.name)
      }
    })
  }
  inject(mainCfg)
  inject(sidingCfg)
}

export const useTrainStore = defineStore('train', () => {
  // ========== 后台股道数据 ==========
  // 数据加载状态
  const dataLoaded = ref(false)
  const dataLoading = ref(false)
  const dataVersion = ref(0)  // 数据版本号，每次加载成功后自增，用于触发场景重建
  // 后台原始股道数据
  const stockRoadData = shallowRef([])
  // 分类后的主轨道和存车道配置
  const mainTrackConfig = shallowRef([])   // [{ id, name, pos1Groups, pos2Groups }]
  const sidingTrackConfig = shallowRef([]) // [{ id, name, pos1Groups, pos2Groups }]
  // 交大机电股道作业数据（按股道名称索引），由 refreshWorkData 刷新
  const workByTrack = shallowRef({})

  // ========== 前端3D数据 ==========
  const carriages = shallowRef([])
  const nCarriages = shallowRef([])
  const nTrackInfo = shallowRef({})
  const selectedCarriage = ref(null)
  const selectedTrainTrackId = ref(null)
  const selectedGroupIndex = ref(null)    // 非重联时选中的车组索引
  const searchQuery = ref('')
  const searchedCarriageId = ref(null)
  const searchedTrackId = ref(null)       // 搜索命中的轨道ID（用于整列车高亮）
  const searchedCarriageIds = ref([])     // 搜索命中的所有车厢ID列表
  // "不在库"搜索结果：当后端命中但场景中没有时，存储其完整信息（车组+车辆列表），驱动侧边详情面板显示
  // 结构：{ kind:'group'|'trainNo'|'car', groupNo, trainNo, vehicleModel, formation, vehicles:[{车号,车种,车型,...}], matchedCarNo? }
  const offlineSearchInfo = ref(null)
  const shouldResetView = ref(false)
  // 从 localStorage 恢复上次选中的视角模式
  const CAMERA_VIEW_MODE_KEY = 'pzh_camera_view_mode'
  const _loadCameraViewMode = () => {
    try {
      const v = localStorage.getItem(CAMERA_VIEW_MODE_KEY)
      if (v && ['default', 'topDown', 'topDownReverse', 'leftEnd', 'rightEnd', 'free'].includes(v)) return v
    } catch { /* ignore */ }
    return 'default'
  }
  const cameraViewMode = ref(_loadCameraViewMode())  // 'default' | 'topDown' | 'topDownReverse' | 'leftEnd' | 'rightEnd' | 'free'
  const filterType = ref('all')
  // 高频变更字段一律使用 shallowRef，以 全量替换 的不可变更新方式写入，
  // 避免 ref({}) 对字段逐个 Proxy 包装在 WebSocket 高频推送下的性能开销
  const trainPositions = shallowRef({})
  const trainStates = shallowRef({})
  // 列位级动画状态：{ [trackId]: { pos1:'parked'|'departing'|'out'|'entering', pos2:... } }
  const slotStates = shallowRef({})
  const departCounts = shallowRef({})
  const trackTrainInfo = shallowRef({})
  // 重联状态：{ [轨道ID]: true/false }，默认两列位都有车时为重联
  const trackLinkedState = shallowRef({})

  // 主轨道数量（动态）
  const mainTrackCount = computed(() => mainTrackConfig.value.length)
  // 存车道数量（动态）
  const sidingTrackCount = computed(() => sidingTrackConfig.value.length)

  /**
   * 从后台加载股道数据并构建3D所需的车厢数据
   */
  async function loadStockRoadData(force = false, { suppressRebuild = false } = {}) {
    if (dataLoading.value && !force) {
      console.warn('[Store] loadStockRoadData 被 dataLoading 锁跳过')
      return
    }
    dataLoading.value = true
    try {
      const data = await getAllStockRoadInfo()
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('后台股道数据为空，使用默认配置')
        dataLoaded.value = true
        dataLoading.value = false
        return
      }

      // 生成稳定指纹：按股道、车组、车辆统一排序，避免后端返回顺序波动导致误判
      const fingerprint = buildStockRoadFingerprint(data)

      const lastFp = _getLastFingerprint()
      const hasCurrentSceneData =
        stockRoadData.value.length > 0
        || mainTrackConfig.value.length > 0
        || sidingTrackConfig.value.length > 0
        || carriages.value.length > 0
        || nCarriages.value.length > 0

      // force=true 时跳过指纹去重（WS 明确通知了数据变更，必须刷新）
      if (!force && fingerprint === lastFp && hasCurrentSceneData) {
        console.log('[Store] 数据指纹未变化，跳过重建')
        dataLoading.value = false
        return
      }
      _setLastFingerprint(fingerprint)


      stockRoadData.value = data
      const { mainTracks, sidingTracks } = classifyTracks(data)

      // 从后端字段 一列位接触网/二列位接触网 读取接触网供电状态
      // null / 空 = 该列位无接触网（不显示电线和标牌）
      // '有电'→'powered', '无电'→'unpowered', '接地'→'grounded', '故障'→'fault'
      const _CATENARY_STATE_MAP = { '有电': 'powered', '无电': 'unpowered', '接地': 'grounded', '故障': 'fault' }
      const _mapCatenaryState = (raw) => {
        if (raw == null || raw === '') return null   // 无接触网
        return _CATENARY_STATE_MAP[raw] || 'powered' // 未识别的值降级为 powered
      }

      // 构建主轨道配置
      const mainCfg = mainTracks.map((track, idx) => {
        const p1 = track.一列位车组信息List || []
        const p2 = track.二列位车组信息List || []
        const firstGroup = p1[0] || p2[0]
        return {
          id: idx,                        // 前端轨道索引（0开始）
          dbId: track.id,                 // 后台数据库ID
          name: track.股道名称,            // 股道名称（如“1道”、“7道”）
          trackLength: track.股道长度 ?? null,  // 股道长度（后台配置）
          trackOffset: track.股道偏移量 ?? null, // 股道偏移量/起始位置（后台配置）
          trainType: firstGroup ? mapTrainType(firstGroup.车型) : TRAIN_TYPE_CONV,
          pos1Id: track.一列位,            // 一列位ID
          pos2Id: track.二列位,            // 二列位ID
          pos1Groups: p1,
          pos2Groups: p2,
          slot1Power: _mapCatenaryState(track.一列位接触网),
          slot2Power: _mapCatenaryState(track.二列位接触网),
        }
      })
      // 从后台 重联状态 字段初始化重联状态
      // 不可变多次更新 trackLinkedState：先集中在本地变量，最后一次性赋值，避免 shallowRef 错过中间改动
      let nextLinked = { ...trackLinkedState.value }
      mainCfg.forEach((cfg, idx) => {
        const rawLinked = mainTracks[idx].重联状态
        if (rawLinked === '重联') {
          nextLinked[cfg.id] = true
        } else if (rawLinked === '非重联') {
          nextLinked[cfg.id] = false
        } else if (nextLinked[cfg.id] === undefined) {
          // 后台未设置时：两列位都有车组默认重联
          nextLinked[cfg.id] = (cfg.pos1Groups.length > 0 && cfg.pos2Groups.length > 0)
        }
        cfg.linked = nextLinked[cfg.id] ?? true
      })
      trackLinkedState.value = nextLinked
      mainTrackConfig.value = mainCfg

      // 构建存车道配置
      const sidingCfg = sidingTracks.map((track, idx) => {
        const p1 = track.一列位车组信息List || []
        const p2 = track.二列位车组信息List || []
        const firstGroup = p1[0] || p2[0]
        return {
          id: `n${idx + 1}`,              // 前端存车道ID
          dbId: track.id,
          name: track.股道名称,
          displayIndex: idx + 1,
          trackLength: track.股道长度 ?? null,  // 股道长度（后台配置）
          trackOffset: track.股道偏移量 ?? null, // 股道偏移量/起始位置（后台配置）
          trainType: firstGroup ? mapTrainType(firstGroup.车型) : TRAIN_TYPE_CONV,
          pos1Id: track.一列位,
          pos2Id: track.二列位,
          pos1Groups: p1,
          pos2Groups: p2,
          slot1Power: _mapCatenaryState(track.一列位接触网),
          slot2Power: _mapCatenaryState(track.二列位接触网),
        }
      })
      // 从后台 重联状态 字段初始化存车道重联状态
      // 存车线默认为非重联（停放场景下两组车各自独立）
      nextLinked = { ...trackLinkedState.value }
      sidingCfg.forEach((cfg, idx) => {
        const rawLinked = sidingTracks[idx].重联状态
        if (rawLinked === '重联') {
          nextLinked[cfg.id] = true
        } else if (rawLinked === '非重联') {
          nextLinked[cfg.id] = false
        } else if (nextLinked[cfg.id] === undefined) {
          nextLinked[cfg.id] = false
        }
        cfg.linked = nextLinked[cfg.id] ?? false
      })
      trackLinkedState.value = nextLinked
      sidingTrackConfig.value = sidingCfg

      // 注入交大机电股道作业数据（班组作业/登顶作业）：在列位上挂 slot1Work / slot2Work
      // 使用最近一次 refreshWorkData 缓存的 workByTrack，按股道名称匹配
      injectWorkFromMap(mainCfg, sidingCfg, workByTrack.value)

      // 生成主轨道车厢数据
      const allCarriages = []
      mainCfg.forEach(cfg => {
        const pos1Cars = buildCarriagesFromTrainGroup(cfg.id, cfg.pos1Groups, 'pos1')
        const pos2Cars = buildCarriagesFromTrainGroup(cfg.id, cfg.pos2Groups, 'pos2')

        // pos1车厢的_groupIndex需要累加pos2的车组数量，确保多组车边界正确
        // 渲染顺序：二列位(pos2)靠近标牌端，一列位(pos1)靠远端
        const pos2GroupCount = cfg.pos2Groups.length
        if (pos2GroupCount > 0) {
          pos1Cars.forEach(c => { c._groupIndex += pos2GroupCount })
        }
        // 合并两个列位的车厢（pos2靠近标牌在前，pos1在后）
        const merged = [...pos2Cars, ...pos1Cars]
        allCarriages.push(...merged)
      })
      carriages.value = allCarriages

      // 生成存车道车厢数据（与主轨道逻辑一致）
      const allNCarriages = []
      sidingCfg.forEach(cfg => {
        const pos1Cars = buildCarriagesFromTrainGroup(cfg.id, cfg.pos1Groups, 'pos1')
        const pos2Cars = buildCarriagesFromTrainGroup(cfg.id, cfg.pos2Groups, 'pos2')
        // pos1车厢的_groupIndex需要累加pos2的车组数量，确保多组车边界正确
        const pos2GroupCount = cfg.pos2Groups.length
        if (pos2GroupCount > 0) {
          pos1Cars.forEach(c => { c._groupIndex += pos2GroupCount })
        }
        // 合并两个列位的车厢（pos2靠近标牌在前，pos1在后）
        const merged = [...pos2Cars, ...pos1Cars]
        allNCarriages.push(...merged)
      })
      nCarriages.value = allNCarriages

      // 拉取车次表，建立 车次→起始区间 映射（容错：拉取失败不影响主流程）
      _trainNumberMap = {}
      try {
        const tnList = await getAllTrainNumber()
        if (Array.isArray(tnList)) {
          tnList.forEach(tn => {
            if (tn['车次']) _trainNumberMap[String(tn['车次']).trim()] = tn
          })
        }
      } catch (e) { console.warn('车次表拉取失败，面板仅显示基础信息', e) }
      const trainNumberMap = _trainNumberMap

      // 初始化轨道状态
      const positions = {}
      const states = {}
      const slots = {}
      const counts = {}
      const info = {}
      mainCfg.forEach(cfg => {
        positions[cfg.id] = TRAIN_POSITION_MIN
        states[cfg.id] = 'parked'
        slots[cfg.id] = {
          pos1: (cfg.pos1Groups || []).length > 0 ? 'parked' : 'out',
          pos2: (cfg.pos2Groups || []).length > 0 ? 'parked' : 'out',
        }
        counts[cfg.id] = 0
        // 车次信息：二列位在左、一列位在右，拼接顺序与实际位置一致
        const allGroups = [...cfg.pos2Groups, ...cfg.pos1Groups]
        const firstGroup = allGroups[0]
        // 拼接所有车组号作为标签（多车组用 / 分隔）
        const trainNoLabel = allGroups.length > 0
          ? allGroups.map(g => g.车组号 || resolveTrainNo(g, '')).filter(Boolean).join(' / ') || cfg.name
          : cfg.name
        // 提取真正的车次号（如 K118、Z238，从 trainGroup.车次 字段读取）
        const realTrainNos = allGroups.map(g => g.车次).filter(Boolean)
        const trainNumberLabel = realTrainNos.join(' / ') || ''
        // 尝试从车次表关联起始区间（取第一个命中的车次）
        const matchedTN = realTrainNos.find(no => trainNumberMap[no])
        const tnRecord = matchedTN ? trainNumberMap[matchedTN] : null
        info[cfg.id] = {
          trainNo: trainNoLabel,
          trainNumber: trainNumberLabel,
          vehicleModel: firstGroup?.车型 || '',
          trainType: firstGroup ? mapTrainType(firstGroup.车型) : TRAIN_TYPE_CONV,
          formation: firstGroup ? `${allGroups.reduce((s, g) => s + (g.编组 || 0), 0)}辆编组` : '--',
          direction: tnRecord?.['起始区间'] || '',
          arriveTime: '',
          departTime: '',
          task: '',
          crew: '',
          remark: tnRecord?.['备注'] || '',
        }
      })
      trainPositions.value = positions
      trainStates.value = states
      // 存车道也纳入列位级状态机（id 为 'n1' / 'n2' 等字符串）
      sidingCfg.forEach(cfg => {
        slots[cfg.id] = {
          pos1: (cfg.pos1Groups || []).length > 0 ? 'parked' : 'out',
          pos2: (cfg.pos2Groups || []).length > 0 ? 'parked' : 'out',
        }
      })
      slotStates.value = slots
      departCounts.value = counts
      trackTrainInfo.value = info

      // 存车道信息
      const nInfo = {}
      sidingCfg.forEach(cfg => {
        const allGroups = [...cfg.pos2Groups, ...cfg.pos1Groups]
        const firstGroup = allGroups[0]
        const trainNoLabel = allGroups.length > 0
          ? allGroups.map(g => g.车组号 || resolveTrainNo(g, '')).filter(Boolean).join(' / ') || cfg.name
          : cfg.name
        const realTrainNos = allGroups.map(g => g.车次).filter(Boolean)
        const trainNumberLabel = realTrainNos.join(' / ') || ''
        const matchedTN = realTrainNos.find(no => trainNumberMap[no])
        const tnRecord = matchedTN ? trainNumberMap[matchedTN] : null
        nInfo[cfg.id] = {
          trainNo: trainNoLabel,
          trainNumber: trainNumberLabel,
          vehicleModel: firstGroup?.车型 || '',
          formation: firstGroup ? `${allGroups.reduce((s, g) => s + (g.编组 || 0), 0)}辆编组` : '--',
          direction: tnRecord?.['起始区间'] || '停放',
          arriveTime: '',
          departTime: '',
          task: '停放',
          crew: '',
          remark: tnRecord?.['备注'] || '',
        }
      })
      nTrackInfo.value = nInfo

      dataLoaded.value = true
      if (!suppressRebuild) dataVersion.value++

    } catch (err) {
      console.error('股道数据加载失败:', err)
      dataLoaded.value = true
    } finally {
      dataLoading.value = false
    }
  }

  // 计算属性
  const filteredCarriages = computed(() => {
    if (filterType.value === 'all') return carriages.value
    return carriages.value.filter(c => c.type === filterType.value)
  })

  // 操作方法
  function setSelectedCarriage(carriage, keepTrain = false) {
    selectedCarriage.value = carriage
    if (carriage && !keepTrain) selectedTrainTrackId.value = null
    // 选中新车厢时自动清除搜索高亮，避免搜索蓝色残留
    if (carriage && searchedCarriageId.value && carriage.id !== searchedCarriageId.value) {
      clearSearch(false)
    }
  }

  function setSelectedTrain(trackId, groupIndex = null) {
    selectedTrainTrackId.value = trackId
    selectedGroupIndex.value = groupIndex
    if (trackId !== null) selectedCarriage.value = null
  }

  const selectedTrainCarriages = computed(() => {
    if (selectedTrainTrackId.value === null) return []
    const tid = selectedTrainTrackId.value
    const allCars = [...carriages.value, ...nCarriages.value].filter(c => c.trackId === tid)
    // 指定了车组索引时，只返回该车组的车厢；点击重联整列时 groupIndex 为 null，仍返回整条股道
    if (selectedGroupIndex.value !== null) {
      return allCars.filter(c => c._groupIndex === selectedGroupIndex.value)
    }
    return allCars
  })

  function setSearchedCarriageId(id) {
    searchedCarriageId.value = id
  }

  // 车次→起始区间 映射缓存（loadStockRoadData 中填充，_searchFromBackend 中复用）
  let _trainNumberMap = {}

  /**
   * 兼容导出：旧版本依赖此方法清空全量数据缓存，
   * 现已切换到统一搜索接口（无客户端缓存），保留为 no-op 避免破坏调用方。
   */
  function clearSearchBackendCache() {
    // no-op: unifiedSearch 每次调用都直接打后端视图，不再有内存缓存
  }

  /**
   * 把 v_统一搜索_车辆明细 视图行的列名映射回旧字段，供 offlineSearchInfo 使用。
   * 视图字段（A1D1修日期 / 走行公里 / 车辆车型 / 车辆状态）与 TrainInfoPanel "不在库"
   * 模式期望的旧字段名（A1修 / 走行km / 车型 / 状态）不同，这里建立双向兼容别名，
   * 让面板里的检修日期、走行公里、车辆车型等列能正常显示而不是一片空白。
   */
  function _normalizeVehicleRow(v) {
    if (!v) return v
    return {
      ...v,
      id: v.id ?? v['车辆id'] ?? null,
      车号: v['车号'] ?? '',
      // 车型/状态：兼容车辆视图的 车辆车型 / 车辆状态
      车型: v['车型'] ?? v['车辆车型'] ?? '',
      状态: v['状态'] ?? v['车辆状态'] ?? '',
      // 走行里程：旧字段名 走行km
      走行km: v['走行km'] ?? v['走行公里'] ?? 0,
      // 各级修日期：视图字段 A?D?修日期 → 面板字段 A?修
      A1修: v['A1修'] ?? v['A1D1修日期'] ?? '',
      A2修: v['A2修'] ?? v['A2D2修日期'] ?? '',
      A3修: v['A3修'] ?? v['A3D3修日期'] ?? '',
      A4修: v['A4修'] ?? v['A4D4修日期'] ?? '',
    }
  }

  /**
   * 在库匹配未命中时，回退到后端统一搜索接口 /api/search/unified。
   * 命中"不在库"的车组/车次/车号时，仅返回提示信息并填 offlineSearchInfo，不设置 3D 高亮。
   * @param {string} kw 已转小写的关键字
   * @returns {Promise<{ type: string, message: string, description?: string } | null>}
   */
  async function _searchFromBackend(kw) {
    // ★ 关键：走到这里说明在库匹配全部未命中，必须先清除上一次的 3D 高亮，
    //   否则上次搜索"在库车组"的蓝色高亮会一直残留，与本次"不在库/未找到"的提示不一致
    clearSearch(false)
    // 同时清除上一次的选中轨道/车厢（否则 TrainInfoPanel 的 isOffline 不会生效）
    setSelectedCarriage(null)
    setSelectedTrain(null)

    // 已在库的车组号 / 车次 / 车号 集合（用于判定 inLib，决定是否填 offlineSearchInfo）
    const allCarsInScene = [...carriages.value, ...nCarriages.value]
    const inSceneGroupNos = new Set(allCarsInScene.map(c => (c._trainGroupNo || '').toLowerCase()).filter(Boolean))
    const inSceneTrainNos = new Set([
      ...Object.values(trackTrainInfo.value).map(i => (i.trainNo || '').toLowerCase()),
      ...Object.values(nTrackInfo.value).map(i => (i.trainNo || '').toLowerCase()),
    ].filter(Boolean))
    const inSceneCarNos = new Set(allCarsInScene.map(c => (c.id || '').toLowerCase()).filter(Boolean))

    // 调统一搜索：每类最多取 5 条，足够"最优命中"判定
    let resp
    try {
      resp = await unifiedSearch(kw, 'all', 5)
    } catch (e) {
      console.error('[Store] 统一搜索失败:', e)
      return {
        type: 'error',
        message: `搜索 "${kw}" 失败`,
        description: '后端服务异常，请稍后重试',
      }
    }

    const groupList = Array.isArray(resp?.['车组列表']) ? resp['车组列表'] : []
    const vehicleList = Array.isArray(resp?.['车辆列表']) ? resp['车辆列表'] : []
    const trainNoList = Array.isArray(resp?.['车次列表']) ? resp['车次列表'] : []
    const best = resp?.['最优命中'] || null

    // 1. 命中类型：车组
    if (best?.['类型'] === 'group' && groupList.length > 0) {
      const groupHit = groupList.find(g => Number(g['车组id']) === Number(best['目标id'])) || groupList[0]
      const groupNo = String(groupHit['车组号'] || '')
      const inLib = inSceneGroupNos.has(groupNo.toLowerCase())
      if (!inLib) {
        // 视图本身没带车辆明细列表，按需调一次 getGroupVehiclesUnified 拿来填详情面板
        let vehicles = []
        try {
          const list = await getGroupVehiclesUnified(groupHit['车组id'])
          vehicles = (Array.isArray(list) ? list : []).map(_normalizeVehicleRow)
        } catch (e) {
          console.warn('[Store] 拉取车组车辆失败，offlineSearchInfo.vehicles 留空', e)
        }
        offlineSearchInfo.value = {
          kind: 'group',
          groupNo,
          trainNo: groupHit['车次'] || '',
          vehicleModel: groupHit['车型'] || '',
          formation: groupHit['编组'] || groupHit['实体车辆数'] || vehicles.length || 0,
          vehicles,
          direction: groupHit['起始区间'] || _trainNumberMap[groupHit['车次']]?.['起始区间'] || '',
        }
      }
      return {
        type: 'success',
        message: `找到车组 ${groupNo}${inLib ? '' : '（不在库）'}`,
        description: inLib
          ? `车型 ${groupHit['车型'] || '--'}，车次 ${groupHit['车次'] || '--'}`
          : `车型 ${groupHit['车型'] || '--'}，车次 ${groupHit['车次'] || '--'}，编组 ${groupHit['编组'] || groupHit['实体车辆数'] || '--'} 辆`,
      }
    }

    // 2. 命中类型：车厢
    if (best?.['类型'] === 'vehicle' && vehicleList.length > 0) {
      const vHit = vehicleList.find(v => Number(v['车辆id']) === Number(best['目标id'])) || vehicleList[0]
      const carNo = String(vHit['车号'] || '')
      const inLib = inSceneCarNos.has(carNo.toLowerCase())
      if (!inLib) {
        // 若车辆已编组，按车组id 去拉同车组车辆，构造完整 offlineSearchInfo
        let vehicles = [_normalizeVehicleRow(vHit)]
        if (vHit['车组id'] != null) {
          try {
            const list = await getGroupVehiclesUnified(vHit['车组id'])
            const arr = (Array.isArray(list) ? list : []).map(_normalizeVehicleRow)
            if (arr.length > 0) vehicles = arr
          } catch (e) {
            console.warn('[Store] 反查车组车辆失败，仅显示当前车辆', e)
          }
        }
        offlineSearchInfo.value = {
          kind: 'car',
          matchedCarNo: carNo,
          groupNo: vHit['车组号'] || '',
          trainNo: vHit['车次'] || '',
          vehicleModel: vHit['车组车型'] || vHit['车辆车型'] || '',
          formation: vHit['编组'] || vehicles.length || 1,
          vehicles,
          direction: vHit['起始区间'] || _trainNumberMap[vHit['车次']]?.['起始区间'] || '',
        }
      }
      return {
        type: 'success',
        message: `找到车号 ${carNo}${inLib ? '' : '（不在库）'}`,
        description: `车型 ${vHit['车辆车型'] || '--'}，车种 ${vHit['车种'] || '--'}${vHit['车组号'] ? `，所属车组 ${vHit['车组号']}` : '，未编入车组'}`,
      }
    }

    // 3. 命中类型：车次
    if (best?.['类型'] === 'trainNo' && trainNoList.length > 0) {
      const tHit = trainNoList.find(t => Number(t['车次id']) === Number(best['目标id'])) || trainNoList[0]
      const trainNo = String(tHit['车次'] || '')
      const inLib = inSceneTrainNos.has(trainNo.toLowerCase())
      if (!inLib) {
        // 车次视图给的是聚合（关联车组列表 / 车型列表 / 股道列表），无详细车辆list；
        // 这里取关联首个车组作为代表填面板，详情面板 vehicles 留空（用户可用后台搜索看完整明细）
        const firstGroupNo = String(tHit['关联车组号列表'] || '').split('、')[0] || ''
        const firstModel = String(tHit['关联车型列表'] || '').split('、')[0] || ''
        offlineSearchInfo.value = {
          kind: 'trainNo',
          groupNo: firstGroupNo,
          trainNo,
          vehicleModel: firstModel,
          formation: tHit['关联车辆数'] || 0,
          vehicles: [],
          direction: tHit['起始区间'] || _trainNumberMap[trainNo]?.['起始区间'] || '',
        }
      }
      return {
        type: 'success',
        message: `找到车次 ${trainNo}${inLib ? '' : '（不在库）'}`,
        description: `关联车组 ${tHit['关联车组数'] || 0} 列，关联车辆 ${tHit['关联车辆数'] || 0} 辆`,
      }
    }

    return {
      type: 'error',
      message: `未找到 "${kw}"`,
      description: '支持搜索车号、车型、车次、车组号（含不在库数据）',
    }
  }

  /**
   * 多功能搜索：支持按车号、车型、车次、车组号模糊匹配
   * - 优先匹配在库（已加载到 3D 场景的）数据，命中时高亮（不再切换视角）
   * - 在库未命中时回退到后端全量数据查询，命中时仅以提示形式返回（标记"不在库"）
   * @param {string} keyword 搜索关键词
   * @returns {Promise<{ type: string, message: string, description?: string } | null>}
   */
  async function searchTrain(keyword) {
    if (!keyword || !keyword.trim()) {
      clearSearch()
      return null
    }
    const kw = keyword.trim().toLowerCase()
    const allCars = [...carriages.value, ...nCarriages.value]

    // 1. 精确匹配车号（车厢ID完全相等）
    const exactCar = allCars.find(c => c.id.toLowerCase() === kw)
    if (exactCar) {
      clearSearch(false)
      searchedCarriageId.value = exactCar.id
      selectedCarriage.value = exactCar
      return {
        type: 'success',
        message: `找到车厢 ${exactCar.id}`,
        description: `${getTrackName(exactCar.trackId)}，位置 ${exactCar.index + 1}`,
      }
    }

    // 2. 匹配车组号（优先于模糊车号，避免输入车组号时只命中单节车厢）
    const groupCar = allCars.find(c => c._trainGroupNo && c._trainGroupNo.toLowerCase().includes(kw))
    if (groupCar) {
      const trackCars = allCars.filter(c => c.trackId === groupCar.trackId && c._trainGroupNo === groupCar._trainGroupNo)
      clearSearch(false)
      searchedTrackId.value = groupCar.trackId
      searchedCarriageIds.value = trackCars.map(c => c.id)
      if (trackCars.length > 0) {
        searchedCarriageId.value = trackCars[0].id
      }
      // 弹出整列车信息面板
      setSelectedTrain(groupCar.trackId, groupCar._groupIndex)
      return {
        type: 'success',
        message: `找到车组 ${groupCar._trainGroupNo}`,
        description: `${getTrackName(groupCar.trackId)}，共 ${trackCars.length} 节车厢`,
      }
    }

    // 3. 匹配车次（直接读取 cfg.pos1Groups/pos2Groups 中的"车次"字段）
    // ★ 注意：trackTrainInfo[id].trainNo 字段名误导，实际存的是车组号拼接（见 line 444-448 注释），
    //         不能用于车次搜索。真正的车次（如 K118、Z238）在原始 trainGroup.车次 字段中。
    const allCfgs = [...mainTrackConfig.value, ...sidingTrackConfig.value]
    const trainNoCfg = allCfgs.find(cfg => {
      const groups = [...(cfg.pos1Groups || []), ...(cfg.pos2Groups || [])]
      return groups.some(g => g && g.车次 && String(g.车次).toLowerCase().includes(kw))
    })
    if (trainNoCfg) {
      const trackCars = allCars.filter(c => c.trackId === trainNoCfg.id)
      clearSearch(false)
      searchedTrackId.value = trainNoCfg.id
      searchedCarriageIds.value = trackCars.map(c => c.id)
      if (trackCars.length > 0) {
        searchedCarriageId.value = trackCars[0].id
      }
      setSelectedTrain(trainNoCfg.id, null)
      const groups = [...(trainNoCfg.pos1Groups || []), ...(trainNoCfg.pos2Groups || [])]
      const matchedTrainNo = groups.find(g => g && g.车次 && String(g.车次).toLowerCase().includes(kw))?.车次
      return {
        type: 'success',
        message: `找到车次 ${matchedTrainNo || kw}`,
        description: `${getTrackName(trainNoCfg.id)}，共 ${trackCars.length} 节车厢`,
      }
    }

    // 4. 匹配车型（车组车型，如 25G、CRH6A、CR200J）
    // ★ 必须在"模糊车号"之前匹配，避免搜 "25T" 时被车号 "25T-1234567" 截胡
    // 双源匹配：① 车组车型（cfg.pos1Groups[].车型） ② 车辆车型（c._vehicleModel，来自 v.车型）
    const typeCfg = allCfgs.find(cfg => {
      const groups = [...(cfg.pos1Groups || []), ...(cfg.pos2Groups || [])]
      return groups.some(g => g && g.车型 && String(g.车型).toLowerCase().includes(kw))
    })
    if (typeCfg) {
      const trackCars = allCars.filter(c => c.trackId === typeCfg.id)
      clearSearch(false)
      searchedTrackId.value = typeCfg.id
      searchedCarriageIds.value = trackCars.map(c => c.id)
      if (trackCars.length > 0) {
        searchedCarriageId.value = trackCars[0].id
      }
      setSelectedTrain(typeCfg.id, null)
      const groups = [...(typeCfg.pos1Groups || []), ...(typeCfg.pos2Groups || [])]
      const matchedType = groups.find(g => g && g.车型 && String(g.车型).toLowerCase().includes(kw))?.车型
      return {
        type: 'success',
        message: `找到车型 ${matchedType || kw}`,
        description: `${getTrackName(typeCfg.id)}，共 ${trackCars.length} 节车厢`,
      }
    }
    // 兜底：直接在车厢的 _vehicleModel（车辆车型）上匹配，命中所有同型号车厢
    const vehicleTypeCars = allCars.filter(c => c._vehicleModel && String(c._vehicleModel).toLowerCase().includes(kw))
    if (vehicleTypeCars.length > 0) {
      clearSearch(false)
      // 按 trackId 分组，取首个轨道作为主匹配（以便相机聚焦），但高亮所有命中车厢
      const firstCar = vehicleTypeCars[0]
      searchedTrackId.value = firstCar.trackId
      searchedCarriageIds.value = vehicleTypeCars.map(c => c.id)
      searchedCarriageId.value = firstCar.id
      setSelectedTrain(firstCar.trackId, null)
      return {
        type: 'success',
        message: `找到车型 ${firstCar._vehicleModel}`,
        description: `共 ${vehicleTypeCars.length} 节车厢匹配`,
      }
    }

    // 5. 模糊匹配车号（车号中包含关键字，仅命中单节）
    const fuzzyCar = allCars.find(c => c.id.toLowerCase().includes(kw))
    if (fuzzyCar) {
      clearSearch(false)
      searchedCarriageId.value = fuzzyCar.id
      selectedCarriage.value = fuzzyCar
      return {
        type: 'success',
        message: `找到车厢 ${fuzzyCar.id}`,
        description: `${getTrackName(fuzzyCar.trackId)}，位置 ${fuzzyCar.index + 1}`,
      }
    }

    // 6. 在库未命中：回退到后端全量数据搜索（支持"不在库"的车组/车次/车号）
    // 命中后只弹出提示，不设置 3D 高亮（因为目标不在场景中）
    return await _searchFromBackend(kw)
  }

  /**
   * 清除所有搜索状态
   */
  function clearSearch(clearQuery = true) {
    if (clearQuery) searchQuery.value = ''
    searchedCarriageId.value = null
    searchedTrackId.value = null
    searchedCarriageIds.value = []
    offlineSearchInfo.value = null
  }

  /**
   * 单独关闭“不在库”详情面板（不动输入框/其他搜索状态）
   */
  function clearOfflineSearchInfo() {
    offlineSearchInfo.value = null
  }

  function setShouldResetView(val) {
    shouldResetView.value = val
  }

  function setCameraViewMode(mode) {
    cameraViewMode.value = mode
    // 持久化视角模式，刷新后保持上次选择
    try { localStorage.setItem(CAMERA_VIEW_MODE_KEY, mode) } catch { /* ignore */ }
  }

  function setFilterType(type) {
    filterType.value = type
  }

  /**
   * 一键出库：列车自动驶出直到消失
   */
  function trainDepart(trackId) {
    const state = trainStates.value[trackId]
    if (state !== 'parked') return
    trainStates.value = { ...trainStates.value, [trackId]: 'departing' }
    departCounts.value = { ...departCounts.value, [trackId]: (departCounts.value[trackId] || 0) + 1 }
  }

  /**
   * 出库动画完成回调
   */
  function trainDepartComplete(trackId) {
    trainStates.value = { ...trainStates.value, [trackId]: 'out' }
  }

  /**
   * 一键进库：列车从远方驶入停放
   */
  function trainEnter(trackId) {
    const state = trainStates.value[trackId]
    if (state !== 'out') return
    trainStates.value = { ...trainStates.value, [trackId]: 'entering' }
    trainPositions.value = { ...trainPositions.value, [trackId]: TRAIN_ENTER_START }
  }

  /**
   * 进库动画完成回调
   */
  function trainEnterComplete(trackId) {
    trainStates.value = { ...trainStates.value, [trackId]: 'parked' }
    trainPositions.value = { ...trainPositions.value, [trackId]: TRAIN_POSITION_MIN }
  }

  /**
   * 内部工具：不可变方式设置某条股道某列位的动画状态
   * @param {number|string} trackId
   * @param {'pos1'|'pos2'} slotKey
   * @param {'parked'|'departing'|'out'|'entering'} state
   */
  function _setSlotState(trackId, slotKey, state) {
    if (slotKey !== 'pos1' && slotKey !== 'pos2') return
    const oldTrackSlots = slotStates.value[trackId] || { pos1: 'out', pos2: 'out' }
    slotStates.value = {
      ...slotStates.value,
      [trackId]: {
        ...oldTrackSlots,
        [slotKey]: state,
      },
    }
  }

  /**
   * 公开设置列位状态（动画编排器在“先重建场景再播放进库”时需要把 parked 临时置为 out）
   */
  function setSlotState(trackId, slotKey, state) {
    _setSlotState(trackId, slotKey, state)
  }

  /**
   * 列位级出库：只让指定列位的车组开出。
   * 说明：这里只改状态，真正的 Three.js 动画由 useThreeScene 的 watcher 调 SceneManager 完成。
   */
  function slotDepart(trackId, slotKey) {
    const state = slotStates.value[trackId]?.[slotKey]
    if (state !== 'parked') return false
    _setSlotState(trackId, slotKey, 'departing')
    return true
  }

  /**
   * 列位级出库完成回调
   */
  function slotDepartComplete(trackId, slotKey) {
    _setSlotState(trackId, slotKey, 'out')
  }

  /**
   * 列位级进库：只让指定列位的车组从远端驶入。
   */
  function slotEnter(trackId, slotKey) {
    const state = slotStates.value[trackId]?.[slotKey]
    if (state !== 'out') return false
    _setSlotState(trackId, slotKey, 'entering')
    return true
  }

  /**
   * 列位级进库完成回调
   */
  function slotEnterComplete(trackId, slotKey) {
    _setSlotState(trackId, slotKey, 'parked')
  }

  /**
   * 设置股道重联状态（同步更新配置并触发场景重建）
   * @param {number|string} trackId 轨道ID
   * @param {boolean} linked 是否重联
   */
  function setTrackLinked(trackId, linked) {
    trackLinkedState.value = { ...trackLinkedState.value, [trackId]: linked }
    // 同步更新 cfg.linked 以便3D重建时使用最新值
    const mainCfg = mainTrackConfig.value.find(c => c.id === trackId)
    if (mainCfg) mainCfg.linked = linked
    const sidingCfg = sidingTrackConfig.value.find(c => c.id === trackId)
    if (sidingCfg) sidingCfg.linked = linked
    // 递增版本号触发3D场景重建
    dataVersion.value++
  }

  /**
   * 刷新交大机电股道作业数据，并重新注入当前股道配置后触发场景重建
   *
   * 调用时机：场景初次就绪后 + 定时轮询（由 useThreeScene 控制）。
   * 失败时静默降级（保留上一次数据，不影响主场景）。
   * @returns {Promise<void>}
   */
  async function refreshWorkData() {
    try {
      const map = await fetchWorkByTrackName()
      workByTrack.value = map || {}
      // 重新注入到当前配置（按股道名称匹配），并触发 3D 标牌重建
      injectWorkFromMap(mainTrackConfig.value, sidingTrackConfig.value, workByTrack.value)
      dataVersion.value++
    } catch (e) {
      console.warn('[交大机电] 股道作业数据刷新失败，保留上次数据', e)
    }
  }

  /**
   * 根据前端轨道ID获取股道名称
   */
  function getTrackName(trackId) {
    if (typeof trackId === 'string' && trackId.startsWith('n')) {
      const cfg = sidingTrackConfig.value.find(c => c.id === trackId)
      return cfg ? cfg.name : trackId
    }
    const cfg = mainTrackConfig.value.find(c => c.id === trackId)
    return cfg ? cfg.name : `${trackId + 1}道`
  }

  return {
    // 后台数据
    dataLoaded,
    dataLoading,
    dataVersion,
    stockRoadData,
    mainTrackConfig,
    sidingTrackConfig,
    mainTrackCount,
    sidingTrackCount,
    loadStockRoadData,
    getTrackName,
    // 交大机电股道作业数据
    workByTrack,
    refreshWorkData,
    // 前端3D数据
    carriages,
    nCarriages,
    nTrackInfo,
    selectedCarriage,
    selectedTrainTrackId,
    selectedGroupIndex,
    selectedTrainCarriages,
    searchQuery,
    searchedCarriageId,
    searchedTrackId,
    searchedCarriageIds,
    offlineSearchInfo,
    clearOfflineSearchInfo,
    shouldResetView,
    cameraViewMode,
    filterType,
    trainPositions,
    trainStates,
    slotStates,
    setSlotState,
    departCounts,
    trackTrainInfo,
    filteredCarriages,
    setSelectedCarriage,
    setSelectedTrain,
    setSearchedCarriageId,
    searchTrain,
    clearSearch,
    clearSearchBackendCache,
    setShouldResetView,
    setCameraViewMode,
    setFilterType,
    trackLinkedState,
    setTrackLinked,
    trainDepart,
    trainDepartComplete,
    trainEnter,
    trainEnterComplete,
    slotDepart,
    slotDepartComplete,
    slotEnter,
    slotEnterComplete,
  }
})
