<!--
  综合搜索页面
  功能：支持按车厢号、车组号、车次号、车型进行综合搜索，展示详细信息
  支持搜索类型切换、结果高亮、车组展开查看关联车辆
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, RefreshLeft, Tickets, Van, SetUp, Guide, InfoFilled } from '@element-plus/icons-vue'
import { unifiedSearch, getGroupVehiclesUnified } from '../../api/dispatchApi.js'

/* ========== 搜索状态 ========== */
const loading = ref(false)
const searchType = ref('all')            // 搜索类型：all/carriage/group/trainNo/type
const keyword = ref('')                   // 搜索关键词

/* ========== 搜索结果（来自后端统一搜索接口） ========== */
const carriageResults = ref([])           // 车厢搜索结果（v_统一搜索_车辆明细）
const groupResults = ref([])              // 车组搜索结果（v_统一搜索_车组汇总）
const trainNoResults = ref([])            // 车次搜索结果（v_统一搜索_车次汇总）
const bestMatch = ref(null)               // 后端推断的最优命中
const hasSearched = ref(false)            // 是否真正执行过一次搜索（用于控制空态显示）

/* ========== 展开的车组详情 ========== */
const expandedGroupIds = ref([])

/* ========== 车组id → 车辆列表 缓存（按需异步拉取） ========== */
const groupVehiclesMap = reactive({})

/* ========== 搜索类型选项 ========== */
const searchTypes = [
  { value: 'all',      label: '全部' },
  { value: 'carriage', label: '车厢号' },
  { value: 'group',    label: '车组' },
  { value: 'trainNo',  label: '车次' },
  { value: 'type',     label: '车型' },
]

const normalizeGroupKey = (val) => String(val ?? '').trim()

/**
 * 把后端返回的车辆视图行（v_统一搜索_车辆明细）补齐前端模板期望的旧字段名
 * - 视图字段 车辆车型 → 模板 车型
 * - 视图字段 车辆状态 → 模板 状态
 */
const normalizeVehicle = (v) => {
  if (!v) return v
  return {
    ...v,
    车型: v['车型'] ?? v['车辆车型'] ?? '',
    状态: v['状态'] ?? v['车辆状态'] ?? '',
  }
}

/** 兼容父组件调用：当前实现统一搜索按需触发，不需要预加载 */
const loadData = async () => {}

/* ========== 执行搜索（统一走后端 SearchController.unifiedSearch） ========== */
const handleSearch = async () => {
  const kw = keyword.value.trim()
  if (!kw) {
    ElMessage.info('请输入搜索关键词')
    return
  }

  loading.value = true
  hasSearched.value = true
  expandedGroupIds.value = []
  // 清空旧结果
  carriageResults.value = []
  groupResults.value = []
  trainNoResults.value = []
  bestMatch.value = null

  try {
    const resp = await unifiedSearch(kw, searchType.value, 50)
    const 车组 = Array.isArray(resp?.['车组列表']) ? resp['车组列表'] : []
    const 车辆 = Array.isArray(resp?.['车辆列表']) ? resp['车辆列表'] : []
    const 车次 = Array.isArray(resp?.['车次列表']) ? resp['车次列表'] : []

    // 车辆字段做兼容映射，供旧模板字段（车型/状态）使用
    carriageResults.value = 车辆.map(normalizeVehicle)
    // 车组结果中，把视图字段重命名为模板使用的 id 字段
    groupResults.value = 车组.map(g => ({ ...g, id: g['车组id'] }))
    trainNoResults.value = 车次.map(n => ({ ...n, id: n['车次id'] }))
    bestMatch.value = resp?.['最优命中'] || null

    const total = carriageResults.value.length + groupResults.value.length + trainNoResults.value.length
    if (total === 0) {
      ElMessage.warning(`未找到与"${kw}"相关的结果`)
    } else {
      ElMessage.success(`共找到 ${total} 条结果`)
    }
  } catch (e) {
    console.error('统一搜索失败', e)
    ElMessage.error('搜索失败，请稍后再试')
  } finally {
    loading.value = false
  }
}

/* ========== 重置搜索 ========== */
const handleReset = () => {
  keyword.value = ''
  searchType.value = 'all'
  carriageResults.value = []
  groupResults.value = []
  trainNoResults.value = []
  expandedGroupIds.value = []
  bestMatch.value = null
  hasSearched.value = false
}

