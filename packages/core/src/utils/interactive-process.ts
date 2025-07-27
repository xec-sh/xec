import { spawn, SpawnOptions } from 'child_process';

export interface InteractiveOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
  timeout?: number;
  encoding?: BufferEncoding;
}

interface ExpectOptions {
  timeout?: number;
}

export interface InteractiveSessionAPI {
  send(data: string, addNewline?: boolean): Promise<void>;
  sendRaw(data: Buffer): void;
  expect(pattern: string | RegExp | (string | RegExp)[], options?: ExpectOptions): Promise<string>;
  waitForOutput(text: string): Promise<string>;
  close(force?: boolean): Promise<void>;
  onStderr(callback: (data: string) => void): void;
  onExit(callback: (code: number | null) => void): void;
  onError(callback: (error: Error) => void): void;
  onData(callback: (data: string) => void): void;
}

export function createInteractiveSession(command: string, options: InteractiveOptions = {}): InteractiveSessionAPI {
  const parts = command.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);
  
  if (!cmd) {
    throw new Error('Command cannot be empty');
  }
  
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: options.shell,
    stdio: ['pipe', 'pipe', 'pipe'] as const
  };
  
  const childProcess = spawn(cmd, args, spawnOptions);

  let outputBuffer = '';
  const stderrListeners: ((data: string) => void)[] = [];
  const exitListeners: ((code: number | null) => void)[] = [];
  const errorListeners: ((error: Error) => void)[] = [];
  const dataListeners: ((data: string) => void)[] = [];
  let expectResolvers: Array<{
    pattern: string | RegExp | (string | RegExp)[],
    resolve: (value: string) => void,
    reject: (error: Error) => void,
    timeout?: NodeJS.Timeout
  }> = [];

  // Handle stdout data
  childProcess.stdout?.on('data', (data: Buffer) => {
    const str = data.toString(options.encoding || 'utf8');
    outputBuffer += str;
    
    // Notify data listeners
    dataListeners.forEach(listener => listener(str));
    
    // Check expect patterns
    const toRemove: typeof expectResolvers = [];
    expectResolvers.forEach(resolver => {
      const patterns = Array.isArray(resolver.pattern) ? resolver.pattern : [resolver.pattern];
      
      for (const pattern of patterns) {
        const isMatch = typeof pattern === 'string' 
          ? outputBuffer.includes(pattern)
          : pattern.test(outputBuffer);
          
        if (isMatch) {
          if (resolver.timeout) clearTimeout(resolver.timeout);
          resolver.resolve(outputBuffer);
          outputBuffer = '';
          toRemove.push(resolver);
          break;
        }
      }
    });
    
    // Remove resolved expecters
    toRemove.forEach(r => {
      const index = expectResolvers.indexOf(r);
      if (index > -1) expectResolvers.splice(index, 1);
    });
  });

  // Handle stderr data
  childProcess.stderr?.on('data', (data: Buffer) => {
    const str = data.toString(options.encoding || 'utf8');
    stderrListeners.forEach(listener => listener(str));
    dataListeners.forEach(listener => listener(str));
  });

  // Handle process exit
  childProcess.on('exit', (code: number | null) => {
    exitListeners.forEach(listener => listener(code));
  });

  // Handle process error
  childProcess.on('error', (error: Error) => {
    errorListeners.forEach(listener => listener(error));
    
    // Reject all pending expects
    expectResolvers.forEach(resolver => {
      if (resolver.timeout) clearTimeout(resolver.timeout);
      resolver.reject(error);
    });
    expectResolvers = [];
  });

  const session: InteractiveSessionAPI = {
    async send(data: string, addNewline = true): Promise<void> {
      return new Promise((resolve, reject) => {
        const toSend = addNewline ? data + '\n' : data;
        childProcess.stdin?.write(toSend, (error: Error | null | undefined) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },

    sendRaw(data: Buffer): void {
      childProcess.stdin?.write(data);
    },

    async expect(pattern: string | RegExp | (string | RegExp)[], opts: ExpectOptions = {}): Promise<string> {
      const timeout = opts.timeout ?? options.timeout ?? 5000;
      
      return new Promise((resolve, reject) => {
        const resolver = { pattern, resolve, reject } as typeof expectResolvers[0];
        
        // Set timeout
        resolver.timeout = setTimeout(() => {
          const index = expectResolvers.indexOf(resolver);
          if (index > -1) expectResolvers.splice(index, 1);
          reject(new Error(`Timeout waiting for pattern: ${pattern}`));
        }, timeout);
        
        expectResolvers.push(resolver);
        
        // Check if pattern already matches
        const patterns = Array.isArray(pattern) ? pattern : [pattern];
        for (const p of patterns) {
          const isMatch = typeof p === 'string' 
            ? outputBuffer.includes(p)
            : p.test(outputBuffer);
            
          if (isMatch) {
            clearTimeout(resolver.timeout);
            const result = outputBuffer;
            outputBuffer = '';
            resolve(result);
            return;
          }
        }
      });
    },

    async waitForOutput(text: string): Promise<string> {
      return this.expect(text);
    },

    async close(force = false): Promise<void> {
      childProcess.kill(force ? 'SIGKILL' : 'SIGTERM');
      
      // Clean up listeners
      childProcess.removeAllListeners();
      if (childProcess.stdout) childProcess.stdout.removeAllListeners();
      if (childProcess.stderr) childProcess.stderr.removeAllListeners();
      if (childProcess.stdin) childProcess.stdin.removeAllListeners();
    },

    onStderr(callback: (data: string) => void): void {
      stderrListeners.push(callback);
    },

    onExit(callback: (code: number | null) => void): void {
      exitListeners.push(callback);
    },

    onError(callback: (error: Error) => void): void {
      errorListeners.push(callback);
    },

    onData(callback: (data: string) => void): void {
      dataListeners.push(callback);
    }
  };

  return session;
}