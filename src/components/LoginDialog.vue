<!--
  LoginDialog.vue -- 登录弹窗组件
  提供用户名+密码登录功能：
    - 登录成功后将用户信息（含角色/权限）存入 localStorage
    - 通过 login-success 事件通知父组件更新当前用户状态
    - 记录登录日志（异步，不阻塞主流程）
  使用方：UIOverlay.vue（顶部工具栏登录按钮触发）
-->
<script setup>
import { ref, computed } from 'vue'
// 登录接口和用户查询接口
import {getUserByName, login} from '../api/dispatchApi.js'
// 操作日志写入接口
import { myLog } from '../api/log.js'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: { type: Boolean, default: false }, // 控制弹窗显示/隐藏
})
// update:visible 用于 v-model 双向绑定；login-success 携带用户信息通知父组件
const emit = defineEmits(['update:visible', 'login-success'])

// 通过计算属性实现 v-model:visible 的双向绑定
const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

// 用户名输入框绑定值
const username = ref('')

// 密码输入框绑定值
const password = ref('')

// 登录请求加载中状态，控制按钮 loading 动画
const loading = ref(false)

/**
 * 处理登录逻辑
 * 校验用户名和密码，调用后端登录接口，成功后存储用户信息到 localStorage
 * 并触发 login-success 事件通知父组件更新当前用户状态
 * 
 * @async
 * @function handleLogin
 * @returns {Promise<void>}
 */
const handleLogin = async () => {
  // 校验用户名不能为空
  if (!username.value.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }
  
  // 校验密码不能为空
  if (!password.value.trim()) {
    ElMessage.warning('请输入密码')
    return
  }
  
  // 设置加载状态，按钮进入 loading 动画
  loading.value = true
  
  try {
    // 调用后端登录接口，传入用户名和密码
    const data = await login({ username: username.value.trim(), password: password.value.trim()})
    console.log('登录成功:', data)

    // 检查响应格式和业务状态码
    if (data && data.data.code === 0) {
      // 登录成功：code 为 0
      ElMessage.success('登录成功')

      // 存储用户信息到 localStorage
      if (data.data.user) {
        // 存储登录态（包含角色和权限，供前端 UI 做权限兜底，例如隐藏 ADMIN 专属按钮）
        localStorage.setItem('pzh_user', JSON.stringify({
          id: data.data.user.id,
          username: data.data.user.username,
          realName: data.data.user.realName,
          roles: data.data.user.roles || [],
          permissions: data.data.user.permissions || []
        }))
        
        // 触发 login-success 事件，通知父组件更新当前用户状态
        emit('login-success', data.data.user)
        
        // 记录登录日志（异步，不阻塞主流程）
        const logUser = data.data.user.realName || data.data.user.username || username.value.trim()
        myLog('登录日志', logUser, '用户登录', `${logUser} 登录系统`)
      }

      // 关闭弹窗
      dialogVisible.value = false
      
      // 清空输入框
      username.value = ''
      password.value = ''
    } else {
      // 2xx 但业务 code 非 0：后端兜底返回的失败响应
      ElMessage({
        type: 'error',
        message: data?.data?.message || '用户名或密码错误',
        showClose: true,
        grouping: true,
        duration: 3500,
      })
    }
  } catch (e) {
    // 4xx/5xx：axios 抛异常，后端 LoginController 会按异常类型返回
    // {code:1, message:"账号已被禁用，请联系管理员" | "账号已被锁定，请联系管理员" | "用户名或密码错误" | ...}
    console.error('登录请求失败:', e)
    
    // 从异常响应中提取错误消息
    const msg = e?.response?.data?.message
    
    // 显示错误提示
    ElMessage({
      type: 'error',
      message: msg || '登录失败，请检查网络连接或联系管理员',
      showClose: true,
      grouping: true,
      duration: 3500,
    })
  } finally {
    // 无论成功或失败，都关闭加载状态
    loading.value = false
  }
}

/**
 * 关闭登录弹窗
 * 清空输入框内容，重置弹窗状态
 * 
 * @function handleClose
 * @returns {void}
 */
