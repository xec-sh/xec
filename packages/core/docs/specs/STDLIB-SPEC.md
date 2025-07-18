# Xec Standard Library Specification v2.0

## Overview

The Xec Standard Library (stdlib) provides a minimalist, environment-aware collection of utilities for common infrastructure automation tasks. It automatically adapts to different execution environments while maintaining a consistent, intuitive API.

## Design Principles

1. **Minimal API Surface** - Simple, predictable functions
2. **Environment Adaptation** - Automatic optimization for each environment
3. **Progressive Enhancement** - Basic functionality everywhere, optimizations where possible
4. **Zero Configuration** - Works out of the box
5. **Type Safety** - Full TypeScript support

## Core Library Structure

```typescript
// Available via context in all tasks
interface StandardLibrary {
  fs: FileSystem;       // File operations
  http: HttpClient;     // HTTP requests
  os: OSInfo;          // System information
  proc: Process;       // Process management
  pkg: Package;        // Package management
  svc: Service;        // Service management
  net: Network;        // Network utilities
  crypto: Crypto;      // Cryptographic operations
  time: Time;          // Time/date utilities
  json: JSON;          // JSON utilities
  yaml: YAML;          // YAML utilities
  env: Environment;    // Environment variables
}
```

## Module Reference

### 1. File System (fs)

Universal file operations that work across all environments.

```typescript
interface FileSystem {
  // Basic operations
  read(path: string): Promise<string>;
  write(path: string, content: string | Buffer): Promise<void>;
  append(path: string, content: string | Buffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
  
  // Directory operations
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  ls(path: string): Promise<string[]>;
  
  // Advanced operations
  copy(source: string, dest: string): Promise<void>;
  move(source: string, dest: string): Promise<void>;
  chmod(path: string, mode: string | number): Promise<void>;
  chown(path: string, uid: number, gid: number): Promise<void>;
  
  // Stats
  stat(path: string): Promise<FileStat>;
  isFile(path: string): Promise<boolean>;
  isDir(path: string): Promise<boolean>;
  
  // Temporary files
  temp(options?: { prefix?: string; suffix?: string }): Promise<string>;
  
  // Path utilities
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  extname(path: string): string;
}
```

**Environment Adaptations:**
- **Local/SSH**: Direct file system operations
- **Docker**: Operations within container context
- **Kubernetes**: Pod filesystem with volume awareness
- **Cloud**: Object storage abstractions where applicable

### 2. HTTP Client (http)

Simple HTTP client with automatic retries and environment optimizations.

```typescript
interface HttpClient {
  // Basic methods
  get(url: string, options?: RequestOptions): Promise<Response>;
  post(url: string, body?: any, options?: RequestOptions): Promise<Response>;
  put(url: string, body?: any, options?: RequestOptions): Promise<Response>;
  delete(url: string, options?: RequestOptions): Promise<Response>;
  
  // Generic request
  request(options: RequestOptions): Promise<Response>;
  
  // Utilities
  download(url: string, dest: string): Promise<void>;
  upload(url: string, file: string): Promise<Response>;
}

interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  retry?: number | RetryOptions;
  json?: boolean;  // Auto JSON parse/stringify
}

interface Response {
  status: number;
  headers: Record<string, string>;
  body: string;
  json<T = any>(): T;
}
```

**Environment Adaptations:**
- **Local**: Uses native HTTP libraries
- **SSH**: Executes curl/wget remotely
- **Docker/K8s**: Container-aware networking
- **Cloud**: Uses cloud provider SDKs when available

### 3. Operating System (os)

System information and operations.

```typescript
interface OSInfo {
  // System info
  platform(): 'linux' | 'darwin' | 'windows';
  arch(): 'x64' | 'arm64' | 'arm';
  hostname(): Promise<string>;
  release(): Promise<string>;
  
  // Resources
  cpus(): Promise<CPUInfo[]>;
  memory(): Promise<MemoryInfo>;
  disk(): Promise<DiskInfo[]>;
  
  // Users
  user(): Promise<string>;
  home(): Promise<string>;
}
```

### 4. Process Management (proc)

Process execution and management.

```typescript
interface Process {
  // Execution
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  spawn(command: string, args?: string[], options?: SpawnOptions): ChildProcess;
  
  // Process management
  list(): Promise<ProcessInfo[]>;
  kill(pid: number, signal?: string): Promise<void>;
  exists(pid: number): Promise<boolean>;
  
  // Current process
  cwd(): string;
  exit(code?: number): never;
}

interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string | boolean;
}
```

### 5. Package Management (pkg)

Universal package manager interface.

