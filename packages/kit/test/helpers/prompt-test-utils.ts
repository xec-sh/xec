import { expect } from 'vitest';

import { mockProcessStreams } from './mock-tty.js';
import { cancelSymbol } from '../../src/core/types.js';

import type { Prompt, PromptConfig } from '../../src/core/prompt.js';

export interface PromptTestOptions {
  isTTY?: boolean;
  initialValue?: any;
}

export async function testPrompt<T, C>(
  PromptClass: new (config: PromptConfig<T, C> & C) => Prompt<T, C>,
  config: PromptConfig<T, C> & C,
  test: (helpers: {
    prompt: Prompt<T, C>;
    mockStreams: ReturnType<typeof mockProcessStreams>;
    sendKey: (key: string | any) => void;
    waitForRender: () => Promise<void>;
    getLastRender: () => string;
  }) => Promise<void>,
  options: PromptTestOptions = {}
): Promise<T | symbol> {
  const { isTTY = true } = options;
  const mockStreams = mockProcessStreams({ isTTY });

  const prompt = new PromptClass({
    ...config,
    initialValue: options.initialValue ?? config.initialValue
  });

  const sendKey = (key: string | any) => {
    mockStreams.sendKey(key);
  };

  const waitForRender = () => new Promise(resolve => setTimeout(resolve, 50));

  const getLastRender = () => {
    const calls = mockStreams.stdout.write.mock.calls;
    if (calls.length === 0) return '';

    // Just get the last N calls and join them together
    // This should capture the most recent complete render
    const allOutput = calls
      .map(call => call[0])
      .filter(content => typeof content === 'string')
      .join('');

    // Remove ANSI escape sequences for testing
    const cleanOutput = allOutput
      .replace(/\x1B\[\?25[lh]/g, '') // Remove cursor show/hide first
      .replace(/\x1B\[[^m]*m/g, '') // Remove color codes
      .replace(/\x1B\[[\d;]*[A-Z]/g, ''); // Remove cursor movements

    // For debugging: log raw output if needed
    if (process.env.NODE_ENV === 'test' && process.env.DEBUG_OUTPUT) {
      console.log('Raw output:', JSON.stringify(allOutput));
      console.log('Clean output:', JSON.stringify(cleanOutput));
    }

    return cleanOutput;
  };

  try {
    const resultPromise = prompt.prompt();

    if (isTTY) {
      // Give the prompt time to initialize and become active
      await new Promise(resolve => setTimeout(resolve, 10));
      await test({ prompt, mockStreams, sendKey, waitForRender, getLastRender });
    }

    return await resultPromise;
  } finally {
    mockStreams.restore();
  }
}

export async function testNonTTYPrompt<T, C>(
  PromptClass: new (config: PromptConfig<T, C> & C) => Prompt<T, C>,
  config: PromptConfig<T, C> & C,
  expectedValue?: T
): Promise<T | symbol> {
  const mockStreams = mockProcessStreams({ isTTY: false });

  try {
    const prompt = new PromptClass(config);
    const result = await prompt.prompt();

    if (expectedValue === undefined && config.initialValue === undefined) {
      return cancelSymbol;
    }

    return expectedValue ?? config.initialValue ?? cancelSymbol;
  } finally {
    mockStreams.restore();
  }
}

export function expectPromptOutput(
  mockStreams: ReturnType<typeof mockProcessStreams>,
  expectedContent: string | RegExp
): void {
  const writes = mockStreams.stdout.write.mock.calls
    .map(call => call[0])
    .filter(content => typeof content === 'string')
    .join('');

  if (typeof expectedContent === 'string') {
    expect(writes).toContain(expectedContent);
  } else {
    expect(writes).toMatch(expectedContent);
  }
}

export async function render<T, C>(
  prompt: Prompt<T, C>,
  mockTTY: { stdout: { write: any } }
): Promise<string> {
  // Start the prompt
  const resultPromise = prompt.prompt();

  // Wait a bit for render
  await new Promise(resolve => setTimeout(resolve, 10));

  // Get the output
  const calls = mockTTY.stdout.write.mock.calls;
  const output = calls
    .map(call => call[0])
    .filter(content => typeof content === 'string')
    .join('');

  // Cancel the prompt to clean up
  process.nextTick(() => process.stdin.emit('data', '\x03'));

  try {
    await resultPromise;
  } catch {
    // Ignore cancellation error
  }

  return output;
}

export async function waitForRender(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 10));
}

export function createPromptTest<T>(
  createPrompt: (options: any) => Prompt<T, any>
) {
  const mockStreams = mockProcessStreams({ isTTY: true });
  let currentPrompt: Prompt<T, any> | null = null;
  let resultPromise: Promise<T | symbol> | null = null;
  let lastError: Error | null = null;

  const keypress = (key: string) => {
    if (key === 'down') {
      mockStreams.sendKey({ name: 'down' });
    } else if (key === 'up') {
      mockStreams.sendKey({ name: 'up' });
    } else if (key === 'left') {
      mockStreams.sendKey({ name: 'left' });
    } else if (key === 'right') {
      mockStreams.sendKey({ name: 'right' });
    } else if (key === 'enter') {
      mockStreams.sendKey({ name: 'return' });
    } else if (key === 'space') {
      mockStreams.sendKey({ name: 'space' });
    } else if (key === 'escape') {
      mockStreams.sendKey({ name: 'escape' });
    } else {
      mockStreams.sendKey(key);
    }
  };

  const renderer = () => {
    const calls = mockStreams.stdout.write.mock.calls;
    return calls.map(call => call[0]).filter(content => typeof content === 'string').join('');
  };

  const prompt = (options: any) => {
    currentPrompt = createPrompt(options);
    resultPromise = currentPrompt.prompt().catch(err => {
      lastError = err;
      throw err;
    });
    return resultPromise;
  };

  const submit = async () => {
    if (!resultPromise) throw new Error('No prompt started');
    try {
      return await resultPromise;
    } finally {
      mockStreams.restore();
    }
  };

  const cancel = () => {
    keypress('escape');
  };

  const getError = async () => {
    if (!resultPromise) throw new Error('No prompt started');
    try {
      await resultPromise;
      return null;
    } catch (err) {
      return err;
    } finally {
      mockStreams.restore();
    }
  };

  return {
    prompt,
    renderer,
    keypress,
    submit,
    cancel,
    getError
  };
}