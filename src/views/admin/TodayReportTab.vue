<!--
  今日填报 - 聚合页
  功能：将每日需要填报/拖拽、直接影响大屏显示的6个模块集中在一个页面操作
  包含：总体信息 / 今日值班 / 状态分配 / 股道编组 / 车组编组 / 交路关联
-->
<script setup>
import { ref, nextTick } from 'vue'
import SInfoTab          from './SInfoTab.vue'
import TodayDutyTab      from './TodayDutyTab.vue'
import TrainStatusInfoTab from './TrainStatusInfoTab.vue'
import StockRoadInfoTab  from './StockRoadInfoTab.vue'
import TrainGroupInfoTab from './TrainGroupInfoTab.vue'
import RouteBindTab      from './RouteBindTab.vue'

/* ========== 子组件 ref ========== */
const sInfoRef          = ref()
const todayDutyRef      = ref()
const trainStatusInfoRef = ref()
const stockRoadInfoRef  = ref()
const trainGroupInfoRef = ref()
const routeBindRef      = ref()

/* ========== 当前激活 tab ========== */
const activeInner = ref('sInfo')

/** 切换内部 tab 时加载对应数据 */
const handleTabChange = (name) => {
  nextTick(() => {
    switch (name) {
      case 'sInfo':          sInfoRef.value?.loadData(); break
      case 'todayDuty':      todayDutyRef.value?.loadData(); break
      case 'trainStatusInfo':trainStatusInfoRef.value?.loadData(); break
      case 'stockRoadInfo':  stockRoadInfoRef.value?.loadData(); break
      case 'trainGroupInfo': trainGroupInfoRef.value?.loadData(); break
      case 'routeBind':      routeBindRef.value?.loadData(); break
    }
  })
}

/** 外部（AdminView）调用的统一加载入口 */
const loadData = () => {
  handleTabChange(activeInner.value)
}

defineExpose({ loadData })
</script>

<template>
  <div class="today-report-wrap">
    <!-- 顶部说明条 -->
    <div class="report-banner">
      <el-icon class="banner-icon"><EditPen /></el-icon>
      <span class="banner-title">今日填报</span>
      <span class="banner-desc">以下内容每日开班前填写/拖拽完成，实时同步到大屏显示</span>
    </div>

    <el-tabs
      v-model="activeInner"
      type="border-card"
      class="report-tabs"
      @tab-change="handleTabChange"
    >
      <!-- 1. 总体信息 -->
      <el-tab-pane name="sInfo">
        <template #label>
          <el-icon class="tab-icon"><DataAnalysis /></el-icon>
          <span>总体信息</span>
        </template>
        <div class="tab-hint">填写今日上线/整修/扣修数量及当班重点信息，显示在大屏「统计信息」面板</div>
        <SInfoTab ref="sInfoRef" />
      </el-tab-pane>

      <!-- 2. 今日值班 -->
      <el-tab-pane name="todayDuty">
        <template #label>
          <el-icon class="tab-icon"><Avatar /></el-icon>
          <span>今日值班</span>
        </template>
        <div class="tab-hint">拖拽人员到对应岗位，显示在大屏「今日值班」面板</div>
        <TodayDutyTab ref="todayDutyRef" />
      </el-tab-pane>

      <!-- 3. 状态分配 -->
      <el-tab-pane name="trainStatusInfo">
        <template #label>
          <el-icon class="tab-icon"><Tools /></el-icon>
          <span>状态分配</span>
        </template>
        <div class="tab-hint">拖拽车组到检修状态槽位，显示在大屏「检修状态」面板</div>
        <TrainStatusInfoTab ref="trainStatusInfoRef" />
      </el-tab-pane>

      <!-- 4. 股道编组 -->
      <el-tab-pane name="stockRoadInfo">
        <template #label>
          <el-icon class="tab-icon"><Grid /></el-icon>
          <span>股道编组</span>
        </template>
        <StockRoadInfoTab ref="stockRoadInfoRef" />
      </el-tab-pane>

      <!-- 5. 车组编组 -->
      <el-tab-pane name="trainGroupInfo">
        <template #label>
          <el-icon class="tab-icon"><Box /></el-icon>
          <span>车组编组</span>
        </template>
        <div class="tab-hint">拖拽车辆到车组中，管理车组与车辆的编组关系</div>
        <TrainGroupInfoTab ref="trainGroupInfoRef" />
      </el-tab-pane>

      <!-- 6. 交路关联 -->
      <el-tab-pane name="routeBind">
        <template #label>
          <el-icon class="tab-icon"><Connection /></el-icon>
          <span>交路关联</span>
        </template>
        <div class="tab-hint">关联交路、车次与车组，显示在大屏「交路/车组」面板</div>
        <RouteBindTab ref="routeBindRef" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.today-report-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 6px;
}

