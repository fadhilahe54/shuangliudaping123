/**
 * PostProcessing.js — Three.js 后处理管线
 *
 * 低画质下禁用 MSAA（多重采样抗锯齿），改用 FXAA（快速近似抗锯齿）全屏后处理
 * FXAA 在 GPU 上仅需一次全屏着色器 pass，开销约 1~3%，适合老显卡和大屏低帧场景
 */
import * as THREE from 'three'
// 后处理合成器（管理多个 pass 的执行顺序）
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
// 场景正常渲染 pass（将 scene + camera 渲染到中间 RenderTarget）
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
// 着色器 pass 包装器（用于 FXAA 等自定义着色器）
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
// 输出 pass（将线性空间还原为 sRGB + 应用色调映射）
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
// FXAA 着色器定义（Fast Approximate Anti-Aliasing，快速近似抗锯齿）
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

/**
 * 低画质 FXAA 后处理管线
 *
 * 用途：低档关闭 MSAA 以兼容老 GPU / 软件渲染，但用 FXAA 一次全屏 pass 柔化锯齿，
 * 视觉上几乎看不出颗粒感，而开销远低于 MSAA（约 1~3% GPU）。
 *
 * - 调用方在 _animate 里使用 composer.render() 替代 renderer.render()
 * - resize 时调用 updateSize(width, height) 同步分辨率
 * - dispose 时调用 dispose() 释放 RenderTarget GPU 资源
 */

/**
 * 创建 FXAA 后处理管线
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {{ composer: EffectComposer, updateSize: (w:number,h:number)=>void, dispose: ()=>void }}
 */
export function createFxaaPipeline(renderer, scene, camera) {
  // 创建合成器，内部会自动创建一个与渲染器同尺寸的中间 RenderTarget
  const composer = new EffectComposer(renderer)
  // 第一 pass：正常渲染场景到中间缓冲区
  composer.addPass(new RenderPass(scene, camera))

  // 第二 pass：FXAA 抗锯齿（全屏着色器，只需 GPU 一次 drawcall）
  const fxaaPass = new ShaderPass(FXAAShader)
  composer.addPass(fxaaPass)

  // 第三 pass：OutputPass 将线性颜色空间还原为 sRGB 并应用 ToneMapping
  // 不加此 pass 画面会比直接 renderer.render 暗一档（gamma 未还原）
  composer.addPass(new OutputPass())

  /**
   * 窗口尺寸变化时同步更新合成器和 FXAA 分辨率 uniform
   * @param {number} width  - CSS 像素宽度
   * @param {number} height - CSS 像素高度
   */
  const updateSize = (width, height) => {
    composer.setSize(width, height)
    const pr = renderer.getPixelRatio() || 1
    // FXAA resolution uniform 是「1 / 实际物理像素尺寸」，需乘以 devicePixelRatio
    fxaaPass.material.uniforms['resolution'].value.set(
      1 / (width * pr),
      1 / (height * pr),
    )
  }

  // 用渲染器当前尺寸做首次初始化
  const sizeVec = new THREE.Vector2()
  renderer.getSize(sizeVec)
  updateSize(sizeVec.x, sizeVec.y)

  /**
   * 释放 GPU 资源（组件卸载时调用）
   */
  const dispose = () => {
    // EffectComposer 内部两个 RenderTarget 持有 GPU 显存，需手动释放
    if (composer.renderTarget1) composer.renderTarget1.dispose()
    if (composer.renderTarget2) composer.renderTarget2.dispose()
  }

  return { composer, updateSize, dispose }
}