```typescript
interface Package {
  // Package operations
  install(...packages: string[]): Promise<void>;
  remove(...packages: string[]): Promise<void>;
  update(): Promise<void>;
  upgrade(...packages: string[]): Promise<void>;
  
  // Query
  installed(name: string): Promise<boolean>;
  version(name: string): Promise<string | null>;
  search(query: string): Promise<PackageInfo[]>;
  
  // System detection
  manager(): 'apt' | 'yum' | 'dnf' | 'brew' | 'apk' | 'pacman';
}
```

**Environment Adaptations:**
- Automatically detects package manager
- In containers, may layer packages or rebuild images

### 6. Service Management (svc)

System service control.

```typescript
interface Service {
  // Service control
  start(name: string): Promise<void>;
  stop(name: string): Promise<void>;
  restart(name: string): Promise<void>;
  reload(name: string): Promise<void>;
  
  // Service state
  status(name: string): Promise<ServiceStatus>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  
  // Query
  list(): Promise<ServiceInfo[]>;
  exists(name: string): Promise<boolean>;
}

interface ServiceStatus {
  active: boolean;
  running: boolean;
  enabled: boolean;
  since?: Date;
}
```

**Environment Adaptations:**
- **Linux**: systemd, init.d, upstart
- **macOS**: launchd
- **Docker**: Container lifecycle
- **Kubernetes**: Deployment management

### 7. Network Utilities (net)

Network operations and diagnostics.

```typescript
interface Network {
  // Connectivity
  ping(host: string, options?: PingOptions): Promise<PingResult>;
  traceroute(host: string): Promise<TracerouteResult>;
  
  // Ports
  isPortOpen(host: string, port: number): Promise<boolean>;
  waitForPort(host: string, port: number, timeout?: number): Promise<void>;
  
  // DNS
  resolve(hostname: string): Promise<string[]>;
  reverse(ip: string): Promise<string[]>;
  
  // Interfaces
  interfaces(): Promise<NetworkInterface[]>;
  publicIP(): Promise<string>;
  privateIP(): Promise<string>;
}
```

### 8. Cryptography (crypto)

Basic cryptographic operations.

```typescript
interface Crypto {
  // Hashing
  hash(algorithm: HashAlgorithm, data: string | Buffer): Promise<string>;
  md5(data: string | Buffer): Promise<string>;
  sha256(data: string | Buffer): Promise<string>;
  sha512(data: string | Buffer): Promise<string>;
  
  // Random
  randomBytes(size: number): Promise<Buffer>;
  uuid(): string;
  
  // Encoding
  base64Encode(data: string | Buffer): string;
  base64Decode(encoded: string): Buffer;
}

type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';
```

### 9. Time Utilities (time)

Date/time operations.

```typescript
interface Time {
  // Current time
  now(): Date;
  timestamp(): number;
  
  // Formatting
  format(date: Date, format: string): string;
  parse(dateString: string, format?: string): Date;
  
  // Operations
  add(date: Date, duration: Duration): Date;
  subtract(date: Date, duration: Duration): Date;
  diff(from: Date, to: Date): Duration;
  
  // Utilities
  sleep(ms: number): Promise<void>;
  timeout<T>(promise: Promise<T>, ms: number): Promise<T>;
}

interface Duration {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}
```

### 10. JSON Utilities (json)

Enhanced JSON operations.

```typescript
interface JSON {
  // Parse/stringify with better errors
  parse<T = any>(text: string): T;
  stringify(value: any, space?: number): string;
  
  // File operations
  read<T = any>(path: string): Promise<T>;
  write(path: string, data: any, space?: number): Promise<void>;
  
  // Utilities
  merge(...objects: any[]): any;
  get(object: any, path: string, defaultValue?: any): any;
  set(object: any, path: string, value: any): void;
}
```

### 11. YAML Utilities (yaml)

YAML parsing and generation.

```typescript
interface YAML {
  // Parse/stringify
  parse<T = any>(text: string): T;
  stringify(value: any): string;
  
  // File operations
  read<T = any>(path: string): Promise<T>;
  write(path: string, data: any): Promise<void>;
  
  // Multi-document support
  parseAll<T = any>(text: string): T[];
  stringifyAll(values: any[]): string;
}
```

### 12. Environment Variables (env)

Environment variable management.

```typescript
interface Environment {
  // Get/set
  get(key: string, defaultValue?: string): string | undefined;
  set(key: string, value: string): void;
  
  // Bulk operations
  all(): Record<string, string>;
  load(file?: string): Promise<void>;  // Load from .env file
  
  // Utilities
  expand(template: string): string;  // Expand ${VAR} in strings
  require(key: string): string;      // Throws if not set
}
```

