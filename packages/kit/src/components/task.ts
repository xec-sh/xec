import { spinner } from './spinner.js';

import type { CommonOptions } from '../utilities/common.js';

export type Task = {
  /**
   * Task title
   */
  title: string;
  /**
   * Task function
   */
  task: (message: (string: string) => void) => string | Promise<string> | void | Promise<void>;

  /**
   * If enabled === false the task will be skipped
   */
  enabled?: boolean;
};

/**
 * Define a group of tasks to be executed
 */
export const tasks = async (list: Task[], opts?: CommonOptions) => {
  for (const task of list) {
    if (task.enabled === false) continue;

    const s = spinner(opts);
    s.start(task.title);
    const result = await task.task(s.message);
    s.stop(result || task.title);
  }
};
