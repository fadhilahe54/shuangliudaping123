<!--
  TrainGroupSlotCell.vue -- 车组编组单元格
  用于 TrainGroupInfoTab 中的拖拽式车组编组界面：
    - 每个单元格代表车组中的一个位序（slot）
    - 支持将车辆拖入/拖出单元格完成编组操作
    - 有车辆时显示车号和车种，可拖动移位或点击移除
    - 搜索命中时显示绿色脉动高亮边框
  使用方：TrainGroupInfoTab.vue
-->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  slot:           { type: Number,          required: true  }, // 位序编号（1-based，对应车厢顺序）
  groupId:        { type: [Number,String], required: true  }, // 所属车组 ID
  trainId:        { type: [Number,String], default: null   }, // 当前格位中的车辆 ID（null 表示空位）
  dragOver:       { type: Boolean,         default: false  }, // 是否正在被拖拽悬停
  trainName:      { type: String,          default: ''     }, // 车辆完整名称（tooltip 显示）
  trainShortName: { type: String,          default: ''     }, // 车辆缩写（格位内显示）
  trainKindLabel: { type: String,          default: ''     }, // 车种标签（如 YZ/YW/RW）
  highlight:      { type: Boolean,         default: false  }, // 搜索命中高亮
})

// 向父组件传递拖拽和移除事件，父组件统一处理编组数据更新
const emit = defineEmits([
  'drag-enter',         // 有物体拖入此格位
  'drag-over',          // 物体在此格位上方移动
  'drag-leave',         // 物体离开此格位
  'drop',               // 物体放置到此格位
  'drag-start-from-slot', // 从此格位开始拖拽车辆
  'drag-end',           // 拖拽结束（无论是否成功放置）
  'remove',             // 点击移除按钮，将车辆从此格位移出
])

// 格位是否已有车辆
const hasTrain = computed(() => props.trainId != null)

// ---- 拖拽事件转发（携带格位标识信息给父组件） ----
const handleDragEnter = () => emit('drag-enter', props.groupId, props.slot)
const handleDragOver  = (e) => emit('drag-over', e, props.groupId, props.slot)
const handleDragLeave = (e) => emit('drag-leave', e, props.groupId, props.slot)
const handleDrop      = (e) => emit('drop', e, props.groupId, props.slot)

// 从本格位开始拖拽，携带当前车辆 ID 供父组件记录拖拽来源
const handleDragStartFromSlot = (e) => emit('drag-start-from-slot', e, props.trainId, props.groupId, props.slot)
const handleDragEnd = () => emit('drag-end')

// 移除当前格位的车辆
const handleRemove = () => emit('remove', props.groupId, props.slot)
</script>

<template>
  <div
    class="slot-cell"
    :class="{
      'slot-occupied': hasTrain,
      'slot-drag-over': dragOver,
      'slot-highlight': highlight,
    }"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="cell-number">{{ slot }}</div>
    <template v-if="hasTrain">
      <div
        class="cell-content"
        draggable="true"
        @dragstart="handleDragStartFromSlot"
        @dragend="handleDragEnd"
      >
        <div class="cell-name" :title="trainName">
          {{ trainShortName }}
        </div>
        <div class="cell-kind">{{ trainKindLabel }}</div>
      </div>
      <button class="cell-remove" @click.stop="handleRemove" title="移出">✕</button>
    </template>
    <template v-else>
      <div class="cell-empty">—</div>
    </template>
  </div>
</template>

<style scoped>
/* ========== 编组槽位单元格 ========== */
/* 固定宽度用于横向 20 槽位排布，虚线边框表示当前槽位可接收拖拽车辆 */
.slot-cell {
  min-width: 54px;
  width: 54px;
  min-height: 58px;
  border: 2px dashed #d6c9a8;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  transition: all 0.15s;
  background: #fff;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

/* 已占用状态：实线金色边框，表示槽位中已经绑定车辆 */
.slot-cell.slot-occupied {
  border-style: solid;
  border-color: #fbbf24;
  background: #fffbeb;
}

/* 拖拽悬停状态：当车辆拖到槽位上方时高亮，提示松手可放置 */
.slot-cell.slot-drag-over {
  border-color: #f59e0b;
  background: #fef3c7;
  box-shadow: 0 0 0 2px rgba(245,158,11,0.3);
}

/* 搜索命中高亮：绿色边框 + 脉动 */
.slot-cell.slot-highlight {
  border-color: #22c55e !important;
  background: #dcfce7 !important;
  box-shadow: 0 0 0 3px rgba(34,197,94,0.45);
  animation: slot-pulse 1.4s ease-in-out infinite;
  z-index: 2;
}
@keyframes slot-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.45); }
  50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0.15); }
}

/* 槽位序号条：显示车辆在编组中的物理顺序（1~20） */
.cell-number {
  font-size: 9px;
  font-weight: 700;
  color: #a16207;
  line-height: 1;
  width: 100%;
  text-align: center;
  background: #fef3c7;
  padding: 2px 0;
}

/* 已占用时序号条颜色加深，和车辆内容区形成整体卡片感 */
.slot-cell.slot-occupied .cell-number {
  background: #fde68a;
}

/* 槽位内容区：承载车辆名称/类型，设置 grab 光标提示可再次拖拽调整位置 */
.cell-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  justify-content: center;
  width: 100%;
  cursor: grab;
  user-select: none;
  padding: 2px;
  /* mobile-drag-drop polyfill 要求 draggable 元素禁用浏览器默认手势，才能识别长按拖拽 */
  touch-action: none;
  -webkit-user-drag: element;
}

/* 鼠标按下拖拽时切换 grabbing 光标，增强拖拽反馈 */
.cell-content:active {
  cursor: grabbing;
}

/* 车辆名称：空间有限时单行省略，避免撑开固定槽位宽度 */
.cell-name {
  font-size: 10px;
  font-weight: 700;
  color: #78350f;
  text-align: center;
  line-height: 1.2;
  max-width: 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 车辆类型/车型：作为辅助信息展示，字号更小、颜色更弱 */
.cell-kind {
  font-size: 8px;
  color: #a16207;
  text-align: center;
  max-width: 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

/* 移除按钮：默认隐藏，避免影响槽位阅读；悬停槽位时显示 */
.cell-remove {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 14px;
  height: 14px;
  border-radius: 0 6px 0 6px;
  border: none;
  background: #fee2e2;
  color: #ef4444;
  font-size: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 1;
}

/* 悬停整个槽位时展示删除入口 */
.slot-cell:hover .cell-remove {
  opacity: 1;
}

/* 删除按钮悬停时使用更强红色，提示这是解除绑定操作 */
.cell-remove:hover {
  background: #fca5a5;
  color: #dc2626;
}

/* 空槽位占位符：显示加号/提示符，表示当前位置未绑定车辆 */
.cell-empty {
  font-size: 12px;
  color: #d6c9a8;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
