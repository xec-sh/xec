/**
 * Environment-related types for Xec
 * This file contains environment-specific type definitions
 */

import type { CallableExecutionEngine } from '@xec/ush';

import type { Module } from './module-types.js';
import type { TaskContext } from './task-types.js';
import type { 
  Logger, 
  OSPlatform,
  Architecture,
  EnvironmentType
} from './base-types.js';

export type { Module } from './module-types.js';
export type { TaskContext } from './task-types.js';
// Re-export types that are used in this context
export type { OSPlatform, Architecture, EnvironmentType } from './base-types.js';

// Alias for backward compatibility
export type XecModule = Module;

export interface EnvironmentInfo {
  type: EnvironmentType;
  
  // Connection details (when applicable)
  connection?: {
    host?: string;
    user?: string;
    container?: string;
    pod?: string;
    namespace?: string;
    context?: string;
    [key: string]: string | undefined;
  };
  
  // Available capabilities
  capabilities: {
    shell: boolean;
    sudo: boolean;
    docker: boolean;
    systemd: boolean;
    [key: string]: boolean;
  };
  
  // Platform details
  platform: {
    os: OSPlatform;
    arch: Architecture;
    distro?: string;  // For Linux
    version?: string;
  };
}

// Environment-aware Task Context (extends base TaskContext with environment-specific fields)
export interface EnvironmentTaskContext extends Omit<TaskContext, 'template'> {
  // Universal command execution
  $: CallableExecutionEngine;
  
  // Environment info
  env: EnvironmentInfo;
  
  // Logger - alias for logger from base TaskContext
  log: Logger;
  
  // Standard utilities (from stdlib)
  fs: FileSystem;
  http: HttpClient;
  template: TemplateEngine;
  
  // Task parameters
  params: Record<string, any>;
  
  // Additional stdlib utilities
  os?: OSInfo;
  proc?: Process;
  pkg?: Package;
  svc?: Service;
  net?: Network;
  crypto?: Crypto;
  time?: Time;
  json?: JSON;
  yaml?: YAML;
  env_vars?: Environment;
}

// Environment-aware Task Handler
export type EnvironmentTaskHandler = (context: EnvironmentTaskContext) => Promise<any>;

// Helper function type using environment context
export type HelperFunction = (context: Partial<EnvironmentTaskContext>) => any | Promise<any>;

// Module Lifecycle Hooks use partial context since not all fields may be available during setup/teardown
export type SetupHook = (context: Partial<EnvironmentTaskContext>) => Promise<void>;
export type TeardownHook = (context: Partial<EnvironmentTaskContext>) => Promise<void>;

