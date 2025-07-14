import { CommandError } from './error.js';

export interface ExecutionResult {
  // Основные данные
  stdout: string;                       // Стандартный вывод
  stderr: string;                       // Вывод ошибок
  exitCode: number;                     // Код завершения
  signal?: string;                      // Сигнал завершения
  
  // Метаданные
  command: string;                      // Выполненная команда
  duration: number;                     // Время выполнения (мс)
  startedAt: Date;                      // Время начала
  finishedAt: Date;                     // Время завершения
  
  // Контекст
  adapter: string;                      // Использованный адаптер
  host?: string;                        // Хост (для SSH)
  container?: string;                   // Контейнер (для Docker)
  
  // Методы
  toString(): string;
  toJSON(): object;
  throwIfFailed(): void;
  isSuccess(): boolean;
}

export class ExecutionResultImpl implements ExecutionResult {
  constructor(
    public stdout: string,
    public stderr: string,
    public exitCode: number,
    public signal: string | undefined,
    public command: string,
    public duration: number,
    public startedAt: Date,
    public finishedAt: Date,
    public adapter: string,
    public host?: string,
    public container?: string
  ) {}

  toString(): string {
    return this.stdout.trim();
  }

  toJSON(): object {
    return {
      stdout: this.stdout,
      stderr: this.stderr,
      exitCode: this.exitCode,
      signal: this.signal,
      command: this.command,
      duration: this.duration,
      startedAt: this.startedAt.toISOString(),
      finishedAt: this.finishedAt.toISOString(),
      adapter: this.adapter,
      host: this.host,
      container: this.container
    };
  }

  throwIfFailed(): void {
    if (this.exitCode !== 0) {
      throw new CommandError(
        this.command,
        this.exitCode,
        this.signal,
        this.stdout,
        this.stderr,
        this.duration
      );
    }
  }

  isSuccess(): boolean {
    return this.exitCode === 0;
  }
}