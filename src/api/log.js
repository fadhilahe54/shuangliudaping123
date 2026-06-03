/**
 * 系统操作日志接口
 *
 * 提供系统日志的写入、查询和删除功能
 * 分为两种模式：
 *   - 登录用户日志（myLog）：需要登录权限
 *   - 匿名日志（anonymousSaveLog）：无需登录，用于记录访客访问等公开行为
 */
import api from './request.js'

// ========== 工具函数 ==========

/**
 * 将任意类型的值转换为字符串
 * - null/undefined 返回空字符串
 * - 对象/数组类型用 JSON.stringify 序列化
 * @param {*} value - 待转换的值
 * @returns {string}
 */
const normalizeText = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * 限制字符串长度，超出部分用 ... 截断
 * 防止日志内容过长导致数据库存储失败
 * @param {*} value - 待处理的值
 * @param {number} maxLength - 最大字符数
 * @returns {string}
 */
const limitText = (value, maxLength) => {
  const text = normalizeText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

// ========== 导出函数 ==========

/**
 * 获取当前登录用户的显示名
 * 从 localStorage 读取已登录用户信息
 * @returns {string} 用户真实姓名或账号，未登录时返回 '未知用户'
 */
export const getCurrentLogUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem('pzh_user') || '{}')
    return user.realName || user.username || '未知用户'
  } catch {
    return '未知用户'
  }
}

/**
 * 写入登录用户日志（需要登录频安全上下文）
 * @param {string} type    - 日志类型，最大 20 字符
 * @param {string} user    - 操作用户，最大 50 字符
 * @param {string} operate - 操作名称，最大 50 字符
 * @param {string} msg     - 日志内容，最大 200 字符
 * @returns {Promise}
 */
export const myLog = (type, user, operate, msg) => {
  const payload = {
    type: limitText(type, 20),
    user: limitText(user, 50),
    operate: limitText(operate, 50),
    msg: limitText(msg, 200),
  }

  return api.post('/log/saveLog', {
    ...payload,
  }).catch(error => {
    console.error('日志保存失败', error)
  })
}

/**
 * 写入匿名访问日志（无需登录，用于记录访客访问等广公行为）
 * @param {string} type    - 日志类型
 * @param {string} user    - 操作用户标识（匿名时可传 '访客'）
 * @param {string} operate - 操作名称
 * @param {string} msg     - 日志内容
 * @returns {Promise}
 */
export const anonymousSaveLog = (type, user, operate, msg) => {
  const payload = {
    type: limitText(type, 20),
    user: limitText(user, 50),
    operate: limitText(operate, 50),
    msg: limitText(msg, 200),
  }

  return api.post('/log/anonymousSaveLog', {
    ...payload,
  }).catch(error => {
    console.error('日志保存失败', error)
  })
}

/**
 * 快捷日志方法：自动读取当前登录用户并写入日志
 * @param {string} operate - 操作名称
 * @param {string} msg     - 日志内容
 * @param {string} [type='系统日志'] - 日志类型，默认为 '系统日志'
 * @returns {Promise}
 */
export const logOperation = (operate, msg, type = '系统日志') => {
  return myLog(type, getCurrentLogUser(), operate, msg)
}

/**
 * 分页查询日志列表
 * @param {Object} [condition={}] - 查询条件（可包含 type、user、operate 等字段）
 * @param {number} [page=0]       - 页码（从 0 开始）
 * @param {number} [size=15]      - 每页条数
 * @returns {Promise}
 */
export const queryLogs = (condition = {}, page = 0, size = 15) => {
  return api.post('/log/queryLogs', condition, { params: { page, size } })
}

/**
 * 按 ID 删除单条日志
 * @param {number} id - 日志 ID
 * @returns {Promise}
 */
export const deleteLogById = (id) => {
  return api.post('/log/deleteLogById', null, { params: { id } })
}
