import type { Pointer } from "bun:ffi"

import { nextTick } from "process"
import { EventEmitter } from "events"

import { ANSI } from "./ansi.js"
import { OptimizedBuffer } from "./buffer.js"
import { initializeNative } from "./native.js"
import { Selection } from "../lib/selection.js"
import { singleton } from "../lib/singleton.js";
import { Component, RootComponent } from "../component.js"
import { type RenderLib, resolveRenderLib } from "./native.js"
import { RGBA, parseColor, type ColorInput, } from "../lib/colors.js"
import { capture, TerminalConsole, type ConsoleOptions } from "./console/console.js"
import { MouseParser, type ScrollInfo, type RawMouseEvent, type MouseEventType } from "../lib/parse.mouse.js"
import {
  type CursorStyle,
  DebugOverlayCorner,
  type RenderContext,
  type SelectionState,
} from "../types.js"

export interface RendererConfig {
  stdin?: NodeJS.ReadStream
  stdout?: NodeJS.WriteStream
  exitOnCtrlC?: boolean
  debounceDelay?: number
  targetFps?: number
  memorySnapshotInterval?: number
  useThread?: boolean
  gatherStats?: boolean
  maxStatSamples?: number
  consoleOptions?: ConsoleOptions
  postProcessFns?: ((buffer: OptimizedBuffer, deltaTime: number) => void)[]
  enableMouseMovement?: boolean
  useMouse?: boolean
  useAlternateScreen?: boolean
  useConsole?: boolean
}

export type PixelResolution = {
  width: number
  height: number
}

export class MouseEvent {
  public readonly type: MouseEventType
  public readonly button: number
  public readonly x: number
  public readonly y: number
  public readonly source?: Component
  public readonly modifiers: {
    shift: boolean
    alt: boolean
    ctrl: boolean
  }
  public readonly scroll?: ScrollInfo
  public readonly target: Component | null
  private _defaultPrevented: boolean = false

  public get defaultPrevented(): boolean {
    return this._defaultPrevented
  }

  constructor(target: Component | null, attributes: RawMouseEvent & { source?: Component }) {
    this.target = target
    this.type = attributes.type
    this.button = attributes.button
    this.x = attributes.x
    this.y = attributes.y
    this.modifiers = attributes.modifiers
    this.scroll = attributes.scroll
    this.source = attributes.source
  }

  public preventDefault(): void {
    this._defaultPrevented = true
  }
}

export enum MouseButton {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  WHEEL_UP = 4,
  WHEEL_DOWN = 5,
}

singleton('ProcessExitSignals', () => {
  ["SIGINT", "SIGTERM", "SIGQUIT", "SIGABRT"].forEach((signal) => {
    process.on(signal, () => {
      process.exit()
    })
  })
});

enum RendererControlState {
  IDLE = "idle",
  AUTO_STARTED = "auto_started",
  EXPLICIT_STARTED = "explicit_started",
  EXPLICIT_PAUSED = "explicit_paused",
  EXPLICIT_STOPPED = "explicit_stopped",
}

export async function createRenderer(config: RendererConfig = {}): Promise<Renderer> {
  await initializeNative();
  const stdin = config.stdin || process.stdin
  const stdout = config.stdout || process.stdout

  const width = stdout.columns || 80
  const height = stdout.rows || 24
  // In normal mode, we'll adjust height based on actual content
  const useAlternateScreen = config.useAlternateScreen === true // Default to true for backwards compatibility
  // In inline mode, start with minimal height to avoid clearing the entire screen
  const renderHeight = height;//useAlternateScreen ? height : 1;

  const nativeLib = resolveRenderLib()
  const rendererPtr = nativeLib.createRenderer(width, renderHeight, useAlternateScreen)
  if (!rendererPtr) {
    throw new Error("Failed to create renderer")
  }
  if (config.useThread === undefined) {
    config.useThread = true
  }

  // Disable threading on linux because there currently is currently an issue
  // might be just a missing dependency for the build or something, but threads crash on linux
  if (process.platform === "linux") {
    config.useThread = false
  }
  nativeLib.setUseThread(rendererPtr, config.useThread)

  return new Renderer(nativeLib, rendererPtr, stdin, stdout, width, height, config)
}

export enum CliRenderEvents {
  DEBUG_OVERLAY_TOGGLE = "debugOverlay:toggle",
}

