export interface TimelineOptions {
  duration?: number
  loop?: boolean
  autoplay?: boolean
  onComplete?: () => void
  onPause?: () => void
}

export interface AnimationOptions {
  duration: number
  ease?: EasingFunctions
  onUpdate?: (animation: JSAnimation) => void
  onComplete?: () => void
  onStart?: () => void
  onLoop?: () => void
  loop?: boolean | number
  loopDelay?: number
  alternate?: boolean
  once?: boolean
  [key: string]: any
}

export interface JSAnimation {
  targets: any[]
  deltaTime: number
  progress: number
  currentTime: number
}

interface TimelineItem {
  type: "animation" | "callback" | "timeline"
  startTime: number
}

interface TimelineTimelineItem extends TimelineItem {
  type: "timeline"
  timeline: Timeline
  timelineStarted?: boolean
}

interface TimelineCallbackItem extends TimelineItem {
  type: "callback"
  callback: () => void
  executed: boolean
}

interface TimelineAnimationItem extends TimelineItem {
  type: "animation"

  target: any[]
  properties?: Record<string, number>
  initialValues?: Record<string, number>[]
  duration?: number
  ease?: keyof typeof easingFunctions
  loop?: boolean | number
  loopDelay?: number
  alternate?: boolean
  onUpdate?: (animation: JSAnimation) => void
  onComplete?: () => void
  onStart?: () => void
  onLoop?: () => void
  completed?: boolean
  started?: boolean
  currentLoop?: number
  once?: boolean
}

export type EasingFunctions = keyof typeof easingFunctions

const easingFunctions = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBounce: (t: number) => {
    const n1 = 7.5625
    const d1 = 2.75
    if (t < 1 / d1) {
      return n1 * t * t
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
  },
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
  inBounce: (t: number) => 1 - easingFunctions.outBounce(1 - t),
  inCirc: (t: number) => 1 - Math.sqrt(1 - t * t),
  outCirc: (t: number) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  inOutCirc: (t: number) => {
    if ((t *= 2) < 1) return -0.5 * (Math.sqrt(1 - t * t) - 1)
    return 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1)
  },
  inBack: (t: number, s: number = 1.70158) => t * t * ((s + 1) * t - s),
  outBack: (t: number, s: number = 1.70158) => --t * t * ((s + 1) * t + s) + 1,
  inOutBack: (t: number, s: number = 1.70158) => {
    s *= 1.525
    if ((t *= 2) < 1) return 0.5 * (t * t * ((s + 1) * t - s))
    return 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2)
  },
}

function captureInitialValues(item: TimelineAnimationItem): void {
  if (!item.properties) return
  if (!item.initialValues || item.initialValues.length === 0) {
    const initialValues: Record<string, number>[] = []

    for (let i = 0; i < item.target.length; i++) {
      const target = item.target[i]
      const targetInitialValues: Record<string, number> = {}

      for (const key of Object.keys(item.properties)) {
        if (typeof target[key] === "number") {
          targetInitialValues[key] = target[key]
        }
      }

      initialValues.push(targetInitialValues)
    }

    item.initialValues = initialValues
  }
}

function applyAnimationAtProgress(
  item: TimelineAnimationItem,
  progress: number,
  reversed: boolean,
  timelineTime: number,
  deltaTime: number = 0,
): void {
  if (!item.properties || !item.initialValues) return

  const easingFn = easingFunctions[item.ease || "linear"] || easingFunctions.linear
  const easedProgress = easingFn(Math.max(0, Math.min(1, progress)))
  const finalProgress = reversed ? 1 - easedProgress : easedProgress

  for (let i = 0; i < item.target.length; i++) {
    const target = item.target[i]
    const targetInitialValues = item.initialValues[i]

    if (!targetInitialValues) continue

    for (const [key, endValue] of Object.entries(item.properties)) {
      const startValue = targetInitialValues[key]
      const newValue = startValue + (endValue - startValue) * finalProgress
      target[key] = newValue
    }
  }

  if (item.onUpdate) {
    const animation: JSAnimation = {
      targets: item.target,
      progress: easedProgress,
      currentTime: timelineTime,
      deltaTime,
    }
    item.onUpdate(animation)
  }
}