## Usage Examples

### 1. Basic File Operations

```typescript
// In any task
async run({ fs, log }) {
  // Read file
  const content = await fs.read('/etc/config.yaml');
  
  // Write file
  await fs.write('/tmp/output.txt', 'Hello World');
  
  // Create directory
  await fs.mkdir('/var/app/data', { recursive: true });
  
  // Check existence
  if (await fs.exists('/tmp/lockfile')) {
    log.warn('Lock file exists');
  }
}
```

### 2. HTTP Requests

```typescript
async run({ http, json }) {
  // Simple GET
  const response = await http.get('https://api.example.com/data');
  const data = response.json();
  
  // POST with automatic JSON
  const result = await http.post('https://api.example.com/users', {
    name: 'John Doe',
    email: 'john@example.com'
  }, { json: true });
  
  // Download file
  await http.download('https://example.com/file.tar.gz', '/tmp/file.tar.gz');
}
```

### 3. Package Management

```typescript
async run({ pkg, os }) {
  // Install packages (auto-detects package manager)
  await pkg.install('nginx', 'postgresql');
  
  // Check if installed
  if (!await pkg.installed('git')) {
    await pkg.install('git');
  }
  
  // Platform-specific
  if (os.platform() === 'darwin') {
    await pkg.install('wget');  // Uses brew
  }
}
```

### 4. Service Management

```typescript
async run({ svc, time }) {
  // Start service
  await svc.start('nginx');
  
  // Wait for service to be ready
  await time.sleep(2000);
  
  // Check status
  const status = await svc.status('nginx');
  if (!status.running) {
    throw new Error('Nginx failed to start');
  }
  
  // Enable on boot
  await svc.enable('nginx');
}
```

### 5. Network Operations

```typescript
async run({ net, log }) {
  // Wait for service to be available
  await net.waitForPort('localhost', 3000, 30000);
  
  // Check connectivity
  const result = await net.ping('google.com');
  log.info(`Ping latency: ${result.avg}ms`);
  
  // Get IP addresses
  const publicIP = await net.publicIP();
  const privateIP = await net.privateIP();
}
```

## Environment-Specific Behavior

The stdlib automatically adapts to different environments:

### Local Environment
- Direct file system access
- Native command execution
- Full system permissions (based on user)

### SSH Environment
- Remote file operations via SFTP
- Commands executed on remote host
- Respects remote user permissions

### Docker Environment
- Operations within container context
- Volume-aware file operations
- Container networking

### Kubernetes Environment
- Pod-scoped operations
- PVC-aware file operations
- Service discovery integration

### Cloud Environments
- Provider-specific optimizations
- Native SDK usage where available
- Cloud storage abstractions

## Extension Mechanism

Add custom utilities to stdlib:

```typescript
// Extend stdlib with custom utilities
xec.stdlib.extend('redis', {
  async connect(options) {
    // Redis connection logic
  },
  
  async get(key: string) {
    // Redis get operation
  },
  
  async set(key: string, value: any) {
    // Redis set operation
  }
});

// Use in tasks
async run({ redis }) {
  await redis.set('key', 'value');
  const value = await redis.get('key');
}
```

## Best Practices

### 1. Error Handling

```typescript
async run({ fs, log }) {
  try {
    const config = await fs.read('/etc/app.conf');
  } catch (error) {
    if (error.code === 'ENOENT') {
      log.warn('Config file not found, using defaults');
      // Use defaults
    } else {
      throw error;
    }
  }
}
```

### 2. Environment Detection

```typescript
async run({ os, pkg }) {
  // Adapt behavior based on platform
  const platform = os.platform();
  
  if (platform === 'linux') {
    // Linux-specific logic
    const distro = await os.release();
    if (distro.includes('Ubuntu')) {
      await pkg.install('ubuntu-specific-package');
    }
  }
}
```

### 3. Idempotent Operations

```typescript
async run({ fs, svc }) {
  // Check before modifying
  if (!await fs.exists('/etc/app.conf')) {
    await fs.write('/etc/app.conf', defaultConfig);
  }
  
  // Service operations are idempotent by default
  await svc.start('app');  // No-op if already running
}
```

## Type Definitions

All stdlib functions are fully typed:

```typescript
import { StandardLibrary } from '@xec/core';

// Full IntelliSense support
const task = {
  async run(ctx: { fs: StandardLibrary['fs'] }) {
    const content = await ctx.fs.read('file.txt');
    // TypeScript knows content is string
  }
};
```