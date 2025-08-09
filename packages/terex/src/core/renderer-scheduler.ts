// ============================================================================
// Render Scheduler
// ============================================================================

/**
 * Schedules and batches render operations for optimal performance
 */
export class RenderScheduler {
  private renderTimer?: NodeJS.Timeout;
  private pendingRenders: Array<() => void> = [];
  private readonly targetFps: number;
  private readonly frameTime: number;
  private lastRenderTime = 0;

  constructor(targetFps = 60) {
    this.targetFps = targetFps;
    this.frameTime = 1000 / targetFps;
    this.lastRenderTime = Date.now(); // Initialize to current time
  }

  /**
   * Schedule a render operation
   */
  schedule(render: () => void): void {
    this.pendingRenders.push(render);

    if (!this.renderTimer) {
      const now = Date.now();
      const timeSinceLastRender = now - this.lastRenderTime;
      const delay = Math.max(0, this.frameTime - timeSinceLastRender);

      this.renderTimer = setTimeout(() => this.flush(), delay);
    }
  }

  /**
   * Execute all pending renders
   */
  private flush(): void {
    this.renderTimer = undefined;
    this.lastRenderTime = Date.now();

    const renders = this.pendingRenders;
    this.pendingRenders = [];

    // Execute all renders
    for (const render of renders) {
      try {
        render();
      } catch (error) {
        console.error('Render error:', error);
      }
    }
  }

  /**
   * Force immediate render
   */
  forceFlush(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
    this.flush();
  }

  /**
   * Cancel all pending renders
   */
  cancel(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
    this.pendingRenders = [];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a render scheduler
 */
export function createRenderScheduler(targetFps = 60): RenderScheduler {
  return new RenderScheduler(targetFps);
}