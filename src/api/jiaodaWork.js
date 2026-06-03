/**
 * jiaodaWork.js — 交大机电「股道作业」数据聚合
 *
 * 把交大机电系统的 停放车组 / 班组作业登记 / 登顶作业 三类接口数据，
 * 聚合成「按股道名称 + 列位」的作业看板数据，供 3D 大屏标牌指示灯使用。
 *
 * 聚合流程：
 *   1. 查询全部股道 → 取所有股道ID
 *   2. 按股道ID查询在停车组 → 得到每个 bid（含 trackId / trackIndex / 车组号）
 *   3. 对每个 bid 并行查询「班组作业登记记录」与「登顶作业记录」
 *   4. 按 股道名称 + 列位(trackIndex 1=一位/slot1, 2=二位/slot2) 聚合统计
 *
 * 输出结构（fetchWorkByTrackName 的返回值）：
 *   {
 *     [股道名称]: {
 *       slot1: WorkAggregate | undefined,  // 一位
 *       slot2: WorkAggregate | undefined,  // 二位
 *     }
 *   }
 *
 * WorkAggregate（与 3D 标牌 createDualWorkSign / 详情弹窗约定一致）：
 *   {
 *     working:Boolean,         // 是否有作业（班组或登顶任一>0）
 *     groupCount:Number,       // 班组作业数量
 *     topCount:Number,         // 登顶作业数量
 *     workerCount:Number,      // 班组作业总人数
 *     trainNo:String,          // 车组号
 *     trackName:String,        // 股道名称
 *     slot:'slot1'|'slot2',    // 列位
 *     registerRecords:Array,   // 班组作业明细
 *     topRecords:Array,        // 登顶作业明细
 *   }
 */
import {
  jdQueryTracks,
  jdQueryParks,
  jdQueryRegisterWorkByBid,
  jdQueryTopWorkByBid,
  jdQueryRegisterWorkCards,
  jdQueryTopWorkCards,
  jdQueryUsers,
  jdQueryGroups,
} from './jiaodaApi.js'

/** trackIndex → 列位 key（1=一位, 2=二位） */
function slotKeyOfIndex(trackIndex) {
  return Number(trackIndex) === 2 ? 'slot2' : 'slot1'
}

/** 生成一个空作业聚合（无作业，用于占位渲染绿色标牌） */
export function emptyWorkAggregate(trackName, slot, trainNo = '') {
  return {
    working: false,
    groupCount: 0,
    topCount: 0,
    workerCount: 0,
    trainNo,
    trackName,
    slot,
    registerRecords: [],
    topRecords: [],
  }
}

/**
 * 拉取并聚合交大机电股道作业数据
 * @returns {Promise<Object>} 按股道名称索引的作业看板数据；失败时返回空对象 {}
 */
export async function fetchWorkByTrackName() {
  // 1. 全部股道
  const tracks = await jdQueryTracks()
  if (!Array.isArray(tracks) || tracks.length === 0) return {}
  const idToName = {}
  const allIds = []
  tracks.forEach((t) => {
    idToName[t.id] = t.name
    allIds.push(t.id)
  })

  // 2. 在停车组（含 bid）
  const parks = await jdQueryParks(allIds, 0)
  if (!Array.isArray(parks) || parks.length === 0) return {}

  // 3. 并行查询每个 bid 的班组登记 + 登顶记录（单个失败不影响整体）
  const tasks = parks.map(async (park) => {
    const bid = park.bid
    const [regRes, topRes] = await Promise.allSettled([
      jdQueryRegisterWorkByBid(bid),
      jdQueryTopWorkByBid(bid),
    ])
    const registerRecords = regRes.status === 'fulfilled' && Array.isArray(regRes.value) ? regRes.value : []
    const topRecords = topRes.status === 'fulfilled' && Array.isArray(topRes.value) ? topRes.value : []
    return { park, registerRecords, topRecords }
  })

  const results = await Promise.all(tasks)

  // 4. 按 股道名称 + 列位 聚合
  const map = {}
  results.forEach(({ park, registerRecords, topRecords }) => {
    const trackName = (park.track && park.track.name) || idToName[park.trackId]
    if (!trackName) return
    const slot = slotKeyOfIndex(park.trackIndex)
    const trainNo = (park.train && park.train.trainGroupNo) || ''

    if (!map[trackName]) map[trackName] = {}
    // 同一列位若已存在则合并（多 bid 容错）
    const prev = map[trackName][slot] || emptyWorkAggregate(trackName, slot, trainNo)

    const mergedRegister = [...prev.registerRecords, ...registerRecords]
    const mergedTop = [...prev.topRecords, ...topRecords]
    const workerCount = mergedRegister.reduce((sum, r) => sum + (Number(r.workerCount) || 0), 0)

    map[trackName][slot] = {
      working: mergedRegister.length > 0 || mergedTop.length > 0,
      groupCount: mergedRegister.length,
      topCount: mergedTop.length,
      workerCount,
      trainNo: prev.trainNo || trainNo,
      trackName,
      slot,
      registerRecords: mergedRegister,
      topRecords: mergedTop,
    }
  })

  return map
}