/* 顶部说明条 */
.report-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%);
  border: 1px solid #fde68a;
  border-radius: 8px;
  flex-shrink: 0;
}
.banner-icon {
  font-size: 18px;
  color: #d97706;
}
.banner-title {
  font-size: 15px;
  font-weight: 700;
  color: #92400e;
}
.banner-desc {
  font-size: 12px;
  color: #a16207;
}

/* 内部 tabs */
.report-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.report-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 8px 12px;
  /* 弹性布局：垂直排列 */
  display: flex;
  /* 方向：列方向 */
  flex-direction: column;
}

/* 报告标签页头部（Element Plus 深度选择器） */
.report-tabs :deep(.el-tabs__header) {
  /* 不收缩：固定宽度 */
  flex-shrink: 0;
}

/* 报告标签页内容（Element Plus 深度选择器） */
.report-tabs :deep(.el-tab-pane) {
  /* 弹性：1，占据剩余空间 */
  flex: 1;
  /* 最小高度：0，允许缩小 */
  min-height: 0;
  /* 弹性布局：垂直排列 */
  display: flex;
  /* 方向：列方向 */
  flex-direction: column;
}

/* 标签页提示信息（Element Plus 深度选择器） */
.report-tabs :deep(.el-tab-pane > .tab-hint) {
  /* 不收缩：固定宽度 */
  flex-shrink: 0;
}

/* 拖拽布局和股道可视化（Element Plus 深度选择器） */
.report-tabs :deep(.el-tab-pane > .drag-layout),
.report-tabs :deep(.el-tab-pane > .stock-road-visual) {
  /* 弹性：1，占据剩余空间 */
  flex: 1;
  /* 最小高度：0，允许缩小 */
  min-height: 0;
}

/* 非拖拽布局的标签页内容（如 SInfoTab）允许自身滚动 */
.report-tabs :deep(.el-tab-pane > div:not(.tab-hint):not(.drag-layout):not(.stock-road-visual)) {
  /* 弹性：1，占据剩余空间 */
  flex: 1;
  /* 最小高度：0，允许缩小 */
  min-height: 0;
  /* 垂直溢出：自动滚动 */
  overflow-y: auto;
}

/* ========== 标签页图标样式 ========== */
/* 标签页图标 */
.tab-icon {
  /* 右边距：4px */
  margin-right: 4px;
  /* 垂直对齐：居中 */
  vertical-align: middle;
}

/* ========== 标签页提示条样式 ========== */
/* 每个 tab 内的提示条 */
.tab-hint {
  /* 字号：12px */
  font-size: 12px;
  /* 文字颜色：深黄色 */
  color: #a16207;
  /* 背景：淡黄色 */
  background: #fffbeb;
  /* 左边框：3px 黄色 */
  border-left: 3px solid #f59e0b;
  /* 内边距：6px 12px */
  padding: 6px 12px;
  /* 圆角：右侧 4px */
  border-radius: 0 4px 4px 0;
  /* 下边距：14px */
  margin-bottom: 14px;
}
</style>
