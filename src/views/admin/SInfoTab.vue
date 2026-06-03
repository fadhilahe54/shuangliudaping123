<!--
  总体信息管理组件
  功能：管理上线数量、备用数量、整修数量、扣修数量、当班重点信息的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import {ref, computed} from 'vue'                    // Vue 响应式 API 与计算属性
import { ElMessage, ElMessageBox } from 'element-plus' // 消息提示与确认对话框
import { getAllSInfo, saveSInfo, deleteSInfoById } from '../../api/dispatchApi.js' // 总体信息相关接口
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
const list = ref([])             // 总体信息列表数据
const loading = ref(false)       // 表格加载状态
const dialogVisible = ref(false) // 新增/编辑对话框显示状态
const form = ref({ id: null, '上线数量': 0, '备用数量': 0, '整修数量': 0, '扣修数量': 0, '当班重点信息': '' }) // 表单数据
const page = ref(1)              // 当前页码
const pageSize = ref(15)         // 每页条数
const tableKey = ref(0)          // 表格 key，用于强制刷新表格渲染

/** 计算属性：根据页码和每页条数对列表数据进行前端分页 */
const pagedList = computed(() => list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

/* ========== 数据操作方法 ========== */

/** 加载全部总体信息数据，按 id 降序排列（最新在前） */
const loadData = async () => {
  loading.value = true
  try {
    const data = await getAllSInfo()
    const arr = Array.isArray(data) ? [...data] : (data ? [data] : [])
    list.value = arr.sort((a, b) => (b.id || 0) - (a.id || 0))
    tableKey.value++ // 更新 key 强制表格刷新
  } catch (e) { console.error(e) }
  loading.value = false
}

/** 打开新增/编辑对话框；传入 row 则为编辑模式，否则为新增模式 */
const openDialog = (row = null) => {
  form.value = row
    ? { ...row }
    : { id: null, '上线数量': 0, '备用数量': 0, '整修数量': 0, '扣修数量': 0, '当班重点信息': '' }
  dialogVisible.value = true
}

/** 保存（新增或更新）总体信息：无 id 时为新增，有 id 时为更新 */
const saveData = async () => {
  try {
    const payload = { ...form.value }
    const isEdit = !!payload.id
    if (!payload.id) delete payload.id // 新增时移除 id 字段
    await saveSInfo(payload)
    logOperation(isEdit ? '修改总体信息' : '新增总体信息', `${isEdit ? '修改' : '新增'}总体信息记录`)
    await loadData()                   // 保存后刷新列表
    ElMessage.success('保存成功')
    dialogVisible.value = false
  } catch (e) { ElMessage.error('保存失败') }
}

/** 删除指定 id 的总体信息，删除前弹出确认框 */
const deleteItem = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除？', '提示')
  } catch { return } // 用户点取消，直接返回
  try {
    await deleteSInfoById(id)
    logOperation('删除总体信息', `删除总体信息记录:${id}`)
    ElMessage.success('删除成功')
    await loadData() // 删除后刷新列表
  } catch (e) { ElMessage.error('删除失败') }
}

/** 暴露 loadData 方法，供父组件在 Tab 切换时调用 */
defineExpose({ loadData })


const getUserName = () => {
  try {
    const user =  JSON.parse(localStorage.getItem('pzh_user')).username
    return user ? user : ''
  } catch (error) {
    console.error('解析用户数据失败:', error)
    return {}
  }
}


</script>

<template>
  <!-- 总体信息管理页面 - 修改人：王天智 -->
  <div >
    <!-- 顶部操作栏：新增按钮 -->
    <div class="mb-4" v-if="getUserName () === 'root' ">
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增
      </el-button>
    </div>
    <!-- 数据表格：展示总体信息列表 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
<!--      <el-table-column prop="上线数量" label="上线数量" width="100" />
      <el-table-column prop="备用数量" label="备用数量" width="100" />
      <el-table-column prop="整修数量" label="整修数量" width="100" />
      <el-table-column prop="扣修数量" label="扣修数量" width="100" />-->
      <el-table-column prop="当班重点信息" label="当班重点信息" show-overflow-tooltip />
      <!-- 操作列：编辑 / 删除 -->
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteItem(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页组件 -->
    <el-pagination class="mt-3 justify-end" background layout="total, prev, pager, next, sizes"
      :total="list.length" v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,15,30,50]" />

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑总体信息' : '新增总体信息'" width="500px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="100px">
<!--        <el-form-item label="上线数量"><el-input-number v-model="form['上线数量']" :min="0" /></el-form-item>
        <el-form-item label="备用数量"><el-input-number v-model="form['备用数量']" :min="0" /></el-form-item>
        <el-form-item label="整修数量"><el-input-number v-model="form['整修数量']" :min="0" /></el-form-item>
        <el-form-item label="扣修数量"><el-input-number v-model="form['扣修数量']" :min="0" /></el-form-item>-->
        <el-form-item label="重点信息">
          <el-input v-model="form['当班重点信息']" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <!-- 对话框底部按钮 -->
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