/* ========== 输入框内容变化：用户在改关键字，撤销上次搜索结果，回到引导态 ========== */
const handleKeywordInput = () => {
  if (!hasSearched.value) return
  // 已有上一次搜索结果时，开始改字 → 把结果清掉，避免误读旧结果
  hasSearched.value = false
  carriageResults.value = []
  groupResults.value = []
  trainNoResults.value = []
  expandedGroupIds.value = []
  bestMatch.value = null
}

/* ========== 切换车组详情展开（按需异步拉取车组车辆） ========== */
const toggleGroupExpand = async (groupId) => {
  const targetKey = normalizeGroupKey(groupId)
  const index = expandedGroupIds.value.findIndex(id => normalizeGroupKey(id) === targetKey)
  if (index >= 0) {
    expandedGroupIds.value.splice(index, 1)
    return
  }
  expandedGroupIds.value.push(groupId)
  // 缓存命中则不重复拉取
  if (groupVehiclesMap[targetKey]) return
  try {
    const list = await getGroupVehiclesUnified(groupId)
    groupVehiclesMap[targetKey] = (Array.isArray(list) ? list : []).map(normalizeVehicle)
  } catch (e) {
    console.error('拉取车组车辆失败', e)
    groupVehiclesMap[targetKey] = []
  }
}

const isGroupExpanded = (groupId) => expandedGroupIds.value.some(id => normalizeGroupKey(id) === normalizeGroupKey(groupId))

/* ========== 获取车组关联的车辆列表（同步：从缓存读取） ========== */
const getGroupVehicles = (groupId) => groupVehiclesMap[normalizeGroupKey(groupId)] || []

/* ========== 总结果数 ========== */
const totalResults = computed(() =>
  carriageResults.value.length + groupResults.value.length + trainNoResults.value.length
)

/* ========== 最优命中类型中文标签 ========== */
const bestMatchTypeLabel = computed(() => {
  const t = bestMatch.value?.['类型']
  if (t === 'vehicle') return '车厢'
  if (t === 'group') return '车组'
  if (t === 'trainNo') return '车次'
  return '匹配'
})

/* ========== 高亮关键词 ========== */
const highlightText = (text) => {
  if (!text || !keyword.value.trim()) return text || ''
  const kw = keyword.value.trim()
  const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return String(text).replace(regex, '<span class="highlight-kw">$1</span>')
}

/** 通过车组id 在车组结果集中找到对应行（视图字段已带股道、检修状态等） */
const findGroupRow = (groupId) => {
  const key = normalizeGroupKey(groupId)
  return groupResults.value.find(g => normalizeGroupKey(g.id ?? g['车组id']) === key) || null
}

const getGroupRoadName = (groupId) => findGroupRow(groupId)?.['股道名称'] || '未分配股道'

const getGroupStatusText = (groupId) => findGroupRow(groupId)?.['检修状态'] || '未配置'

const getGroupVehicleCount = (groupId) => {
  // 优先用视图聚合的实体车辆数；展开后也可用缓存中已拉到的实际行数
  const row = findGroupRow(groupId)
  if (row && row['实体车辆数'] != null) return row['实体车辆数']
  return getGroupVehicles(groupId).length
}

const getGroupStatusClass = (groupId) => {
  const statusText = String(findGroupRow(groupId)?.['检修状态'] || '')
  if (!statusText || statusText === '未配置') return 'idle'
  if (/正常|在用|完好|上线/.test(statusText)) return 'success'
  if (/故障|异常|停用/.test(statusText)) return 'danger'
  if (/检修|修|保养|整备/.test(statusText)) return 'warning'
  return 'info'
}

/** 暴露 loadData 供父组件调用 */
defineExpose({ loadData })
</script>

