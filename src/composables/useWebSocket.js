/**
 * WebSocket 数据变更监听服务
 * 连接后端 /ws/data-changes 端点，接收数据变更推送
 * 替代原有的 setInterval 轮询机制
 */
import { ref, onBeforeUnmount } from 'vue'
import { serviceBaseURL } from '../api/request.js'

// ========== 全局单例（多个组件共享同一条 WebSocket 连接） ==========
let _ws = null                    // WebSocket 实例
let _heartbeatTimer = null        // 心跳定时器
let _reconnectTimer = null        // 重连定时器
let _reconnectAttempts = 0        // 已重连次数
const MAX_RECONNECT_ATTEMPTS = 20 // 最大重连次数
const RECONNECT_INTERVAL = 3000   // 重连间隔（毫秒）
const HEARTBEAT_INTERVAL = 15000  // 心跳间隔（毫秒）

// 全局事件回调集合：{ entity -> Set<callback> }
const _listeners = new Map()

// 全局连接状态（响应式，所有使用者共享）
const connected = ref(false)

/**
 * 构建 WebSocket URL
 * 根据当前页面协议自动选择 ws:// 或 wss://
 */
function _buildWsUrl() {
  // serviceBaseURL 形如 http://hostname:8092
  const base = serviceBaseURL.replace(/^http/, 'ws')
  return `${base}/ws/data-changes`
}

/**
 * 启动心跳
 */
function _startHeartbeat() {
  _stopHeartbeat()
  _heartbeatTimer = setInterval(() => {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ type: 'ping' }))
    }
  }, HEARTBEAT_INTERVAL)
}

function _stopHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer)
    _heartbeatTimer = null
  }
}

/**
 * 处理收到的消息
 */
function _handleMessage(event) {
  try {
    const data = JSON.parse(event.data)
    // 心跳回复忽略
    if (data.type === 'pong') return

    if (data.type === 'data_changed') {
      const entity = data.entity || ''
      const action = data.action || ''
      const id = data.id || ''
      console.log(`[WS] 收到数据变更: entity=${entity}, action=${action}, id=${id}`)

      // 通知所有监听该 entity 的回调
      const entityCallbacks = _listeners.get(entity)
      if (entityCallbacks) {
        entityCallbacks.forEach(cb => {
          try { cb(data) } catch (e) { console.error('[WS] 回调执行出错:', e) }
        })
      }
      // 通知监听所有变更的回调（entity = '*'）
      const wildcardCallbacks = _listeners.get('*')
      if (wildcardCallbacks) {
        wildcardCallbacks.forEach(cb => {
          try { cb(data) } catch (e) { console.error('[WS] 回调执行出错:', e) }
        })
      }
    }
  } catch (e) {
    console.warn('[WS] 消息解析失败:', event.data, e)
  }
}

/**
 * 建立 WebSocket 连接
 */
function _connect() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  const url = _buildWsUrl()
  console.log('[WS] 正在连接:', url)

  try {
    _ws = new WebSocket(url)
  } catch (e) {
    console.error('[WS] 创建连接失败:', e)
    _scheduleReconnect()
    return
  }

  _ws.onopen = () => {
    console.log('[WS] 连接成功')
    connected.value = true
    _reconnectAttempts = 0
    _startHeartbeat()
  }

  _ws.onmessage = _handleMessage

  _ws.onclose = (event) => {
    console.log(`[WS] 连接关闭: code=${event.code}, reason=${event.reason}`)
    connected.value = false
    _stopHeartbeat()
    _scheduleReconnect()
  }

  _ws.onerror = (error) => {
    console.error('[WS] 连接错误:', error)
    connected.value = false
  }
}

/**
 * 安排重连
 */
function _scheduleReconnect() {
  if (_reconnectTimer) return
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn(`[WS] 已达最大重连次数(${MAX_RECONNECT_ATTEMPTS})，停止重连`)
    return
  }
  _reconnectAttempts++
  const delay = Math.min(RECONNECT_INTERVAL * _reconnectAttempts, 30000)
  console.log(`[WS] ${delay / 1000}秒后尝试第${_reconnectAttempts}次重连...`)
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null
    _connect()
  }, delay)
}

/**
 * 断开连接
 */
function _disconnect() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  _stopHeartbeat()
  if (_ws) {
    _ws.onclose = null // 防止触发自动重连
    _ws.close()
    _ws = null
  }
  connected.value = false
}

// ========== 对外暴露的 composable ==========

/**
 * WebSocket 数据变更监听 composable
 *
 * 用法：
 * ```js
 * const { onDataChange, wsConnected } = useWebSocket()
 * // 监听所有变更
 * onDataChange('*', (data) => { ... })
 * // 监听特定实体变更
 * onDataChange('stock-roadInfo', (data) => { ... })
 * ```
 */
export function useWebSocket() {
  // 当前组件注册的回调（用于组件卸载时自动清理）
  const _localRegistrations = []

  /**
   * 注册数据变更监听
   * @param {string} entity 实体类型，如 'stock-roadInfo'、'train-group'、'*'(全部)
   * @param {Function} callback 回调函数，参数为 { type, entity, action, id, timestamp }
   */
  function onDataChange(entity, callback) {
    if (!_listeners.has(entity)) {
      _listeners.set(entity, new Set())
    }
    _listeners.get(entity).add(callback)
    _localRegistrations.push({ entity, callback })
  }

  /**
   * 手动移除监听
   */
  function offDataChange(entity, callback) {
    const set = _listeners.get(entity)
    if (set) {
      set.delete(callback)
      if (set.size === 0) _listeners.delete(entity)
    }
  }

  // 确保连接已建立（首次调用时自动连接）
  if (!_ws || _ws.readyState === WebSocket.CLOSED) {
    _connect()
  }

  // 组件卸载时自动清理本组件注册的回调
  onBeforeUnmount(() => {
    _localRegistrations.forEach(({ entity, callback }) => {
      offDataChange(entity, callback)
    })
    _localRegistrations.length = 0
    // 如果没有任何监听者了，断开连接
    let totalListeners = 0
    _listeners.forEach(set => { totalListeners += set.size })
    if (totalListeners === 0) {
      _disconnect()
    }
  })

  return {
    /** WebSocket 连接状态 */
    wsConnected: connected,
    /** 注册数据变更监听 */
    onDataChange,
    /** 移除数据变更监听 */
    offDataChange,
  }
}
