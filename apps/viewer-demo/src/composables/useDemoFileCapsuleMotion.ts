import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type DemoFileCapsuleState =
  | 'expanded'
  | 'compacting'
  | 'bridging'
  | 'merging'
  | 'merged'
  | 'expanding'

export const DEMO_FILE_CAPSULE_MOTION = Object.freeze({
  idleDelay: 1_000,
  compactDuration: 160,
  bridgeDuration: 220,
  mergeDuration: 420,
  expandDuration: 420
})

type CapsuleBounds = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>

export interface UseDemoFileCapsuleMotionOptions {
  enabled: () => boolean
  canMerge: () => boolean
  resolveFileBounds: () => CapsuleBounds | null
  resolveTriggerBounds: () => CapsuleBounds | null
  resolveMergeTarget: () => CapsuleBounds | null
}

const roundedPixel = (value: number): string => `${Math.round(value)}px`
const roundedDegree = (value: number): string => `${Math.round(value * 10) / 10}deg`

/**
 * Owns the desktop capsule state machine independently from Vue lifecycle so
 * hover direction and timing can be covered by focused unit tests.
 */
export function createDemoFileCapsuleMotionController(options: UseDemoFileCapsuleMotionOptions) {
  const state = ref<DemoFileCapsuleState>('expanded')
  const motionStyle = ref<Record<string, string>>({})
  const stableMerged = computed(() => state.value === 'merged')
  const actionLocked = computed(() => !['expanded', 'merged'].includes(state.value))

  let idleTimer: number | null = null
  let phaseTimer: number | null = null
  let pointerWithinCapsuleZone = false
  let expandedBounds: CapsuleBounds | null = null

  const clearIdleTimer = () => {
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  const clearPhaseTimer = () => {
    if (phaseTimer !== null) {
      window.clearTimeout(phaseTimer)
      phaseTimer = null
    }
  }

  const clearTimers = () => {
    clearIdleTimer()
    clearPhaseTimer()
  }

  const queuePhase = (delay: number, callback: () => void) => {
    clearPhaseTimer()
    phaseTimer = window.setTimeout(() => {
      phaseTimer = null
      callback()
    }, delay)
  }

  const canAnimate = () => options.enabled() && options.canMerge()

  const targetMotionStyle = (
    target: CapsuleBounds,
    source: CapsuleBounds | null = expandedBounds
  ): Record<string, string> => {
    const style = {
      '--demo-file-capsule-target-top': roundedPixel(target.top),
      '--demo-file-capsule-target-left': roundedPixel(target.left),
      '--demo-file-capsule-target-width': roundedPixel(target.width),
      '--demo-file-capsule-target-height': roundedPixel(target.height)
    }
    if (!source) return style

    const sourceX = source.left + source.width / 2
    const sourceY = source.top
    const targetX = target.left + target.width / 2
    const targetY = target.bottom
    const deltaX = sourceX - targetX
    const deltaY = sourceY - targetY
    const distance = Math.hypot(deltaX, deltaY)

    return {
      ...style,
      '--demo-file-capsule-fusion-left': roundedPixel(targetX),
      '--demo-file-capsule-fusion-top': roundedPixel(targetY),
      '--demo-file-capsule-fusion-length': roundedPixel(distance),
      '--demo-file-capsule-fusion-angle': roundedDegree(
        (Math.atan2(deltaY, deltaX) * 180) / Math.PI
      )
    }
  }

  const expand = (immediate = false) => {
    clearTimers()
    if (state.value === 'expanded') {
      motionStyle.value = {}
      return
    }
    if (immediate || !options.enabled()) {
      state.value = 'expanded'
      motionStyle.value = {}
      return
    }
    state.value = 'expanding'
    queuePhase(DEMO_FILE_CAPSULE_MOTION.expandDuration, () => {
      state.value = 'expanded'
      motionStyle.value = {}
    })
  }

  const settle = () => {
    clearTimers()
    pointerWithinCapsuleZone = false
    if (!canAnimate()) {
      expand(true)
      return
    }
    const target = options.resolveMergeTarget()
    if (!target) {
      expand(true)
      return
    }
    const currentBounds = options.resolveFileBounds()
    if (currentBounds) {
      const currentCenterX = currentBounds.left + currentBounds.width / 2
      const targetCenterX = target.left + target.width / 2
      const isSeparate =
        Math.hypot(currentCenterX - targetCenterX, currentBounds.top - target.top) > 8
      if (isSeparate) expandedBounds = currentBounds
    }
    motionStyle.value = targetMotionStyle(target)
    state.value = 'merged'
  }

  const abortIfBlocked = (): boolean => {
    if (canAnimate()) {
      return false
    }
    expand()
    return true
  }

  const beginMerge = () => {
    clearIdleTimer()
    if (abortIfBlocked() || state.value !== 'expanded') {
      return
    }

    const target = options.resolveMergeTarget()
    const source = options.resolveFileBounds()
    if (!target || !source) {
      expand(true)
      return
    }
    expandedBounds = source
    motionStyle.value = targetMotionStyle(target, source)
    state.value = 'compacting'
    queuePhase(DEMO_FILE_CAPSULE_MOTION.compactDuration, () => {
      if (abortIfBlocked()) return
      state.value = 'bridging'
      queuePhase(DEMO_FILE_CAPSULE_MOTION.bridgeDuration, () => {
        if (abortIfBlocked()) return
        const nextTarget = options.resolveMergeTarget()
        if (!nextTarget) {
          expand()
          return
        }
        motionStyle.value = targetMotionStyle(nextTarget, expandedBounds)
        state.value = 'merging'
        queuePhase(DEMO_FILE_CAPSULE_MOTION.mergeDuration, () => {
          if (abortIfBlocked()) return
          state.value = 'merged'
        })
      })
    })
  }

  const scheduleMerge = () => {
    if (
      idleTimer !== null ||
      pointerWithinCapsuleZone ||
      !canAnimate() ||
      state.value !== 'expanded'
    ) {
      return
    }
    idleTimer = window.setTimeout(() => {
      idleTimer = null
      beginMerge()
    }, DEMO_FILE_CAPSULE_MOTION.idleDelay)
  }

  const handlePointerEnter = () => {
    pointerWithinCapsuleZone = true
    clearIdleTimer()
    if (state.value !== 'expanded') {
      expand()
    }
  }

  const handlePointerLeave = () => {
    pointerWithinCapsuleZone = false
    scheduleMerge()
  }

  const handleFocusIn = () => {
    clearIdleTimer()
    if (state.value !== 'expanded') {
      expand()
    }
  }

  const handleFocusOut = () => {
    scheduleMerge()
  }

  const pointWithin = (event: PointerEvent, bounds: CapsuleBounds | null) =>
    Boolean(
      bounds &&
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    )

  const handleDocumentPointerMove = (event: PointerEvent) => {
    const withinCapsuleZone =
      pointWithin(event, options.resolveTriggerBounds()) ||
      pointWithin(event, options.resolveFileBounds())

    if (withinCapsuleZone) {
      if (!pointerWithinCapsuleZone) {
        handlePointerEnter()
      } else {
        clearIdleTimer()
      }
      return
    }

    if (pointerWithinCapsuleZone) {
      handlePointerLeave()
      return
    }

    // A panel may have temporarily blocked merging. Once it closes, the next
    // pointer movement outside both capsules restores the normal idle merge.
    scheduleMerge()
  }

  const reset = () => settle()

  const dispose = () => {
    clearTimers()
  }

  return {
    state,
    motionStyle,
    stableMerged,
    actionLocked,
    scheduleMerge,
    expand,
    reset,
    settle,
    dispose,
    handlePointerEnter,
    handlePointerLeave,
    handleFocusIn,
    handleFocusOut,
    handleDocumentPointerMove
  }
}

/**
 * Coordinates the desktop-only liquid merge between the floating file pill
 * and the upload slot in the global action capsule.
 */
export function useDemoFileCapsuleMotion(options: UseDemoFileCapsuleMotionOptions) {
  const controller = createDemoFileCapsuleMotionController(options)

  onMounted(() => {
    document.addEventListener('pointermove', controller.handleDocumentPointerMove, {
      passive: true
    })
    controller.settle()
  })

  onBeforeUnmount(() => {
    controller.dispose()
    document.removeEventListener('pointermove', controller.handleDocumentPointerMove)
  })

  return controller
}