<template>
  <div class="search-tab">
    <!-- 搜索控制卡片 -->
    <div class="search-toolbar-card">
      <div class="toolbar-header">
        <span class="toolbar-title">⚡ 智能综合搜索引擎</span>
        <span class="toolbar-subtitle">支持在库与基础大数据的全维匹配查询</span>
      </div>
      <div class="search-row-layout">
        <!-- 搜索类别选择 -->
        <el-radio-group v-model="searchType" size="large" class="type-selector">
          <el-radio-button v-for="t in searchTypes" :key="t.value" :value="t.value">
            {{ t.label }}
          </el-radio-button>
        </el-radio-group>
        
        <!-- 搜索框与按钮组 -->
        <div class="input-action-group">
          <el-input
            v-model="keyword"
            :placeholder="searchType === 'carriage' ? '输入车厢号（支持模糊）' : searchType === 'group' ? '输入车组号（支持模糊）' : searchType === 'trainNo' ? '输入车次号' : searchType === 'type' ? '输入车型（如25G、CRH6A）' : '输入车厢号/车组号/车次号/车型'"
            clearable
            class="search-input-box"
            @keyup.enter="handleSearch"
            @input="handleKeywordInput"
            @clear="handleKeywordInput"
          >
            <template #prefix>
              <el-icon class="search-box-icon"><Search /></el-icon>
            </template>
          </el-input>
          
          <el-button type="primary" size="large" class="search-btn" @click="handleSearch" :loading="loading">
            <el-icon class="mr-1"><Search /></el-icon>开始搜索
          </el-button>
          
          <el-button size="large" class="reset-btn" @click="handleReset">
            <el-icon class="mr-1"><RefreshLeft /></el-icon>重置
          </el-button>
        </div>
      </div>
    </div>

    <!-- 搜索结果统计 -->
    <div v-if="totalResults > 0" class="result-summary-bar">
      <div class="summary-left">
        <span class="summary-label">检索完成：</span>
        <span>共命中 <strong>{{ totalResults }}</strong> 条记录</span>
      </div>
      <div class="summary-tags">
        <el-tag v-if="carriageResults.length > 0" class="meta-tag blue">
          车厢号: {{ carriageResults.length }} 辆
        </el-tag>
        <el-tag v-if="groupResults.length > 0" class="meta-tag orange">
          车组号: {{ groupResults.length }} 列
        </el-tag>
        <el-tag v-if="trainNoResults.length > 0" class="meta-tag green">
          车次: {{ trainNoResults.length }} 趟
        </el-tag>
      </div>
    </div>

    <!-- 最优命中徽标条 -->
    <div v-if="bestMatch" class="best-match-bar" :class="`type-${bestMatch['类型']}`">
      <div class="best-match-side">
        <span class="best-match-flag">最优命中</span>
        <span class="best-match-type-tag">{{ bestMatchTypeLabel }}</span>
      </div>
      <div class="best-match-main">
        <span class="best-match-title" v-html="highlightText(bestMatch['标题'])"></span>
        <span v-if="bestMatch['描述']" class="best-match-desc">{{ bestMatch['描述'] }}</span>
      </div>
      <el-button size="small" link @click="bestMatch = null" class="best-match-close">收起</el-button>
    </div>

    <!-- 搜索结果区域 -->
    <div class="result-area-view" v-loading="loading">

      <!-- 空状态（无匹配）：仅在真正发起过一次搜索后才显示 -->
      <div v-if="!loading && hasSearched && totalResults === 0 && keyword.trim()" class="empty-glass-card">
        <div class="empty-icon-wrap">
          <el-icon :size="54" color="#e6a23c"><Search /></el-icon>
        </div>
        <h3>未检索到匹配数据</h3>
        <p>没有找到与 "<strong>{{ keyword }}</strong>" 匹配的结果</p>
        <p class="empty-hint">请尝试缩短关键字，或切换更宽泛的“全部”检索类别</p>
      </div>

      <!-- 引导状态：未搜索 或 已输入关键字但未点搜索 -->
      <div v-if="!loading && !hasSearched && totalResults === 0" class="empty-glass-card initial">
        <div class="empty-icon-wrap info">
          <el-icon :size="54" color="#409eff"><Search /></el-icon>
        </div>
        <h3>系统已准备就绪</h3>
        <p>请输入列车号、车组号、车次号或车型关键字进行全库搜索</p>
        <div class="quick-hints">
          <span class="hint-pill">车厢示例：300101</span>
          <span class="hint-pill">车组示例：CR200J-3001</span>
          <span class="hint-pill">车型示例：CR200JS</span>
          <span class="hint-pill">车次示例：D123</span>
        </div>
      </div>

      <!-- 车厢结果卡片 -->
      <div v-if="carriageResults.length > 0" class="result-card-box">
        <div class="card-head border-blue">
          <div class="head-left">
            <div class="head-icon-circle bg-blue">
              <el-icon><Van /></el-icon>
            </div>
            <span class="card-title">匹配车厢详情</span>
          </div>
          <el-tag size="small" effect="dark" type="primary" class="count-badge">{{ carriageResults.length }} 辆车</el-tag>
        </div>
        <div class="card-body">
          <el-table :data="carriageResults" stripe border max-height="360" class="custom-beautiful-table">
            <el-table-column label="车号" width="160">
              <template #default="{ row }">
                <div class="carriage-code">
                  <span class="carriage-dot"></span>
                  <span class="code-text" v-html="highlightText(row['车号'])"></span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="车型" width="120">
              <template #default="{ row }">
                <span class="model-badge" v-html="highlightText(row['车型'])"></span>
              </template>
            </el-table-column>
            <el-table-column prop="车种" label="车种" width="120" />
            <el-table-column prop="状态" label="状态" width="120">
              <template #default="{ row }">
                <span :class="['status-indicator', row['状态'] === '正常' ? 'success' : row['状态'] === '检修' ? 'warning' : 'info']">
                  {{ row['状态'] || '未知' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="走行公里" label="走行公里" width="140">
              <template #default="{ row }">
                <span class="km-highlight">{{ row['走行公里'] ? Number(row['走行公里']).toLocaleString() + ' km' : '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="A1D1修日期" label="A1修日期" width="130" />
            <el-table-column prop="A2D2修日期" label="A2修日期" width="130" />
            <el-table-column prop="A3D3修日期" label="A3修日期" width="130" />
            <el-table-column prop="A4D4修日期" label="A4修日期" width="130" />
          </el-table>
        </div>
      </div>

      <!-- 车组结果卡片 -->
      <div v-if="groupResults.length > 0" class="result-card-box">
        <div class="card-head border-orange">
          <div class="head-left">
            <div class="head-icon-circle bg-orange">
              <el-icon><SetUp /></el-icon>
            </div>
            <span class="card-title">匹配车组编组列表</span>
          </div>
          <el-tag size="small" effect="dark" type="warning" class="count-badge">{{ groupResults.length }} 列车</el-tag>
        </div>
        <div class="card-body">
          <div class="group-summary-list">
            <div v-for="row in groupResults" :key="row.id" class="group-summary-item">
              <div class="group-summary-card" :class="{ expanded: isGroupExpanded(row.id) }" @click="toggleGroupExpand(row.id)">
                <div class="group-card-top">
                  <div class="group-card-id">
                    <span class="group-card-label">车组号</span>
                    <span class="group-no-text" v-html="highlightText(row['车组号'])"></span>
                  </div>
                  <div class="group-card-tags">
                    <span class="model-badge yellow" v-html="highlightText(row['车型'])"></span>
                    <span class="count-highlight">{{ row['编组'] || '-' }} 辆编组</span>
                  </div>
                </div>
                <div class="group-card-meta">
                  <div class="group-meta-pill road">
                    <el-icon><Guide /></el-icon>
                    <span class="group-meta-key">股道</span>
                    <strong>{{ getGroupRoadName(row.id) }}</strong>
                  </div>
                  <div :class="['group-meta-pill', 'status', `status-${getGroupStatusClass(row.id)}`]">
                    <span class="status-light"></span>
                    <span class="group-meta-key">检修状态</span>
                    <strong>{{ getGroupStatusText(row.id) }}</strong>
                  </div>
                  <div class="group-meta-pill neutral">
                    <span class="group-meta-key">实体车辆</span>
                    <strong>{{ getGroupVehicleCount(row.id) }} 辆</strong>
                  </div>
                </div>
                <div class="group-card-action">
                  <el-tag size="small" :type="isGroupExpanded(row.id) ? 'warning' : 'info'" effect="plain">
                    {{ isGroupExpanded(row.id) ? '点击收起车辆清单' : '点击展开车辆清单' }}
                  </el-tag>
                </div>
              </div>

              <div v-if="isGroupExpanded(row.id)" class="nested-group-expand-box">
                <div class="nested-header">
                  <div class="title-wrap">
                    <span class="group-num-label">车组 <strong>{{ row['车组号'] }}</strong> 编组车辆清单</span>
                  </div>
                  <div class="meta-wrap">
                    <span class="meta-item-lbl road">
                      <el-icon><Guide /></el-icon>
                      所在股道：<strong>{{ getGroupRoadName(row.id) }}</strong>
                    </span>
                    <span :class="['meta-item-lbl', 'status', `status-${getGroupStatusClass(row.id)}`]">
                      <span class="status-light"></span>
                      检修状态：<strong>{{ getGroupStatusText(row.id) }}</strong>
                    </span>
                  </div>
                </div>
                <el-table :data="getGroupVehicles(row.id)" stripe border size="small" class="nested-expand-table"
                  :max-height="400"
                  v-if="getGroupVehicles(row.id).length > 0">
                  <el-table-column prop="车号" label="车号" width="150" />
                  <el-table-column prop="车型" label="车型" width="110" />
                  <el-table-column prop="车种" label="车种" width="110" />
                  <el-table-column prop="状态" label="状态" width="110">
                    <template #default="{ row: r }">
                      <span :class="['status-indicator', r['状态'] === '正常' ? 'success' : r['状态'] === '检修' ? 'warning' : 'info']">
                        {{ r['状态'] || '未知' }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="走行公里" label="走行公里" width="130">
                    <template #default="{ row: r }">
                      {{ r['走行公里'] ? Number(r['走行公里']).toLocaleString() + ' km' : '-' }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="A1D1修日期" label="A1修日期" width="120" />
                  <el-table-column prop="A2D2修日期" label="A2修日期" width="120" />
                  <el-table-column prop="A3D3修日期" label="A3修日期" width="120" />
                  <el-table-column prop="A4D4修日期" label="A4修日期" width="120" />
                </el-table>
                <div v-else class="nested-expand-empty">
                  <el-icon :size="20"><InfoFilled /></el-icon>
                  <span>该车组未分配实体车辆，请在“车组编组”页管理关联。</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 车次结果卡片 -->
      <div v-if="trainNoResults.length > 0" class="result-card-box">
        <div class="card-head border-green">
          <div class="head-left">
            <div class="head-icon-circle bg-green">
              <el-icon><Tickets /></el-icon>
            </div>
            <span class="card-title">匹配车次行车计划</span>
          </div>
          <el-tag size="small" effect="dark" type="success" class="count-badge">{{ trainNoResults.length }} 趟</el-tag>
        </div>
        <div class="card-body">
          <el-table :data="trainNoResults" stripe border max-height="360" class="custom-beautiful-table">
            <el-table-column label="车次" width="160">
              <template #default="{ row }">
                <div class="train-no-cell">
                  <span class="train-no-badge" v-html="highlightText(row['车次'] || row['车次号'] || row['trainNo'])"></span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="起始区间" label="起始区间" min-width="180" show-overflow-tooltip />
            <el-table-column prop="备注" label="备注" min-width="160" show-overflow-tooltip />
            <el-table-column label="关联车组" width="110">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" type="warning">{{ row['关联车组数'] || 0 }} 列</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="关联车组号列表" label="关联车组号" min-width="180" show-overflow-tooltip />
            <el-table-column prop="关联车型列表" label="关联车型" min-width="140" show-overflow-tooltip />
            <el-table-column prop="关联股道列表" label="关联股道" min-width="140" show-overflow-tooltip />
            <el-table-column prop="关联检修状态列表" label="检修状态" min-width="140" show-overflow-tooltip />
          </el-table>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* 整个容器 */
.search-tab {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  padding: 4px 8px 12px 4px;
}
.search-tab::-webkit-scrollbar {
  width: 8px;
}
.search-tab::-webkit-scrollbar-track {
  background: transparent;
}
.search-tab::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.65);
  border-radius: 999px;
}
.search-tab::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.85);
}

/* 顶部搜索引擎大卡片 */
.search-toolbar-card {
  margin-bottom: 20px;
  padding: 24px 28px;
  background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 60%, #fffbf5 100%);
  border: 1px solid #d4e6f7;
  border-radius: 12px;
  box-shadow: 
    0 4px 20px -2px rgba(64, 158, 255, 0.08),
    0 2px 6px -1px rgba(0, 0, 0, 0.02);
}
.toolbar-header {
  margin-bottom: 18px;
}
.toolbar-title {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #1e3a8a;
  letter-spacing: 0.04em;
}
.toolbar-subtitle {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}
.search-row-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.type-selector :deep(.el-radio-button__inner) {
  padding: 10px 24px;
  font-size: 13px;
  font-weight: 600;
}
.input-action-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.search-input-box {
  flex: 1;
  min-width: 280px;
  max-width: 580px;
}
.search-input-box :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #cbd5e1;
  border-radius: 8px;
  padding: 4px 14px;
  background-color: #ffffff;
  transition: all 0.2s;
}
.search-input-box :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #3b82f6;
}
.search-input-box :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
.search-box-icon {
  color: #3b82f6;
  font-weight: bold;
}
.search-btn {
  border-radius: 8px;
  font-weight: 600;
  padding: 10px 24px;
}
.reset-btn {
  border-radius: 8px;
  font-weight: 500;
  padding: 10px 20px;
  color: #475569;
}

