import * as readline from 'readline';

import { Choice, InteractivePrompt } from './types.js';

export class CLIPrompt implements InteractivePrompt {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    const answer = await this.question(`${message} (${defaultStr}): `);

    if (!answer) {
      return defaultValue;
    }

    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    const defaultStr = defaultValue ? ` (${defaultValue})` : '';
    const answer = await this.question(`${message}${defaultStr}: `);

    return answer || defaultValue || '';
  }

  async password(message: string): Promise<string> {
    // Hide input for password
    const oldWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = function (string: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error | null) => void), cb?: (err?: Error | null) => void): boolean {
      if (typeof string === 'string' && string === message + ': ') {
        if (typeof encoding === 'function') {
          return oldWrite(string, undefined, encoding);
        }
        return oldWrite(string, encoding, cb);
      }
      return true;
    } as any;

    const answer = await this.question(`${message}: `);

    process.stdout.write = oldWrite;
    process.stdout.write('\n');

    return answer;
  }

  async select<T>(message: string, choices: Choice<T>[]): Promise<T> {
    console.log(message);

    const enabledChoices = choices.filter(c => !c.disabled);

    // Display choices
    enabledChoices.forEach((choice, index) => {
      const hint = choice.hint ? ` - ${choice.hint}` : '';
      console.log(`  ${index + 1}) ${choice.name}${hint}`);
    });

    while (true) {
      const answer = await this.question('Select an option: ');
      const index = parseInt(answer, 10) - 1;

      if (index >= 0 && index < enabledChoices.length) {
        const choice = enabledChoices[index];
        if (choice) {
          return choice.value;
        }
      }

      console.log('Invalid selection. Please try again.');
    }
  }

  async multiselect<T>(message: string, choices: Choice<T>[]): Promise<T[]> {
    console.log(message);
    console.log('(Use space-separated numbers to select multiple options)');

    const enabledChoices = choices.filter(c => !c.disabled);

    // Display choices
    enabledChoices.forEach((choice, index) => {
      const hint = choice.hint ? ` - ${choice.hint}` : '';
      console.log(`  ${index + 1}) ${choice.name}${hint}`);
    });

    while (true) {
      const answer = await this.question('Select options: ');
      const indices = answer.split(/\s+/).map(s => parseInt(s, 10) - 1);

      if (indices.every(i => i >= 0 && i < enabledChoices.length)) {
        return indices
          .map(i => enabledChoices[i])
          .filter((choice): choice is Choice<T> => choice !== undefined)
          .map(choice => choice.value);
      }

      console.log('Invalid selection. Please try again.');
    }
  }

  close(): void {
    this.rl.close();
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }
}

export const prompt = new CLIPrompt();