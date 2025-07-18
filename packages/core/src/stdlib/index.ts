/**
 * Xec Standard Library v2.0
 * 
 * Environment-aware standard library providing minimalist, adaptive utilities
 * for infrastructure automation across different execution contexts.
 */

import { createOSInfo } from './os.js';
import { createTime } from './time.js';
import { createJSON } from './json.js';
import { createYAML } from './yaml.js';
// Import implementations
import { createFileSystem } from './fs.js';
import { createCrypto } from './crypto.js';
import { createHttpClient } from './http.js';
import { createProcess } from './process.js';
import { createPackage } from './package.js';
import { createService } from './service.js';
import { createNetwork } from './network.js';
import { createEnvironment } from './env.js';
import { createTemplateEngine } from './template.js';

import type { Logger } from '../utils/logger.js';
import type { ExtendedTaskContext } from '../types/task-types.js';
import type { 
  Time,
  YAML,
  OSInfo,
  Crypto,
  Process,
  Package,
  Service,
  Network,
  FileSystem,
  HttpClient,
  TaskContext,
  Environment,
  TemplateEngine,
  JSON as JSONUtil
} from '../types/environment-types.js';

export interface StandardLibrary {
  fs: FileSystem;
  http: HttpClient;
  os: OSInfo;
  proc: Process;
  pkg: Package;
  svc: Service;
  net: Network;
  crypto: Crypto;
  time: Time;
  json: JSONUtil;
  yaml: YAML;
  env: Environment;
  template: TemplateEngine;
}

/**
 * Create a complete standard library instance for a given context
 */
export async function createStandardLibrary(context: Partial<TaskContext>): Promise<StandardLibrary> {
  const { $, env, logger } = context;
  
  if (!$ || !env) {
    throw new Error('Standard library requires $ and env from TaskContext');
  }

  // Cast logger to correct type or use undefined
  const log = logger as Logger | undefined;

  // Create fs first as it's needed by template
  const fs = await createFileSystem($, env, log);

  const stdlib: StandardLibrary = {
    fs,
    http: await createHttpClient($, env, log),
    os: await createOSInfo($, env, log),
    proc: await createProcess($, env, log),
    pkg: await createPackage($, env, log),
    svc: await createService($, env, log),
    net: await createNetwork($, env, log),
    crypto: await createCrypto($, env, log),
    time: await createTime($, env, log),
    json: await createJSON($, env, log),
    yaml: await createYAML($, env, log),
    env: await createEnvironment($, env, log),
    template: await createTemplateEngine($, env, fs, log),
  };

  return stdlib;
}

/**
 * Enhance a TaskContext with standard library utilities
 */
export async function enhanceContext(context: TaskContext): Promise<ExtendedTaskContext> {
  const stdlib = await createStandardLibrary(context);
  
  // Rename env to env_vars to avoid conflict with context.env
  // Also exclude template to avoid conflict with context.template function
  const { env: env_vars, template: _, ...stdlibRest } = stdlib;
  
  return {
    ...context,
    ...stdlibRest,
    env_vars,
    // Keep the original template function from context, not the TemplateEngine
  };
}

/**
 * Create a partial standard library with only specified modules
 */
export async function createPartialStdlib(
  context: Partial<TaskContext>,
  modules: Array<keyof StandardLibrary>
): Promise<Partial<StandardLibrary>> {
  const stdlib: Partial<StandardLibrary> = {};
  const { $, env, logger } = context;
  
  if (!$ || !env) {
    throw new Error('Standard library requires $ and env from TaskContext');
  }

  // Cast logger to correct type or use undefined
  const log = logger as Logger | undefined;

  // Create fs first if needed by other modules
  let fs: FileSystem | undefined;
  if (modules.includes('fs') || modules.includes('template')) {
    fs = await createFileSystem($, env, log);
    if (modules.includes('fs')) {
      stdlib.fs = fs;
    }
  }

  for (const module of modules) {
    switch (module) {
      case 'fs':
        // Already handled above
        break;
      case 'http':
        stdlib.http = await createHttpClient($, env, log);
        break;
      case 'os':
        stdlib.os = await createOSInfo($, env, log);
        break;
      case 'proc':
        stdlib.proc = await createProcess($, env, log);
        break;
      case 'pkg':
        stdlib.pkg = await createPackage($, env, log);
        break;
      case 'svc':
        stdlib.svc = await createService($, env, log);
        break;
      case 'net':
        stdlib.net = await createNetwork($, env, log);
        break;
      case 'crypto':
        stdlib.crypto = await createCrypto($, env, log);
        break;
      case 'time':
        stdlib.time = await createTime($, env, log);
        break;
      case 'json':
        stdlib.json = await createJSON($, env, log);
        break;
      case 'yaml':
        stdlib.yaml = await createYAML($, env, log);
        break;
      case 'env':
        stdlib.env = await createEnvironment($, env, log);
        break;
      case 'template':
        if (!fs) {
          fs = await createFileSystem($, env, log);
        }
        stdlib.template = await createTemplateEngine($, env, fs, log);
        break;
    }
  }

  return stdlib;
}

// Re-export types for convenience
export * from '../types/environment-types.js';