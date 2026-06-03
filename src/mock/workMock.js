/**
 * workMock.js — 股道作业（作业班组 / 登顶作业）演示数据
 *
 * 用途：在真实「交大机电」接口接入前，先行驱动 3D 列位作业标记与点击作业看板。
 * 真实接口接入后，将由 store 的 workByTrack 聚合数据替换本文件（按 dbId 关联），
 * 并把 USE_WORK_MOCK 置为 false 即可一键关闭演示数据。
 *
 * 作业对象结构（slot1Work / slot2Work）：
 *   {
 *     working:Boolean,       // 是否有进行中的作业
 *     isTop:Boolean,         // 是否登顶作业（高危，红色警示）
 *     crew:String,           // 作业班组名
 *     cardNo:String,         // 作业卡号
 *     dept:String,           // 所属部门/班组
 *     workerCount:Number,    // 作业人数
 *     trainNo:String,        // 车组号
 *     isElectrified:Number,  // 1=有电 0=无电
 *     antiSlip:Number,       // 1=已防溜 0=未防溜
 *     registerTime:String,   // 登记时间
 *     workers:Array<{name,group}>, // 作业人员名单
 *   }
 */

// 演示开关：真实接口接入后置为 false
export const USE_WORK_MOCK = true

/**
 * 将演示作业数据注入到主股道/存车道配置上（按列位挂 slot1Work / slot2Work）
 * @param {Array} mainCfg - 主股道配置数组（trainStore 构建）
 * @param {Array} sidingCfg - 存车道配置数组
 */
export function injectMockWork(mainCfg, sidingCfg) {
  if (!USE_WORK_MOCK) return

  // 主股道[0] 二位：地面作业班组（综合组，4 人）
  if (mainCfg && mainCfg[0]) {
    mainCfg[0].slot2Work = {
      working: true,
      isTop: false,
      crew: '综合组',
      cardNo: '1-1（综合组）',
      dept: '成厂',
      workerCount: 4,
      trainNo: mainCfg[0].name,
      isElectrified: 1,
      antiSlip: 0,
      registerTime: '2026-05-22 08:59:53',
      workers: [
        { name: '邓端', group: '整备队' },
        { name: '罗永翔', group: '机务D2' },
        { name: '李亚鹏', group: '机务D2' },
        { name: '刘才华', group: 'D1-1' },
      ],
    }
  }

  // 主股道[1] 一位：登顶作业（高危，红色警示）
  if (mainCfg && mainCfg[1]) {
    mainCfg[1].slot1Work = {
      working: true,
      isTop: true,
      crew: '检修一组',
      cardNo: 'DJ6-2(02801)',
      dept: '机务D2',
      workerCount: 2,
      trainNo: mainCfg[1].name,
      isElectrified: 0,
      antiSlip: 1,
      registerTime: '2026-05-22 09:20:10',
      workers: [
        { name: '王伟', group: '机务D2' },
        { name: '张敏', group: '机务D2' },
      ],
    }
  }

  // 存车道[0] 一位：地面作业班组（车电组，3 人）
  if (sidingCfg && sidingCfg[0]) {
    sidingCfg[0].slot1Work = {
      working: true,
      isTop: false,
      crew: '车电组',
      cardNo: '2-3（成厂）',
      dept: '成厂',
      workerCount: 3,
      trainNo: sidingCfg[0].name,
      isElectrified: 1,
      antiSlip: 0,
      registerTime: '2026-05-22 08:40:00',
      workers: [
        { name: '李强', group: '成厂' },
        { name: '陈刚', group: '成厂' },
        { name: '赵磊', group: '成厂' },
      ],
    }
  }
}