function evaluateAnimation(item: TimelineAnimationItem, timelineTime: number, deltaTime: number = 0): void {
  if (timelineTime < item.startTime) {
    return
  }

  const animationTime = timelineTime - item.startTime
  const duration = item.duration || 0

  if (timelineTime >= item.startTime && !item.started) {
    captureInitialValues(item)
    if (item.onStart) {
      item.onStart()
    }
    item.started = true
  }

  if (duration === 0) {
    if (!item.completed) {
      applyAnimationAtProgress(item, 1, false, timelineTime, deltaTime)
      if (item.onComplete) {
        item.onComplete()
      }
      item.completed = true
    }
    return
  }

  // Unified looping logic - single execution is just maxLoops = 1
  const maxLoops = !item.loop || item.loop === 1 ? 1 : typeof item.loop === "number" ? item.loop : Infinity
  const loopDelay = item.loopDelay || 0
  const cycleTime = duration + loopDelay
  let currentCycle = Math.floor(animationTime / cycleTime)
  let timeInCycle = animationTime % cycleTime

  // Trigger onLoop if a loop cycle (not the final one) completes
  if (item.onLoop && item.currentLoop !== undefined && currentCycle > item.currentLoop && currentCycle < maxLoops) {
    item.onLoop()
  }
  item.currentLoop = currentCycle

  // Check if the animation part of the *final loop* has just completed
  if (item.onComplete && !item.completed && currentCycle === maxLoops - 1 && timeInCycle >= duration) {
    const finalLoopReversed = (item.alternate || false) && currentCycle % 2 === 1
    applyAnimationAtProgress(item, 1, finalLoopReversed, timelineTime, deltaTime)

    item.onComplete()
    item.completed = true
    return
  }

  if (currentCycle >= maxLoops) {
    if (!item.completed) {
      const finalReversed = (item.alternate || false) && (maxLoops - 1) % 2 === 1
      applyAnimationAtProgress(item, 1, finalReversed, timelineTime, deltaTime)

      if (item.onComplete) {
        item.onComplete()
      }
      item.completed = true
    }
    return
  }

  if (timeInCycle === 0 && animationTime > 0 && currentCycle < maxLoops) {
    currentCycle = currentCycle - 1
    timeInCycle = cycleTime
  }

  if (timeInCycle >= duration) {
    const isReversed = (item.alternate || false) && currentCycle % 2 === 1
    applyAnimationAtProgress(item, 1, isReversed, timelineTime, deltaTime)
    return
  }

  const progress = timeInCycle / duration
  const isReversed = (item.alternate || false) && currentCycle % 2 === 1
  applyAnimationAtProgress(item, progress, isReversed, timelineTime, deltaTime)
}

function evaluateCallback(item: TimelineCallbackItem, timelineTime: number): void {
  if (!item.executed && timelineTime >= item.startTime && item.callback) {
    item.callback()
    item.executed = true
  }
}

function evaluateTimelineSync(item: TimelineTimelineItem, timelineTime: number, deltaTime: number = 0): void {
  if (!item.timeline) return
  if (timelineTime < item.startTime) {
    return
  }

  if (!item.timelineStarted) {
    item.timelineStarted = true
    item.timeline.play()

    const overshoot = timelineTime - item.startTime
    item.timeline.update(overshoot)
    return
  }

  item.timeline.update(deltaTime)
}

function evaluateItem(item: TimelineItem, timelineTime: number, deltaTime: number = 0): void {
  if (item.type === "animation") {
    evaluateAnimation(item as TimelineAnimationItem, timelineTime, deltaTime)
  } else if (item.type === "callback") {
    evaluateCallback(item as TimelineCallbackItem, timelineTime)
  }
}

export class Timeline {
  public items: (TimelineAnimationItem | TimelineCallbackItem)[] = []
  public subTimelines: TimelineTimelineItem[] = []
  public currentTime: number = 0
  public isPlaying: boolean = false
  public isComplete: boolean = false
  public duration: number
  public loop: boolean
  public synced: boolean = false
  private autoplay: boolean
  private onComplete?: () => void
  private onPause?: () => void

  constructor(options: TimelineOptions = {}) {
    this.duration = options.duration || 1000
    this.loop = options.loop === true
    this.autoplay = options.autoplay !== false
    this.onComplete = options.onComplete
    this.onPause = options.onPause
  }

