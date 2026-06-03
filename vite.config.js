import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'

/**
 * Vite 配置
 * - 开发环境保留全部 console，便于调试
 * - 生产构建(vite build)时：
 *   · 将 console.log / console.info / console.debug 标记为 pure，由 esbuild 在压缩阶段作为死代码剔除
 *   · 移除所有 debugger 语句
 *   · 保留 console.warn / console.error，保证线上故障仍可追踪
 */
export default defineConfig(({ command }) => ({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * 手动分包策略：
         * 将大型第三方库拆成独立 chunk，好处：
         * 1. 首屏可并行下载多个小文件（而非等待一个 2.8MB 巨包）
         * 2. 库代码很少变动，浏览器可长效缓存（只有业务代码更新时才重新下载）
         * 3. 按需加载的路由页面不会被打进主包
         */
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // three.js 核心 + addons（~800KB）
            if (id.includes('three')) return 'vendor-three'
            // echarts（~900KB）
            if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts'
            // element-plus + 图标（~600KB）
            if (id.includes('element-plus') || id.includes('@element-plus')) return 'vendor-element'
            // datav 数据可视化组件（~200KB）
            if (id.includes('datav')) return 'vendor-datav'
            // vue 全家桶（vue + vue-router + pinia，~120KB）
            if (id.includes('vue') || id.includes('pinia') || id.includes('@vue')) return 'vendor-vue'
            // 其余第三方（gsap、axios 等小库合并）
            return 'vendor-misc'
          }
        },
      },
    },
    // 单个 chunk 警告阈值（KB），超过此值构建时会提示
    chunkSizeWarningLimit: 1000,
  },
  esbuild: command === 'build'
    ? {
        // 标记为纯函数调用，压缩时若返回值未被使用则直接丢弃整条语句
        pure: ['console.log', 'console.info', 'console.debug'],
        // 直接移除 debugger 语句
        drop: ['debugger'],
      }
    : {},
}))
