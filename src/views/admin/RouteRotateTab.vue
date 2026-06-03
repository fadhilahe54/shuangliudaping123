<!--
  RouteRotateTab.vue -- 交路轮转配置管理
  用于配置定期自动轮换车组插入交路的规则，包括：
    - 查看/新增/删除轮转配置（选择车次 + 车组 + 轮转间隔）
    - 从已有交路关联一键导入轮转初始配置
    - 预览某条配置下次轮转的结果
    - 立即执行全部或单个轮转（手动触发提前换组）
  使用方：AdminView.vue 交路管理 Tab
-->
<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
// 交路轮转配置相关接口
import {
  getAllRouteRotateConfig,       // 获取所有轮转配置
  saveRouteRotateConfig,         // 新增/更新轮转配置
  deleteRouteRotateConfigById,   // 删除轮转配置
  importRouteRotateFromBind,     // 从交路关联一键导入
  previewNextRouteRotate,        // 预览下次轮转结果
  rotateRouteNow,                // 立即执行全部轮转
  rotateRouteOne,                // 立即执行单个轮转
  getAllTrainNumber,              // 车次列表（下拉选择）
  getAllTrainGroup,               // 车组列表（下拉选择）
} from '../../api/dispatchApi.js'
import { logOperation } from '../../api/log.js'

// 轮转配置列表
const list = ref([])

// 车次列表（下拉选择）
const trainNumberList = ref([])

// 交路列表（下拉选择）
const routeList = ref([])

// 表格加载状态
const loading = ref(false)

// 保存操作加载状态
const saving = ref(false)

// 新增/编辑对话框显示状态
const dialogVisible = ref(false)

// 预览对话框显示状态
const previewVisible = ref(false)

// 预览加载状态
const previewLoading = ref(false)

// 预览数据
const previewData = ref(null)

// 轮转配置表单数据
const form = ref({ id: null, '车次id': null, '启用状态': true, '上次轮转日期': null, '备注': '', 轮转明细List: [] })

// 当前分页页码
const page = ref(1)

// 每页显示条数
const pageSize = ref(15)

// 表格刷新 key
const tableKey = ref(0)

/**
 * 计算分页后的轮转配置列表
 * 
 * @returns {Array<Object>} 当前页的配置列表
 */
const pagedList = computed(() => 
  list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
)

/**
 * 创建空的轮转明细对象
 * 
 * @returns {Object} 空的轮转明细
 */
const createEmptyDetail = () => ({ 交路id: null })

/**
 * 根据车次 ID 获取车次名称
 * 
 * @param {number} id - 车次 ID
 * @returns {string} 车次名称或 ID
 */
const getTrainName = (id) => {
  const item = trainNumberList.value.find(v => v.id === id)
  return item ? item['车次'] : id
}

/**
 * 根据交路 ID 获取交路名称
 * 
 * @param {number} id - 交路 ID
 * @returns {string} 交路名称或 ID
 */
const getRouteName = (id) => {
  const item = routeList.value.find(v => v.id === id)
  return item ? item['交路名称'] : id
}

/**
 * 格式化轮转交路序列
 * 将轮转明细列表转换为"交路1 → 交路2 → ..."的格式
 * 
 * @param {Object} row - 轮转配置行数据
 * @returns {string} 格式化的交路序列
 */
const formatRouteSequence = (row) => 
  (row.轮转明细List || [])
    .map(item => item.交路名称 || getRouteName(item.交路id))
    .filter(Boolean)
    .join(' → ')

/**
 * 计算预览对话框的标题
 * 
 * @returns {string} 预览标题
 */
const formatPreviewTitle = computed(() => 
  previewData.value 
    ? `预览下一次轮转：${previewData.value.车次名称 || getTrainName(previewData.value['车次id'])}` 
    : '预览下一次轮转'
)

const loadData = async () => {
  loading.value = true
  try {
    const [configs, trains, routes] = await Promise.all([
      getAllRouteRotateConfig(),
      getAllTrainNumber(),
      getAllTrainGroup(),
    ])
    list.value = Array.isArray(configs) ? [...configs] : (configs ? [configs] : [])
    trainNumberList.value = Array.isArray(trains) ? [...trains] : (trains ? [trains] : [])
    routeList.value = Array.isArray(routes) ? [...routes] : (routes ? [routes] : [])
    tableKey.value++
  } catch (e) {
    console.error(e)
    ElMessage.error('加载失败')
  }
  loading.value = false
}

