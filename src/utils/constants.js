/**
 * 全局常量定义 - 消除魔法数字
 * 股道数量和名称由后台数据动态决定，此处仅保留布局和默认常量
 */

// 列车类型
export const TRAIN_TYPE_EMU = 'emu'             // 动车组 CR200J
export const TRAIN_TYPE_CONV = 'conventional'   // 普速列车

// 主轨道布局配置
export const DEFAULT_TRACK_COUNT = 8            // 默认主轨道数量（后台无数据时的fallback）
export const TRACK_COUNT = 8                   // 兼容旧引用
export const CARRIAGES_PER_TRACK = 18           // 兼容旧引用
export const TRACK_SPACING = 6
export const TRACK_OFFSET = 5.5

// 按类型决定编组数
export const EMU_CARRIAGES_PER_TRACK = 9    // 动车组 9 节短编组
export const CONV_CARRIAGES_PER_TRACK = 16  // 普速 16 节长编组

// 默认轨道类型映射（后台无数据时的fallback）
export const TRACK_TRAIN_TYPE = {}
for (let i = 0; i < 4; i++) TRACK_TRAIN_TYPE[i] = TRAIN_TYPE_EMU
for (let i = 4; i < 12; i++) TRACK_TRAIN_TYPE[i] = TRAIN_TYPE_CONV

// 存车线路布局配置
export const DEFAULT_N_TRACK_COUNT = 4          // 默认存车道数量
export const N_TRACK_COUNT = 4                  // 兼容旧引用
export const N_CARRIAGES_PER_TRACK = 12
export const N_TRACK_SPACING = 5

/**
 * 根据主轨道数量计算存车道起始X坐标
 * @param {number} mainTrackCount 主轨道数量
 * @returns {number} 存车道起始X坐标
 */
export function calcNTrackStartX(mainTrackCount) {
  return (mainTrackCount - 1 - TRACK_OFFSET) * TRACK_SPACING + 10
}
export const N_TRACK_START_X = calcNTrackStartX(TRACK_COUNT)  // 兼容旧引用

// 车厢配置
export const CARRIAGE_SPACING = 12.2
export const CARRIAGE_Y = 1.75

// 列位车厢索引边界（与 trainStore.buildCarriagesFromTrainGroup 保持一致）
// 二列位车占 index [0, POS1_START_INDEX)，一列位车占 index [POS1_START_INDEX, ...)
export const POS1_START_INDEX = 9.5
export const POS2_START_INDEX = 0

// 枕木配置
export const SLEEPER_COUNT = 230
export const SLEEPER_START_Z = -36
export const SLEEPER_INTERVAL = 2

// 铁轨配置
export const RAIL_LENGTH = 460
export const RAIL_CENTER_Z = 193.5 // (-36.5 + 423.5) / 2

// 列车位置
export const TRAIN_POSITION_MIN = -30

// 列车进出库动画
export const TRAIN_ENTER_START = 500      // 出库终点 / 进库起点（远方位置）
export const TRAIN_ENTER_DURATION = 4     // 出库/进库动画时长（秒）

// 相机默认位置
// 相机默认配置
export const CAMERA_DEFAULT_POSITION = [-50, 35, -120] // 默认相机位置 [x, y, z]
export const CAMERA_DEFAULT_TARGET = [20, 0, 50]      // 默认相机观察目标点 [x, y, z]
export const CAMERA_FOV = 40                           // 视野角度 (Field of View)
export const CAMERA_NEAR = 0.5                         // 近裁剪面距离
export const CAMERA_FAR = 2000                        // 远裁剪面距离

// 飞行相机偏移
export const FLY_CAMERA_OFFSET = [25, 15, 25]

// 场景颜色
export const SCENE_BG_COLOR = '#87CEEB'
export const SCENE_FOG_NEAR = 150
export const SCENE_FOG_FAR = 600