// Standard Library Interfaces (minimal definitions)
export interface FileSystem {
  read(path: string): Promise<string>;
  write(path: string, content: string | Buffer): Promise<void>;
  append(path: string, content: string | Buffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  ls(path: string): Promise<string[]>;
  copy(source: string, dest: string): Promise<void>;
  move(source: string, dest: string): Promise<void>;
  chmod(path: string, mode: string | number): Promise<void>;
  chown(path: string, uid: number, gid: number): Promise<void>;
  stat(path: string): Promise<FileStat>;
  isFile(path: string): Promise<boolean>;
  isDir(path: string): Promise<boolean>;
  temp(options?: { prefix?: string; suffix?: string }): Promise<string>;
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  extname(path: string): string;
}

export interface FileStat {
  size: number;
  mode: number;
  uid: number;
  gid: number;
  mtime: Date;
  atime: Date;
  ctime: Date;
  isFile(): boolean;
  isDirectory(): boolean;
}

export interface HttpClient {
  get(url: string, options?: RequestOptions): Promise<Response>;
  post(url: string, body?: any, options?: RequestOptions): Promise<Response>;
  put(url: string, body?: any, options?: RequestOptions): Promise<Response>;
  delete(url: string, options?: RequestOptions): Promise<Response>;
  request(options: RequestOptions): Promise<Response>;
  download(url: string, dest: string): Promise<void>;
  upload(url: string, file: string): Promise<Response>;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  retry?: number | RetryOptions;
  json?: boolean;
}

export interface RetryOptions {
  attempts: number;
  delay?: number;
  backoff?: boolean;
}

export interface Response {
  status: number;
  headers: Record<string, string>;
  body: string;
  json<T = any>(): T;
}

export interface TemplateEngine {
  render(template: string, data: any): Promise<string>;
  renderFile(path: string, data: any): Promise<string>;
}

export interface OSInfo {
  platform(): OSPlatform;
  arch(): Architecture;
  hostname(): Promise<string>;
  release(): Promise<string>;
  cpus(): Promise<CPUInfo[]>;
  memory(): Promise<MemoryInfo>;
  disk(): Promise<DiskInfo[]>;
  user(): Promise<string>;
  home(): Promise<string>;
  uptime(): Promise<number>;
  loadavg(): Promise<[number, number, number]>;
  networkInterfaces(): Promise<OSNetworkInterface[]>;
}

export interface OSNetworkInterface {
  name: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  mac: string;
  internal: boolean;
}

export interface CPUInfo {
  model: string;
  speed: number;
  cores: number;
}

export interface MemoryInfo {
  total: number;
  free: number;
  used: number;
}

export interface DiskInfo {
  mount: string;
  total: number;
  free: number;
  used: number;
}

export interface Process {
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  spawn(command: string, args?: string[], options?: SpawnOptions): ChildProcess | Promise<number>;
  list(name?: string): Promise<ProcessInfo[]>;
  kill(pidOrName: number | string, signal?: string): Promise<void>;
  exists(pid: number): Promise<boolean>;
  wait(pid: number, options?: { timeout?: number; checkInterval?: number }): Promise<void>;
  signal(pid: number, signal: string): Promise<void>;
  getPidByPort(port: number): Promise<number | null>;
  tree(pid: number): Promise<number[]>;
  cwd(): string;
  exit(code?: number): never;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string | boolean;
  ignoreError?: boolean;
}

export interface SpawnOptions extends ExecOptions {
  stdio?: 'inherit' | 'pipe' | 'ignore';
  detached?: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ChildProcess {
  pid: number;
  kill(signal?: string): void;
  wait(): Promise<number>;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export interface Package {
  install(...packages: string[]): Promise<void>;
  remove(...packages: string[]): Promise<void>;
  update(): Promise<void>;
  upgrade(...packages: string[]): Promise<void>;
  installed(name: string): Promise<boolean>;
  version(name: string): Promise<string | null>;
  search(query: string): Promise<PackageInfo[]>;
  manager(): 'apt' | 'yum' | 'dnf' | 'brew' | 'apk' | 'pacman';
}

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
}

export interface Service {
  start(name: string): Promise<void>;
  stop(name: string): Promise<void>;
  restart(name: string): Promise<void>;
  reload(name: string): Promise<void>;
  status(name: string): Promise<string>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  list(filter?: 'active' | 'inactive' | 'all'): Promise<string[]>;
  exists(name: string): Promise<boolean>;
  isActive(name: string): Promise<boolean>;
  isEnabled(name: string): Promise<boolean>;
  logs(name: string, options?: { lines?: number; follow?: boolean }): Promise<string>;
}

export interface ServiceStatus {
  active: boolean;
  running: boolean;
  enabled: boolean;
  since?: Date;
}

export interface ServiceInfo {
  name: string;
  status: ServiceStatus;
}

export interface Network {
  ping(host: string, options?: PingOptions): Promise<PingResult>;
  traceroute(host: string): Promise<TracerouteResult>;
  isPortOpen(host: string, port: number): Promise<boolean>;
  waitForPort(host: string, port: number, timeout?: number): Promise<void>;
  resolve(hostname: string): Promise<string[]>;
  reverse(ip: string): Promise<string[]>;
  interfaces(): Promise<NetworkInterface[]>;
  publicIP(): Promise<string>;
  privateIP(): Promise<string>;
}

export interface PingOptions {
  count?: number;
  timeout?: number;
}

export interface PingResult {
  host: string;
  packets_sent: number;
  packets_received: number;
  packet_loss: number;
  min: number;
  avg: number;
  max: number;
}

export interface TracerouteResult {
  host: string;
  hops: TracerouteHop[];
}

export interface TracerouteHop {
  hop: number;
  ip: string;
  rtt: number[];
}

export interface NetworkInterface {
  name: string;
  addresses: string[];
  mac?: string;
  up: boolean;
}

export interface Crypto {
  hash(algorithm: HashAlgorithm, data: string | Buffer): Promise<string>;
  md5(data: string | Buffer): Promise<string>;
  sha256(data: string | Buffer): Promise<string>;
  sha512(data: string | Buffer): Promise<string>;
  randomBytes(size: number): Promise<Buffer>;
  uuid(): string;
  base64Encode(data: string | Buffer): string;
  base64Decode(encoded: string): Buffer;
}

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

export interface Time {
  now(): Date;
  timestamp(): number;
  format(date: Date, format: string): string;
  parse(dateString: string, format?: string): Date;
  add(date: Date, duration: Duration): Date;
  subtract(date: Date, duration: Duration): Date;
  diff(from: Date, to: Date): Duration;
  sleep(ms: number): Promise<void>;
  timeout<T>(promise: Promise<T>, ms: number): Promise<T>;
}

export interface Duration {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

export interface JSON {
  parse<T = any>(text: string): T;
  stringify(value: any, space?: number): string;
  read<T = any>(path: string): Promise<T>;
  write(path: string, data: any, space?: number): Promise<void>;
  merge(...objects: any[]): any;
  get(object: any, path: string, defaultValue?: any): any;
  set(object: any, path: string, value: any): void;
}

export interface YAML {
  parse<T = any>(text: string): T;
  stringify(value: any): string;
  read<T = any>(path: string): Promise<T>;
  write(path: string, data: any): Promise<void>;
  parseAll<T = any>(text: string): T[];
  stringifyAll(values: any[]): string;
}

export interface Environment {
  get(key: string, defaultValue?: string): string | undefined;
  set(key: string, value: string): void;
  all(): Record<string, string>;
  load(file?: string): Promise<void>;
  expand(template: string): string;
  require(key: string): string;
}

// Environment Provider Interface
export interface EnvironmentProvider {
  name: EnvironmentType;
  
  // Environment detector
  detect(): Promise<EnvironmentInfo | null>;
  
  // Command executor adapter
  createExecutor(connection: any): CallableExecutionEngine;
  
  // Optional utilities
  utilities?: Record<string, any>;
}

// Module composition helpers
export interface ModuleCollection {
  [moduleName: string]: Module;
}