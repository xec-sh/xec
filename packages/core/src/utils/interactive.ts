import type { ExecutionEngine } from '../core/execution-engine.js';

import { createInterface } from 'node:readline';
import { Readable, Writable } from 'node:stream';

import { unrefTimer } from './unref-timer.js';

export interface QuestionOptions {
  defaultValue?: string;
  choices?: string[];
  validate?: (input: string) => boolean | string;
  /** Suppress echo while the answer is typed, for secrets. */
  mask?: boolean;
  /** Keep reading lines until a blank one; the answer is the lines joined. */
  multiline?: boolean;
}

/**
 * The readline internals used to suppress echo.
 *
 * `_writeToOutput` is not part of the public readline typings, but overriding
 * it is the only way to stop a typed secret from being echoed.
 */
interface MutableInterface {
  _writeToOutput?: (chunk: string) => void;
  output?: { write(chunk: string): void };
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
        this.ask(displayPrompt, mask === true, async (raw: string) => {
          let answer = raw.trim() || defaultValue || '';

          if (multiline) {
            answer = await this.readRemainingLines(answer, mask === true);
          }

          if (choices && choices.length > 0) {
            const choiceIndex = parseInt(answer) - 1;
            if (choiceIndex >= 0 && choiceIndex < choices.length) {
              const selectedChoice = choices[choiceIndex];
              if (selectedChoice !== undefined) {
                answer = selectedChoice;
              }
            } else if (!choices.includes(answer)) {
              console.log('Invalid choice. Please try again.');
              askQuestion();
              return;
            }
          }

          if (validate) {
            const validationResult = validate(answer);
            if (validationResult !== true) {
              console.log(typeof validationResult === 'string' ? validationResult : 'Invalid input');
              askQuestion();
              return;
            }
          }

          resolve(answer);
        });
      };

      askQuestion();
    });
  }

  /**
   * Ask one line, optionally without echoing what is typed.
   *
   * The prompt itself must still be visible, so echo is suppressed only after
   * readline has written it, and the original writer is always restored — a
   * session that stayed muted would swallow every later prompt.
   *
   * @param displayPrompt - Text shown before the cursor.
   * @param mask - Suppress echo of the typed answer.
   * @param onAnswer - Receives the raw line.
   */
  private ask(displayPrompt: string, mask: boolean, onAnswer: (answer: string) => void): void {
    if (!mask) {
      this.rl.question(displayPrompt, onAnswer);
      return;
    }

    const echo = this.suppressEcho();

    this.rl.question(displayPrompt, (answer: string) => {
      echo.stop();
      // The newline the user typed was swallowed with the rest of the echo.
      (this.rl as MutableInterface).output?.write('\n');
      onAnswer(answer);
    });

    // Started only now: readline writes the prompt from inside question(), and
    // the prompt is the one thing that must stay visible.
    echo.start();
  }

  /**
   * Install an echo suppressor on the session's readline interface.
   *
   * @returns Handles to begin suppressing and to restore the original writer.
   */
  private suppressEcho(): { start: () => void; stop: () => void } {
    const rl = this.rl as MutableInterface;
    const original = rl._writeToOutput?.bind(this.rl);
    let muted = false;

    rl._writeToOutput = (chunk: string): void => {
      if (!muted) {
        original?.(chunk);
      }
    };

    return {
      start: () => {
        muted = true;
      },
      stop: () => {
        muted = false;
        if (original) {
          rl._writeToOutput = original;
        } else {
          delete rl._writeToOutput;
        }
      },
    };
  }

  /**
   * Collect further lines until a blank one, starting from `first`.
   *
   * Listens for `line` rather than issuing another `question()` per line.
   * Piped input arrives as one chunk and readline emits every line from it
   * synchronously, so a re-issued question — which can only be registered a
   * microtask later — misses all but the next line and then waits forever.
   *
   * @param first - The line already read.
   * @param mask - Suppress echo of each additional line.
   * @returns Every non-empty line, joined by newlines.
   */
  private readRemainingLines(first: string, mask: boolean): Promise<string> {
    const lines = first ? [first] : [];
    const echo = mask ? this.suppressEcho() : null;

    echo?.start();

    return new Promise<string>(resolve => {
      const onLine = (line: string): void => {
        if (!line.trim()) {
          this.rl.off('line', onLine);
          echo?.stop();
          resolve(lines.join('\n'));
          return;
        }

        lines.push(line);
      };

      this.rl.on('line', onLine);
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
    // Shares the session's readline and its configured streams, so a session
    // built on a non-tty input still reads from where the caller asked. The
    // previous implementation opened a second interface on process.stdin and
    // relied on installing the echo override *after* rl.question() so the
    // prompt would still print — correct only by accident of ordering.
    return new Promise(resolve => {
      this.ask(`${prompt}: `, true, resolve);
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
    // Don't keep the process alive just for the spinner animation
    if (this.interval && typeof this.interval.unref === 'function') {
      unrefTimer(this.interval);
    }
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

