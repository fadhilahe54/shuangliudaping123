/**
 * 调度大屏数据接口
 * 对接后端 diaodudaping_PZH_service 各模块API
 */
import api from './request.js'
import { upFileApi, loginApi } from './request.js'

// ========== 用户登录 ==========
/** 根据用户名查询用户（用于登录验证） */
export const login = (data) => loginApi.post('/api/auth/login', data )
export const logout = () => loginApi.post('/logout')
export const getUserByName = (username) => api.get('/user/getUserByName', { params: { username } })
/** 获取所有用户 */
export const getAllUsers = () => api.get('/user/getAllUser')
/** 保存/新增用户 */
export const saveUser = (data) => api.post('/user/saveUser', data)
export const updateUser = (data) => api.post('/user/updateUser', data, { params: { id: data.id } })
/** 删除用户 */
export const deleteUserById = (id) => api.post('/user/deleteUserById', null, { params: { id } })
/** 启用/禁用用户（enabled=true 启用，false 禁用） */
export const updateUserStatus = (id, enabled) => api.post('/user/updateUserStatus', null, { params: { id, enabled } })
/** 获取所有角色 */
export const getAllRoles = () => api.get('/roles/getAllRoles')
/** 新增角色 */
export const createRole = (data) => api.post('/roles/createRole', data)
/** 更新角色 */
export const updateRole = (data) => api.post('/roles/updateRole', data)
/** 删除角色 */
export const deleteRoleById = (id) => api.delete(`/roles/${id}`)
/** 获取用户角色 */
export const getRoleByUserId = (userId) => api.get(`/roles/user/${userId}`)
/** 替换用户角色 */
export const replaceUserRoles = (userId, roleIds) => api.post('/roles/replaceUserRoles', roleIds, { params: { userId } })
/** 获取所有权限 */
export const getAllPermissions = () => api.get('/permissions')
/** 新增权限 */
export const createPermission = (data) => api.post('/permissions', data)
/** 更新权限 */
export const updatePermission = (id, data) => api.put(`/permissions/${id}`, data)
/** 删除权限 */
export const deletePermissionById = (id) => api.delete(`/permissions/${id}`)
/** 获取角色权限 */
export const getPermissionsByRoleId = (roleId) => api.get(`/permissions/role/${roleId}`)
/** 替换角色权限 */
export const replaceRolePermissions = (roleId, permissionIds) => api.post('/permissions/replaceRolePermissions', permissionIds, { params: { roleId } })

// ========== 总体信息（统计 + 当班重点信息） ==========
/** 获取所有总体信息 */
export const getAllSInfo = () => api.get('/sInfo/getAllSInfo')
/** 根据ID获取总体信息 */
export const getSInfoById = (id) => api.get('/sInfo/getSInfoById', { params: { id } })
/** 保存总体信息 */
export const saveSInfo = (data) => api.post('/sInfo/saveSInfo', data)
/** 删除总体信息 */
export const deleteSInfoById = (id) => api.post('/sInfo/deleteWorkerById', null, { params: { id } })

// ========== 值班人员 ==========
/** 获取所有值班人员 */
export const getAllWorkers = () => api.get('/worker/getAllWorkers')
/** 根据ID获取值班人员 */
export const getWorkerById = (id) => api.get('/worker/getWorkerById', { params: { id } })
/** 保存值班人员 */
export const saveWorker = (data) => api.post('/worker/saveWorker', data)
/** 删除值班人员 */
export const deleteWorkerById = (id) => api.post('/worker/deleteWorkerById', null, { params: { id } })

// ========== 值班岗位 ==========
/** 获取所有值班岗位 */
export const getAllJobs = () => api.get('/job/getAllJobs')
/** 保存值班岗位 */
export const saveJob = (data) => api.post('/job/saveJob', data)
/** 删除值班岗位 */
export const deleteJobById = (id) => api.post('/job/deleteWorkerById', null, { params: { id } })

// ========== 值班模块（岗位+人员关联） ==========
/** 获取所有值班信息（岗位含关联人员） */
export const getAllJobInfo = () => api.get('/jobinfo/getAllJobs')
/** 保存值班关联（岗位id和人员id） */
export const saveJobWorker = (data) => api.post('/jobinfo/saveJ_W', data)
/** 删除岗位下所有关联（按岗位id全部删除） */
export const deleteJobWorker = (岗位id) => api.post('/jobinfo/delJ_W', null, { params: { 岗位id } })
/** 删除岗位下具体某个人员的单条关联 */
export const deleteJobWorkerOne = (岗位id, 人员id) => api.post('/jobinfo/delOneJ_W', null, { params: { 岗位id, 人员id } })