  add(target: any, properties: AnimationOptions, startTime: number | string = 0): this {
    const resolvedStartTime = typeof startTime === "string" ? 0 : startTime

    const animationProperties: Record<string, number> = {}

    // Extract animation properties (don't capture initial values here)
    for (const key in properties) {
      if (
        !["duration", "ease", "onUpdate", "onComplete", "onStart", "onLoop", "loop", "loopDelay", "alternate"].includes(
          key,
        )
      ) {
        if (typeof properties[key] === "number") {
          animationProperties[key] = properties[key]
        }
      }
    }

    this.items.push({
      type: "animation",
      startTime: resolvedStartTime,
      target: Array.isArray(target) ? target : [target],
      properties: animationProperties,
      initialValues: [], // Will be captured when animation starts
      duration: properties.duration !== undefined ? properties.duration : 1000,
      ease: properties.ease || "linear",
      loop: properties.loop,
      loopDelay: properties.loopDelay || 0,
      alternate: properties.alternate || false,
      onUpdate: properties.onUpdate,
      onComplete: properties.onComplete,
      onStart: properties.onStart,
      onLoop: properties.onLoop,
      completed: false,
      started: false,
      currentLoop: 0,
      once: properties.once ?? false,
    })

    return this
  }

  once(target: any, properties: AnimationOptions): this {
    this.add(
      target,
      {
        ...properties,
        once: true,
      },
      this.currentTime,
    )

    return this
  }

  call(callback: () => void, startTime: number | string = 0): this {
    const resolvedStartTime = typeof startTime === "string" ? 0 : startTime

    this.items.push({
      type: "callback",
      startTime: resolvedStartTime,
      callback,
      executed: false,
    })

    return this
  }

  sync(timeline: Timeline, startTime: number = 0): this {
    if (timeline.synced) {
      throw new Error("Timeline already synced")
    }
    this.subTimelines.push({
      type: "timeline",
      startTime,
      timeline,
    })
    timeline.synced = true

    return this
  }

  play(): this {
    if (this.isComplete) {
      return this.restart()
    }
    this.subTimelines.forEach((subTimeline) => {
      if (subTimeline.timelineStarted) {
        subTimeline.timeline.play()
      }
    })
    this.isPlaying = true
    return this
  }

  pause(): this {
    this.subTimelines.forEach((subTimeline) => {
      subTimeline.timeline.pause()
    })
    this.isPlaying = false
    if (this.onPause) {
      this.onPause()
    }
    return this
  }

  resetItems() {
    this.items.forEach((item) => {
      if (item.type === "callback") {
        item.executed = false
      } else if (item.type === "animation") {
        item.completed = false
        item.started = false
        item.currentLoop = 0
      }
    })
    this.subTimelines.forEach((subTimeline) => {
      subTimeline.timelineStarted = false
      if (subTimeline.timeline) {
        subTimeline.timeline.restart()
        subTimeline.timeline.pause()
      }
    })
  }

  restart(): this {
    this.isComplete = false
    this.currentTime = 0
    this.isPlaying = true
    this.resetItems()

    return this
  }

  update(deltaTime: number): void {
    for (const subTimeline of this.subTimelines) {
      evaluateTimelineSync(subTimeline, this.currentTime + deltaTime, deltaTime)
    }

    if (!this.isPlaying) return

    this.currentTime += deltaTime

    for (const item of this.items) {
      evaluateItem(item, this.currentTime, deltaTime)
    }

    // Remove completed "once" items (iterate backwards to avoid index shifting)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]
      if (item.type === "animation" && item.once && item.completed) {
        this.items.splice(i, 1)
      }
    }

    if (this.loop && this.currentTime >= this.duration) {
      const overshoot = this.currentTime % this.duration

      this.resetItems()
      this.currentTime = 0

      if (overshoot > 0) {
        this.update(overshoot)
      }
    } else if (!this.loop && this.currentTime >= this.duration) {
      this.currentTime = this.duration
      this.isPlaying = false
      this.isComplete = true

      if (this.onComplete) {
        this.onComplete()
      }
    }
  }
}

class TimelineEngine {
  private timelines: Set<Timeline> = new Set()
  public defaults = {
    frameRate: 60,
  }

  register(timeline: Timeline): void {
    this.timelines.add(timeline)
  }

  unregister(timeline: Timeline): void {
    this.timelines.delete(timeline)
  }

  clear(): void {
    this.timelines.clear()
  }

  update(deltaTime: number): void {
    for (const timeline of this.timelines) {
      if (!timeline.synced) {
        timeline.update(deltaTime)
      }
    }
  }
}

export const engine = new TimelineEngine()

export function createTimeline(options: TimelineOptions = {}): Timeline {
  const timeline = new Timeline(options)
  if (options.autoplay !== false) {
    timeline.play()
  }

  engine.register(timeline)

  return timeline
}
