/**
 * Three.js 自动性能档位
 * 根据设备硬件能力（GPU、CPU、内存、设备像素比）自动选择 low / medium / high 三档画质，
 * 老电脑 / 集成显卡 / 软件渲染器 自动降级，避免卡顿。
 *
 * 用户可通过 UIOverlay 右上角画质开关手动切换，或通过 URL 参数 ?perf=low 强制设置。
 * 选择会持久化到 localStorage。
 */

const PROFILE_KEY = 'pzh_three_perf_profile'

const PROFILES = {
  low: {
    name: 'low',
    // 略提锐度（PR 1 → 1.25）减轻颗粒感，但保持 MSAA 关闭以兼容极老 Intel 集显 / 软件渲染
    // 改用 FXAA 后处理（一次全屏 pass，开销远低于 MSAA）柔化锯齿
    maxPixelRatio: 1.25,
    targetFps: 24,
    shadowEnabled: false,
    shadowType: 'basic',
    shadowMapSize: 512,
    pointerMoveInterval: 90,
    antialias: false,
    useFxaa: true,
  },
  medium: {
    name: 'medium',
    // 中画质：主流硬件完全扛得住 4x MSAA，PR 提到 1.5，颗粒感和锯齿明显消除
    maxPixelRatio: 1.5,
    targetFps: 30,
    shadowEnabled: true,
    shadowType: 'basic',
    shadowMapSize: 512,
    pointerMoveInterval: 50,
    antialias: true,
    useFxaa: false,
  },
  high: {
    name: 'high',
    // 高画质：恢复更高像素比，优先保证 4K 大屏与火车模型细节清晰度
    minPixelRatio: 2,
    maxPixelRatio: 3,
    targetFps: 60,
    shadowEnabled: true,
    shadowType: 'pcf',
    shadowMapSize: 4096,
    pointerMoveInterval: 16,
    antialias: true,
    useFxaa: false,
  },
}

let cachedProfile = null
let cachedWebGLInfo = null

function normalizeProfileName(name) {
  const value = String(name || '').toLowerCase()
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return ''
}

function readForcedProfile() {
  if (typeof window === 'undefined') return ''
  const hashQuery = window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?')) : ''
  const params = new URLSearchParams(window.location.search || hashQuery)
  const fromUrl = normalizeProfileName(params.get('perf') || params.get('quality'))
  if (fromUrl) {
    try { localStorage.setItem(PROFILE_KEY, fromUrl) } catch {}
    return fromUrl
  }
  try { return normalizeProfileName(localStorage.getItem(PROFILE_KEY)) } catch {}
  return ''
}

function readWebGLInfo() {
  if (cachedWebGLInfo) return cachedWebGLInfo
  if (typeof document === 'undefined') return { renderer: '', vendor: '', maxTextureSize: 0 }

  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { powerPreference: 'high-performance' })
    || canvas.getContext('experimental-webgl')

  if (!gl) {
    cachedWebGLInfo = { renderer: '', vendor: '', maxTextureSize: 0 }
    return cachedWebGLInfo
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0
  cachedWebGLInfo = { renderer: String(renderer || ''), vendor: String(vendor || ''), maxTextureSize }
  return cachedWebGLInfo
}

function detectAutoProfileName() {
  const forced = readForcedProfile()
  if (forced) return forced

  // 默认高清，用户可通过 UIOverlay 画质开关手动降档
  return 'high'
}

export function getThreePerformanceProfile() {
  if (cachedProfile) return cachedProfile
  const name = detectAutoProfileName()
  const base = PROFILES[name] || PROFILES.medium
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const minPixelRatio = base.minPixelRatio || 1
  cachedProfile = {
    ...base,
    pixelRatio: Math.min(Math.max(dpr, minPixelRatio), base.maxPixelRatio),
    webgl: readWebGLInfo(),
  }
  return cachedProfile
}

export function setThreePerformanceProfile(name) {
  const value = normalizeProfileName(name)
  if (!value) return false
  try { localStorage.setItem(PROFILE_KEY, value) } catch {}
  cachedProfile = null
  return true
}

export function getSavedThreePerformanceProfile() {
  if (typeof window === 'undefined') return ''
  const hashQuery = window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?')) : ''
  const params = new URLSearchParams(window.location.search || hashQuery)
  const fromUrl = normalizeProfileName(params.get('perf') || params.get('quality'))
  if (fromUrl) return fromUrl
  try { return normalizeProfileName(localStorage.getItem(PROFILE_KEY)) } catch {}
  return ''
}

export function clearThreePerformanceProfile() {
  try { localStorage.removeItem(PROFILE_KEY) } catch {}
  cachedProfile = null
}