// ========== 车组信息 ==========
/** 获取所有车组信息 */
export const getAllTrains = () => api.get('/train/getAllTrains')
/** 根据ID获取车组信息 */
export const getTrainById = (id) => api.get('/train/getTrainById', { params: { id } })
/** 保存车组信息 */
export const saveTrain = (data) => api.post('/train/saveTrain', data)
/** 删除车组信息 */
export const deleteTrainById = (id) => api.post('/train/deleteTrainById', null, { params: { id } })
/** 多条件分页查询车辆信息（page 从 0 开始） */
export const queryTrains = (condition, page = 0, size = 15) =>
  api.post('/train/queryTrains', condition || {}, { params: { page, size } })

// ========== 车组状态 ==========
/** 获取所有车组状态 */
export const getAllTrainStatus = () => api.get('/train-status/getAllTrainStatus')
/** 保存车组状态 */
export const saveTrainStatus = (data) => api.post('/train-status/saveTrainStatus', data)
/** 删除车组状态 */
export const deleteTrainStatusById = (id) => api.post('/train-status/deleteTrainStatuById', null, { params: { id } })

// ========== 交路信息 ==========
/** 获取所有交路信息 */
export const getAllTrainGroup = () => api.get('/train-group/getAllTrainGroup')
/** 保存交路信息 */
export const saveTrainGroup = (data) => api.post('/train-group/saveTrainGroup', data)
/** 删除交路信息 */
export const deleteTrainGroupById = (id) => api.post('/train-group/deleteTrainGroupById', null, { params: { id } })

// ========== 股道信息 ==========
/** 获取所有股道信息 */
export const getAllStockRoad = () => api.get('/stock-road/getAllStockRoad')
/** 保存股道信息 */
export const saveStockRoad = (data) => api.post('/stock-road/saveStockRoad', data)
/** 删除股道信息 */
export const deleteStockRoadById = (id) => api.post('/stock-road/deleteStockRoadById', null, { params: { id } })
/** 修改股道重联状态 */
export const updateLinkStatusById = (id, 重联状态) => api.post('/stock-road/updateLinkStatusById', null, { params: { id, 重联状态 } })
/** 修改股道列位接触网状态（列位: '1'|'2'，接触网状态: '有电'|'无电'|'接地'|'故障'|null） */
export const updateStockRoadElectState = (id, 列位, 接触网状态) => api.post('/stock-road/updateStockRoadElectState', null, { params: { id, 列位, 接触网状态 } })

// ========== 股道模块（股道+关联车组聚合查询） ==========
/** 获取所有股道信息（含关联车组及车辆） */
export const getAllStockRoadInfo = () => api.get('/stock-roadInfo/getAllStockRoadInfo')

// ========== 车次信息 ==========
/** 获取所有车次信息 */
export const getAllTrainNumber = () => api.get('/train-number/getAllTrainNumber')
/** 保存车次信息 */
export const saveTrainNumber = (data) => api.post('/train-number/saveTrainNumber', data)
/** 删除车次信息 */
export const deleteTrainNumberById = (id) => api.post('/train-number/deleteWorkerById', null, { params: { id } })

// ========== 车组信息（车组模块） ==========
/** 获取所有车组信息（含关联车辆） */
export const getAllTrainGroupsInfo = () => api.get('/TrainGroupInfo/getAllTrainGroupsInfo')
/** 保存车组-车辆关联 */
export const saveTrainGroupRelation = (data) => api.post('/TrainGroupInfo/saveZ_C', data)
/** 删除车组下所有车辆关联（按车组id） */
export const deleteTrainGroupRelation = (车组id) => api.post('/TrainGroupInfo/delZ_C', null, { params: { 车组id } })
/** 删除单个车组-车辆关联（按车组id + 车辆id） */
export const deleteOneTrainGroupRelation = (车组id, 车辆id) => api.post('/TrainGroupInfo/delOneZ_C', null, { params: { 车组id, 车辆id } })
/** 批量保存车组编组（一次请求完成所有车组的关联更新+车辆序号更新） */
export const batchSaveTrainGroupBindings = (batchList) => api.post('/TrainGroupInfo/batchSaveBindings', batchList)

// ========== 车组信息（基础 CRUD） ==========
/** 获取所有车组信息 */
export const getAllTrainGroupBase = () => api.get('/trainGroup/getAllTrainGroups')
/** 保存车组信息 */
export const saveTrainGroupBase = (data) => api.post('/trainGroup/saveTrainGroup', data)
/** 删除车组信息 */
export const deleteTrainGroupBaseById = (id) => api.post('/trainGroup/deleteTrainGroupById', null, { params: { id } })

// ========== 车组状态模块（状态-车组关联） ==========
/** 获取所有车组状态信息（含关联车组） */
export const getAllTrainStatusInfo = () => api.get('/trainStatusInfo/getAlltrainStatusInfo')
/** 保存车组状态-车组关联 */
export const saveTrainStatusRelation = (data) => api.post('/trainStatusInfo/saveStatu_Zu', data)
/** 删除状态下所有车组关联（按状态id） */
export const deleteTrainStatusRelation = (状态id) => api.post('/trainStatusInfo/delStatu_Zu', null, { params: { 状态id } })