const handleClose = () => {
  // 关闭弹窗
  dialogVisible.value = false
  
  // 清空用户名输入框
  username.value = ''
  
  // 清空密码输入框
  password.value = ''
}
</script>

<template>
  <el-dialog
      v-model="dialogVisible"
      title=""
      width="420px"
      :close-on-click-modal="false"
      :show-close="true"
      class="login-dialog"
      @close="handleClose"
      draggable
  >
    <div class="login-container">
      <!-- 顶部装饰条 -->
      <div class="login-accent-bar"></div>

      <!-- 标题区域 -->
      <div class="login-header">
        <div class="login-logo">
          <img src="/img/logo.ico" alt="logo" />
        </div>
        <h2 class="login-title">系统登录</h2>
        <p class="login-subtitle">双流运用车间孪生平台</p>
      </div>

      <!-- 表单区域 -->
      <div class="login-form">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <el-input
              v-model="username"
              placeholder="请输入用户名"
              prefix-icon="User"
              size="large"
              clearable
              @keyup.enter="handleLogin"
          />
        </div>

        <div class="form-group">
          <label class="form-label">密码</label>
          <el-input
              v-model="password"
              type="password"
              placeholder="请输入密码"
              prefix-icon="Lock"
              size="large"
              show-password
              clearable
              @keyup.enter="handleLogin"
          />
        </div>

        <!-- 登录按钮 -->
        <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-btn"
            @click="handleLogin"
        >
          {{ loading ? '登录中...' : '登 录' }}
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* ===== 对话框主体 ===== */
/* 穿透 Element Plus 对话框样式，自定义背景、圆角和阴影 */
.login-dialog :deep(.el-dialog) {
  /* 背景：纯白色，清爽简洁 */
  background: #ffffff;
  /* 圆角：16px，现代感设计 */
  border-radius: 16px;
  /* 双层阴影：外层 20px 模糊 + 内层 8px 模糊，营造浮层感 */
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.12),
    0 8px 24px rgba(0, 0, 0, 0.08);
  /* 溢出隐藏：确保内容不超出圆角边界 */
  overflow: hidden;
  /* 无边框：依赖阴影营造立体感 */
  border: none;
}

/* 对话框头部：隐藏默认头部（标题栏） */
.login-dialog :deep(.el-dialog__header) {
  /* 内边距：0，移除默认间距 */
  padding: 0;
  /* 外边距：0，移除默认间距 */
  margin: 0;
}

/* 对话框主体：移除默认内边距，由内部容器控制 */
.login-dialog :deep(.el-dialog__body) {
  /* 内边距：0，由 .login-container 统一管理 */
  padding: 0;
}

/* 关闭按钮：右上角关闭图标 */
.login-dialog :deep(.el-dialog__headerbtn .el-dialog__close) {
  /* 颜色：灰色，表示非活跃状态 */
  color: #94a3b8;
  /* 字号：20px，适中大小 */
  font-size: 20px;
  /* 距顶部：16px */
  top: 16px;
  /* 距右侧：16px */
  right: 16px;
  /* 过渡动画：颜色和旋转变化时平滑过渡 */
  transition: all 0.2s ease;
}

/* 关闭按钮悬停状态：高亮并旋转 */
.login-dialog :deep(.el-dialog__headerbtn .el-dialog__close:hover) {
  /* 颜色变为青色：#22d3ee，强调可点击 */
  color: #22d3ee;
  /* 旋转：90deg，增强交互反馈 */
  transform: rotate(90deg);
}

/* ===== 容器 ===== */
/* 登录弹窗内容容器，相对定位作为装饰条的定位上下文 */
.login-container {
  /* 相对定位：作为绝对定位子元素（装饰条）的定位上下文 */
  position: relative;
  /* 内边距：上 40px、左右 32px、下 32px，留出合理空间 */
  padding: 40px 32px 32px;
}

