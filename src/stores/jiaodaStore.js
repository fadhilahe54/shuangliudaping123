/**
 * jiaodaStore.js — 交大机电数据全局状态管理（Pinia Store）
 *
 * 集中管理从交大机电系统拉取的作业卡、人员、部门数据，
 * 供多个 UI 组件消费（如作业看板、值班面板等）。
 *
 * 数据自动定时刷新（默认 60s），组件按需读取 computed 属性即可。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchWorkCardsSummary, fetchJdUsersAndGroups, fetchWorkByTrackName } from '../api/jiaodaWork.js'

export const useJiaodaStore = defineStore('jiaoda', () => {
  // ========== 状态 ==========
  const registerCards = ref([])
  const topCards = ref([])
  const users = ref([])
  const groups = ref([])
  const workByTrack = ref({})
  const loading = ref(false)
  const lastUpdated = ref(null)
  let refreshTimer = null

  // ========== 计算属性 ==========
  /** 班组作业卡总数 */
  const registerCardTotal = computed(() => registerCards.value.length)
  /** 登顶作业卡总数 */
  const topCardTotal = computed(() => topCards.value.length)
  /** 在岗人员数 */
  const activeUserCount = computed(() => users.value.filter(u => u.isDelete === 0).length)
  /** 部门数 */
  const groupCount = computed(() => groups.value.length)

  /** 按部门分组人员 */
  const usersByGroup = computed(() => {
    const map = {}
    users.value.forEach(u => {
      const gName = u.group?.name || '未分配'
      if (!map[gName]) map[gName] = []
      map[gName].push(u)
    })
    return map
  })

  /** 有作业的股道数 */
  const activeTrackCount = computed(() => {
    let count = 0
    Object.values(workByTrack.value).forEach(slots => {
      if (slots.slot1?.working || slots.slot2?.working) count++
    })
    return count
  })

  /** 全部在作业人次（班组作业总人数） */
  const totalWorkingWorkers = computed(() => {
    let total = 0
    Object.values(workByTrack.value).forEach(slots => {
      if (slots.slot1) total += slots.slot1.workerCount || 0
      if (slots.slot2) total += slots.slot2.workerCount || 0
    })
    return total
  })

  // ========== 操作 ==========
  async function refreshAll() {
    if (loading.value) return
    loading.value = true
    try {
      const [cardResult, userResult, trackResult] = await Promise.allSettled([
        fetchWorkCardsSummary(),
        fetchJdUsersAndGroups(),
        fetchWorkByTrackName(),
      ])
      if (cardResult.status === 'fulfilled') {
        registerCards.value = cardResult.value.registerCards
        topCards.value = cardResult.value.topCards
      }
      if (userResult.status === 'fulfilled') {
        users.value = userResult.value.users
        groups.value = userResult.value.groups
      }
      if (trackResult.status === 'fulfilled') {
        workByTrack.value = trackResult.value
      }
      lastUpdated.value = new Date()
    } finally {
      loading.value = false
    }
  }

  function startAutoRefresh(intervalMs = 60000) {
    stopAutoRefresh()
    refreshAll()
    refreshTimer = setInterval(refreshAll, intervalMs)
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  return {
    registerCards,
    topCards,
    users,
    groups,
    workByTrack,
    loading,
    lastUpdated,
    registerCardTotal,
    topCardTotal,
    activeUserCount,
    groupCount,
    usersByGroup,
    activeTrackCount,
    totalWorkingWorkers,
    refreshAll,
    startAutoRefresh,
    stopAutoRefresh,
  }
})
