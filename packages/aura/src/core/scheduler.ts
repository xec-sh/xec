/**
 * Scheduler - Manages render scheduling and batching
 * 
 * Optimizes rendering by batching multiple updates into single frames
 */

type Task = () => void;

interface SchedulerState {
  queue: Task[];
  isScheduled: boolean;
  isProcessing: boolean;
}

const state: SchedulerState = {
  queue: [],
  isScheduled: false,
  isProcessing: false
};

/**
 * Schedule a task to be executed in the next frame
 */
export function schedule(task: Task): void {
  state.queue.push(task);
  
  if (!state.isScheduled && !state.isProcessing) {
    state.isScheduled = true;
    scheduleFlush();
  }
}

/**
 * Schedule a flush of the task queue
 */
function scheduleFlush(): void {
  // Use setImmediate if available, otherwise setTimeout
  if (typeof setImmediate !== 'undefined') {
    setImmediate(flush);
  } else {
    setTimeout(flush, 0);
  }
}

/**
 * Flush all pending tasks
 */
function flush(): void {
  state.isScheduled = false;
  state.isProcessing = true;
  
  // Process all tasks in the queue
  const tasks = state.queue.slice();
  state.queue = [];
  
  for (const task of tasks) {
    try {
      task();
    } catch (error) {
      console.error('[Scheduler] Error executing task:', error);
    }
  }
  
  state.isProcessing = false;
  
  // If new tasks were added during processing, schedule another flush
  if (state.queue.length > 0) {
    state.isScheduled = true;
    scheduleFlush();
  }
}

/**
 * Execute a task immediately, bypassing the scheduler
 */
export function immediate(task: Task): void {
  task();
}

/**
 * Clear all pending tasks
 */
export function clear(): void {
  state.queue = [];
  state.isScheduled = false;
}