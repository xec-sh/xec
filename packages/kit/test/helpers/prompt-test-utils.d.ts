import { mockProcessStreams } from './mock-tty.js';
import type { Prompt, PromptConfig } from '../../src/core/prompt.js';
export interface PromptTestOptions {
    isTTY?: boolean;
    initialValue?: any;
}
export declare function testPrompt<T, C>(PromptClass: new (config: PromptConfig<T, C> & C) => Prompt<T, C>, config: PromptConfig<T, C> & C, test: (helpers: {
    prompt: Prompt<T, C>;
    mockStreams: ReturnType<typeof mockProcessStreams>;
    sendKey: (key: string | any) => void;
    waitForRender: () => Promise<void>;
    getLastRender: () => string;
}) => Promise<void>, options?: PromptTestOptions): Promise<T | symbol>;
export declare function testNonTTYPrompt<T, C>(PromptClass: new (config: PromptConfig<T, C> & C) => Prompt<T, C>, config: PromptConfig<T, C> & C, expectedValue?: T): Promise<T | symbol>;
export declare function expectPromptOutput(mockStreams: ReturnType<typeof mockProcessStreams>, expectedContent: string | RegExp): void;
export declare function render<T, C>(prompt: Prompt<T, C>, mockTTY: {
    stdout: {
        write: any;
    };
}): Promise<string>;
export declare function waitForRender(): Promise<void>;
export declare function createPromptTest<T>(createPrompt: (options: any) => Prompt<T, any>): {
    prompt: (options: any) => Promise<symbol | T>;
    renderer: () => any;
    keypress: (key: string) => void;
    submit: () => Promise<symbol | T>;
    cancel: () => void;
    getError: () => Promise<any>;
};
