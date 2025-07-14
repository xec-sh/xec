/**
 * @xec/stdlib-system - System operations for Xec
 */

import * as os from 'os';
import * as path from 'path';

import { task } from '../../dsl/task.js';

import type { Task, Module, Helper } from '../../core/types.js';

// System Helpers
export const helpers: Record<string, Helper> = {
  // OS Information
  hostname: () => os.hostname(),
  platform: () => os.platform(),
  arch: () => os.arch(),
  release: () => os.release(),
  cpus: () => os.cpus(),
  totalmem: () => os.totalmem(),
  freemem: () => os.freemem(),
  uptime: () => os.uptime(),
  loadavg: () => os.loadavg(),

  // User information
  userInfo: () => os.userInfo(),
  homedir: () => os.homedir(),
  tmpdir: () => os.tmpdir(),

  // Path operations
  joinPath: (...parts: string[]) => path.join(...parts),
  resolvePath: (...parts: string[]) => path.resolve(...parts),
  dirname: (p: string) => path.dirname(p),
  basename: (p: string, ext?: string) => path.basename(p, ext),
  extname: (p: string) => path.extname(p),

  // Environment
  getEnv: (key: string, defaultValue?: string) => process.env[key] || defaultValue,
  setEnv: (key: string, value: string) => { process.env[key] = value; },
  envVars: () => ({ ...process.env }),

  // Process info
  pid: () => process.pid,
  ppid: () => process.ppid,
  cwd: () => process.cwd(),
  argv: () => process.argv,
  execPath: () => process.execPath,
  version: () => process.version,
  versions: () => process.versions,

  // Memory usage
  memoryUsage: () => process.memoryUsage(),
  cpuUsage: () => process.cpuUsage(),

  // System checks
  isWindows: () => os.platform() === 'win32',
  isLinux: () => os.platform() === 'linux',
  isMac: () => os.platform() === 'darwin',
  is64Bit: () => os.arch() === 'x64' || os.arch() === 'arm64'
};

// System Tasks
export const tasks: Record<string, Task> = {
  // System information
  sysInfo: task('sys-info')
    .description('Get system information')
    .handler(async () => ({
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime()
    }))
    .build(),

  // Check system requirements
  checkRequirements: task('check-requirements')
    .description('Check system requirements')
    .vars({
      minMemory: { type: 'number', default: 1024 * 1024 * 1024 }, // 1GB
      minCpus: { type: 'number', default: 1 },
      requiredPlatforms: { type: 'array', default: ['linux', 'darwin'] }
    })
    .handler(async (context) => {
      const { minMemory, minCpus, requiredPlatforms } = context.vars;
      const errors = [];

      if (os.totalmem() < minMemory) {
        errors.push(`Insufficient memory: ${os.totalmem()} < ${minMemory}`);
      }

      if (os.cpus().length < minCpus) {
        errors.push(`Insufficient CPUs: ${os.cpus().length} < ${minCpus}`);
      }

      if (!requiredPlatforms.includes(os.platform())) {
        errors.push(`Unsupported platform: ${os.platform()}`);
      }

      if (errors.length > 0) {
        throw new Error(`System requirements not met:\n${errors.join('\n')}`);
      }

      return {
        passed: true,
        system: {
          memory: os.totalmem(),
          cpus: os.cpus().length,
          platform: os.platform()
        }
      };
    })
    .build(),

  // Environment variable management
  setEnvVar: task('set-env-var')
    .description('Set environment variable')
    .vars({
      name: { required: true },
      value: { required: true }
    })
    .handler(async (context) => {
      const { name, value } = context.vars;
      process.env[name] = String(value);
      return { set: { [name]: value } };
    })
    .build(),

  getEnvVar: task('get-env-var')
    .description('Get environment variable')
    .vars({
      name: { required: true },
      default: { required: false }
    })
    .handler(async (context) => {
      const { name, default: defaultValue } = context.vars;
      const value = process.env[name] || defaultValue;
      return { [name]: value };
    })
    .build(),

  // Memory monitoring
  memoryUsage: task('memory-usage')
    .description('Get current memory usage')
    .handler(async () => {
      const usage = process.memoryUsage();
      const system = {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      };

      return {
        process: {
          rss: usage.rss,
          heapTotal: usage.heapTotal,
          heapUsed: usage.heapUsed,
          external: usage.external,
          arrayBuffers: usage.arrayBuffers
        },
        system,
        percentUsed: (system.used / system.total) * 100
      };
    })
    .build(),

  // Load average check
  checkLoad: task('check-load')
    .description('Check system load average')
    .vars({
      maxLoad1: { type: 'number', default: 0.8 },
      maxLoad5: { type: 'number', default: 0.7 },
      maxLoad15: { type: 'number', default: 0.6 }
    })
    .handler(async (context) => {
      const { maxLoad1, maxLoad5, maxLoad15 } = context.vars;
      const [load1, load5, load15] = os.loadavg();
      const cpuCount = os.cpus().length;

      // Normalize load average by CPU count
      const normalized = {
        load1: load1 / cpuCount,
        load5: load5 / cpuCount,
        load15: load15 / cpuCount
      };

      const warnings = [];
      if (normalized.load1 > maxLoad1) {
        warnings.push(`1-minute load average too high: ${normalized.load1.toFixed(2)} > ${maxLoad1}`);
      }
      if (normalized.load5 > maxLoad5) {
        warnings.push(`5-minute load average too high: ${normalized.load5.toFixed(2)} > ${maxLoad5}`);
      }
      if (normalized.load15 > maxLoad15) {
        warnings.push(`15-minute load average too high: ${normalized.load15.toFixed(2)} > ${maxLoad15}`);
      }

      return {
        loadAverage: { load1, load5, load15 },
        normalized,
        cpuCount,
        warnings,
        healthy: warnings.length === 0
      };
    })
    .build()
};

// System Module
export const systemModule: Module = {
  name: '@xec/stdlib-system',
  version: '1.0.0',
  description: 'System operations and monitoring for Xec',
  exports: {
    tasks,
    helpers,
    patterns: {},
    integrations: {}
  },
  dependencies: ['@xec/stdlib-core'],
  metadata: {
    category: 'stdlib',
    tags: ['system', 'os', 'monitoring'],
    author: 'Xec Team'
  }
};

export default systemModule;