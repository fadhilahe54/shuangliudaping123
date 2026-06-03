<!--
  AboutSystemTab.vue -- 关于系统信息展示页
  展示系统技术栈版本、联系信息等静态信息：
    - 系统 Logo 和名称
    - 技术栈信息列表（操作系统/数据库/后端框架/前端框架）
    - 联系信息（技术支持/电话）
    - 版权声明
  使用方：
    - AdminView.vue 后台管理关于 Tab
    - UIOverlay.vue 顶部关于弹窗（通过 AboutSystemTab 组件嵌入）
-->
<script setup>
import { ref, onMounted } from 'vue'

// 系统技术栈信息（静态配置，直接展示）
const sysInfo = ref([
  { label: '操作系统', value: 'Windows Server 2022' },
  { label: '数据库版本', value: 'MySQL 8.0.28  +  Redis 5.0' },
  { label: '后端框架', value: 'Spring Boot 4.0.4 + Spring Security 7.0.4  +  Webflux 7.0.6' },
  { label: '前端框架', value: 'Vue 3.5.13 + Element Plus 2.9.5  +  ThreeJS 0.183.2' },
])

const contactInfo = ref([
  { label: '技术支持', value: '信息组' },
  { label: '电话', value: '028-864-39212' },
])

const ProjectTeamInfo = ref([
  { label: '前端', value: '王天智、王梓阳' },
  { label: '后端', value: '胡方博' },
])

const isVisible = ref(false)

onMounted(() => {
  isVisible.value = true
})

const loadData = () => {}

defineExpose({ loadData })
</script>

<template>
  <div class="about-container">

    <div class="about-content-wrapper">
      <el-card shadow="never" class="about-card" :class="{ 'card-animate': isVisible }">
        <div class="about-content">
          <div class="logo-card" :class="{ 'animate-slide-in-left': isVisible }">
            <div class="logo-icon">
              <img src="/img/logo.ico" alt="Logo" class="logo-img" />
            </div>
            <h2 class="sys-name">双流运用车间孪生平台</h2>
            <p class="version">版本：v1.0.20260513</p>
            <p class="build-date">构建日期：20260513</p>
            <p class="copyright">© 2026 成都车辆段</p>
          </div>

          <div class="divider-vertical"></div>

          <div class="info-section" :class="{ 'animate-slide-in-right': isVisible }">
            <h3 class="section-title">系统信息</h3>
            <div class="info-list">
              <div v-for="(item, idx) in sysInfo" :key="idx" class="info-row" :style="{ 'animation-delay': (idx * 0.1 + 0.3) + 's' }" :class="{ 'animate-fade-in': isVisible }">
                <span class="info-label">{{ item.label }}：</span>
                <span class="info-value">{{ item.value }}</span>
              </div>
            </div>

            <h3 class="section-title mt-6">联系我们</h3>
            <div class="info-list">
              <div v-for="(item, idx) in contactInfo" :key="'c'+idx" class="info-row" :style="{ 'animation-delay': (idx * 0.1 + 0.7) + 's' }" :class="{ 'animate-fade-in': isVisible }">
                <span class="info-label">{{ item.label }}：</span>
                <span class="info-value">{{ item.value }}</span>
              </div>
            </div>

            <h3 class="section-title mt-6">项目团队</h3>
            <div class="info-list">
              <div v-for="(item, idx) in ProjectTeamInfo" :key="'c'+idx" class="info-row" :style="{ 'animation-delay': (idx * 0.1 + 0.7) + 's' }" :class="{ 'animate-fade-in': isVisible }">
                <span class="info-label">{{ item.label }}：</span>
                <span class="info-value">{{ item.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.about-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
}

.page-header {
  background: #fff;
  padding: 16px 24px;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.about-content-wrapper {
  flex: 1;
  padding: 24px;
  overflow: auto;
}

.about-card {
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.about-card.card-animate {
  opacity: 1;
  transform: translateY(0);
}

.about-content {
  display: flex;
  gap: 32px;
  padding: 32px;
}

.logo-card {
  flex-shrink: 0;
  width: 300px;
  padding: 40px 24px;
  background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
  border-radius: 12px;
  border: 2px solid #e8e8e8;
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04),
    inset 0 2px 4px rgba(255, 255, 255, 0.5);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0;
  transform: translateX(-30px);
  transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.logo-card.animate-slide-in-left {
  opacity: 1;
  transform: translateX(0);
}

.logo-icon {
  width: 110px;
  height: 110px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  animation: logoFloat 3s ease-in-out infinite;
}

@keyframes logoFloat {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-5px) rotate(2deg);
  }
}

.sys-name {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.version {
  margin: 0 0 8px;
  font-size: 13px;
  color: #909399;
}

.build-date {
  margin: 0 0 8px;
  font-size: 12px;
  color: #b0b0b0;
}

.copyright {
  margin: 0;
  font-size: 12px;
  color: #b0b0b0;
}

.divider-vertical {
  width: 1px;
  background: linear-gradient(180deg, transparent 0%, #e8e8e8 20%, #e8e8e8 80%, transparent 100%);
  flex-shrink: 0;
  align-self: stretch;
}

.info-section {
  flex: 1;
  padding: 8px 0;
  opacity: 0;
  transform: translateX(30px);
  transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  transition-delay: 0.2s;
}

.info-section.animate-slide-in-right {
  opacity: 1;
  transform: translateX(0);
}

.section-title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  position: relative;
  padding-left: 12px;
}

.section-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #2a86a5, #2983a2);
  border-radius: 2px;
}

.mt-6 {
  margin-top: 24px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.info-row {
  display: flex;
  align-items: flex-start;
  font-size: 14px;
  line-height: 1.8;
  opacity: 0;
  transform: translateX(20px);
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.info-row.animate-fade-in {
  opacity: 1;
  transform: translateX(0);
}

.info-label {
  color: #909399;
  white-space: nowrap;
  min-width: 110px;
  flex-shrink: 0;
  font-weight: 500;
}

.info-value {
  color: #303133;
  word-break: break-all;
  font-weight: 500;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