/* 顶部装饰条：渐变色动画条 */
.login-accent-bar {
  /* 绝对定位：相对于 .login-container 定位 */
  position: absolute;
  /* 距顶部：0，贴在最上方 */
  top: 0;
  /* 距左侧：0 */
  left: 0;
  /* 距右侧：0 */
  right: 0;
  /* 高度：4px，细条状 */
  height: 4px;
  /* 背景：青色到蓝色到青色的渐变，营造科技感 */
  background: linear-gradient(90deg, #22d3ee, #3b82f6, #22d3ee);
  /* 背景尺寸：200% 100%，为动画做准备 */
  background-size: 200% 100%;
  /* 动画：gradientSlide 3 秒循环播放，营造流动效果 */
  animation: gradientSlide 3s linear infinite;
}

/* 渐变色流动动画：背景位置从左到右循环 */
@keyframes gradientSlide {
  /* 起始：背景位置在左侧 */
  0% { background-position: 0% 50%; }
  /* 结束：背景位置在右侧 */
  100% { background-position: 200% 50%; }
}

/* ===== 头部区域 ===== */
/* 登录弹窗标题和 Logo 区域 */
.login-header {
  /* 文字居中 */
  text-align: center;
  /* 下外边距：32px，与表单区域分隔 */
  margin-bottom: 32px;
}

/* Logo 容器：方形渐变背景 */
.login-logo {
  /* 宽度：56px，方形 */
  width: 56px;
  /* 高度：56px，方形 */
  height: 56px;
  /* 外边距：0 auto 16px，水平居中，下方留 16px 间距 */
  margin: 0 auto 16px;
  /* 圆角：12px，柔和设计 */
  border-radius: 12px;
  /* 背景：青蓝渐变，低透明度 */
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.1), rgba(59, 130, 246, 0.1));
  /* 使用 flex 布局，Logo 图片居中 */
  display: flex;
  /* 垂直居中 */
  align-items: center;
  /* 水平居中 */
  justify-content: center;
  /* 边框：2px 青色，低透明度 */
  border: 2px solid rgba(34, 211, 238, 0.2);
}

/* Logo 图片：自适应容器大小 */
.login-logo img {
  /* 宽度：36px */
  width: 36px;
  /* 高度：36px */
  height: 36px;
  /* 对象填充：contain，保持宽高比 */
  object-fit: contain;
}

/* 登录标题：系统登录 */
.login-title {
  /* 字号：24px，突出标题 */
  font-size: 24px;
  /* 字重：700（加粗），强调 */
  font-weight: 700;
  /* 颜色：深灰色，深色主题 */
  color: #1e293b;
  /* 外边距：0 0 8px，下方留 8px 间距 */
  margin: 0 0 8px;
  /* 字间距：2px，增加科技感 */
  letter-spacing: 2px;
}

/* 登录副标题：系统描述 */
.login-subtitle {
  /* 字号：13px，较小 */
  font-size: 13px;
  /* 颜色：浅灰色，辅助信息 */
  color: #64748b;
  /* 外边距：0，无间距 */
  margin: 0;
  /* 字间距：1px，轻微增加 */
  letter-spacing: 1px;
}

/* ===== 表单区域 ===== */
/* 登录表单容器：flex 纵向布局 */
.login-form {
  /* 使用 flex 布局，纵向排列 */
  display: flex;
  /* 纵向排列 */
  flex-direction: column;
  /* 子元素间距：20px */
  gap: 20px;
}

/* 表单分组：用户名/密码输入框组 */
.form-group {
  /* 使用 flex 布局，纵向排列 */
  display: flex;
  /* 纵向排列 */
  flex-direction: column;
  /* 子元素间距：8px（标签和输入框之间） */
  gap: 8px;
}

/* 表单标签：用户名、密码等 */
.form-label {
  /* 字号：14px */
  font-size: 14px;
  /* 字重：600（半粗），强调标签 */
  font-weight: 600;
  /* 颜色：深灰色 */
  color: #475569;
  /* 字间距：0.5px，轻微增加 */
  letter-spacing: 0.5px;
}

/* ===== 输入框样式 ===== */
/* 穿透 Element Plus 输入框包装器，自定义背景和边框 */
.login-dialog :deep(.el-input__wrapper) {
  /* 背景：浅灰色，清爽简洁 */
  background: #f8fafc;
  /* 边框：1px 浅灰色 */
  border: 1px solid #e2e8f0;
  /* 圆角：8px */
  border-radius: 8px;
  /* 无阴影：保持简洁 */
  box-shadow: none;
  /* 内边距：上下 10px、左右 12px */
  padding: 10px 12px;
  /* 过渡动画：所有属性变化时平滑过渡 */
  transition: all 0.2s ease;
}