/**
 * 从交大机电接口拉取股道+停放车组数据，转换为后台 getAllStockRoadInfo 格式
 *
 * 用途：后端(:8092)停止后，完全从交大机电接口获取股道和车组数据，
 *       驱动 trainStore 的 loadStockRoadData，实现 3D 场景渲染。
 *
 * 转换逻辑：
 *   Jiaoda track  → { id, 股道名称, placeCount }
 *   Jiaoda park   → 按 trackId + trackIndex 分组到 一列位/二列位车组信息List
 *
 * @returns {Promise<Array>} 兼容后台 getAllStockRoadInfo 的股道数组；失败返回 []
 */
export async function fetchAllStockRoadInfoFromJd() {
  const tracks = await jdQueryTracks()
  if (!Array.isArray(tracks) || tracks.length === 0) return []

  const allIds = tracks.map(t => t.id)

  // 拉取停放车组（单个接口失败不影响股道列表展示）
  let parks = []
  try {
    const parkData = await jdQueryParks(allIds, 0)
    if (Array.isArray(parkData)) parks = parkData
  } catch (e) {
    console.warn('[jiaodaWork] 停放车组查询失败，股道仍正常渲染', e)
  }

  // 按 trackId 分桶
  const parksByTrack = {}
  parks.forEach(park => {
    const tid = park.trackId
    if (!parksByTrack[tid]) parksByTrack[tid] = []
    parksByTrack[tid].push(park)
  })

  // 转换为后台格式
  return tracks.map(track => {
    const trackParks = parksByTrack[track.id] || []
    const slot1Parks = trackParks.filter(p => Number(p.trackIndex) === 1)
    const slot2Parks = trackParks.filter(p => Number(p.trackIndex) === 2)

    // 将 park 对象转为后台「车组信息」格式
    const toTrainGroup = (park) => {
      const train = park.train || {}
      const groupNo = train.trainGroupNo || ''
      // CR200J 系统 — 默认按动车组处理
      const isLong = train.isLong === 1
      const formation = isLong ? 16 : 8
      // 生成占位车辆列表（交大机电接口无车辆明细，按编组数生成占位）
      const vehicles = []
      for (let i = 0; i < formation; i++) {
        vehicles.push({
          id: `${park.id}_v${i}`,
          车号: `${groupNo}-${String(i + 1).padStart(2, '0')}`,
          车辆序号: i + 1,
          车型: 'CR200J',
          车种: i === 0 || i === formation - 1 ? 'Mc' : (i % 2 === 1 ? 'M(' : 'T('),
          状态: '正常',
        })
      }
      return {
        id: park.trainId || park.id,
        车组号: groupNo,
        车次: '',
        车型: 'CR200J',
        编组: formation,
        车辆信息List: vehicles,
      }
    }

    return {
      id: track.id,
      股道名称: track.name,
      placeCount: track.placeCount,
      股道长度: null,
      股道偏移量: null,
      重联状态: null,
      一列位: null,
      二列位: null,
      一列位接触网: null,
      二列位接触网: null,
      一列位车组信息List: slot1Parks.map(toTrainGroup),
      二列位车组信息List: slot2Parks.map(toTrainGroup),
    }
  })
}

/**
 * 拉取班组作业卡和登顶作业卡的汇总统计
 * @returns {Promise<{registerCards:Array, topCards:Array, registerTotal:number, topTotal:number}>}
 */
export async function fetchWorkCardsSummary() {
  const [regRes, topRes] = await Promise.allSettled([
    jdQueryRegisterWorkCards(0),
    jdQueryTopWorkCards(),
  ])
  const registerCards = regRes.status === 'fulfilled' && Array.isArray(regRes.value) ? regRes.value : []
  const topCards = topRes.status === 'fulfilled' && Array.isArray(topRes.value) ? topRes.value : []
  return {
    registerCards,
    topCards,
    registerTotal: registerCards.length,
    topTotal: topCards.length,
  }
}

/**
 * 拉取交大机电系统的人员和部门数据
 * @returns {Promise<{users:Array, groups:Array}>}
 */
export async function fetchJdUsersAndGroups() {
  const [uRes, gRes] = await Promise.allSettled([
    jdQueryUsers(),
    jdQueryGroups(),
  ])
  const users = uRes.status === 'fulfilled' && Array.isArray(uRes.value) ? uRes.value : []
  const groups = gRes.status === 'fulfilled' && Array.isArray(gRes.value) ? gRes.value : []
  return { users, groups }
}
