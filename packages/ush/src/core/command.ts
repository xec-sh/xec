import type { Readable, Writable } from 'node:stream';

export type StreamOption = 'pipe' | 'ignore' | 'inherit' | Writable;
export type AdapterType = 'local' | 'ssh' | 'docker' | 'kubernetes' | 'remote-docker' | 'auto';

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
  tty?: boolean;
}

export interface LocalAdapterOptions {
  type: 'local';
}

export interface KubernetesAdapterOptions {
  type: 'kubernetes';
  pod: string;
  container?: string;
  namespace?: string;
  execFlags?: string[];
  tty?: boolean;
  stdin?: boolean;
}

export interface RemoteDockerAdapterOptions {
  type: 'remote-docker';
  ssh: Omit<SSHAdapterOptions, 'type'>;
  docker: Omit<DockerAdapterOptions, 'type'>;
}

export type AdapterSpecificOptions = 
  | SSHAdapterOptions
  | DockerAdapterOptions
  | LocalAdapterOptions
  | KubernetesAdapterOptions
  | RemoteDockerAdapterOptions;

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  isRetryable?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

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
  
  // Retry configuration
  retry?: RetryOptions;                 // Retry options
  
  // Progress reporting
  progress?: {
    enabled?: boolean;
    onProgress?: (event: any) => void;
    updateInterval?: number;
    reportLines?: boolean;
  };
  
  // Специфичные для адаптеров
  adapter?: AdapterType;
  adapterOptions?: AdapterSpecificOptions;
}