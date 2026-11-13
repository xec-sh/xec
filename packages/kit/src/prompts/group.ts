import { isCancel, CANCEL_SYMBOL } from '../core/index.js';

type Prettify<T> = {
  [P in keyof T]: T[P];
} & {};

export type PromptGroupAwaitedReturn<T> = {
  [P in keyof T]: Exclude<Awaited<T[P]>, typeof CANCEL_SYMBOL>;
};

export interface PromptGroupOptions<T> {
  /**
   * Control how the group can be canceled
   * if one of the prompts is canceled.
   */
  onCancel?: (opts: {
    results: Prettify<Partial<PromptGroupAwaitedReturn<T>>>;
    reason: typeof CANCEL_SYMBOL;
  }) => void | Promise<void>;
}

export type PromptGroup<T> = {
  [P in keyof T]: (opts: {
    results: Prettify<Partial<PromptGroupAwaitedReturn<Omit<T, P>>>>;
  }) => undefined | Promise<T[P] | undefined>;
};

/**
 * Define a group of prompts to be displayed
 * and return a results of objects within the group
 */
export const group = async <T>(
  prompts: PromptGroup<T>,
  opts?: PromptGroupOptions<T>
): Promise<Prettify<PromptGroupAwaitedReturn<T>> | typeof CANCEL_SYMBOL> => {
  const results: Record<string, unknown> = {};
  const promptNames = Object.keys(prompts);

  for (const name of promptNames) {
    const prompt = prompts[name as keyof T];
    const result = await prompt({ results } as Parameters<typeof prompt>[0]);

    if (isCancel(result)) {
      await opts?.onCancel?.({ results, reason: CANCEL_SYMBOL } as Parameters<
        NonNullable<typeof opts.onCancel>
      >[0]);
      return CANCEL_SYMBOL;
    }

    results[name] = result;
  }

  return results as Prettify<PromptGroupAwaitedReturn<T>>;
};
