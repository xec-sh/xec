// Type definitions for runtime-specific globals and Node.js compatibility

declare global {
  // Browser globals (for future browser support)
  var window: Window | undefined;
  var navigator: Navigator | undefined;
  
  // Node.js types when not available
  namespace NodeJS {
    interface ReadStream {
      setRawMode?(mode: boolean): void;
      isTTY?: boolean;
    }
    
    interface WriteStream {
      isTTY?: boolean;
      columns?: number;
      rows?: number;
    }
  }

  // Bun runtime types
  var Bun: {
    version: string;
    stdout: any;
    stdin: any;
    stderr: any;
    isatty: (fd: number) => boolean;
  } | undefined;

  // Deno runtime types
  var Deno: {
    version: {
      deno: string;
      v8: string;
      typescript: string;
    };
    stdout: any;
    stdin: any;
    stderr: any;
    isatty: (rid: number) => boolean;
    consoleSize: () => { columns: number; rows: number };
  } | undefined;
}

export { }