const openDialog = (row = null) => {
  form.value = row
    ? {
      id: row.id,
      '车次id': row['车次id'],
      '启用状态': row['启用状态'] !== false,
      '上次轮转日期': row['上次轮转日期'] || null,
      '备注': row['备注'] || '',
      轮转明细List: (row.轮转明细List || []).map(item => ({ id: item.id, 交路id: item['交路id'] })),
    }
    : { id: null, '车次id': null, '启用状态': true, '上次轮转日期': null, '备注': '', 轮转明细List: [createEmptyDetail(), createEmptyDetail()] }
  if (!form.value.轮转明细List.length) {
    form.value.轮转明细List = [createEmptyDetail(), createEmptyDetail()]
  }
  dialogVisible.value = true
}

const addDetail = () => {
  form.value.轮转明细List.push(createEmptyDetail())
}

const removeDetail = (idx) => {
  form.value.轮转明细List.splice(idx, 1)
}

const saveData = async () => {
  if (!form.value['车次id']) {
    ElMessage.warning('请选择车次')
    return
  }
  const routeIds = form.value.轮转明细List.map(item => item.交路id).filter(Boolean)
  if (routeIds.length < 2) {
    ElMessage.warning('至少选择2个交路')
    return
  }
  if (new Set(routeIds).size !== routeIds.length) {
    ElMessage.warning('轮转顺序中不能重复选择同一交路')
    return
  }
  saving.value = true
  try {
    const payload = {
      ...form.value,
      轮转明细List: form.value.轮转明细List.filter(item => item.交路id).map((item, index) => ({ 顺序号: index + 1, 交路id: item.交路id })),
    }
    const isEdit = !!payload.id
    if (!payload.id) delete payload.id
    await saveRouteRotateConfig(payload)
    logOperation(isEdit ? '修改交路轮转配置' : '新增交路轮转配置', `${isEdit ? '修改' : '新增'}车次:${getTrainName(form.value['车次id'])}的轮转配置`)
    await loadData()
    dialogVisible.value = false
    ElMessage.success('保存成功')
  } catch (e) {
    console.error(e)
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
  saving.value = false
}

const deleteItem = async (id) => {
  try { await ElMessageBox.confirm('确定删除该轮转配置？', '提示') } catch { return }
  try {
    const config = list.value.find(item => item.id === id)
    await deleteRouteRotateConfigById(id)
    logOperation('删除交路轮转配置', `删除车次:${getTrainName(config?.['车次id'])}的轮转配置`)
    await loadData()
    ElMessage.success('删除成功')
  } catch (e) {
    console.error(e)
    ElMessage.error('删除失败')
  }
}

const importFromBind = async () => {
  try {
    const msg = await importRouteRotateFromBind()
    logOperation('导入交路轮转配置', '根据现有关联导入交路轮转配置')
    ElMessage.success(typeof msg === 'string' ? msg : '导入成功')
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('导入失败')
  }
}

const openPreview = async (row) => {
  previewLoading.value = true
  previewVisible.value = true
  previewData.value = null
  try {
    previewData.value = await previewNextRouteRotate(row.id)
  } catch (e) {
    console.error(e)
    ElMessage.error('预览失败')
    previewVisible.value = false
  }
  previewLoading.value = false
}

const rotateOneNow = async (id) => {
  try {
    const config = list.value.find(item => item.id === id)
    const msg = await rotateRouteOne(id)
    logOperation('立即轮转单个车次', `立即轮转车次:${getTrainName(config?.['车次id'])}`)
    ElMessage.success(typeof msg === 'string' ? msg : '执行成功')
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('执行失败')
  }
}

const rotateAllNow = async () => {
  try {
    const msg = await rotateRouteNow()
    logOperation('立即执行全部轮转', '立即执行全部交路轮转')
    ElMessage.success(typeof msg === 'string' ? msg : '执行成功')
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('执行失败')
  }
}

defineExpose({ loadData })
</script>

<template>
  <div class="route-rotate-container">
    <div class="mb-4 flex gap-2">
      <!-- 已取消「新增轮转配置」入口：统一由下方「导入现有关联生成配置」自动生成 -->
      <el-button type="primary" @click="importFromBind">
        <el-icon class="mr-1"><Download /></el-icon>导入现有关联生成配置
      </el-button>
      <el-button type="success" @click="rotateAllNow">
        <el-icon class="mr-1"><Refresh /></el-icon>立即执行全部轮转
      </el-button>
    </div>

    <div class="table-wrapper">
      <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="400">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="车次" width="140">
          <template #default="{ row }">{{ row.车次名称 || getTrainName(row['车次id']) }}</template>
        </el-table-column>
        <el-table-column label="轮转顺序" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ formatRouteSequence(row) || '未配置' }}</template>
        </el-table-column>
        <el-table-column label="启用状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row['启用状态'] !== false ? 'success' : 'info'">{{ row['启用状态'] !== false ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="上次轮转日期" label="上次轮转日期" width="140" />
        <el-table-column prop="备注" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="310" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openPreview(row)">预览下一次</el-button>
            <el-button size="small" type="success" @click="rotateOneNow(row.id)">立即轮转</el-button>
            <el-button size="small" type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteItem(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-pagination class="mt-3 justify-end" background layout="total, prev, pager, next, sizes"
      :total="list.length" v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,15,30,50]" />

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑交路轮转配置' : '新增交路轮转配置'" width="720px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="100px">
        <el-form-item label="车次">
          <el-select v-model="form['车次id']" placeholder="请选择车次" filterable style="width: 100%">
            <el-option v-for="item in trainNumberList" :key="item.id" :label="item['车次']" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form['启用状态']" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form['备注']" placeholder="可选" />
        </el-form-item>
        <el-form-item label="轮转顺序">
          <div style="width: 100%">
            <div v-for="(item, idx) in form.轮转明细List" :key="idx" class="flex gap-2 mb-2 items-center">
              <div style="width: 56px; color: #909399">第{{ idx + 1 }}位</div>
              <el-select v-model="item.交路id" placeholder="请选择交路" filterable style="flex: 1">
                <el-option v-for="route in routeList" :key="route.id" :label="route['交路名称']" :value="route.id" />
              </el-select>
              <el-button type="danger" plain @click="removeDetail(idx)" :disabled="form.轮转明细List.length <= 2">删除</el-button>
            </div>
            <el-button type="primary" plain @click="addDetail">新增顺序位</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveData">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewVisible" :title="formatPreviewTitle" width="700px" class="touch-draggable-dialog">
      <el-table :data="previewData?.预览项List || []" v-loading="previewLoading" stripe border>
        <el-table-column prop="当前交路名称" label="当前交路" min-width="150" />
        <el-table-column prop="下一交路名称" label="下一交路" min-width="150" />
        <el-table-column prop="关联数量" label="当前关联条数" width="120" />
      </el-table>
      <div class="mt-3" style="color:#909399;font-size:12px">
        说明：预览展示该车次在下一次轮转时，每个交路将会切换到哪个交路，以及当前会被轮转的关联记录数量。
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ========== 交路轮转页面根容器 ========== */
/* 只负责撑满父级宽度，具体滚动和布局由内部表格/工具类控制 */
.route-rotate-container {
  width: 100%;
}

/* ========== 表格外层滚动容器 ========== */
/* 配置项字段较多时允许横向滚动，避免列内容挤压导致按钮或文本换行错乱 */
.table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  max-width: 100%;
}

/* 穿透 Element Plus 表格组件，确保表格宽度跟随容器拉满 */
.table-wrapper :deep(.el-table) {
  width: 100%;
}

/* ========== 局部工具类 ========== */
/* 下方这些类用于替代少量 Tailwind 间距/布局能力，避免在模板中重复写内联样式 */
.mt-3 {
  margin-top: 12px;
}

.mb-4 {
  margin-bottom: 16px;
}

.mr-1 {
  margin-right: 4px;
}

.mb-2 {
  margin-bottom: 8px;
}

.items-center {
  align-items: center;
}

.flex {
  display: flex;
}

.gap-2 {
  gap: 8px;
}

.justify-end {
  justify-content: flex-end;
}
</style>
