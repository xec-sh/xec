// Type definitions for runtime-specific globals

declare global {
  // Bun runtime types
  var Bun: {
    version: string;
    spawn: (options: {
      cmd: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: any;
      stdout?: any;
      stderr?: any;
    }) => {
      stdin: WritableStream;
      stdout?: ReadableStream;
      stderr?: ReadableStream;
      exited: Promise<number>;
      kill: (signal?: number) => void;
    };
    spawnSync: (options: {
      cmd: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: any;
      stdout?: any;
      stderr?: any;
    }) => {
      stdout?: Uint8Array;
      stderr?: Uint8Array;
      exitCode: number;
      success: boolean;
    };
    serve?: Function;
    SQLite?: Function;
  } | undefined;

  // Deno runtime types
  var Deno: {
    version: {
      deno: string;
      v8: string;
      typescript: string;
    };
    run: (options: {
      cmd: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: 'piped' | 'inherit' | 'null';
      stdout?: 'piped' | 'inherit' | 'null';
      stderr?: 'piped' | 'inherit' | 'null';
    }) => {
      status: () => Promise<{ success: boolean; code: number }>;
      stdin?: WritableStream;
      stdout?: ReadableStream;
      stderr?: ReadableStream;
      close: () => void;
    };
  } | undefined;
}

export { }