// ========== 股道模块（股道-车组关联管理） ==========
/** 保存股道-车组关联 */
export const saveStockRoadRelation = (data) => api.post('/stock-roadInfo/saveL_z', data)
/** 删除列位下所有车组关联（按列位id） */
export const deleteStockRoadRelation = (列为id) => api.post('/stock-roadInfo/delL_Z', null, { params: { 列为id } })
/** 删除单条股道-车组关联（按列位id + 车组id） */
export const deleteOneStockRoadRelation = (列位id, 车组id) => api.post('/stock-roadInfo/delOneZ_C', null, { params: { 列位id, 车组id } })

// ========== 交路关联模块（交路-车次-车组关联管理） ==========
/** 获取所有交路关联 */
export const getAllRouteBindInfo = () => api.get('/train-routeInfo/getAllRouteBindInfo')
/** 获取所有车次交路聚合信息（车次 → 交路 → 车组） */
export const getAllTrainNumberRouteInfo = () => api.get('/train-routeInfo/getAllTrainNumberRouteInfo')
/** 根据交路id查询关联 */
export const getRouteBindByRouteId = (交路id) => api.get('/train-routeInfo/getByRouteId', { params: { 交路id } })
/** 保存交路关联 */
export const saveRouteBind = (data) => api.post('/train-routeInfo/saveRouteBind', data)
/** 按交路id删除所有关联 */
export const deleteRouteBindByRouteId = (交路id) => api.post('/train-routeInfo/delByRouteId', null, { params: { 交路id } })
/** 精确删除单条交路关联 */
export const deleteOneRouteBind = (交路id, 车次id, 车组id) => api.post('/train-routeInfo/delOneRouteBind', null, { params: { 交路id, 车次id, 车组id } })

// ========== 交路轮转配置（定期替车组轮转插入交路） ==========
/** 获取所有交路轮转配置 */
export const getAllRouteRotateConfig = () => api.get('/train-routeRotate/getAllRouteRotateConfig')
/** 按 ID 获取交路轮转配置 */
export const getRouteRotateConfigById = (id) => api.get('/train-routeRotate/getRouteRotateConfigById', { params: { id } })
/** 保存交路轮转配置 */
export const saveRouteRotateConfig = (data) => api.post('/train-routeRotate/saveRouteRotateConfig', data)
/** 按 ID 删除交路轮转配置 */
export const deleteRouteRotateConfigById = (id) => api.post('/train-routeRotate/deleteRouteRotateConfigById', null, { params: { id } })
/** 从已有交路关联数据导入轮转配置 */
export const importRouteRotateFromBind = () => api.post('/train-routeRotate/importFromRouteBind')
/** 预览指定配置下一次轮转结果 */
export const previewNextRouteRotate = (id) => api.get('/train-routeRotate/previewNextRotate', { params: { id } })
/** 立即执行交路轮转（全部配置） */
export const rotateRouteNow = () => api.post('/train-routeRotate/rotateNow')
/** 立即执行单个交路轮转 */
export const rotateRouteOne = (id) => api.post('/train-routeRotate/rotateOne', null, { params: { id } })

// ========== 文件上传 ==========
/** 上传头像图片，返回 { url: '/uploads/avatar/xxx.png' } */
export const uploadAvatar = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return upFileApi.post('/file/uploadAvatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

/** 获取历史已上传头像列表 */
export const getAvatarList = () => api.get('/file/getAvatarList')

// ========== 统一搜索（基于数据库视图聚合，后端 SearchController） ==========
/**
 * 综合搜索车组 / 车辆 / 车次
 * @param {string} keyword 搜索关键词
 * @param {string} [type='all'] 搜索类型：all / group / vehicle / carriage / trainNo / type
 * @param {number} [limit=20] 每类最多返回数量
 * @returns {Promise<{keyword:string,type:string,汇总:object,最优命中:object|null,车组列表:Array,车辆列表:Array,车次列表:Array}>}
 */
export const unifiedSearch = (keyword, type = 'all', limit = 20) =>
  api.get('/search/unified', { params: { keyword, type, limit } })

/**
 * 按车组 id 拉取该车组下的车辆清单（来自 v_统一搜索_车辆明细 视图）
 * @param {number|string} 车组id
 * @returns {Promise<Array>}
 */
export const getGroupVehiclesUnified = (车组id) =>
  api.get('/search/getGroupVehicles', { params: { 车组id } })

// ========== 股道列位级动画广播 ==========
/** 广播股道列位级动画事件（多端同步开进/开出） */
export const broadcastStockRoadSlotAnim = (data) =>
  api.post('/stock-road-anim/broadcast', null, { params: data })
