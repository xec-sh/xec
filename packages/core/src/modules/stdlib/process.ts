import { z } from 'zod';
import * as os from 'os';
import { promisify } from 'util';
import { exec, spawn } from 'child_process';

import { Module, ModuleMetadata, TaskDefinition } from '../types.js';
import { Task, TaskResult, TaskContext } from '../../tasks/types.js';

const execAsync = promisify(exec);

export const ProcessTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('exec'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    timeout: z.number().optional(),
    shell: z.boolean().optional().default(true),
  }),
  z.object({
    type: z.literal('spawn'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    detached: z.boolean().optional(),
    stdio: z.enum(['pipe', 'ignore', 'inherit']).optional().default('pipe'),
  }),
  z.object({
    type: z.literal('kill'),
    pid: z.number(),
    signal: z.string().optional().default('SIGTERM'),
  }),
  z.object({
    type: z.literal('kill_tree'),
    pid: z.number(),
    signal: z.string().optional().default('SIGTERM'),
  }),
  z.object({
    type: z.literal('wait_for_exit'),
    pid: z.number(),
    timeout: z.number().optional().default(30000),
  }),
  z.object({
    type: z.literal('list_processes'),
    filter: z.object({
      name: z.string().optional(),
      pid: z.number().optional(),
      ppid: z.number().optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal('system_info'),
  }),
]);

export type ProcessTask = z.infer<typeof ProcessTaskSchema>;

export const metadata: ModuleMetadata = {
  name: 'process',
  version: '1.0.0',
  description: 'Process management and system utilities',
  author: 'Xec Team',
  tags: ['process', 'system', 'exec', 'spawn'],
  dependencies: {},
};

async function killProcessTree(pid: number, signal: string = 'SIGTERM'): Promise<void> {
  try {
    // Get all child processes using ps command
    const { stdout } = await execAsync(`ps -o pid,ppid -ax`);
    const lines = stdout.split('\n').slice(1);

    const processes = new Map<number, number[]>();

    // Build parent-child relationship map
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const childPid = parseInt(parts[0]);
        const parentPid = parseInt(parts[1]);

        if (!processes.has(parentPid)) {
          processes.set(parentPid, []);
        }
        processes.get(parentPid)!.push(childPid);
      }
    });

    // Get all descendant PIDs
    const getAllDescendants = (parentPid: number): number[] => {
      const descendants: number[] = [];
      const children = processes.get(parentPid) || [];

      children.forEach(childPid => {
        descendants.push(childPid);
        descendants.push(...getAllDescendants(childPid));
      });

      return descendants;
    };

    const allPids = [pid, ...getAllDescendants(pid)];

    // Kill all processes
    allPids.forEach(targetPid => {
      try {
        process.kill(targetPid, signal as any);
      } catch (e) {
        // Process might already be dead
      }
    });
  } catch (error) {
    // If we can't get the process tree, just kill the main process
    try {
      process.kill(pid, signal as any);
    } catch (e) {
      // Process might already be dead
    }
  }
}

async function waitForProcessExit(pid: number, timeout: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      process.kill(pid, 0);
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch {
      return true;
    }
  }

  return false;
}

async function listProcesses(filter?: { name?: string; pid?: number; ppid?: number }): Promise<any[]> {
  const { stdout } = await execAsync('ps aux');
  const lines = stdout.split('\n').slice(1);

  const processes = lines.map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) return null;

    return {
      user: parts[0],
      pid: parseInt(parts[1]),
      cpu: parseFloat(parts[2]),
      mem: parseFloat(parts[3]),
      vsz: parseInt(parts[4]),
      rss: parseInt(parts[5]),
      tty: parts[6],
      stat: parts[7],
      start: parts[8],
      time: parts[9],
      command: parts.slice(10).join(' '),
    };
  }).filter(p => p !== null);

  if (!filter) return processes;

  return processes.filter(p => {
    if (filter.pid && p!.pid !== filter.pid) return false;
    if (filter.name && !p!.command.includes(filter.name)) return false;
    return true;
  });
}

