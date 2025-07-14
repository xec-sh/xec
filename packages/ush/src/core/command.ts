import type { Readable, Writable } from 'node:stream';

export type StreamOption = 'pipe' | 'ignore' | 'inherit' | Writable;
export type AdapterType = 'local' | 'ssh' | 'docker' | 'auto';

export interface SSHAdapterOptions {
  type: 'ssh';
  host: string;
  username: string;
  port?: number;
  privateKey?: string | Buffer;
  passphrase?: string;
  password?: string;
}

export interface DockerAdapterOptions {
  type: 'docker';
  container: string;
  user?: string;
  workdir?: string;
}

export interface LocalAdapterOptions {
  type: 'local';
}

export type AdapterSpecificOptions = 
  | SSHAdapterOptions
  | DockerAdapterOptions
  | LocalAdapterOptions;

export interface Command {
  // Основное
  command: string;                      // Команда для выполнения
  args?: string[];                      // Аргументы команды
  
  // Контекст выполнения
  cwd?: string;                         // Рабочая директория
  env?: Record<string, string>;         // Переменные окружения
  timeout?: number;                     // Таймаут выполнения
  timeoutSignal?: string;               // Сигнал для отправки при таймауте
  
  // Управление потоками
  stdin?: string | Buffer | Readable;   // Входные данные
  stdout?: StreamOption;
  stderr?: StreamOption;
  
  // Опции выполнения
  shell?: string | boolean;             // Использовать shell
  detached?: boolean;                   // Отсоединенный процесс
  signal?: AbortSignal;                 // Сигнал отмены
  
  // Специфичные для адаптеров
  adapter?: AdapterType;
  adapterOptions?: AdapterSpecificOptions;
}