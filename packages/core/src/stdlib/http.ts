import type { CallableExecutionEngine } from '@xec-js/ush';

import type { Logger } from '../utils/logger.js';
import type {
  Response,
  HttpClient,
  RetryOptions,
  RequestOptions,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createHttpClient(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<HttpClient> {

  // Helper to build curl command with options
  const buildCurlCommand = (url: string, options: RequestOptions = {}) => {
    const args: string[] = ['-s']; // Silent mode

    // Headers
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        args.push('-H', `"${key}: ${value}"`);
      }
    }

    // Timeout
    if (options.timeout) {
      args.push('--max-time', Math.ceil(options.timeout / 1000).toString());
    }

    // Include headers in output
    args.push('-i');

    return args.join(' ');
  };

  // Parse response from curl output
  const parseResponse = (output: string): Response => {
    const parts = output.split('\r\n\r\n');
    const headerSection = parts[0] || '';
    const body = parts.slice(1).join('\r\n\r\n');

    // Parse status line
    const statusMatch = headerSection.match(/HTTP\/\d\.?\d?\s+(\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1] || '0') : 0;

    // Parse headers
    const headers: Record<string, string> = {};
    const headerLines = headerSection.split('\r\n').slice(1);
    for (const line of headerLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key.toLowerCase()] = value;
      }
    }

    return {
      status,
      headers,
      body,
      json<T = any>(): T {
        try {
          return JSON.parse(body);
        } catch (error) {
          throw new Error(`Failed to parse JSON response: ${error}`);
        }
      },
    };
  };

  // Execute request with retries
  const executeWithRetries = async (
    command: string,
    options: RequestOptions = {}
  ): Promise<Response> => {
    const retryOptions: RetryOptions = typeof options.retry === 'number'
      ? { attempts: options.retry }
      : options.retry || { attempts: 0 };

    let lastError: any;
    const maxAttempts = retryOptions.attempts + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await $`${command}`;
        const response = parseResponse(result.stdout);

        // Check if we should retry based on status code
        if (response.status >= 500 && attempt < maxAttempts - 1) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response;
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts - 1) {
          // Calculate delay
          const delay = retryOptions.backoff
            ? Math.pow(2, attempt) * (retryOptions.delay || 1000)
            : retryOptions.delay || 1000;

          log?.debug(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };

  const http: HttpClient = {
    async get(url: string, options?: RequestOptions): Promise<Response> {
      const curlArgs = buildCurlCommand(url, options);
      const command = `curl ${curlArgs} "${url}"`;
      return executeWithRetries(command, options);
    },

    async post(url: string, body?: any, options?: RequestOptions): Promise<Response> {
      const curlArgs = buildCurlCommand(url, options);
      let dataArg = '';

      if (body !== undefined) {
        if (options?.json || (options?.headers?.['content-type'] || '').includes('application/json')) {
          dataArg = `-d '${JSON.stringify(body)}'`;
          if (!options?.headers?.['content-type']) {
            curlArgs.concat(' -H "Content-Type: application/json"');
          }
        } else if (typeof body === 'string') {
          dataArg = `-d '${body}'`;
        } else {
          dataArg = `-d '${JSON.stringify(body)}'`;
        }
      }

      const command = `curl -X POST ${curlArgs} ${dataArg} "${url}"`;
      return executeWithRetries(command, options);
    },

    async put(url: string, body?: any, options?: RequestOptions): Promise<Response> {
      const curlArgs = buildCurlCommand(url, options);
      let dataArg = '';

      if (body !== undefined) {
        if (options?.json || (options?.headers?.['content-type'] || '').includes('application/json')) {
          dataArg = `-d '${JSON.stringify(body)}'`;
          if (!options?.headers?.['content-type']) {
            curlArgs.concat(' -H "Content-Type: application/json"');
          }
        } else if (typeof body === 'string') {
          dataArg = `-d '${body}'`;
        } else {
          dataArg = `-d '${JSON.stringify(body)}'`;
        }
      }

      const command = `curl -X PUT ${curlArgs} ${dataArg} "${url}"`;
      return executeWithRetries(command, options);
    },

    async delete(url: string, options?: RequestOptions): Promise<Response> {
      const curlArgs = buildCurlCommand(url, options);
      const command = `curl -X DELETE ${curlArgs} "${url}"`;
      return executeWithRetries(command, options);
    },

    async request(options: RequestOptions & { url: string; method?: string }): Promise<Response> {
      const { url, method = 'GET', ...requestOptions } = options;
      const curlArgs = buildCurlCommand(url, requestOptions);

      let command = `curl -X ${method} ${curlArgs}`;

      // Add body if present
      if ('body' in options && options.body !== undefined) {
        if (requestOptions.json || (requestOptions.headers?.['content-type'] || '').includes('application/json')) {
          command += ` -d '${JSON.stringify(options.body)}'`;
        } else if (typeof options.body === 'string') {
          command += ` -d '${options.body}'`;
        }
      }

      command += ` "${url}"`;
      return executeWithRetries(command, requestOptions);
    },

    async download(url: string, dest: string): Promise<void> {
      try {
        // Use different download methods based on environment
        if (env.platform.os === 'darwin' || await commandExists('curl', $)) {
          await $`curl -L -o ${dest} "${url}"`;
        } else if (await commandExists('wget', $)) {
          await $`wget -O ${dest} "${url}"`;
        } else {
          throw new Error('No suitable download tool found (curl or wget)');
        }
      } catch (error) {
        throw new Error(`Failed to download ${url} to ${dest}: ${error}`);
      }
    },

    async upload(url: string, file: string): Promise<Response> {
      try {
        const curlArgs = '-s -i';
        const command = `curl ${curlArgs} -F "file=@${file}" "${url}"`;
        const result = await $`${command}`;
        return parseResponse(result.stdout);
      } catch (error) {
        throw new Error(`Failed to upload ${file} to ${url}: ${error}`);
      }
    },
  };

  return http;
}

// Helper to check if a command exists
async function commandExists(command: string, $: CallableExecutionEngine): Promise<boolean> {
  try {
    await $`which ${command}`;
    return true;
  } catch {
    return false;
  }
}