const tasks: Record<string, TaskDefinition> = {
  exec: {
    name: 'exec',
    description: 'Execute a command',
    parameters: z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      timeout: z.number().optional(),
      shell: z.boolean().optional().default(true),
    }),
    handler: async (params: any) => {
      try {
        const options: any = {
          cwd: params.cwd,
          env: { ...process.env, ...params.env },
          timeout: params.timeout,
          shell: params.shell,
        };

        const command = params.args
          ? `${params.command} ${params.args.join(' ')}`
          : params.command;

        const { stdout, stderr } = await execAsync(command, options);

        return {
          success: true,
          changed: true,
          output: stdout || stderr,
          data: { stdout, stderr },
        };
      } catch (error: any) {
        return {
          success: false,
          changed: false,
          error: error as Error,
          output: error.message,
          data: {
            stdout: error.stdout,
            stderr: error.stderr,
            code: error.code,
          },
        };
      }
    },
  },

  spawn: {
    name: 'spawn',
    description: 'Spawn a new process',
    parameters: z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      detached: z.boolean().optional(),
      stdio: z.enum(['pipe', 'ignore', 'inherit']).optional().default('pipe'),
    }),
    handler: async (params: any) => new Promise((resolve) => {
      const child = spawn(params.command, params.args || [], {
        cwd: params.cwd,
        env: { ...process.env, ...params.env },
        detached: params.detached,
        stdio: params.stdio as any,
      });

      let stdout = '';
      let stderr = '';

      if (params.stdio === 'pipe') {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('exit', (code, signal) => {
        resolve({
          success: code === 0,
          changed: true,
          output: stdout || stderr,
          data: {
            pid: child.pid,
            exitCode: code,
            signal,
            stdout,
            stderr,
          },
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          changed: false,
          error: error as Error,
        });
      });

      if (params.detached) {
        child.unref();
        resolve({
          success: true,
          changed: true,
          output: `Process spawned with PID ${child.pid}`,
          data: { pid: child.pid },
        });
      }
    }),
  },

  kill: {
    name: 'kill',
    description: 'Kill a process',
    parameters: z.object({
      pid: z.number(),
      signal: z.string().optional().default('SIGTERM'),
    }),
    handler: async (params: any) => {
      try {
        process.kill(params.pid, params.signal as any);
        return {
          success: true,
          changed: true,
          output: `Process ${params.pid} killed with signal ${params.signal}`,
        };
      } catch (error: any) {
        return {
          success: false,
          changed: false,
          error: error as Error,
          output: `Failed to kill process ${params.pid}: ${error.message}`,
        };
      }
    },
  },

  kill_tree: {
    name: 'kill_tree',
    description: 'Kill a process tree',
    parameters: z.object({
      pid: z.number(),
      signal: z.string().optional().default('SIGTERM'),
    }),
    handler: async (params: any) => {
      try {
        await killProcessTree(params.pid, params.signal);
        return {
          success: true,
          changed: true,
          output: `Process tree ${params.pid} killed with signal ${params.signal}`,
        };
      } catch (error) {
        return {
          success: false,
          changed: false,
          error: error as Error,
        };
      }
    },
  },

  wait_for_exit: {
    name: 'wait_for_exit',
    description: 'Wait for a process to exit',
    parameters: z.object({
      pid: z.number(),
      timeout: z.number().optional().default(30000),
    }),
    handler: async (params: any) => {
      const exited = await waitForProcessExit(params.pid, params.timeout);
      return {
        success: exited,
        changed: false,
        output: exited
          ? `Process ${params.pid} exited`
          : `Timeout waiting for process ${params.pid} to exit`,
      };
    },
  },

  list_processes: {
    name: 'list_processes',
    description: 'List running processes',
    parameters: z.object({
      filter: z.object({
        name: z.string().optional(),
        pid: z.number().optional(),
        ppid: z.number().optional(),
      }).optional(),
    }),
    handler: async (params: any) => {
      try {
        const processes = await listProcesses(params.filter);
        return {
          success: true,
          changed: false,
          output: `Found ${processes.length} processes`,
          data: processes,
        };
      } catch (error) {
        return {
          success: false,
          changed: false,
          error: error as Error,
        };
      }
    },
  },

  system_info: {
    name: 'system_info',
    description: 'Get system information',
    parameters: z.object({}),
    handler: async (params: any) => {
      const info = {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        type: os.type(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        networkInterfaces: os.networkInterfaces(),
      };

      return {
        success: true,
        changed: false,
        output: 'System information retrieved',
        data: info,
      };
    },
  },
};

async function execute(task: Task, context: TaskContext): Promise<TaskResult> {
  const taskType = task.definition.type;
  const taskDef = tasks[taskType];

  if (!taskDef) {
    return {
      success: false,
      changed: false,
      error: new Error(`Unknown task type: ${taskType}`),
    };
  }

  try {
    const result = await taskDef.handler(task.definition);
    return result;
  } catch (error) {
    return {
      success: false,
      changed: false,
      error: error as Error,
    };
  }
}

function validate(definition: any): { success: boolean; errors?: string[] } {
  try {
    ProcessTaskSchema.parse(definition);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      errors: error instanceof Error ? [error.message] : ['Validation failed']
    };
  }
}

export const processModule: Module & { validate: typeof validate; execute: typeof execute } = {
  metadata,
  tasks,
  validate,
  execute,
};