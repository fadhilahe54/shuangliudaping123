import * as THREE from 'three'

/**
 * 高画质材质升级器
 *
 * 背景：为优化老电脑性能，项目把所有 MeshStandardMaterial 替换成了 MeshLambertMaterial。
 * Lambert 没有镜面高光，所有档位都失去了"金属/光泽"质感。
 *
 * 本工具仅在「高画质」档位生效：场景构建完成后遍历一次，
 * 把所有 MeshLambertMaterial 升级成 MeshPhongMaterial（带 specular，便宜，不需要 envMap）。
 *
 * - 共享材质只升级一次（WeakMap 缓存）
 * - 保留原材质所有共有属性：贴图 / 颜色 / 透明度 / 双面 / 自发光 / 深度等
 * - 中/低画质保持 Lambert，不调用本函数
 */

// 同一个 Lambert 实例 → 同一个升级后的 Phong（避免重复 GPU 上传）
// 使用 let 而非 const，以便 clearPhongCache 可通过重新赋值来清空缓存
let _lambertToPhong = new WeakMap()

/**
 * 重置 Phong 缓存（内部函数）
 * 将 _lambertToPhong 替换为空的 WeakMap，
 * 旧 WeakMap 中引用的 Phong 材质会在 GC 时自动释放
 */
function _resetPhongCache() {
  _lambertToPhong = new WeakMap()
}

/**
 * 升级单个材质
 * @param {THREE.Material} mat
 * @returns {THREE.Material}
 */
function upgradeMaterial(mat) {
  if (!mat || !mat.isMeshLambertMaterial) return mat
  const cached = _lambertToPhong.get(mat)
  if (cached) return cached

  const phong = new THREE.MeshPhongMaterial({
    color: mat.color ? mat.color.clone() : undefined,
    map: mat.map || null,
    transparent: !!mat.transparent,
    opacity: mat.opacity != null ? mat.opacity : 1,
    side: mat.side,
    emissive: mat.emissive ? mat.emissive.clone() : undefined,
    emissiveMap: mat.emissiveMap || null,
    emissiveIntensity: mat.emissiveIntensity != null ? mat.emissiveIntensity : 1,
    alphaTest: mat.alphaTest || 0,
    depthTest: mat.depthTest !== false,
    depthWrite: mat.depthWrite !== false,
    vertexColors: !!mat.vertexColors,
    fog: mat.fog !== false,
    name: mat.name || '',
    // 适度高光，避免塑料感；具体数值参考早期 Standard 渲染观感
    shininess: 25,
    specular: new THREE.Color(0x222222),
  })

  // 释放 Lambert 的 GPU program 资源（贴图所有权已转移给 Phong，不会被释放）
  mat.dispose && mat.dispose()
  _lambertToPhong.set(mat, phong)
  return phong
}

/**
 * 遍历场景把所有 Lambert 升级为 Phong
 * @param {THREE.Object3D} root
 */
export function upgradeSceneMaterialsToPhong(root) {
  if (!root) return
  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isInstancedMesh) return
    const mat = obj.material
    if (Array.isArray(mat)) {
      obj.material = mat.map((m) => upgradeMaterial(m))
    } else {
      obj.material = upgradeMaterial(mat)
    }
  })
}

/**
 * 清空 Lambert→Phong 升级缓存
 * 在场景全量销毁时调用，防止已变色的共享 Phong 材质被下次场景复用
 *
 * 背景：高画质模式下 upgradeSceneMaterialsToPhong 把共享 Lambert 替换为共享 Phong，
 * 如果旧版 updateCarriageVisual 的 bug 曾直接修改过共享 Phong 的颜色（如 #2563eb 蓝色），
 * WeakMap 缓存会持续返回已变色的 Phong 实例，导致新场景也变蓝。
 * 清空缓存后，下次 initScene 时 upgradeSceneMaterialsToPhong 会从原始 Lambert 重新创建干净的 Phong。
 */
export function clearPhongCache() {
  _resetPhongCache()
}