export class Renderer extends EventEmitter implements RenderContext {
  private static animationFrameId = 0;
  private lib: RenderLib
  public rendererPtr: Pointer
  private stdin: NodeJS.ReadStream
  private stdout: NodeJS.WriteStream
  private exitOnCtrlC: boolean
  private isDestroyed: boolean = false
  public nextRenderBuffer: OptimizedBuffer
  public currentRenderBuffer: OptimizedBuffer
  private _isRunning: boolean = false
  private targetFps: number = 30
  private memorySnapshotInterval: number
  private memorySnapshotTimer: Timer | null = null
  private lastMemorySnapshot: { heapUsed: number; heapTotal: number; arrayBuffers: number } = {
    heapUsed: 0,
    heapTotal: 0,
    arrayBuffers: 0,
  }
  public readonly root: RootComponent
  public width: number
  public height: number
  private _useThread: boolean = false
  private gatherStats: boolean = false
  private frameTimes: number[] = []
  private maxStatSamples: number = 300
  private postProcessFns: ((buffer: OptimizedBuffer, deltaTime: number) => void)[] = []
  private backgroundColor: RGBA = RGBA.fromHex("#000000")
  private waitingForPixelResolution: boolean = false

  private rendering: boolean = false
  private renderingNative: boolean = false
  private renderTimeout: Timer | null = null
  private lastTime: number = Date.now();
  private frameCount: number = 0
  private lastFpsTime: number = this.lastTime;
  private currentFps: number = 0
  private targetFrameTime: number = 0;
  private immediateRerenderRequested: boolean = false
  private updateScheduled: boolean = false;

  // Inline rendering state
  private linesRendered: number = 1;

  private liveRequestCounter: number = 0;
  private controlState: RendererControlState = RendererControlState.IDLE;

  private frameCallbacks: ((deltaTime: number) => Promise<void>)[] = []
  private renderStats: {
    frameCount: number
    fps: number
    renderTime?: number
    frameCallbackTime: number
  } = {
      frameCount: 0,
      fps: 0,
      renderTime: 0,
      frameCallbackTime: 0,
    }
  public debugOverlay = {
    enabled: false,
    corner: DebugOverlayCorner.bottomRight,
  }

  private _console: TerminalConsole
  private _resolution: PixelResolution | null = null

  private animationRequest: Map<number, FrameRequestCallback> = new Map()

  private resizeTimeoutId: ReturnType<typeof setTimeout> | null = null
  private resizeDebounceDelay: number = 100

  private enableMouseMovement: boolean = false
  private _useMouse: boolean = true
  private _useAlternateScreen: boolean = false;

  private capturedRenderable?: Component
  private lastOverRenderableNum: number = 0
  private lastOverRenderable?: Component

  private currentSelection: Selection | null = null
  private selectionState: SelectionState | null = null
  private selectionContainers: Component[] = []

  private _terminalWidth: number = 0
  private _terminalHeight: number = 0

  private realStdoutWrite: (chunk: any, encoding?: any, callback?: any) => boolean

  private _useConsole: boolean = true
  private mouseParser: MouseParser = new MouseParser()
  private sigwinchHandler: (() => void) | null = null

