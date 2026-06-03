<!--
  值班人员管理组件
  功能：管理值班人员的姓名、职务、头像、备注等信息的增删改查
  修改人：王天智
-->
<script setup>
/* ========== 依赖导入 ========== */
import { ref, computed } from 'vue'                    // Vue 响应式 API
import { ElMessage, ElMessageBox } from 'element-plus' // 消息提示与确认框
import UserImg from '../../public/Images/User.png'     // 默认头像图片
import { getAllWorkers, saveWorker, deleteWorkerById, getAllJobs, uploadAvatar, getAvatarList } from '../../api/dispatchApi.js' // 人员和岗位接口
import { serviceBaseURL } from '../../api/request.js' // 后端地址，用于拼接头像完整URL
import { logOperation } from '../../api/log.js'

/* ========== 响应式数据 ========== */
// 值班人员列表
const list = ref([])

// 表格加载状态
const loading = ref(false)

// 编辑对话框显示状态
const dialogVisible = ref(false)

// 人员表单数据（id、姓名、职务、头像路径、备注）
const form = ref({ id: null, '姓名': '', '职务': '', '头像路径': '', '备注': '' })

// 岗位列表（用于职务下拉选择）
const jobList = ref([])

// 当前分页页码
const page = ref(1)

// 每页显示条数
const pageSize = ref(15)

// 表格刷新 key
const tableKey = ref(0)

/**
 * 计算前端分页后的人员列表
 * 
 * @returns {Array<Object>} 当前页的人员列表
 */
const pagedList = computed(() => 
  list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
)

/**
 * 加载全部值班人员数据
 * 从后台接口获取人员列表
 * 
 * @async
 * @returns {Promise<void>}
 */
const loadData = async () => {
  // 设置加载状态
  loading.value = true
  try {
    // 调用接口获取人员列表
    const data = await getAllWorkers()
    
    // 处理数据格式，确保为数组
    list.value = Array.isArray(data) ? [...data] : (data ? [data] : [])
    
    // 刷新表格
    tableKey.value++
  } catch (e) { 
    console.error(e) 
  }
  // 清除加载状态
  loading.value = false
}

/**
 * 加载岗位列表
 * 用于职务下拉选择框
 * 
 * @async
 * @returns {Promise<void>}
 */
const loadJobList = async () => {
  try {
    // 调用接口获取岗位列表
    const data = await getAllJobs()
    
    // 处理数据格式，确保为数组
    jobList.value = Array.isArray(data) ? [...data] : (data ? [data] : [])
  } catch (e) { 
    console.error(e) 
  }
}

/**
 * 打开新增/编辑对话框
 * 首次打开时自动加载岗位列表
 * 
 * @async
 * @param {Object|null} row - 编辑的行数据，null 表示新增
 * @returns {Promise<void>}
 */
const openDialog = async (row = null) => {
  // 若岗位列表未加载，先加载
  if (!jobList.value.length) await loadJobList()
  
  // 初始化表单数据
  form.value = row 
    ? { ...row } 
    : { id: null, '姓名': '', '职务': '', '头像路径': '', '备注': '' }
  
  // 显示对话框
  dialogVisible.value = true
}

/**
 * 保存人员信息
 * 支持新增和编辑
 * 
 * @async
 * @returns {Promise<void>}
 */
const saveData = async () => {
  try {
    // 复制表单数据
    const payload = { ...form.value }
    
    // 判断是编辑还是新增
    const isEdit = !!payload.id
    
    // 新增时移除 id 字段
    if (!payload.id) delete payload.id
    
    // 调用保存接口
    await saveWorker(payload)
    
    // 记录操作日志
    logOperation(
      isEdit ? '修改值班人员' : '新增值班人员', 
      `${isEdit ? '修改' : '新增'}:${payload['姓名']}值班人员`
    )
    
    // 刷新列表
    await loadData()
    
    // 显示成功提示
    ElMessage.success('保存成功')
    
    // 关闭对话框
    dialogVisible.value = false
  } catch (e) { 
    ElMessage.error('保存失败') 
  }
}

