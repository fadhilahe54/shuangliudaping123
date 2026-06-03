<!--
  LogManageTab.vue -- 系统日志管理
  功能：查看和管理系统操作日志：
    - 支持按日志类型/用户/操作内容/时间范围多条件分页查询
    - 支持单条删除日志记录
  使用方：AdminView.vue 系统管理 Tab
-->
<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
// 日志分页查询和删除接口
import { queryLogs, deleteLogById } from '../../api/log.js'

const loading = ref(false)
const list = ref([])        // 当前页日志列表
const total = ref(0)        // 总条数（分页）
const page = ref(1)         // 当前页码（1-based）
const pageSize = ref(15)    // 每页条数
const dateRange = ref([])   // 时间范围筛选 [开始, 结束]
const searchForm = ref({
  type: '',      // 日志类型
  user: '',      // 操作用户
  operate: '',   // 操作名称
  msg: '',
  ipAddress: '',
})

const typeOptions = ['登录日志', '操作日志', '系统日志', '错误日志']

const queryCondition = computed(() => ({
  type: searchForm.value.type || '',
  user: searchForm.value.user || '',
  operate: searchForm.value.operate || '',
  msg: searchForm.value.msg || '',
  ipAddress: searchForm.value.ipAddress || '',
  createTimeStart: Array.isArray(dateRange.value) && dateRange.value.length === 2 ? dateRange.value[0] : null,
  createTimeEnd: Array.isArray(dateRange.value) && dateRange.value.length === 2 ? dateRange.value[1] : null,
}))

const loadData = async () => {
  loading.value = true
  try {
    const res = await queryLogs(queryCondition.value, page.value - 1, pageSize.value)
    list.value = Array.isArray(res?.content) ? res.content : []
    total.value = typeof res?.totalElements === 'number' ? res.totalElements : list.value.length
  } catch (e) {
    console.error(e)
    ElMessage.error('加载日志失败')
  }
  loading.value = false
}

const handleSearch = () => {
  page.value = 1
  loadData()
}

const handleReset = () => {
  searchForm.value = {
    type: '',
    user: '',
    operate: '',
    msg: '',
    ipAddress: '',
  }
  dateRange.value = []
  page.value = 1
  loadData()
}

const handleSizeChange = (size) => {
  pageSize.value = size
  page.value = 1
  loadData()
}

const handleCurrentChange = (current) => {
  page.value = current
  loadData()
}

const removeLog = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该日志记录？', '提示')
  } catch {
    return
  }
  try {
    await deleteLogById(id)
    ElMessage.success('删除成功')
    if (list.value.length === 1 && page.value > 1) {
      page.value -= 1
    }
    await loadData()
  } catch (e) {
    console.error(e)
    ElMessage.error('删除失败')
  }
}

defineExpose({ loadData })
</script>

<template>
  <div>
    <div class="toolbar flex items-center flex-wrap gap-2">
      <el-select v-model="searchForm.type" placeholder="日志类型" clearable style="width: 140px">
        <el-option v-for="item in typeOptions" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input v-model="searchForm.user" placeholder="用户" clearable style="width: 140px" @keyup.enter="handleSearch" />
      <el-input v-model="searchForm.operate" placeholder="操作" clearable style="width: 160px" @keyup.enter="handleSearch" />
      <el-input v-model="searchForm.msg" placeholder="详细信息" clearable style="width: 220px" @keyup.enter="handleSearch" />
      <el-input v-model="searchForm.ipAddress" placeholder="IP地址" clearable style="width: 150px" @keyup.enter="handleSearch" />
      <el-date-picker
        v-model="dateRange"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        value-format="YYYY-MM-DD HH:mm:ss"
        style="width: 360px"
      />
      <el-button type="primary" @click="handleSearch">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe border max-height="calc(100vh - 320px)">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="createTime" label="时间" width="180" />
      <el-table-column prop="type" label="类型" width="100" />
      <el-table-column prop="user" label="用户" width="120" />
      <el-table-column prop="operate" label="操作" width="180" show-overflow-tooltip />
      <el-table-column prop="msg" label="详细信息" min-width="260" show-overflow-tooltip />
      <el-table-column prop="ipAddress" label="IP地址" width="140" />
      <el-table-column label="操作" width="100" fixed="right">
<!--        <template #default="{ row }">
          <el-button size="small" type="danger" @click="removeLog(row.id)">删除</el-button>
        </template>-->
      </el-table-column>
    </el-table>

    <el-pagination
      class="mt-3 justify-end"
      background
      layout="total, prev, pager, next, sizes"
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10,15,30,50]"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />
  </div>
</template>

<style scoped>
/* ========== 查询工具栏 ========== */
/* 采用浅金色渐变背景，与后台管理页其它业务表单保持一致的温和提示风格 */
.toolbar {
  margin-bottom: 14px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #fdf9e9 0%, #fef9f0 100%);
  border: 1px solid #f1e5c4;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(146, 64, 14, 0.04);
}

/* ========== Element Plus 表单控件外观统一 ========== */
/* 使用 :deep 穿透 scoped 边界，统一输入框、下拉框、日期选择器的圆角和默认描边 */
.toolbar :deep(.el-input__wrapper),
.toolbar :deep(.el-select__wrapper),
.toolbar :deep(.el-date-editor.el-input__wrapper) {
  border-radius: 6px;
  box-shadow: 0 0 0 1px #f1e5c4;
}

/* 鼠标悬停时提升描边亮度，提示当前控件可交互 */
.toolbar :deep(.el-input__wrapper:hover),
.toolbar :deep(.el-select__wrapper:hover),
.toolbar :deep(.el-date-editor.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #fbbf24;
}

/* 聚焦状态使用更深的橙色描边，便于键盘输入或日期筛选时定位当前字段 */
.toolbar :deep(.el-input__wrapper.is-focus),
.toolbar :deep(.el-select__wrapper.is-focused),
.toolbar :deep(.el-date-editor.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #d97706;
}
</style>