/* 结果统计条 */
.result-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 12px 20px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  flex-wrap: wrap;
  gap: 10px;
}
.summary-left {
  font-size: 14px;
  color: #334155;
}
.summary-left strong {
  color: #3b82f6;
  font-size: 16px;
}
.summary-tags {
  display: flex;
  gap: 8px;
}
.meta-tag {
  font-weight: 600;
  border-radius: 6px;
  padding: 4px 10px;
}
.meta-tag.blue { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.meta-tag.orange { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
.meta-tag.green { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }

/* ===== 最优命中徽标条 ===== */
.best-match-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  padding: 12px 18px;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 1px solid #fcd34d;
  border-left: 4px solid #f59e0b;
  border-radius: 10px;
  box-shadow: 0 2px 8px -2px rgba(245, 158, 11, 0.18);
  flex-wrap: wrap;
}
.best-match-bar.type-vehicle { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-color: #93c5fd; border-left-color: #3b82f6; }
.best-match-bar.type-group { background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border-color: #fdba74; border-left-color: #f97316; }
.best-match-bar.type-trainNo { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-color: #86efac; border-left-color: #22c55e; }
.best-match-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.best-match-flag {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #92400e;
  background: #ffffff;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid #fde68a;
}
.best-match-bar.type-vehicle .best-match-flag { color: #1d4ed8; border-color: #bfdbfe; }
.best-match-bar.type-group .best-match-flag { color: #c2410c; border-color: #fed7aa; }
.best-match-bar.type-trainNo .best-match-flag { color: #15803d; border-color: #bbf7d0; }
.best-match-type-tag {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  background: rgba(255, 255, 255, 0.7);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}
.best-match-main {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}
.best-match-title {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  font-family: monospace;
  letter-spacing: 0.5px;
}
.best-match-desc {
  font-size: 12px;
  color: #475569;
}
.best-match-close {
  margin-left: auto;
  font-size: 12px;
  color: #64748b;
}

/* 结果分区卡片 */
.result-card-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  margin-bottom: 24px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #fafcff;
  border-bottom: 1px solid #e2e8f0;
  border-radius: 12px 12px 0 0;
}
.card-head.border-blue { border-left: 4px solid #3b82f6; }
.card-head.border-orange { border-left: 4px solid #f97316; }
.card-head.border-green { border-left: 4px solid #10b981; }

.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head-icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: white;
  font-size: 14px;
}
.head-icon-circle.bg-blue { background: #3b82f6; }
.head-icon-circle.bg-orange { background: #f97316; }
.head-icon-circle.bg-green { background: #10b981; }

.card-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}
.count-badge {
  font-weight: 600;
  border-radius: 6px;
}
.card-body {
  padding: 16px 20px;
}

/* 统一精致表格样式 */
.custom-beautiful-table {
  border-radius: 8px;
  overflow: hidden;
}
.custom-beautiful-table :deep(th.el-table__cell) {
  background-color: #f8fafc !important;
  color: #475569;
  font-weight: 700;
  font-size: 13px;
  padding: 10px 0;
}
.custom-beautiful-table :deep(.el-table__row) {
  transition: all 0.2s;
}

/* 表格内字段强化 */
.carriage-code {
  display: flex;
  align-items: center;
  gap: 8px;
}
.carriage-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #3b82f6;
}
.code-text {
  font-weight: 700;
  color: #1e293b;
  font-family: monospace;
  font-size: 14px;
}
.model-badge {
  background: #f1f5f9;
  color: #334155;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.model-badge.yellow {
  background: #fef3c7;
  color: #d97706;
}
.group-no-text {
  font-weight: 700;
  color: #d97706;
  font-size: 14px;
  font-family: monospace;
}
.km-highlight {
  font-family: monospace;
  font-weight: 600;
  color: #475569;
}
.count-highlight {
  font-weight: 600;
  color: #0f172a;
}
.group-summary-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.group-summary-item {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
}
.group-summary-card {
  padding: 16px 18px;
  cursor: pointer;
  background: linear-gradient(135deg, #fff7ed 0%, #ffffff 55%, #f8fafc 100%);
  transition: all 0.2s;
}
.group-summary-card:hover {
  background: linear-gradient(135deg, #ffedd5 0%, #ffffff 60%, #f8fafc 100%);
}
.group-summary-card.expanded {
  box-shadow: inset 0 -1px 0 #e2e8f0;
}
.group-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.group-card-id {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.group-card-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}
.group-card-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.group-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}
.group-meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
}
.group-meta-pill.road {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.group-meta-pill.neutral {
  background: #f8fafc;
  color: #475569;
}
.group-meta-pill.status {
  padding-left: 10px;
}
.group-meta-key {
  color: #64748b;
  font-weight: 500;
}
.group-card-action {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
.status-indicator {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.status-indicator.success { background-color: #dcfce7; color: #166534; }
.status-indicator.warning { background-color: #fef3c7; color: #92400e; }
.status-indicator.info { background-color: #f1f5f9; color: #475569; }
.status-light {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.16);
}
.status-success .status-light {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18), 0 0 8px rgba(34, 197, 94, 0.45);
}
.status-warning .status-light {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18), 0 0 8px rgba(245, 158, 11, 0.45);
}
.status-danger .status-light {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16), 0 0 8px rgba(239, 68, 68, 0.45);
}
.status-info .status-light {
  background: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16), 0 0 8px rgba(59, 130, 246, 0.45);
}
.status-idle .status-light {
  background: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.16);
}

.road-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #0284c7;
}
.road-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #0284c7;
  box-shadow: 0 0 6px #38bdf8;
}

.train-no-cell {
  display: inline-block;
}
.train-no-badge {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  font-weight: 700;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 6px;
  font-family: monospace;
}
.time-text {
  font-family: monospace;
  font-weight: 600;
  color: #334155;
}

/* 折叠车组细节渲染 */
.nested-group-expand-box {
  padding: 16px 24px;
  background: #f8fafc;
  border-top: 1px dashed #e2e8f0;
  border-bottom: 1px dashed #e2e8f0;
}
.nested-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 12px;
}
.group-num-label {
  font-size: 13px;
  color: #334155;
}
.group-num-label strong {
  color: #ea580c;
  font-size: 14px;
}
.meta-wrap {
  display: flex;
  gap: 16px;
  align-items: center;
}
.meta-item-lbl {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.meta-item-lbl.road { color: #0284c7; }
.meta-item-lbl.status { color: #dc2626; }
.nested-expand-table {
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
}
.nested-expand-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #64748b;
  font-size: 13px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

/* 高亮样式 */
:deep(.highlight-kw) {
  background: #fef08a !important;
  color: #ca8a04 !important;
  font-weight: 800;
  padding: 0 4px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px #fde047;
}

/* 玻璃拟态空状态 */
.empty-glass-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 30px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  max-width: 600px;
  margin: 40px auto;
  text-align: center;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.02);
}
.empty-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #fffbeb;
  margin-bottom: 16px;
}
.empty-icon-wrap.info {
  background: #eff6ff;
}
.empty-glass-card h3 {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 8px;
}
.empty-glass-card p {
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}
.empty-hint {
  color: #94a3b8;
  font-size: 11px !important;
  margin-top: 4px !important;
}

.quick-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 16px;
}
.hint-pill {
  background: #f1f5f9;
  color: #475569;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}
.hint-pill:hover {
  background: #e2e8f0;
  color: #0f172a;
}

/* 交互行 */
:deep(.expandable-group-row) {
  cursor: pointer;
}
:deep(.expandable-group-row:hover td) {
  background-color: #f0f7ff !important;
}
</style>
