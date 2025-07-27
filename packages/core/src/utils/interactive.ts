import { createInterface } from 'node:readline';
import { Readable, Writable } from 'node:stream';

import type { ExecutionEngine } from '../core/execution-engine.js';

export interface QuestionOptions {
  defaultValue?: string;
  choices?: string[];
  validate?: (input: string) => boolean | string;
  mask?: boolean;
  multiline?: boolean;
}

export interface PromptOptions {
  input?: Readable;
  output?: Writable;
  terminal?: boolean;
}

export class InteractiveSession {
  private rl: any;

  constructor(
    private engine: ExecutionEngine,
    private options: PromptOptions = {}
  ) {
    this.rl = createInterface({
      input: this.options.input || process.stdin,
      output: this.options.output || process.stdout,
      terminal: this.options.terminal ?? true
    });
  }

  async question(prompt: string, options: QuestionOptions = {}): Promise<string> {
    const {
      defaultValue,
      choices,
      validate,
      mask,
      multiline
    } = options;

    let displayPrompt = prompt;

    if (choices && choices.length > 0) {
      displayPrompt += '\n' + choices.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
      displayPrompt += '\nChoice: ';
    } else if (defaultValue) {
      displayPrompt += ` (${defaultValue}): `;
    } else {
      displayPrompt += ': ';
    }

    return new Promise((resolve, reject) => {
      const askQuestion = () => {
        this.rl.question(displayPrompt, async (answer: string) => {
          answer = answer.trim() || defaultValue || '';

          if (choices && choices.length > 0) {
            const choiceIndex = parseInt(answer) - 1;
            if (choiceIndex >= 0 && choiceIndex < choices.length) {
              const selectedChoice = choices[choiceIndex];
              if (selectedChoice !== undefined) {
                answer = selectedChoice;
              }
            } else if (!choices.includes(answer)) {
              console.log('Invalid choice. Please try again.');
              return askQuestion();
            }
          }

          if (validate) {
            const validationResult = validate(answer);
            if (validationResult !== true) {
              console.log(typeof validationResult === 'string' ? validationResult : 'Invalid input');
              return askQuestion();
            }
          }

          resolve(answer);
        });
      };

      askQuestion();
    });
  }

  async confirm(prompt: string, defaultValue = false): Promise<boolean> {
    const answer = await this.question(
      `${prompt} (${defaultValue ? 'Y/n' : 'y/N'})`,
      { defaultValue: defaultValue ? 'y' : 'n' }
    );

    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  async select(prompt: string, choices: string[]): Promise<string> {
    return this.question(prompt, { choices });
  }

  async multiselect(prompt: string, choices: string[]): Promise<string[]> {
    const displayPrompt = prompt + '\n' +
      choices.map((c, i) => `  ${i + 1}. ${c}`).join('\n') +
      '\nEnter numbers separated by commas: ';

    const answer = await this.question(displayPrompt);
    const indices = answer.split(',').map(s => parseInt(s.trim()) - 1);

    return indices
      .filter(i => i >= 0 && i < choices.length)
      .map(i => choices[i])
      .filter((choice): choice is string => choice !== undefined);
  }

  async password(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
      });

      (rl as any).stdoutMuted = true;
      rl.question(prompt + ': ', (password: string) => {
        rl.close();
        console.log();
        resolve(password);
      });

      (rl as any)._writeToOutput = function (char: string) {
        if (!(rl as any).stdoutMuted) {
          (rl as any).output.write(char);
        }
      };
    });
  }

  close(): void {
    this.rl.close();
  }
}

export async function question(
  engine: ExecutionEngine,
  prompt: string,
  options?: QuestionOptions
): Promise<string> {
  const session = new InteractiveSession(engine);
  try {
    return await session.question(prompt, options);
  } finally {
    session.close();
  }
}

export async function confirm(
  engine: ExecutionEngine,
  prompt: string,
  defaultValue?: boolean
): Promise<boolean> {
  const session = new InteractiveSession(engine);
  try {
    return await session.confirm(prompt, defaultValue);
  } finally {
    session.close();
  }
}

export async function select(
  engine: ExecutionEngine,
  prompt: string,
  choices: string[]
): Promise<string> {
  const session = new InteractiveSession(engine);
  try {
    return await session.select(prompt, choices);
  } finally {
    session.close();
  }
}

export async function password(
  engine: ExecutionEngine,
  prompt: string
): Promise<string> {
  const session = new InteractiveSession(engine);
  try {
    return await session.password(prompt);
  } finally {
    session.close();
  }
}

export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval: NodeJS.Timeout | null = null;
  private text = '';

  constructor(text?: string) {
    if (text) this.text = text;
  }

  start(text?: string): void {
    if (text) this.text = text;

    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.currentFrame]} ${this.text}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  update(text: string): void {
    this.text = text;
  }

  succeed(text?: string): void {
    this.stop();
    console.log(`\r✓ ${text || this.text}`);
  }

  fail(text?: string): void {
    this.stop();
    console.log(`\r✗ ${text || this.text}`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r' + ' '.repeat(this.text.length + 4) + '\r');
    }
  }
}

export async function withSpinner<T>(
  text: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const spinner = new Spinner(text);
  spinner.start();

  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

// Re-export interactive process functionality
export { 
  type InteractiveOptions,
  createInteractiveSession,
  type InteractiveSessionAPI
} from './interactive-process.js';