  constructor(
    lib: RenderLib,
    rendererPtr: Pointer,
    stdin: NodeJS.ReadStream,
    stdout: NodeJS.WriteStream,
    width: number,
    height: number,
    config: RendererConfig = {},
  ) {
    super()

    this.stdin = stdin
    this.stdout = stdout
    this.realStdoutWrite = stdout.write
    this.lib = lib
    this._terminalWidth = stdout.columns
    this._terminalHeight = stdout.rows
    this.width = width
    this.height = height
    this._useThread = config.useThread === undefined ? false : config.useThread

    this.rendererPtr = rendererPtr
    this.exitOnCtrlC = config.exitOnCtrlC === undefined ? true : config.exitOnCtrlC
    this.resizeDebounceDelay = config.debounceDelay || 100
    this.targetFps = config.targetFps || 30;
    this.targetFrameTime = 1000 / this.targetFps;
    this.memorySnapshotInterval = config.memorySnapshotInterval || 5000
    this.gatherStats = config.gatherStats || false
    this.maxStatSamples = config.maxStatSamples || 300
    this.enableMouseMovement = config.enableMouseMovement || true
    this._useMouse = config.useMouse ?? true
    this._useAlternateScreen = config.useAlternateScreen ?? false
    this.nextRenderBuffer = this.lib.getNextBuffer(this.rendererPtr)
    this.currentRenderBuffer = this.lib.getCurrentBuffer(this.rendererPtr)
    this.postProcessFns = config.postProcessFns || []

    this.root = new RootComponent(this);

    this.setupTerminal()
    this.takeMemorySnapshot()

    if (this.memorySnapshotInterval > 0) {
      this.startMemorySnapshotTimer()
    }

    this.stdout.write = this.interceptStdoutWrite.bind(this)

    // Handle terminal resize
    this.sigwinchHandler = () => {
      this.handleResize(this.stdout.columns || 80, this.stdout.rows || 24)
    }
    process.on("SIGWINCH", this.sigwinchHandler)

    const handleError = (error: Error) => {
      this.stop()
      this.destroy()

      new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 100)
      }).then(() => {
        this.realStdoutWrite.call(this.stdout, "\n=== FATAL ERROR OCCURRED ===\n")
        this.realStdoutWrite.call(this.stdout, "Console cache:\n")
        this.realStdoutWrite.call(this.stdout, this.console.getCachedLogs())
        this.realStdoutWrite.call(this.stdout, "\nCaptured output:\n")
        const capturedOutput = capture.claimOutput()
        if (capturedOutput) {
          this.realStdoutWrite.call(this.stdout, capturedOutput + "\n")
        }
        this.realStdoutWrite.call(this.stdout, "\nError details:\n")
        this.realStdoutWrite.call(this.stdout, error.message || "unknown error")
        this.realStdoutWrite.call(this.stdout, "\n")
        this.realStdoutWrite.call(this.stdout, error.stack || error.toString())
        this.realStdoutWrite.call(this.stdout, "\n")

        process.exit(1)
      })
    }

    process.on("uncaughtException", handleError)
    process.on("unhandledRejection", handleError)
    process.on("exit", () => {
      this.destroy()
    })

    this._console = new TerminalConsole(this, config.consoleOptions)
    this.useConsole = config.useConsole ?? true

    global.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = Renderer.animationFrameId++
      this.animationRequest.set(id, callback)
      return id
    }
    global.cancelAnimationFrame = (handle: number) => {
      this.animationRequest.delete(handle)
    }

    const window = global.window
    if (!window) {
      global.window = {} as Window & typeof globalThis
    }
    global.window.requestAnimationFrame = requestAnimationFrame

    this.queryPixelResolution()
  }

  public addToHitGrid(x: number, y: number, width: number, height: number, id: number) {
    if (id !== this.capturedRenderable?.num) {
      this.lib.addToHitGrid(this.rendererPtr, x, y, width, height, id)
    }
  }

  private writeOut(chunk: any, encoding?: any, callback?: any): boolean {
    return this.realStdoutWrite.call(this.stdout, chunk, encoding, callback)
  }

  public needsUpdate() {
    if (!this.updateScheduled && !this._isRunning) {
      this.updateScheduled = true
      process.nextTick(() => {
        this.loop()
        this.updateScheduled = false
      })
    }
  }

  public get useConsole(): boolean {
    return this._useConsole
  }

  public set useConsole(value: boolean) {
    this._useConsole = value
    if (value) {
      this.console.activate()
    } else {
      this.console.deactivate()
    }
  }

  public get isRunning(): boolean {
    return this._isRunning
  }

  public get resolution(): PixelResolution | null {
    return this._resolution
  }

  public get console(): TerminalConsole {
    return this._console
  }

  public get terminalWidth(): number {
    return this._terminalWidth
  }

  public get terminalHeight(): number {
    return this._terminalHeight
  }

  public get useThread(): boolean {
    return this._useThread
  }

  public get useMouse(): boolean {
    return this._useMouse
  }

  public set useMouse(useMouse: boolean) {
    if (this._useMouse === useMouse) return // No change needed

    this._useMouse = useMouse

    if (useMouse) {
      this.enableMouse()
    } else {
      this.disableMouse()
    }
  }

  public get liveRequestCount(): number {
    return this.liveRequestCounter;
  }

  public get currentControlState(): string {
    return this.controlState;
  }

  private interceptStdoutWrite = (chunk: any, encoding?: any, callback?: any): boolean => {
    const text = chunk.toString()

    capture.write("stdout", text)

    if (typeof callback === "function") {
      process.nextTick(callback)
    }

    return true
  }

  private disableStdoutInterception(): void {
    this.stdout.write = this.realStdoutWrite
  }

  private enableMouse(): void {
    this.lib.enableMouse(this.rendererPtr, this.enableMouseMovement)
  }

  private disableMouse(): void {
    this.capturedRenderable = undefined
    this.mouseParser.reset()

    this.lib.disableMouse(this.rendererPtr)
  }

  public set useThread(useThread: boolean) {
    this._useThread = useThread
    this.lib.setUseThread(this.rendererPtr, useThread)
  }

  private setupTerminal(): void {
    if (this.stdin.setRawMode) {
      this.stdin.setRawMode(true);
    }
    this.stdin.resume();
    this.stdin.setEncoding("utf8");

    if (this._useMouse) {
      this.enableMouse();
    }

    this.stdin.on("data", (data: Buffer) => {
      const str = data.toString();

      // eslint-disable-next-line no-control-regex
      if (this.waitingForPixelResolution && /\x1b\[4;\d+;\d+t/.test(str)) {
        // eslint-disable-next-line no-control-regex
        const match = str.match(/\x1b\[4;(\d+);(\d+)t/);
        if (match) {
          const resolution: PixelResolution = {
            width: parseInt(match[2]),
            height: parseInt(match[1]),
          }

          this._resolution = resolution;
          this.waitingForPixelResolution = false;
          return;
        }
      }

      if (this.exitOnCtrlC && str === "\u0003") {
        process.nextTick(() => {
          process.exit();
        })
        return;
      }

      if (this._useMouse && this.handleMouseData(data)) {
        return;
      }

      this.emit("key", data);
    })

    if (this._useAlternateScreen) {
      this.writeOut(ANSI.switchToAlternateScreen);
      this.setCursorPosition(0, 0, false);
    } else {
      this.linesRendered = 1;
    }
  }

  private handleMouseData(data: Buffer): boolean {
    const mouseEvent = this.mouseParser.parseMouseEvent(data);

    if (mouseEvent) {
      if (mouseEvent.type === "scroll") {
        const maybeRenderableId = this.lib.checkHit(this.rendererPtr, mouseEvent.x, mouseEvent.y)
        const maybeRenderable = Component.componentsByNumber.get(maybeRenderableId)

        if (maybeRenderable) {
          const event = new MouseEvent(maybeRenderable, mouseEvent)
          maybeRenderable.processMouseEvent(event)
        }
        return true
      }

      const maybeRenderableId = this.lib.checkHit(this.rendererPtr, mouseEvent.x, mouseEvent.y)
      const sameElement = maybeRenderableId === this.lastOverRenderableNum
      this.lastOverRenderableNum = maybeRenderableId
      const maybeRenderable = Component.componentsByNumber.get(maybeRenderableId)

      if (mouseEvent.type === "down" && mouseEvent.button === MouseButton.LEFT) {
        if (
          maybeRenderable &&
          maybeRenderable.selectable &&
          maybeRenderable.shouldStartSelection(mouseEvent.x, mouseEvent.y)
        ) {
          this.startSelection(maybeRenderable, mouseEvent.x, mouseEvent.y)
          return true
        }
      }

      if (mouseEvent.type === "drag" && this.selectionState?.isSelecting) {
        this.updateSelection(maybeRenderable, mouseEvent.x, mouseEvent.y)
        return true
      }

      if (mouseEvent.type === "up" && this.selectionState?.isSelecting) {
        this.finishSelection()
        return true
      }

      if (mouseEvent.type === "down" && mouseEvent.button === MouseButton.LEFT && this.selectionState) {
        this.clearSelection()
      }

      if (!sameElement && (mouseEvent.type === "drag" || mouseEvent.type === "move")) {
        if (this.lastOverRenderable && this.lastOverRenderable !== this.capturedRenderable) {
          const event = new MouseEvent(this.lastOverRenderable, { ...mouseEvent, type: "out" })
          this.lastOverRenderable.processMouseEvent(event)
        }
        this.lastOverRenderable = maybeRenderable
        if (maybeRenderable) {
          const event = new MouseEvent(maybeRenderable, {
            ...mouseEvent,
            type: "over",
            source: this.capturedRenderable,
          })
          maybeRenderable.processMouseEvent(event)
        }
      }

      if (this.capturedRenderable && mouseEvent.type !== "up") {
        const event = new MouseEvent(this.capturedRenderable, mouseEvent)
        this.capturedRenderable.processMouseEvent(event)
        return true
      }

      if (this.capturedRenderable && mouseEvent.type === "up") {
        const event = new MouseEvent(this.capturedRenderable, { ...mouseEvent, type: "drag-end" })
        this.capturedRenderable.processMouseEvent(event)
        this.capturedRenderable.processMouseEvent(new MouseEvent(this.capturedRenderable, mouseEvent))
        if (maybeRenderable) {
          maybeRenderable.processMouseEvent(new MouseEvent(maybeRenderable, {
            ...mouseEvent,
            type: "drop",
            source: this.capturedRenderable,
          }))
        }
        this.lastOverRenderable = this.capturedRenderable
        this.lastOverRenderableNum = this.capturedRenderable.num
        this.capturedRenderable = undefined
        // Dropping the renderable needs to push another frame when the renderer is not live
        // to update the hit grid, otherwise capturedRenderable won't be in the hit grid and will not receive mouse events
        this.needsUpdate()
      }

      if (maybeRenderable) {
        if (mouseEvent.type === "drag" && mouseEvent.button === MouseButton.LEFT) {
          this.capturedRenderable = maybeRenderable
        } else {
          this.capturedRenderable = undefined
        }
        const event = new MouseEvent(maybeRenderable, mouseEvent)
        maybeRenderable.processMouseEvent(event)
        return true
      }

      this.capturedRenderable = undefined
      this.lastOverRenderable = undefined
      return true
    }

    return false
  }

  private takeMemorySnapshot(): void {
    const memoryUsage = process.memoryUsage()
    this.lastMemorySnapshot = {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      arrayBuffers: memoryUsage.arrayBuffers,
    }

    this.lib.updateMemoryStats(
      this.rendererPtr,
      this.lastMemorySnapshot.heapUsed,
      this.lastMemorySnapshot.heapTotal,
      this.lastMemorySnapshot.arrayBuffers,
    )

    this.emit("memory:snapshot", this.lastMemorySnapshot)
  }

  private startMemorySnapshotTimer(): void {
    if (this.memorySnapshotTimer) {
      clearInterval(this.memorySnapshotTimer)
    }

    this.memorySnapshotTimer = setInterval(() => {
      this.takeMemorySnapshot()
    }, this.memorySnapshotInterval)
  }

  public setMemorySnapshotInterval(interval: number): void {
    this.memorySnapshotInterval = interval

    if (this._isRunning && interval > 0) {
      this.startMemorySnapshotTimer()
    } else if (interval <= 0 && this.memorySnapshotTimer) {
      clearInterval(this.memorySnapshotTimer)
      this.memorySnapshotTimer = null
    }
  }

  private handleResize(width: number, height: number): void {
    if (this.isDestroyed) return;

    if (this.resizeTimeoutId !== null) {
      clearTimeout(this.resizeTimeoutId)
      this.resizeTimeoutId = null
    }

    this.resizeTimeoutId = setTimeout(() => {
      this.resizeTimeoutId = null
      this.processResize(width, height)
    }, this.resizeDebounceDelay)
  }

  private queryPixelResolution() {
    this.waitingForPixelResolution = true;
    // TODO: should move to native, injecting the request in the next frame if running
    this.writeOut(ANSI.queryPixelSize);
  }

  private processResize(width: number, height: number): void {
    if (width === this._terminalWidth && height === this._terminalHeight) return

    this._terminalWidth = width
    this._terminalHeight = height
    this.queryPixelResolution()

    this.capturedRenderable = undefined
    this.mouseParser.reset()

    this.width = width
    this.height = height

    this.lib.resizeRenderer(this.rendererPtr, this.width, this.height)
    this.nextRenderBuffer = this.lib.getNextBuffer(this.rendererPtr)
    this.currentRenderBuffer = this.lib.getCurrentBuffer(this.rendererPtr)
    this._console.resize(this.width, this.height)
    this.root.resize(this.width, this.height)
    this.emit("resize", this.width, this.height)
    this.needsUpdate()
  }

  public setBackgroundColor(color: ColorInput): void {
    const parsedColor = parseColor(color)
    this.lib.setBackgroundColor(this.rendererPtr, parsedColor as RGBA)
    this.backgroundColor = parsedColor as RGBA
    this.nextRenderBuffer.clear(parsedColor as RGBA)
    this.needsUpdate()
  }

  public toggleDebugOverlay(): void {
    this.debugOverlay.enabled = !this.debugOverlay.enabled
    this.lib.setDebugOverlay(this.rendererPtr, this.debugOverlay.enabled, this.debugOverlay.corner)
    this.emit(CliRenderEvents.DEBUG_OVERLAY_TOGGLE, this.debugOverlay.enabled)
    this.needsUpdate()
  }

  public configureDebugOverlay(options: { enabled?: boolean; corner?: DebugOverlayCorner }): void {
    this.debugOverlay.enabled = options.enabled ?? this.debugOverlay.enabled
    this.debugOverlay.corner = options.corner ?? this.debugOverlay.corner
    this.lib.setDebugOverlay(this.rendererPtr, this.debugOverlay.enabled, this.debugOverlay.corner)
    this.needsUpdate()
  }

  public clearTerminal(): void {
    this.lib.clearTerminal(this.rendererPtr)
  }

  public dumpHitGrid(): void {
    this.lib.dumpHitGrid(this.rendererPtr)
  }

  public dumpBuffers(timestamp?: number): void {
    this.lib.dumpBuffers(this.rendererPtr, timestamp)
  }

  public dumpStdoutBuffer(timestamp?: number): void {
    this.lib.dumpStdoutBuffer(this.rendererPtr, timestamp)
  }

  public setCursorPosition(x: number, y: number, visible: boolean = true): void {
    this.lib.setCursorPosition(this.rendererPtr, x, y, visible);
  }

  public setCursorStyle(style: CursorStyle, blinking: boolean = false, color?: RGBA): void {
    this.lib.setCursorStyle(this.rendererPtr, style, blinking);
    if (color) {
      this.lib.setCursorColor(this.rendererPtr, color);
    }
  }

  public setCursorColor(color: RGBA): void {
    this.lib.setCursorColor(this.rendererPtr, color);
  }

  public addPostProcessFn(processFn: (buffer: OptimizedBuffer, deltaTime: number) => void): void {
    this.postProcessFns.push(processFn)
  }

  public removePostProcessFn(processFn: (buffer: OptimizedBuffer, deltaTime: number) => void): void {
    this.postProcessFns = this.postProcessFns.filter((fn) => fn !== processFn)
  }

  public clearPostProcessFns(): void {
    this.postProcessFns = []
  }

  public setFrameCallback(callback: (deltaTime: number) => Promise<void>): void {
    this.frameCallbacks.push(callback)
  }

  public removeFrameCallback(callback: (deltaTime: number) => Promise<void>): void {
    this.frameCallbacks = this.frameCallbacks.filter((cb) => cb !== callback)
  }

  public clearFrameCallbacks(): void {
    this.frameCallbacks = []
  }

  public requestLive(): void {
    this.liveRequestCounter++

    if (this.controlState === RendererControlState.IDLE && this.liveRequestCounter > 0) {
      this.controlState = RendererControlState.AUTO_STARTED
      this.internalStart()
    }
  }

  public dropLive(): void {
    this.liveRequestCounter = Math.max(0, this.liveRequestCounter - 1)

    if (this.controlState === RendererControlState.AUTO_STARTED && this.liveRequestCounter === 0) {
      this.controlState = RendererControlState.IDLE
      this.internalPause()
    }
  }

  public start(): void {
    this.controlState = RendererControlState.EXPLICIT_STARTED
    this.internalStart()
  }

  private internalStart(): void {
    if (!this._isRunning && !this.isDestroyed) {
      this._isRunning = true

      if (this.memorySnapshotInterval > 0) {
        this.startMemorySnapshotTimer()
      }

      this.startRenderLoop()
    }
  }

  public pause(): void {
    this.controlState = RendererControlState.EXPLICIT_PAUSED
    this.internalPause()
  }

  private internalPause(): void {
    this._isRunning = false
  }

  public stop(): void {
    this.controlState = RendererControlState.EXPLICIT_STOPPED
    this.internalStop()
  }

  private internalStop(): void {
    if (this.isRunning && !this.isDestroyed) {
      this._isRunning = false


      if (this.memorySnapshotTimer) {
        clearInterval(this.memorySnapshotTimer)
        this.memorySnapshotTimer = null
      }

      if (this.renderTimeout) {
        clearTimeout(this.renderTimeout)
        this.renderTimeout = null
      }
    }
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.stdin.setRawMode) {
      this.stdin.setRawMode(false);
    }

    this.waitingForPixelResolution = false
    this.capturedRenderable = undefined

    if (this.sigwinchHandler) {
      process.removeListener("SIGWINCH", this.sigwinchHandler);
      this.sigwinchHandler = null;
    }

    this._console.deactivate();

    this.disableStdoutInterception();

    this.lib.destroyRenderer(this.rendererPtr, this._useAlternateScreen);
  }

  private startRenderLoop(): void {
    if (!this._isRunning) return;

    this.loop();
  }

  private async loop(): Promise<void> {
    if (this.rendering || this.isDestroyed) return;
    this.rendering = true
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout)
      this.renderTimeout = null
    }

    const now = Date.now()
    const elapsed = now - this.lastTime

    const deltaTime = elapsed
    this.lastTime = now

    this.frameCount++
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = this.frameCount
      this.frameCount = 0
      this.lastFpsTime = now
    }

    this.renderStats.frameCount++
    this.renderStats.fps = this.currentFps
    const overallStart = performance.now()

    const frameRequests = Array.from(this.animationRequest.values())
    this.animationRequest.clear()
    const animationRequestStart = performance.now()
    frameRequests.forEach((callback) => callback(deltaTime))
    const animationRequestEnd = performance.now()
    const animationRequestTime = animationRequestEnd - animationRequestStart

    const start = performance.now()
    for (const frameCallback of this.frameCallbacks) {
      try {
        await frameCallback(deltaTime)
      } catch (error) {
        console.error("Error in frame callback:", error)
      }
    }
    const end = performance.now()
    this.renderStats.frameCallbackTime = end - start

    // Render the Component tree
    this.root.render(this.nextRenderBuffer, deltaTime)

    for (const postProcessFn of this.postProcessFns) {
      postProcessFn(this.nextRenderBuffer, deltaTime)
    }

    this._console.renderToBuffer(this.nextRenderBuffer)

    this.renderNative()

    const overallFrameTime = performance.now() - overallStart
    this.lib.updateStats(this.rendererPtr, overallFrameTime, this.renderStats.fps, this.renderStats.frameCallbackTime, animationRequestTime)

    if (this.gatherStats) {
      this.collectStatSample(overallFrameTime)
    }

    if (this._isRunning) {
      const delay = Math.max(1, this.targetFrameTime - Math.floor(overallFrameTime));
      this.renderTimeout = setTimeout(() => this.loop(), delay);
    }
    this.rendering = false
    if (this.immediateRerenderRequested) {
      this.immediateRerenderRequested = false
      this.loop()
    }
  }

  public intermediateRender(): void {
    this.immediateRerenderRequested = true
    this.loop()
  }

  private async renderNative(): Promise<void> {
    if (this.renderingNative) {
      console.error("Rendering called concurrently")
      throw new Error("Rendering called concurrently")
    }

    // Handle inline mode
    if (!this._useAlternateScreen) {
      // Calculate actual content height
      const calculatedHeight = this.root.calculateLayout();
      const renderHeight = Math.ceil(calculatedHeight) || 1;

      // Update native renderer height for inline mode
      if (renderHeight !== this.linesRendered) {
        // Update the native renderer's buffer size
        // this.lib.resizeRenderer(this.rendererPtr, this.width, renderHeight)
        // this.nextRenderBuffer = this.lib.getNextBuffer(this.rendererPtr)
        // this.currentRenderBuffer = this.lib.getCurrentBuffer(this.rendererPtr)
        // Set lines_rendered in the Rust renderer
        this.lib.setLinesRendered(this.rendererPtr, renderHeight);
        this.linesRendered = renderHeight;
        nextTick(() => this.needsUpdate());
      }
    }
    this.renderingNative = true;
    this.lib.render(this.rendererPtr, false);
    this.renderingNative = false;
  }

  private collectStatSample(frameTime: number): void {
    this.frameTimes.push(frameTime)
    if (this.frameTimes.length > this.maxStatSamples) {
      this.frameTimes.shift()
    }
  }

  public getStats(): {
    fps: number
    frameCount: number
    frameTimes: number[]
    averageFrameTime: number
    minFrameTime: number
    maxFrameTime: number
  } {
    const frameTimes = [...this.frameTimes]
    const sum = frameTimes.reduce((acc, time) => acc + time, 0)
    const avg = frameTimes.length ? sum / frameTimes.length : 0
    const min = frameTimes.length ? Math.min(...frameTimes) : 0
    const max = frameTimes.length ? Math.max(...frameTimes) : 0

    return {
      fps: this.renderStats.fps,
      frameCount: this.renderStats.frameCount,
      frameTimes,
      averageFrameTime: avg,
      minFrameTime: min,
      maxFrameTime: max,
    }
  }

  public resetStats(): void {
    this.frameTimes = []
    this.renderStats.frameCount = 0
  }

  public setGatherStats(enabled: boolean): void {
    this.gatherStats = enabled
    if (!enabled) {
      this.frameTimes = []
    }
  }

  public getSelection(): Selection | null {
    return this.currentSelection
  }

  public getSelectionContainer(): Component | null {
    return this.selectionContainers.length > 0 ? this.selectionContainers[this.selectionContainers.length - 1] : null
  }

  public hasSelection(): boolean {
    return this.currentSelection !== null
  }

  public clearSelection(): void {
    if (this.selectionState) {
      this.selectionState = null
      this.notifySelectablesOfSelectionChange()
    }
    this.currentSelection = null
    this.selectionContainers = []
  }

  private startSelection(startRenderable: Component, x: number, y: number): void {
    this.clearSelection()
    this.selectionContainers.push(startRenderable.parent || this.root)

    this.selectionState = {
      anchor: { x, y },
      focus: { x, y },
      isActive: true,
      isSelecting: true,
    }

    this.currentSelection = new Selection({ x, y }, { x, y })
    this.notifySelectablesOfSelectionChange()
  }

  private updateSelection(currentRenderable: Component | undefined, x: number, y: number): void {
    if (this.selectionState) {
      this.selectionState.focus = { x, y }

      if (this.selectionContainers.length > 0) {
        const currentContainer = this.selectionContainers[this.selectionContainers.length - 1]

        if (!currentRenderable || !this.isWithinContainer(currentRenderable, currentContainer)) {
          const parentContainer = currentContainer.parent || this.root
          this.selectionContainers.push(parentContainer)
        } else if (currentRenderable && this.selectionContainers.length > 1) {
          let containerIndex = this.selectionContainers.indexOf(currentRenderable)

          if (containerIndex === -1) {
            const immediateParent = currentRenderable.parent || this.root
            containerIndex = this.selectionContainers.indexOf(immediateParent)
          }

          if (containerIndex !== -1 && containerIndex < this.selectionContainers.length - 1) {
            this.selectionContainers = this.selectionContainers.slice(0, containerIndex + 1)
          }
        }
      }

      if (this.currentSelection) {
        this.currentSelection = new Selection(this.selectionState.anchor, this.selectionState.focus)
      }

      this.notifySelectablesOfSelectionChange()
    }
  }

  private isWithinContainer(component: Component, container: Component): boolean {
    let current: Component | null = component;
    while (current) {
      if (current === container) return true
      current = current.parent
    }
    return false
  }

  private finishSelection(): void {
    if (this.selectionState) {
      this.selectionState.isSelecting = false
      this.emit("selection", this.currentSelection)
    }
  }

  private notifySelectablesOfSelectionChange(): void {
    let normalizedSelection: SelectionState | null = null
    if (this.selectionState) {
      normalizedSelection = { ...this.selectionState }

      if (
        normalizedSelection.anchor.y > normalizedSelection.focus.y ||
        (normalizedSelection.anchor.y === normalizedSelection.focus.y &&
          normalizedSelection.anchor.x > normalizedSelection.focus.x)
      ) {
        const temp = normalizedSelection.anchor
        normalizedSelection.anchor = normalizedSelection.focus
        normalizedSelection.focus = {
          x: temp.x + 1,
          y: temp.y,
        }
      }
    }

    const selectedRenderables: Component[] = []

    for (const [, component] of Component.componentsByNumber) {
      if (component.visible && component.selectable) {
        const currentContainer =
          this.selectionContainers.length > 0 ? this.selectionContainers[this.selectionContainers.length - 1] : null
        let hasSelection = false
        if (!currentContainer || this.isWithinContainer(component, currentContainer)) {
          hasSelection = component.onSelectionChanged(normalizedSelection)
        } else {
          hasSelection = component.onSelectionChanged(
            normalizedSelection ? { ...normalizedSelection, isActive: false } : null,
          )
        }

        if (hasSelection) {
          selectedRenderables.push(component)
        }
      }
    }

    if (this.currentSelection) {
      this.currentSelection.updateSelectedRenderables(selectedRenderables)
    }
  }
}