/* 输入框悬停状态：边框加深，背景亮化 */
.login-dialog :deep(.el-input__wrapper:hover) {
  /* 边框颜色加深 */
  border-color: #cbd5e1;
  /* 背景亮化 */
  background: #f1f5f9;
}

/* 输入框聚焦状态：青色边框和内阴影 */
.login-dialog :deep(.el-input__wrapper.is-focus) {
  /* 边框颜色变为青色 */
  border-color: #22d3ee;
  /* 背景变为白色，突出聚焦 */
  background: #ffffff;
  /* 内阴影：3px 青色光晕，强调聚焦状态 */
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.1);
}

/* 输入框内部文字 */
.login-dialog :deep(.el-input__inner) {
  /* 文字颜色：深灰色 */
  color: #1e293b;
  /* 字号：15px */
  font-size: 15px;
  /* 字重：500（中等），提升可读性 */
  font-weight: 500;
}

/* 占位符文字 */
.login-dialog :deep(.el-input__inner::placeholder) {
  /* 占位符颜色：浅灰色，表示非正式内容 */
  color: #94a3b8;
}

/* 输入框前缀图标 */
.login-dialog :deep(.el-input__prefix) {
  /* 图标颜色：灰色 */
  color: #64748b;
}

/* ===== 登录按钮 ===== */
/* 登录按钮：蓝色渐变背景 */
.login-btn {
  /* 上外边距：8px，与表单分隔 */
  margin-top: 8px;
  /* 高度：48px，大按钮便于点击 */
  height: 48px;
  /* 字号：16px，突出 */
  font-size: 16px;
  /* 字重：600（半粗），强调 */
  font-weight: 600;
  /* 字间距：4px，增加科技感 */
  letter-spacing: 4px;
  /* 圆角：8px */
  border-radius: 8px;
  /* 背景：青蓝渐变 */
  background: linear-gradient(135deg, #3a7ff0, #3b82f6);
  /* 无边框 */
  border: none;
  /* 文字颜色：白色 */
  color: #ffffff;
  /* 过渡动画：所有属性变化时平滑过渡 */
  transition: all 0.3s ease;
}

/* 登录按钮悬停状态：渐变加深，阴影增强，上移 */
.login-btn:hover {
  /* 背景：更深的蓝色渐变 */
  background: linear-gradient(135deg, #2562e9, #2563eb);
  /* 阴影：8px 青色发光，强调可点击 */
  box-shadow: 0 8px 24px rgba(34, 211, 238, 0.3);
  /* 上移：2px，增强按下感 */
  transform: translateY(-2px);
}

/* 登录按钮按下状态：恢复原位 */
.login-btn:active {
  /* 恢复原位，消除上移效果 */
  transform: translateY(0);
}

/* Element Plus 主色按钮穿透样式 */
.login-dialog :deep(.el-button--primary) {
  /* 背景：蓝色渐变 */
  background: linear-gradient(135deg, #3b81f4, #3b82f6);
  /* 无边框 */
  border: none;
}

/* Element Plus 主色按钮悬停状态 */
.login-dialog :deep(.el-button--primary:hover) {
  /* 背景：更深的蓝色渐变 */
  background: linear-gradient(135deg, #235edf, #2563eb);
  /* 阴影：8px 青色发光 */
  box-shadow: 0 8px 24px rgba(34, 211, 238, 0.3);
}

/* ===== 响应式适配 ===== */
/* 小屏幕适配（宽度 ≤ 480px） */
@media (max-width: 480px) {
  /* 对话框宽度：90%，适应小屏幕 */
  .login-dialog :deep(.el-dialog) {
    width: 90% !important;
  }

  /* 容器内边距：减少，节省空间 */
  .login-container {
    padding: 32px 24px 24px;
  }

  /* 标题字号：缩小到 20px */
  .login-title {
    font-size: 20px;
  }
}
</style>
