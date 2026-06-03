/**
 * jiaodaApi.js — 「交大机电」外部系统接口（前端直连）
 *
 * 用途：从交大机电系统拉取股道、停放车组、作业登记（班组作业）、登顶作业数据，
 *      驱动 3D 大屏股道标牌两侧的「班组 / 登顶」指示灯。
 *
 * 说明：
 *   - 该系统与本项目后端(:8092)不同源，采用前端直连方式（需对方开启 CORS）。
 *   - 基址通过下方常量 JD_MECH_BASE_URL 配置；也可在部署时用
 *     window.__JD_MECH_BASE_URL__ 覆盖，便于不改包切换环境。
 *   - 该实例不携带 Cookie（withCredentials=false），避免触发带凭证的跨域预检失败。
 */
import axios from 'axios'

/* ============================================================
 * 基址配置
 *   TODO: 部署/联调时改成交大机电系统真实地址，例如：
 *         http://10.201.193.45:8081
 *   文档里的 http://127.0.0.1:4523/m1/... 是 apifox mock，仅供本地演示。
 * ============================================================ */
const DEFAULT_JD_MECH_BASE_URL = 'http://127.0.0.1:4523/m1/8360761-8126275-7873109'

/** 运行时基址：优先取全局变量覆盖，其次取默认值 */
export const JD_MECH_BASE_URL =
  (typeof window !== 'undefined' && window.__JD_MECH_BASE_URL__) || DEFAULT_JD_MECH_BASE_URL

// 交大机电系统专用 axios 实例
const jdApi = axios.create({
  baseURL: JD_MECH_BASE_URL,
  timeout: 15000,
  withCredentials: false, // 跨系统直连，不带 Cookie，减少 CORS 预检失败
})

/**
 * 统一响应处理：交大机电接口约定 { code, message, data }
 * code===0 为成功，返回 data；否则抛错。
 */
jdApi.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res && res.code !== undefined) {
      if (res.code === 0) return res.data
      return Promise.reject(new Error(res.message || '交大机电接口返回异常'))
    }
    return res
  },
  (error) => Promise.reject(error),
)

/**
 * 查询全部股道（DC1-DC7、DJ1-DJ8 等）
 * @returns {Promise<Array<{id:number,name:string,placeCount:number}>>}
 */
export const jdQueryTracks = () =>
  jdApi.get('/cr200j_integration_api/track/query_track', {
    params: { pageCode: 1, pageSize: 1000 },
  })

/**
 * 查询股道在停车组（含 bid、trackId、trackIndex、车组号）
 * @param {number[]} trackIds 股道ID列表
 * @param {number} [state=0] 停放状态（0=停放）
 * @returns {Promise<Array<Object>>}
 */
export const jdQueryParks = (trackIds, state = 0) =>
  jdApi.post('/cr200j_integration_api/park/query_park', {
    pageCode: 1,
    pageSize: 1000,
    param: { trackIds, state },
  })

/**
 * 按车组 bid 查询「班组作业」登记记录
 * @param {string} bid 停放车组业务ID
 * @returns {Promise<Array<Object>>} 记录数组（含 cardNo、workerCount、registerTimeStr 等）
 */
export const jdQueryRegisterWorkByBid = (bid) =>
  jdApi.get('/work_register_api/register_work_record/query_by_bid', {
    params: { bid },
  })

/**
 * 按车组 bid 查询「登顶作业」记录
 * @param {string} bid 停放车组业务ID
 * @returns {Promise<Array<Object>>} 登顶记录数组
 */
export const jdQueryTopWorkByBid = (bid) =>
  jdApi.get('/work_register_api/top_work_record/query_by_bid', {
    params: { bid },
  })

export default jdApi
