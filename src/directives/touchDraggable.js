const OPT_IN_CLASS = 'touch-draggable-dialog'
const HEADER_SELECTOR = '.el-dialog__header'
const IGNORE_SELECTOR = '.el-dialog__headerbtn, .el-dialog__close, button, a, input, textarea, select, option, label, .el-button, .el-input, .el-input__wrapper, .el-input-number, .el-select, .el-select__wrapper, .el-date-editor, .el-time-picker, .el-time-select, .el-cascader, .el-switch, .el-checkbox, .el-radio, .el-picker-panel, .el-popper, [data-no-drag]'
const STYLE_ID = 'touch-draggable-dialog-style'

let isInitialized = false
let activeDrag = null

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${OPT_IN_CLASS}.el-dialog .el-dialog__header,
    .${OPT_IN_CLASS} .el-dialog__header {
      cursor: move;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }

    .${OPT_IN_CLASS}.el-dialog .el-dialog__headerbtn,
    .${OPT_IN_CLASS} .el-dialog__headerbtn {
      touch-action: manipulation;
    }
  `
  document.head.appendChild(style)
}

function isPrimaryPointer(event) {
  return event.pointerType !== 'mouse' || event.button === 0
}

function resolveDialog(header) {
  const dialog = header.closest('.el-dialog')
  if (!dialog) return null

  if (dialog.classList.contains(OPT_IN_CLASS)) return dialog
  if (header.closest(`.${OPT_IN_CLASS}`)) return dialog

  return null
}

function removeDocumentListeners() {
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerEnd)
  document.removeEventListener('pointercancel', onPointerEnd)
}

function onPointerMove(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return

  const { dialog, width, height, offsetX, offsetY } = activeDrag
  const margin = 8
  const maxLeft = Math.max(margin, window.innerWidth - width - margin)
  const maxTop = Math.max(margin, window.innerHeight - height - margin)

  let left = event.clientX - offsetX
  let top = event.clientY - offsetY

  if (left < margin) left = margin
  if (left > maxLeft) left = maxLeft
  if (top < margin) top = margin
  if (top > maxTop) top = maxTop

  dialog.style.left = `${left}px`
  dialog.style.top = `${top}px`
}

function onPointerEnd(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return

  try {
    activeDrag.handle.releasePointerCapture?.(activeDrag.pointerId)
  } catch {}

  activeDrag = null
  removeDocumentListeners()
}

function onPointerDown(event) {
  if (activeDrag) return
  if (!isPrimaryPointer(event)) return
  if (!(event.target instanceof Element)) return
  if (event.target.closest(IGNORE_SELECTOR)) return

  const header = event.target.closest(HEADER_SELECTOR)
  if (!header) return

  const dialog = resolveDialog(header)
  if (!dialog) return

  const rect = dialog.getBoundingClientRect()

  dialog.style.position = 'fixed'
  dialog.style.margin = '0'
  dialog.style.left = `${rect.left}px`
  dialog.style.top = `${rect.top}px`
  dialog.style.transform = 'none'

  activeDrag = {
    pointerId: event.pointerId,
    handle: header,
    dialog,
    width: rect.width,
    height: rect.height,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  }

  try {
    header.setPointerCapture?.(event.pointerId)
  } catch {}

  removeDocumentListeners()
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerEnd)
  document.addEventListener('pointercancel', onPointerEnd)

  event.preventDefault()
}

export function initTouchDraggable() {
  if (isInitialized || typeof document === 'undefined') return

  isInitialized = true
  injectStyle()
  document.addEventListener('pointerdown', onPointerDown, { passive: false })
}

export default initTouchDraggable