/**
 * 删除指定人员
 * 带确认提示
 * 
 * @async
 * @param {number} id - 人员 ID
 * @returns {Promise<void>}
 */
const deleteItem = async (id) => {
  // 显示确认对话框
  try { 
    await ElMessageBox.confirm('确定删除？', '提示') 
  } catch { 
    return 
  }
  try {
    const worker = list.value.find(item => item.id === id)
    await deleteWorkerById(id)
    logOperation('删除值班人员', `删除:${worker?.['姓名'] || id}值班人员`)
    ElMessage.success('删除成功')
    await loadData()
  } catch (e) { ElMessage.error('删除失败') }
}

/** 获取人员列表，供外部组件使用 */
const getList = () => list.value

/* ========== 头像URL解析 ========== */
/**
 * 解析头像路径为完整可访问的URL
 * - 以 /uploads/ 开头 → 拼接后端地址
 * - 以 http 开头 → 直接使用
 * - 其他（预设图标路径或空） → 原样返回
 */
const resolveAvatarUrl = (path) => {
  if (!path) return UserImg
  if (path.startsWith('/uploads/')) return serviceBaseURL + path
  return path
}

/* ========== 头像上传 ========== */
const uploading = ref(false)       // 上传中状态
const fileInputRef = ref(null)     // 隐藏的文件input引用
const uploadedAvatarList = ref([]) // 历史已上传头像列表
const avatarListLoading = ref(false)

/** 触发文件选择 */
const triggerFileInput = () => {
  fileInputRef.value?.click()
}

