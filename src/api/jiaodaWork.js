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