/** 处理文件选择后的上传 */
const handleFileUpload = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  // 前端校验文件类型
  const allowTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  if (!allowTypes.includes(file.type)) {
    ElMessage.warning('仅支持 PNG/JPG/GIF/WebP 格式的图片')
    return
  }
  // 前端校验文件大小（最大2MB）
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.warning('图片大小不能超过 2MB')
    return
  }

  uploading.value = true
  try {
    const res = await uploadAvatar(file)
    if (res?.url) {
      form.value['头像路径'] = res.url
      await loadUploadedAvatarList()
      logOperation('上传头像', `上传:${file.name}头像`)
      ElMessage.success('头像上传成功')
    } else if (res?.data?.url) {
      form.value['头像路径'] = res.data.url
      await loadUploadedAvatarList()
      logOperation('上传头像', `上传:${file.name}头像`)
      ElMessage.success('头像上传成功')
    } else if (res?.error) {
      ElMessage.error(res.error)
    } else {
      ElMessage.error('上传失败：未知响应格式')
    }
  } catch (e) {
    console.error('头像上传失败:', e)
    ElMessage.error('头像上传失败')
  } finally {
    uploading.value = false
    // 清空input值，允许重复选择同一文件
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

const loadUploadedAvatarList = async () => {
  avatarListLoading.value = true
  try {
    const data = await getAvatarList()
    uploadedAvatarList.value = Array.isArray(data)
      ? data.map(item => ({
          url: item.url,
          name: item.name,
          source: 'uploaded'
        }))
      : []
  } catch (e) {
    console.error('加载已上传头像失败:', e)
    uploadedAvatarList.value = []
  } finally {
    avatarListLoading.value = false
  }
}

/* ========== 头像选择器状态 ========== */
const pickerVisible = ref(false)  // 选择器对话框显示状态
const pickerSearch = ref('')      // 搜索关键词
const pickerTemp = ref('')        // 临时选中的图标 URL

/** 过滤后的图标列表（按名称搜索） */
const filteredIcoList = computed(() => {
  const kw = pickerSearch.value.trim().toLowerCase()
  return kw ? uploadedAvatarList.value.filter(i => i.name.toLowerCase().includes(kw)) : uploadedAvatarList.value
})

/** 打开图标选择器，初始化临时选中值 */
const openPicker = async () => {
  pickerTemp.value = form.value['头像路径'] || ''
  pickerSearch.value = ''
  await loadUploadedAvatarList()
  pickerVisible.value = true
}

/** 确认选择图标，写入表单 */
const confirmPicker = () => {
  form.value['头像路径'] = pickerTemp.value
  pickerVisible.value = false
}

/** 暴露方法供父组件调用 */
defineExpose({ loadData, getList })
</script>

<template>
  <!-- 值班人员管理页面 - 修改人：王天智 -->
  <div>
    <!-- 新增按钮 -->
    <div class="mb-4">
      <el-button type="primary" @click="openDialog()">
        <el-icon class="mr-1"><Plus /></el-icon>新增
      </el-button>
    </div>
    <!-- 人员数据表格 -->
    <el-table :key="tableKey" :data="pagedList" v-loading="loading" stripe border max-height="calc(100vh - 280px)">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="姓名" label="姓名" width="120" />
      <el-table-column prop="职务" label="职务" width="120" />
      <el-table-column prop="头像路径" label="头像" width="80">
        <template #default="{ row }">
          <img :src="resolveAvatarUrl(row['头像路径'])" @error="e => e.target.src = UserImg"
               style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid rgba(6,182,212,0.4);background:#0f172a;" />
        </template>
      </el-table-column>
      <el-table-column prop="备注" label="备注" show-overflow-tooltip />
      <!-- 操作列 -->
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteItem(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <el-pagination class="mt-3 justify-end" background layout="total, prev, pager, next, sizes"
      :total="list.length" v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,15,30,50]" />

    <!-- 新增/编辑人员对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑值班人员' : '新增值班人员'" width="500px" class="touch-draggable-dialog">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form['姓名']" /></el-form-item>
        <!-- 职务下拉选择：从岗位列表中选择 -->
        <el-form-item label="职务">
          <el-select v-model="form['职务']" placeholder="请选择职务" style="width: 100%" filterable popper-class="admin-select-dropdown">
            <el-option v-for="job in jobList" :key="job.id" :label="job['值班岗位']" :value="job['值班岗位']" />
          </el-select>
        </el-form-item>
        <!-- 头像选择：支持上传真实照片 + 预设图标选择 -->
        <el-form-item label="头像">
          <div class="avatar-section">
            <!-- 头像预览 -->
            <div class="avatar-pick-wrap" @click="openPicker" title="点击选择预设图标">
              <img
                :src="resolveAvatarUrl(form['头像路径'])"
                @error="e => e.target.src = UserImg"
                class="avatar-pick-img"
                alt="头像"
              />
              <div class="avatar-pick-mask"><el-icon><Edit /></el-icon></div>
            </div>
            <!-- 操作按钮组 -->
            <div class="avatar-actions">
              <el-button size="small" @click="triggerFileInput" :loading="uploading">
                <el-icon class="mr-1"><Upload /></el-icon>上传照片
              </el-button>
              <el-button size="small" @click="openPicker">
                <el-icon class="mr-1"><Picture /></el-icon>选择已上传
              </el-button>
              <el-button v-if="form['头像路径']" size="small" type="info" @click="form['头像路径'] = ''">
                <el-icon class="mr-1"><Delete /></el-icon>清除
              </el-button>
            </div>
            <span class="avatar-pick-hint">
              {{ uploading ? '上传中...' : (form['头像路径'] ? '已设置头像' : '可上传照片或选择历史头像') }}
            </span>
          </div>
          <!-- 隐藏的文件选择input -->
          <input ref="fileInputRef" type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                 style="display:none" @change="handleFileUpload" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form['备注']" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveData">保存</el-button>
      </template>
    </el-dialog>

    <!-- 头像图标选择器对话框 -->
    <el-dialog v-model="pickerVisible" title="选择头像" width="620px" class="avatar-picker-dialog touch-draggable-dialog">
      <!-- 搜索框 -->
      <el-input
        v-model="pickerSearch"
        placeholder="搜索头像名称..."
        clearable
        class="mb-3"
        style="width:100%"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>

      <div class="picker-summary">已上传头像 {{ uploadedAvatarList.length }} 个</div>

      <!-- 图标网格 -->
      <div class="ico-grid">
        <div
          v-for="ico in filteredIcoList"
          :key="ico.url"
          class="ico-item"
          :class="{ 'ico-item--selected': pickerTemp === ico.url }"
          @click="pickerTemp = ico.url"
        >
          <img :src="resolveAvatarUrl(ico.url)" :alt="ico.name" class="ico-img" />
          <span class="ico-name">{{ ico.name }}</span>
          <span class="ico-type ico-type--uploaded">已上传</span>
        </div>
        <div v-if="avatarListLoading" class="ico-empty">正在加载已上传头像...</div>
        <div v-else-if="!filteredIcoList.length" class="ico-empty">未找到匹配头像</div>
      </div>

      <template #footer>
        <el-button @click="pickerVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmPicker" :disabled="!pickerTemp">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ========== 头像选择器样式 ========== */
/* 头像点击区域 */
.avatar-pick-wrap {
  /* 相对定位 */
  position: relative;
  /* 宽度：64px */
  width: 64px;
  /* 高度：64px */
  height: 64px;
  /* 圆角：50%，圆形 */
  border-radius: 50%;
  /* 鼠标样式：指针 */
  cursor: pointer;
  /* 不收缩：固定宽度 */
  flex-shrink: 0;
}

/* 头像图片 */
.avatar-pick-img {
  /* 宽度：64px */
  width: 64px;
  /* 高度：64px */
  height: 64px;
  /* 圆角：50%，圆形 */
  border-radius: 50%;
  /* 对象适应：覆盖，保持比例填充 */
  object-fit: cover;
  /* 边框：青色，2px */
  border: 2px solid rgba(6, 182, 212, 0.5);
  /* 背景：深蓝色 */
  background: #0f172a;
  /* 显示：块级 */
  display: block;
}

/* ========== 悬浮遮罩样式 ========== */
/* 悬浮遮罩（头像悬停时显示） */
.avatar-pick-mask {
  /* 绝对定位：覆盖整个区域 */
  position: absolute;
  /* 位置：覆盖父元素 */
  inset: 0;
  /* 圆角：50%，圆形 */
  border-radius: 50%;
  /* 背景：黑色半透明 */
  background: rgba(0, 0, 0, 0.5);
  /* 弹性布局：居中 */
  display: flex;
  /* 垂直对齐：居中 */
  align-items: center;
  /* 水平对齐：居中 */
  justify-content: center;
  /* 透明度：0，默认隐藏 */
  opacity: 0;
  /* 过渡动画：0.2s */
  transition: opacity 0.2s;
  /* 文字颜色：青色 */
  color: #22d3ee;
  /* 字号：18px */
  font-size: 18px;
}

/* 头像悬停时显示遮罩 */
.avatar-pick-wrap:hover .avatar-pick-mask {
  /* 透明度：1，显示 */
  opacity: 1;
}
/* 头像选择提示文字 */
.avatar-pick-hint {
  /* 字号：12px */
  font-size: 12px;
  /* 文字颜色：灰色 */
  color: #64748b;
  /* 上边距：6px */
  margin-top: 6px;
}

/* ========== 头像区域整体布局 ========== */
/* 头像区域容器 */
.avatar-section {
  /* 弹性布局：水平排列 */
  display: flex;
  /* 允许换行 */
  flex-wrap: wrap;
  /* 垂直对齐：居中 */
  align-items: center;
  /* 子元素间距：12px */
  gap: 12px;
}

/* ========== 操作按钮组样式 ========== */
/* 操作按钮组 */
.avatar-actions {
  /* 弹性布局：垂直排列 */
  display: flex;
  /* 方向：列方向 */
  flex-direction: column;
  /* 子元素间距：6px */
  gap: 6px;
}
/* 选择器摘要信息 */
.picker-summary {
  /* 下边距：10px */
  margin-bottom: 10px;
  /* 字号：12px */
  font-size: 12px;
  /* 文字颜色：灰色 */
  color: #64748b;
}

/* ========== 图标网格样式 ========== */
/* 图标网格容器 */
.ico-grid {
  /* 网格布局 */
  display: grid;
  /* 网格列：5 列等宽 */
  grid-template-columns: repeat(5, 1fr);
  /* 列间距：10px */
  gap: 10px;
  /* 最大高度：400px */
  max-height: 400px;
  /* 垂直溢出：自动滚动 */
  overflow-y: auto;
  /* 内边距：4px 2px */
  padding: 4px 2px;
}

/* 图标网格项 */
.ico-item {
  /* 弹性布局：居中 */
  display: flex;
  /* 方向：列方向 */
  flex-direction: column;
  /* 垂直对齐：居中 */
  align-items: center;
  /* 子元素间距：6px */
  gap: 6px;
  /* 内边距：10px 6px 8px */
  padding: 10px 6px 8px;
  /* 圆角：8px */
  border-radius: 8px;
  /* 边框：透明，2px */
  border: 2px solid transparent;
  /* 鼠标样式：指针 */
  cursor: pointer;
  /* 背景：深蓝色半透明 */
  background: rgba(30, 41, 59, 0.5);
  /* 过渡动画：0.15s */
  transition: border-color 0.15s, background 0.15s;
}
/* 图标项悬停状态 */
.ico-item:hover {
  /* 边框颜色：青色半透明 */
  border-color: rgba(6, 182, 212, 0.4);
  /* 背景：青色微光 */
  background: rgba(6, 182, 212, 0.08);
}

/* 图标项选中状态 */
.ico-item--selected {
  /* 边框颜色：青色，强制覆盖 */
  border-color: #22d3ee !important;
  /* 背景：青色微光，强制覆盖 */
  background: rgba(6, 182, 212, 0.15) !important;
  /* 阴影：青色发光 */
  box-shadow: 0 0 8px rgba(6, 182, 212, 0.3);
}
/* 图标图片 */
.ico-img {
  /* 宽度：52px */
  width: 52px;
  /* 高度：52px */
  height: 52px;
  /* 对象适应：包含，保持比例 */
  object-fit: contain;
}

/* 图标名称 */
.ico-name {
  /* 字号：11px */
  font-size: 11px;
  /* 文字颜色：灰色 */
  color: #94a3b8;
  /* 文字对齐：居中 */
  text-align: center;
  /* 单词换行：允许任意位置断行 */
  word-break: break-all;
  /* 行高：1.3 */
  line-height: 1.3;
  /* 最大宽度：80px */
  max-width: 80px;
  /* 溢出：隐藏 */
  overflow: hidden;
  /* 显示：弹性盒子 */
  display: -webkit-box;
  /* 限制行数：2 行 */
  -webkit-line-clamp: 2;
  /* 盒子方向：垂直 */
  -webkit-box-orient: vertical;
}
/* 图标类型标签 */
.ico-type {
  /* 字号：10px */
  font-size: 10px;
  /* 行高：1 */
  line-height: 1;
  /* 内边距：3px 6px */
  padding: 3px 6px;
  /* 圆角：999px，胶囊状 */
  border-radius: 999px;
}

/* 已上传类型标签 */
.ico-type--uploaded {
  /* 文字颜色：绿色 */
  color: #22c55e;
  /* 背景：绿色微光 */
  background: rgba(34, 197, 94, 0.12);
}

/* 空图标提示 */
.ico-empty {
  /* 网格列：跨越所有列 */
  grid-column: 1 / -1;
  /* 文字对齐：居中 */
  text-align: center;
  /* 文字颜色：灰色 */
  color: #475569;
  /* 内边距：32px 0 */
  padding: 32px 0;
}

/* ========== 滚动条样式 ========== */
/* 自定义滚动条 */
.ico-grid::-webkit-scrollbar { 
  /* 宽度：6px */
  width: 6px; 
}

/* 滚动条轨道 */
.ico-grid::-webkit-scrollbar-track { 
  /* 背景：透明 */
  background: transparent; 
}

/* 滚动条滑块 */
.ico-grid::-webkit-scrollbar-thumb { 
  /* 背景：青色半透明 */
  background: rgba(6,182,212,0.3); 
  /* 圆角：3px */
  border-radius: 3px; 
}
</style>

